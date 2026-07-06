# Context Vault Index

이 vault는 agent가 필요한 문맥만 늦게 읽기 위한 저장소입니다. 루트 `AGENTS.md`는 항상 읽는 규칙만 담고, 세부 사양과 반복 workflow는 여기서 라우팅합니다.

- `vaults/agents/intelligence-service.md`: Intelligence Service의 API 계약 기준, 클린 아키텍처 package 규칙, 외부 의존성 port 처리 방식, persistence/AI/testing 규칙을 설명합니다. API 구현, usecase 설계, 외부 연동 경계, 계약 불일치 검토를 할 때 읽습니다.
- `vaults/agents/frontend-integration.md`: 상위 `brainx-next` 프론트엔드 프로젝트 위치, `/api/v1` proxy 기준, 프론트 요구를 Intelligence Service API 구현으로 연결하는 절차를 설명합니다. 프론트 화면/API client/mock을 기준으로 백엔드 구현 범위를 확인할 때 읽습니다.
- `vaults/agents/domain-implementation-order.md`: API 명세 기준 기능 구현 순서를 도메인 TODO list로 정리합니다. 기술 설계가 아니라 어떤 사용자/지식 기능을 먼저 만들지 결정할 때 읽습니다.
- `vaults/workflows/verification.md`: 이 저장소의 Gradle 검증과 문서 변경 검증 기준을 설명합니다. 코드, 설정, 계약, 문서 변경 후 final response 전에 읽습니다.
- `vaults/worklogs/YYYY-MM.md`: 월별 file-log fallback입니다. substantial work를 마친 뒤 worklog 채널이 없을 때 append합니다.
- `vaults/durable/INDEX.md`: 반복되는 agent-process correction과 재사용 가능한 개선 규칙을 기록합니다. 같은 지적이 반복되거나 repo-local 운영 규칙으로 남길 내용이 생겼을 때 읽습니다.
- `src/main/resources/contracts/README.md`: provider OpenAPI, consumed OpenAPI, AsyncAPI 슬라이스의 역할과 재생성 command를 설명합니다. 이 서비스가 호출하거나 소비하는 외부 계약을 확인할 때 읽습니다.
- `docs/domain/knowledge-intelligence-domain-flow.md`: 사람을 위한 도메인 문서입니다. 도메인 스토리텔링, 이벤트 스토밍, 컨텍스트 맵 관점으로 서비스 흐름을 설명할 때 참고합니다.
- `docs/domain/consumed-events-domain-map.md`: `Intelligence-Service`가 consumer로 받는 AsyncAPI 이벤트와 Intelligence 도메인 기능 연결을 설명할 때 참고합니다.
- `docs/domain/style-profile-input-direction.md`: 사람을 위한 UX/도메인 문서입니다. 사용자 문체 설정 입력 방식, `StyleProfile` 정규화 방향, 대화 말투와 결과물 문체 분리를 논의할 때 참고합니다.
- `docs/technical/conditional-on-bean.md`: Spring Boot `@ConditionalOnBean`의 의미와 Qdrant adapter 적용 맥락을 확인할 때 참고합니다.
- `docs/technical/ai-feature-catalog.md`: `Intelligence-Service`의 AI/LLM 기능 전체 목록, 공개 API, LLM 호출 여부, provider/model 경계를 확인할 때 참고합니다.
- `docs/technical/ai-model-pricing-and-usage.md`: AI 모델 catalog 비용 필드, availability 결합, token usage/cost estimate 기록 정책을 확인할 때 참고합니다.
- `docs/technical/cross-service-integration-map.md`: `Intelligence-Service` 관점의 Workspace/User/Gateway/Admin/MCP/Ingestion/Commerce 연동 계약, 이벤트, port 경계를 확인할 때 참고합니다.
- `docs/technical/consumed-event-contract-alignment.md`: 구현된 consumed event handler와 AsyncAPI SSOT의 topic/payload 일치 수준을 확인할 때 참고합니다.
- `docs/technical/consumed-events-implementation-checkpoints.md`: `Intelligence-Service`가 consumer로 받는 이벤트별 구현 체크포인트를 확인할 때 참고합니다.
- `docs/technical/connection-api.md`: public 노트 연결 추천 API, 내부 `NoteAutoLinkUseCase` 재사용 방식, `default` document group 제한, usage/event 발행 경계를 확인할 때 참고합니다.
- `docs/technical/external-search.md`: OpenAI Responses `web_search` 기반 외부 자료 검색 port, CLI 실행 방법, batch quality capture, RAG chat router 연결 방향을 확인할 때 참고합니다.
- `docs/technical/frontend-ai-context-management.md`: `brainx-next`의 프론트 주도 AI context 관리, `clientContext`/`noteScope` 분리, RightSidebar chat과 editor inline assist context 조립 정책, inline assist quality CLI를 확인할 때 참고합니다.
- `docs/technical/rag-chat-api-frontend-integration.md`: `/chat` 화면의 실제 RAG 채팅 API 연동, thread 목록 cursor pagination, SSE refresh, PostgreSQL LOB preview 주의점을 확인할 때 참고합니다.
- `docs/technical/inline-assist-frontend-stream-lifecycle.md`: `brainx-next` inline assist 요약/다시쓰기 SSE 소비 중 요청 state cleanup과 stream abort가 coupling될 때 생기는 문제, 원인 분석, 재발 방지 기준을 확인할 때 참고합니다.
- `docs/technical/insight-reports.md`: 고급 인사이트 리포트 v1의 sync-complete job, document group scope, usage/event, persistence 정책을 확인할 때 참고합니다.
- `docs/technical/knowledge-structure-analysis.md`: AI 클러스터링 작업 v1의 sync-complete job, note card 입력, usage/event, persistence 정책을 확인할 때 참고합니다.
- `docs/technical/llmops.md`: Intelligence-Service LLM run log, PromptOps registry/version, eval run, 사용자 feedback API 기준을 확인할 때 참고합니다.
- `docs/technical/llm-quality-evaluation-report-2026-06-26.md`: RAG/chat-router/external-search/inline-assist/connection dev 품질 CLI의 실제 provider 평가 결과, 실패/조치, 후속 품질 기준을 확인할 때 참고합니다.
- `docs/technical/llm-quality-evaluations/`: LLM 품질 평가 결과를 RAG, chat router, external search, inline assist, connection 영역별로 더 자세히 확인할 때 참고합니다.
- `docs/technical/note-auto-linking.md`: 유사 노트 자동 연결 v1의 `VECTOR_LLM`/`LLM_ONLY` 비교, anchor 위치 계산, CLI 실행, usage/cost 기록 정책을 확인할 때 참고합니다.
- `docs/technical/note-chunking.md`: Workspace note markdown을 chunk 단위 vector index로 변환하는 규칙과 semantic search dedupe 정책을 확인할 때 참고합니다.
- `docs/technical/sample-notes-rag-cli.md`: `sample_notes` 기반 로컬 RAG CLI 색인/질의 흐름과 retrieval/chat/router 품질 capture script 정보를 확인할 때 참고합니다.
- `docs/technical/vectorstore-embedding-model.md`: Qdrant Java client 직접 연동, Voyage embedding, RAG vector usage/cost 기록 정책을 확인할 때 참고합니다.

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
- `brainx-next` 프론트 요구를 기준으로 Intelligence Service API 구현 범위를 확인할 때는 `vaults/agents/frontend-integration.md`를 함께 읽습니다.
- 기능 구현 순서 질문은 `vaults/agents/domain-implementation-order.md`를 기준으로 답합니다.
- 도메인 흐름이나 기획자와 공유할 설명은 `docs/domain/knowledge-intelligence-domain-flow.md`를 기준으로 답합니다.
- Intelligence-Service 데이터 소유권, 파생 지식 상태, 운영 DB table의 도메인 의미는 `docs/domain/knowledge-intelligence-data-ownership.md`를 기준으로 답합니다.
- Intelligence-Service가 consumer로 받는 이벤트와 도메인 기능 연결은 `docs/domain/consumed-events-domain-map.md`를 기준으로 답합니다.
- 구현된 consumed event와 AsyncAPI SSOT의 일치 여부는 `docs/technical/consumed-event-contract-alignment.md`를 기준으로 답합니다.
- Intelligence-Service consumer 이벤트별 구현 체크포인트는 `docs/technical/consumed-events-implementation-checkpoints.md`를 기준으로 답합니다.
- public 노트 연결 추천 API와 내부 자동 연결 기능의 관계는 `docs/technical/connection-api.md`를 기준으로 답합니다.
- 문체 설정 UX나 `StyleProfile` 입력 방향은 `docs/domain/style-profile-input-direction.md`를 기준으로 답합니다.
- Spring Boot conditional bean 등록이나 Qdrant adapter 조건부 등록은 `docs/technical/conditional-on-bean.md`를 기준으로 답합니다.
- AI 모델 비용, cached input token, usage event payload, RAG usage cost estimate는 `docs/technical/ai-model-pricing-and-usage.md`를 기준으로 답합니다.
- 다른 BrainX 서비스와의 source-of-truth, internal REST, AsyncAPI event, outbound port 경계는 `docs/technical/cross-service-integration-map.md`를 기준으로 답합니다.
- 운영 PostgreSQL schema baseline DDL, 부분 적용 DB 체크리스트, 권장 인덱스는 `docs/technical/intelligence-operational-db-ddl.md`를 기준으로 답합니다.
- LLMOps/PromptOps run log, prompt registry, eval set/run, 사용자 좋아요/싫어요 피드백 API는 `docs/technical/llmops.md`를 기준으로 답합니다.
- 외부 자료 검색 port, OpenAI `web_search` provider, 검색 CLI 실행 방법, RAG chat router 연결 방향은 `docs/technical/external-search.md`를 기준으로 답합니다.
- `brainx-next`의 AI context 관리, `clientContext` payload, `noteScope` 검증 역할, RightSidebar/NoteEditor context 조립 방식은 `docs/technical/frontend-ai-context-management.md`를 기준으로 답합니다.
- `/chat` 화면의 RAG 채팅 API 연동, thread 목록 cursor pagination, SSE 이후 상세 재조회, PostgreSQL LOB preview 문제는 `docs/technical/rag-chat-api-frontend-integration.md`를 기준으로 답합니다.
- 프론트 inline assist SSE 요청이 사용자 메시지만 표시되고 응답이 비는 문제는 `docs/technical/inline-assist-frontend-stream-lifecycle.md`를 기준으로 답합니다.
- LLM 품질 CLI의 실제 provider 평가 결과와 후속 품질 gate 기준은 `docs/technical/llm-quality-evaluation-report-2026-06-26.md`를 기준으로 답합니다.
- LLM 품질 CLI 결과를 의미적으로 해석할 때는 `docs/technical/llm-quality-evaluations/`의 영역별 상세 보고서를 함께 확인합니다.
- AI 클러스터링 작업은 `docs/technical/knowledge-structure-analysis.md`를 기준으로 답합니다.
- 고급 인사이트 리포트는 `docs/technical/insight-reports.md`를 기준으로 답합니다.
- 유사 노트 자동 연결의 전략 비교, anchor 위치 계산, note auto-link CLI 실행 방법은 `docs/technical/note-auto-linking.md`를 기준으로 답합니다.
- 노트 markdown chunking, Qdrant chunk metadata, semantic search note-level dedupe는 `docs/technical/note-chunking.md`를 기준으로 답합니다.
- `sample_notes` 기반 RAG CLI 실행 방법과 retrieval/chat 질의별 출력 capture 결과 위치는 `docs/technical/sample-notes-rag-cli.md`를 기준으로 답합니다.
- Qdrant 직접 연동과 Voyage embedding model 지정 방식은 `docs/technical/vectorstore-embedding-model.md`를 기준으로 답합니다.
- 구현 작업은 target package와 관련 test를 직접 읽고, 계약에서 필요한 schema와 response status를 확인합니다.
- 문서 작업은 root guide bloat audit을 수행합니다. endpoint 목록이나 긴 절차가 root로 들어가면 vault guide로 옮깁니다.
