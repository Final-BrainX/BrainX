# Intelligence Service

BrainX Knowledge Intelligence 영역의 Spring Boot 서비스입니다. 시맨틱 검색, RAG 채팅, AI 제안, 클러스터링, 인사이트 리포트, 모델 설정, 문체 프로필 API를 담당합니다.

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
- SSE 스트리밍 응답은 `text/event-stream`으로 반환합니다.
- 토큰 사용 기록은 REST command가 아니라 `TokenUsageRecordedRequested` 이벤트 중심으로 처리합니다.
- 장기 작업 요청은 `PENDING` 상태일 때 `202 Accepted`를 반환합니다.

## 주요 API

| Method | Path | 설명 |
| --- | --- | --- |
| `POST` | `/api/v1/intelligence/semantic-search` | 시맨틱 검색 |
| `POST` | `/api/v1/ai/inline-assists` | AI 인라인 어시스트 SSE |
| `POST` | `/api/v1/ai/suggestions/{suggestionId}/decision` | AI 제안 수락, 거절, 재생성 결정 |
| `POST` | `/api/v1/ai/chat-threads` | AI 채팅 스레드 생성 |
| `POST` | `/api/v1/ai/chat-threads/{threadId}/messages` | RAG 채팅 메시지 SSE |
| `GET` | `/api/v1/ai/chat-threads/{threadId}` | 채팅 스레드 조회 |
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
- `docs/domain/consumed-events-domain-map.md`: AI-Service가 consumer로 받는 이벤트와 Intelligence 도메인 기능 연결
- `docs/domain/style-profile-input-direction.md`: 사용자 문체 설정 입력 UX와 구조화된 `StyleProfile` 정규화 방향

## 기술 문서

- `docs/technical/conditional-on-bean.md`: Spring Boot `@ConditionalOnBean`의 의미와 Qdrant adapter 적용 맥락
- `docs/technical/consumed-events-implementation-checkpoints.md`: AI-Service consumer 이벤트별 구현 체크포인트
- `docs/technical/note-chunking.md`: 노트 markdown을 chunk 단위 vector index로 변환하는 규칙
- `docs/technical/sample-notes-rag-cli.md`: `sample_notes` 기반 로컬 RAG CLI 색인/질의 흐름
- `docs/technical/vectorstore-embedding-model.md`: Spring AI Qdrant `VectorStore`의 Voyage embedding model 지정 방식

## 실행

Windows PowerShell 기준:

```powershell
.\gradlew.bat bootRun
```

Swagger UI를 로컬 H2 DB로 바로 확인할 때:

```powershell
.\gradlew.bat bootRun --args=--spring.profiles.active=local
```

Swagger UI는 `http://localhost:8080/swagger-ui.html`, 생성된 OpenAPI JSON은 `http://localhost:8080/v3/api-docs`에서 확인합니다. `local` profile에서는 Swagger 테스트 편의를 위해 `/api/v1/**` 인증을 요구하지 않습니다.

Unix 계열 shell 기준:

```sh
./gradlew bootRun
```

## 검증

```powershell
.\gradlew.bat test
```

문서만 변경한 경우에는 테스트를 생략할 수 있습니다. 코드, 설정, 계약 파일을 변경한 경우에는 관련 Gradle 검증을 실행하고 결과를 작업 로그에 남깁니다.
