# Qdrant 직접 연동과 Voyage embedding

이 문서는 Intelligence Service의 RAG vector 경로에서 Spring AI `VectorStore`를 쓰지 않고, BrainX가 직접 Qdrant와 Voyage embedding을 제어하는 방식을 정리한다.

## 결정사항

RAG vector 경로는 Spring AI convenience보다 usage/cost/index 제어를 우선한다. Spring AI는 chat adapter에만 남기고, embedding/index/search 경로는 BrainX port와 infrastructure adapter가 직접 처리한다.

```text
ExplorationService / WorkspaceNoteEventHandler / SampleRagService
  -> NoteSearchIndexPort 또는 NoteChunkRetrievalPort
    -> QdrantNoteSearchIndexAdapter
      -> AiEmbeddingPort
        -> VoyageEmbeddingAdapter
        -> Voyage AI /v1/embeddings
      -> QdrantVectorIndexClient
        -> Qdrant Java client
        -> Qdrant gRPC
```

Voyage 호출은 내부 infrastructure adapter 책임이다. public `/api/v1/...` endpoint나 OpenAPI 계약에는 Voyage embedding endpoint를 노출하지 않는다.

## 기본 설정

`src/main/resources/application.yaml`의 관련 기본값은 다음과 같다.

```yaml
brainx:
  ai:
    embedding:
      provider: ${BRAINX_AI_EMBEDDING_PROVIDER:none}
      voyage:
        api-key: ${VOYAGE_API_KEY:}
        base-url: ${VOYAGE_BASE_URL:https://api.voyageai.com}
        model: ${VOYAGE_EMBEDDING_MODEL:voyage-4-lite}
        dimensions: ${VOYAGE_EMBEDDING_DIMENSIONS:1024}
        truncation: ${VOYAGE_EMBEDDING_TRUNCATION:true}
        timeout: ${VOYAGE_EMBEDDING_TIMEOUT:10s}
  vector:
    qdrant:
      enabled: ${BRAINX_VECTOR_QDRANT_ENABLED:true}
      host: ${QDRANT_HOST:localhost}
      port: ${QDRANT_GRPC_PORT:6334}
      api-key: ${QDRANT_API_KEY:}
      collection-name: ${QDRANT_COLLECTION:brainx_note_search}
      use-tls: ${QDRANT_USE_TLS:false}
      initialize-schema: ${QDRANT_INITIALIZE_SCHEMA:true}
      dimensions: ${VOYAGE_EMBEDDING_DIMENSIONS:1024}
      timeout: ${QDRANT_TIMEOUT:10s}
```

기본 embedding provider는 `none`이다. 이 상태에서는 `AiEmbeddingPort`가 등록되지 않으므로 `QdrantNoteSearchIndexAdapter`는 mutation/search를 적용하지 않고 no-op 결과를 반환한다. `test`와 `dev-ui` profile은 `brainx.vector.qdrant.enabled=false`로 외부 Qdrant 없이 context load를 유지한다.

## 로컬에서 Qdrant + Voyage 사용

Qdrant를 먼저 실행한다.

```powershell
docker compose up -d qdrant
```

애플리케이션 실행 전에 Voyage와 Qdrant 설정을 환경변수로 지정한다. 실제 API key는 공유되거나 커밋되는 파일에 저장하지 않는다.

```powershell
$env:BRAINX_AI_EMBEDDING_PROVIDER = "voyage"
$env:VOYAGE_API_KEY = "<voyage-api-key>"
$env:VOYAGE_EMBEDDING_MODEL = "voyage-4-lite"
$env:VOYAGE_EMBEDDING_DIMENSIONS = "1024"
$env:QDRANT_HOST = "localhost"
$env:QDRANT_GRPC_PORT = "6334"
$env:QDRANT_COLLECTION = "brainx_note_search_voyage_1024"
```

로컬에서 환경변수 대신 파일을 써야 하면 project root의 `.brainx-local.properties`를 사용한다. 이 파일은 `.gitignore`에 포함되어야 하며, `local` profile에서만 optional import로 읽는다.

```properties
brainx.ai.embedding.provider=voyage
brainx.ai.embedding.voyage.api-key=<voyage-api-key>
brainx.vector.qdrant.collection-name=brainx_note_search_voyage_1024
```

이후 local profile로 애플리케이션을 실행한다.

```powershell
.\gradlew.bat --no-daemon bootRun --args='--spring.profiles.active=local'
```

## 저장과 검색 정책

- document 저장: `NoteSearchDocument.chunkText`를 `AiEmbeddingPort`에 `inputType=DOCUMENT`로 전달하고, Voyage request는 `input_type=document`를 사용한다.
- query 검색: query text를 `AiEmbeddingPort`에 `inputType=QUERY`로 전달하고, Voyage request는 `input_type=query`를 사용한다.
- Qdrant point id는 `userId::documentGroupId::noteId::chunkIndex`에서 만든 deterministic UUID다.
- Qdrant payload는 기존 metadata key를 유지하고 본문은 `doc_content`에 저장한다.
- Qdrant payload에는 `documentGroupId`를 저장한다. 없거나 blank이면 `default`로 normalize한다.
- Qdrant 검색 filter는 `userId AND documentGroupId` 기준으로 사용자와 문서 그룹을 함께 격리한다.
- note 삭제/교체는 `userId + documentGroupId + noteId` filter로 기존 chunk를 삭제한 뒤 새 chunk를 upsert한다.
- Workspace가 아직 group을 보내지 않으면 모든 note는 `default` group으로 색인된다. 향후 Workspace payload나 snapshot에 `documentGroupId`가 들어오면 Intelligence-Service는 같은 경로로 즉시 group별 격리를 적용한다.

## Usage와 비용

Voyage `usage.total_tokens`가 반환되면 `TokenUsagePort`에 실제 embedding usage를 기록한다.

- ingest/document embedding: `featureId=note-search-index-embedding`
- semantic search/query embedding: `featureId=note-search-query-embedding`
- `modelId`: Voyage response/config model
- `inputTokens`, `billableInputTokens`, `totalTokens`: Voyage `usage.total_tokens`
- `outputTokens`, `cachedInputTokens`, `reasoningTokens`: `0`
- estimated cost: `ai_models` catalog의 per-1k input 단가로 계산

`ExplorationService`의 query text token estimate는 entitlement와 public response `tokenEstimate`용으로만 남긴다. ledger에는 실제 provider usage가 있는 embedding adapter 경로만 기록한다.

## 주의점

- Qdrant collection은 생성 시 vector dimension이 고정된다. 기존 collection이 다른 dimension으로 만들어졌다면 새 collection을 쓰거나 기존 collection을 삭제해야 한다.
- 기존 collection은 unnamed vector와 주요 payload key를 유지하지만, `documentGroupId` payload가 없는 point는 group filter에서 누락될 수 있다. usage/cost 기록, index 상태, group 격리를 안정화하려면 재ingest를 권장한다.
- application/domain layer에 Qdrant client, `RestClient`, provider별 DTO를 직접 주입하지 않는다.
- Qdrant Java client wrapper bean은 component scan 조건부 등록에 의존하지 않는다. `@ConditionalOnBean` 처리 순서로 `QdrantVectorIndexClient`가 누락되면 RAG CLI는 no-op 검색 결과만 받을 수 있다. 원인 분석과 등록 원칙은 `docs/technical/conditional-on-bean.md`를 참고한다.
- 제공된 API key가 채팅이나 로그에 노출된 적이 있으면 운영 사용 전에 rotation한다.
