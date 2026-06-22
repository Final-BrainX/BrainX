# Spring Boot `@ConditionalOnBean`

이 문서는 Spring Boot `@ConditionalOnBean`이 무엇인지, 언제 쓰는지, Intelligence Service의 Qdrant adapter에서는 어떤 의미인지 정리한다.

## 한 줄 정의

`@ConditionalOnBean`은 Spring application context에 특정 bean이 이미 등록되어 있을 때만 대상 `@Configuration`, `@Bean`, 또는 component를 bean으로 등록하게 하는 Spring Boot 조건 annotation이다.

공식 API 문서는 이 annotation을 "지정한 요구사항을 만족하는 bean이 `BeanFactory`에 이미 있을 때만 match되는 `@Conditional`"로 설명한다. 참고: [Spring Boot `ConditionalOnBean` API](https://docs.spring.io/spring-boot/api/java/org/springframework/boot/autoconfigure/condition/ConditionalOnBean.html).

## 왜 쓰나

선택적 infrastructure를 붙일 때 유용하다.

예를 들어 Qdrant Java client는 local/test 환경에서는 꺼둘 수 있지만, `QdrantClient` bean이 준비된 환경에서는 실제 Qdrant wrapper를 등록해야 한다. 이때 wrapper를 일반 `@Component`에 두고 `@ConditionalOnBean(QdrantClient.class)`만 붙이면 bean definition 처리 순서에 따라 wrapper가 등록되지 않을 수 있다. 이 프로젝트에서는 `QdrantVectorIndexConfiguration`이 `QdrantClient`와 `QdrantVectorIndexClient`를 같은 configuration 안의 `@Bean` method로 명시 등록한다.

```java
@Bean
QdrantVectorIndexClient qdrantVectorIndexClient(
    QdrantClient qdrantClient,
    QdrantVectorIndexProperties properties
) {
    return new DefaultQdrantVectorIndexClient(qdrantClient, properties);
}
```

이 프로젝트에서는 `QdrantNoteSearchIndexAdapter`가 `ObjectProvider<QdrantVectorIndexClient>`와 `ObjectProvider<AiEmbeddingPort>`를 통해 런타임에 실제 client/provider 존재 여부를 확인한다. 둘 중 하나가 없으면 no-op 결과를 반환해 context load를 유지한다.

## 동작 방식

- Spring이 bean definition을 등록하는 단계에서 조건을 평가한다.
- `value`, `type`, `name`, `annotation` 같은 조건을 지정할 수 있다.
- 여러 조건을 지정하면 전부 만족해야 한다.
- `@Bean` method에 붙이고 조건 값을 생략하면, 기본적으로 그 method의 return type을 조건으로 사용한다.

## 중요한 주의점

`@ConditionalOnBean`은 "지금까지 처리된 bean definition"만 볼 수 있다. 공식 문서도 이 이유 때문에 auto-configuration class에서 사용하는 것을 권장한다.

따라서 일반 `@Component`에 붙이면 bean 등록 순서에 영향을 받을 수 있다. 이 프로젝트의 Qdrant wrapper에서는 다음 원칙을 따른다.

- `QdrantClient`와 `QdrantVectorIndexClient`는 `QdrantVectorIndexConfiguration`의 `@Bean` method에서 명시적으로 만든 infrastructure bean이다.
- `test`와 `dev-ui` profile은 `brainx.vector.qdrant.enabled=false`로 Qdrant client bean을 등록하지 않는다.
- `NoOpNoteSearchIndexAdapter`가 항상 존재해 `NoteSearchIndexPort` 누락을 막는다.
- `QdrantNoteSearchIndexAdapter`는 `@Primary`지만 provider/client가 없으면 mutation/search를 적용하지 않는다.

새로운 기능에서 같은 패턴을 쓸 때는 fallback bean 또는 명시적 configuration method 없이 일반 component의 `@ConditionalOnBean`만 믿지 않는다.

## RAG CLI 검색 실패 원인 분석

2026-06-22 sample RAG CLI에서 Qdrant collection에 point가 있는데도 retrieval 결과가 0개로 나오는 문제가 있었다. 표면적으로는 “Spring AI `VectorStore`를 제거하고 Qdrant Java client 직접 연동으로 바꾼 뒤 검색이 안 됨”처럼 보였지만, 직접 원인은 Spring AI 제거가 아니라 새 infrastructure bean 등록 방식이었다.

변경 의도는 클린 아키텍처와 사용량 측정 관점에서 타당했다.

- application/domain layer는 계속 `NoteSearchIndexPort`, `NoteChunkRetrievalPort`, `AiEmbeddingPort`, `TokenUsagePort`만 바라본다.
- RAG vector 경로는 Spring AI `VectorStore` convenience 대신 `AiEmbeddingPort`로 Voyage embedding을 직접 호출하고, `QdrantVectorIndexClient`로 Qdrant search/upsert를 직접 수행한다.
- 이 구조 덕분에 Voyage `usage.total_tokens`를 `note-search-query-embedding`, `note-search-index-embedding`으로 기록하고 catalog 기반 비용 추정을 붙일 수 있다.

문제가 터진 지점은 새로 도입한 `DefaultQdrantVectorIndexClient` 등록이었다. 당시 구조는 다음과 같았다.

```text
QdrantNoteSearchIndexAdapter
  -> ObjectProvider<QdrantVectorIndexClient>
  -> ObjectProvider<AiEmbeddingPort>

DefaultQdrantVectorIndexClient
  -> @Component
  -> @ConditionalOnBean(QdrantClient.class)
```

`QdrantClient` bean과 `voyageEmbeddingAdapter` bean은 실제로 등록되어 있었다. 하지만 `DefaultQdrantVectorIndexClient`는 일반 component scan 대상이면서 `@ConditionalOnBean(QdrantClient.class)`에 의존했다. `@ConditionalOnBean`은 조건 평가 시점에 이미 처리된 bean definition만 볼 수 있으므로, 같은 애플리케이션 안에 `QdrantClient` 정의가 있더라도 component scan 순서와 configuration 처리 순서에 따라 조건이 false가 될 수 있다. 그 결과 `QdrantVectorIndexClient` bean만 빠졌다.

검색 경로에서는 이 누락이 예외로 드러나지 않았다.

```java
QdrantVectorIndexClient vectorIndexClient = vectorIndexClientProvider.getIfAvailable();
AiEmbeddingPort aiEmbeddingPort = aiEmbeddingPortProvider.getIfAvailable();
if (vectorIndexClient == null || aiEmbeddingPort == null) {
    return List.of();
}
```

이 no-op fallback은 test/dev 환경에서 Qdrant 없이도 context load를 유지하기 위한 설계다. 하지만 local RAG CLI처럼 “실제 검색이 반드시 되어야 하는 실행”에서는 `QdrantVectorIndexClient` 누락이 빈 검색 결과로만 보였다. 그래서 증상은 `contextCount=0`, query embedding usage 없음, Qdrant point는 존재함처럼 나타났다.

정리하면 causal chain은 다음이다.

```text
Spring AI VectorStore 제거
  -> BrainX 직접 Qdrant wrapper 추가
  -> wrapper를 일반 @Component + @ConditionalOnBean(QdrantClient.class)로 등록
  -> bean definition 처리 순서 때문에 wrapper 조건이 false
  -> QdrantVectorIndexClient bean 미등록
  -> QdrantNoteSearchIndexAdapter의 ObjectProvider가 null 반환
  -> searchChunks()가 List.of()로 조용히 반환
  -> RAG CLI retrieval context 0개
```

수정은 `DefaultQdrantVectorIndexClient`를 component scan 조건부 등록에서 빼고, `QdrantVectorIndexConfiguration`이 `QdrantClient`와 `QdrantVectorIndexClient`를 같은 configuration 안의 `@Bean` method로 명시 등록하도록 바꾸는 방식으로 했다.

```java
@Bean
@ConditionalOnProperty(prefix = "brainx.vector.qdrant", name = "enabled", havingValue = "true", matchIfMissing = true)
QdrantVectorIndexClient qdrantVectorIndexClient(
    QdrantClient qdrantClient,
    QdrantVectorIndexProperties properties
) {
    return new DefaultQdrantVectorIndexClient(qdrantClient, properties);
}
```

이렇게 하면 `QdrantVectorIndexClient` bean 생성은 `QdrantClient` method parameter 의존성으로 표현된다. Spring은 parameter dependency를 정상적으로 해석하므로 component scan의 조건 평가 순서에 흔들리지 않는다.

## 재발 방지 기준

- port adapter가 optional dependency를 `ObjectProvider`로 받는 것은 가능하지만, local CLI처럼 실제 외부 연동을 검증하는 경로에서는 “provider 없음”과 “검색 결과 없음”을 구분해 확인한다.
- 외부 SDK wrapper bean은 일반 `@Component` + `@ConditionalOnBean` 조합보다 dedicated `@Configuration`의 `@Bean` method로 명시 등록한다.
- 같은 configuration 안에서 생성되는 infrastructure bean끼리는 `@ConditionalOnBean`보다 method parameter dependency와 `@ConditionalOnProperty`를 우선한다.
- no-op fallback은 context load 안정성을 위한 장치이지, 실제 provider smoke 검증의 성공 기준이 아니다.
- RAG CLI smoke에서는 최소한 `QdrantVectorIndexClient`, `AiEmbeddingPort`, `TokenUsagePort`가 실제 bean으로 resolve되는지와 query embedding usage가 발생했는지 함께 확인한다.

## 관련 annotation과 차이

- `@ConditionalOnMissingBean`: 특정 bean이 없을 때만 등록한다. 기본 구현/fallback bean에 자주 쓴다.
- `@ConditionalOnClass`: classpath에 특정 class가 있을 때만 등록한다. optional dependency 감지에 쓴다.
- `@ConditionalOnProperty`: 설정 값이 특정 조건을 만족할 때만 등록한다. feature flag나 profile 외 설정 토글에 적합하다.
- `@Profile`: active profile 기준으로 등록한다. local/test/dev 같은 환경 분리에 적합하다.

## Intelligence Service 기준 사용 원칙

- application/domain layer에서는 사용하지 않는다.
- infrastructure adapter나 configuration 경계에서만 사용한다.
- optional 외부 의존성이 없어도 Spring context가 떠야 하면 fallback bean을 같이 둔다.
- 같은 port 구현이 여러 개 생기면 `@Primary`, `@Qualifier`, profile, property 중 하나로 선택 규칙을 명확히 한다.
- 조건부 bean 때문에 test profile이 깨지지 않는지 `.\gradlew.bat --no-daemon test`로 확인한다.
