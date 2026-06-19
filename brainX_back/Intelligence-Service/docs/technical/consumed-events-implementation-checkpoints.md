# Consumed Events Implementation Checkpoints

이 문서는 `AI-Service`가 consumer로 받는 이벤트를 실제 구현할 때 확인해야 하는 작업 단위를 정리한다. 이벤트의 도메인 연결은 `docs/domain/consumed-events-domain-map.md`를 기준으로 하고, 이 문서는 listener, projection, vector index, cache, job 처리 관점의 체크포인트를 다룬다.

## 공통 Consumer 체크포인트

- [x] AsyncAPI envelope의 `eventId`, `eventType`, `eventVersion`, `occurredAt`, `producer`, `correlationId`, `causationId`, `idempotencyKey`, `payload`를 공통 DTO로 받는다.
- [x] `eventId` 기준 idempotency store를 둔다. 이미 처리한 이벤트는 성공 처리하고 side effect를 반복하지 않는다.
- [x] note 계열 이벤트 중 payload `version`이 있는 이벤트는 현재 projection보다 오래되면 무시한다. `version`이 없는 이벤트는 `eventId` idempotency와 projection 상태 전환으로 처리한다.
- [x] 실패 시 retry 가능한 오류와 poison message를 구분하고, 재시도 후에도 실패하면 failed-event store로 보낸다. Kafka DLQ publish는 운영 정책 확정 후 별도 구현한다.
- [x] log에는 `eventId`, `eventType`, `userId`, `noteId`, `correlationId`만 남기고 원문 markdown, API key, 장문 생성 결과는 남기지 않는다.
- [x] event-to-event 또는 job 흐름을 만들 때는 기존 `correlationId`와 `causationId`를 유지할 수 있도록 context에 보존한다.

## Workspace Note Events

### `NoteCreated`

- [x] `noteId`, `userId`, `title`, `folderId`, `tags`, `version`으로 note projection을 upsert한다.
- [x] payload에는 markdown이 없으므로 full embedding을 하려면 Workspace snapshot을 조회한다.
- [x] snapshot이 있으면 `title + markdown`에서 excerpt/search text를 만들고 vector index에 upsert한다.
- [x] snapshot이 없으면 title-only provisional index를 만들거나 `contentPending=true`로 두고 `NoteContentSaved`를 기다린다.
- [x] tags를 `keywordIds` 또는 tag metadata로 반영해 hybrid keyword match 후보가 되게 한다.
- [x] 새 노트는 summary cache miss 상태로 둔다. 빈 AI summary를 생성하지 않는다.
- [x] 같은 `noteId`의 더 높은 version이 이미 있으면 이벤트를 무시한다.

### `NoteContentSaved`

- [x] `noteId`, `userId`, `version`, `markdownHash`, `savedAt`을 projection에 기록한다.
- [x] 저장된 `markdownHash`와 같거나 더 낮은 `version`이면 vector 재색인을 건너뛴다.
- [x] Workspace snapshot을 조회해 최신 `title`과 `markdown`을 가져온다.
- [x] markdown에서 검색/RAG용 chunk들을 만들고 chunk-level `NoteSearchDocument` 집합으로 교체한다.
- [x] Qdrant 저장은 Voyage `input_type=document` embedding을 사용하게 한다.
- [x] 기존 AI summary cache는 stale 처리한다. 현재 구현은 별도 stale flag 대신 summary row를 삭제한다.
- [ ] 링크 추천, 클러스터링, 인사이트 입력 projection을 refresh-needed 상태로 표시한다.

### `NoteMetadataChanged`

- [x] `noteId`, `userId`, `version`으로 stale event를 걸러낸다.
- [x] `title`이 있으면 note projection과 search result title metadata를 갱신한다.
- [ ] `folderId`가 있으면 folder filter와 정리 제안 projection을 갱신한다.
- [x] `tags`가 있으면 tag projection과 vector metadata의 keyword/tag field를 갱신한다.
- [x] `archived=true`이면 검색/RAG 후보에서 제외한다. `archived=false`이면 다시 후보가 될 수 있게 한다.
- [x] title이 embedding text에 포함되는 정책이면 vector index를 재색인한다.

### `NoteTagsChanged`

- [x] `noteId`, `userId`, `tags`를 tag projection에 upsert한다.
- [x] vector metadata의 `keywordIds` 또는 tag field를 갱신해 hybrid 검색에 반영한다.
- [ ] tag 기반 추천, clustering, insight projection을 refresh-needed 상태로 표시한다.
- [ ] tags만 바뀌고 embedding text에 tags를 넣지 않는 정책이면 vector 재embedding은 생략한다. 현재 구현은 metadata 일관성을 위해 snapshot 기반 chunk replace를 수행한다.

### `NoteTrashed`

- [x] `noteId`, `userId`, `deletedAt`, `purgeAt`을 tombstone projection에 기록한다.
- [x] 해당 노트를 search index와 RAG 후보에서 즉시 제외한다.
- [ ] note graph의 outgoing/incoming edge를 비활성 처리한다.
- [ ] summary cache와 분석 결과는 사용자 복구 정책에 따라 유지하되 검색 결과에는 노출하지 않는다.
- [ ] `purgeAt` 이후 hard delete job이 실행될 수 있게 예약 상태를 남긴다.

### `NoteDeleted`

- [x] `noteId`, `userId`, `deletedAt`, `permanent`를 tombstone projection에 기록한다.
- [x] vector index에서 해당 note document를 삭제한다.
- [ ] summary cache, graph edge, recommendation projection, clustering/insight 참조를 제거한다.
- [ ] `permanent=true`이면 사용자 복구용 데이터도 삭제 대상으로 처리한다.
- [ ] 삭제 이벤트 처리에는 `NoteSearchIndexPort`의 note 단위 delete 동작이 필요하다.

### `NotesMoved`

- [x] `userId`, `noteIds`, `sourceFolderId`, `targetFolderId`를 folder membership projection에 반영한다.
- [ ] note별 folder metadata가 search filter에 쓰이면 vector metadata도 갱신한다.
- [ ] embedding text가 변하지 않으므로 vector 재embedding은 하지 않는다. 현재 구현은 projection folderId만 갱신하고 chunk metadata 재저장은 후속으로 둔다.
- [x] 이동된 noteIds가 비어 있으면 no-op으로 처리한다.
- [ ] 정리 제안과 folder 기반 insight projection을 refresh-needed 상태로 표시한다.

### `NoteLinkCreated`

- [ ] `linkId`, `userId`, `sourceNoteId`, `targetNoteId`, `linkType`으로 graph edge를 upsert한다.
- [ ] source/target 노트가 삭제 또는 휴지통 상태이면 edge를 inactive로 보관하거나 무시한다.
- [ ] RAG neighbor expansion과 연결 추천 feature가 이 edge를 사용할 수 있게 projection을 갱신한다.
- [ ] `linkType=AI_SUGGESTED`이면 추천 수락률/품질 지표에 연결할 수 있게 표시한다.
- [ ] 링크 생성만으로 note embedding을 다시 만들지는 않는다.

### `NoteLinkDeleted`

- [ ] `linkId` 기준 graph edge를 삭제하거나 inactive 처리한다.
- [ ] source/target note의 neighbor cache를 무효화한다.
- [ ] 연결 추천, RAG neighbor expansion, graph analytics projection을 refresh-needed 상태로 표시한다.
- [ ] note embedding은 그대로 둔다.

## Workspace Folder Events

### `FolderCreated`

- [ ] `folderId`, `userId`, `name`, `parentFolderId`로 folder projection을 upsert한다.
- [ ] folder path나 breadcrumb를 denormalize한다면 ancestor projection을 갱신한다.
- [ ] 폴더 생성만으로 note embedding은 만들지 않는다.
- [ ] 정리 제안 feature가 새 folder를 후보로 볼 수 있게 한다.

### `FolderChanged`

- [ ] `folderId`, `userId`로 folder projection을 찾는다.
- [ ] `name`이 있으면 folder display name과 denormalized path를 갱신한다.
- [ ] `parentFolderId`가 있으면 tree 구조와 affected descendant path를 갱신한다.
- [ ] folder path를 note search metadata에 저장하는 정책이면 affected notes metadata를 갱신한다.
- [ ] embedding text가 변하지 않으면 vector 재embedding은 하지 않는다.

### `FolderDeleted`

- [ ] `folderId`, `userId`, `childNoteAction`, `targetFolderId`를 folder projection에 반영한다.
- [ ] `childNoteAction=MOVE`이면 target folder로 이동된 note projection 갱신을 준비한다.
- [ ] `childNoteAction=TRASH`이면 affected note가 검색/RAG 후보에서 제외되도록 후속 note events와 정합성을 맞춘다.
- [ ] payload에 affected noteIds가 없으므로 Workspace 조회나 후속 `NotesMoved`/`NoteTrashed` 이벤트를 기준으로 note projection을 확정한다.
- [ ] folder 기반 정리 제안 projection을 refresh-needed 상태로 표시한다.

## Intelligence Internal Events

### `AiModelSettingsChanged`

- [ ] `userId`, `defaultModelId`, `registeredProviders`를 model settings projection/cache에 반영한다.
- [ ] default model이 더 이상 사용 가능하지 않으면 fallback 정책을 적용하거나 사용 불가 상태로 표시한다.
- [ ] 사용자별 model choice cache를 무효화한다.
- [ ] 작성 보조, RAG 채팅, insight job이 새 model setting을 읽도록 한다.
- [ ] self-produced event도 idempotent하게 처리해 multi-instance 환경에서 projection이 맞춰지게 한다.

### `UserStyleProfileChanged`

- [ ] `userId`, `style`을 style profile projection/cache에 반영한다.
- [ ] prompt personalization cache를 무효화한다.
- [ ] 진행 중인 streaming 응답에는 적용하지 않고 다음 요청부터 적용한다.
- [ ] style payload는 schema evolution을 고려해 unknown field를 보존하거나 무시 정책을 명시한다.
- [ ] embedding/vector index는 문체 변경만으로 재색인하지 않는다.

### `AiSuggestionDecisionRecorded`

- [ ] `suggestionId`, `userId`, `decision`, `appliedNoteId`로 suggestion decision projection을 upsert한다.
- [ ] `decision=ACCEPTED`이고 `appliedNoteId`가 있으면 해당 note를 content-stale 상태로 표시한다.
- [ ] 실제 note content 반영은 Workspace command/API와 이후 `NoteContentSaved` 이벤트로 확정한다.
- [ ] `decision=REGENERATED`이면 이전 suggestion과 새 suggestion chain을 추적할 수 있게 한다.
- [ ] suggestion 품질/수락률 metric을 갱신한다.

### `ClusterJobRequested`

- [ ] `clusterJobId` 기준 idempotent job record를 생성한다.
- [ ] `scope`를 note 후보 집합으로 해석한다.
- [ ] 후보 note의 최신 vector/search projection이 준비되어 있는지 확인하고, 누락분은 refresh-needed로 표시한다.
- [ ] `algorithmOptions`를 검증하고 지원하지 않는 옵션은 job failure로 기록한다.
- [ ] clustering worker를 시작하고 상태를 `RUNNING`으로 바꾼다.
- [ ] 완료 시 cluster result를 저장하고 `ClusterJobCompleted` 계열 이벤트를 발행할 준비를 한다.

### `InsightReportRequested`

- [ ] `reportJobId` 기준 idempotent job record를 생성한다.
- [ ] `scope`를 note/folder/tag 범위로 해석한다.
- [ ] summary, tags, graph, cluster 결과, recent activity projection을 입력으로 모은다.
- [ ] `includeLearningRecommendations=true`이면 학습 추천 생성 단계를 포함한다.
- [ ] report worker를 시작하고 상태를 `RUNNING`으로 바꾼다.
- [ ] 완료 시 report result를 저장하고 `InsightReportCompleted` 계열 이벤트를 발행할 준비를 한다.

## External Domain Events

### `CaptureReceived`

- [ ] `captureId`, `userId`, `url`, `title`, `noteId`를 capture projection에 기록한다.
- [ ] `noteId`가 있으면 해당 note를 indexing refresh 후보로 표시한다.
- [ ] `noteId`가 없으면 note 생성 이벤트가 올 때까지 capture와 user/url/title만 보관한다.
- [ ] URL/title만으로 note vector를 만들지 않는다. 원본 note가 연결된 뒤 Workspace snapshot을 기준으로 색인한다.
- [ ] 같은 `captureId`가 다시 오면 idempotent하게 처리한다.

### `UserDeletionRequested`

- [ ] `userId`, `deletionScheduledAt`, `reason`으로 deletion workflow record를 생성한다.
- [ ] 사용자의 AI model settings와 style profile을 삭제 또는 삭제 예약한다.
- [ ] 사용자의 summary cache와 vector index document를 모두 삭제한다.
- [ ] graph projection, recommendation projection, cluster result, insight report, chat/suggestion data를 삭제 대상으로 표시한다.
- [ ] 실행 중인 cluster/insight/chat job을 취소하거나 더 이상 결과를 노출하지 않게 한다.
- [ ] 삭제 처리 완료 여부를 감사 가능한 상태로 남긴다.

## 현재 구현에서 필요한 선행 보강

- [x] Workspace snapshot adapter가 실제 note title/markdown을 가져와야 한다.
- [ ] `NoteSearchIndexPort`에 note 단위 delete와 user 단위 delete가 필요하다. note 단위 delete는 구현되었고 user 단위 delete는 `UserDeletionRequested` 처리 단계에서 추가한다.
- [x] note projection에는 최소 `userId`, `noteId`, `title`, `folderId`, `tags`, `version`, `markdownHash`, `archived`, `trashed`가 필요하다.
- [ ] summary cache에는 `version` 또는 `markdownHash`가 필요하다.
- [ ] vector index metadata에는 folder/tag/archive/trashed 상태를 filter 가능한 형태로 넣어야 한다. 현재 chunk metadata에는 `userId`, `noteId`, `chunkId`, `chunkIndex`, `title`, `excerpt`, `keywordIds`, `markdownHash`, `version`을 저장한다.
- [ ] cluster/insight job 상태 저장소와 result 저장소가 필요하다.
- [x] event idempotency store와 failed-event store가 필요하다. Kafka DLQ 운영 정책과 publish adapter는 후속 구현으로 둔다.
