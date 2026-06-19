# Spring AI `VectorStore` Voyage embedding 지정

이 문서는 Intelligence Service에서 Qdrant `VectorStore`가 Voyage AI embedding을 사용하는 방식과 로컬 실행 설정을 정리한다.

## 현재 책임 분리

`exploration` semantic search는 application layer에서 embedding vector를 직접 만들지 않는다.

```text
ExplorationService
  -> NoteSearchIndexPort
    -> QdrantNoteSearchIndexAdapter
      -> Spring AI VectorStore
        -> VoyageEmbeddingModel
        -> Voyage AI /v1/embeddings
        -> Qdrant
```

`QdrantNoteSearchIndexAdapter`는 `VectorStore`만 주입받는다. `VectorStore`는 Spring AI Qdrant auto-configuration이 만들고, 그 안에서 Spring AI `EmbeddingModel` bean을 사용한다. 이 프로젝트는 `BRAINX_AI_EMBEDDING_PROVIDER=voyage`일 때 자체 `VoyageEmbeddingModel`을 `@Primary EmbeddingModel` bean으로 등록한다.

Voyage 호출은 내부 infrastructure adapter 책임이다. 우리 서비스의 public `/api/v1/...` endpoint나 OpenAPI 계약에는 Voyage embedding endpoint를 노출하지 않는다.

## 기본 설정

`src/main/resources/application.yaml`의 관련 기본값은 다음과 같다.

```yaml
spring:
  ai:
    model:
      embedding: ${SPRING_AI_MODEL_EMBEDDING:none}
    vectorstore:
      qdrant:
        host: ${QDRANT_HOST:localhost}
        port: ${QDRANT_GRPC_PORT:6334}
        collection-name: ${QDRANT_COLLECTION:brainx_note_search}
        content-field-name: doc_content
        initialize-schema: ${QDRANT_INITIALIZE_SCHEMA:true}

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
```

기본값은 provider `none`이다. 이 상태에서는 Voyage `EmbeddingModel`이 등록되지 않고, Qdrant `VectorStore`도 준비되지 않을 수 있다. `VectorStore`가 없으면 `QdrantNoteSearchIndexAdapter`는 등록되지 않고 `NoOpNoteSearchIndexAdapter`가 fallback으로 사용된다.

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
spring.ai.vectorstore.qdrant.collection-name=brainx_note_search_voyage_1024
```

이후 local profile로 애플리케이션을 실행한다.

```powershell
.\gradlew.bat --no-daemon bootRun --args='--spring.profiles.active=local'
```

## 설정별 의미

- `BRAINX_AI_EMBEDDING_PROVIDER`: embedding provider 선택 값이다. Voyage를 쓰려면 `voyage`로 둔다.
- `VOYAGE_API_KEY`: Voyage API 호출에 필요한 runtime secret이다. repository에 저장하지 않는다.
- `VOYAGE_BASE_URL`: Voyage API base URL이다. 기본값은 `https://api.voyageai.com`.
- `VOYAGE_EMBEDDING_MODEL`: Voyage embedding model 이름이다. 기본값은 `voyage-4-lite`.
- `VOYAGE_EMBEDDING_DIMENSIONS`: Qdrant collection vector dimension과 맞아야 한다. 기본값은 `1024`.
- `VOYAGE_EMBEDDING_TRUNCATION`: Voyage가 초과 길이 입력을 truncate할지 정한다. 기본값은 `true`.
- `QDRANT_COLLECTION`: embedding dimension별로 분리하는 것을 권장한다. Voyage 1024차원 기본값은 `brainx_note_search_voyage_1024`를 사용한다.

## input_type 정책

Voyage는 retrieval 품질을 위해 `input_type`을 구분한다.

- document 저장: `VectorStore.add(...)` -> `VoyageEmbeddingModel.embed(List<Document>, ...)` -> `input_type=document`
- query 검색: `VectorStore.similaritySearch(...)` -> `VoyageEmbeddingModel.embed(String)` -> `input_type=query`
- 일반 `EmbeddingModel.call(EmbeddingRequest)` 호출: `input_type=null`

Voyage 공식 API는 `POST https://api.voyageai.com/v1/embeddings`를 사용하며, `input`, `model`, `input_type`, `truncation`, `output_dimension`, `output_dtype`를 request body로 받는다.

## 주의점

- Qdrant collection은 생성 시 vector dimension이 고정된다. 기존 collection이 다른 dimension으로 만들어졌다면 새 collection을 쓰거나 기존 collection을 삭제해야 한다.
- `test`와 `dev-ui` profile은 외부 Qdrant와 Voyage 없이 context load가 가능해야 하므로 기본 provider는 `none`으로 유지한다.
- application/domain layer에 `EmbeddingModel`, `RestClient`, provider별 설정을 직접 주입하지 않는다.
- 제공된 API key가 채팅이나 로그에 노출된 적이 있으면 운영 사용 전에 rotation한다.
