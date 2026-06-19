# Spring Boot `@ConditionalOnBean`

이 문서는 Spring Boot `@ConditionalOnBean`이 무엇인지, 언제 쓰는지, Intelligence Service의 Qdrant adapter에서는 어떤 의미인지 정리한다.

## 한 줄 정의

`@ConditionalOnBean`은 Spring application context에 특정 bean이 이미 등록되어 있을 때만 대상 `@Configuration`, `@Bean`, 또는 component를 bean으로 등록하게 하는 Spring Boot 조건 annotation이다.

공식 API 문서는 이 annotation을 "지정한 요구사항을 만족하는 bean이 `BeanFactory`에 이미 있을 때만 match되는 `@Conditional`"로 설명한다. 참고: [Spring Boot `ConditionalOnBean` API](https://docs.spring.io/spring-boot/api/java/org/springframework/boot/autoconfigure/condition/ConditionalOnBean.html).

## 왜 쓰나

선택적 infrastructure를 붙일 때 유용하다.

예를 들어 Qdrant vector store는 local/test 환경에서는 없을 수 있지만, Qdrant starter와 `VectorStore` bean이 준비된 환경에서는 실제 adapter를 사용해야 한다. 이때 `@ConditionalOnBean(VectorStore.class)`를 붙이면 `VectorStore`가 없는 환경에서는 Qdrant adapter 자체가 등록되지 않는다.

```java
@Component
@Primary
@ConditionalOnBean(VectorStore.class)
public class QdrantNoteSearchIndexAdapter implements NoteSearchIndexPort {
    // VectorStore가 있을 때만 이 adapter가 Spring bean이 된다.
}
```

이 프로젝트에서는 같은 port의 안전한 fallback으로 `NoOpNoteSearchIndexAdapter`도 둔다. 그래서 `VectorStore`가 있으면 `@Primary`인 Qdrant adapter가 선택되고, 없으면 no-op adapter가 context load를 유지한다.

## 동작 방식

- Spring이 bean definition을 등록하는 단계에서 조건을 평가한다.
- `value`, `type`, `name`, `annotation` 같은 조건을 지정할 수 있다.
- 여러 조건을 지정하면 전부 만족해야 한다.
- `@Bean` method에 붙이고 조건 값을 생략하면, 기본적으로 그 method의 return type을 조건으로 사용한다.

## 중요한 주의점

`@ConditionalOnBean`은 "지금까지 처리된 bean definition"만 볼 수 있다. 공식 문서도 이 이유 때문에 auto-configuration class에서 사용하는 것을 권장한다.

따라서 일반 `@Component`에 붙이면 bean 등록 순서에 영향을 받을 수 있다. 이 프로젝트의 Qdrant adapter에서는 다음 이유로 허용한다.

- `VectorStore`는 Spring AI auto-configuration에서 만들어지는 infrastructure bean이다.
- `test`와 `dev-ui` profile은 Qdrant auto-configuration을 명시적으로 제외한다.
- `NoOpNoteSearchIndexAdapter`가 항상 존재해 `NoteSearchIndexPort` 누락을 막는다.
- Qdrant adapter는 `@Primary`라서 `VectorStore`가 있는 환경에서만 우선 선택된다.

새로운 기능에서 같은 패턴을 쓸 때는 fallback bean 또는 명시적 auto-configuration ordering 없이 `@ConditionalOnBean`만 믿지 않는다.

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
