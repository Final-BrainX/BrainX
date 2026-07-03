# 지식 구조 분석 v1

이 문서는 `POST /api/v1/ai/clusters`, `GET /api/v1/ai/clusters/latest`, `GET /api/v1/ai/clusters/{clusterJobId}` 구현 기준을 정리한다.

## 동작 방식

- v1은 실제 background worker가 없다. POST 요청 안에서 분석 대상 note card 조회, entitlement 확인, LLM 호출, 결과 저장까지 수행한 뒤 `202 Accepted`와 현재 job 상태를 반환한다.
- 성공하면 `COMPLETED`, provider 오류나 JSON parse 실패는 `FAILED` job으로 저장하고 `202`로 반환한다.
- `Idempotency-Key`가 같은 user/job type에 이미 있으면 저장된 job을 반환하고 AI를 다시 호출하지 않는다.
- 분석 범위는 `documentGroupId` 안으로 격리된다. `scope.documentGroupId`가 없으면 `default`로 normalize한다.
- `/latest`는 AI를 호출하지 않는다. 현재 searchable note card와 최근 document-group 전체 분석 job을 비교해 화면용 상태만 반환한다.

## Latest / stale 정책

- `GET /api/v1/ai/clusters/latest?documentGroupId=default`는 `documentGroupId`, `searchableNoteCount`, `latestNoteUpdatedAt`, `state`, `job`을 반환한다.
- `state`는 `NO_SOURCE_NOTES`, `NOT_ANALYZED`, `FRESH`, `STALE`, `FAILED` 중 하나다.
- latest 후보는 `scope.noteIds`가 없는 document-group 전체 분석 job만 사용한다. 부분 note 분석 job은 최신 workspace 구조로 보지 않는다.
- POST 시 `scope_json` 내부 전용 키 `_sourceSnapshot`에 분석 대상 noteId와 updatedAt을 저장한다. public response와 `ClusterJobRequested` event scope에는 이 내부 키를 노출하지 않는다.
- 현재 searchable note set과 `_sourceSnapshot`이 다르면 `STALE`이다. UI는 마지막 결과를 보여주되 사용자가 직접 다시 분석하도록 안내한다.
- 노트 삭제/휴지통/보관 등으로 현재 그래프에 없는 noteId는 프론트에서 렌더링하지 않는다. 이 차수에는 public delete API나 retention scheduler를 두지 않는다.

## 입력 정책

- `scope.documentGroupId`: optional, 기본 `default`
- `scope.noteIds`: optional. 있으면 해당 note만 분석하고, 하나라도 searchable하지 않으면 `404`
- `scope.maxNotes`: optional. 기본/상한 `50`
- `algorithmOptions.maxClusters`: optional. 기본 `6`, 상한 `12`

분석 가능한 note는 `NoteProjection` read model 기준으로 `searchIndexStatus=INDEXED`, `markdown != null`, `contentPending=false`, archived/trashed/deleted false인 항목이다.

## LLM 입력과 결과

LLM에는 raw full markdown을 넣지 않는다. `KnowledgeAnalysisNoteSourcePort`가 아래 note card만 만든다.

- `noteId`
- `title`
- `tags`
- `headings`
- `excerpt`

응답은 strict JSON array 또는 `{ "clusters": [...] }`를 허용하고, 서버는 존재하는 `noteId`만 보존한다. public response의 `clusters[]` object는 다음 필드를 가진다.

- `clusterId`
- `title`
- `summary`
- `noteIds`
- `keywords`
- `confidence`

`ClusterJobData`는 `clusterJobId`, `documentGroupId`, `status`, `clusters`, `createdAt`, `completedAt`, `failureMessage`를 반환한다.

## Usage / Events

- Entitlement capability: `AI_CLUSTERING`
- Token usage featureId: `ai-clustering-chat`
- 사용자 기본 모델이 있으면 `AiModelSettings.defaultModelId`를 우선 사용하고, 없으면 `brainx.clustering.default-model`을 쓴다.
- event producer enabled 환경에서는 `ClusterJobRequested`, `ClusterJobCompleted`, `TokenUsageRecordedRequested`가 발행된다.

## Persistence

JPA entity는 `intelligence_cluster_jobs` table을 사용한다.

- `cluster_job_id`
- `user_id`
- `document_group_id`
- `status`
- `scope_json`
- `algorithm_options_json`
- `clusters_json`
- `model_id`
- `idempotency_key`
- `failure_message`
- `created_at`
- `completed_at`

`scope_json`에는 public scope 외에 `_sourceSnapshot` 내부 키가 들어갈 수 있다. 이 값은 latest stale 판단용이며 public response와 event payload에서는 제거한다.

운영 DB schema는 Flyway migration으로 적용한다. 기본 profile은 `ddl-auto=validate`이므로 위 table DDL과 entity가 불일치하면 service startup validation에서 실패한다.
