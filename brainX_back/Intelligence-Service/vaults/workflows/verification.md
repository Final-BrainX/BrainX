# Verification Workflow

## When To Run

- Java code, Spring configuration, Gradle dependency, OpenAPI contract, generated artifact를 변경하면 `check` 기준 Gradle 검증을 실행합니다.
- 문서만 변경한 경우에는 code test를 생략할 수 있습니다. 대신 링크, path, 라우팅 문서가 서로 맞는지 검색으로 확인합니다.

## Commands

Windows PowerShell:

```powershell
.\gradlew.bat clean check
```

Unix shell:

```sh
./gradlew clean check
```

`check`는 기본 test뿐 아니라 Java compile warning gate와 architecture rule을 함께 실행하는 최종 검증 기준입니다.

## Java Quality Gates

- `JavaCompile`은 `-Xlint:deprecation`, `-Xlint:unchecked`, `-Werror`를 사용합니다. Deprecated API, unchecked operation 같은 compiler warning은 build failure로 처리합니다.
- Architecture rule은 ArchUnit test로 관리합니다.
- `..domain..` package는 Spring, JPA, Hibernate, Servlet API에 의존하지 않습니다.
- `..application..` package는 adapter나 infrastructure package에 의존하지 않습니다.
- `*JpaEntity`, `*JpaRepository` class는 `..infrastructure.persistence.jpa..` 아래에만 둡니다.
- Spring Boot의 deprecated `@MockBean`, `@SpyBean`은 금지합니다. Spring Framework의 `@MockitoBean`, `@MockitoSpyBean` 계열을 사용합니다.

OpenAPI 계약을 변경해야 할 때는 먼저 SSOT를 수정한 뒤 로컬 추출 결과를 갱신합니다:

```powershell
uv run --no-project --with PyYAML python scripts\extract_intelligence_openapi.py
```

이 명령의 기본 source는 `../../contracts-v2/brainx-openapi.ssot.yaml`이고 output은 `src/main/resources/contracts/knowledge-intelligence.openapi.yaml`입니다. API 계약 변경 후에는 SSOT와 로컬 슬라이스가 같은 schema 변경을 포함하는지 검색으로 확인합니다.

Intelligence Service가 소비하는 내부 REST API와 관련 AsyncAPI 슬라이스를 갱신해야 할 때:

```powershell
uv run --no-project --with PyYAML python scripts\extract_intelligence_related_contracts.py
```

## Documentation Checks

문서 변경 후 최소한 다음을 확인합니다.

```powershell
rg "vaults/|docs/README.md|AGENTS.md|knowledge-intelligence.openapi.yaml|knowledge-intelligence.asyncapi.yaml|knowledge-intelligence.consumed.openapi.yaml" README.md AGENTS.md vaults docs src/main/resources/contracts/README.md
```

새 agent guide/workflow는 `vaults/INDEX.md` 또는 root guide에서, 새 human-facing 문서는 `docs/README.md` 또는 해당 domain/technical index에서 라우팅되는지 확인합니다.

## Large Refactor Bundle

큰 usecase/service 리팩토링은 다음 묶음을 기본 검증으로 사용합니다.

```powershell
.\gradlew.bat --no-daemon test --tests "*ChatServiceTest" --tests "*ChatRouteDeciderTest" --tests "*ChatControllerTest" --tests "*OpenAiExternalSearchAdapterTest" --tests "*ExternalSearchConfigurationTest" --tests "*NoteAutoLinkServiceTest" --tests "*ConnectionServiceTest" --tests "*AgentServiceTest" --tests "*ClusteringServiceTest" --tests "*InsightServiceTest" --tests "*ArchitectureTest" --console=plain
.\gradlew.bat --no-daemon clean check --console=plain
git diff --check
rg "vaults/agents/refactoring-guide.md|vaults/workflows/verification.md|AGENTS.md|knowledge-intelligence.openapi.yaml|knowledge-intelligence.asyncapi.yaml|knowledge-intelligence.consumed.openapi.yaml" README.md AGENTS.md vaults src/main/resources/contracts/README.md
```

계약 파일을 의도적으로 바꾸지 않은 리팩토링에서는 contract extraction/codegen을 실행하지 않습니다. 생략 사유는 worklog와 final response에 남깁니다.

## Reporting

Final response와 worklog에는 다음을 남깁니다.

- 실행한 검증 command
- 통과 여부
- 검증을 생략했다면 이유
- 생성하거나 수정한 주요 artifact path
