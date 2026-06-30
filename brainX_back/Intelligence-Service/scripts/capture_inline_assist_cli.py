#!/usr/bin/env python3
"""Capture Inline Assist CLI outputs and validate basic writing-assist quality."""

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


LONG_CONTEXT = (
    "BrainX는 사용자가 작성 중인 노트의 선택 영역과 주변 문맥만 사용해 작성 보조 결과를 만든다. "
    "서버는 Workspace snapshot을 다시 조회하지 않고 프론트가 보내는 현재 에디터 상태를 신뢰한다. "
    "이 정책은 임시 저장 지연이나 화면의 draft 상태 차이를 줄이기 위한 것이다."
)

DEFAULT_SCENARIOS = [
    {
        "id": "summarize",
        "action": "SUMMARIZE",
        "selectedText": LONG_CONTEXT,
    },
    {
        "id": "rewrite",
        "action": "REWRITE",
        "selectedText": "이 문장은 조금 어색하고 사용자가 읽기 어렵습니다.",
        "answerMustNotContain": ["```"],
    },
    {
        "id": "continue",
        "action": "CONTINUE",
        "contextBefore": LONG_CONTEXT + " 이어지는 문단에서는 사용자가 바로 붙여 넣을 수 있는 자연스러운 내용을 생성해야 한다.",
    },
    {
        "id": "translate",
        "action": "TRANSLATE",
        "selectedText": "BrainX helps users connect notes while they are writing.",
        "language": "ko",
    },
    {
        "id": "draft",
        "action": "DRAFT",
        "draftPrompt": "RAG형 오토 브레인의 핵심 장점을 처음 읽는 사용자에게 설명하는 문단을 작성해줘.",
        "targetLength": 500,
        "contextBefore": LONG_CONTEXT,
    },
]

PROPERTY_ALIASES = {
    "OPENAI_API_KEY": ["spring.ai.openai.api-key"],
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
        "runner": "inline-assist-cli",
        "repoRoot": str(repo_root),
        "profile": args.profile,
        "scenarioCount": len(scenarios),
        "preflight": preflight(repo_root, env),
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
    command_record = save_command_output(raw_dir, "inline-assist", result)
    summary["run"] = compact_command_record(command_record, len(result.parsed_json))
    records: list[dict[str, Any]] = []
    for index, scenario in enumerate(scenarios, start=1):
        response = result.parsed_json[index - 1] if index <= len(result.parsed_json) else None
        record = scenario_record(f"scenario-{index:03d}-{scenario.get('id') or scenario.get('action')}", scenario, command_record, response)
        records.append(record)
        summary["runs"].append(compact_record(record))
    write_records(records_path, records)
    write_json(summary_path, summary)
    write_report(report_path, summary, records)
    if result.returncode != 0:
        return result.returncode
    failed = [record for record in records if record["status"] != "passed"]
    if failed:
        print(f"Inline assist capture completed with {len(failed)} failed scenario(s). See {summary_path}", file=sys.stderr)
        return 1
    print(f"Saved run summary: {summary_path}")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Inline Assist CLI scenarios and validate output.")
    parser.add_argument("--queries-file", help="UTF-8 JSON scenario file.")
    parser.add_argument("--repo-root", default=".", help="Repository root.")
    parser.add_argument("--out-dir", default="build/inline-assist-captures", help="Output directory.")
    parser.add_argument("--run-name", help="Run directory name.")
    parser.add_argument("--profile", default="local", help="Spring profile.")
    parser.add_argument("--skip-build", action="store_true", help="Skip bootJar.")
    parser.add_argument("--jar-path", help="Existing Spring Boot jar path.")
    parser.add_argument("--gradle", help="Gradle executable.")
    parser.add_argument("--timeout-seconds", type=int, default=300, help="Timeout per process.")
    parser.add_argument("--process-encoding", default="utf-8", help="Process output encoding.")
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
        "--brainx.dev.inline-assist.enabled=true",
        "--brainx.dev.inline-assist.command=run",
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
    failures: list[str] = []
    text = str(response.get("text") or "")
    if not text.strip():
        failures.append("text is blank")
    if "```" in text:
        failures.append("text contains markdown fence")
    lowered = text.strip().lower()
    for prefix in ["here is", "sure,", "물론", "다음은", "설명"]:
        if lowered.startswith(prefix.lower()):
            failures.append(f"text starts with explanatory prefix: {prefix}")
    if response.get("action") != scenario.get("action"):
        failures.append(f"action mismatch: expected {scenario.get('action')}, actual {response.get('action')}")
    for expected in string_list(scenario.get("answerMustContain")):
        if expected not in text:
            failures.append(f"text missing expected fragment: {expected}")
    for forbidden in string_list(scenario.get("answerMustNotContain")):
        if forbidden in text:
            failures.append(f"text contains forbidden fragment: {forbidden}")
    return {"status": "passed" if not failures else "failed", "failures": failures}


def compact_record(record: dict[str, Any]) -> dict[str, Any]:
    response = record.get("response")
    text = str(response.get("text") or "") if isinstance(response, dict) else ""
    return {
        "label": record["label"],
        "scenarioId": record["scenario"].get("id"),
        "action": record["scenario"].get("action"),
        "status": record["status"],
        "failures": record["failures"],
        "modelId": response.get("modelId") if isinstance(response, dict) else None,
        "textPreview": text[:240],
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
        "# Inline Assist CLI Capture Report",
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
        text = str(response.get("text") or "") if isinstance(response, dict) else ""
        lines.extend([
            "",
            f"## {record['label']}",
            "",
            f"- status: `{record['status']}`",
            f"- failures: `{'; '.join(record['failures']) or 'none'}`",
            f"- stderrPath: `{record['stderrPath']}`",
            "",
            text[:600],
        ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def preflight(repo_root: Path, env: dict[str, str]) -> dict[str, Any]:
    properties_path = repo_root / ".brainx-local.properties"
    local_values = read_local_properties(properties_path)
    api_key = effective_setting("OPENAI_API_KEY", env, local_values, PROPERTY_ALIASES["OPENAI_API_KEY"])
    failures = []
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
        return [value] if value else []
    if isinstance(value, list):
        return [str(item) for item in value if str(item)]
    return [str(value)]


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
