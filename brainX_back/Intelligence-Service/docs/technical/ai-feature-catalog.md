# AI Feature Catalog

이 문서는 `Intelligence-Service`가 제공하거나 보조하는 AI/LLM 기능을 한 곳에서 찾기 위한 카탈로그다. 세부 구현 규칙은 각 기능별 기술 문서를 따르고, 공개 API shape의 최상위 기준은 `../../contracts-v2/brainx-openapi.ssot.yaml`이다.

## 기준

- 기준일: 2026-07-04
- 구현 범위: `src/main/java/com/brainx/intelligence`
- 공개 계약 slice: `src/main/resources/contracts/knowledge-intelligence.openapi.yaml`
- 생성형 LLM 호출: `AiChatPort` -> `SpringAiAdapter` -> Spring AI `ChatClient`
- embedding 호출: `AiEmbeddingPort` -> Voyage adapter 또는 configured provider
- 검색 index: Workspace note event 기반 read model/vector index. Intelligence-Service는 원본 노트를 소유하지 않는다.

## 공개 AI 기능

| 기능 | 주요 API | LLM/AI 사용 | 설명 |
| --- | --- | --- | --- |
| 시맨틱 검색 | `POST /api/v1/intelligence/semantic-search`, `POST /internal/v1/intelligence/semantic-search` | embedding + vector search | 노트 chunk vector index에서 query와 가까운 노트를 찾는다. 공개 API는 사용자 document group 기준, internal API는 service caller가 target user를 명시한다. |
| AI 채팅/RAG | `POST /api/v1/ai/chat-threads/{threadId}/messages` | streaming chat LLM + RAG retrieval | 노트 기반 질문, workspace 검색, 글 작성, 노트 적용 초안을 하나의 채팅 흐름에서 처리한다. |
| 채팅 스레드 관리 | `GET/POST/PATCH/DELETE /api/v1/ai/chat-threads...` | 일부 LLM | thread 생성 시 `initialMessage`가 있으면 짧은 제목을 LLM으로 생성한다. 목록/조회/상태 변경/삭제 자체는 LLM 호출이 아니다. |
| 인라인 어시스트 | `POST /api/v1/ai/inline-assists` | chat LLM | 노트 편집 중 선택 영역과 앞뒤 문맥을 바탕으로 요약, 재작성, 이어쓰기, 번역, 초안 작성을 수행한다. |
| AI 제안 결정 기록 | `POST /api/v1/ai/suggestions/{suggestionId}/decision` | LLM 호출 없음 | inline assist 등에서 만들어진 제안의 수락/거절/재생성 결정을 이벤트로 기록한다. |
| AI 링크 추천 | `POST /api/v1/ai/link-suggestions` | chat LLM | source note와 연결할 후보 note를 추천하고 이유/anchor 정보를 만든다. |
| 징검다리 개념 추천 | `POST /api/v1/ai/bridge-concepts` | chat LLM | 여러 source note 사이를 이어줄 개념과 필요한 wiki link 후보를 추천한다. |
| AI 클러스터링 | `POST /api/v1/ai/clusters`, `GET /api/v1/ai/clusters/latest`, `GET /api/v1/ai/clusters/{clusterJobId}` | chat LLM | note card를 기반으로 주제 cluster를 생성하고 job 결과로 저장한다. GET 계열은 저장된 결과/상태 조회다. |
| AI 인사이트 리포트 | `POST /api/v1/ai/insight-reports`, `GET /api/v1/ai/insight-reports/{reportId}` | chat LLM | note set에서 insight, knowledge gap, 추천 액션을 생성한다. GET은 저장된 report 조회다. |
| AI 폴더 정리 제안 | `POST /api/v1/ai/folder-organization-proposals` | chat LLM | note card를 보고 proposed folders와 proposed moves를 만든다. 실제 Workspace mutation은 하지 않는다. |
| AI 모델 설정 | `GET /api/v1/ai/models`, `PUT /api/v1/ai/model-settings` | LLM 호출 없음 | 사용 가능한 model catalog와 사용자별 enabled/default model 설정을 관리한다. |
| 문체 프로필 | `GET/PUT /api/v1/users/me/style-profile` | LLM 호출 없음 | 사용자의 선호 문체/도움 방식 설정을 저장한다. LLM prompt 입력으로 사용할 수 있는 설정 데이터다. |
| 노트 인덱스 상태 | `POST /api/v1/intelligence/note-index-statuses` | LLM 호출 없음 | 노트별 `searchIndexStatus`와 `availableForAiFeatures`를 반환해 프론트가 AI 추천 가능 여부를 판단하게 한다. |
| 노트 요약 조회 | `GET /api/v1/notes/{noteId}/summary` | 요청 시 LLM 호출 없음 | projection summary가 있으면 반환하고, 없으면 Workspace snapshot markdown에서 excerpt fallback을 만든다. |

## 채팅 라우팅

`/api/v1/ai/chat-threads/{threadId}/messages`는 사용자의 메시지를 먼저 route로 분류한 뒤 prompt를 다르게 만든다.

| Route | 의미 | 동작 |
| --- | --- | --- |
| `NOTE_QA` | 현재 document group 노트 기반 질문 | RAG context를 검색하고, 제공된 노트 근거 안에서 답변한다. |
| `WORKSPACE_SEARCH` | 사용자 workspace 전체 검색 의도 | `SearchScope.USER`로 검색 범위를 넓혀 답변한다. |
| `COMPOSE` | 글/초안 작성 | 노트 context가 있으면 참고하고, 없으면 일반 초안을 작성한다. 응답은 저장 가능한 markdown draft 형식이다. |
| `NOTE_ACTION` | 노트 저장/삽입/적용용 초안 | 실제 mutation 없이 적용 가능한 markdown content만 생성한다. |
| `OUT_OF_SCOPE` | 노트 검색/질문/작성 범위 밖 | 고정 안내 답변을 반환하고 LLM 답변 생성을 하지 않는다. |

라우터는 `LlmChatRouteDecider`를 사용하며 기본 모델은 `BRAINX_CHAT_ROUTER_MODEL` 또는 `gpt-5.4-nano`다. 라우터가 실패하거나 비활성화되면 rule-based fallback이 사용된다.

## 인라인 어시스트 액션

| Action | 목적 | 주요 검증 |
| --- | --- | --- |
| `SUMMARIZE` | 선택/문맥 요약 | 선택 텍스트 또는 앞뒤 문맥의 최소 길이를 요구한다. |
| `REWRITE` | 선택 영역 재작성 | 선택 영역 최소 길이를 요구하고, 앞뒤 문맥은 참고만 한다. |
| `CONTINUE` | 이어쓰기 | 앞뒤 문맥 또는 선택 텍스트를 바탕으로 이어질 내용을 생성한다. |
| `TRANSLATE` | 선택 영역 번역 | 선택 영역을 target language로 번역한다. |
| `DRAFT` | 새 초안 작성 | `draftPrompt`가 필수이며 target length는 100~3000자로 clamp된다. |

응답은 SSE delta stream이며 완료 이벤트에 `suggestionId`, `action`, `modelId`가 포함된다. 생성된 제안의 수락/거절/재생성 결정은 별도 decision API로 기록한다.

## 분석형 Job 기능

클러스터링과 인사이트 리포트는 v1에서 실제 background worker 없이 POST 요청 안에서 note card 조회, entitlement 확인, LLM 호출, 결과 저장까지 수행한 뒤 `202 Accepted`와 현재 job 상태를 반환한다.

| 기능 | 저장소 | Fresh/Stale 판단 |
| --- | --- | --- |
| AI 클러스터링 | `intelligence_cluster_jobs` | document group 전체 분석 job의 source snapshot과 현재 searchable note set을 비교한다. |
| AI 인사이트 리포트 | `intelligence_insight_reports` | report 조회는 저장 결과 기준이며, POST가 새 report 생성을 담당한다. |

두 기능 모두 raw markdown 전체 대신 note card를 LLM 입력으로 사용한다. 기본 note card 필드는 `noteId`, `title`, `tags`, `headings`, `excerpt`다.

## 연결/링크 기능

- `link-suggestions`는 source note와 candidate note들을 비교해 연결 후보를 만든다.
- `bridge-concepts`는 여러 source note 사이의 missing concept이나 wiki link 후보를 만든다.
- `NoteAutoLinkService`는 public controller에 직접 노출된 기능은 아니며 dev runner/내부 분석 흐름에서 자동 링크 후보 평가에 사용된다.
- accepted link는 Intelligence가 직접 graph DB를 수정하지 않고 Workspace link command를 통해 만들어져야 한다. graph/vector는 projection이다.

## 모델과 provider

| 영역 | 기본 설정 |
| --- | --- |
| 일반 chat LLM | `OPENAI_CHAT_MODEL`, 기본 `gpt-5.4-mini` |
| 채팅 제목 생성 | `BRAINX_CHAT_TITLE_MODEL`, 기본 `gpt-5.4-nano` |
| 채팅 라우터 | `BRAINX_CHAT_ROUTER_MODEL`, 기본 `gpt-5.4-nano` |
| 클러스터링 | `brainx.clustering.default-model`, 기본 `OPENAI_CHAT_MODEL` |
| 인사이트 | `brainx.insight.default-model`, 기본 `OPENAI_CHAT_MODEL` |
| 폴더 정리 | `brainx.organization.default-model`, 기본 `OPENAI_CHAT_MODEL` |
| 징검다리 추천 | `brainx.connection.bridge.default-model`, 기본 `OPENAI_CHAT_MODEL` |
| 자동 링크 | `brainx.note-auto-link.model`, 기본 `OPENAI_CHAT_MODEL` |
| 외부 검색 | `BRAINX_EXTERNAL_SEARCH_PROVIDER=openai`, `OPENAI_WEB_SEARCH_MODEL`, 기본 `gpt-5.5` |
| embedding | `BRAINX_AI_EMBEDDING_PROVIDER=voyage`, `VOYAGE_EMBEDDING_MODEL`, 기본 `voyage-4-lite` |

OpenAI chat은 Spring AI `ChatClient`를 통해 호출한다. OpenAI audio/image/moderation/embedding auto-configuration은 기본 application 설정에서 제외되어 있으며, embedding은 별도 `AiEmbeddingPort` 구현으로 관리한다.

## 외부 검색 상태

`ExternalSearchPort`와 OpenAI `web_search` adapter는 구현되어 있지만, 현재 공개 Knowledge Intelligence API 목록에는 독립 외부 검색 endpoint가 없다. `brainx.dev.external-search.enabled=true`일 때 dev runner로 실행할 수 있고, 향후 RAG chat router와 결합할 수 있는 확장 지점으로 남아 있다.

## Usage/Event 경계

- 생성형 기능은 entitlement 확인 후 model call 또는 job acceptance를 수행한다.
- token usage는 `TokenUsageRecordedRequested` 이벤트 또는 기능별 usage recorder를 통해 기록된다.
- 주요 이벤트:
  - `AiSuggestionCreated`
  - `AiSuggestionDecisionRecorded`
  - `ChatThreadCreated`
  - `ChatMessageCreated`
  - `ClusterJobRequested`
  - `ClusterJobCompleted`
  - `InsightReportRequested`
  - `InsightReportCompleted`
  - `SemanticSearchPerformed`
- event producer가 비활성화된 로컬 환경에서는 기능은 동작하되 이벤트 publish가 no-op일 수 있다.

## 관련 문서

- `docs/technical/rag-chat-api-frontend-integration.md`
- `docs/technical/frontend-ai-context-management.md`
- `docs/technical/inline-assist-frontend-stream-lifecycle.md`
- `docs/technical/connection-api.md`
- `docs/technical/knowledge-structure-analysis.md`
- `docs/technical/insight-reports.md`
- `docs/technical/note-auto-linking.md`
- `docs/technical/vectorstore-embedding-model.md`
- `docs/technical/external-search.md`
- `docs/technical/ai-model-pricing-and-usage.md`

## StyleProfile Prompt Mapping

`StyleProfile`은 `conversationTone`과 `writingStyle` 두 축만 사용한다. `assistanceStyle`은 적용 범위가 불명확하고 실제 prompt 적용 없이 가정만 남기는 YAGNI 부채라 제거했다.
두 축의 세부 값은 preset enum이 아니라 사용자 자유 입력 문자열이다. compiler는 이를 강한 `Mandatory user style instructions`로 변환한다. 최종 사용자-facing 문장에는 문체를 반드시 적용하되, safety/factuality/evidence limit/required output format/explicit user instruction이 충돌하면 그 지시가 우선한다. `writingStyle`도 `speechLevel`을 지원해 초안/수정/리포트 결과물의 말투를 대화형 답변 말투와 별도로 조정하며, `음슴체`는 한국어 결과물에서 음슴체 종결을 선호하도록 별도 보강한다.

| 기능/흐름 | 적용 축 | 적용 위치 | 비고 |
| --- | --- | --- | --- |
| RAG chat `NOTE_QA` | `conversationTone` | 답변 system prompt | 사용자에게 설명하는 대화 응답이다. |
| RAG chat `WORKSPACE_SEARCH` | `conversationTone` | 답변 system prompt | workspace 검색 결과를 설명하는 대화 응답이다. |
| RAG chat `COMPOSE` | `writingStyle` | draft system prompt | 사용자가 저장하거나 복사할 생성 결과물이다. |
| RAG chat `NOTE_ACTION` | `writingStyle` | note action draft system prompt | 실제 mutation 없이 적용 가능한 초안을 만든다. |
| Inline assist 전체 | `writingStyle` | inline assist system prompt | summarize, rewrite, continue, translate, draft 모두 결과물 문체를 조정한다. |
| AI link suggestions | `conversationTone` | LLM link reason 생성 prompt | 사용자가 보는 추천 이유에만 적용한다. 내부 relation verifier에는 적용하지 않는다. |
| Bridge concepts | `conversationTone` | bridge reason 생성 prompt | 추천 개념과 이유가 사용자-facing 설명이다. |
| Folder organization proposals | `conversationTone` | proposed folder/move reason 생성 prompt | 정리 제안의 이유 설명에 적용한다. |
| AI clustering | `writingStyle` | cluster summary/report 생성 prompt | cluster title, summary, keyword 결과물 문체를 조정한다. |
| Insight reports | `writingStyle` | report 생성 prompt | summary, gap, recommendation 결과물 문체를 조정한다. |
| Chat router | 적용 안 함 | 없음 | 내부 라우팅 판단이며 사용자-facing 결과물이 아니다. |
| Chat title generation | 적용 안 함 | 없음 | 짧은 thread title 생성은 별도 고정 정책을 따른다. |
| Semantic search / note index status / model settings / saved result 조회 | 적용 안 함 | 없음 | LLM 생성형 응답이 아니거나 저장된 상태 조회다. |
| External search dev runner | 적용 안 함 | 없음 | 개발 확인용 실행 흐름이다. |
