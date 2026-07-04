# Intelligence Service

BrainX Knowledge Intelligence 영역의 Spring Boot 서비스입니다. 시맨틱 검색, RAG 채팅, AI 제안, 클러스터링, 인사이트 리포트, 모델 설정, 문체 프로필 API를 담당합니다.

문체 프로필은 `conversationTone`과 `writingStyle` 두 축으로 저장됩니다. 두 축의 세부 값은 프론트에서 자유 입력 문자열로 받으며, 강한 사용자-facing 문체 지시로 LLM prompt에 적용됩니다. 단, 안전성, 사실성, 요구 출력 형식, 근거 제한, 사용자의 명시 지시는 문체보다 우선합니다. `conversationTone`은 대화형 답변과 사용자-facing 추천 이유에, `writingStyle`은 초안/수정/리포트처럼 실제 생성 결과물에 적용됩니다.

## 기술 스택

- Java 21
- Spring Boot 3.5.15
- Gradle
- Spring Web, WebFlux, Security, Validation, Actuator
- Spring Data JPA, PostgreSQL
- Spring Kafka

## 계약 기준

서비스 사양의 기준은 `src/main/resources/contracts/knowledge-intelligence.openapi.yaml`입니다. 이 파일은 `scripts/extract_intelligence_openapi.py`로 BrainX OpenAPI SSOT에서 `Knowledge Intelligence` 태그와 `knowledge-intelligence` producer service 작업만 추출한 계약입니다.

이 서비스가 소비하는 내부 REST API와 producer/consumer로 참여하는 이벤트 계약은 `src/main/resources/contracts/README.md`에서 확인합니다.

현재 계약은 다음 원칙을 따릅니다.

- Public/client API는 `/api/v1` 아래에 둡니다.
- 인증은 `bearerAuth` JWT를 사용합니다.
- 런타임 검증은 User-Service/Gateway와 같은 `JWT_SECRET` 기반 HS256 access token(`typ=access`, `sub=userId`)을 사용합니다.
- SSE 스트리밍 응답은 `text/event-stream`으로 반환합니다.
- 토큰 사용 기록은 REST command가 아니라 `TokenUsageRecordedRequested` 이벤트 중심으로 처리합니다.
- 장기 작업 요청은 `PENDING` 상태일 때 `202 Accepted`를 반환합니다.

## 주요 API

| Method | Path | 설명 |
| --- | --- | --- |
| `POST` | `/api/v1/intelligence/semantic-search` | 시맨틱 검색 |
| `POST` | `/api/v1/ai/inline-assists` | AI 인라인 어시스트 SSE |
| `POST` | `/api/v1/ai/suggestions/{suggestionId}/decision` | AI 제안 수락, 거절, 재생성 결정 |
| `GET` | `/api/v1/ai/chat-threads` | AI 채팅 스레드 목록 조회 |
| `POST` | `/api/v1/ai/chat-threads` | AI 채팅 스레드 생성 및 선택적 AI 제목 생성 |
| `POST` | `/api/v1/ai/chat-threads/{threadId}/messages` | RAG 채팅 메시지 SSE |
| `GET` | `/api/v1/ai/chat-threads/{threadId}` | 채팅 스레드 조회 |
| `PATCH` | `/api/v1/ai/chat-threads/{threadId}` | 채팅 스레드 보관/보관 해제 |
| `DELETE` | `/api/v1/ai/chat-threads/{threadId}` | 채팅 스레드 숨김 삭제 |
| `GET` | `/api/v1/ai/models` | 사용 가능한 AI 모델 목록 |
| `PUT` | `/api/v1/ai/model-settings` | AI 모델 설정 변경 |
| `GET` | `/api/v1/notes/{noteId}/summary` | 노트 요약 조회 |
| `POST` | `/api/v1/ai/folder-organization-proposals` | AI 폴더 정리 제안 |
| `POST` | `/api/v1/ai/link-suggestions` | AI 링크 추천 |
| `POST` | `/api/v1/ai/clusters` | AI 클러스터링 작업 요청 |
| `GET` | `/api/v1/ai/clusters/{clusterJobId}` | AI 클러스터링 결과 조회 |
| `POST` | `/api/v1/ai/bridge-concepts` | 징검다리 개념 추천 |
| `POST` | `/api/v1/ai/insight-reports` | AI 인사이트 리포트 요청 |
| `GET` | `/api/v1/ai/insight-reports/{reportId}` | AI 인사이트 리포트 조회 |
| `GET` | `/api/v1/users/me/style-profile` | 문체 프로필 조회 |
| `PUT` | `/api/v1/users/me/style-profile` | 문체 프로필 설정 |

세부 요청/응답 schema, 이벤트 coupling, 내부 service-to-service 호출은 OpenAPI 계약에서 직접 확인합니다. 클린 아키텍처 package 규칙과 외부 의존성 port 처리 방식은 `vaults/agents/intelligence-service.md`를 확인합니다.

## 도메인 문서

- `docs/domain/knowledge-intelligence-domain-flow.md`: 도메인 스토리텔링, 이벤트 스토밍, 컨텍스트 맵 관점의 기능 흐름과 도메인 관계
- `docs/domain/consumed-events-domain-map.md`: Intelligence-Service가 consumer로 받는 이벤트와 Intelligence 도메인 기능 연결
- `docs/domain/style-profile-input-direction.md`: 사용자 문체 설정 입력 UX와 구조화된 `StyleProfile` 정규화 방향

## 기술 문서

- `docs/technical/conditional-on-bean.md`: Spring Boot `@ConditionalOnBean`의 의미와 Qdrant adapter 적용 맥락
- `docs/technical/consumed-events-implementation-checkpoints.md`: Intelligence-Service consumer 이벤트별 구현 체크포인트
- `docs/technical/rag-chat-api-frontend-integration.md`: `/chat` 화면의 RAG 채팅 API, AI 스레드 제목 생성, SSE 및 프론트 연동 흐름
- `docs/technical/note-chunking.md`: 노트 markdown을 chunk 단위 vector index로 변환하는 규칙
- `docs/technical/sample-notes-rag-cli.md`: `sample_notes` 기반 로컬 RAG CLI 색인/질의 흐름
- `docs/technical/vectorstore-embedding-model.md`: Spring AI Qdrant `VectorStore`의 Voyage embedding model 지정 방식

## 실행

Windows PowerShell 기준:

```powershell
.\gradlew.bat bootRun
```

로컬 H2 DB와 로컬 secret 파일을 사용해 개발 서버를 띄울 때:

```powershell
.\gradlew.bat --no-daemon bootRun --args="--spring.profiles.active=local --server.port=8086"
```

`local` profile은 `src/main/resources/application-local.yaml`을 통해 project root의 `.brainx-local.properties`를 optional import합니다. 이 파일은 git ignore 대상이며 `OPENAI_API_KEY`, `SPRING_AI_MODEL_CHAT=openai`, `VOYAGE_API_KEY` 같은 로컬 runtime secret을 둘 때 사용합니다. `local` profile 없이 실행하면 `.brainx-local.properties`는 읽히지 않습니다.

배포 환경에서 Workspace 이벤트를 소비해 note projection을 만들려면 `BRAINX_EVENTS_CONSUMER_ENABLED=true`, `KAFKA_BOOTSTRAP_SERVERS`, `SPRING_KAFKA_BOOTSTRAP_SERVERS`, `BRAINX_WORKSPACE_BASE_URL`, `BRAINX_WORKSPACE_SERVICE_TOKEN`이 필요합니다. Workspace internal snapshot API는 `X-Service-Token` 헤더를 사용하므로 `BRAINX_WORKSPACE_SERVICE_TOKEN`은 Workspace-Service의 `SERVICE_TOKEN`과 같아야 합니다.

운영 DB schema는 Flyway가 `src/main/resources/db/migration`의 migration으로 적용하고, Hibernate는 기본 `ddl-auto=validate`로 entity/schema 불일치만 검증합니다. 로컬 H2 기반 `local`, `test`, `dev-ui` profile은 기존처럼 `create-drop`을 사용하며 Flyway를 끕니다. 운영 DDL 기준과 수동 점검 절차는 `docs/technical/intelligence-operational-db-ddl.md`를 따릅니다.
운영 PostgreSQL에서 `@Lob`/JSON converter 컬럼은 Hibernate legacy `oid`가 아니라 `text`로 유지합니다. 기존 DB에 `oid` drift가 남아 있으면 Flyway repair migration이 large object를 `text`로 복구한 뒤 `ddl-auto=validate`를 통과해야 합니다.

Swagger UI는 `http://localhost:8086/swagger-ui.html`, 생성된 OpenAPI JSON은 `http://localhost:8086/v3/api-docs`, health check는 `http://localhost:8086/actuator/health`에서 확인합니다. `local` profile에서는 Swagger 테스트 편의를 위해 `/api/v1/**` 인증을 요구하지 않습니다.

Unix 계열 shell 기준:

```sh
./gradlew bootRun
```

## 검증

```powershell
.\gradlew.bat test
```

문서만 변경한 경우에는 테스트를 생략할 수 있습니다. 코드, 설정, 계약 파일을 변경한 경우에는 관련 Gradle 검증을 실행하고 결과를 작업 로그에 남깁니다.
