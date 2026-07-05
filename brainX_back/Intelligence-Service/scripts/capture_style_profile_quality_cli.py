#!/usr/bin/env python3
"""Capture StyleProfile quality outputs with real chat model and judge calls."""

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
    code_fence,
    find_boot_jar,
    merged_java_tool_options,
    run_gradle_boot_jar,
    run_java_jar,
    save_command_output,
    save_raw_command_output,
    write_json,
)


UNKNOWN_SENTINEL = "SHOULD_NOT_LEAK_STYLE_SENTINEL"

DEFAULT_SCENARIOS = [
    {
        "id": "tone-concise-direct-no-emoji",
        "type": "conversation",
        "conversationTone": {
            "speechLevel": "해요체",
            "warmth": "건조하지만 예의 있게",
            "directness": "돌려 말하지 않고 바로 말하기",
            "verbosity": "3문장 이내로 짧게",
            "emoji": "쓰지 않기",
        },
        "prompt": "BrainX에서 문체 설정을 켜면 AI 답변이 어떻게 달라지는지 3문장 이내로 설명해 주세요.",
        "answerMustNotContain": ["```", "😊", "🙂", "!"],
        "rubric": "직접적이고 간결해야 하며, 이모지와 과장 표현 없이 사용자가 바로 이해할 수 있어야 한다.",
    },
    {
        "id": "tone-warm-detailed-light-emoji",
        "type": "conversation",
        "conversationTone": {
            "speechLevel": "친근한 존댓말",
            "warmth": "따뜻하고 안심되게",
            "directness": "부드럽게 제안하기",
            "verbosity": "예시를 곁들여 조금 자세히",
            "emoji": "가볍게 한두 개만",
        },
        "prompt": "회의 노트를 정리하기 어려운 사용자에게 BrainX가 어떻게 도와줄 수 있는지 친절하게 설명해 주세요.",
        "rubric": "따뜻한 대화체로 충분히 설명하되, 과한 장식 없이 사용자가 안심하고 다음 행동을 떠올릴 수 있어야 한다.",
    },
    {
        "id": "writing-business-short-avoid-hype",
        "type": "inline-assist",
        "action": "DRAFT",
        "writingStyle": {
            "speechLevel": "합니다체",
            "defaultAudience": "팀 리드",
            "defaultPurpose": "상태 공유",
            "formality": "담백한 업무 보고 톤",
            "informationDensity": "핵심만 균형 있게",
            "sentenceLength": "짧은 문장 위주",
            "avoid": ["과장", "감탄", "최고", "혁신적"],
        },
        "draftPrompt": "문체 설정 UI와 백엔드 반영 작업의 진행 상황을 공유하는 짧은 업데이트를 작성해 주세요.",
        "contextBefore": "프론트 프로필 모달에 문체 탭을 추가했고, 백엔드는 두 가지 문체 축만 사용합니다.",
        "targetLength": 350,
        "answerMustNotContain": ["혁신적", "최고", "!"],
        "rubric": "업무 보고처럼 짧은 문장으로 핵심 진행 상황과 남은 확인 항목을 전달해야 한다.",
    },
    {
        "id": "writing-eumsseum-short-rewrite",
        "type": "inline-assist",
        "action": "REWRITE",
        "writingStyle": {
            "speechLevel": "음슴체",
            "defaultAudience": "BrainX 사용자",
            "defaultPurpose": "기능 안내 요약",
            "formality": "건조하고 짧은 메모 톤",
            "informationDensity": "핵심만 압축",
            "sentenceLength": "짧은 단문",
        },
        "selectedText": "본 기능은 사용자 개인화 설정을 바탕으로 생성형 AI 응답의 표현 방식을 조정합니다.",
        "answerMustNotContain": ["합니다", "습니다", "해요"],
        "rubric": "음슴체 말투가 뚜렷해야 하며, 짧고 건조한 메모형 문장으로 의미를 유지해야 한다.",
    },
    {
        "id": "unknown-key-ignored",
        "type": "conversation",
        "conversationTone": {
            "directness": "핵심부터 바로 말하기",
            "verbosity": "짧은 한 단락",
            "unknownToneKey": UNKNOWN_SENTINEL,
        },
        "writingStyle": {
            "formality": "차분한 설명체",
            "unknownWritingKey": UNKNOWN_SENTINEL,
        },
        "prompt": "BrainX의 개인화 문체 설정이 왜 필요한지 한 단락으로 설명해 주세요.",
        "answerMustNotContain": [UNKNOWN_SENTINEL, "unknownToneKey", "unknownWritingKey"],
        "rubric": "알 수 없는 설정 key나 sentinel 값이 prompt 또는 답변에 노출되지 않아야 한다.",
    },
]

REQUIRED_SETTINGS = [
    "OPENAI_API_KEY",
    "SPRING_AI_MODEL_CHAT",
    "OPENAI_CHAT_MODEL",
]

PROPERTY_ALIASES = {
    "OPENAI_API_KEY": ["spring.ai.openai.api-key"],
    "SPRING_AI_MODEL_CHAT": ["spring.ai.model.chat"],
    "OPENAI_CHAT_MODEL": [
        "spring.ai.openai.chat.options.model",
        "brainx.assist.default-model",
        "brainx.dev.style-profile-quality.model-id",
    ],
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
    env = child_environment(args)
    summary: dict[str, Any] = {
        "runId": run_id,
        "createdAt": utc_now(),
        "runner": "style-profile-quality-cli",
        "repoRoot": str(repo_root),
        "profile": args.profile,
        "scenarioCount": len(scenarios),
        "processEncoding": args.process_encoding,
        "javaToolOptions": JAVA_UTF8_OPTIONS,
        "preflight": preflight(repo_root, env, args),
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
    command_record = save_command_output(raw_dir, "style-profile-quality", result)
    summary["run"] = compact_command_record(command_record, len(result.parsed_json))

    responses = [
        item for item in result.parsed_json
        if isinstance(item, dict) and item.get("scenarioId") is not None
    ]
    records: list[dict[str, Any]] = []
    for index, scenario in enumerate(scenarios, start=1):
        response = responses[index - 1] if index <= len(responses) else None
        record = scenario_record(
            f"scenario-{index:03d}-{scenario.get('id') or scenario.get('type')}",
            scenario,
            command_record,
            response,
        )
        records.append(record)
        summary["runs"].append(compact_record(record))

    write_records(records_path, records)
    write_json(summary_path, summary)
    write_report(report_path, summary, records)

    if result.returncode != 0:
        return result.returncode
    failed = [record for record in records if record["status"] != "passed"]
    if failed:
        print(f"Style profile quality capture completed with {len(failed)} failed scenario(s). See {summary_path}", file=sys.stderr)
        return 1
    print(f"Saved run summary: {summary_path}")
    print(f"Saved response records: {records_path}")
    print(f"Saved report: {report_path}")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run StyleProfile quality scenarios with real LLM calls.")
    parser.add_argument("--queries-file", help="UTF-8 JSON scenario file.")
    parser.add_argument("--repo-root", default=".", help="Repository root.")
    parser.add_argument("--out-dir", default="build/style-profile-quality-captures", help="Output directory.")
    parser.add_argument("--run-name", help="Run directory name.")
    parser.add_argument("--profile", default="local", help="Spring profile.")
    parser.add_argument("--skip-build", action="store_true", help="Skip bootJar.")
    parser.add_argument("--jar-path", help="Existing Spring Boot jar path.")
    parser.add_argument("--gradle", help="Gradle executable.")
    parser.add_argument("--timeout-seconds", type=int, default=600, help="Timeout per process.")
    parser.add_argument("--process-encoding", default="utf-8", help="Process output encoding.")
    parser.add_argument("--chat-model", help="Override generation model.")
    parser.add_argument("--judge-model", help="Override judge model.")
    return parser.parse_args()


def load_scenarios(args: argparse.Namespace) -> list[dict[str, Any]]:
    if args.queries_file:
        loaded = json.loads(Path(args.queries_file).read_text(encoding="utf-8"))
        if not isinstance(loaded, list):
            raise ValueError("--queries-file JSON must be an array.")
        return [dict(item) for item in loaded]
    return [dict(item) for item in DEFAULT_SCENARIOS]


def child_environment(args: argparse.Namespace) -> dict[str, str]:
    env = os.environ.copy()
    env["JAVA_TOOL_OPTIONS"] = merged_java_tool_options(env.get("JAVA_TOOL_OPTIONS"))
    if args.chat_model:
        env["OPENAI_CHAT_MODEL"] = args.chat_model
    return env


def app_args(args: argparse.Namespace) -> list[str]:
    values = [
        f"--spring.profiles.active={args.profile}",
        "--spring.main.web-application-type=none",
        "--spring.cloud.discovery.enabled=false",
        "--eureka.client.enabled=false",
        "--brainx.dev.style-profile-quality.enabled=true",
        "--brainx.dev.style-profile-quality.command=run",
    ]
    if args.chat_model:
        values.append(f"--brainx.dev.style-profile-quality.model-id={args.chat_model}")
    if args.judge_model:
        values.append(f"--brainx.dev.style-profile-quality.judge-model-id={args.judge_model}")
    return values


def scenario_record(label: str, scenario: dict[str, Any], command: dict[str, Any], response: Any) -> dict[str, Any]:
    validation = validate_response(response)
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


def validate_response(response: Any) -> dict[str, Any]:
    if not isinstance(response, dict):
        return {"status": "missing_response", "failures": ["response JSON is missing"]}
    failures = list(response.get("failures") or [])
    if response.get("status") != "passed":
        failures.append(f"runner status is {response.get('status')}")
    generated_text = str(response.get("generatedText") or "")
    if not generated_text.strip():
        failures.append("generatedText is blank")
    if "```" in generated_text:
        failures.append("generatedText contains markdown fence")
    raw_response = json.dumps(response, ensure_ascii=False)
    if ("assistance" + "Style") in raw_response:
        failures.append("legacy style axis leaked into response")
    judge_result = response.get("judgeResult") if isinstance(response.get("judgeResult"), dict) else {}
    scores = judge_result.get("scores") if isinstance(judge_result.get("scores"), dict) else judge_result
    for key in ["taskCompliance", "styleAdherence"]:
        if int_or_zero(scores.get(key)) < 4:
            failures.append(f"judge {key} score below 4")
    return {"status": "passed" if not failures else "failed", "failures": failures}


def compact_record(record: dict[str, Any]) -> dict[str, Any]:
    response = record.get("response")
    generated_text = str(response.get("generatedText") or "") if isinstance(response, dict) else ""
    judge_result = response.get("judgeResult") if isinstance(response, dict) and isinstance(response.get("judgeResult"), dict) else {}
    scores = judge_result.get("scores") if isinstance(judge_result.get("scores"), dict) else {}
    return {
        "label": record["label"],
        "scenarioId": record["scenario"].get("id"),
        "type": record["scenario"].get("type"),
        "axis": response.get("axis") if isinstance(response, dict) else None,
        "feature": response.get("feature") if isinstance(response, dict) else None,
        "status": record["status"],
        "failures": record["failures"],
        "modelId": response.get("modelId") if isinstance(response, dict) else None,
        "judgeModelId": response.get("judgeModelId") if isinstance(response, dict) else None,
        "judgeScores": scores,
        "generatedPreview": generated_text[:300],
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
        "# StyleProfile Quality Capture Report",
        "",
        f"- runId: `{summary['runId']}`",
        f"- profile: `{summary['profile']}`",
        f"- recordsPath: `{summary['recordsPath']}`",
        "",
        "## Preflight",
        "",
        f"- ok: `{summary['preflight']['ok']}`",
        f"- localPropertiesExists: `{summary['preflight']['localPropertiesExists']}`",
    ]
    for name, present in summary["preflight"]["settings"].items():
        lines.append(f"- {name}: `{present}`")
    if summary["preflight"]["failures"]:
        lines.extend(["", "Failures:"])
        lines.extend(f"- {failure}" for failure in summary["preflight"]["failures"])

    if records:
        lines.extend(["", "## Scenarios"])
    for record in records:
        response = record.get("response")
        generated_text = str(response.get("generatedText") or "") if isinstance(response, dict) else ""
        style_instructions = str(response.get("styleInstructions") or "") if isinstance(response, dict) else ""
        judge_result = response.get("judgeResult") if isinstance(response, dict) and isinstance(response.get("judgeResult"), dict) else {}
        scores = judge_result.get("scores") if isinstance(judge_result.get("scores"), dict) else {}
        fence = code_fence(generated_text + style_instructions)
        lines.extend([
            "",
            f"### {record['label']}",
            "",
            f"- status: `{record['status']}`",
            f"- axis: `{response.get('axis') if isinstance(response, dict) else None}`",
            f"- feature: `{response.get('feature') if isinstance(response, dict) else None}`",
            f"- modelId: `{response.get('modelId') if isinstance(response, dict) else None}`",
            f"- judgeModelId: `{response.get('judgeModelId') if isinstance(response, dict) else None}`",
            f"- judgeScores: `{json.dumps(scores, ensure_ascii=False)}`",
            f"- failures: `{'; '.join(record['failures']) or 'none'}`",
            f"- stderrPath: `{record['stderrPath']}`",
            "",
            "Style instructions:",
            "",
            f"{fence}text",
            style_instructions[:700],
            fence,
            "",
            "Generated output:",
            "",
            f"{fence}text",
            generated_text[:1000],
            fence,
        ])
        rationale = judge_result.get("rationale") if isinstance(judge_result, dict) else None
        if rationale:
            lines.extend(["", f"Judge rationale: {rationale}"])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def preflight(repo_root: Path, env: dict[str, str], args: argparse.Namespace) -> dict[str, Any]:
    properties_path = repo_root / ".brainx-local.properties"
    local_values = read_local_properties(properties_path)
    settings: dict[str, bool] = {}
    for name in REQUIRED_SETTINGS:
        override = ""
        if name == "OPENAI_CHAT_MODEL":
            override = args.chat_model or ""
        settings[name] = bool(override or effective_setting(name, env, local_values, PROPERTY_ALIASES.get(name, [])))
    failures = []
    for name, present in settings.items():
        if not present:
            failures.append(f"{name} is missing or blank")
    return {
        "ok": not failures,
        "localPropertiesExists": properties_path.exists(),
        "settings": settings,
        "failures": failures,
    }


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


def int_or_zero(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


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
