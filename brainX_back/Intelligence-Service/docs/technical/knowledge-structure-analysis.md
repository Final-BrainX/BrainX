# 지식 구조 분석 v1

이 문서는 `POST /api/v1/ai/clusters`, `GET /api/v1/ai/clusters/latest`, `GET /api/v1/ai/clusters/{clusterJobId}`, `POST /api/v1/ai/cluster-inheritances` 구현 기준을 정리한다.

## 동작 방식

- v1은 실제 background worker가 없다. POST 요청 안에서 분석 대상 note card 조회, entitlement 확인, LLM 호출, 결과 저장까지 수행한 뒤 `202 Accepted`와 현재 job 상태를 반환한다.
- 성공하면 `COMPLETED`, provider 오류나 JSON parse/validation 실패는 `FAILED` job으로 저장하고 `202`로 반환한다.
- `Idempotency-Key`가 같은 user/job type에 이미 있으면 저장된 job을 반환하고 AI를 다시 호출하지 않는다.
- 분석 범위는 `documentGroupId` 안으로 격리된다. `scope.documentGroupId`가 없으면 `default`로 normalize한다.
- `/latest`는 AI를 호출하지 않는다. 현재 graph AI source-ready note card와 최근 document-group 전체 분석 job을 비교해 화면용 상태만 반환한다.
- 최근 완료된 document-group 전체 분석 job이 있으면 기존 cluster ID와 기존 멤버십을 보존하는 증분 모드로 동작한다. `scope.noteIds` 부분 분석은 증분 기준 snapshot으로 사용하지 않는다.

## Latest / stale 정책

- `GET /api/v1/ai/clusters/latest?documentGroupId=default`는 `documentGroupId`, `searchableNoteCount`, `latestNoteUpdatedAt`, `state`, `job`을 반환한다.
- `state`는 `NO_SOURCE_NOTES`, `NOT_ANALYZED`, `FRESH`, `STALE`, `FAILED` 중 하나다.
- latest 후보는 `scope.noteIds`가 없는 document-group 전체 분석 job만 사용한다. 부분 note 분석 job은 최신 workspace 구조로 보지 않는다.
- POST 시 `scope_json` 내부 전용 키 `_sourceSnapshot`에 분석 대상 noteId와 updatedAt을 저장한다. public response와 `ClusterJobRequested` event scope에는 이 내부 키를 노출하지 않는다.
- 현재 graph AI source-ready note set과 `_sourceSnapshot`이 다르면 `STALE`이다. UI는 마지막 결과를 보여주되 사용자가 직접 다시 분석하도록 안내한다.
- 노트 삭제/휴지통/보관 등으로 현재 그래프에 없는 noteId는 프론트에서 렌더링하지 않는다. 이 차수에는 public delete API나 retention scheduler를 두지 않는다.

## 입력 정책

- `scope.documentGroupId`: optional, 기본 `default`
- `scope.noteIds`: optional. 있으면 해당 note만 분석하고, 하나라도 graph AI source-ready가 아니면 `404`
- `scope.maxNotes`: optional. 기본/상한 `50`
- `algorithmOptions.maxClusters`: optional. 기본 `6`, 상한 `12`
- `brainx.clustering.existing-fit-min-confidence`: 기본 `0.75`, 범위 `0..1`
- `brainx.clustering.incremental-max-total-clusters`: 기본/상한 `12`

분석 가능한 note는 `NoteProjection` read model 기준으로 active projection, `markdown != null`, `contentPending=false`, archived/trashed/deleted false, `searchIndexStatus != REMOVED`인 항목이다. clustering은 note card 기반 LLM 분석이므로 embedding/Qdrant index 완료를 기다리지 않는다. RAG, semantic search, keyword/vector search 같은 검색 경로는 별도로 `INDEXED` 상태를 요구한다.

## LLM 입력과 결과

LLM에는 raw full markdown을 넣지 않는다. `KnowledgeAnalysisNoteSourcePort`가 아래 note card만 만든다.

- `noteId`
- `title`
- `tags`
- `headings`
- `excerpt`

클러스터링 prompt는 사용자 `writingStyle`을 적용하지 않는다. system prompt는 모든 입력 `noteId`가 정확히 한 번만 포함되어야 한다고 지시하고, user prompt에는 `All input note IDs` JSON 배열을 함께 넣는다. runtime instruction은 `maxClusters`, 입력 note 수, `softTarget = min(maxClusters, max(1, round(sqrt(noteCount))))`를 포함한다.

응답은 strict JSON array 또는 `{ "clusters": [...] }`를 허용한다. 서버는 unknown noteId를 조용히 제거하거나 `maxClusters` 초과 cluster를 자르지 않고, 아래 조건을 validation error로 처리한다.

- 누락된 noteId
- 입력에 없는 noteId
- 중복 noteId
- 빈 cluster
- `maxClusters` 초과 cluster 수

validation 실패 시 최대 1회 repair pass를 실행한다. repair prompt에는 원본 note cards, 전체 input note IDs, 이전 출력, validation error 목록이 들어간다. repair 호출 전 `AI_CLUSTERING` entitlement를 repair prompt token estimate로 다시 확인하고, initial/repair provider 호출의 token usage는 각각 기록한다. repair가 성공하면 repair run의 `llmRunId`가 job에 저장되고, repair도 실패하면 job은 `FAILED`로 저장하며 `ClusterJobCompleted` event는 발행하지 않는다.

public response의 `clusters[]` object는 다음 필드를 가진다.

- `clusterId`
- `title`
- `summary`
- `noteIds`
- `keywords`
- `confidence`

`ClusterJobData`는 `clusterJobId`, `documentGroupId`, `status`, `clusters`, `createdAt`, `completedAt`, `failureMessage`를 반환한다.

## 기존 클러스터 우선 배정

- 현재 source note 중 기준 snapshot의 어떤 cluster에도 속하지 않은 note만 적합도 guard에 전달한다. 수정된 기존 멤버는 재배치하지 않는다.
- guard 입력은 기존 cluster의 ID/title/summary/keywords, 최대 3개의 대표 note card, 미분류 note card다.
- 각 미분류 note에 대해 `{noteId, clusterId|null, confidence}`를 정확히 한 번 반환해야 하며, 누락·중복·알 수 없는 ID·범위 밖 confidence는 한 번 repair한다.
- confidence가 설정 임계값 이상인 경우에만 기존 cluster에 append한다. 나머지만 신규 clustering prompt로 전달한다.
- 기존 cluster 수와 신규 cluster 수의 합은 `incremental-max-total-clusters`를 넘지 않는다. 이미 상한이면 남은 note는 cluster 배열에 넣지 않아 UI에서 미분류로 표현한다.
- 삭제된 source note는 기존 cluster에서 제거하고 빈 cluster는 제거한다. 미분류 note가 없으면 LLM 없이 최신 source snapshot을 가진 완료 job을 저장한다.

## 징검다리 클러스터 상속

- 프론트가 징검다리 Workspace note 저장 후 생성 note ID와 의미상 중심인 첫 두 source note ID를 `/api/v1/ai/cluster-inheritances`에 전달한다.
- 서버가 최근 완료 전체 snapshot에서 두 source가 같은 실제 cluster인지 확인한다. 같지 않거나 미분류면 `inherited=false`이며 note 생성은 유지한다.
- 같은 cluster이면 Workspace internal snapshot의 `userId`와 `documentGroupId`를 검증하고 새 완료 cluster snapshot을 저장한다. Kafka projection이 늦으면 internal snapshot으로 note card와 source snapshot을 보완한다.
- 이미 같은 cluster에 속한 요청은 멱등 성공하고, 다른 cluster에 속하면 `409`다. 이 경로는 LLM과 entitlement를 사용하지 않는다.

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
