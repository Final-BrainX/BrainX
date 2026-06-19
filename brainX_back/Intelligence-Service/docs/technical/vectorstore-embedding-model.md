# Spring AI `VectorStore` embedding model 지정

이 문서는 Intelligence Service에서 Qdrant `VectorStore`가 어떤 embedding model을 사용하는지, 로컬 실행 시 어떤 설정을 넣어야 하는지 정리한다.

## 현재 책임 분리

`exploration` semantic search는 application layer에서 embedding vector를 직접 만들지 않는다.

```text
ExplorationService
  -> NoteSearchIndexPort
    -> QdrantNoteSearchIndexAdapter
      -> Spring AI VectorStore
        -> Spring AI EmbeddingModel
        -> Qdrant
```

`QdrantNoteSearchIndexAdapter`는 `VectorStore`만 주입받는다. `EmbeddingModel`은 Spring AI Qdrant `VectorStore` auto-configuration 내부에서 사용된다.

```java
public QdrantNoteSearchIndexAdapter(VectorStore vectorStore) {
    this.vectorStore = vectorStore;
}
```

따라서 이 프로젝트 코드에서 Qdrant adapter에 embedding 구현체를 직접 넣지 않는다. 어떤 embedding provider를 쓸지는 Spring AI 설정으로 결정한다.

## 기본 설정

`src/main/resources/application.yaml`의 기본값은 다음과 같다.

```yaml
spring:
  ai:
    model:
      chat: ${SPRING_AI_MODEL_CHAT:none}
      embedding: ${SPRING_AI_MODEL_EMBEDDING:none}
    openai:
      api-key: ${OPENAI_API_KEY:}
    vectorstore:
      qdrant:
        host: ${QDRANT_HOST:localhost}
        port: ${QDRANT_GRPC_PORT:6334}
        collection-name: ${QDRANT_COLLECTION:brainx_note_search}
        content-field-name: doc_content
        use-tls: ${QDRANT_USE_TLS:false}
        initialize-schema: ${QDRANT_INITIALIZE_SCHEMA:true}
```

`SPRING_AI_MODEL_EMBEDDING` 기본값이 `none`이므로, 아무 설정 없이 실행하면 embedding model bean이 만들어지지 않는다. 그 경우 Qdrant `VectorStore` bean도 준비되지 않을 수 있고, `QdrantNoteSearchIndexAdapter`는 `@ConditionalOnBean(VectorStore.class)` 조건 때문에 등록되지 않는다. 이때는 fallback인 `NoOpNoteSearchIndexAdapter`가 사용된다.

## 로컬에서 Qdrant + OpenAI embedding 사용

Qdrant를 먼저 실행한다.

```powershell
docker compose up -d qdrant
```

애플리케이션 실행 전에 embedding model과 Qdrant 접속 정보를 환경변수로 지정한다.

```powershell
$env:SPRING_AI_MODEL_EMBEDDING = "openai"
$env:OPENAI_API_KEY = "<openai-api-key>"
$env:QDRANT_HOST = "localhost"
$env:QDRANT_GRPC_PORT = "6334"
$env:QDRANT_COLLECTION = "brainx_note_search"
```

OpenAI embedding 모델을 명시하려면 Spring AI OpenAI embedding option을 추가한다.

```powershell
$env:SPRING_AI_OPENAI_EMBEDDING_OPTIONS_MODEL = "text-embedding-3-small"
```

이후 local profile로 애플리케이션을 실행하면 Spring AI가 `EmbeddingModel`과 Qdrant `VectorStore`를 구성하고, semantic search는 Qdrant adapter를 사용한다.

```powershell
.\gradlew.bat --no-daemon bootRun --args='--spring.profiles.active=local'
```

## 설정별 의미

- `SPRING_AI_MODEL_EMBEDDING`: 어떤 embedding provider를 활성화할지 정한다. OpenAI를 쓰려면 `openai`로 둔다.
- `OPENAI_API_KEY`: OpenAI embedding API 호출에 필요한 key다.
- `SPRING_AI_OPENAI_EMBEDDING_OPTIONS_MODEL`: OpenAI embedding model 이름이다. 예: `text-embedding-3-small`.
- `QDRANT_HOST`: Qdrant host다. 로컬 docker compose 기준 `localhost`.
- `QDRANT_GRPC_PORT`: Spring AI Qdrant `VectorStore`가 사용할 gRPC port다. 로컬 compose 기준 `6334`.
- `QDRANT_COLLECTION`: Qdrant collection 이름이다.

## 코드에서 확인할 위치

- `build.gradle`: `spring-ai-starter-model-openai`, `spring-ai-starter-vector-store-qdrant` dependency를 선언한다.
- `src/main/resources/application.yaml`: embedding provider와 Qdrant 접속 설정을 환경변수로 받는다.
- `QdrantNoteSearchIndexAdapter`: `VectorStore.add(...)`, `VectorStore.similaritySearch(...)`만 호출한다.
- `ExplorationService`: query text를 `NoteSearchIndexPort`로 넘기며 embedding vector를 직접 다루지 않는다.

## 주의점

- `test`와 `dev-ui` profile은 외부 Qdrant 없이 context load가 가능해야 하므로 Qdrant auto-configuration을 제외한다.
- application/domain layer에 `EmbeddingModel`이나 provider별 설정을 직접 주입하지 않는다.
- Qdrant에 저장되는 document text는 현재 note excerpt가 우선이고, excerpt가 blank면 title을 사용한다.
- document 저장 시점의 embedding은 `VectorStore.add(...)`에서, 검색 query embedding은 `VectorStore.similaritySearch(...)`에서 Spring AI가 처리한다.
