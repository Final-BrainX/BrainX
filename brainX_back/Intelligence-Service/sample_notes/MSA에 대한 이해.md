**1. MSA에서 Docker와 Kafka를 어떻게 쓰는가**

MSA는 서비스가 여러 개로 쪼개진 구조야.

예를 들면 BrainX에서는 이런 식일 수 있어.

```
brainx-next              프론트엔드
User-Service             회원, 로그인, 프로필
Note-Service             노트 생성, 수정, 삭제
AI-Service               요약, 태그 추천, 검색 보조
Notification-Service     알림
Billing-Service          요금제, 결제
PostgreSQL / MySQL       DB
Kafka                    이벤트 브로커
```

문제는 각각을 직접 실행하면 너무 복잡해져.

```
User-Service는 8080
Note-Service는 8082
AI-Service는 8083
DB는 5432
Kafka는 9092
프론트는 3000
```

이걸 매번 손으로 띄우면 환경이 꼬이기 쉬워. 그래서 Docker를 써.

Docker의 역할은 “각 서비스를 컨테이너라는 독립 실행 박스에 넣어서 동일한 환경으로 실행하는 것”이야.

예를 들어 Docker Compose를 쓰면 이런 식으로 한 번에 올릴 수 있어.

```
docker compose up
```

그러면 내부적으로 이런 것들이 같이 뜬다.

```
frontend container
user-service container
note-service container
ai-service container
postgres container
kafka container
zookeeper 또는 kafka-controller container
```

여기서 중요한 건 Docker 네트워크야.

로컬에서는 프론트가 백엔드를 이렇게 부르지?

```
http://localhost:8080
```

근데 Docker 컨테이너끼리는 보통 서비스 이름으로 부른다.

```
http://user-service:8080
http://note-service:8082
kafka:9092
postgres:5432
```

즉 Docker Compose 안에서는 서비스 이름이 DNS처럼 작동해.

```
note-service -> user-service 호출
ai-service -> kafka 연결
user-service -> postgres 연결
```

이렇게 가능해지는 거야.

---

Kafka는 뭐냐?

Kafka는 서비스끼리 직접 호출하지 않고, “이벤트”를 던져놓는 중간 메시지 창구야.

예를 들어 사용자가 노트를 만들었다고 해보자.

동기 HTTP 방식이면 Note-Service가 AI-Service를 직접 호출해야 해.

```
Note-Service -> AI-Service: 이 노트 요약해줘
```

근데 이 방식은 AI-Service가 느리거나 죽어 있으면 Note-Service도 영향을 받아.

Kafka 방식은 이렇게 해.

```
Note-Service:
"노트가 생성됨" 이벤트를 Kafka에 발행

Kafka:
note.created 토픽에 이벤트 저장

AI-Service:
note.created 이벤트를 구독하고 있다가 가져감
요약 생성

Notification-Service:
note.created 이벤트를 구독하고 있다가 알림 생성
```

즉 Kafka는 서비스 사이의 “이벤트 우체국” 같은 역할이야.

```
Producer: 이벤트를 발행하는 서비스
Kafka Topic: 이벤트가 쌓이는 채널
Consumer: 이벤트를 구독해서 처리하는 서비스
```

예시:

```
User-Service
회원가입 완료 -> user.created 이벤트 발행

Note-Service
노트 생성 -> note.created 이벤트 발행

AI-Service
note.created 이벤트 소비 -> 자동 요약 생성

Notification-Service
ai.summary.completed 이벤트 소비 -> 사용자에게 알림 생성
```

이게 MSA에서 Kafka를 쓰는 핵심 이유야.

서비스 간 결합도를 낮추고, 각 서비스가 독립적으로 움직이게 만드는 것.

---

**2. API 명세서에서 이벤트와 컨슈머를 어떻게 뽑는가**

먼저 API와 이벤트의 차이를 알아야 해.

API는 누군가가 직접 요청하는 것.

```
프론트 -> User-Service
POST /api/v1/auth/login
```

이건 즉시 응답이 필요해.

```
로그인 성공/실패를 바로 알려줘야 함
```

반면 이벤트는 “어떤 일이 발생했다”는 사실을 다른 서비스에게 알리는 거야.

```
user.created
note.created
note.deleted
ai.summary.completed
payment.completed
```

이벤트는 보통 즉시 응답을 받으려고 쓰는 게 아니야. “일어난 사실”을 퍼뜨리는 데 쓴다.

쉽게 구분하는 기준은 이거야.

API 명세서에서 이런 문장을 보면 이벤트 후보야.

```
회원가입 성공 시
노트 생성 시
파일 업로드 완료 시
AI 요약 완료 시
결제 완료 시
구독 만료 시
계정 삭제 요청 시
```

“~~할 때”, “~~완료 시”, “~발생 시”가 보이면 이벤트를 의심하면 돼.

예를 들어 API 명세서에 이런 API가 있다고 해보자.

```
POST /api/v1/notes
노트 생성
```

이 API 자체는 HTTP API야.

그런데 노트 생성이 성공하면 다른 서비스들이 관심 가질 수 있어.

```
AI-Service: 새 노트를 요약해야 함
Search-Service: 검색 인덱스에 넣어야 함
Notification-Service: 팀 공유 노트면 알림 보내야 함
```

그러면 이벤트를 뽑는다.

```
이벤트명: note.created
발행자 Producer: Note-Service
컨슈머 Consumer:
- AI-Service
- Search-Service
- Notification-Service
```

이런 식으로 정리하는 거야.

예시 표로 보면 더 쉽다.

```
API: POST /api/v1/auth/email-signups
행위: 회원가입
이벤트 후보: user.created
Producer: User-Service
Consumer:
- Notification-Service: 가입 환영 알림
- Billing-Service: 무료 플랜 생성
- Analytics-Service: 가입 통계 기록
```

```
API: POST /api/v1/notes
행위: 노트 생성
이벤트 후보: note.created
Producer: Note-Service
Consumer:
- AI-Service: 자동 요약
- Search-Service: 검색 색인
- Activity-Service: 최근 활동 기록
```

```
API: PATCH /api/v1/notes/{noteId}
행위: 노트 수정
이벤트 후보: note.updated
Producer: Note-Service
Consumer:
- Search-Service: 색인 갱신
- AI-Service: 임베딩/요약 갱신
```

```
API: DELETE /api/v1/notes/{noteId}
행위: 노트 삭제
이벤트 후보: note.deleted
Producer: Note-Service
Consumer:
- Search-Service: 색인 제거
- AI-Service: 임베딩 제거
```

```
API: POST /api/v1/support/inquiries
행위: 문의 접수
이벤트 후보: support.inquiry.created
Producer: User-Service 또는 Support-Service
Consumer:
- Admin-Service: 관리자 문의함에 표시
- Notification-Service: 관리자 알림
```

컨슈머는 “이 사건을 듣고 할 일이 있는 서비스”라고 보면 돼.

중요한 기준은 이거야.

```
이 이벤트가 발생했을 때, 후속 작업을 해야 하는 서비스가 있는가?
```

있으면 Consumer다.

---

**3. OpenAPI와 AsyncAPI는 왜 필요한가**

이제 API 명세서를 두 종류로 나눠야 해.

HTTP API 명세는 OpenAPI.

이벤트/Kafka 명세는 AsyncAPI.

둘은 역할이 달라.

OpenAPI는 REST API 계약서야.

예를 들면:

```json
POST /api/v1/support/inquiries
Authorization: Bearer token
Request Body:
{
  "category": "기능 문의",
  "title": "문의 제목",
  "content": "문의 내용"
}

Response:
{
  "success": true,
  "data": {
    "inquiryId": "inq_xxx",
    "category": "기능 문의",
    "title": "문의 제목",
    "content": "문의 내용",
    "status": "RECEIVED",
    "createdAt": "2026-06-16T16:00:00"
  },
  "message": "문의가 접수되었습니다."
}
```

이걸 OpenAPI로 문서화하면 프론트/백엔드가 같은 약속을 보고 개발할 수 있어.

프론트 개발자는 이렇게 알 수 있어.

```
아, 문의 접수는 POST /api/v1/support/inquiries 로 보내야 하는구나.
body에는 category, title, content가 필요하구나.
응답 data에는 inquiryId, status가 있구나.
```

백엔드 개발자는 이렇게 맞춰 구현해.

```
Controller path
Request DTO
Response DTO
Status code
Validation
```

즉 OpenAPI는 HTTP 요청/응답의 계약서야.

---

AsyncAPI는 이벤트 계약서야.

예를 들어 문의 접수 후 Kafka에 이벤트를 발행한다고 해보자.

```json
topic: support.inquiry.created
message:
{
  "eventId": "evt_123",
  "eventType": "support.inquiry.created",
  "occurredAt": "2026-06-16T16:00:00",
  "data": {
    "inquiryId": "inq_123",
    "userId": "usr_123",
    "category": "기능 문의",
    "title": "문의 제목"
  }
}
```

이걸 AsyncAPI로 정의하면 이런 걸 약속하는 거야.

```
어떤 topic에 이벤트가 발행되는지
누가 발행하는지
누가 소비하는지
메시지 payload 구조가 뭔지
필수 필드는 뭔지
이벤트 이름은 뭔지
```

팀플에서 이게 왜 중요하냐면, MSA에서는 백엔드 팀원들이 각자 다른 서비스를 만들잖아.

예를 들어:

```
A: User-Service 담당
B: Note-Service 담당
C: AI-Service 담당
D: Notification-Service 담당
```

A가 회원가입 이벤트를 이렇게 보낸다고 생각했어.

```
{
  "userId": "usr_1",
  "email": "test@test.com"
}
```

근데 D는 알림 서비스에서 이렇게 올 줄 알고 개발했어.

```
{
  "id": "usr_1",
  "userEmail": "test@test.com"
}
```

그러면 통신이 깨져.

그래서 AsyncAPI로 미리 약속한다.

```
user.created 이벤트 payload는 반드시 userId, email, nickname을 가진다.
topic 이름은 user.created다.
발행자는 User-Service다.
소비자는 Notification-Service, Billing-Service다.
```

즉 정리하면:

```
OpenAPI = REST API 계약서
AsyncAPI = Kafka 이벤트 계약서
```

둘 다 “팀원끼리 서로 통신 형식을 맞추기 위한 문서”야.

그리고 단순 문서가 아니라, 나중에는 코드 생성, 테스트, Mock 서버, 문서 자동화에도 쓸 수 있어.

예를 들어 OpenAPI로 할 수 있는 것:

```
Swagger UI 문서 생성
프론트 타입 자동 생성
API Client 자동 생성
Controller 테스트 기준으로 사용
```

AsyncAPI로 할 수 있는 것:

```
Kafka 이벤트 문서 생성
이벤트 payload 타입 생성
Producer/Consumer 계약 검증
이벤트 흐름 시각화
```

---

**4. MockMvc는 무엇이고 왜 쓰는가**

MockMvc는 Spring MVC Controller를 테스트하는 도구야.

쉽게 말하면 “진짜 서버를 띄우지 않고 API 요청을 흉내 내서 Controller가 명세대로 동작하는지 확인하는 도구”야.

예를 들어 실제로는 브라우저나 Postman에서 이렇게 요청하지?

```
POST /api/v1/support/inquiries
Authorization: Bearer token
Content-Type: application/json

{
  "category": "기능 문의",
  "title": "문의 제목",
  "content": "문의 내용"
}
```

MockMvc 테스트에서는 이 요청을 코드로 흉내 낸다.

```
mockMvc.perform(post("/api/v1/support/inquiries")
        .contentType(MediaType.APPLICATION_JSON)
        .content("""
            {
              "category": "기능 문의",
              "title": "문의 제목",
              "content": "문의 내용"
            }
        """))
    .andExpect(status().isCreated())
    .andExpect(jsonPath("$.success").value(true))
    .andExpect(jsonPath("$.data.status").value("RECEIVED"));
```

이 테스트가 확인하는 건 이런 것들이야.

```
URL이 명세서와 같은가?
HTTP Method가 맞는가?
Request Body를 제대로 받는가?
Validation이 작동하는가?
Status Code가 맞는가?
Response JSON 구조가 명세서와 같은가?
Controller가 Service를 제대로 호출하는가?
```

그래서 네 말이 거의 맞아.

“MockMvc는 API 명세서와 잘 맞는지 테스트하는 용도냐?”

정확히는:

```
Spring Controller 레벨에서 API 명세와 실제 구현이 일치하는지 검증하는 테스트 도구
```

라고 보면 돼.

다만 MockMvc는 Kafka 이벤트까지 직접 검증하는 도구는 아니야.

MockMvc는 HTTP API 테스트용이야.

Kafka 이벤트는 보통 이런 걸로 테스트해.

```
EmbeddedKafka
Testcontainers Kafka
Mockito로 KafkaTemplate 검증
AsyncAPI 기반 contract test
```

예를 들어 문의 접수 API에서 Kafka 이벤트도 발행해야 한다면 MockMvc로는 HTTP 응답을 확인하고, Mockito로 Kafka 발행 여부를 확인할 수 있어.

예시:

```
mockMvc.perform(post("/api/v1/support/inquiries")
        .contentType(MediaType.APPLICATION_JSON)
        .content(requestJson))
    .andExpect(status().isCreated());

verify(kafkaTemplate).send(eq("support.inquiry.created"), any());
```

그러면 테스트 의미는 이거야.

```
문의 접수 API가 성공하면 support.inquiry.created 이벤트도 발행한다.
```

MockMvc를 프로젝트에 적용하는 흐름은 보통 이래.

1. API 명세서 작성

```
POST /api/v1/support/inquiries
필수 필드: category, title, content
성공 status: 201
응답: success, data, message
```

2. Controller 구현

```
SupportInquiryController
```

3. MockMvc 테스트 작성

```
정상 요청 -> 201 Created
title 없음 -> 400 Bad Request
인증 없음 -> 401 Unauthorized
응답 JSON 구조 확인
```

4. 테스트를 CI에서 자동 실행

```
GitHub Actions
Jenkins
GitLab CI
```

5. 누가 API를 잘못 바꾸면 테스트가 실패

예를 들어 누군가 응답을 이렇게 바꿨다고 해보자.

기존:

```
{
  "success": true,
  "data": {}
}
```

변경:

```
{
  "ok": true,
  "result": {}
}
```

그러면 프론트가 깨질 수 있지.

MockMvc 테스트에서 기존 명세를 기대하고 있으면 바로 실패해.

```
jsonPath("$.success") 없음
테스트 실패
```

즉 MockMvc는 팀플에서 “백엔드가 API 명세를 몰래 깨뜨리지 못하게 막는 안전장치” 역할을 해.

---

정리하면 전체 흐름은 이렇게 이해하면 돼.

```
1. API 명세서 작성
   프론트와 백엔드가 HTTP 통신 형식을 맞춘다.
   이건 OpenAPI로 정리한다.

2. 이벤트 명세서 작성
   서비스끼리 Kafka로 주고받을 이벤트를 정리한다.
   이건 AsyncAPI로 정리한다.

3. Docker Compose 구성
   프론트, 백엔드 서비스들, DB, Kafka를 한 번에 띄운다.

4. 각 서비스 구현
   REST API는 Controller/Service로 구현한다.
   이벤트 발행은 Kafka Producer로 구현한다.
   이벤트 처리는 Kafka Consumer로 구현한다.

5. 테스트
   MockMvc로 REST API가 OpenAPI 명세와 맞는지 검증한다.
   Kafka 테스트로 이벤트가 AsyncAPI 명세와 맞는지 검증한다.
```

진짜 중요한 한 줄로 압축하면 이거야.

```
OpenAPI는 “HTTP로 직접 요청할 때의 약속”,
AsyncAPI는 “Kafka 이벤트로 비동기 통신할 때의 약속”,
MockMvc는 “그 HTTP 약속을 백엔드가 실제로 지키는지 확인하는 테스트 도구”,
Docker는 “그 모든 서비스를 같은 환경에서 한 번에 실행하게 해주는 도구”다.
```

웹 미리보기웹사이트Codex 브라우저에서 열기다음에서 열기

오후 5:06

자 그럼 현재는 개발 극초기야 각자 백엔드 패키지를 하나씩 맡아서 하고 프론트는 모놀리지식으로 개발하는데 질문 1. 프론트도 분리를 시켜야 하나? 질문 2. 위의 openapi, docker, kafka, asyncapi, mockmvc 를 언제 설정하면 좋을지

오후 5:15

좋아, 지금 상황을 기준으로 현실적으로 답할게.

현재 상태:

```
백엔드: MSA 지향, 각자 서비스 패키지 담당
프론트: 하나의 Next.js 프로젝트로 모놀리식 개발
개발 단계: 극초기
```

이 상태라면 “이론적으로 완벽한 MSA”보다 “팀이 안 꼬이고 빨리 맞춰가는 구조”가 훨씬 중요해.

---

**질문 1. 프론트도 분리해야 하나?**

결론부터 말하면, 지금은 프론트까지 분리하지 않는 게 좋아.

현재처럼 하나의 Next.js 프론트 프로젝트로 가는 게 맞아.

이유는 간단해.

백엔드는 서비스별 책임이 명확해.

```
User-Service
Note-Service
AI-Service
Payment-Service
Notification-Service
```

각각 DB도 다를 수 있고, 배포도 따로 할 수 있고, 이벤트도 따로 처리할 수 있어.

그런데 프론트는 사용자 입장에서 하나의 앱이야.

사용자는 이렇게 생각하지 않아.

```
지금 User 프론트 보고 있다.
이제 Note 프론트로 이동한다.
이제 AI 프론트로 이동한다.
```

사용자는 그냥 BrainX 앱 하나를 쓰는 거야.

그래서 프론트는 보통 이렇게 간다.

```
백엔드: MSA
프론트: 모놀리식 SPA/Next.js
```

이 구조는 매우 흔해.

프론트를 너무 빨리 쪼개면 문제가 많아져.

```
라우팅 복잡해짐
로그인 세션 공유 복잡해짐
공통 UI 관리 어려움
배포 파이프라인 증가
팀원 간 스타일 불일치
상태 관리 중복
API 타입 중복
```

예를 들어 프론트를 이렇게 쪼갰다고 해보자.

```
auth-frontend
note-frontend
ai-frontend
admin-frontend
```

그러면 로그인 토큰을 어디에 저장할지, 공통 레이아웃은 누가 관리할지, 디자인 시스템은 어떻게 공유할지, 배포 URL은 어떻게 묶을지 문제가 생겨.

이건 초기 팀 프로젝트에서 오히려 발목 잡을 가능성이 커.

그래서 지금은 이렇게 가는 게 좋아.

```
brainx-next
  app
  components
  lib
    user-api.ts
    note-api.ts
    ai-api.ts
    support-api.ts
```

즉 프론트 프로젝트는 하나지만, 내부 API client나 화면 구조는 도메인별로 잘 나누는 정도면 충분해.

예시:

```
lib/user-api.ts
lib/note-api.ts
lib/ai-api.ts
lib/billing-api.ts

components/auth
components/notes
components/mypage
components/admin
```

이건 “프론트 모놀리스지만 내부 모듈화는 한다”는 방식이야.

언제 프론트를 분리하냐?

아래 조건이 생기면 그때 고민하면 돼.

```
팀 규모가 커져서 프론트 팀도 도메인별로 나뉨
관리자 페이지와 사용자 앱 배포 주기가 완전히 다름
B2B 관리자 콘솔, 사용자 앱, 랜딩 페이지가 완전히 다른 제품이 됨
각 화면이 독립 배포되어야 함
공통 디자인 시스템을 패키지로 관리할 준비가 됨
```

그 전까지는 분리하지 마.

내 추천은 이거야.

```
지금: 프론트 모놀리스 유지
대신 API client, components, routes를 도메인별로 정리
나중: 필요하면 admin만 별도 앱으로 분리 고려
```

---

**질문 2. OpenAPI, Docker, Kafka, AsyncAPI, MockMvc는 언제 설정하면 좋을까?**

이건 순서가 중요해.

처음부터 다 완벽하게 하려고 하면 팀이 질려. 반대로 너무 늦게 하면 통신이 다 꼬여.

추천 순서는 이거야.

```
1단계: OpenAPI
2단계: MockMvc
3단계: Docker Compose
4단계: Kafka
5단계: AsyncAPI
```

다만 Kafka와 AsyncAPI는 같이 생각해야 하고, Docker는 DB/Kafka 실행 때문에 중간에 빨리 들어오는 게 좋아.

현실적인 개발 단계별로 설명할게.

---

**1단계: 지금 바로 해야 하는 것 - OpenAPI**

개발 극초기라면 제일 먼저 잡아야 하는 건 OpenAPI야.

왜냐하면 프론트와 백엔드가 제일 먼저 부딪히는 지점이 REST API거든.

예를 들어 백엔드가 이렇게 생각해.

```
{
  "nickname": "홍길동",
  "profileImageAssetId": "..."
}
```

프론트는 이렇게 생각해.

```
{
  "name": "홍길동",
  "profileImageUrl": "..."
}
```

그러면 바로 깨져.

그래서 OpenAPI는 가능한 빨리 잡는 게 좋아.

처음부터 완벽할 필요는 없어.

초기에는 핵심 API만 먼저 작성해.

```
회원가입
로그인
내 정보 조회
프로필 수정
노트 생성
노트 조회
노트 수정
노트 삭제
문의 생성
문의 조회
```

이 정도.

OpenAPI를 작성하면 팀원들이 이런 걸 공유할 수 있어.

```
URL
Method
Request Body
Response Body
Status Code
Error Response
인증 필요 여부
```

초기 OpenAPI는 “완벽한 문서”보다 “서로 헷갈리지 않는 계약서”가 목적이야.

추천 시점:

```
지금 바로
각 API 구현 전에 먼저 초안 작성
구현하면서 수정
프론트가 붙기 전에는 최소 request/response 확정
```

---

**2단계: API 구현 직후 - MockMvc**

MockMvc는 OpenAPI 다음에 바로 붙이는 게 좋아.

순서는 이렇게.

```
OpenAPI로 API 계약 정의
Controller 구현
MockMvc 테스트 작성
```

예를 들어 문의 접수 API라면:

```
POST /api/v1/support/inquiries
```

MockMvc로 확인할 것:

```
정상 요청이면 201
title 없으면 400
content 없으면 400
응답에 success=true
응답 data.status=RECEIVED
```

이렇게 하면 팀원이 나중에 실수로 응답 구조를 바꿔도 테스트가 잡아줘.

MockMvc를 너무 늦게 쓰면 이미 API가 많이 만들어진 뒤라 테스트 작성이 부담돼.

그러니까 API 하나 만들 때마다 같이 붙이는 게 제일 좋아.

추천 시점:

```
각 Controller를 구현한 직후
또는 PR 올리기 전
핵심 API부터 우선 적용
```

초기 팀 프로젝트에서는 모든 API를 다 테스트하려고 하지 말고, 중요한 것부터 해.

우선순위:

```
로그인/회원가입
인증 필요한 API
노트 CRUD
문의 접수
결제/요금제 관련 API
Kafka 이벤트를 발생시키는 API
```

---

**3단계: 개발 환경이 늘어나기 시작하면 - Docker Compose**

Docker는 언제 하냐?

초기부터 해도 좋지만, 너무 처음에 Docker에 매달리면 시간이 많이 날아갈 수 있어.

내 추천은 이거야.

```
각 서비스가 최소 1~2개 API를 갖고
DB 연결이 필요해지고
팀원마다 로컬 환경 차이가 생기기 시작할 때
Docker Compose를 만든다
```

즉 지금 단계에서도 DB, Kafka 때문에 곧 필요해질 가능성이 높아.

처음 Docker Compose는 단순하게 시작하면 돼.

```
services:
  postgres:
  kafka:
  user-service:
  note-service:
```

초기에는 프론트까지 Docker에 넣지 않아도 돼.

프론트는 로컬에서:

```
npm run dev
```

백엔드와 DB/Kafka만 Docker로:

```
docker compose up postgres kafka user-service note-service
```

이렇게 해도 충분해.

처음부터 프론트까지 Docker로 묶으면 핫리로드, node_modules, 빌드 속도 때문에 스트레스가 생길 수 있어.

추천 순서:

```
1. DB만 Docker
2. Kafka 추가
3. 백엔드 서비스들 Docker
4. 나중에 전체 docker compose up으로 통합
5. 배포 단계에서 프론트 Docker화
```

Docker를 쓰는 목적은 이거야.

```
팀원 모두 같은 DB/Kafka 환경 사용
서비스 포트 통일
환경변수 통일
MSA 통합 실행 편의성 확보
```

추천 시점:

```
DB를 쓰는 서비스가 2개 이상 생길 때
Kafka를 붙이기 직전
팀원이 “내 컴퓨터에서는 안 돼”를 말하기 시작할 때
```

---

**4단계: 서비스 간 후속 작업이 생기면 - Kafka**

Kafka는 처음부터 무조건 붙일 필요는 없어.

Kafka는 “비동기 이벤트가 진짜 필요한 순간”에 붙이면 돼.

예를 들어 지금은 이렇게 해도 돼.

```
프론트 -> User-Service
프론트 -> Note-Service
```

REST API로 충분하다.

그런데 이런 요구가 생기면 Kafka가 필요해져.

```
노트 생성 후 자동 요약
노트 수정 후 검색 인덱스 갱신
회원가입 후 환영 알림
문의 접수 후 관리자 알림
결제 완료 후 구독 상태 변경
```

이건 한 API 요청 안에서 모두 처리하면 느려지고 결합이 강해져.

예를 들어 노트 생성 API에서 AI 요약까지 직접 처리하면:

```
노트 저장
AI 요약 요청
요약 저장
응답
```

사용자는 오래 기다려야 해.

Kafka를 쓰면:

```
노트 저장
note.created 이벤트 발행
바로 응답

AI-Service가 나중에 note.created 소비
요약 생성
summary.created 이벤트 발행
```

이게 MSA다운 구조야.

추천 시점:

```
서비스 간 직접 호출이 늘어나기 시작할 때
한 API 요청 이후 후속 작업이 여러 서비스로 퍼질 때
실패해도 나중에 재처리 가능한 작업이 있을 때
```

초기 Kafka 이벤트 후보:

```
user.created
note.created
note.updated
note.deleted
support.inquiry.created
ai.summary.completed
payment.completed
```

처음에는 Kafka를 모든 곳에 쓰지 마.

이벤트 1~2개만 먼저 뚫어.

추천 첫 Kafka 적용 후보는:

```
note.created -> AI-Service가 자동 요약
```

또는

```
support.inquiry.created -> Notification/Admin 쪽 알림
```

이런 식으로 눈에 보이는 흐름이 좋다.

---

**5단계: Kafka 이벤트가 정해지면 - AsyncAPI**

AsyncAPI는 Kafka를 쓰기 전이나 동시에 작성하면 좋아.

근데 현실적으로는 이렇게 하면 좋아.

```
이벤트 후보 도출
이벤트 이름 정하기
payload 초안 만들기
AsyncAPI 작성
Producer/Consumer 구현
```

즉 AsyncAPI는 Kafka 구현 전에 계약서로 먼저 잡는 게 이상적이야.

예를 들어:

```
topic: support.inquiry.created
producer: User-Service
consumer: Admin-Service, Notification-Service
payload:
  eventId
  eventType
  occurredAt
  data.inquiryId
  data.userId
  data.title
```

이걸 AsyncAPI에 적어두면 Admin-Service 담당자가 이렇게 알 수 있어.

```
아, 나는 support.inquiry.created topic을 구독하면 되는구나.
payload.data.inquiryId를 보면 문의 ID를 알 수 있구나.
```

AsyncAPI를 안 쓰면 각자 감으로 개발하게 돼.

그러면 이런 문제가 생겨.

```
Producer는 inquiryId라고 보냄
Consumer는 supportId라고 받을 줄 앎
topic 이름도 서로 다르게 알고 있음
날짜 포맷도 다름
```

추천 시점:

```
Kafka 이벤트를 실제 구현하기 직전
최소 이벤트명/topic/payload/producer/consumer가 정해졌을 때
```

---

전체 추천 로드맵을 하나로 정리하면 이거야.

```
현재 극초기
1. 프론트는 분리하지 않는다.
2. 백엔드 서비스별 책임만 확실히 나눈다.
3. 핵심 REST API부터 OpenAPI로 정리한다.
4. 구현한 Controller는 MockMvc로 명세 일치 테스트를 만든다.

조금 진행된 후
5. DB와 백엔드 실행 환경을 Docker Compose로 묶는다.
6. 서비스 간 후속 작업이 보이면 Kafka 이벤트 후보를 뽑는다.
7. 이벤트 계약을 AsyncAPI로 작성한다.
8. Kafka Producer/Consumer를 구현한다.
9. 이벤트 테스트를 붙인다.
```

현실적인 우선순위는 이렇게 잡으면 돼.

```
이번 주:
OpenAPI 초안 + 핵심 API 구현 + MockMvc 일부

다음 주:
Docker Compose로 DB/User-Service/Note-Service 실행 통일

그다음:
Kafka 붙일 이벤트 1~2개 선정
AsyncAPI 초안 작성
Producer/Consumer 구현
```

제일 피해야 하는 건 이거야.

```
OpenAPI도 없는데 프론트/백이 각자 감으로 개발
Kafka 이벤트 이름도 없는데 Producer/Consumer부터 구현
Docker 환경도 없는데 각자 로컬 DB 포트 다르게 사용
테스트 없이 API 응답 구조 계속 바뀜
```

이러면 팀플에서 반드시 꼬인다.

반대로 제일 좋은 흐름은 이거야.

```
먼저 계약을 정한다.
작게 구현한다.
테스트로 계약을 지킨다.
Docker로 실행 환경을 맞춘다.
Kafka는 필요한 이벤트부터 점진적으로 붙인다.
```

결론:

```
프론트는 지금 분리하지 마.
OpenAPI는 지금 바로 시작.
MockMvc는 API 구현 직후.
Docker는 DB/서비스가 늘어나는 지금~곧.
Kafka는 서비스 간 후속 작업이 생길 때.
AsyncAPI는 Kafka 이벤트 구현 직전 또는 동시에.
```