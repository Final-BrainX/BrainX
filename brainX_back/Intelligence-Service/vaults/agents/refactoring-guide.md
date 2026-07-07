# Intelligence-Service Refactoring Guide

## Purpose

이 문서는 `Intelligence-Service`의 큰 usecase/service 클래스를 구조적으로 나눌 때 따르는 agent-facing 가이드입니다. 공개 REST/OpenAPI wire shape, AsyncAPI 이벤트, env 변수, 프론트 계약을 유지하는 behavior-preserving refactor를 기본값으로 둡니다.

## Package Boundary

- 기능 package 경계를 우선합니다: `chat`, `agent`, `connection`, `autolink`, `clustering`, `insight`, `organization`, `assist`, `settings`, `exploration`.
- `domain`은 순수 domain model/rule만 둡니다. Spring, JPA, HTTP client, JSON mapper 의존성을 넣지 않습니다.
- `application/usecase`는 public usecase facade와 package-private collaborator를 둡니다.
- outbound adapter, JPA entity/repository, security/web infrastructure는 `infrastructure` 아래에 둡니다.
- feature 간 공통화는 명확한 중복이 있을 때만 `shared.application` 또는 더 좁은 공통 analysis package로 올립니다.

## Collaborator Naming

- 외부 provider HTTP 호출: `*Adapter`
- request payload 생성: `*RequestFactory`
- provider/domain response 변환: `*ResponseMapper` 또는 `*ResultMapper`
- LLM JSON 파싱: `*ResponseParser`, `*JsonParser`, `*PlanParser`
- quota/entitlement gate: `*EntitlementGuard`
- prompt 생성: `*PromptBuilder`
- job latest/source snapshot 계산: `*Projection`, `*Snapshot`, `*LatestStateResolver`

## Forbidden Dependencies

- `application` package에서 `..infrastructure..`, JPA repository/entity, servlet API, concrete HTTP client에 의존하지 않습니다.
- `domain` package에서 Spring, JPA, Jackson, HTTP, provider SDK에 의존하지 않습니다.
- public REST DTO와 provider DTO를 domain model처럼 재사용하지 않습니다.
- refactor 중 DB table/column/index/Flyway migration을 만들지 않습니다. 필요해지면 리팩토링 작업을 멈추고 별도 결정으로 분리합니다.

## Behavior-Preserving Rules

- public OpenAPI, local OpenAPI slice, AsyncAPI, generated frontend contract를 바꾸지 않습니다.
- env var 이름, default 값, provider feature id, SSE event name/field는 유지합니다.
- 기존 review 대응 동작을 보존합니다. 특히 chat web search는 `RAG_CHAT` entitlement 이후에만 호출하고, provider unavailable 안내는 draft-save 가능한 route로 노출하지 않습니다.
- AutoLink public link suggestion은 `LLM_ONLY` source-only 흐름을 유지하고, anchor mapping 계약을 바꾸지 않습니다.
- parser/factory/mapper extraction은 입력과 출력의 순서, null 처리, fallback status를 바꾸지 않는 작은 이동으로 수행합니다.
- 대형 service를 줄일 때는 orchestration facade를 먼저 남기고, payload creation, JSON parsing, mapping, guard, validation policy를 순서대로 뺍니다.

## Verification Bundle

- 리팩토링 범위의 targeted test를 먼저 실행합니다.
- 큰 package 경계 이동 뒤에는 `.\gradlew.bat --no-daemon clean check --console=plain`을 실행합니다.
- 계약 파일을 바꾸지 않았다면 OpenAPI/AsyncAPI extraction은 실행하지 않고 worklog에 생략 사유를 남깁니다.
- `git diff --check`와 `vaults/workflows/verification.md`의 documentation stale-path search를 실행합니다.
