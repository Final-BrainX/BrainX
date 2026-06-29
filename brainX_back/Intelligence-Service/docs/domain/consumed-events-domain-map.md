# Intelligence-Service Consumed Events Domain Map

이 문서는 `src/main/resources/contracts/knowledge-intelligence.asyncapi.yaml` 기준으로 `Intelligence-Service`가 consumer로 받는 이벤트와 Intelligence Service의 도메인 기능 연결을 정리한다.

현재 코드에 모든 Kafka consumer가 구현되어 있다는 뜻은 아니다. 이 문서는 계약상 수신해야 하는 이벤트가 어떤 도메인 반응으로 이어져야 하는지를 설명하는 기준 문서다.

## 공통 원칙

- 모든 consumer는 `eventId` 기준 idempotent 해야 한다.
- `correlationId`는 사용자 요청에서 시작된 흐름을 추적하는 기준으로 사용한다.
- 이벤트가 다른 이벤트나 작업으로 이어질 때는 `causationId`를 유지한다.
- 노트 read model, search index, graph projection, dashboard, wordcloud는 eventually consistent 하다.

## Workspace 지식 이벤트

Workspace 이벤트는 원본 노트와 폴더를 소유한 `Workspace-Service`에서 발생한다. Intelligence는 이를 받아 검색, RAG, 연결 추천, 정리 제안, 구조 분석에 필요한 파생 지식 상태를 갱신한다.

| Event | Topic | 연결 도메인 기능 | 도메인 반응 |
| --- | --- | --- | --- |
| `NoteCreated` | `brainx.knowledge.workspace.note-created.v1` | 지식 탐색, RAG 채팅, 연결 추천 | 새 노트의 기본 metadata를 read model에 반영하고, 이후 본문 저장 이벤트가 오면 vector index 대상이 되게 한다. |
| `NoteContentSaved` | `brainx.knowledge.workspace.note-content-saved.v1` | 지식 탐색, RAG 채팅, 작성 보조, 연결 추천, 클러스터링, 인사이트 | 노트 본문이 바뀐 사실을 기준으로 요약 cache와 vector index를 갱신 대상으로 표시한다. `markdownHash`, `version`, `savedAt`은 중복 처리와 최신성 판단에 사용한다. |
| `NoteMetadataChanged` | `brainx.knowledge.workspace.note-metadata-changed.v1` | 지식 탐색, 지식 정리 제안 | 제목, 폴더, archive 상태 같은 검색/filter metadata와 정리 후보 상태를 갱신한다. |
| `NoteTagsChanged` | `brainx.knowledge.workspace.note-tags-changed.v1` | 지식 탐색, 연결 추천, 인사이트 | 태그 기반 filter, keyword match, 지식 분류 feature의 입력을 갱신한다. |
| `NoteTrashed` | `brainx.knowledge.workspace.note-trashed.v1` | 지식 탐색, RAG 채팅, 인사이트 | 휴지통 노트가 검색/RAG 후보에 노출되지 않도록 index와 projection에서 제외한다. |
| `NoteDeleted` | `brainx.knowledge.workspace.note-deleted.v1` | 전체 Intelligence 기능 | 영구 삭제 또는 삭제 완료된 노트의 summary, vector index, graph projection, 분석 결과 참조를 제거 대상으로 처리한다. |
| `NotesMoved` | `brainx.knowledge.workspace.notes-moved.v1` | 지식 정리 제안, 지식 탐색 | 여러 노트의 폴더 위치 변경을 read model과 folder 기반 filter에 반영한다. |
| `NoteLinkCreated` | `brainx.knowledge.workspace.note-link-created.v1` | 노트 연결 추천, RAG 채팅, 지식 구조 분석 | 수동 또는 AI 추천 링크를 graph projection에 추가해 연결 추천과 RAG context 확장에 사용한다. |
| `NoteLinkDeleted` | `brainx.knowledge.workspace.note-link-deleted.v1` | 노트 연결 추천, RAG 채팅, 지식 구조 분석 | 삭제된 링크를 graph projection에서 제거해 관련성 계산과 citation 후보를 갱신한다. |
| `FolderCreated` | `brainx.knowledge.workspace.folder-created.v1` | 지식 정리 제안, 지식 탐색 | 새 폴더를 정리 제안과 folder filter의 후보 구조에 반영한다. |
| `FolderChanged` | `brainx.knowledge.workspace.folder-changed.v1` | 지식 정리 제안, 지식 탐색 | 폴더 이름이나 부모 관계 변경을 folder projection에 반영한다. |
| `FolderDeleted` | `brainx.knowledge.workspace.folder-deleted.v1` | 지식 정리 제안, 지식 탐색 | 폴더 삭제와 `childNoteAction`에 따라 노트 이동/휴지통 처리 결과를 projection에 반영한다. |

## Intelligence 내부 작업 이벤트

일부 이벤트는 `Intelligence-Service`가 producer이면서 consumer이기도 하다. 이는 사용자 요청을 받은 synchronous API와 장기 실행 작업 또는 내부 projection 갱신을 분리하기 위한 계약이다.

| Event | Topic | 연결 도메인 기능 | 도메인 반응 |
| --- | --- | --- | --- |
| `AiModelSettingsChanged` | `brainx.knowledge.intelligence.ai-model-settings-changed.v1` | AI 사용 준비, 작성 보조, RAG 채팅 | 사용자의 기본 모델과 provider 설정 변경을 이후 AI 기능의 선택 기준과 projection에 반영한다. |
| `UserStyleProfileChanged` | `brainx.knowledge.intelligence.user-style-profile-changed.v1` | AI 사용 준비, 작성 보조, RAG 채팅 | 문체 프로필 변경을 생성 응답 개인화와 style-aware suggestion에 반영한다. |
| `AiSuggestionDecisionRecorded` | `brainx.knowledge.intelligence.ai-suggestion-decision-recorded.v1` | 노트 작성 보조 | 제안 수락/거절/재생성 결정을 suggestion projection과 사용성 지표에 반영한다. v1에서 노트 본문 반영은 프론트와 Workspace 저장 흐름이 담당한다. |
| `ClusterJobRequested` | `brainx.knowledge.intelligence.cluster-job-requested.v1` | 지식 구조 분석 | 요청된 scope와 algorithm option으로 비동기 클러스터링 작업을 시작한다. |
| `InsightReportRequested` | `brainx.knowledge.intelligence.insight-report-requested.v1` | 고급 인사이트 | 요청된 scope로 지식 공백, 추천사항, 학습 제안 분석 작업을 시작한다. |

## 외부 도메인 이벤트

Workspace 외부의 source-of-truth 도메인이 보내는 이벤트도 Intelligence의 지식 상태나 사용자 데이터 보존 정책에 영향을 준다.

| Event | Topic | Producer | 연결 도메인 기능 | 도메인 반응 |
| --- | --- | --- | --- | --- |
| `CaptureReceived` | `brainx.content.ingestion.publishing.capture-received.v1` | `Ingestion-Service` | 지식 탐색, RAG 채팅 | 웹/외부 콘텐츠 캡처를 capture projection에 기록하고, `noteId`가 있으면 해당 노트의 검색/RAG 입력 갱신 후보로 본다. |
| `UserDeletionRequested` | `brainx.identity.access.user-deletion-requested.v1` | `User-Service` | 전체 Intelligence 기능 | 사용자의 AI 설정, 문체 프로필, 요약 cache, vector index, graph projection, job result 등 사용자 소유 파생 데이터를 삭제 또는 삭제 예약 처리한다. |

## 현재 구현과의 차이

현재 구현은 공통 consumer dispatcher, event idempotency/failed-event store, note projection, Workspace snapshot 기반 note 색인 갱신, capture/link/folder/user deletion projection 갱신까지 붙은 상태다. Kafka listener는 기본 비활성화되어 있으며 `brainx.events.consumer.enabled=true`일 때 dispatcher에 연결된다.

현재 checkpoint상 구현된 추가 consumed event는 `CaptureReceived`, `NoteLinkCreated`, `NoteLinkDeleted`, `FolderCreated`, `FolderChanged`, `FolderDeleted`, `UserDeletionRequested`이다. 남은 후속 작업은 note link graph refresh와 이웃 cache 무효화, folder 하위 경로 전파, user deletion에 따른 AI projection/cache 일괄 정리다.

이벤트별 구현 체크포인트는 `docs/technical/consumed-events-implementation-checkpoints.md`를 따른다.
