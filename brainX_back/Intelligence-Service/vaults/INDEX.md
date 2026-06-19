# Context Vault Index

이 vault는 agent가 필요한 문맥만 늦게 읽기 위한 저장소입니다. 루트 `AGENTS.md`는 항상 읽는 규칙만 담고, 세부 사양과 반복 workflow는 여기서 라우팅합니다.

- `vaults/agents/intelligence-service.md`: Intelligence Service의 API 계약 기준, 클린 아키텍처 package 규칙, 외부 의존성 port 처리 방식, persistence/AI/testing 규칙을 설명합니다. API 구현, usecase 설계, 외부 연동 경계, 계약 불일치 검토를 할 때 읽습니다.
- `vaults/agents/domain-implementation-order.md`: API 명세 기준 기능 구현 순서를 도메인 TODO list로 정리합니다. 기술 설계가 아니라 어떤 사용자/지식 기능을 먼저 만들지 결정할 때 읽습니다.
- `vaults/workflows/verification.md`: 이 저장소의 Gradle 검증과 문서 변경 검증 기준을 설명합니다. 코드, 설정, 계약, 문서 변경 후 final response 전에 읽습니다.
- `vaults/worklogs/YYYY-MM.md`: 월별 file-log fallback입니다. substantial work를 마친 뒤 worklog 채널이 없을 때 append합니다.
- `vaults/durable/INDEX.md`: 반복되는 agent-process correction과 재사용 가능한 개선 규칙을 기록합니다. 같은 지적이 반복되거나 repo-local 운영 규칙으로 남길 내용이 생겼을 때 읽습니다.
- `src/main/resources/contracts/README.md`: provider OpenAPI, consumed OpenAPI, AsyncAPI 슬라이스의 역할과 재생성 command를 설명합니다. 이 서비스가 호출하거나 소비하는 외부 계약을 확인할 때 읽습니다.
- `docs/domain/knowledge-intelligence-domain-flow.md`: 사람을 위한 도메인 문서입니다. 도메인 스토리텔링, 이벤트 스토밍, 컨텍스트 맵 관점으로 서비스 흐름을 설명할 때 참고합니다.
- `docs/domain/consumed-events-domain-map.md`: `AI-Service`가 consumer로 받는 AsyncAPI 이벤트와 Intelligence 도메인 기능 연결을 설명할 때 참고합니다.
- `docs/domain/style-profile-input-direction.md`: 사람을 위한 UX/도메인 문서입니다. 사용자 문체 설정 입력 방식, `StyleProfile` 정규화 방향, 대화 말투와 결과물 문체 분리를 논의할 때 참고합니다.
- `docs/technical/conditional-on-bean.md`: Spring Boot `@ConditionalOnBean`의 의미와 Qdrant adapter 적용 맥락을 확인할 때 참고합니다.
- `docs/technical/consumed-events-implementation-checkpoints.md`: `AI-Service`가 consumer로 받는 이벤트별 구현 체크포인트를 확인할 때 참고합니다.
- `docs/technical/note-chunking.md`: Workspace note markdown을 chunk 단위 vector index로 변환하는 규칙과 semantic search dedupe 정책을 확인할 때 참고합니다.
- `docs/technical/sample-notes-rag-cli.md`: `sample_notes` 기반 로컬 RAG CLI 색인/질의 흐름을 확인할 때 참고합니다.
- `docs/technical/vectorstore-embedding-model.md`: Spring AI Qdrant `VectorStore`가 Voyage embedding model을 사용하는 방식과 로컬 환경변수 설정을 확인할 때 참고합니다.

## Project Snapshot

- 서비스: BrainX `intelligence-service`
- Group: `com.brainx.intelligence`
- Runtime: Java 21
- Framework: Spring Boot 3.5.15
- Build: Gradle wrapper
- Main class: `src/main/java/com/brainx/intelligence/IntelligenceServiceApplication.java`
- Provider Contract: `src/main/resources/contracts/knowledge-intelligence.openapi.yaml`
- Consumed/Internal Contracts: `src/main/resources/contracts/knowledge-intelligence.consumed.openapi.yaml`, `src/main/resources/contracts/knowledge-intelligence.asyncapi.yaml`
- Contract extraction script: `scripts/extract_intelligence_openapi.py`

## Routing Rules

- API 사양 질문은 먼저 OpenAPI 계약을 확인한 뒤 `vaults/agents/intelligence-service.md`의 일반 구현 규칙과 대조합니다.
- 기능 구현 순서 질문은 `vaults/agents/domain-implementation-order.md`를 기준으로 답합니다.
- 도메인 흐름이나 기획자와 공유할 설명은 `docs/domain/knowledge-intelligence-domain-flow.md`를 기준으로 답합니다.
- AI-Service가 consumer로 받는 이벤트와 도메인 기능 연결은 `docs/domain/consumed-events-domain-map.md`를 기준으로 답합니다.
- AI-Service consumer 이벤트별 구현 체크포인트는 `docs/technical/consumed-events-implementation-checkpoints.md`를 기준으로 답합니다.
- 문체 설정 UX나 `StyleProfile` 입력 방향은 `docs/domain/style-profile-input-direction.md`를 기준으로 답합니다.
- Spring Boot conditional bean 등록이나 Qdrant adapter 조건부 등록은 `docs/technical/conditional-on-bean.md`를 기준으로 답합니다.
- 노트 markdown chunking, Qdrant chunk metadata, semantic search note-level dedupe는 `docs/technical/note-chunking.md`를 기준으로 답합니다.
- `sample_notes` 기반 RAG CLI 실행 방법은 `docs/technical/sample-notes-rag-cli.md`를 기준으로 답합니다.
- Qdrant `VectorStore`의 Voyage embedding model 지정 방식은 `docs/technical/vectorstore-embedding-model.md`를 기준으로 답합니다.
- 구현 작업은 target package와 관련 test를 직접 읽고, 계약에서 필요한 schema와 response status를 확인합니다.
- 문서 작업은 root guide bloat audit을 수행합니다. endpoint 목록이나 긴 절차가 root로 들어가면 vault guide로 옮깁니다.
