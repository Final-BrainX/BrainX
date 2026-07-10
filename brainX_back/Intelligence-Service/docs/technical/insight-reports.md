# 고급 인사이트 리포트 v1

이 문서는 `POST /api/v1/ai/insight-reports`, `GET /api/v1/ai/insight-reports/latest`, `GET /api/v1/ai/insight-reports/{reportId}` 구현 기준을 정리한다.

## 동작 방식

- v1은 실제 background worker 없이 sync-complete job으로 처리한다.
- POST 요청 안에서 note card 조회, entitlement 확인, LLM 호출, 결과 저장까지 완료하고 `202 Accepted`를 반환한다.
- 성공하면 `COMPLETED`, provider 오류나 JSON parse 실패는 `FAILED` report로 저장하고 `202`로 반환한다.
- `Idempotency-Key`가 같은 user/report type에 이미 있으면 저장된 report를 반환하고 AI를 다시 호출하지 않는다.
- `GET /api/v1/ai/insight-reports/latest`는 user/document group의 최신 workspace-scope report를 조회한다. 분석 가능한 노트가 없으면 `NO_SOURCE_NOTES`, 리포트가 없으면 `NOT_ANALYZED`, 리포트 생성 이후 노트가 변경됐으면 `STALE`을 반환한다.

## 입력 정책

- `scope.documentGroupId`: required, nonblank. 분석할 Workspace document group을 지정한다.
- `scope.noteIds`: optional. 있으면 해당 note만 분석하고, 하나라도 searchable하지 않으면 `404`
- `scope.maxNotes`: optional. 기본/상한 `50`
- `includeLearningRecommendations`: optional. 없으면 `false`

`GET /api/v1/ai/insight-reports/latest`도 필수 `documentGroupId` query parameter로 workspace 범위를 지정한다.

분석 대상은 clustering과 같은 `KnowledgeAnalysisNoteSourcePort` note card다. raw full markdown은 prompt에 넣지 않는다.

## 결과 Shape

public response는 OpenAPI의 generic schema를 그대로 사용한다.

- `reportId`
- `status`
- `summary`
- `knowledgeGaps[]`
- `recommendations[]`
- `completedAt`
- `failureMessage`

latest response는 `documentGroupId`, `searchableNoteCount`, `latestNoteUpdatedAt`, `state`, `report`를 반환한다. `state`는 `NO_SOURCE_NOTES`, `NOT_ANALYZED`, `FRESH`, `STALE`, `FAILED` 중 하나다.

`recommendations[]` object는 v1에서 다음 필드를 채운다.

- `type`
- `title`
- `reason`
- `noteIds`
- `priority`

`includeLearningRecommendations=false`이면 `LEARNING_RECOMMENDATION`, `LEARNING`, `STUDY_PLAN` 성격의 recommendation은 서버 후처리에서 제외한다.

## Usage / Events

- Entitlement capability: `INSIGHT_REPORT`
- Token usage featureId: `insight-report-chat`
- 사용자 기본 모델이 있으면 `AiModelSettings.defaultModelId`를 우선 사용하고, 없으면 `brainx.insight.default-model`을 쓴다.
- event producer enabled 환경에서는 `InsightReportRequested`, `InsightReportCompleted`, `TokenUsageRecordedRequested`가 발행된다.

## Persistence

JPA entity는 `intelligence_insight_reports` table을 사용한다.

- `report_id`
- `user_id`
- `document_group_id`
- `status`
- `scope_json`
- `include_learning_recommendations`
- `summary`
- `knowledge_gaps_json`
- `recommendations_json`
- `model_id`
- `idempotency_key`
- `failure_message`
- `created_at`
- `completed_at`

운영 DB schema는 Flyway migration으로 적용한다. 기본 profile은 `ddl-auto=validate`이므로 위 table DDL과 entity가 불일치하면 service startup validation에서 실패한다.
