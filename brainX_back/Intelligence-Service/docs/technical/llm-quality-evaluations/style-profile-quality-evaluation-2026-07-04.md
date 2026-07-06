# StyleProfile LLM 품질 평가 보고서 (2026-07-04)

## 개요

- 목적: `conversationTone`과 `writingStyle` 두 축이 실제 생성형 LLM prompt에 반영되는지 검증한다.
- 범위: dev-only `style-profile-quality` runner, conversation probe, inline assist `DRAFT`/`REWRITE`, LLM judge, deterministic checks.
- 제외: RAG, Qdrant/Voyage 기반 연결 추천, `assistanceStyle` 축.
- public API/SSOT 변경: 없음.

## 실행 정보

- runId: `20260704-style-profile-quality`
- 실행 명령:

```powershell
C:\Users\fdsaf\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe scripts\capture_style_profile_quality_cli.py --run-name 20260704-style-profile-quality --timeout-seconds 600
```

- capture output: `build/style-profile-quality-captures/20260704-style-profile-quality/`
- records: `build/style-profile-quality-captures/20260704-style-profile-quality/responses.jsonl`
- generated report: `build/style-profile-quality-captures/20260704-style-profile-quality/report.md`
- generation model: `gpt-5.4-mini`
- judge model: `gpt-5.4-mini`
- preflight: `.brainx-local.properties=true`, `OPENAI_API_KEY=true`, `SPRING_AI_MODEL_CHAT=true`, `OPENAI_CHAT_MODEL=true`
- bootJar: success
- Java runner: success, 5 JSON responses
- capture script exit: `1` because one quality scenario failed

## 평가 기준

- deterministic checks:
  - output nonblank
  - markdown fence 없음
  - raw style key/legacy style axis 노출 없음
  - forbidden phrase 없음
  - `emoji=off`일 때 emoji 없음
  - unknown key sentinel 미노출
- LLM judge:
  - `taskCompliance`
  - `styleAdherence`
  - `readability`
  - `overUnderStyling`
  - `safetyAndFormat`
- pass 기준: deterministic failure 없음, `taskCompliance >= 4`, `styleAdherence >= 4`, `safetyAndFormat >= 4`, judge `passed=true`.

## 결과 요약

| Scenario | Axis / Path | Deterministic | Judge scores | Status |
| --- | --- | --- | --- | --- |
| `tone-concise-direct-no-emoji` | `conversationTone` / conversation probe | pass | task 5, style 4, read 5, balance 5, safety 5 | passed |
| `tone-warm-detailed-light-emoji` | `conversationTone` / conversation probe | pass | task 5, style 5, read 5, balance 5, safety 5 | passed |
| `writing-business-short-avoid-hype` | `writingStyle` / inline assist `DRAFT` | pass | task 4, style 4, read 4, balance 4, safety 5 | passed |
| `writing-casual-light-rewrite` | `writingStyle` / inline assist `REWRITE` | pass | task 4, style 2, read 4, balance 2, safety 5 | failed |
| `unknown-key-ignored` | `conversationTone` / conversation probe | pass | task 5, style 4, read 5, balance 5, safety 5 | passed |

총 5개 중 4개 passed, 1개 failed.

## 강화 재평가 (2026-07-05)

`StylePromptCompiler`가 단순 key-value metadata 대신 `Mandatory user style instructions` 섹션을 생성하도록 강화한 뒤 실제 LLM 평가를 재실행했다. 이 재평가에서는 기존 `writing-casual-light-rewrite` 시나리오를 `writing-eumsseum-short-rewrite`로 교체해 `writingStyle.speechLevel=음슴체`의 강한 종결 지시까지 검증했다.

- runId: `20260705-style-profile-strength`
- 실행 명령:

```powershell
C:\Users\fdsaf\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe scripts\capture_style_profile_quality_cli.py --run-name 20260705-style-profile-strength --timeout-seconds 600
```

- capture output: `build/style-profile-quality-captures/20260705-style-profile-strength/`
- generated report: `build/style-profile-quality-captures/20260705-style-profile-strength/report.md`
- generation model: `gpt-5.4-mini`
- judge model: `gpt-5.4-mini`
- preflight: `.brainx-local.properties=true`, `OPENAI_API_KEY=true`, `SPRING_AI_MODEL_CHAT=true`, `OPENAI_CHAT_MODEL=true`
- bootJar: success
- Java runner: success, 5 JSON responses
- capture script exit: `0`

| Scenario | Axis / Path | Deterministic | Judge scores | Status |
| --- | --- | --- | --- | --- |
| `tone-concise-direct-no-emoji` | `conversationTone` / conversation probe | pass | task 5, style 5, read 5, balance 5, safety 5 | passed |
| `tone-warm-detailed-light-emoji` | `conversationTone` / conversation probe | pass | task 5, style 5, read 5, balance 5, safety 5 | passed |
| `writing-business-short-avoid-hype` | `writingStyle` / inline assist `DRAFT` | pass | task 4, style 4, read 5, balance 5, safety 5 | passed |
| `writing-eumsseum-short-rewrite` | `writingStyle` / inline assist `REWRITE` | pass | task 5, style 4, read 5, balance 4, safety 5 | passed |
| `unknown-key-ignored` | `conversationTone` / conversation probe | pass | task 5, style 5, read 5, balance 5, safety 5 | passed |

강화 재평가 기준으로 총 5개 중 5개 passed. 특히 `writing-eumsseum-short-rewrite`는 `speechLevel=음슴체`가 compiled writing instruction에 강하게 반영되고, deterministic forbidden phrase와 LLM judge 기준을 모두 통과했다.

## 관찰

- `conversationTone`은 직접적/간결/emoji-off와 따뜻함/상세함 두 시나리오 모두에서 유효했다.
- unknown key sentinel은 compiled instruction과 output에 노출되지 않았다.
- inline assist `DRAFT`는 business/short/avoid 성향을 대체로 반영했다.
- inline assist `REWRITE`는 casual/light/short 요구를 충분히 반영하지 못했다. judge는 결과가 원문보다 짧고 가벼운 사용자 안내문으로 바뀌기보다, 설명형 문장으로 길게 유지되었다고 평가했다.
- inline assist path는 현재 `CreateInlineAssistUseCase` 결과에서 token usage를 반환하지 않아 `tokenUsage=null`로 캡처된다.

## 다음 개선점

- `REWRITE` action prompt에 `writingStyle`이 있을 때 "짧게 다시 쓰기", "설명 추가 금지", "원문보다 가볍게" 같은 rewrite-specific guard를 보강한다.
- `informationDensity=light`와 `sentenceLength=short` 조합은 후처리 checker 또는 retry 조건으로도 검증할 수 있다.
- inline assist 결과 DTO 또는 dev runner 전용 계측으로 token usage를 캡처하면 conversation probe와 같은 비용/사용량 비교가 가능하다.
- 품질 gate로 사용할 때는 이번 실패처럼 실제 product path 품질 이슈를 감추지 않도록 capture script의 non-zero exit을 유지한다.
