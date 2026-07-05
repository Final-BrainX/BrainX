# Connection API

이 문서는 Intelligence Service의 노트 연결 추천 public API 구현 경계와 내부 자동 연결 기능의 관계를 설명한다.

## Source Of Truth

- public REST 계약 기준은 `../../contracts-v2/brainx-openapi.ssot.yaml`이다.
- 로컬 추출본은 `src/main/resources/contracts/knowledge-intelligence.openapi.yaml`이다.
- 구현 package는 `src/main/java/com/brainx/intelligence/connection`이다.
- 관련 내부 자동 연결 기능은 `docs/technical/note-auto-linking.md`를 기준으로 확인한다.

## Endpoints

`POST /api/v1/ai/link-suggestions`

- 요청은 `noteId`만 받는다.
- 응답은 요청 source note에서 연결할 만한 target note 후보 목록이다.
- 각 suggestion은 `suggestionId`, `targetNoteId`, `targetTitle`, `score`, `reason`, `anchorText`, `anchorStartOffset`, `anchorEndOffset`을 반환한다.
- 현재 구현은 `NoteAutoLinkUseCase`의 source-only `LLM_ONLY` 분석 경로를 사용해 요청한 `noteId`에서 다른 후보 노트로 나가는 suggestion만 계산한다.
- `/graph` 클라이언트는 suggestion을 수락할 때 최신 Workspace source note 본문을 조회하고, anchor 위치를 확정할 수 있을 때만 해당 구간을 `[[targetTitle|anchorText]]`로 바꾼 뒤 Workspace content save를 호출한다. Workspace는 저장된 wiki link를 `TYPE_WIKI` 링크와 graph projection으로 동기화한다.

`POST /api/v1/ai/bridge-concepts`

- 요청은 `noteIds[]`를 받는다.
- 유효한 unique note 개수는 2개 이상 10개 이하이다.
- 응답은 기존 note를 찾는 결과가 아니라, 선택된 note들을 이어 줄 새 문서/주제 후보이다.
- 구현은 source note의 `title`, `tags`만 prompt에 넣고 `AiChatPort.generate(...)`로 strict JSON 후보를 생성한다.
- bridge 후보가 실제 노트로 저장될 때 연결의 중심이 되는 source concept은 입력 순서의 첫 두 note이다. `bridgeReason`은 이 두 note title을 `[[노트 제목]]` wiki link로 포함해야 하며, provider가 누락하면 service가 누락된 wiki link를 보정한다.
- 반환 `noteId`는 실제 note id가 아니라 `bridge-<sha256>` 형식의 deterministic proposal id이다.

## Document Group Boundary

현재 public connection API 계약에는 `documentGroupId`가 없다.

- `ConnectionService`는 `DocumentGroups.DEFAULT_DOCUMENT_GROUP_ID`를 사용한다.
- 따라서 현재 public `link-suggestions`와 `bridge-concepts`는 `default` group 안의 projection만 대상으로 한다.
- Workspace가 document group을 보내고 Intelligence projection/vector에는 group 격리 구조가 들어가 있지만, 이 API는 아직 요청별 group 선택을 받지 않는다.

후속으로 실제 노트 그룹별 연결 추천을 지원하려면 다음을 함께 바꿔야 한다.

- SSOT의 `LinkSuggestionsRequest`, `BridgeConceptsRequest`에 `documentGroupId` 추가
- local OpenAPI slice 재생성
- frontend generated client 갱신
- `CreateLinkSuggestionsUseCase`, `CreateBridgeConceptsUseCase` command에 group 전달
- `ConnectionService`의 `default` 고정 제거
- controller/usecase/persistence test에서 group 격리 검증

## Source Note Eligibility

`link-suggestions` source note는 `NoteProjectionJpaAdapter`에서 다음 조건을 만족해야 한다.

- `userId + documentGroupId + noteId`로 조회된다.
- archived/trashed/deleted가 아닌 searchable projection이어야 한다.
- `contentPending=false`여야 한다.
- raw `markdown`이 있어야 한다.
- `searchIndexStatus=INDEXED`여야 한다.

이 조건은 자동 연결이 raw markdown anchor를 찾고 최신 검색 가능 projection만 대상으로 삼기 때문이다.

`bridge-concepts` source note는 searchable projection이면 사용할 수 있고, prompt에는 title/tags만 넣는다. 3개 이상 입력된 note는 후보 생성 배경으로 활용할 수 있지만, 저장될 bridge note가 wiki link로 직접 연결하는 원본 concept은 앞의 두 note로 제한한다.

## Entitlement, Usage, Events

두 endpoint 모두 `LINK_SUGGESTIONS` capability를 확인한다.

- `link-suggestions`는 `NoteAutoLinkUseCase`의 source-only 분석 경로 내부 usage 기록을 사용한다.
- `bridge-concepts`는 `featureId=bridge-concepts`로 `TokenUsageRecordedRequested`를 기록한다.
- provider token usage가 있으면 실제 usage를 쓰고, 없으면 prompt/response 길이 기반 estimate를 기록한다.

추천 생성 후에는 `AiSuggestionCreated` event를 발행한다.

- link suggestion payload의 `featureId`는 `link-suggestions`이다.
- bridge concept payload의 `featureId`는 `bridge-concepts`이다.
- 두 이벤트 모두 `aiSuggestionCreatedTopic`으로 publish된다.

## Error Mapping

- request validation, malformed JSON, domain validation 실패: `400`
- entitlement 거절: `403`
- source note를 찾을 수 없거나 사용할 수 없음: `404`
- 자동 연결 note cap 초과: `409`
- AI provider 미구성 또는 호출 실패: `500`

## Tests

주요 회귀 테스트는 다음을 확인한다.

- `ConnectionControllerTest`: request validation, auth required, wrapper response, domain exception HTTP mapping
- `ConnectionServiceTest`: default document group 사용, source-only `LLM_ONLY` 호출, 결과 필터와 anchor mapping, bridge prompt/usage/event 기록
- `NoteProjectionJpaAdapterTest`: connection source note 조회 조건
- `KafkaIntelligenceEventAdapterTest`: connection 이벤트가 `AiSuggestionCreated` envelope로 publish되는지

## Quality CLI

public HTTP auth 흐름은 controller test가 담당하고, LLM 품질은 dev-only CLI가 application use case를 직접 호출해 확인한다.

```powershell
python scripts\capture_connection_cli.py --run-name 20260626-connection-quality
```

이 script는 `.brainx-local.properties`와 provider 설정을 preflight로 확인한다. 통과하면 `sample_notes`를 ingest하고 `link-suggestions`, `bridge-concepts` scenario를 실행한다. sample note id는 `SampleNoteLoader`와 같은 `sample-<sha256(relativePath)[0:16]>` 규칙으로 계산한다.

결과는 `build/connection-captures/<run-id>/`에 저장되며 suggestion/recommendation count, score, reason, duplicate proposal, bridge reason의 필수 `[[...]]` wiki link를 검증한다. 실패는 exit code `1`, provider/config preflight 실패는 exit code `2`로 구분한다.

## Implementation Notes

- `connection` public API는 사용자-facing surface다.
- `autolink`는 내부 분석/CLI/품질 평가 기능이다.
- public 연결 추천은 source-only `LLM_ONLY` 경로를 사용한다. `VECTOR_LLM`과 전체 note 자동 분석은 내부 비교/진단 전략으로 유지한다.
- public response는 source markdown anchor text와 UTF-16 offset을 노출한다. 클라이언트는 offset 또는 유일한 anchor 매칭으로 위치를 확정할 수 있을 때만 해당 구간을 치환하고, 실패하면 저장하지 않아야 한다.
