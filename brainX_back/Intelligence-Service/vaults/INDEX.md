# Context Vault Index

이 vault는 agent가 필요한 문맥만 늦게 읽기 위한 저장소입니다. 루트 `AGENTS.md`는 항상 읽는 규칙만 담고, 세부 사양과 반복 workflow는 여기서 라우팅합니다.

## Agent Guides

- `vaults/agents/intelligence-service.md`: API 계약 기준, 클린 아키텍처 package 규칙, 외부 의존성 port 처리, persistence/AI/testing 규칙을 설명합니다. API 구현, usecase 설계, 외부 연동 경계, 계약 불일치 검토에 읽습니다.
- `vaults/agents/frontend-integration.md`: 상위 `brainx-next` 위치, `/api/v1` proxy, 프론트 요구를 API 구현 범위로 연결하는 절차를 설명합니다. 화면/API client/mock을 기준으로 백엔드 작업을 정할 때 읽습니다.
- `vaults/agents/domain-implementation-order.md`: API 명세 기준 기능 구현 순서를 도메인 TODO로 정리합니다. 사용자·지식 기능의 우선순위를 정할 때 읽습니다.
- `vaults/agents/refactoring-guide.md`: 큰 usecase/service의 behavior-preserving 분할 규칙과 검증 묶음을 설명합니다. package 경계 이동이나 대형 리팩토링 전에 읽습니다.

## Workflows and Handoff

- `vaults/workflows/verification.md`: Gradle 검증과 문서 변경 검증 기준을 설명합니다. code, 설정, 계약, 문서 변경 후 final response 전에 읽습니다.
- `vaults/workflows/worklog.md`: worklog 채널과 월별 file-log fallback, 완료/아티팩트/검증 기록 형식을 설명합니다. substantial work를 마칠 때 읽습니다.
- `vaults/worklogs/YYYY-MM.md`: worklog 채널이 없을 때 쓰는 월별 file-log입니다. 현재 작업 기록은 파일 끝에 append합니다.

## Long-Lived Context

- `vaults/durable/INDEX.md`: 반복되는 agent-process correction과 재사용 가능한 개선 규칙을 기록합니다. 같은 지적이 반복되거나 repo-local 운영 규칙으로 남길 내용이 생겼을 때 읽습니다.

## Contract Context

- `src/main/resources/contracts/README.md`: provider OpenAPI, consumed OpenAPI, AsyncAPI 슬라이스의 역할과 재생성 명령을 설명합니다. 이 서비스가 제공·호출·소비하는 계약 범위를 확인할 때 읽습니다.

## Human-Facing Docs

- `docs/README.md`: 사람을 위한 도메인·기술 문서의 경계와 인덱스입니다. 설계 사실, 운영 메모, 품질 평가, 구현 배경을 설명하거나 참고할 때 읽습니다.

## Project Snapshot

- 서비스: BrainX `intelligence-service`
- Group: `com.brainx.intelligence`
- Runtime: Java 21
- Framework: Spring Boot 3.5.15
- Build: Gradle wrapper
- Main class: `src/main/java/com/brainx/intelligence/IntelligenceServiceApplication.java`
- Provider contract: `src/main/resources/contracts/knowledge-intelligence.openapi.yaml`
- Consumed contracts: `src/main/resources/contracts/knowledge-intelligence.consumed.openapi.yaml`, `src/main/resources/contracts/knowledge-intelligence.asyncapi.yaml`

## Quick Routing

- public API path, status, schema, SSE event shape는 먼저 OpenAPI SSOT와 provider contract를 확인한 뒤 `vaults/agents/intelligence-service.md`를 읽습니다.
- internal REST, consumed event, 다른 서비스의 source of truth와 outbound port 경계는 contract README를 확인한 뒤 `docs/README.md`의 기술 문서로 이동합니다.
- `brainx-next` 요구를 API 범위로 해석하거나 프론트 proxy/SSE 소비를 확인할 때는 `vaults/agents/frontend-integration.md`를 읽습니다.
- 도메인 우선순위, 데이터 소유권, UX·기획 설명은 `docs/README.md`의 도메인 문서로 이동합니다.
- LLM provider, 비용, 품질 평가, index, 운영 DB, 기능별 구현 배경은 `docs/README.md`의 기술 문서로 이동합니다.
- 문서 작업은 해당 human-facing index를 먼저 확인하고, root guide에 endpoint 목록이나 긴 절차를 추가하지 않습니다.
- 반복 correction은 `vaults/durable/INDEX.md`에 기록할지 판단하고, 실제 장기 설계 결정이 생길 때만 decision note를 새로 만들고 이 index에 라우팅합니다.
