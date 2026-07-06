# Cross-Service Integration Map

이 문서는 `Intelligence-Service` 관점에서 다른 BrainX 서비스와 어떤 계약, 이벤트, port 경계로 연결되는지 정리한다. 다른 서비스의 전체 사용법이나 내부 구현 매뉴얼이 아니라, 이 서비스가 구현이나 장애 조사 때 확인해야 하는 연결 지도다.

## Source Of Truth

- Public/provider API: `src/main/resources/contracts/knowledge-intelligence.openapi.yaml`
- Consumed internal REST API: `src/main/resources/contracts/knowledge-intelligence.consumed.openapi.yaml`
- Consumed/produced event API: `src/main/resources/contracts/knowledge-intelligence.asyncapi.yaml`
- 구현 경계: application outbound port와 infrastructure adapter

계약 slice에 없는 관계는 이 문서에서 구현된 것처럼 쓰지 않는다. 로컬 문서 기준으로 직접 coupling이 확인되지 않으면 "현재 명시적 연동 없음"으로 둔다.

## Service Map

| Service | Intelligence-Service 관점 | 주요 연결 | 소유권 경계 |
| --- | --- | --- | --- |
| `Workspace-Service` | 원본 노트, 폴더, 링크의 source of truth | Workspace note/folder/link 이벤트, internal note snapshot, Agent 승인 후 note create/append | Intelligence는 projection, vector index, summary cache, AI 결과만 소유한다. 원본 note mutation은 Workspace command로만 수행한다. |
| `User-Service` / `identity-access-service` | 사용자 신원과 계정 lifecycle의 source of truth | JWT `sub=userId`, `UserDeletionRequested` 이벤트 | Intelligence는 사용자별 AI 설정, 문체, projection, job/result를 소유하되 계정 자체를 소유하지 않는다. |
| `Gateway-Service` | public `/api/v1` 진입점과 local gateway 기준 | public API routing, shared `JWT_SECRET`, internal `X-Service-Token` 경계 | Gateway는 edge/auth routing 경계이며 Intelligence business state를 소유하지 않는다. |
| `Admin-Service` | 운영/관리 화면의 consumer | Intelligence events, usage/model/report 상태 조회/모니터링 | Admin은 관찰과 관리 UI 경계다. Intelligence 기능 결과와 usage event는 계약으로 제공한다. |
| `Mcp-Service` | 외부 agent/MCP note tool gateway | `POST /internal/v1/intelligence/semantic-search` 소비, Workspace note read/write tool과 결합 | MCP tool 인증과 외부 agent surface는 Mcp-Service가 소유한다. Intelligence는 internal semantic search provider 역할만 한다. |
| `Ingestion-Service` | 외부 캡처/가져오기 source | `CaptureReceived` 이벤트, noteId가 있으면 index/RAG 갱신 후보 | 캡처 원본과 import job은 Ingestion이 소유한다. Intelligence는 capture projection과 지식 검색 입력만 관리한다. |
| `Commerce-Service` | entitlement, quota, billing ledger의 source of truth | `/internal/v1/entitlements/check`, token usage event | Intelligence는 entitlement 결과를 preflight로 사용하고 usage 기록 요청을 발행한다. 과금 원장은 소유하지 않는다. |
| `Discovery-Service` | 현재 명시적 직접 연동 없음 | 이 서비스의 로컬 OpenAPI/AsyncAPI slice에서 직접 coupling 확인 안 됨 | 추측으로 adapter나 문서 coupling을 만들지 않는다. |

## Workspace-Service Boundary

Workspace는 원본 지식 상태의 기준이다. `Intelligence-Service`는 Workspace 이벤트를 받아 `intelligence_note_projections`, `intelligence_note_index_chunks`, folder/link projection, summary cache를 갱신한다.

주요 이벤트는 `NoteCreated`, `NoteContentSaved`, `NoteMetadataChanged`, `NoteTagsChanged`, `NoteTrashed`, `NoteDeleted`, `NoteLinkCreated`, `NoteLinkDeleted`, `FolderCreated`, `FolderChanged`, `FolderDeleted`다. 이벤트별 도메인 반응은 `docs/domain/consumed-events-domain-map.md`와 `docs/technical/consumed-events-implementation-checkpoints.md`를 따른다.

최신 본문이 필요한 경우에는 consumed internal API의 `/internal/v1/workspace/notes/{noteId}/snapshot`을 호출한다. Agent의 `APPEND_NOTE_CONTENT` 승인 실행은 note projection으로 user/documentGroup ownership을 확인한 뒤 Workspace snapshot `version`을 `baseVersion`으로 삼아 `/internal/v1/workspace/notes/{noteId}/content-patches`를 호출한다.

Agent의 `CREATE_NOTE` 승인 실행은 `WorkspaceNotePort.createNoteFromAgent`를 통해 Workspace internal bulk-create를 호출하며 source는 `INTELLIGENCE_AGENT`다. 이 경로도 원본 노트를 Intelligence DB에 직접 만들지 않는다.

## User And Identity Boundary

public API 인증은 bearer JWT를 사용하며 런타임 검증은 User-Service/Gateway와 같은 `JWT_SECRET` 기반 HS256 access token(`typ=access`, `sub=userId`)을 따른다. Intelligence는 `sub`를 사용자 scope key로 쓰지만 계정, 로그인 세션, 동의, refresh token을 소유하지 않는다.

`UserDeletionRequested` 이벤트가 오면 사용자별 AI 설정, 문체 프로필, note projection, vector index metadata, summary cache, graph/link projection, chat/agent 기록, cluster/insight 결과를 정리해야 한다. 상세 소유권은 `docs/domain/knowledge-intelligence-data-ownership.md`를 따른다.

## Commerce And Usage Boundary

생성형 AI 기능은 model call 또는 job acceptance 전에 entitlement port로 사용 가능 여부를 확인한다. consumed internal REST 계약상 `/internal/v1/entitlements/check`의 provider는 `commerce-operations`다.

token usage와 비용 추정은 Intelligence 기능별 recorder가 기록 요청을 만들지만, billing ledger와 과금 판단의 source of truth는 Commerce 쪽이다. 모델 가격/usage payload 정책은 `docs/technical/ai-model-pricing-and-usage.md`를 따른다.

## Admin-Service Boundary

Admin-Service는 Intelligence가 발행하는 `ChatThreadCreated`, `ChatMessageCreated`, `AiSuggestionCreated`, `AiSuggestionDecisionRecorded`, `ClusterJobRequested/Completed`, `InsightReportRequested/Completed`, `TokenUsageRecordedRequested` 같은 이벤트와 조회 API를 통해 운영 화면을 구성한다.

Admin이 필요한 운영 지표를 위해 Intelligence DB table을 임의로 공유하지 않는다. 필요한 값은 public/internal 계약, 이벤트, 또는 별도 admin-facing 조회 API로 노출한다.

## Mcp-Service Boundary

Mcp-Service는 외부 agent/MCP client의 API key, tool gateway, tool scope를 담당한다. Intelligence가 제공하는 명시적 internal API는 `POST /internal/v1/intelligence/semantic-search`이며, Mcp-Service note search tool이 API client의 user context로 호출한다.

외부 agent가 note를 읽거나 쓰는 tool 전체를 Intelligence가 소유하지 않는다. note read/write의 원장은 Workspace이고, Intelligence는 검색/RAG에 필요한 semantic search provider 역할을 한다.

## Ingestion-Service Boundary

Ingestion-Service가 `CaptureReceived` 이벤트를 발행하면 Intelligence는 capture projection에 기록한다. payload에 `noteId`가 있으면 해당 Workspace note의 검색/RAG 입력이 갱신될 후보로 본다.

캡처 원본, 변환 job, Notion/import lifecycle은 Intelligence가 소유하지 않는다. 캡처가 Workspace note로 연결된 뒤의 검색/요약/RAG 입력만 Intelligence 관심사다.

## Agent-Specific Notes

`/agent`는 `/chat`을 대체하지 않는 별도 실험 탭이다. v1의 mutation tool은 `CREATE_NOTE`, `APPEND_NOTE_CONTENT`뿐이며, 모든 Workspace mutation은 action card 승인 뒤에만 실행된다.

현재 Agent는 note 조회/search/read-only tool을 제공하지 않는다. `AgentMessageCreateRequest.clientContext`는 schema와 persistence에는 있지만, 현재 Agent planner prompt에는 note context로 자동 주입되지 않는다. 현재 노트 context 주입, `READ_NOTE`, `SEARCH_NOTES`, `LIST_RECENT_NOTES` 같은 read-only tool은 후속 v2 후보로만 취급한다.
