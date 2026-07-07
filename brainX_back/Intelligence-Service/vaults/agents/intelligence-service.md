# Intelligence Service Guide

## Source Of Truth

서비스 사양의 최상위 기준은 상위 repository의 `contracts-v2/brainx-openapi.ssot.yaml`입니다. 이 서비스 안의 `src/main/resources/contracts/knowledge-intelligence.openapi.yaml`은 해당 SSOT에서 Knowledge Intelligence producer API만 추출한 로컬 슬라이스입니다.

API path, method, status code, request/response schema, security, SSE event shape를 바꾸는 작업은 반드시 `../../contracts-v2/brainx-openapi.ssot.yaml`을 먼저 수정한 뒤 `scripts/extract_intelligence_openapi.py`로 로컬 슬라이스를 재생성합니다. 로컬 슬라이스만 직접 고치고 SSOT를 남겨 두면 안 됩니다.

계약을 다시 추출해야 할 때는 `scripts/extract_intelligence_openapi.py`를 사용합니다. 기본 source 경로는 상위 repository의 `contracts-v2/brainx-openapi.ssot.yaml`로 계산됩니다.

이 서비스가 consumer인 동기 내부 REST API는 `src/main/resources/contracts/knowledge-intelligence.consumed.openapi.yaml`, producer 또는 consumer로 참여하는 이벤트는 `src/main/resources/contracts/knowledge-intelligence.asyncapi.yaml`에서 확인합니다. 두 파일은 `scripts/extract_intelligence_related_contracts.py`로 상위 `contracts-v2`의 OpenAPI/AsyncAPI SSOT에서 재생성합니다.

## Service Boundary

Intelligence Service는 BrainX의 지식 탐색, AI 보조, AI 대화, 연결 추천, 정리 제안, 클러스터링, 인사이트 기능을 담당합니다.

이 서비스는 원본 노트, 워크스페이스 권한, 상품/플랜/과금 정책, 외부 AI provider의 실제 상태를 직접 소유하지 않습니다. 그런 정보는 내부 DB로 복제해 권한의 원천처럼 다루지 않고, 필요한 시점에 application outbound port를 통해 외부 도메인 또는 외부 provider adapter에 질의합니다.

## Architecture Rules

- 큰 usecase/service 리팩토링은 `vaults/agents/refactoring-guide.md`를 함께 읽고, public contract/DB schema/env/SSE shape를 유지하는 behavior-preserving extraction으로 진행합니다.

- 기능 단위 package를 우선합니다. 현재 기능 경계는 `settings`, `exploration`, `assist`, `chat`, `agent`, `connection`, `organization`, `clustering`, `insight`입니다.
- 각 기능은 `domain`과 `application`을 먼저 채웁니다. `domain`은 순수 도메인 모델과 규칙을 담고, Spring/JPA/OpenAPI DTO에 의존하지 않습니다.
- `application/usecase`는 사용자 의도를 처리하고, 외부 입력/출력은 `application/port/inbound`, `application/port/outbound`로 표현합니다.
- `infrastructure`는 port 구현체가 들어가는 곳입니다. JPA entity/repository, Spring AI adapter, 외부 HTTP client adapter는 여기에서만 다룹니다.
- controller, REST DTO, persistence adapter, messaging adapter는 도메인 규칙과 usecase 경계가 테스트로 드러난 뒤 추가합니다.

## External Dependency Rules

- 외부 서비스나 외부 도메인에 의존하는 기능은 application outbound port를 먼저 정의합니다.
- port의 요청/응답은 외부 API DTO가 아니라 이 서비스의 도메인 언어로 만든 query/result/policy 모델을 사용합니다.
- 실제 외부 API 스펙이 아직 없으면, 지금 모델 사용 가능 여부 처리 방식처럼 port와 Spring bean adapter 골격을 먼저 둡니다. adapter는 context load를 깨지 않는 neutral result를 반환하거나, 호출 지점에서 아직 미구현임을 명시할 수 있게 최소 구현만 둡니다.
- 외부 도메인이 source of truth인 정책은 이 서비스 DB에 임의 테이블로 만들지 않습니다. 예를 들어 권한, quota, 플랜, 외부 provider 상태, 워크스페이스 노트 원문은 각각 적절한 outbound port를 통해 조회하거나 요청합니다.
- 다른 BrainX 서비스와의 계약, 이벤트, port 경계는 `docs/technical/cross-service-integration-map.md`를 먼저 확인합니다. 문서에 없는 관계는 추측해서 adapter나 persistence 소유권으로 만들지 않습니다.
- application/domain layer에서 `WebClient`, `RestTemplate`, Spring AI client, JPA repository를 직접 사용하지 않습니다.

## Persistence And AI Rules

- 이 서비스가 소유하는 상태만 PostgreSQL/JPA로 저장합니다. 테스트 profile은 H2를 사용합니다.
- JPA entity와 repository는 `infrastructure.persistence.jpa` 아래에 두고, domain 모델로 변환하는 adapter를 통해 application port를 구현합니다.
- JPA entity, table, column, index가 바뀌면 `docs/technical/intelligence-operational-db-ddl.md`를 함께 갱신합니다. 데이터 소유권이나 파생 상태 의미가 바뀌면 `docs/domain/knowledge-intelligence-data-ownership.md`도 함께 확인합니다.
- arbitrary object 형태의 설정 값은 domain/application에서는 `Map<String, Object>`로 다루고, persistence에서는 converter 등 infrastructure 책임으로 직렬화합니다.
- AI provider 호출은 Spring AI에 직접 의존하지 않고 `AiChatPort`, `AiEmbeddingPort` 같은 outbound port를 통해 수행합니다.
- vendor 비용, BrainX 과금 안내, 사용자별 사용 가능 모델처럼 의미가 다른 값은 하나의 raw map이나 단일 숫자로 합치지 않고 별도 도메인 모델로 분리합니다.

## API Contract Rules

- 공개 API는 OpenAPI 계약의 `/api/v1` operation을 기준으로 구현합니다.
- 공개 API 계약을 변경할 때는 `../../contracts-v2/brainx-openapi.ssot.yaml`을 source of truth로 수정하고, 로컬 `src/main/resources/contracts/knowledge-intelligence.openapi.yaml`은 추출 결과로 갱신합니다.
- 성공/오류 wrapper, nullable 여부, enum 값, SSE content type, terminal event, idempotency header는 계약에서 확인합니다.
- 계약과 구현이 충돌하면 계약을 기준으로 불일치를 기록하고, 별도 요청 없이 계약을 임의 수정하지 않습니다.
- 이 guide에는 endpoint와 schema 목록을 길게 복제하지 않습니다. 세부 필드와 required 여부는 OpenAPI 파일에서 직접 확인합니다.

## Testing Rules

- 기능 개발은 domain test에서 시작하고, 도메인 규칙이 안정되면 application usecase test로 확장합니다.
- application test에서는 outbound port를 fake로 구현해 외부 서비스, AI provider, DB 없이 흐름을 검증합니다.
- persistence adapter test는 이 서비스가 소유하는 저장 구조와 domain 변환만 검증합니다.
- Spring context test는 `test` profile과 H2 기반으로 유지하고, 외부 연동 adapter skeleton 때문에 context load가 깨지지 않게 합니다.
- code, configuration, dependency, OpenAPI contract를 변경하면 `vaults/workflows/verification.md` 기준으로 Gradle 검증을 실행합니다.
