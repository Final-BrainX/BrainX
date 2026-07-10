# Intelligence Service

BrainX Knowledge Intelligence 영역의 Spring Boot 서비스입니다. 시맨틱 검색, RAG 채팅, Agent 실험 API, AI 제안, 클러스터링, 인사이트 리포트, 모델 설정, 문체 프로필 API를 담당합니다.

문체 프로필은 `conversationTone`과 `writingStyle` 두 축으로 저장됩니다. 두 축의 세부 값은 프론트에서 자유 입력 문자열로 받으며, 강한 사용자-facing 문체 지시로 LLM prompt에 적용됩니다. 단, 안전성, 사실성, 요구 출력 형식, 근거 제한, 사용자의 명시 지시는 문체보다 우선합니다. `conversationTone`은 대화형 답변과 사용자-facing 추천 이유에, `writingStyle`은 초안/수정/리포트처럼 실제 생성 결과물에 적용됩니다. AI 클러스터링처럼 noteId coverage와 구조 분석 검증이 우선인 내부 분석 prompt에는 사용자 문체를 적용하지 않습니다.

## 기술 스택

- Java 21
- Spring Boot 3.5.15
- Gradle
- Spring Web, WebFlux, Security, Validation, Actuator
- Spring Data JPA, PostgreSQL
- Spring Kafka

## 계약 기준

서비스 사양의 최상위 기준은 `../../contracts-v2/brainx-openapi.ssot.yaml`입니다. `src/main/resources/contracts/knowledge-intelligence.openapi.yaml`은 `scripts/extract_intelligence_openapi.py`가 SSOT에서 `Knowledge Intelligence` tag와 `knowledge-intelligence` producer service 작업만 추출한 로컬 확인용 사본입니다.

이 서비스가 소비하는 내부 REST API와 producer/consumer로 참여하는 이벤트 계약은 `src/main/resources/contracts/README.md`에서 확인합니다.

현재 계약은 다음 원칙을 따릅니다.

- Public/client API는 `/api/v1` 아래에 둡니다.
- 인증은 `bearerAuth` JWT를 사용합니다.
- 런타임 검증은 User-Service/Gateway와 같은 `JWT_SECRET` 기반 HS256 access token(`typ=access`, `sub=userId`)을 사용합니다.
- 프론트엔드 API 클라이언트는 `401 Unauthorized`만 access token 갱신 및 로컬 세션 무효화 대상으로 처리합니다. `403 Forbidden`은 인증된 사용자의 권한, AI capability 또는 quota 거절이므로 로그인 세션을 유지하고 응답 오류를 화면에 전달합니다.
- SSE 스트리밍 응답은 `text/event-stream`으로 반환합니다.
- `/api/v1/ai/chat-threads/{threadId}/messages` SSE는 `status`, `route`, `web_search_progress`, `web_sources`, `delta`, `done`, `error` 이벤트를 보낼 수 있으며 웹 검색이 필요한 경우 답변 전 검색 진행과 출처를 먼저 보냅니다.
- 웹 검색은 OpenAI Responses API의 `web_search`를 사용하며 기본 모델은 `gpt-5.4-mini`입니다. `OPENAI_WEB_SEARCH_MODEL`을 명시하면 해당 값이 우선합니다. 검색 결과의 답변과 출처는 최종 채팅 답변 LLM의 context로 전달되므로 기존 대화 이력, 사용자 문체, 노트/클라이언트 context와 route별 답변 규칙이 유지됩니다.
- 채팅 thread 조회의 `ChatMessageData`는 assistant message의 `route`와 `savedDraftNoteId`를 포함할 수 있습니다. `/chat`은 이 값으로 초안 저장 버튼과 "노트로 이동" 상태를 복원합니다. 초안 노트 제목은 AI 응답의 비질문형 heading이나 의미 있는 본문 줄에서 만들며, 사용자 질문 기반 thread 제목을 fallback으로 재사용하지 않습니다.
- 토큰 사용 기록은 REST command가 아니라 `TokenUsageRecordedRequested` 이벤트 중심으로 처리합니다.
- 장기 작업 요청은 `PENDING` 상태일 때 `202 Accepted`를 반환합니다.

## 공개 API

아래 표는 이 서비스가 제공하는 public REST/SSE API만 요약한다. 내부 운영 API와 요청/응답 schema의 최종 기준은 OpenAPI SSOT 및 로컬 provider contract를 확인한다.

| Method | Path | 설명 |
| --- | --- | --- |
| `POST` | `/api/v1/intelligence/semantic-search` | 시맨틱 검색 |
| `POST` | `/api/v1/intelligence/note-index-statuses` | 노트 검색 인덱스 상태 일괄 조회 |
| `POST` | `/api/v1/ai/inline-assists` | AI 인라인 어시스트 SSE |
| `POST` | `/api/v1/ai/suggestions/{suggestionId}/decision` | AI 제안 수락, 거절, 재생성 결정 |
| `PUT` | `/api/v1/ai/llm-feedback` | LLM 응답 사용자 피드백 등록/수정 |
| `GET` | `/api/v1/ai/chat-threads` | AI 채팅 스레드 목록 조회 |
| `POST` | `/api/v1/ai/chat-threads` | AI 채팅 스레드 생성 및 선택적 AI 제목 생성 |
| `POST` | `/api/v1/ai/chat-threads/{threadId}/messages` | RAG 채팅 메시지 SSE |
| `PUT` | `/api/v1/ai/chat-threads/{threadId}/messages/{messageId}/draft-note` | AI 채팅 메시지와 저장된 초안 노트 매핑 기록 |
| `GET` | `/api/v1/ai/chat-threads/{threadId}` | 채팅 스레드 조회 |
| `PATCH` | `/api/v1/ai/chat-threads/{threadId}` | 채팅 스레드 보관/보관 해제 |
| `DELETE` | `/api/v1/ai/chat-threads/{threadId}` | 채팅 스레드 숨김 삭제 |
| `GET` | `/api/v1/ai/agent-threads` | Agent 실험 스레드 목록 조회 |
| `POST` | `/api/v1/ai/agent-threads` | Agent 실험 스레드 생성 |
| `POST` | `/api/v1/ai/agent-threads/{threadId}/messages` | Agent 메시지 SSE 및 action 제안 |
| `GET` | `/api/v1/ai/agent-threads/{threadId}` | Agent 실험 스레드 조회 |
| `POST` | `/api/v1/ai/agent-actions/{actionId}/approve` | Agent action 승인 및 실행 |
| `POST` | `/api/v1/ai/agent-actions/{actionId}/reject` | Agent action 거절 |
| `GET` | `/api/v1/ai/models` | 사용 가능한 AI 모델 목록 |
| `PUT` | `/api/v1/ai/model-settings` | AI 모델 설정 변경 |
| `GET` | `/api/v1/notes/{noteId}/summary` | 노트 요약 조회 |
| `POST` | `/api/v1/notes/{noteId}/summary` | 노트 세줄 요약 생성 또는 갱신 |
| `POST` | `/api/v1/ai/folder-organization-proposals` | AI 폴더 정리 제안 |
| `POST` | `/api/v1/ai/link-suggestions` | AI 링크 추천 |
| `POST` | `/api/v1/ai/clusters` | AI 클러스터링 작업 요청 |
| `GET` | `/api/v1/ai/clusters/latest` | 최신 AI 클러스터링 상태 조회 |
| `GET` | `/api/v1/ai/clusters/{clusterJobId}` | AI 클러스터링 결과 조회 |
| `POST` | `/api/v1/ai/cluster-inheritances` | 동일 클러스터의 두 원본으로 만든 새 노트에 클러스터 상속 |
| `POST` | `/api/v1/ai/bridge-concepts` | 징검다리 개념 추천 |
| `POST` | `/api/v1/ai/insight-reports` | AI 인사이트 리포트 요청 |
| `GET` | `/api/v1/ai/insight-reports/latest` | 최신 AI 인사이트 리포트 상태 조회 |
| `GET` | `/api/v1/ai/insight-reports/{reportId}` | AI 인사이트 리포트 조회 |
| `GET` | `/api/v1/users/me/style-profile` | 문체 프로필 조회 |
| `PUT` | `/api/v1/users/me/style-profile` | 문체 프로필 설정 |

`/api/v1/ai/link-suggestions`는 요청의 필수 `documentGroupId` 안에서 source note와 다른 후보 노트만 source-only `LLM_ONLY`로 비교하고, embedding index 없이 active markdown projection만 있으면 동작한다. 응답에는 source markdown anchor text와 offset을 포함한다. 클라이언트는 추천 수락 시 최신 source note 본문에서 anchor 구간만 `[[...]]` wiki link로 저장해 Workspace 링크 ledger와 graph projection이 기존 content save 흐름으로 동기화되게 한다.

전체 Workspace 클러스터링은 최근 완료 snapshot이 있으면 기존 클러스터 ID와 멤버십을 유지한다. 새 미분류 노트만 기존 클러스터 적합도를 먼저 평가하며 기본 confidence `0.75` 이상만 기존 클러스터에 추가하고, 나머지만 새 클러스터 생성 대상으로 보낸다. 전체 클러스터는 기본 최대 12개까지 확장한다. 징검다리 노트는 첫 두 원본이 같은 클러스터일 때 `/api/v1/ai/cluster-inheritances`로 그 소속을 영구 snapshot에 반영한다.

`/api/v1/ai/agent-*` API는 `/agent` 실험 탭 전용이다. 기존 `/chat` API/UI를 대체하지 않으며, v1은 `CREATE_NOTE`, `APPEND_NOTE_CONTENT` action 제안만 지원한다. Workspace mutation은 Agent가 바로 실행하지 않고 사용자가 action card를 승인한 뒤에만 internal Workspace port로 수행한다. `CREATE_NOTE`는 Agent thread의 `documentGroupId`를 Workspace bulk-create command에 전달해 현재 Workspace 안에 노트를 만든다.

세부 요청/응답 schema, 이벤트 coupling, 내부 service-to-service 호출은 OpenAPI 계약에서 직접 확인합니다. 클린 아키텍처 package 규칙과 외부 의존성 port 처리 방식은 `vaults/agents/intelligence-service.md`를 확인합니다. Workspace/User/Gateway/Admin/MCP/Ingestion/Commerce 등 다른 서비스와의 경계는 `docs/technical/cross-service-integration-map.md`를 봅니다.

## 참고 문서

- [문서 인덱스](docs/README.md): 사람을 위한 도메인·기술 문서의 용도별 안내
- [계약 슬라이스 안내](src/main/resources/contracts/README.md): provider/consumed OpenAPI와 AsyncAPI 사본의 범위와 재생성 명령
- [AI 기능 카탈로그](docs/technical/ai-feature-catalog.md): 기능별 public API, LLM 호출 여부, provider/model 경계

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

운영 profile에서는 `JWT_SECRET`과 `SERVICE_TOKEN`이 각각 32 bytes 이상이어야 하며, 누락·placeholder·짧은 값이면 애플리케이션이 시작되지 않습니다. Swagger/OpenAPI endpoint는 기본 비활성이고 `local` profile에서만 기본 활성화됩니다. Workspace 기본 URL은 Workspace-Service 개발 포트인 `http://localhost:8082`이며, JPA는 `open-in-view=false`, Hikari는 인스턴스당 기본 `maximum-pool-size=5`, `minimum-idle=1`을 사용합니다.

Kafka producer는 Kafka의 최종 delivery 결과를 기다려 broker ACK 또는 확정 실패를 호출자에게 전달합니다. producer의 `delivery.timeout.ms`와 `request.timeout.ms`는 각각 `BRAINX_KAFKA_PRODUCER_DELIVERY_TIMEOUT_MS`(기본 `30000`)와 `BRAINX_KAFKA_PRODUCER_REQUEST_TIMEOUT_MS`(기본 `25000`)로 제한하며, 애플리케이션의 더 짧은 별도 timeout으로 아직 진행 중인 발행을 실패로 오판하지 않습니다. 소비 실패는 `BRAINX_EVENTS_CONSUMER_RETRY_INTERVAL`(기본 `1s`)과 `BRAINX_EVENTS_CONSUMER_MAX_ATTEMPTS`(기본 `10`)에 따라 재시도한 뒤 원본 topic과 같은 partition의 `<topic>.dlq`로 보냅니다. payload/handler 검증 같은 비재시도 오류는 즉시 DLQ로 보내며, DLQ publish 자체가 실패하면 원본 처리를 성공으로 간주하지 않습니다. `NoteTagsChanged`는 version이 없으므로 event payload를 projection에 바로 덮지 않고 최신 Workspace snapshot으로 재색인합니다. cluster/insight 완료 결과는 완료 이벤트 발행 실패로 `FAILED` 상태에 되돌아가지 않으며, 알림 실패는 운영 로그와 후속 outbox 개선 대상으로 남깁니다.

클러스터링과 인사이트 요청의 `Idempotency-Key`는 최대 200자입니다. `(user_id, idempotency_key)` DB unique constraint가 동시 요청을 직렬화하고, 충돌한 요청은 먼저 commit된 job/report를 반환합니다. 장시간 LLM 호출은 DB transaction 밖에서 실행해 connection pool을 점유하지 않습니다.

Redis 클라이언트는 `REDIS_HOST`, `REDIS_PORT`, `REDIS_TIMEOUT` 설정을 사용하며, Docker 개발 환경에서는 compose의 `redis` 서비스에 연결합니다. Redis health check는 기본 local 실행을 깨지 않도록 `BRAINX_REDIS_HEALTH_ENABLED`로 켭니다.

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
