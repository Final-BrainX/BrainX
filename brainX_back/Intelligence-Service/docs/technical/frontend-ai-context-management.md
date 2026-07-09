# Frontend AI Context Management

이 문서는 `brainx-next`가 노트 AI 요청에서 어떤 노트 범위를 context로 보낼지 결정하는 현재 구현을 설명한다. Intelligence Service는 `clientContext`를 public chat API로 받아 prompt에 반영하지만, 노트의 어느 부분을 보낼지 선택하는 책임은 프론트가 가진다.

## Source Of Truth

- API 계약: `../../contracts-v2/brainx-openapi.ssot.yaml`
- Intelligence Service local slice: `src/main/resources/contracts/knowledge-intelligence.openapi.yaml`
- Frontend context module: `../../brainx-next/lib/ai-context/`
- Frontend API client: `../../brainx-next/lib/intelligence-api.ts`
- Right sidebar chat: `../../brainx-next/components/notes/RightSidebar.tsx`
- Editor inline assist: `../../brainx-next/components/notes/NoteEditor.tsx`
- Backend chat prompt assembly: `src/main/java/com/brainx/intelligence/chat/application/usecase/ChatService.java`

## Concepts

`noteScope`와 `clientContext`는 역할이 다르다.

`noteScope`는 backend 검증과 thread/documentGroup scoping을 위한 metadata다. 현재 chat message 전송 시 `noteScope.documentGroupId`가 thread의 `documentGroupId`와 다르면 요청을 거부한다. 이 값은 AI prompt의 주요 context source로 쓰지 않는다.

`clientContext`는 프론트가 현재 작업에 필요하다고 판단한 실제 노트 텍스트 bundle이다. 사용자 message와 분리되어 전송되며, backend는 이 값이 있으면 RAG retrieval보다 우선해 prompt에 넣는다.

현재 `clientContext` shape:

```json
{
  "mode": "SELECTION",
  "source": "RIGHT_SIDEBAR",
  "items": [
    {
      "type": "SELECTION",
      "noteId": "note-1",
      "documentGroupId": "default",
      "text": "선택된 노트 텍스트",
      "truncated": false,
      "metadata": {
        "sourceRange": {
          "from": 0,
          "to": 120
        }
      }
    }
  ]
}
```

`mode`는 context 선택 방식이다.

- `SELECTION`: 사용자가 선택한 텍스트 중심
- `AROUND_CURSOR`: 커서 앞뒤 문맥 중심
- `FULL_NOTE`: 전체 노트 요청
- `NOTE_EXCERPT`: 노트 일부 발췌
- `NONE`: 명시 context 없음

`source`는 요청 표면이다.

- `RIGHT_SIDEBAR`: 노트 우측 사이드바 chat
- `EDITOR_INLINE`: 편집기 inline AI
- `WORKSPACE_CHAT`: workspace-level 작성 chat

`items[].type`은 context 조각의 의미다.

- `NOTE_TITLE`
- `NOTE_TEXT`
- `SELECTION`
- `CONTEXT_BEFORE`
- `CONTEXT_AFTER`

## Frontend Module Responsibilities

`../../brainx-next/lib/ai-context/`는 context 선택과 정규화 정책을 한곳에 둔다.

- `types.ts`: `AiTaskType`, `AiSurface`, `AiContextBundle`, `AiContextItem` 타입 정의
- `budgets.ts`: 작업별 문자 budget 상수
- `note-context.ts`: HTML/Markdown note content를 AI 입력용 markdown-like text로 정규화하고 길이 제한 metadata를 만든다
- `builders.ts`: 작업별 context bundle을 만든다

프론트는 request 직전에 builder를 호출한다. context는 서버에 저장된 projection에서 자동으로 가져오지 않고, 현재 화면 상태의 노트 content, selection, cursor range를 기준으로 생성한다.

## Current Task Policies

현재 budget은 `../../brainx-next/lib/ai-context/budgets.ts`에 있다.

| Task | Context policy |
| --- | --- |
| `note.ask` | 현재 노트 제목 + 노트 본문 발췌 최대 `6000`자 |
| `note.summarize.selection` | 제목 + 선택 텍스트 최대 `6000`자 |
| `note.summarize.full` | 노트 전체를 최대 `16000`자로 앞/중간/뒤 sampling |
| `note.explain.selection` | 선택 텍스트 최대 `6000`자 + 앞뒤 각 `800`자 |
| `editor.rewrite` | 선택 markdown-like 텍스트 최대 `6000`자 + 앞뒤 각 `1000`자 |
| `editor.continue` | 커서 앞뒤 각 `1000`자 |
| `editor.draft` | 커서 앞뒤 각 `1000`자를 문체/흐름 참고용으로 포함하고, 작성 주제와 목표 글자수는 별도 request field로 보낸다 |
| `workspace.compose` | 사용자가 붙인 선택/노트가 있으면 포함하고, 없으면 `NONE` |

길이가 초과되면 item에 `truncated: true`와 `metadata.sourceRange` 또는 `metadata.sourceRanges`를 남긴다. 이 metadata는 AI prompt 품질 분석과 디버깅용이며, 현재 backend authorization 판단에는 쓰지 않는다.

## Right Sidebar Chat Flow

`RightSidebar`의 일반 질문은 현재 다음 순서로 동작한다.

1. 노트별 chat thread id를 frontend ref에 보관한다.
2. thread가 없으면 `POST /api/intelligence/ai/chat-threads`로 생성한다.
3. 사용자 입력을 `message`로 보내고, `buildNoteAiContext({ task: "note.ask" })` 결과를 `clientContext`로 포함한다.
4. browser는 same-origin `/api/intelligence/...`만 호출한다.
5. Next route handler가 Intelligence Service `http://localhost:8086/api/v1/...`로 proxy한다.
6. backend는 `clientContext`를 prompt에 넣고 SSE `delta`/`done`을 반환한다.

선택 영역 요약도 같은 chat SSE를 사용한다. 기존 `inline-assists` 요약 호출이 아니라, `buildNoteAiContext({ task: "note.summarize.selection" })`로 선택 영역 context를 만들고 우측 chat 응답으로 표시한다.

예시의 `"default"`는 local fixture다. 실제 연동에서는 활성 Workspace의 `documentGroupId`를 전달해야 하며, backend가 누락된 group을 `default`로 대체한다고 가정하지 않는다.

## Editor Inline Assist Flow

편집기 inline AI는 계속 `POST /api/intelligence/ai/inline-assists`를 사용한다. 기존 `selectedText`, `contextBefore`, `contextAfter`, `action`, `language` shape에 더해, `DRAFT` action은 `draftPrompt`, `targetLength`를 보낸다.

다만 payload 생성은 `buildInlineAssistContext()`를 통과한다.

- `REWRITE`: ProseMirror selection을 markdown-like text로 직렬화한 뒤 선택/앞뒤 문맥 budget을 적용한다.
- `CONTINUE`: 선택 텍스트 없이 커서 앞뒤 markdown-like 문맥만 보낸다.
- `DRAFT`: 우측 인라인 AI 패널의 작성 요청을 현재 active editor 커서 위치로 라우팅하고, 커서 앞뒤 문맥과 `draftPrompt`, `targetLength`를 보낸다. 응답 delta는 임시 plain text로 즉시 삽입하고 완료 시 markdown HTML로 정규화한다.

`inline-assists`는 chat thread를 만들지 않고, suggestion 수락/거절은 기존 `POST /api/intelligence/ai/suggestions/{suggestionId}/decision`로 기록한다.

### Inline Assist Quality CLI

작성 보조 LLM 품질은 public REST 계약을 바꾸지 않고 dev-only CLI로 확인한다.

```powershell
uv run --no-project python scripts\capture_inline_assist_cli.py --run-name 20260626-inline-assist-quality
```

이 script는 `SUMMARIZE`, `REWRITE`, `CONTINUE`, `TRANSLATE` 기본 scenario를 `InlineAssistApplicationRunner`에 JSONL로 전달한다. 결과는 `build/inline-assist-captures/<run-id>/`에 저장되며, `text` nonblank, markdown fence 금지, 설명성 prefix 금지, action mismatch 여부를 검증한다. 실제 provider 품질 gate이므로 Gradle `check`에는 묶지 않는다.

## Backend Behavior

`ChatController`는 `clientContext` request object를 `Map<String, Object>`로 변환해 use case command에 넘긴다. `ChatMessage`와 `ChatMessageJpaEntity`는 `clientContext`를 JSON map으로 저장한다.

`ChatService`는 message 전송 시 다음 순서로 prompt를 만든다.

1. thread와 `noteScope.documentGroupId`를 검증한다.
2. user message를 저장한다.
3. `clientContext.items`에 text가 있으면 `Frontend selected context` prompt section을 만든다.
4. `clientContext`가 있으면 `NoteChunkRetrievalPort` 검색을 건너뛴다.
5. `clientContext`가 없으면 기존 RAG retrieval을 수행한다.
6. context 없이 RAG 결과도 없으면 LLM 호출 없이 no-context 답변을 저장한다.

즉 프론트가 `clientContext`를 보낸 요청은 “프론트 선택 context 우선” 경로다. backend는 이 텍스트를 사용자 입력 context로 취급하고, 실제 접근 권한은 thread/documentGroup/note scope 검증과 앞으로 붙을 Workspace 권한 검증에서 처리해야 한다.

## Operational Notes

- `clientContext`는 public contract 변경이므로 SSOT 변경 후 local slice와 frontend generated type을 갱신해야 한다.
- 운영 DB의 `intelligence_chat_messages.client_context` 컬럼과 기존 row `{}` backfill은 Flyway migration으로 적용한다.
- `brainx-next` dev server는 browser에서 8086을 직접 호출하지 않는다. `/api/intelligence/...` Next route handler가 server-side proxy 역할을 한다.
- Intelligence Service를 새로 수정한 뒤에는 8086 dev server를 재시작해야 한다. stale backend가 떠 있으면 frontend가 `clientContext`를 보내도 실행 중인 backend가 이를 반영하지 못해 message SSE가 실패할 수 있다.

## Known Limitations

- `note.ask`의 “관련 구간”은 아직 semantic section 탐지가 아니라 현재 노트 본문 발췌다.
- `RightSidebar`의 `AI 연결 제안` 카드는 아직 `MOCK_CONTEXT_DATA` 기반 UI이며, 이 context 관리 모듈과 직접 연결되어 있지 않다.
- 프론트에는 별도 unit test runner가 없어서 현재 검증은 `npm run typecheck`와 backend binding/prompt tests 중심이다.
- `clientContext.metadata`는 prompt에는 직접 넣지 않는다. 디버깅/분석 정보로 저장되는 형태다.

## Troubleshooting

우측 사이드바 chat에서 “요청 처리에 실패했습니다.”가 보이면 다음을 확인한다.

1. `http://localhost:3000/api/intelligence/ai/models`가 200인지 확인한다.
2. `http://localhost:8086/api/v1/ai/models`가 200인지 확인한다.
3. `POST /api/intelligence/ai/chat-threads`가 201인지 확인한다.
4. message SSE가 500이면 8086 Intelligence Service가 최신 코드로 재시작됐는지 확인한다.
5. 최신 backend라면 `clientContext`가 thread detail response의 user message에 저장되는지 확인한다.

stale backend의 대표 증상은 user message만 저장되고 assistant message가 없으며, thread detail response의 user message에 `clientContext` 필드가 없는 것이다.
