#!/usr/bin/env python3
"""Capture Connection Quality CLI outputs for link suggestions and bridge concepts."""

from __future__ import annotations

import argparse
import json
import os
import platform
import socket
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

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
        "id": "link-api-contracts",
        "type": "link-suggestions",
        "sourcePath": "BrainX API 명세서.md",
        "minSuggestionCount": 1,
        "minScore": 0.6,
        "requireReason": True,
    },
    {
        "id": "bridge-core-docs",
        "type": "bridge-concepts",
        "notePaths": ["BrainX API 명세서.md", "brainx_domain_msa_api_contracts.md"],
        "minRecommendationCount": 1,
        "requireReason": True,
        "requiredBridgeWikiLinks": [
            "[[BrainX 통합 API 명세서]]",
            "[[BrainX 도메인 기준 MSA / API / 이벤트 계약]]",
        ],
    },
]

REQUIRED_SETTINGS = [
    "OPENAI_API_KEY",
    "VOYAGE_API_KEY",
    "SPRING_AI_MODEL_CHAT",
    "BRAINX_AI_EMBEDDING_PROVIDER",
    "QDRANT_COLLECTION",
]

PROPERTY_ALIASES = {
    "OPENAI_API_KEY": ["spring.ai.openai.api-key"],
    "VOYAGE_API_KEY": ["brainx.ai.embedding.voyage.api-key"],
    "SPRING_AI_MODEL_CHAT": ["spring.ai.model.chat"],
    "BRAINX_AI_EMBEDDING_PROVIDER": ["brainx.ai.embedding.provider"],
    "QDRANT_COLLECTION": ["brainx.vector.qdrant.collection-name"],
    "QDRANT_HOST": ["brainx.vector.qdrant.host"],
    "QDRANT_GRPC_PORT": ["brainx.vector.qdrant.port"],
}


def main() -> int:
    args = parse_args()
    repo_root = Path(args.repo_root).resolve()
    run_id = args.run_name or datetime.now().strftime("%Y%m%d-%H%M%S")
    run_dir = (Path(args.out_dir) / run_id).resolve()
    raw_dir = run_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    scenarios = load_scenarios(args)
    summary_path = run_dir / "summary.json"
    records_path = run_dir / "responses.jsonl"
    report_path = run_dir / "report.md"
    env = child_environment()
    summary: dict[str, Any] = {
        "runId": run_id,
        "createdAt": utc_now(),
        "runner": "connection-quality-cli",
        "repoRoot": str(repo_root),
        "profile": args.profile,
        "sampleDirectory": args.sample_dir,
        "scenarioCount": len(scenarios),
        "preflight": preflight(repo_root, env, args.qdrant_host, args.qdrant_port),
        "build": None,
        "run": None,
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
    result = run_java_jar(
        repo_root=repo_root,
        jar_path=jar_path,
        env=env,
        app_args=app_args(args),
        stdin_text="\n".join(json.dumps(scenario, ensure_ascii=False) for scenario in scenarios) + "\nexit\n",
        process_encoding=args.process_encoding,
        timeout_seconds=args.timeout_seconds,
    )
    command_record = save_command_output(raw_dir, "connection-quality", result)
    summary["run"] = compact_command_record(command_record, len(result.parsed_json))
    scenario_responses = [
        item for item in result.parsed_json
        if isinstance(item, dict) and item.get("scenarioId") is not None
    ]
    records: list[dict[str, Any]] = []
    for index, scenario in enumerate(scenarios, start=1):
        response = scenario_responses[index - 1] if index <= len(scenario_responses) else None
        record = scenario_record(f"scenario-{index:03d}-{scenario.get('id') or scenario.get('type')}", scenario, command_record, response)
        records.append(record)
        summary["runs"].append(compact_record(record))
    write_records(records_path, records)
    write_json(summary_path, summary)
    write_report(report_path, summary, records)
    if result.returncode != 0:
        return result.returncode
    failed = [record for record in records if record["status"] != "passed"]
    if failed:
        print(f"Connection capture completed with {len(failed)} failed scenario(s). See {summary_path}", file=sys.stderr)
        return 1
    print(f"Saved run summary: {summary_path}")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run connection quality scenarios and validate outputs.")
    parser.add_argument("--queries-file", help="UTF-8 JSON scenario file.")
    parser.add_argument("--repo-root", default=".", help="Repository root.")
    parser.add_argument("--out-dir", default="build/connection-captures", help="Output directory.")
    parser.add_argument("--run-name", help="Run directory name.")
    parser.add_argument("--profile", default="local", help="Spring profile.")
    parser.add_argument("--sample-dir", default="sample_notes", help="sample_notes directory.")
    parser.add_argument("--skip-build", action="store_true", help="Skip bootJar.")
    parser.add_argument("--jar-path", help="Existing Spring Boot jar path.")
    parser.add_argument("--gradle", help="Gradle executable.")
    parser.add_argument("--timeout-seconds", type=int, default=600, help="Timeout per process.")
    parser.add_argument("--process-encoding", default="utf-8", help="Process output encoding.")
    parser.add_argument("--qdrant-host", default="localhost", help="Qdrant gRPC host.")
    parser.add_argument("--qdrant-port", type=int, default=6334, help="Qdrant gRPC port.")
    return parser.parse_args()


def load_scenarios(args: argparse.Namespace) -> list[dict[str, Any]]:
    if args.queries_file:
        loaded = json.loads(Path(args.queries_file).read_text(encoding="utf-8"))
        if not isinstance(loaded, list):
            raise ValueError("--queries-file JSON must be an array.")
        return [dict(item) for item in loaded]
    return [dict(item) for item in DEFAULT_SCENARIOS]


def child_environment() -> dict[str, str]:
    env = os.environ.copy()
    env["JAVA_TOOL_OPTIONS"] = merged_java_tool_options(env.get("JAVA_TOOL_OPTIONS"))
    env.setdefault("SPRING_AI_MODEL_CHAT", "openai")
    return env


def app_args(args: argparse.Namespace) -> list[str]:
    return [
        f"--spring.profiles.active={args.profile}",
        "--brainx.dev.connection-quality.enabled=true",
        "--brainx.dev.connection-quality.command=ingest-and-run",
        f"--brainx.dev.connection-quality.directory={args.sample_dir}",
    ]


def scenario_record(label: str, scenario: dict[str, Any], command: dict[str, Any], response: Any) -> dict[str, Any]:
    validation = validate_response(scenario, response)
    return {
        "label": label,
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
    failures = list(response.get("failures") or [])
    if response.get("status") != "passed":
        failures.append(f"runner status is {response.get('status')}")
    if scenario.get("type") == "link-suggestions":
        suggestions = response.get("suggestions")
        if not isinstance(suggestions, list):
            suggestions = []
        min_count = int(scenario.get("minSuggestionCount") or 0)
        if len(suggestions) < min_count:
            failures.append(f"suggestion count {len(suggestions)} is below {min_count}")
        if scenario.get("requireReason") is True:
            for suggestion in suggestions:
                if isinstance(suggestion, dict) and not str(suggestion.get("reason") or "").strip():
                    failures.append("suggestion reason is blank")
    if scenario.get("type") == "bridge-concepts":
        recommendations = response.get("recommendations")
        if not isinstance(recommendations, list):
            recommendations = []
        min_count = int(scenario.get("minRecommendationCount") or 0)
        if len(recommendations) < min_count:
            failures.append(f"recommendation count {len(recommendations)} is below {min_count}")
        ids = [item.get("noteId") for item in recommendations if isinstance(item, dict)]
        if len(ids) != len(set(ids)):
            failures.append("duplicate recommendation ids")
        required_links = scenario.get("requiredBridgeWikiLinks") or []
        for recommendation in recommendations:
            if not isinstance(recommendation, dict):
                continue
            reason = str(recommendation.get("bridgeReason") or "")
            for required_link in required_links:
                if str(required_link) not in reason:
                    failures.append(f"recommendation reason is missing bridge wiki link {required_link}")
    return {"status": "passed" if not failures else "failed", "failures": failures}


def compact_record(record: dict[str, Any]) -> dict[str, Any]:
    response = record.get("response")
    suggestions = response.get("suggestions") if isinstance(response, dict) else []
    recommendations = response.get("recommendations") if isinstance(response, dict) else []
    return {
        "label": record["label"],
        "scenarioId": record["scenario"].get("id"),
        "type": record["scenario"].get("type"),
        "status": record["status"],
        "failures": record["failures"],
        "suggestionCount": len(suggestions) if isinstance(suggestions, list) else None,
        "recommendationCount": len(recommendations) if isinstance(recommendations, list) else None,
        "stdoutPath": record["stdoutPath"],
        "stderrPath": record["stderrPath"],
    }


def compact_command_record(record: dict[str, Any], json_count: int) -> dict[str, Any]:
    return {
        "status": record["status"],
        "returnCode": record["returnCode"],
        "durationSeconds": record["durationSeconds"],
        "jsonObjectCount": json_count,
        "stdoutPath": record["stdoutPath"],
        "stderrPath": record["stderrPath"],
    }


def write_records(path: Path, records: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as file:
        for record in records:
            file.write(json.dumps(record, ensure_ascii=False) + "\n")


def write_report(path: Path, summary: dict[str, Any], records: list[dict[str, Any]]) -> None:
    lines = [
        "# Connection Quality CLI Capture Report",
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
        lines.extend([
            "",
            f"## {record['label']}",
            "",
            f"- status: `{record['status']}`",
            f"- failures: `{'; '.join(record['failures']) or 'none'}`",
            f"- stderrPath: `{record['stderrPath']}`",
        ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def preflight(repo_root: Path, env: dict[str, str], default_qdrant_host: str, default_qdrant_port: int) -> dict[str, Any]:
    properties_path = repo_root / ".brainx-local.properties"
    local_values = read_local_properties(properties_path)
    settings = {
        name: bool(effective_setting(name, env, local_values, PROPERTY_ALIASES.get(name, [])))
        for name in REQUIRED_SETTINGS
    }
    qdrant_host = effective_setting("QDRANT_HOST", env, local_values, PROPERTY_ALIASES["QDRANT_HOST"]) or default_qdrant_host
    qdrant_port = int(effective_setting("QDRANT_GRPC_PORT", env, local_values, PROPERTY_ALIASES["QDRANT_GRPC_PORT"]) or str(default_qdrant_port))
    qdrant = qdrant_preflight(qdrant_host, qdrant_port)
    failures = []
    if not properties_path.exists():
        failures.append(".brainx-local.properties is missing")
    for name, present in settings.items():
        if not present:
            failures.append(f"{name} is missing or blank")
    if not qdrant["reachable"]:
        failures.append(f"Qdrant gRPC {qdrant['host']}:{qdrant['port']} is not reachable")
    return {"ok": not failures, "localPropertiesExists": properties_path.exists(), "settings": settings, "qdrant": qdrant, "failures": failures}


def qdrant_preflight(host: str, port: int) -> dict[str, Any]:
    try:
        with socket.create_connection((host, port), timeout=2.0):
            return {"host": host, "port": port, "reachable": True, "error": None}
    except OSError as exception:
        return {"host": host, "port": port, "reachable": False, "error": str(exception)}


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
