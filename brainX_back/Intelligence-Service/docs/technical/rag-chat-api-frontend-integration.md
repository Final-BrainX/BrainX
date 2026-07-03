# RAG Chat API And Frontend Integration

이 문서는 `brainx-next`의 `/chat` 화면과 Intelligence-Service RAG 채팅 API가 어떻게 맞물리는지 설명한다. 구현 세부를 다시 찾을 때는 이 문서를 출발점으로 삼고, 계약 필드는 SSOT를 기준으로 확인한다.

## Source Of Truth

- Public OpenAPI SSOT: `../../contracts-v2/brainx-openapi.ssot.yaml`
- Local OpenAPI slice: `src/main/resources/contracts/knowledge-intelligence.openapi.yaml`
- Backend chat package: `src/main/java/com/brainx/intelligence/chat`
- Backend JPA adapter: `src/main/java/com/brainx/intelligence/infrastructure/persistence/jpa/chat`
- Frontend API client: `../../brainx-next/lib/intelligence-api.ts`
- Frontend screen: `../../brainx-next/components/chat-screen.tsx`
- Frontend generated type: `../../brainx-next/lib/generated/intelligence-openapi.ts`

## Public API Shape

`/chat`는 다음 Intelligence-Service public API만 사용한다.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/ai/chat-threads?limit=&cursor=` | 최근 메시지 기준 thread 목록 조회 |
| `POST` | `/api/v1/ai/chat-threads` | 첫 질문 전 새 thread 생성 및 선택적 AI 제목 생성 |
| `GET` | `/api/v1/ai/chat-threads/{threadId}` | 저장된 thread와 messages 재조회 |
| `POST` | `/api/v1/ai/chat-threads/{threadId}/messages` | RAG 답변 SSE stream |
| `GET` | `/api/v1/ai/models` | 사용 가능한 model 목록 |

프론트는 browser에서 8086을 직접 호출하지 않는다. `brainx-next`는 same-origin `/api/intelligence/...`를 호출하고, Next route handler가 `/api/v1/...` backend path로 proxy한다.

## Thread Title Generation

`POST /api/v1/ai/chat-threads`는 기존 `title`에 더해 optional `initialMessage`를 받을 수 있다. `/chat`은 첫 질문을 `initialMessage`로 보내고, 서버는 thread 저장 전에 AI로 짧은 한국어 주제 제목을 생성한다.

- `initialMessage`는 제목 생성 입력 전용이며 `intelligence_chat_messages`에 저장하지 않는다.
- 제목 생성 설정은 `brainx.chat.title.enabled`, `brainx.chat.title.model`, `brainx.chat.title.max-length`를 사용한다.
- 기본 모델은 `gpt-5.4-nano`, 기본 최대 길이는 20자다.
- AI 응답은 한 줄 제목으로 정규화하고, 따옴표/markdown 접두사/마침표를 제거한 뒤 최대 길이로 제한한다.
- AI provider 오류, 빈 응답, 권한/쿼터 거부, disabled 상태에서는 request의 `title`을 fallback으로 저장한다.
- `ChatThreadCreated` event와 API response에는 항상 최종 저장 제목을 넣는다.

## Thread List Contract

`GET /api/v1/ai/chat-threads`는 `ChatThreadListData`를 반환한다.

- `limit`: optional, default `20`, min `1`, max `50`
- `cursor`: optional opaque URL-safe Base64 cursor
- 정렬: `coalesce(max(message.created_at), thread.created_at) desc, thread_id desc`
- pagination: `limit + 1`개를 조회해 `hasMore`와 `nextCursor`를 계산한다

Thread list item은 다음 값을 포함한다.

- `threadId`
- `documentGroupId`
- `title`
- `modelId`
- `createdAt`
- `lastMessageAt`
- `lastMessagePreview`
- `messageCount`

`nextCursor`는 `lastMessageAt|threadId`를 URL-safe Base64로 인코딩한 값이다. client는 이 값을 해석하지 않고 다음 page 요청에 그대로 넘긴다.

## Backend Flow

목록 조회는 `ListChatThreadsUseCase`가 담당한다.

1. `ChatController`가 인증 principal과 query parameter를 `ListChatThreadsQuery`로 변환한다.
2. `ChatService`가 `limit`와 `cursor`를 검증한다.
3. `ChatPersistencePort.findThreadSummariesByUserId(...)`가 thread summary를 `limit + 1`개 조회한다.
4. `ChatService`가 `hasMore`, `nextCursor`, preview 길이 제한을 적용해 response DTO로 반환한다.

메시지 전송은 기존 RAG stream flow를 유지한다.

1. thread와 `noteScope.documentGroupId`를 검증한다.
2. user message를 저장한다.
3. `clientContext.items[].text`가 있으면 프론트 선택 context를 prompt에 우선 반영한다.
4. context가 없으면 `NoteChunkRetrievalPort`로 note chunk RAG 검색을 수행한다.
5. `AiChatPort.stream(...)`의 `delta`를 SSE로 즉시 흘린다.
6. 완료 후 assistant message를 저장하고 `done.messageId`를 내려준다.

## Frontend Flow

`../../brainx-next/components/chat-screen.tsx`는 mock data를 사용하지 않는다.

1. mount 시 `listChatThreads({ limit: 20 })`와 `listAiModels()`를 호출한다.
2. model API가 empty/error이면 backend default와 맞춰 `gpt-5.4-mini`를 fallback으로 사용한다.
3. thread를 클릭하면 `getChatThread(threadId)`로 저장된 messages와 citations를 불러온다.
4. 새 대화에서 첫 질문을 보내면 먼저 `createChatThread(...)`를 호출하고, `initialMessage`로 AI 제목 생성을 요청한다.
5. 질문 전송은 `sendChatMessageStream(...)`을 사용한다.
6. SSE `delta`는 assistant placeholder message에 즉시 누적한다.
7. `done` 이후 `getChatThread(threadId)`로 저장 상태를 재조회해 message id, citations, token usage 기반 데이터를 맞춘다.
8. streaming 중에는 새 대화, thread 전환, 추가 전송을 잠가 상태 꼬임을 막는다.

Composer textarea는 `scrollHeight` 기준으로 자동 확장된다. 최소 1줄에서 시작하고, 최대 `min(240px, 32svh)`를 넘으면 textarea 내부 스크롤을 사용한다. `Enter` 전송과 `Shift+Enter` 줄바꿈 동작은 유지한다.

Workspace-level `/chat`는 명시 source context가 없으므로 message payload의 `clientContext`는 다음 shape를 보낸다.

```json
{
  "mode": "NONE",
  "source": "WORKSPACE_CHAT",
  "items": []
}
```

## Persistence Notes

`intelligence_chat_threads`와 `intelligence_chat_messages` schema는 새 목록 API 때문에 바뀌지 않았다. 목록의 `lastMessageAt`, `lastMessagePreview`, `messageCount`는 query-time read model이다.

PostgreSQL 개발 DB가 Hibernate `@Lob`를 `oid`로 만든 경우가 있다. 이때 native SQL에서 `content`를 직접 select하면 실제 본문이 아니라 OID 숫자가 나온다. 그래서 thread summary native query는 aggregate와 ordering만 담당하고, preview text는 최신 `ChatMessageJpaEntity`를 JPA로 읽는다.

PostgreSQL Large Object는 auto-commit mode에서 읽을 수 없으므로 `ChatJpaAdapter` read path에는 `@Transactional(readOnly = true)`가 필요하다. 이 경계가 없으면 목록 API가 `Unable to access lob stream` 또는 `Large Objects may not be used in auto-commit mode`로 실패한다.

## Troubleshooting

`/chat` 목록이 비거나 실패하면 다음 순서로 확인한다.

1. `http://localhost:8086/actuator/health`가 `UP`인지 확인한다.
2. `http://localhost:8086/api/v1/ai/chat-threads?limit=2`가 200인지 확인한다.
3. `http://localhost:3002/api/intelligence/ai/chat-threads?limit=2`가 200인지 확인한다.
4. 500이면 Intelligence-Service 로그에서 SQL parameter cast 문제, LOB auto-commit 문제, schema mismatch를 먼저 찾는다.
5. preview가 숫자로 보이면 `intelligence_chat_messages.content`가 `oid`인지 확인하고, preview가 JPA entity read path를 타는지 확인한다.
6. SSE 전송 실패는 `POST /api/v1/ai/chat-threads/{threadId}/messages` 로그에서 entitlement, retrieval, provider 설정을 확인한다.

## Verification

이 기능을 수정한 뒤에는 최소 다음 검증을 수행한다.

```powershell
python scripts\extract_intelligence_openapi.py
npm run generate:intelligence-api-types
npm run typecheck
.\gradlew.bat --no-daemon check --console=plain
.\gradlew.bat --no-daemon compileDevUiJava --console=plain
git diff --check
```

개발 컨테이너까지 확인해야 하면 다음을 추가한다.

```powershell
docker compose up -d --no-deps --build intelligence-service
Invoke-WebRequest -UseBasicParsing "http://localhost:8086/api/v1/ai/chat-threads?limit=2"
Invoke-WebRequest -UseBasicParsing "http://localhost:3002/api/intelligence/ai/chat-threads?limit=2"
```
