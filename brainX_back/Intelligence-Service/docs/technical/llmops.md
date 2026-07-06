# Intelligence-Service LLMOps v1

이 문서는 Intelligence-Service 안에서만 소유하는 LLMOps v1 기준을 정리한다. 공개 계약의 최상위 기준은 `../../contracts-v2/brainx-openapi.ssot.yaml`이고, 로컬 추출본은 `src/main/resources/contracts/knowledge-intelligence.openapi.yaml`이다.

## 범위

v1은 운영 UI 없이 backend foundation만 제공한다.

- LLM run log: 실제 provider 호출이 있는 생성형 호출을 `intelligence_llm_runs`에 저장한다.
- Prompt registry/version: DB active prompt version이 있으면 사용하고, 없으면 기존 code prompt를 `promptVersion=code`로 기록한다.
- Eval set/run: internal API로 scenario를 만들고 sync-complete eval run을 실행한다.
- 사용자 피드백: public `PUT /api/v1/ai/llm-feedback`로 `LIKE` / `DISLIKE`를 `llmRunId` 기준 upsert한다.

프론트/관리자 UI, Commerce credit ledger, background worker는 v1 범위가 아니다.

## ID와 응답 노출

`llmRunId`는 실제 AI provider 호출이 시작될 때 생성된다. 고정 안내문처럼 provider 호출이 없는 응답은 `llmRunId=null`이다.

현재 노출 대상:

- chat SSE `done`
- chat message detail map
- inline assist SSE `done`
- agent assistant message와 SSE `done`
- bridge concepts, folder organization proposals
- AI clustering job, insight report

`link-suggestions`는 현재 내부 `NoteAutoLinkUseCase` 결과를 매핑하는 경로라 v1에서는 result field만 열어두고 실제 `llmRunId`는 null일 수 있다.

## Run Recorder

생성형 호출은 각 usecase에서 `AiRunRecorder`를 사용한다.

- `startChatRun(...)` / `complete(...)` / `fail(...)`: streaming처럼 완료 시점이 외부에 있는 흐름
- `recordChatGenerateWithRun(...)`: 일반 `AiChatPort.generate(...)` 호출 wrapper
- `recordChatGenerate(...)`: run id가 필요 없는 internal eval helper

`AiUsageRecorder`는 Commerce usage event 책임을 계속 가진다. `AiRunRecorder`는 관측, prompt/version 추적, 품질 분석, 사용자 피드백 연결 책임만 가진다.

## 저장 정책

기본 저장은 preview 모드다.

- full prompt/output은 저장하지 않는다.
- `brainx.llmops.preview-max-chars` 기본값은 `2000`, 상한은 `20000`이다.
- `sk-*`, `pa-*`, `Bearer ...`, `api_key=...` 형태는 저장 전 `[REDACTED]`로 마스킹한다.
- input/output/metadata는 JSON preview로 저장한다.

## Prompt Registry

Prompt lookup 순서:

1. `intelligence_prompt_versions`에서 `promptKey + ACTIVE` version 조회
2. 있으면 DB template 사용, `promptVersion=<number>`로 run log 저장
3. 없으면 code prompt 사용, `promptVersion=code`로 run log 저장

v1은 모든 기존 prompt를 DB로 강제 이관하지 않는다. 운영자는 internal API로 prompt definition/version을 점진적으로 등록하고 active version을 전환할 수 있다.

대표 prompt key:

| 기능 | promptKey |
| --- | --- |
| Chat router | `chat.route` |
| Chat NOTE_QA | `chat.note-qa` |
| Chat WORKSPACE_SEARCH | `chat.workspace-search` |
| Chat COMPOSE | `chat.compose` |
| Chat NOTE_ACTION | `chat.note-action` |
| Inline assist | `inline-assist` |
| Agent planner | `agent.planner` |
| Bridge concepts | `connection.bridge` |
| Folder organization | `organization.folder` |
| Clustering | `clustering` |
| Insight report | `insight-report` |

## Feedback API

`PUT /api/v1/ai/llm-feedback`

```json
{
  "llmRunId": "run-id",
  "rating": "LIKE",
  "reasonCode": "helpful",
  "comment": "원하는 답변이었습니다."
}
```

정책:

- 같은 `userId + llmRunId`는 upsert한다.
- 다른 user의 run에는 접근할 수 없고 `LLM run not found`로 처리한다.
- feedback은 quality analytics용이며 Commerce billing과 연결하지 않는다.

## Internal API

모든 internal LLMOps API는 `/internal/v1/intelligence/llmops/**` 아래에 있으며 `X-Service-Token`이 필요하다.

- runs: list/detail
- feedback: list
- prompts: definition 등록, version 생성, active 전환
- eval sets/scenarios: 생성/조회
- eval runs: sync 실행/조회

## Eval Runner v1

Eval runner는 background worker 없이 요청 안에서 scenario를 순차 실행한다.

지원 validation:

- `answerMustContain`
- `answerMustNotContain`
- `requireJson`

실패 분류:

- `QUALITY`: provider 호출은 성공했지만 validation 실패
- `PROVIDER`: provider 호출 실패, quota/config/runtime failure
- `CONFIG`, `VALIDATION`: 후속 확장용 enum

## 운영 DB

Flyway migration `V20260706_02__add_llmops_tables.sql`가 LLMOps 테이블과 기존 생성형 결과 테이블의 `llm_run_id` 컬럼을 추가한다. 운영 profile은 `ddl-auto=validate`이므로 migration이 먼저 적용되어야 한다.
