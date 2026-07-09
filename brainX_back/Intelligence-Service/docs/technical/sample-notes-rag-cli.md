# sample_notes RAG CLI

`sample_notes/*.md`를 Workspace snapshot으로 받은 노트처럼 색인하고, 로컬 CLI에서 텍스트 질의를 실행해 RAG 검색 품질을 확인하는 개발 전용 흐름이다. Public REST/OpenAPI 계약에는 포함하지 않는다.

## 개발용 빠른 시작

개발자가 RAG CLI 실행 정보나 이전 capture 결과가 필요하면 이 문서를 먼저 읽는다.

- 단일 질의 실행은 아래 `실행 예시`의 Gradle `bootRun` command를 사용한다.
- 여러 질의의 retrieval 출력과 기본 품질 기준을 확인하려면 `scripts/capture_sample_rag_retrieval.py`를 사용한다.
- 챗봇 답변까지 포함하려면 `scripts/capture_sample_rag_chat.py`를 사용한다.
- 공통 실행기는 `scripts/capture_sample_rag_outputs.py`이며 `--answer-mode retrieval|chat`을 지원한다.
- capture script는 JSON scenario의 expected context, min score, usage feature, answer text 조건을 검증하고 실패 시 exit code `1`을 반환한다.
- 기본 출력 위치는 `build/rag-captures/<run-id>/`이다.
- 실행 요약은 `summary.json`, 질의별 응답은 `responses.jsonl`, 사람이 읽는 chunk/metadata report는 `chunks.md`, 원본 출력은 `raw/*.stdout.txt`와 `raw/*.stderr.txt`에서 확인한다.
- 본 채팅 라우터와 route별 prompt를 확인하려면 아래 `본 채팅 라우터 CLI`의 `brainx.dev.chat-router.*` 설정이나 `scripts/capture_chat_router_cli.py`를 사용한다.
- Windows `bootRun` stdout 한글 깨짐을 막기 위해 capture script는 child process에 `JAVA_TOOL_OPTIONS=-Dfile.encoding=UTF-8 -Dsun.stdout.encoding=UTF-8 -Dsun.stderr.encoding=UTF-8`을 자동으로 추가한다.
- 디코딩 문제가 의심되면 `raw/*.stdout.bin`과 `raw/*.stderr.bin`의 원본 byte를 우선 확인한다.
- secret 값은 `.brainx-local.properties` 또는 환경변수에만 둔다. 문서, worklog, capture 결과에 secret을 쓰지 않는다.

## 동작 흐름

1. `brainx.dev.sample-rag.enabled=true`일 때만 `SampleRagApplicationRunner`가 실행된다.
2. `ingest`는 `sample_notes` markdown 파일을 읽어 stable `noteId`, `title`, `markdownHash`, `version=1` snapshot으로 변환한다. `title`은 frontmatter `title`, H1, filename 순서로 정한다.
3. 변환된 snapshot은 `intelligence_note_projections` read model에 저장되고, `MarkdownNoteChunker`로 chunking된 뒤 BrainX Qdrant adapter가 직접 embedding/upsert한다. sample file의 `relativePath`와 filename은 chunk metadata의 `sourcePath`, `sourceFilename`으로 저장한다.
4. ingest/search는 같은 `documentGroupId` 안에서만 동작한다. 기본값은 `default`이고 `brainx.dev.sample-rag.document-group-id` 또는 `BRAINX_DEV_SAMPLE_RAG_DOCUMENT_GROUP_ID`로 바꾼다.
5. `ask`는 query text를 `NoteChunkRetrievalPort`로 검색해 note-level dedupe 전 chunk hit를 받는다.
6. RAG context에는 기본적으로 `score >= 0.35`인 chunk만 넣고, 같은 `noteId`는 최대 2개 chunk까지만 넣는다. 최종 context가 비면 LLM을 호출하지 않고 관련 chunk 없음으로 응답한다.
7. `ChatClient`가 있으면 `AiChatPort.generate(...)`로 `gpt-5.4-mini` 답변을 생성하고, 없으면 retrieval-only JSON을 반환한다.
8. `ask` 실행 중 발생한 provider usage record는 CLI JSON의 `usageRecords[]`에 포함된다. retrieval 단계의 query embedding은 `note-search-query-embedding`, LLM 답변 생성은 `sample-rag-chat` feature로 기록된다.
9. `answerMode=llm`이면 chat response의 token usage를 `TokenUsagePort`로 기록하고, model catalog 단가가 있으면 estimated cost를 채운다. 같은 LLM 요약은 CLI JSON의 `tokenUsage`에도 포함된다. `answerMode=retrieval`은 provider chat 호출이 없으므로 `tokenUsage=null`이지만, 검색 query embedding usage/cost는 `usageRecords[]`에서 확인한다.

`local` profile은 sample RAG 기본 chat model인 `gpt-5.4-mini`와 Voyage embedding model 단가 seed를 `ai_models` catalog에 적재한다. 단, CLI의 실제 chat/embedding model 선택은 DB catalog가 아니라 runtime 설정이 결정한다. chat usage cost는 `brainx.dev.sample-rag.chat-model`에 해당하는 catalog row가 있을 때 계산되고, embedding usage cost는 `VOYAGE_EMBEDDING_MODEL`에 해당하는 catalog row가 있을 때 계산된다.

## 로컬 설정

`.brainx-local.properties`는 git ignore 대상이며 `local` profile에서만 optional import된다. secret 값은 문서나 worklog에 기록하지 않는다.

필수 설정:

```properties
SPRING_AI_MODEL_CHAT=openai
OPENAI_API_KEY=<runtime secret>
OPENAI_CHAT_MODEL=gpt-5.4-mini
BRAINX_AI_EMBEDDING_PROVIDER=voyage
VOYAGE_API_KEY=<runtime secret>
QDRANT_COLLECTION=brainx_note_search_voyage_1024
BRAINX_DEV_SAMPLE_RAG_DOCUMENT_GROUP_ID=default
```

Qdrant는 로컬에서 먼저 실행한다.

```powershell
docker compose up -d qdrant
```

## 실행 예시

색인만 실행:

```powershell
.\gradlew.bat --no-daemon bootRun --args="--spring.profiles.active=local --brainx.dev.sample-rag.enabled=true --brainx.dev.sample-rag.command=ingest"
```

색인 후 단일 질의 실행:

```powershell
.\gradlew.bat --no-daemon bootRun --args="--spring.profiles.active=local --brainx.dev.sample-rag.enabled=true --brainx.dev.sample-rag.command=ingest-and-ask --brainx.dev.sample-rag.query='노트 저장 후 인덱싱 흐름은?'"
```

interactive 질의:

```powershell
.\gradlew.bat --no-daemon bootRun --args="--spring.profiles.active=local --brainx.dev.sample-rag.enabled=true --brainx.dev.sample-rag.command=ask"
```

`ask`는 JSON을 출력한다. `answerMode=llm`이면 OpenAI chat 응답이고, `answerMode=retrieval`이면 ChatClient 없이 검색 근거만 반환한 것이다.

LLM 답변과 embedding의 usage/cost 기록 정책은 `docs/technical/ai-model-pricing-and-usage.md`를 따른다. retrieval 단계의 query embedding은 `note-search-query-embedding`, ingest 단계의 document embedding은 `note-search-index-embedding` feature로 기록된다.

`documentGroupId`를 바꾸면 기존 group의 Qdrant point와 projection을 다시 쓰지 않는다. 새 group으로 검색하려면 같은 group 설정으로 ingest를 다시 실행해야 한다. 기존 collection에 `documentGroupId` payload가 없는 오래된 point는 group filter 때문에 검색되지 않을 수 있으므로 재ingest를 권장한다.

## 출력 Capture Script

`scripts/capture_sample_rag_outputs.py`는 기존 RAG CLI의 `ask` command를 한 번 실행하고, 여러 query를 stdin으로 넣어 질의별 출력을 파일로 남기는 개발용 helper다. 기존 Java/Spring 구현을 수정하지 않는다.

반복 실행 비용을 줄이기 위해 script는 `bootJar`를 한 번 빌드한 뒤 `PropertiesLauncher`로 jar를 실행한다. `local` profile의 H2 driver는 bootJar에 포함되지 않으므로 Gradle cache의 H2 jar를 `loader.path`에 붙인다. 여러 query는 동일한 `ask` session에서 처리한다.

Java process stdout/stderr를 UTF-8로 강제해 Windows에서 CP949 byte가 UTF-8로 오해되는 문제를 피한다.

retrieval-only 기본 질의 세트 실행:

```powershell
uv run --no-project python scripts\capture_sample_rag_retrieval.py
```

chat/LLM 답변 포함 기본 질의 세트 실행:

```powershell
uv run --no-project python scripts\capture_sample_rag_chat.py
```

공통 실행기에서 mode 직접 지정:

```powershell
uv run --no-project python scripts\capture_sample_rag_outputs.py --answer-mode retrieval
uv run --no-project python scripts\capture_sample_rag_outputs.py --answer-mode chat
```

직접 질의 지정:

```powershell
uv run --no-project python scripts\capture_sample_rag_retrieval.py "RAG 채팅 메시지 전송 API는?" "토큰 사용량 이벤트는?"
```

질의 파일 사용: 아래 JSON을 `queries.json`으로 저장한 뒤 실행한다.

```powershell
uv run --no-project python scripts\capture_sample_rag_retrieval.py --queries-file .\queries.json
```

JSON scenario file을 사용하면 질의별 품질 기준을 함께 지정할 수 있다.

```json
[
  {
    "query": "AI 기능 토큰 사용량은 어떤 이벤트로 Commerce에 기록돼?",
    "minContextCount": 1,
    "minTopScore": 0.35,
    "requiredUsageFeatureIds": ["note-search-query-embedding"],
    "expectedContextTitles": ["토큰", "AI"]
  }
]
```

지원 필드는 `expectedContextTitles`, `expectedContextFilenames`, `forbiddenContextTitles`, `minContextCount`, `minTopScore`, `requiredUsageFeatureIds`, `answerMustContain`, `answerMustNotContain`이다. 필드가 없는 scenario는 capture-only로 기록된다.

이미 색인이 되어 있으면 ingest를 건너뛸 수 있다.

```powershell
uv run --no-project python scripts\capture_sample_rag_retrieval.py --skip-build --skip-ingest
```

주요 option:

| option | 기본값 | 의미 |
| --- | --- | --- |
| `--out-dir` | `build/rag-captures` | capture run을 저장할 상위 디렉터리 |
| `--run-name` | 현재 시각 기반 `YYYYMMDD-HHMMSS` | run directory 이름 |
| `--answer-mode` | `retrieval` | `retrieval`은 ChatModel을 끄고 context만 저장, `chat`은 LLM 답변까지 생성 |
| `--profile` | `local` | Spring profile |
| `--sample-dir` | `sample_notes` | 색인할 sample note directory |
| `--top-k` | `8` | RAG context 검색 개수 |
| `--max-context-chars` | `8000` | RAG prompt에 넣을 최대 context 문자 수 |
| `--chat-model` | 빈 값 | chat mode에서 RAG CLI chat model override |
| `--skip-build` | `false` | 기존 `build/libs/*.jar`를 재사용 |
| `--skip-ingest` | `false` | 기존 Qdrant 색인을 재사용 |
| `--timeout-seconds` | `300` | build, ingest, ask session 각각의 timeout |

RAG context 필터 기본값은 Spring property/env로 조정한다. `brainx.dev.sample-rag.min-score`는 기본 `0.35`, `brainx.dev.sample-rag.max-chunks-per-note`는 기본 `2`다. 환경변수는 각각 `BRAINX_DEV_SAMPLE_RAG_MIN_SCORE`, `BRAINX_DEV_SAMPLE_RAG_MAX_CHUNKS_PER_NOTE`를 사용한다.

## 본 채팅 라우터 CLI

`ChatRouterApplicationRunner`는 sample notes 기반 색인 결과를 사용해 실제 `ChatService` 흐름을 실행하는 개발 전용 CLI다. public REST/OpenAPI 계약에는 포함하지 않는다.

색인 후 단일 질의 실행:

```powershell
.\gradlew.bat --no-daemon bootRun --args="--spring.profiles.active=local --brainx.dev.chat-router.enabled=true --brainx.dev.chat-router.command=ingest-and-ask --brainx.dev.chat-router.query='내 노트 전체에서 인증 관련 내용을 찾아줘'"
```

이미 색인이 되어 있으면 `ask`만 실행한다.

```powershell
.\gradlew.bat --no-daemon bootRun --args="--spring.profiles.active=local --brainx.dev.chat-router.enabled=true --brainx.dev.chat-router.command=ask --brainx.dev.chat-router.query='블로그 초안을 써줘'"
```

interactive 실행:

```powershell
.\gradlew.bat --no-daemon bootRun --args="--spring.profiles.active=local --brainx.dev.chat-router.enabled=true --brainx.dev.chat-router.command=ask"
```

기본 5개 route 시나리오를 capture하고 expected route를 검증:

```powershell
uv run --no-project python scripts\capture_chat_router_cli.py --run-name 20260625-chat-router
```

이 script는 실행 전 `.brainx-local.properties`, OpenAI/Voyage/Qdrant 설정, Qdrant gRPC `localhost:6334` 연결 가능 여부를 preflight로 확인한다. 실패하면 provider 호출 없이 `build/chat-router-captures/<run-id>/summary.json`과 `report.md`에 실패 이유를 기록하고 exit code `2`로 종료한다. route, citation, event, answer 기준이 실패하면 exit code `1`을 반환한다.

성공 시 결과 파일:

| file | 의미 |
| --- | --- |
| `summary.json` | preflight, build, ingest/ask session, route별 compact result |
| `responses.jsonl` | 질의별 full response와 acceptance failure |
| `report.md` | route actual/expected, answer preview, citation count, stderr path |
| `raw/*.stdout.txt`, `raw/*.stderr.txt` | Java process 원본 출력 |

JSON 출력 주요 field:

| field | 의미 |
| --- | --- |
| `query` | 실행한 사용자 질의 |
| `routerModel` | route classifier model. 기본값은 `gpt-5.4-nano` |
| `route` | `NOTE_QA`, `WORKSPACE_SEARCH`, `COMPOSE`, `NOTE_ACTION`, `OUT_OF_SCOPE` 중 하나 |
| `routeReason` | classifier가 반환한 route 사유 |
| `answer` | route별 prompt로 생성된 답변 또는 고정 차단 안내 |
| `citations` | assistant message에 저장된 note citation 목록 |
| `events` | SSE event stream을 JSON으로 펼친 값. 첫 event는 `route`다 |

JSON scenario file에서는 `expectedRoute`, `minCitationCount`, `requiredEventNames`, `answerMustContain`, `answerMustNotContain`, `allowCitations`, `requireCitationTitles`, `forbiddenCitationTitles`를 지정할 수 있다. 기본 rule은 `NOTE_QA`/`WORKSPACE_SEARCH` citation 필수, `OUT_OF_SCOPE` citation 금지와 guard 문구 필수, 모든 route의 첫 event `route` 확인이다.

### Capture 결과 읽기

`summary.json`은 전체 실행 상태와 각 질의의 compact summary를 담는다.

- `ingest`: ingest command 결과
- `runs[]`: 질의별 실행 summary
- `runs[].query`: 실행한 질의
- `runs[].status`: `completed`, `completed_without_json`, `failed`
- `runs[].answerMode`: `llm` 또는 `retrieval`
- `runs[].model`: CLI 응답에 기록된 model
- `runs[].tokenUsage`: LLM token/cost 요약. retrieval-only이면 `null`
- `runs[].usageRecords[]`: 실행 중 기록된 provider usage/cost 요약. retrieval-only에서도 query embedding usage가 있으면 포함됨
- `runs[].contextCount`: 응답 context 개수
- `runs[].stdoutPath`, `runs[].stderrPath`: 원본 출력 파일
- `runs[].stdoutBytesPath`, `runs[].stderrBytesPath`: 디코딩 전 원본 byte 파일
- `chunkReportPath`: 질의별 chunk와 metadata를 펼친 Markdown report

`responses.jsonl`은 질의별 full record를 한 줄 JSON으로 저장한다. 각 record의 `response`가 RAG CLI가 출력한 JSON이며, 주요 field는 다음과 같다.

- `response.query`
- `response.answerMode`
- `response.model`
- `response.answer`
- `response.tokenUsage`: LLM 호출이 있었을 때의 token/cost 요약. retrieval-only이면 `null`
- `response.tokenUsage.inputTokens`, `cachedInputTokens`, `billableInputTokens`
- `response.tokenUsage.outputTokens`, `reasoningTokens`, `totalTokens`
- `response.tokenUsage.costEstimate.inputCost`, `cachedInputCost`, `outputCost`, `totalCost`, `currencyCode`
- `response.usageRecords[]`: query embedding과 chat generation 등 실행 중 기록된 usage record 목록
- `response.usageRecords[].featureId`: `note-search-query-embedding`, `sample-rag-chat` 등 usage feature
- `response.usageRecords[].model`: usage가 발생한 provider model
- `response.usageRecords[].inputTokens`, `cachedInputTokens`, `billableInputTokens`
- `response.usageRecords[].outputTokens`, `reasoningTokens`, `totalTokens`
- `response.usageRecords[].costEstimate.inputCost`, `cachedInputCost`, `outputCost`, `totalCost`, `currencyCode`
- `response.contexts[]`
- `response.contexts[].noteId`
- `response.contexts[].documentGroupId`
- `response.contexts[].chunkId`
- `response.contexts[].chunkIndex`
- `response.contexts[].title`
- `response.contexts[].score`
- `response.contexts[].text`

`chunks.md`는 `responses.jsonl`을 사람이 읽기 쉽게 펼친 report다. 각 질의의 `answerMode`, `model`, `tokenUsage`, `usageRecords` 요약과 `response.answer`를 먼저 표시하고, 반환된 모든 context chunk를 rank 순서로 펼친다. 각 chunk의 `title`, `noteId`, `documentGroupId`, `chunkId`, `chunkIndex`, `score`, `textLength`, `text`를 함께 기록한다.

## 구현 기준

- public `POST /api/v1/intelligence/semantic-search`는 note 단위 dedupe를 유지한다.
- RAG CLI는 `NoteChunkRetrievalPort`를 통해 dedupe 전 chunk hit를 사용한다.
- prompt는 제공된 context만 근거로 답하도록 제한한다.
- 테스트는 Qdrant, Voyage, OpenAI 없이 fake port로 수행한다.
