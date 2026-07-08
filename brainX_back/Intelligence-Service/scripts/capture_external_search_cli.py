#!/usr/bin/env python3
"""Capture External Search CLI outputs and validate source quality."""

from __future__ import annotations

import argparse
import json
import os
import platform
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from capture_sample_rag_outputs import (
    JAVA_UTF8_OPTIONS,
    find_boot_jar,
    merged_java_tool_options,
    run_gradle_boot_jar,
    run_java_jar,
    save_command_output,
    save_raw_command_output,
    write_json,
)


DEFAULT_SCENARIOS = [
    {
        "id": "openai-docs",
        "query": "OpenAI Responses API web_search 사용법과 sources include 옵션을 요약해줘",
        "allowedDomains": ["platform.openai.com", "developers.openai.com"],
        "minSourceCount": 1,
        "requiredSourceDomains": ["openai.com"],
        "requireTokenUsage": True,
    },
    {
        "id": "brainx-context",
        "query": "RAG 시스템에서 외부 웹 검색과 내부 노트 검색을 같이 쓰는 일반적인 방식은?",
        "minSourceCount": 1,
        "requireTokenUsage": True,
    },
]

PROPERTY_ALIASES = {
    "OPENAI_API_KEY": ["spring.ai.openai.api-key", "brainx.external-search.openai.api-key"],
}


def main() -> int:
    args = parse_args()
    repo_root = Path(args.repo_root).resolve()
    run_id = args.run_name or datetime.now().strftime("%Y%m%d-%H%M%S")
    run_dir = (Path(args.out_dir) / run_id).resolve()
    raw_dir = run_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    scenarios = load_scenarios(args)
    if args.stream_events:
        scenarios = [stream_scenario(item) for item in scenarios]
    summary_path = run_dir / "summary.json"
    records_path = run_dir / "responses.jsonl"
    report_path = run_dir / "report.md"
    env = child_environment()
    summary: dict[str, Any] = {
        "runId": run_id,
        "createdAt": utc_now(),
        "runner": "external-search-cli",
        "repoRoot": str(repo_root),
        "profile": args.profile,
        "scenarioCount": len(scenarios),
        "preflight": preflight(repo_root, env),
        "build": None,
        "recordsPath": str(records_path),
        "reportPath": str(report_path),
        "rawDirectory": str(raw_dir),
        "runs": [],
    }
    if not summary["preflight"]["ok"]:
        write_json(summary_path, summary)
        write_report(report_path, summary, [])
        print(f"Preflight failed. See {summary_path}", file=sys.stderr)
        return 2

    gradle = resolve_gradle(repo_root, args.gradle)
    if not args.skip_build:
        build = run_gradle_boot_jar(
            repo_root=repo_root,
            gradle=gradle,
            env=env,
            process_encoding=args.process_encoding,
            timeout_seconds=args.timeout_seconds,
        )
        summary["build"] = save_raw_command_output(raw_dir, "build", build)
        write_json(summary_path, summary)
        if build.returncode != 0:
            write_report(report_path, summary, [])
            return build.returncode
    jar_path = Path(args.jar_path).resolve() if args.jar_path else find_boot_jar(repo_root)

    records: list[dict[str, Any]] = []
    for index, scenario in enumerate(scenarios, start=1):
        label = f"query-{index:03d}-{scenario.get('id') or 'search'}"
        result = run_java_jar(
            repo_root=repo_root,
            jar_path=jar_path,
            env=env,
            app_args=app_args(args, scenario),
            stdin_text=None,
            process_encoding=args.process_encoding,
            timeout_seconds=args.timeout_seconds,
        )
        command_record = save_command_output(raw_dir, label, result)
        response = result.parsed_json[-1] if result.parsed_json else None
        record = scenario_record(label, scenario, command_record, response)
        records.append(record)
        summary["runs"].append(compact_record(record))
        write_records(records_path, records)
        write_json(summary_path, summary)
    write_report(report_path, summary, records)
    failed = [record for record in records if record["status"] != "passed"]
    if failed:
        print(f"External search capture completed with {len(failed)} failed scenario(s). See {summary_path}", file=sys.stderr)
        return 1
    print(f"Saved run summary: {summary_path}")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run External Search CLI scenarios and validate sources.")
    parser.add_argument("queries", nargs="*", help="Optional custom queries.")
    parser.add_argument("--queries-file", help="UTF-8 JSON or text file. JSON can contain scenario objects.")
    parser.add_argument("--repo-root", default=".", help="Repository root.")
    parser.add_argument("--out-dir", default="build/external-search-captures", help="Output directory.")
    parser.add_argument("--run-name", help="Run directory name.")
    parser.add_argument("--profile", default="local", help="Spring profile.")
    parser.add_argument("--model-id", default="", help="External search model override.")
    parser.add_argument("--max-sources", type=int, default=0, help="Default max sources override.")
    parser.add_argument("--external-timeout", default="60s", help="brainx.external-search.timeout value for provider calls.")
    parser.add_argument("--stream-events", action="store_true", help="Capture ExternalSearchPort.searchStream events.")
    parser.add_argument("--skip-build", action="store_true", help="Skip bootJar.")
    parser.add_argument("--jar-path", help="Existing Spring Boot jar path.")
    parser.add_argument("--gradle", help="Gradle executable.")
    parser.add_argument("--timeout-seconds", type=int, default=300, help="Timeout per process.")
    parser.add_argument("--process-encoding", default="utf-8", help="Process output encoding.")
    return parser.parse_args()


def load_scenarios(args: argparse.Namespace) -> list[dict[str, Any]]:
    if args.queries_file:
        path = Path(args.queries_file)
        text = path.read_text(encoding="utf-8")
        if path.suffix.lower() == ".json":
            loaded = json.loads(text)
            if not isinstance(loaded, list):
                raise ValueError("--queries-file JSON must be an array.")
            return [scenario_from_value(item) for item in loaded]
        return [{"query": line.strip()} for line in text.splitlines() if line.strip() and not line.strip().startswith("#")]
    if args.queries:
        return [{"query": query.strip()} for query in args.queries if query.strip()]
    return [dict(item) for item in DEFAULT_SCENARIOS]


def scenario_from_value(value: Any) -> dict[str, Any]:
    if isinstance(value, str):
        return {"query": value.strip()}
    if isinstance(value, dict):
        query = str(value.get("query") or "").strip()
        if not query:
            raise ValueError("Scenario query must not be blank.")
        scenario = dict(value)
        scenario["query"] = query
        return scenario
    raise ValueError("Scenario must be a string or object.")


def stream_scenario(scenario: dict[str, Any]) -> dict[str, Any]:
    next_scenario = dict(scenario)
    next_scenario.setdefault("requireStreamEvents", True)
    next_scenario.setdefault("requireProgressEvent", True)
    next_scenario.setdefault("requireSourceEvent", True)
    next_scenario.setdefault("requireCompletedEvent", True)
    return next_scenario


def child_environment() -> dict[str, str]:
    env = os.environ.copy()
    env["JAVA_TOOL_OPTIONS"] = merged_java_tool_options(env.get("JAVA_TOOL_OPTIONS"))
    env.setdefault("BRAINX_EXTERNAL_SEARCH_PROVIDER", "openai")
    return env


def app_args(args: argparse.Namespace, scenario: dict[str, Any]) -> list[str]:
    values = [
        f"--spring.profiles.active={args.profile}",
        "--server.port=0",
        "--brainx.dev.external-search.enabled=true",
        f"--brainx.external-search.timeout={args.external_timeout}",
        f"--brainx.dev.external-search.query={scenario['query']}",
    ]
    if args.stream_events:
        values.append("--brainx.dev.external-search.stream-events=true")
    model_id = scenario.get("modelId") or args.model_id
    if model_id:
        values.append(f"--brainx.dev.external-search.model-id={model_id}")
    max_sources = scenario.get("maxSources") or args.max_sources
    if max_sources:
        values.append(f"--brainx.dev.external-search.max-sources={int(max_sources)}")
    allowed = string_list(scenario.get("allowedDomains"))
    blocked = string_list(scenario.get("blockedDomains"))
    if allowed:
        values.append("--brainx.dev.external-search.allowed-domains=" + ",".join(allowed))
    if blocked:
        values.append("--brainx.dev.external-search.blocked-domains=" + ",".join(blocked))
    return values


def scenario_record(label: str, scenario: dict[str, Any], command: dict[str, Any], response: Any) -> dict[str, Any]:
    validation = validate_response(scenario, response)
    return {
        "label": label,
        "query": scenario["query"],
        "scenario": scenario,
        "status": validation["status"] if command["returnCode"] == 0 else "failed",
        "failures": validation["failures"],
        "returnCode": command["returnCode"],
        "durationSeconds": command["durationSeconds"],
        "stdoutPath": command["stdoutPath"],
        "stderrPath": command["stderrPath"],
        "response": response,
    }


def validate_response(scenario: dict[str, Any], response: Any) -> dict[str, Any]:
    if not isinstance(response, dict):
        return {"status": "missing_response", "failures": ["response JSON is missing"]}
    failures: list[str] = []
    sources = response.get("sources")
    if not isinstance(sources, list):
        sources = []
    stream_events = response.get("streamEvents")
    if not isinstance(stream_events, list):
        stream_events = []
    min_sources = int(scenario.get("minSourceCount") or 0)
    if len(sources) < min_sources:
        failures.append(f"source count {len(sources)} is below {min_sources}")
    domains = [domain_of(str(source.get("url") or "")) for source in sources if isinstance(source, dict)]
    for required in string_list(scenario.get("requiredSourceDomains")):
        if not any(required in domain for domain in domains):
            failures.append(f"required source domain not found: {required}")
    for forbidden in string_list(scenario.get("forbiddenSourceDomains")):
        if any(forbidden in domain for domain in domains):
            failures.append(f"forbidden source domain found: {forbidden}")
    answer = str(response.get("answer") or "")
    for expected in string_list(scenario.get("answerMustContain")):
        if expected not in answer:
            failures.append(f"answer missing text: {expected}")
    if scenario.get("requireTokenUsage") is True and not isinstance(response.get("tokenUsage"), dict):
        failures.append("tokenUsage is missing")
    if scenario.get("requireStreamEvents") is True and not stream_events:
        failures.append("streamEvents is missing")
    if scenario.get("requireProgressEvent") is True and not has_stream_event(stream_events, "progress"):
        failures.append("progress stream event is missing")
    if scenario.get("requireSourceEvent") is True and not has_source_signal(stream_events, sources):
        failures.append("source stream event or completed sources are missing")
    if scenario.get("requireCompletedEvent") is True and not has_stream_event(stream_events, "completed"):
        failures.append("completed stream event is missing")
    return {"status": "passed" if not failures else "failed", "failures": failures}


def compact_record(record: dict[str, Any]) -> dict[str, Any]:
    response = record.get("response")
    sources = response.get("sources") if isinstance(response, dict) else []
    stream_events = response.get("streamEvents") if isinstance(response, dict) else []
    if not isinstance(stream_events, list):
        stream_events = []
    return {
        "label": record["label"],
        "query": record["query"],
        "status": record["status"],
        "failures": record["failures"],
        "sourceCount": len(sources) if isinstance(sources, list) else None,
        "streamEventCount": len(stream_events),
        "firstSourceEvent": first_stream_event(stream_events, "sources"),
        "completedEvent": has_stream_event(stream_events, "completed"),
        "provider": response.get("provider") if isinstance(response, dict) else None,
        "modelId": response.get("modelId") if isinstance(response, dict) else None,
        "responseId": response.get("responseId") if isinstance(response, dict) else None,
        "stdoutPath": record["stdoutPath"],
        "stderrPath": record["stderrPath"],
    }


def write_records(path: Path, records: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as file:
        for record in records:
            file.write(json.dumps(record, ensure_ascii=False) + "\n")


def write_report(path: Path, summary: dict[str, Any], records: list[dict[str, Any]]) -> None:
    lines = [
        "# External Search CLI Capture Report",
        "",
        f"- runId: `{summary['runId']}`",
        f"- profile: `{summary['profile']}`",
        f"- recordsPath: `{summary['recordsPath']}`",
        "",
        "## Preflight",
        "",
        f"- ok: `{summary['preflight']['ok']}`",
    ]
    if summary["preflight"]["failures"]:
        lines.extend(f"- {failure}" for failure in summary["preflight"]["failures"])
    for record in records:
        response = record.get("response")
        sources = response.get("sources") if isinstance(response, dict) else []
        stream_events = response.get("streamEvents") if isinstance(response, dict) else []
        if not isinstance(stream_events, list):
            stream_events = []
        lines.extend([
            "",
            f"## {record['label']}",
            "",
            f"- status: `{record['status']}`",
            f"- failures: `{'; '.join(record['failures']) or 'none'}`",
            f"- sourceCount: `{len(sources) if isinstance(sources, list) else 0}`",
            f"- streamEventCount: `{len(stream_events)}`",
            f"- firstSourceEvent: `{json.dumps(first_stream_event(stream_events, 'sources'), ensure_ascii=False)}`",
            f"- completedEvent: `{has_stream_event(stream_events, 'completed')}`",
            f"- stderrPath: `{record['stderrPath']}`",
            "",
            record["query"],
            "",
        ])
        if isinstance(sources, list):
            for source in sources:
                if isinstance(source, dict):
                    lines.append(f"- {source.get('title')} - {source.get('url')}")
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def preflight(repo_root: Path, env: dict[str, str]) -> dict[str, Any]:
    properties_path = repo_root / ".brainx-local.properties"
    local_values = read_local_properties(properties_path)
    api_key = effective_setting("OPENAI_API_KEY", env, local_values, PROPERTY_ALIASES["OPENAI_API_KEY"])
    failures = []
    if not properties_path.exists() and not env.get("OPENAI_API_KEY"):
        failures.append(".brainx-local.properties is missing and OPENAI_API_KEY is not set")
    if not api_key:
        failures.append("OPENAI_API_KEY is missing or blank")
    return {"ok": not failures, "localPropertiesExists": properties_path.exists(), "failures": failures}


def read_local_properties(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    return values


def effective_setting(name: str, env: dict[str, str], local_values: dict[str, str], aliases: list[str]) -> str:
    for key in [name, *aliases]:
        value = env.get(key) or local_values.get(key)
        if value and value.strip():
            return value.strip()
    return ""


def resolve_gradle(repo_root: Path, gradle_arg: str | None) -> str:
    if gradle_arg:
        return gradle_arg
    wrapper = repo_root / ("gradlew.bat" if platform.system().lower().startswith("win") else "gradlew")
    return str(wrapper if wrapper.exists() else "gradle")


def string_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return [str(value)]


def domain_of(url: str) -> str:
    return urlparse(url).netloc.lower()


def has_stream_event(stream_events: list[Any], event_type: str) -> bool:
    return any(isinstance(event, dict) and event.get("eventType") == event_type for event in stream_events)


def first_stream_event(stream_events: list[Any], event_type: str) -> dict[str, Any] | None:
    for event in stream_events:
        if isinstance(event, dict) and event.get("eventType") == event_type:
            return {
                "query": event.get("query"),
                "sourceCount": event.get("sourceCount"),
                "message": event.get("message"),
            }
    return None


def has_source_signal(stream_events: list[Any], sources: list[Any]) -> bool:
    return has_stream_event(stream_events, "sources") or bool(sources)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.TimeoutExpired as exception:
        print(f"Command timed out after {exception.timeout} seconds.", file=sys.stderr)
        raise SystemExit(124)
    except KeyboardInterrupt:
        raise SystemExit(130)
