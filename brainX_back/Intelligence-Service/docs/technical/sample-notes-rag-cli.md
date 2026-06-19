# sample_notes RAG CLI

`sample_notes/*.md`를 Workspace snapshot으로 받은 노트처럼 색인하고, 로컬 CLI에서 텍스트 질의를 실행해 RAG 검색 품질을 확인하는 개발 전용 흐름이다. Public REST/OpenAPI 계약에는 포함하지 않는다.

## 동작 흐름

1. `brainx.dev.sample-rag.enabled=true`일 때만 `SampleRagApplicationRunner`가 실행된다.
2. `ingest`는 `sample_notes` markdown 파일을 읽어 stable `noteId`, `title`, `markdownHash`, `version=1` snapshot으로 변환한다.
3. 변환된 snapshot은 `intelligence_note_projections` read model에 저장되고, `MarkdownNoteChunker`로 chunking된 뒤 Qdrant `VectorStore`에 저장된다.
4. `ask`는 query text를 `NoteChunkRetrievalPort`로 검색해 note-level dedupe 전 chunk hit를 받는다.
5. `ChatClient`가 있으면 `AiChatPort.generate(...)`로 `gpt-5.4-mini` 답변을 생성하고, 없으면 retrieval-only JSON을 반환한다.

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

## 구현 기준

- public `POST /api/v1/intelligence/semantic-search`는 note 단위 dedupe를 유지한다.
- RAG CLI는 `NoteChunkRetrievalPort`를 통해 dedupe 전 chunk hit를 사용한다.
- prompt는 제공된 context만 근거로 답하도록 제한한다.
- 테스트는 Qdrant, Voyage, OpenAI 없이 fake port로 수행한다.
