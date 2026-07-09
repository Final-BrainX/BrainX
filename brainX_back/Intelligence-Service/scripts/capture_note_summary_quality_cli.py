#!/usr/bin/env python3
"""Capture note summary quality outputs with the configured OpenAI chat model."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from capture_sample_rag_outputs import write_json


SYSTEM_PROMPT = """\
You generate BrainX note hover summaries.
Return exactly 3 lines.
Each line should be about 25-35 Korean characters when possible and never exceed 45 characters.
Do not use bullets, numbering, headings, greetings, labels, markdown, or code fences.
Do not invent facts that are not present in the note.
Preserve the note's primary language when possible.
"""

DEFAULT_SCENARIOS = [
    {
        "id": "meeting-note",
        "title": "그래프 요약 기능 회의",
        "markdown": "그래프 마인드맵에서 노드에 마우스를 올리면 세줄 요약을 보여주기로 했다. 노트 저장 시점에 미리 생성하되 실패하거나 누락되면 hover 시점에 lazy 생성한다. 갱신은 노트 컨텍스트 패널의 버튼에서 force 옵션으로 처리한다.",
        "requiredTerms": ["그래프", "hover", "갱신"],
    },
    {
        "id": "technical-note",
        "title": "요약 캐시 설계",
        "markdown": "세줄 요약은 userId, documentGroupId, noteId, markdownHash 기준으로 저장한다. 같은 markdownHash가 있으면 LLM을 다시 호출하지 않고 캐시를 재사용한다. 모델은 gpt-5.4-nano로 고정해 비용을 줄인다.",
        "requiredTerms": ["markdownHash", "캐시", "gpt"],
    },
    {
        "id": "structured-bullets",
        "title": "릴리즈 체크리스트",
        "markdown": "- OpenAPI SSOT를 먼저 수정한다.\n- Intelligence 추출본과 프론트 generated type을 재생성한다.\n- backend check와 frontend typecheck를 실행한다.\n- worklog에 변경 내용을 남긴다.",
        "requiredTerms": ["OpenAPI", "type", "worklog"],
    },
    {
        "id": "too-short",
        "title": "짧은 노트",
        "markdown": "짧음",
        "expectSkip": True,
    },
]


def main() -> int:
    args = parse_args()
    run_id = args.run_name or datetime.now().strftime("%Y%m%d-%H%M%S")
    run_dir = (Path(args.out_dir) / run_id).resolve()
    run_dir.mkdir(parents=True, exist_ok=True)
    scenarios = load_scenarios(args)
    summary_path = run_dir / "summary.json"
    records_path = run_dir / "responses.jsonl"
    report_path = run_dir / "report.md"
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    summary: dict[str, Any] = {
        "runId": run_id,
        "createdAt": utc_now(),
        "runner": "note-summary-quality-cli",
        "model": args.model,
        "scenarioCount": len(scenarios),
        "preflight": {"openaiApiKey": bool(api_key), "ok": bool(api_key)},
        "recordsPath": str(records_path),
        "reportPath": str(report_path),
        "runs": [],
    }
    records: list[dict[str, Any]] = []

    if not api_key:
        write_json(summary_path, summary)
        write_report(report_path, summary, records)
        return 2

    with records_path.open("w", encoding="utf-8") as output:
        for scenario in scenarios:
            record = run_scenario(args, api_key, scenario)
            records.append(record)
            output.write(json.dumps(record, ensure_ascii=False) + "\n")

    summary["runs"] = [
        {
            "id": record["id"],
            "passed": record["passed"],
            "lineCount": record.get("lineCount"),
            "maxLineChars": record.get("maxLineChars"),
            "avgLineChars": record.get("avgLineChars"),
            "errors": record.get("errors", []),
        }
        for record in records
    ]
    summary["passed"] = all(record["passed"] for record in records)
    write_json(summary_path, summary)
    write_report(report_path, summary, records)
    return 0 if summary["passed"] else 1


def run_scenario(args: argparse.Namespace, api_key: str, scenario: dict[str, Any]) -> dict[str, Any]:
    plain_text = normalize_text(str(scenario.get("markdown", "")))
    if scenario.get("expectSkip") and len(plain_text) < args.min_chars:
        return {
            "id": scenario["id"],
            "skipped": True,
            "passed": True,
            "reason": "input shorter than min summary length",
        }
    try:
        content = call_openai(
            api_key=api_key,
            base_url=args.base_url,
            model=args.model,
            timeout=args.timeout_seconds,
            title=str(scenario.get("title", "")),
            markdown=plain_text,
        )
        checks = validate_output(content, scenario)
        return {
            "id": scenario["id"],
            "skipped": False,
            "passed": not checks["errors"],
            "output": content,
            **checks,
        }
    except Exception as exception:  # noqa: BLE001 - capture script reports provider errors.
        return {
            "id": scenario["id"],
            "skipped": False,
            "passed": False,
            "errors": [str(exception)],
        }


def call_openai(
    *,
    api_key: str,
    base_url: str,
    model: str,
    timeout: int,
    title: str,
    markdown: str,
) -> str:
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Title:\n{title or '(empty)'}\n\nNote text:\n{markdown}"},
        ],
    }
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI request failed: {error.code} {detail}") from error
    choices = payload.get("choices") or []
    if not choices:
        raise RuntimeError("OpenAI response did not include choices.")
    message = choices[0].get("message") or {}
    return str(message.get("content") or "").strip()


def validate_output(content: str, scenario: dict[str, Any]) -> dict[str, Any]:
    lines = [line.strip() for line in content.replace("\r\n", "\n").split("\n") if line.strip()]
    line_lengths = [len(line) for line in lines]
    errors: list[str] = []
    if len(lines) != 3:
        errors.append(f"expected 3 lines, got {len(lines)}")
    if any(length > 45 for length in line_lengths):
        errors.append(f"line longer than 45 chars: {line_lengths}")
    if lines and not 20 <= (sum(line_lengths) / len(line_lengths)) <= 40:
        errors.append(f"average line length outside quality band: {line_lengths}")
    if any(line.startswith(("-", "*", "•", "1.", "2.", "3.")) for line in lines):
        errors.append("output includes bullet or numbering prefix")
    if "```" in content or "#" in content:
        errors.append("output includes markdown syntax")
    missing = [term for term in scenario.get("requiredTerms", []) if term.lower() not in content.lower()]
    if missing:
        errors.append(f"missing required terms: {missing}")
    return {
        "lineCount": len(lines),
        "maxLineChars": max(line_lengths, default=0),
        "avgLineChars": round(sum(line_lengths) / len(line_lengths), 2) if line_lengths else 0,
        "errors": errors,
    }


def normalize_text(value: str) -> str:
    return " ".join(value.replace("#", " ").replace("*", " ").split())


def write_report(path: Path, summary: dict[str, Any], records: list[dict[str, Any]]) -> None:
    lines = [
        f"# Note Summary Quality Capture - {summary['runId']}",
        "",
        f"- model: `{summary['model']}`",
        f"- passed: `{summary.get('passed', False)}`",
        f"- records: `{summary['recordsPath']}`",
        "",
        "## Runs",
        "",
    ]
    for record in records:
        lines.append(f"### {record['id']}")
        lines.append("")
        lines.append(f"- passed: `{record['passed']}`")
        if record.get("skipped"):
            lines.append(f"- skipped: `{record.get('reason', '')}`")
        else:
            lines.append(f"- lineCount: `{record.get('lineCount')}`")
            lines.append(f"- maxLineChars: `{record.get('maxLineChars')}`")
            lines.append(f"- avgLineChars: `{record.get('avgLineChars')}`")
            if record.get("errors"):
                lines.append(f"- errors: `{record['errors']}`")
            lines.append("")
            lines.append("```")
            lines.append(str(record.get("output", "")))
            lines.append("```")
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def load_scenarios(args: argparse.Namespace) -> list[dict[str, Any]]:
    if not args.scenarios:
        return DEFAULT_SCENARIOS
    with Path(args.scenarios).open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and isinstance(data.get("scenarios"), list):
        return data["scenarios"]
    raise ValueError("Scenario file must be a list or an object with scenarios[].")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-name", default="")
    parser.add_argument("--out-dir", default="build/note-summary-quality-captures")
    parser.add_argument("--scenarios", default="")
    parser.add_argument("--model", default=os.getenv("BRAINX_NOTE_SUMMARY_MODEL", "gpt-5.4-nano"))
    parser.add_argument("--base-url", default=os.getenv("OPENAI_BASE_URL", "https://api.openai.com"))
    parser.add_argument("--timeout-seconds", type=int, default=120)
    parser.add_argument("--min-chars", type=int, default=80)
    return parser.parse_args()


if __name__ == "__main__":
    sys.exit(main())
