#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Iterable


HEALTH_HINT_KEYS = {"healthSnapshotId", "serviceName", "state", "latencyMs", "uptimePercent"}
LOG_HINT_KEYS = {"status", "statusCode", "routeId", "path", "message", "latencyMs", "error"}
AVAILABLE_STATES = {"UP", "DEGRADED"}
FALLBACK_STATUS_CODES = {502, 503, 504}
HTTP_METHOD_RE = re.compile(r"\b(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b", re.IGNORECASE)
LATENCY_RE = re.compile(r"(?P<value>\d+(?:\.\d+)?)\s*ms\b", re.IGNORECASE)
UPTIME_RE = re.compile(r"(?P<value>\d+(?:\.\d+)?)\s*%")
STATUS_RE = re.compile(r"\bstatus(?:Code)?[=: ](?P<value>\d{3})\b", re.IGNORECASE)


@dataclass
class PeriodMetrics:
    request_total: int
    fallback_total: int
    avg_latency_ms: float | None
    success_rate: float | None
    availability_rate: float | None
    efficiency_index: float | None
    health_total: int
    health_available_total: int
    avg_health_latency_ms: float | None
    avg_health_uptime_pct: float | None
    service_breakdown: list[dict[str, Any]]


def load_bundle(input_path: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    health_records: list[dict[str, Any]] = []
    log_records: list[dict[str, Any]] = []

    if input_path.is_dir():
        files = [path for path in sorted(input_path.iterdir()) if path.is_file()]
    else:
        files = [input_path]

    for file_path in files:
        lower_name = file_path.name.lower()
        suffix = file_path.suffix.lower()

        if suffix in {".json", ".jsonl"}:
            entries = load_structured_records(file_path)
        elif suffix in {".log", ".txt"}:
            entries = load_text_records(file_path)
        else:
            continue

        if not entries:
            continue

        if looks_like_health_file(lower_name, entries):
            health_records.extend(entries)
        elif looks_like_log_file(lower_name, entries):
            log_records.extend(entries)
        else:
            if any(is_health_record(entry) for entry in entries):
                health_records.extend(entries)
            else:
                log_records.extend(entries)

    return health_records, log_records


def load_structured_records(file_path: Path) -> list[dict[str, Any]]:
    text = file_path.read_text(encoding="utf-8-sig").strip()
    if not text:
        return []

    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        records: list[dict[str, Any]] = []
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError:
                records.append({"_raw": line, "_source": str(file_path)})
            else:
                records.extend(normalize_json_item(item, str(file_path)))
        return records

    return normalize_json_item(payload, str(file_path))


def load_text_records(file_path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for line in file_path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line:
            continue
        records.append({"_raw": line, "_source": str(file_path)})
    return records


def normalize_json_item(item: Any, source: str) -> list[dict[str, Any]]:
    if isinstance(item, list):
        return [ensure_record(entry, source) for entry in item]

    if isinstance(item, dict):
        for key in ("data", "items", "results", "content"):
            value = item.get(key)
            if isinstance(value, list):
                return [ensure_record(entry, source) for entry in value]
            if isinstance(value, dict) and len(item) <= 3:
                return [ensure_record(value, source)]
        return [ensure_record(item, source)]

    return [{"_raw": str(item), "_source": source}]


def ensure_record(entry: Any, source: str) -> dict[str, Any]:
    if isinstance(entry, dict):
        record = dict(entry)
        record.setdefault("_source", source)
        return record
    return {"_raw": str(entry), "_source": source}


def looks_like_health_file(name: str, entries: list[dict[str, Any]]) -> bool:
    if "health" in name or "snapshot" in name:
        return True
    return any(is_health_record(entry) for entry in entries)


def looks_like_log_file(name: str, entries: list[dict[str, Any]]) -> bool:
    if any(token in name for token in ("gateway", "access", "request", "log")):
        return True
    return any(is_log_record(entry) for entry in entries)


def is_health_record(entry: dict[str, Any]) -> bool:
    keys = set(entry.keys())
    if {"healthSnapshotId", "state", "uptimePercent"}.intersection(keys):
        return True
    return "serviceName" in keys and "status" not in keys and "routeId" not in keys


def is_log_record(entry: dict[str, Any]) -> bool:
    return bool(LOG_HINT_KEYS.intersection(entry.keys())) or "_raw" in entry


def extract_str(entry: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = entry.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, (int, float)):
            return str(value)
    return None


def extract_float(entry: dict[str, Any], *keys: str) -> float | None:
    for key in keys:
        value = entry.get(key)
        number = coerce_float(value)
        if number is not None:
            return number
    raw = entry.get("_raw")
    if isinstance(raw, str):
        match = LATENCY_RE.search(raw)
        if match:
            return float(match.group("value"))
        match = UPTIME_RE.search(raw)
        if match:
            return float(match.group("value"))
    return None


def extract_int(entry: dict[str, Any], *keys: str) -> int | None:
    for key in keys:
        value = entry.get(key)
        number = coerce_int(value)
        if number is not None:
            return number
    raw = entry.get("_raw")
    if isinstance(raw, str):
        match = STATUS_RE.search(raw)
        if match:
            return int(match.group("value"))
    return None


def coerce_float(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        text = value.strip().rstrip("%")
        if not text:
            return None
        match = LATENCY_RE.fullmatch(text)
        if match:
            return float(match.group("value"))
        try:
            return float(text)
        except ValueError:
            return None
    return None


def coerce_int(value: Any) -> int | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return int(text)
        except ValueError:
            return None
    return None


def record_status(entry: dict[str, Any]) -> int | None:
    return extract_int(entry, "status", "statusCode", "httpStatus", "code")


def record_latency_ms(entry: dict[str, Any]) -> float | None:
    return extract_float(entry, "latencyMs", "durationMs", "elapsedMs", "responseTimeMs", "latency", "duration", "elapsed")


def record_uptime_pct(entry: dict[str, Any]) -> float | None:
    return extract_float(entry, "uptimePercent", "uptime")


def record_state(entry: dict[str, Any]) -> str | None:
    state = extract_str(entry, "state")
    if state:
        return state.upper()
    return None


def record_service_name(entry: dict[str, Any]) -> str | None:
    return extract_str(entry, "serviceName", "service", "routeId", "route")


def record_message(entry: dict[str, Any]) -> str | None:
    return extract_str(entry, "message", "msg", "detail", "errorMessage")


def is_request_like(entry: dict[str, Any]) -> bool:
    if record_status(entry) is not None or record_latency_ms(entry) is not None:
        return True
    raw = entry.get("_raw")
    if not isinstance(raw, str):
        return False
    return bool(
        HTTP_METHOD_RE.search(raw)
        or "status=" in raw.lower()
        or "statuscode=" in raw.lower()
        or "routeid=" in raw.lower()
        or "latency" in raw.lower()
        or "/api/" in raw.lower()
        or "/internal/" in raw.lower()
    )


def is_fallback_record(entry: dict[str, Any]) -> bool:
    if entry.get("fallback") is True or entry.get("isFallback") is True:
        return True
    status = record_status(entry)
    if status in FALLBACK_STATUS_CODES:
        return True
    error = entry.get("error")
    if isinstance(error, dict):
        code = extract_str(error, "code", "errorCode")
        if code and code.upper() in {"SERVICE_UNAVAILABLE", "TIMEOUT", "GATEWAY_TIMEOUT", "CIRCUIT_OPEN"}:
            return True
    message = record_message(entry)
    if message and message.upper().find("SERVICE_UNAVAILABLE") >= 0:
        return True
    raw = entry.get("_raw")
    if isinstance(raw, str):
        lowered = raw.lower()
        if "service_unavailable" in lowered or "fallbackuri" in lowered or "/fallback/" in lowered:
            return True
    return False


def summarize_health(records: list[dict[str, Any]]) -> tuple[int, int, float | None, float | None]:
    total = 0
    available = 0
    latencies: list[float] = []
    uptimes: list[float] = []

    for entry in records:
        if not is_health_record(entry) and not ("_raw" in entry and "health" in str(entry.get("_source", "")).lower()):
            continue

        total += 1
        state = record_state(entry)
        if state in AVAILABLE_STATES:
            available += 1
        latency = record_latency_ms(entry)
        if latency is not None:
            latencies.append(latency)
        uptime = record_uptime_pct(entry)
        if uptime is not None:
            uptimes.append(uptime)

    avg_latency = mean_or_none(latencies)
    avg_uptime = mean_or_none(uptimes)
    return total, available, avg_latency, avg_uptime


def summarize_logs(records: list[dict[str, Any]]) -> tuple[int, int, float | None, dict[str, dict[str, float]]]:
    request_total = 0
    fallback_total = 0
    latencies: list[float] = []
    per_service: dict[str, dict[str, float]] = defaultdict(lambda: {"requests": 0.0, "fallbacks": 0.0, "latency_sum": 0.0, "latency_count": 0.0})

    for entry in records:
        if not is_request_like(entry):
            continue

        request_total += 1
        fallback = is_fallback_record(entry)
        if fallback:
            fallback_total += 1

        latency = record_latency_ms(entry)
        if latency is not None:
            latencies.append(latency)

        service_name = record_service_name(entry)
        if service_name:
            bucket = per_service[service_name]
            bucket["requests"] += 1
            if fallback:
                bucket["fallbacks"] += 1
            if latency is not None:
                bucket["latency_sum"] += latency
                bucket["latency_count"] += 1

    return request_total, fallback_total, mean_or_none(latencies), per_service


def build_period_metrics(health_records: list[dict[str, Any]], log_records: list[dict[str, Any]]) -> PeriodMetrics:
    health_total, health_available_total, avg_health_latency_ms, avg_health_uptime_pct = summarize_health(health_records)
    request_total, fallback_total, avg_latency_ms, per_service = summarize_logs(log_records)

    availability_rate = None
    if health_total > 0:
        availability_rate = health_available_total / health_total
    elif avg_health_uptime_pct is not None:
        availability_rate = avg_health_uptime_pct / 100.0
    else:
        availability_rate = 1.0

    success_rate = None
    if request_total > 0:
        success_rate = (request_total - fallback_total) / request_total

    efficiency_index = None
    if avg_latency_ms is not None and avg_latency_ms > 0:
        efficiency_index = availability_rate
        if success_rate is not None:
            efficiency_index *= success_rate
        efficiency_index /= avg_latency_ms

    service_breakdown = []
    for service_name, stats in per_service.items():
        requests = int(stats["requests"])
        fallbacks = int(stats["fallbacks"])
        avg_service_latency = None
        if stats["latency_count"] > 0:
            avg_service_latency = stats["latency_sum"] / stats["latency_count"]
        service_breakdown.append(
            {
                "service": service_name,
                "requests": requests,
                "fallbacks": fallbacks,
                "fallbackRate": round(fallbacks / requests, 4) if requests else None,
                "avgLatencyMs": round(avg_service_latency, 2) if avg_service_latency is not None else None,
            }
        )
    service_breakdown.sort(key=lambda item: (item["fallbackRate"] is None, -(item["fallbackRate"] or 0), -(item["requests"] or 0), item["service"]))

    return PeriodMetrics(
        request_total=request_total,
        fallback_total=fallback_total,
        avg_latency_ms=avg_latency_ms,
        success_rate=success_rate,
        availability_rate=availability_rate,
        efficiency_index=efficiency_index,
        health_total=health_total,
        health_available_total=health_available_total,
        avg_health_latency_ms=avg_health_latency_ms,
        avg_health_uptime_pct=avg_health_uptime_pct,
        service_breakdown=service_breakdown,
    )


def mean_or_none(values: Iterable[float]) -> float | None:
    collected = list(values)
    if not collected:
        return None
    return sum(collected) / len(collected)


def percentage_change(current: float | None, baseline: float | None) -> float | None:
    if current is None or baseline is None or baseline == 0:
        return None
    return ((current - baseline) / baseline) * 100.0


def percentage_reduction(baseline: float | None, current: float | None) -> float | None:
    if baseline is None or current is None or baseline == 0:
        return None
    return ((baseline - current) / baseline) * 100.0


def format_pct(value: float | None) -> str:
    if value is None or math.isnan(value) or math.isinf(value):
        return "N/A"
    return f"{value:.2f}%"


def format_num(value: float | int | None, unit: str = "") -> str:
    if value is None:
        return "N/A"
    if isinstance(value, float):
        text = f"{value:.2f}"
        if text.endswith(".00"):
            text = text[:-3]
    else:
        text = str(value)
    return f"{text}{unit}"


def print_human_report(baseline: PeriodMetrics, current: PeriodMetrics, top_services: int) -> None:
    eff_change = percentage_change(current.efficiency_index, baseline.efficiency_index)
    latency_reduction = percentage_reduction(baseline.avg_latency_ms, current.avg_latency_ms)
    fallback_reduction = percentage_reduction(
        baseline.fallback_total / baseline.request_total if baseline.request_total else None,
        current.fallback_total / current.request_total if current.request_total else None,
    )
    availability_pp = None
    if baseline.availability_rate is not None and current.availability_rate is not None:
        availability_pp = (current.availability_rate - baseline.availability_rate) * 100.0

    print("MSA Efficiency Comparison")
    print(f"- efficiency improvement: {format_pct(eff_change)}")
    print(f"- latency reduction: {format_pct(latency_reduction)}")
    print(f"- fallback interference reduction: {format_pct(fallback_reduction)}")
    print(f"- availability change: {format_num(availability_pp, 'pp') if availability_pp is not None else 'N/A'}")
    print("")
    print("Baseline")
    print(f"- requests: {baseline.request_total}")
    print(f"- fallbacks: {baseline.fallback_total}")
    print(f"- fallback rate: {format_pct((baseline.fallback_total / baseline.request_total * 100.0) if baseline.request_total else None)}")
    print(f"- avg latency: {format_num(baseline.avg_latency_ms, 'ms')}")
    print(f"- success rate: {format_pct(baseline.success_rate * 100.0 if baseline.success_rate is not None else None)}")
    print(f"- availability rate: {format_pct(baseline.availability_rate * 100.0 if baseline.availability_rate is not None else None)}")
    print("")
    print("Current")
    print(f"- requests: {current.request_total}")
    print(f"- fallbacks: {current.fallback_total}")
    print(f"- fallback rate: {format_pct((current.fallback_total / current.request_total * 100.0) if current.request_total else None)}")
    print(f"- avg latency: {format_num(current.avg_latency_ms, 'ms')}")
    print(f"- success rate: {format_pct(current.success_rate * 100.0 if current.success_rate is not None else None)}")
    print(f"- availability rate: {format_pct(current.availability_rate * 100.0 if current.availability_rate is not None else None)}")
    print("")
    if current.service_breakdown:
        print(f"Top {top_services} services by current fallback rate")
        for item in current.service_breakdown[:top_services]:
            print(
                f"- {item['service']}: requests={item['requests']}, fallbacks={item['fallbacks']}, "
                f"fallbackRate={format_pct(item['fallbackRate'] * 100.0 if item['fallbackRate'] is not None else None)}, "
                f"avgLatency={format_num(item['avgLatencyMs'], 'ms')}"
            )


def build_result_payload(baseline: PeriodMetrics, current: PeriodMetrics, top_services: int) -> dict[str, Any]:
    baseline_fallback_rate = baseline.fallback_total / baseline.request_total if baseline.request_total else None
    current_fallback_rate = current.fallback_total / current.request_total if current.request_total else None
    result = {
        "baseline": asdict(baseline),
        "current": asdict(current),
        "comparison": {
            "efficiencyImprovementPct": percentage_change(current.efficiency_index, baseline.efficiency_index),
            "latencyReductionPct": percentage_reduction(baseline.avg_latency_ms, current.avg_latency_ms),
            "fallbackInterferenceReductionPct": percentage_reduction(baseline_fallback_rate, current_fallback_rate),
            "availabilityChangePctPoints": (
                (current.availability_rate - baseline.availability_rate) * 100.0
                if baseline.availability_rate is not None and current.availability_rate is not None
                else None
            ),
        },
        "topCurrentServices": current.service_breakdown[:top_services],
    }
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compare MSA operational efficiency between two periods using monitoring snapshots and gateway logs."
    )
    parser.add_argument("--baseline-dir", type=Path, help="Directory containing baseline health/log exports.")
    parser.add_argument("--current-dir", type=Path, help="Directory containing current health/log exports.")
    parser.add_argument("--baseline-health", type=Path, help="Baseline health snapshot file.")
    parser.add_argument("--current-health", type=Path, help="Current health snapshot file.")
    parser.add_argument("--baseline-log", type=Path, help="Baseline gateway log file.")
    parser.add_argument("--current-log", type=Path, help="Current gateway log file.")
    parser.add_argument("--json", action="store_true", help="Print JSON instead of human-readable output.")
    parser.add_argument("--top-services", type=int, default=5, help="Number of services to show in the breakdown.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.baseline_dir and not (args.baseline_health or args.baseline_log):
        print("error: provide --baseline-dir or explicit baseline files", file=sys.stderr)
        return 2
    if not args.current_dir and not (args.current_health or args.current_log):
        print("error: provide --current-dir or explicit current files", file=sys.stderr)
        return 2

    baseline_health, baseline_logs = resolve_inputs(args.baseline_dir, args.baseline_health, args.baseline_log)
    current_health, current_logs = resolve_inputs(args.current_dir, args.current_health, args.current_log)

    baseline = build_period_metrics(baseline_health, baseline_logs)
    current = build_period_metrics(current_health, current_logs)

    if baseline.request_total == 0 or current.request_total == 0:
        print(
            "error: no request-like log entries were found. Use gateway access logs or JSON records with status/latency fields.",
            file=sys.stderr,
        )
        return 2

    if args.json:
        print(json.dumps(build_result_payload(baseline, current, args.top_services), ensure_ascii=False, indent=2, default=str))
    else:
        print_human_report(baseline, current, args.top_services)

    return 0


def resolve_inputs(
    bundle_dir: Path | None,
    health_file: Path | None,
    log_file: Path | None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    health_records: list[dict[str, Any]] = []
    log_records: list[dict[str, Any]] = []

    if bundle_dir is not None:
        if health_file is None and log_file is None:
            bundle_health, bundle_logs = load_bundle(bundle_dir)
            return bundle_health, bundle_logs

    if health_file is not None:
        health_records.extend(load_structured_records(health_file))
    if log_file is not None:
        if log_file.suffix.lower() in {".json", ".jsonl"}:
            log_records.extend(load_structured_records(log_file))
        else:
            log_records.extend(load_text_records(log_file))

    return health_records, log_records


if __name__ == "__main__":
    raise SystemExit(main())
