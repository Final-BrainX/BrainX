# BrainX

> AI 기반 지식 관리 플랫폼  

BrainX는 사용자가 공부하거나 일하면서 적어 둔 노트, 메모, 자료를 한곳에 모으고, AI가 자동으로 요약, 분류, 연결, 검색, 대화까지 도와주는 지식 관리 플랫폼입니다. 이름은 Brain(뇌) + X(탐험/미지)에서 왔으며, 사용자의 지식 우주를 탐험하는 자율형 세컨드 브레인을 지향합니다.

이 README는 두 가지 목적을 가집니다.

1. 저장소에 처음 들어온 개발자가 BrainX의 제품 목표, 구조, 실행 방법을 빠르게 이해하게 한다.
2. AI와 함께 개발할 때도 항상 같은 제품 방향, 같은 MSA 경계, 같은 계약 우선 원칙을 기준으로 작업하게 한다.

## Product Vision

BrainX의 한 줄 정의

**RAG형 오토 브레인: 사용자가 적으면 AI가 맥락을 이해하고 자동으로 연결, 정리, 탐색 경로를 만들어 주는 지식 플랫폼**

BrainX는 기존 도구의 중간 지점이 아니라, AI 도구와 노트 도구의 장점을 합친 세 번째 선택지입니다.

| 구분 | 예시 | 잘하는 것 | 한계 |
| --- | --- | --- | --- |
| AI 도구 | ChatGPT, Claude | 질문 답변, 글 요약 | 내 자료의 장기 저장, 구조화, 검색이 약함 |
| 노트 도구 | Obsidian, Notion | 저장, 정리, 수동 검색 | 연결 자동화와 RAG 대화가 제한적임 |
| BrainX | BrainX | 저장 + AI 정리 + 자동 연결 + RAG 대화 | 사용자가 생각에 집중하도록 만드는 것이 목표 |

### 타 플랫폼과의 차별점

타 플랫폼은 사용자가 직접 `[[ ]]` 링크를 만들고 구조를 관리하는 수동형 세컨드 브레인에 가깝습니다. BrainX는 AI와 RAG가 문서 맥락을 이해해 자동으로 링크 후보, 클러스터, 마인드맵, 근거 기반 답변을 만들어 주는 자율형 오토 브레인을 목표로 합니다.

| 구분 | 타 플랫폼 | BrainX |
| --- | --- | --- |
| 핵심 컨셉 | 수동형, 로컬형 세컨드 브레인 | 자율형, 초연결형 RAG 오토 브레인 |
| 지식 연결 | 사용자가 직접 링크 작성 | AI가 맥락 분석 후 연결 후보와 그래프 생성 |
| 정보 탐색 | 폴더, 수동 그래프, 키워드 검색 | RAG 챗봇, 시맨틱 검색, 요약 기반 탐색 |
| 시간 흐름 | 정적인 문서 중심 | 과거/현재 변화와 성장 흐름 시각화 |
| AI 연동 | 외부 플러그인 의존 | ChatGPT, Claude, Gemini 등 모델 전환 지향 |
| 생태계 | 로컬 중심 | Notion, Obsidian, 블로그, 외부 앱 연동 지향 |

## Core Concepts

- **RAG형 오토 브레인**: AI가 내 문서를 이해하고 자동으로 연결, 정리, 추천하는 자율 두뇌
- **Brain Exploration**: 우주의 별처럼 흩어진 지식 노드를 항해하듯 탐색하는 경험
- **Digital Twin Brain**: 사용자의 생각 흐름과 지식 구조를 현실 서비스에 복제한 AI 쌍둥이 뇌
- **Open AI Knowledge Hub**: 모든 AI 플러그인과 생산성 앱을 연결하는 개방형 지식 허브

## Current Repository Map

```text
BrainX/
├─ brainx-next/           # 현재 주력 Next.js 프론트엔드 프로토타입
├─ brainX_front/          # 이전 Vite/React 프론트엔드 실험 코드
├─ brainX_back/           # Spring Boot MSA 백엔드 워크스페이스
│  ├─ User-Service/       # 인증/사용자 서비스 (포트 8080)
│  ├─ Gateway-Service/    # 프론트 단일 진입점/API 라우팅 서비스 (포트 8088)
│  ├─ Ingestion-Service/  # 가져오기/내보내기 서비스 (포트 8083) — 구현 중
│  ├─ Workspace-Service/  # 노트/폴더/그래프 원장 서비스 (포트 8082) — 구현 중
│  └─ Commerce-Service/   # 결제/구독/플랜 서비스 (포트 8084) — 구현 중, Toss Payments 연동
├─ contracts-v2/          # OpenAPI/AsyncAPI SSOT 계약 문서
├─ infra/aws-dev/         # AWS 개발환경 Terraform + GitHub Actions 배포 구성
└─ BrainX-Design/         # Next.js + iframe 기반 디자인 프로토타입 (포트 3000)
                          # Notion 가져오기 UI 구현됨 (BrainX-Design 전용, brainx-next와 별도)
```

`brainX_back/identity-access-service`, `brainX_back/knowledge-workspace-service`는 제거 예정이므로 새 개발 기준에서 제외합니다. 백엔드 개발은 아래 MSA 서비스 경계를 기준으로 진행합니다.

### 로컬 Kafka

`brainX_back/docker-compose.yml`에는 로컬 Kafka broker가 들어 있습니다. 호스트에서는 `localhost:9092`, 컨테이너 내부에서는 `kafka:9092`로 접근합니다. 1차 Kafka 범위에서는 기존 동기 흐름을 그대로 유지하고, 이벤트 발행은 서비스 플래그로 켜는 방식입니다. `BRAINX_EVENTS_OUTBOX_ENABLED=true`이면 Workspace-Service와 Commerce-Service가 outbox row를 Kafka로 흘리고, `BRAINX_EVENTS_PRODUCER_ENABLED=true`이면 Ingestion-Service가 `IntegrationConnected`, `ImportJobCompleted`, `ImportJobFailed`를 발행합니다. `BRAINX_EVENTS_CONSUMER_ENABLED=true`이면 Intelligence-Service가 workspace note 이벤트, `CaptureReceived`, note link 이벤트, folder 이벤트, `UserDeletionRequested`를 소비합니다. 작업 요약은 [`brainX_back/KAFKA_IMPLEMENTATION_SUMMARY.md`](brainX_back/KAFKA_IMPLEMENTATION_SUMMARY.md)에 둡니다. `ImportJobRequested`는 앞으로의 async worker 흐름에서 다룹니다.
`Admin-Service`가 Docker Compose로 뜰 때 관리자 모니터링의 Kafka lag는 `KAFKA_BOOTSTRAP_SERVERS=kafka:9092`, `BRAINX_KAFKA_MONITORING_CONSUMER_GROUP_ID=intelligence-service` 기준으로 읽습니다. 배포 compose에서도 같은 값을 `admin-service` 환경변수로 주입하며, 호스트에서 직접 `Admin-Service`를 실행할 때만 `localhost:9092` 기본값을 사용합니다.

## Frontend: brainx-next

`brainx-next`는 BrainX의 현재 주력 프론트엔드입니다. Next.js App Router 기반이며, 실제 백엔드 연결 전에도 localStorage와 mock seed data로 주요 사용 흐름을 체험할 수 있게 구성되어 있습니다.

- `next.config.mjs`에서 Turbopack root를 `brainx-next` 폴더로 고정해, 루트에 다른 lockfile이 있어도 개발 서버가 잘못된 워크스페이스 루트를 잡지 않도록 했습니다.
- 관리자 콘솔 mock 기준으로 관리자 계정 이메일 입력, 미확인 문의 수 배지, 답변 완료 문의의 답변 입력 숨김, 환불 시 무료 플랜 전환, 로그인 기기 국가만 표시, 구독 다음 결제일의 월간/연간 표기를 반영했습니다.
- 관리자 생성 계정의 이메일은 로그인 후 프로필 이메일 칸까지 그대로 이어지도록 맞췄고, Billing 화면과 Admin 화면에서는 구독 시작일과 다음 결제일을 주기별(월간 30일, 연간 365일)로 표시합니다.
- 관리자 모니터링 화면에는 검은색 `status-line` 업데이트 문구, 최근 14일 활성 사용자/매출 그래프, Excel 호환 리포트 다운로드가 추가되었습니다.
- 관리자 모니터링 우측 레일에는 관리자 목록 아래 게임 채팅형 메시지함이 있으며, 전체 발송/선택 발송과 unread `SMS` 건수, `읽음` 모달을 함께 지원합니다.
- 환불은 관리자 사유를 함께 전달하고, 환불 안내 메일 발송과 Commerce 구독의 `free` 전환을 기준으로 사용자 화면이 주기적으로 최신 플랜을 다시 읽어오도록 맞췄습니다.
- Commerce 환불은 `REFUNDED` 상태를 DB 체크 제약에 포함하도록 보정했고, 결제사에서 이미 취소된 결제라면 로컬 원장과 구독 상태를 `환불 완료 + free 전환`으로 재동기화하도록 처리했습니다.
- `/notes` 우측 인라인 AI는 질문 모드와 작성 모드를 지원하며, 작성 요청은 Intelligence Service의 `DRAFT` inline assist action으로 현재 편집기 커서에 스트리밍 삽입됩니다.

### Tech Stack

- Next.js `16.2.7`
- React `19.2.7`
- TypeScript `5.8.x`
- Tailwind CSS `3.4.x`
- lucide-react 아이콘
- TipTap, BlockNote, Shiki 에디터 실험 코드 포함
- Playwright dev dependency 포함

### Main Screens

| Route | Screen | 역할 |
| --- | --- | --- |
| `/` | Landing | BrainX 소개 및 진입 |
| `/login`, `/signup`, `/onboarding` | Auth | 이메일 인증, 로그인, OAuth, 온보딩 UI |
| `/home` | Home | 지식 통계, 즐겨찾기, 최근 노트, AI 추천 연결 |
| `/notes`, `/notes/[id]` | Note Editor | TipTap 기반 리치 에디터. 표/Mermaid/이미지/위키링크/문서 타이포그래피, 폴더 드래그앤드롭을 지원. 본문 저장 포맷(HTML/JSON/Markdown)은 아직 설계 결정 대상 |
| `/graph` | Graph | 노트 링크 기반 인터랙티브 지식 그래프, 클러스터/시간 필터, AI 연결/두 개념 wiki-link 기반 징검다리 추천 |
| `/chat` | AI Chat | 노트 근거 기반 RAG 채팅 UX, 모델 전환 UI, source note 표시, 제목+개인 노트 톤 AI 초안 작성 및 Workspace 노트 저장 |
| `/import` | Import | 파일/외부 서비스 가져오기 UX |
| `/billing` | Billing | 플랜/결제 UX |
| `/settings` | Settings | 환경설정 UX |
| `/support` | Support | 문의 생성/조회 API 연동 준비 |
| `/admin` | Admin | 사용자/결제/토큰/문의 관리 화면 UX |
| `/editor-lab` | Editor Lab(테스트 전용) | 노트 기능 실험실, 실제 서비스 페이지 아님 |

### Frontend State Model

현재 핵심 클라이언트 상태는 `components/brainx-provider.tsx`에서 관리합니다.

- `brainx_notes_v1`: 노트 목록, 제목, 마크다운, 링크, 태그, 클러스터, 버전
- `brainx_theme_v1`: 다크/라이트 테마
- `brainx_sidebar_collapsed_v1`: 사이드바 접힘 상태
- `brainx_auth_session_v1`: 로그인 세션 mock/API 연동 상태

노트 seed와 그래프 파생 로직은 `lib/brainx-data.ts`에 있습니다.

- `BrainXNote`: 노트 도메인 타입
- `CLUSTERS`: 지식 클러스터 정의
- `seedNotes()`: 초기 노트 데이터
- `deriveGraphEdges()`: 노트 본문, 태그, 위키링크, 제목 유사도를 함께 분석해 의미 관계 그래프 edge 생성
- `createNoteSeed()`, `updateNoteDerived()`: 노트 생성/수정 파생값 관리

`deriveGraphEdges()`는 단순 링크만 보지 않고 `REFERENCE`, `RELATED`, `PARENT`/`CHILD`, `CAUSE`/`RESULT`, `WORKFLOW`, `PROJECT`, `TAG`, `SIMILAR` 관계를 weight와 reason과 함께 산출한다. 그래프 UI와 SSOT의 `/api/v1/graph` 계약은 이 의미 관계를 전제로 한다.

### Frontend API Boundary

프론트는 `NEXT_PUBLIC_API_BASE_URL`을 통해 API 서버와 연결합니다. 값이 비어 있으면 같은 origin 기준으로 요청합니다.

현재 구현된 API 클라이언트 파일:

- `lib/auth-api.ts`: 이메일 인증, 회원가입, 로그인, 로그아웃, 토큰 갱신, OAuth, 온보딩
- `lib/support-api.ts`: 문의 목록/생성/상세 조회
- `lib/user-api.ts`: 사용자 계정/마이페이지 계열 API, 관리자 공지 알림함 조회/읽음 처리
- `lib/ingestion-api.ts`: Notion OAuth 연결/콜백, 페이지 목록 조회, 가져오기 작업 생성/상태 조회
- `lib/workspace-api.ts`: 노트 단건 조회 (Notion 가져오기 결과를 노트 데모에 반영하는 용도)
- `lib/commerce-api.ts`: 플랜 목록/내 구독 조회, 결제 체크아웃 세션 생성, Toss 결제 승인 confirm, 구독 변경/취소

새 프론트 API 코드는 화면 컴포넌트에 직접 fetch를 흩뿌리지 말고 `lib/*-api.ts` 계층에 먼저 둡니다.

> Notion 가져오기는 `components/utility/import-screen.tsx`에서 `lib/ingestion-api.ts`를 통해 실제 Ingestion-Service(`POST /api/v1/imports/notion/oauth/authorize` 등)와 연동되어 있습니다. OAuth는 팝업 창(`window.open` + `postMessage`)으로 처리하며 `app/notion-callback/page.tsx`가 콜백을 받아 부모 창에 결과를 알리고 스스로 닫힙니다.
>
> 요금제 업그레이드는 `components/utility/account-settings-modal.tsx`의 `UpgradePanel`에서 `lib/commerce-api.ts`를 통해 실제 Commerce-Service와 연동되어 있습니다. Toss Payments는 호스팅 체크아웃 URL이 아니라 SDK + 서버 confirm 모델이라, 결제도 Notion OAuth와 동일하게 팝업 창(`app/billing/checkout/*`)으로 처리하고 `postMessage`로 결과를 알린 뒤 닫습니다.

#### BrainX-Design 프론트 (별도 프로토타입)

`BrainX-Design`은 Next.js로 `public/legacy/index.html`을 iframe으로 서빙하는 구조로, `brainx-next`와는 독립적인 디자인 프로토타입입니다. 현재 Notion OAuth 가져오기 기능이 구현되어 있으며 개발 서버는 포트 3000에서 실행됩니다.

- `next.config.mjs`에서 `/api/identity/*` → 8080, `/api/ingestion/*` → 8083으로 프록시
- Notion 콜백 처리: `app/notion-callback/page.jsx`
- Ingestion API 클라이언트: `public/legacy/app/ingestion.js` (`window.ingestionApi`)

## Backend MSA Direction

백엔드는 Spring Boot 기반 MSA로 구성합니다. 서비스명은 레포/패키지/계약 문서에서 같은 의미로 유지해야 합니다.

### Base Versions

- Java `21`
- Spring Boot `3.5.x`
- Gradle `8.x`
- PostgreSQL `16.x`

현재 `User-Service`는 Spring Boot `3.5.15`, Java toolchain `21` 설정을 사용합니다.

### Service Ownership

| Service | 담당 | 책임 | 상태 |
| --- | --- | --- | --- |
| User-Service | 채영 | 사용자 신원, 인증, 로그인/회원가입/온보딩, 계정 보안, 동의, 마이페이지, 노트 사용 통계, 로그인 세션 Redis 기록 | 구현 중 (포트 8080) |
| Admin-Service | 채영 | 관리자 페이지, 사용자 관리, 결제 관리, 환불, 모니터링, 사용자 통계, 문의 답장, 모델별 LLM 토큰 소비량 | API shell 구현 중 (포트 8085) |
| Intelligence-Service | 영진 | 시맨틱 검색, RAG, LLM 호출, AI 추천, 요약, 토큰 사용량 service 처리 | 구현 중 (포트 8086) |
| Ingestion-Service | 환유 | 파일 처리, 변환, 가져오기, 내보내기, 외부 연동 | 구현 중 (포트 8083) |
| Commerce-Service | 환유 | 결제 API, 플랜, 구독/상품 관리 | 구현 중 (포트 8084) — Toss Payments 결제, 플랜 조회/변경/취소 |
| Workspace-Service | 예진, 진주, 채영 | 노트, 폴더, 링크, 그래프, 지식 워크스페이스 원장 | 구현 중 (포트 8082) — 노트/폴더/링크/그래프/공유 API |

- User-Service의 기본 access token TTL은 10시간(`JWT_ACCESS_EXPIRATION=36000000`)입니다. refresh token은 기존 7일 정책을 유지합니다.

### Service Boundary Rules

- Browser/external client는 `/api/v1/**` public API를 기준으로 호출합니다.
- 현재 Ingestion-Service의 publish helper는 구현 기준으로 `/v1/publish-jobs`를 사용합니다. 이 엔드포인트는 `noteContent`를 받아 즉시 clipboard-ready content를 반환하는 동기 API입니다.
- Service-to-service 동기 호출은 `/internal/v1/**` 하위로 분리합니다.
- 서비스 간 상태 전파는 가능하면 이벤트 기반으로 처리합니다.
- Workspace-Service는 노트 원장의 authoritative source입니다.
- AI, import, extension, MCP 등에서 노트를 변경할 때도 Workspace command API를 통해 처리합니다.
- 토큰 사용량은 public command API로 직접 노출하지 않고 event 기반으로 집계합니다.
- 서비스 책임이 겹치면 DB를 공유하지 말고 API/이벤트 계약을 먼저 정의합니다.

## API Contract SSOT

API와 이벤트 계약의 기준은 `contracts-v2`입니다.

- `contracts-v2/brainx-openapi.ssot.yaml`: public REST API와 internal sync API 계약
- `contracts-v2/brainx-asyncapi.ssot.yaml`: service-to-service event contract
- `contracts-v2/brainx-ssot-readme.md`: SSOT 구성과 검증 방법
- `contracts-v2/brainx-asyncapi.html`: AsyncAPI 문서 산출물

공통 public prefix는 `/api/v1`입니다. 단, 현재 구현된 Ingestion publish helper는 `/v1/publish-jobs`입니다. 인증은 Access Token Bearer 방식과 Refresh Token/HttpOnly Secure Cookie 전략을 기준으로 합니다. AI 응답 스트리밍은 SSE를 기준으로 둡니다.

공통 응답 기본형:

```json
{
  "success": true,
  "data": {},
  "message": "요청이 성공적으로 처리되었습니다."
}
```

공통 에러 상세형. `traceId`와 `details`는 서비스 구현에 따라 optional입니다.

```json
{
  "error": {
    "code": "NOTE_VERSION_CONFLICT",
    "message": "The note was changed by another device.",
    "traceId": "trc_01J...",
    "details": {
      "serverVersion": 17,
      "clientBaseVersion": 16
    }
  }
}
```

공통 이벤트 envelope:

```json
{
  "eventId": "evt_01J...",
  "eventType": "NoteContentSaved",
  "eventVersion": 1,
  "occurredAt": "2026-06-05T08:00:00Z",
  "producer": "workspace-service",
  "tenantId": "ten_...",
  "userId": "usr_...",
  "correlationId": "req_...",
  "causationId": null,
  "idempotencyKey": null,
  "payload": {}
}
```

## Development Principles for Humans and AI

이 프로젝트에서 새 기능을 만들 때는 아래 순서를 우선합니다.

1. 제품 목표가 BrainX의 핵심 문장과 맞는지 확인합니다: **적기만 하세요. 연결과 정리는 AI가 합니다.**
2. 기능이 어느 MSA 서비스 책임인지 먼저 결정합니다.
3. public API, internal API, async event 중 어떤 계약이 필요한지 정합니다.
4. `contracts-v2`의 OpenAPI/AsyncAPI를 먼저 맞춥니다.
5. 프론트는 `brainx-next`의 현재 UX와 상태 모델을 유지하며 연결합니다.
6. 백엔드는 서비스별 DB 소유권을 지키고 다른 서비스 DB를 직접 참조하지 않습니다.
7. AI 기능은 결과만 보여주지 말고 근거 노트, 연결 이유, 요약을 함께 노출합니다.
8. 노트/그래프/검색/채팅은 같은 지식 원장을 바라봐야 합니다.
9. `noteId`는 Workspace-Service PostgreSQL 원장에서 발급된 값을 PostgreSQL, Neo4j 같은 그래프 projection, Vector DB/RAG 인덱스, RAG citation, 프론트 그래프 상태에서 공통으로 사용합니다.
10. Neo4j 같은 그래프 DB는 원장이 아니라 projection/read model입니다. 실제 노트와 링크 생성/수정/삭제는 Workspace-Service command API와 이벤트를 통해 반영합니다.

### Frontend Coding Rules

- 새 화면은 `brainx-next/app` route와 `components/*-screen.tsx` 패턴을 따릅니다.
- 공통 UI는 `components/brainx-ui.tsx`의 버튼, 카드, 배지, 아이콘 패턴을 재사용합니다.
- 도메인 seed/type/파생 로직은 `lib/brainx-data.ts` 또는 별도 `lib/*` 파일에 둡니다.
- API 호출은 `lib/*-api.ts`에 둡니다.
- mock UX를 만들더라도 나중에 실제 API로 교체하기 쉬운 함수 경계를 둡니다.
- 사용자에게 AI 결과를 보여줄 때는 source note, relevance, 연결 이유를 함께 설계합니다.

### Backend Coding Rules

- Java 21, Spring Boot 3.5.x, Gradle 8.x 기준을 지킵니다.
- 서비스별 bounded context를 넘는 직접 DB 접근을 금지합니다.
- 외부 공개 API는 `/api/v1`, 내부 동기 API는 `/internal/v1`로 분리합니다.
- 이벤트는 공통 envelope와 idempotency를 고려합니다.
- 충돌 가능성이 있는 노트 저장은 version 기반 충돌 처리를 고려합니다.
- 인증/인가, 토큰, 동의, 마이페이지는 User-Service 책임입니다.
- 노트 본문, 링크, 폴더, 그래프 원장은 Workspace-Service 책임입니다.

## Getting Started

### Local Backend Environment

```powershell
cd C:\Edu\Final\BrainX\brainX_back
Copy-Item .env.example .env
Copy-Item .\env\gateway-service.env.example .\env\gateway-service.env
Copy-Item .\env\user-service.env.example .\env\user-service.env
Copy-Item .\env\workspace-service.env.example .\env\workspace-service.env
Copy-Item .\env\ingestion-service.env.example .\env\ingestion-service.env
Copy-Item .\env\commerce-service.env.example .\env\commerce-service.env
docker compose up -d
```

`.env`는 각자 로컬 값만 넣고 Git에 올리지 않습니다. `JWT_SECRET`은 User-Service, Workspace-Service, Ingestion-Service가 같은 값을 사용해야 합니다.
`env/*.env`도 서비스별 로컬 실행 값이므로 Git에 올리지 않습니다.

DB만 Docker로 띄우려면 `docker compose up -d`를 사용합니다. 백엔드 앱까지 컨테이너로 함께 띄우려면 아래처럼 `apps` 프로필을 사용합니다.

```powershell
cd C:\Edu\Final\BrainX\brainX_back
docker compose --profile apps up -d --build
```

`apps` 프로필은 `Gateway-Service`(8088), `User-Service`(8080), `Workspace-Service`(8082), `Ingestion-Service`(8083), `Commerce-Service`(8084), `Admin-Service`(8085)를 모두 실행합니다. 이 방식으로 앱을 띄우면 각 서비스를 로컬 Gradle/IDE에서 따로 실행할 필요는 없습니다. 프론트엔드는 계속 `brainx-next`에서 실행하면 됩니다.

Admin-Service만 Docker로 실행하려면 아래 명령을 사용합니다.

```powershell
cd C:\Edu\Final\BrainX\brainX_back
docker compose --profile apps up -d --build admin-service
```

관리자 프론트(`BrainX-Admin/brainx-admin-next`)는 기본적으로 실제 Admin-Service 프록시를 사용합니다. 개발 중에만 `.env.local`에 `ADMIN_MOCK_ENABLED=true`를 명시했을 때 mock API를 켜고, 그 외에는 `ADMIN_SERVICE_URL=http://localhost:8085`로 프록시합니다. 단, 관리자 메시지(`/api/v1/admin/messages*`)는 Admin-Service가 아직 준비되지 않은 개발 구간에서도 레일 채팅을 검증할 수 있도록 `brainx-admin-next`의 API route가 `.dev-data/admin-messages.json` 공용 로컬 파일 저장소를 직접 처리하며, 브라우저별 localStorage fallback 없이 같은 메시지 원장을 공유합니다.

각 서비스는 자기 폴더 기준으로 실행하면 아래 파일을 자동으로 읽습니다.

| Service | 자동 import |
| --- | --- |
| Gateway-Service | `../.env`, `../env/gateway-service.env` |
| Admin-Service | `../.env`, `../env/admin-service.env` |
| User-Service | `../.env`, `../env/user-service.env` |
| Workspace-Service | Docker 실행 시 `env/workspace-service.env`; 로컬 IDE 실행 시 동일한 값을 Run Configuration에 지정 |
| Ingestion-Service | `../.env`, `../env/ingestion-service.env` |
| Commerce-Service | `../.env`, `../env/commerce-service.env` |

`JWT_SECRET`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT`, `DB_DRIVER`, `JPA_DDL_AUTO`처럼 모든 서비스가 공유하는 값은 `.env`에 둡니다. 서비스별 논리 DB 이름도 `.env`의 `USER_DB_NAME`, `WORKSPACE_DB_NAME`, `INGESTION_DB_NAME`, `COMMERCE_DB_NAME`으로 관리합니다.
Admin-Service는 관리자 시드용 `SEED_ADMIN_LOGIN_ID`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`도 `../env/admin-service.env`에서 함께 읽습니다.
Docker Compose로 앱을 실행할 때는 앱 컨테이너에만 `POSTGRES_HOST=postgres`를 자동으로 덮어씁니다. 로컬 Gradle/IDE 실행은 `.env`의 `POSTGRES_HOST=localhost`를 그대로 사용합니다.

기본 DB 접속 정보:

| Service | DB | JDBC URL |
| --- | --- | --- |
| User-Service | PostgreSQL | `jdbc:postgresql://localhost:5432/brainx_user` |
| Workspace-Service | PostgreSQL | `jdbc:postgresql://localhost:5432/brainx_workspace` |
| Ingestion-Service | PostgreSQL | `jdbc:postgresql://localhost:5432/brainx_ingestion` |
| Commerce-Service | PostgreSQL | `jdbc:postgresql://localhost:5432/brainx_commerce` |

그래프 projection/read model용 Neo4j도 Docker Compose로 함께 실행됩니다. Neo4j는 Workspace-Service의 PostgreSQL 원장을 대체하지 않으며, 노트/링크 이벤트를 바탕으로 갱신되는 그래프 조회 저장소입니다.

| Store | 용도 | Local URL |
| --- | --- | --- |
| Neo4j Browser | 그래프 projection 확인 및 Cypher 실행 | `http://localhost:7474` |
| Neo4j Bolt | 백엔드 서비스 접속 URI | `bolt://localhost:7687` |

기본 로컬 계정은 `.env`의 `NEO4J_USERNAME`, `NEO4J_PASSWORD`로 관리합니다. Docker Compose 내부에서 Workspace-Service는 `bolt://neo4j:7687`로 접속하고, 로컬 IDE 실행 시에는 `bolt://localhost:7687`을 사용합니다.
Workspace-Service의 Neo4j projection은 노트 본문 `[[...]]` 위키링크, 수동 `NoteLink`, 태그, 제목/본문 유사도를 다시 계산해 `LINKED` 관계를 MERGE 방식으로 갱신합니다. 노트가 수정되면 전체 그래프를 다시 만들지 않고, 변경된 노트와 그 노트를 직접 참조하는 관련 노트만 증분 갱신합니다.

DB 접속 계정과 비밀번호는 루트 `.env`의 `POSTGRES_USER`, `POSTGRES_PASSWORD`를 모든 서비스가 공통으로 사용합니다. 각 서비스는 자기 `application.yml`에서 `.env`의 DB host/port와 서비스별 DB name을 조합해 JDBC URL을 만듭니다.

### Backend: Gateway-Service (포트 8088)

프론트가 바라보는 단일 API 진입점입니다. Docker Compose 내부에서는 서비스명으로 라우팅합니다.

| Path | Target |
| --- | --- |
| `/api/v1/auth/**`, `/api/v1/users/**`, `/api/v1/support/**` | User-Service |
| `/api/v1/notes/**`, `/api/v1/folders/**`, `/api/v1/graph/**`, `/api/v1/share-links/**` | Workspace-Service |
| `/api/v1/imports/**`, `/api/v1/exports/**`, `/v1/publish-jobs/**` | Ingestion-Service |
| `/api/v1/plans/**`, `/api/v1/subscriptions/**`, `/api/v1/users/me/subscription` | Commerce-Service |
| `/api/v1/admin/**` | Admin-Service |

Gateway는 보호 API에 대해 `Authorization: Bearer <access-token>`을 검증하고, 통과한 요청에 내부 식별 헤더를 추가합니다. Workspace 체험 API는 비회원도 사용할 수 있게 Gateway가 guest session cookie(`brainx_guest_id`)를 발급하고 내부 `X-Guest-Id` 헤더를 추가합니다.

| 구분 | Path |
| --- | --- |
| 공개 | `OPTIONS /**`, `/actuator/health`, `/actuator/info`, `/api/v1/auth/**`, `/api/v1/plans`, `/api/v1/plans/**` |
| 보호 | 위 공개 경로를 제외한 모든 Gateway 라우팅 경로 |

검증 성공 시 내부 서비스로 전달되는 헤더:

| Header | Value |
| --- | --- |
| `X-User-Id` | JWT `sub` |
| `X-User-Email` | JWT `email` |
| `X-User-Role` | JWT `role` |
| `X-Guest-Id` | Gateway-issued guest id for non-member Workspace trial requests |

클라이언트가 임의로 보낸 `X-User-*`, `X-Guest-Id` 헤더는 Gateway에서 제거한 뒤 JWT 클레임 또는 Gateway guest cookie 기준으로 다시 설정합니다. 로그인/회원가입/OAuth 콜백은 JWT가 아직 없으므로 `/api/v1/auth/**` 공개 경로로 유지합니다.

Workspace-Service는 내부 식별 헤더를 `CurrentActor`로 해석합니다.

- 회원 요청: `X-User-Id`가 있으면 `actorType=USER`, `actorId=<userId>`
- 비회원 요청: `X-Guest-Id`가 있으면 `actorType=GUEST`, `actorId=<guestId>`
- 프런트의 `NEXT_PUBLIC_WORKSPACE_DEV_USER_ID`는 로컬 비로그인 개발 우회용으로만 사용합니다. 실제 로그인 세션(access token)이 있으면 이 dev header로 덮어쓰지 말고 bearer 토큰 기준 사용자 컨텍스트를 그대로 전달해야 사용자별 Workspace/PostgreSQL 데이터가 섞이지 않습니다.

비회원 노트/폴더/링크/그래프 데이터는 체험용 임시 데이터로 취급합니다. Redis in-memory 저장소가 도입되면 guest actor의 Workspace 데이터는 Redis에 저장하고 TTL 만료 또는 세션 종료로 사라지게 합니다. 회원 데이터는 계속 Workspace-Service의 PostgreSQL 원장에 저장합니다.

User-Service도 같은 Redis를 사용합니다. 인증 토큰 자체는 PostgreSQL `RefreshToken` 원장과 JWT에 남기고, 실제 로그인 세션 이력은 Redis에 저장해 관리자 페이지와 내부 API가 읽습니다. 다만 Redis 세션 이력 기록이 실패해도 로그인/OAuth 콜백/토큰 재발급/로그아웃 응답 자체는 계속 성공하도록 best-effort로 처리합니다.
Docker Compose로 실행할 때는 `user-service` 컨테이너가 `REDIS_HOST=redis`를 사용해야 하며, `localhost`를 쓰면 컨테이너 자기 자신을 보게 되어 로그인/OAuth 흐름이 500으로 실패할 수 있습니다.

```powershell
cd C:\Edu\Final\BrainX\brainX_back\Gateway-Service
.\gradlew.bat bootRun
```

### Frontend

```powershell
cd C:\Edu\BrainX\brainx-next
npm install
npm run dev
```

기본 Next.js 개발 서버는 보통 <http://localhost:3000>에서 실행됩니다.

타입 체크:

```powershell
cd C:\Edu\BrainX\brainx-next
npm run typecheck
```

### Backend: User-Service (포트 8080)

```powershell
cd C:\Edu\Final\brainX_back\User-Service
.\gradlew.bat bootRun
```

테스트:

```powershell
cd C:\Edu\Final\brainX_back\User-Service
.\gradlew.bat test
```

User-Service의 Redis 역할은 다음과 같습니다.

- 로그인 성공 시 실제 세션 기록 저장
- JWT `sid` 기준으로 세션의 마지막 활동 시간 갱신
- 로그아웃/세션 종료 시 세션 상태 종료 표시
- 관리자 상세 조회용 실제 로그인 세션, IP, 기기, 위치 이력 제공
- Redis 장애나 세션 이력 파싱 실패가 나더라도 auth 응답은 막지 않고, 이력 기록만 건너뜁니다.
- `SecurityConfig`와 `PasswordEncoderConfig`를 분리하고 `CustomUserDetailsService`가 `UserService`를 직접 의존하지 않도록 정리해, 인증 필터 생성 과정에서 순환 참조가 생기지 않도록 했습니다.

관리자 페이지는 `Admin-Service`를 통해 `User-Service`의 내부 API `/internal/v1/users/{userId}/login-sessions`를 조회합니다. 실제 로그인 기록이 없으면 가짜 데이터로 채우지 않고 빈 목록을 그대로 반환합니다.

사용자 상세의 메모 수/저장량/최근 활동은 `Admin-Service`가 `Workspace-Service`의 내부 API `GET /internal/v1/workspace/users/{userId}/stats`를 호출해 실데이터로 채웁니다(Gateway 라우트: `/internal/v1/workspace/**` → `WORKSPACE_SERVICE_URL`).

### Backend: Ingestion-Service (포트 8083)

Notion/Obsidian 가져오기, 내보내기 담당 서비스. `application.yml`에 Notion OAuth 자격증명이 기본값으로 포함되어 있습니다.

```powershell
cd C:\Edu\Final\brainX_back\Ingestion-Service
.\gradlew.bat bootRun
```

주요 엔드포인트 (프록시 경유 시 `/api/ingestion/v1/...`, 직접 호출 시 `/v1/...`):

| Method | Path | 설명 |
| --- | --- | --- |
| POST | `/v1/imports/notion/oauth/authorize` | Notion OAuth URL 생성 |
| POST | `/v1/imports/notion/oauth/callback` | Notion OAuth 콜백 처리 |
| GET  | `/v1/imports/notion/pages` | 연동된 Notion 페이지 목록 |
| POST | `/v1/imports/notion/jobs` | Notion 페이지 가져오기 |
| POST | `/v1/imports/obsidian/jobs` | ZIP 가져오기 (Obsidian vault 한정이 아닌 범용 ZIP) |
| POST | `/v1/imports/file/jobs` | 단일 파일 가져오기 (CSV/PDF/Text/Markdown/HTML/Word) |
| GET  | `/v1/imports/{importJobId}` | 가져오기 작업 상태 조회 |
| POST | `/v1/assets/upload-sessions` | 파일 업로드 세션 생성 |
| PUT  | `/v1/assets/upload-sessions/{uploadSessionId}/binary` | 파일 바이너리 업로드 |
| POST | `/v1/assets/upload-sessions/{uploadSessionId}/complete` | 파일 업로드 완료 처리 |
| GET  | `/v1/assets/{assetId}` | 파일 상세 조회 |
| GET  | `/v1/assets/{assetId}/file` | 파일 원본 바이너리 스트리밍 (PDF 임베드 뷰어 iframe이 사용) |

### Backend: Commerce-Service (포트 8084)

결제/구독/플랜 담당 서비스. PostgreSQL 16의 `brainx_commerce` 데이터베이스가 미리 생성되어 있어야 합니다. `application.yml`에 Toss Payments 샌드박스 테스트 키가 기본값으로 포함되어 있습니다.

```powershell
cd C:\Edu\Final\brainX_back\Commerce-Service
.\gradlew.bat bootRun
```

주요 엔드포인트:

| Method | Path | 설명 |
| --- | --- | --- |
| GET  | `/api/v1/plans` | 플랜 목록 조회 |
| GET  | `/api/v1/users/me/subscription` | 내 구독 정보 조회 |
| POST | `/api/v1/subscriptions/checkout-sessions` | 결제 체크아웃 세션 생성 (Toss SDK 구동에 필요한 clientKey/orderId/amount 반환) |
| POST | `/api/v1/subscriptions/checkout-sessions/{id}/confirm` | Toss 결제 승인 confirm (서버 간 호출로 결제 확정, 성공 시 플랜 즉시 업그레이드) |
| POST | `/api/v1/subscriptions/change` | 구독 플랜 변경 (결제 없이 즉시 변경 — 테스트/다운그레이드용) |
| POST | `/api/v1/subscriptions/cancel` | 구독 취소 |

자세한 결제 흐름과 DB 스키마는 `brainX_back/Commerce-Service/README.md`를 참고하세요.

### Backend: Admin-Service API Contract

`BrainX-Admin/brainx-admin-next`가 실제 데이터로 동작하기 위한 관리자 API는 `contracts-v2/brainx-openapi.ssot.yaml`의 `/api/v1/admin/**`로 확정합니다. Admin-Service는 관리자 화면 전용 read model/orchestration layer이며, 원장 데이터는 각 소유 서비스가 유지합니다.

현재 관리자 화면은 실제 백엔드 데이터를 기준으로 사용자 플랜, 메모 수, 가입일, 최근 활동을 표시하며, 시간 표시는 모두 `Asia/Seoul` 기준으로 통일합니다. 사용자 목록의 플랜은 결제/환불 이력으로 추정하지 않고 Commerce-Service의 현재 구독 상태를 그대로 보여 주며, 상세 패널과 같은 값이 나오도록 맞췄습니다. 사용자 목록의 메모 수는 `Workspace-Service` note 원장 개수, 최근 활동은 실제 마지막 로그인 세션 시간으로 채웁니다. 사용자 상세의 로그인 기기는 같은 기기/IP 접속을 하나로 합쳐 최신 접속 시간만 갱신하고, 최근 2건만 노출합니다. 사용자 관리 화면에서는 정지된 계정을 바로 정지 취소할 수 있습니다.
관리자 프런트는 `/favicon.ico`를 자체 route로 제공하며, 사용자 상세 활동 내역은 같은 문구와 같은 시각이 겹쳐도 React key 충돌이 나지 않도록 렌더링 키를 보강했습니다.
현재 로그인한 관리자의 이름/역할/이메일이 변경되면 관리자 관리 화면, 모니터링 레일의 관리자 목록, 왼쪽 사이드바 프로필, 로컬 세션 값이 함께 갱신되도록 맞췄습니다.
관리자 프로필 사진은 로컬 저장소 값을 공통 상태로 올려, 오른쪽 프로필 레일에서 바꾸면 왼쪽 사이드바와 모니터링 레일 관리자 목록의 현재 로그인 관리자 아바타도 즉시 같이 바뀝니다.
모니터링 대시보드의 Kafka 큐 대기 Lag는 추정값이 아니라 Kafka consumer group의 현재 lag를 읽어오며, 일별 스냅샷에도 함께 저장해서 목록과 상세가 같은 상태를 보게 했습니다.
Kafka lag 카드의 live 값은 별도 `/api/v1/admin/monitoring/kafka-lag`로 읽어 UI를 가볍게 유지하고, 브로커 연결 실패는 `연결 실패`, committed offset이 없으면 `미집계`, 실제 lag가 0일 때만 `정상`으로 보여 줍니다. 운영 알람 기준은 `1,000 msgs` 이상 경고, `5,000 msgs` 이상 심각으로 두었습니다.
모니터링 서비스 체크에는 `Intelligence-Service`도 포함해 AI 응답/지연을 실제 health probe 기준으로 보여 줍니다.
모니터링 overview의 KPI delta는 직전 persisted snapshot 대비 증감률로 계산하고, 서비스 uptime은 최근 health snapshot 표본(최대 20건)에서 `DOWN`이 아닌 상태(`UP`, `DEGRADED`) 비율로 계산합니다. 프런트는 overview 응답의 KPI를 다시 mock으로 조립하지 않고 Admin-Service가 내려준 값을 그대로 사용합니다. 이 persisted snapshot은 Admin-Service가 매일 `23:59`에 스케줄러로 저장하며, 대시보드 조회 자체는 더 이상 새 스냅샷을 쓰지 않습니다.
서비스 체크 상태는 `UP`(정상 응답 + 허용 지연), `DEGRADED`(비정상 응답 또는 지연 임계치 초과), `DOWN`(호출 실패) 3단계로 통일합니다.
overview의 차트 응답은 숫자 배열만 내려주지 않고 `periodLabel`/`timezone`/`source`를 함께 내려, 프런트가 `최근 14일` 같은 고정 문구를 하드코딩하지 않고 Admin-Service overview 메타데이터를 그대로 사용합니다.
overview의 실데이터 차트는 `Commerce-Service`의 `/internal/v1/billing/revenue-trend`와 `User-Service`의 `/internal/v1/users/growth-summary`를 source of truth로 사용합니다. 활성 사용자 추이는 User-Service의 Redis 로그인 세션 이력에서 최근 N일 일별 활성 사용자를 집계하고, 내부 시계열 API가 실패할 때만 Admin persisted snapshot 값으로 fallback합니다.
관리자 모니터링 화면은 상단 선형 차트를 활성 사용자 추이로, 하단 막대 차트를 매출 분석으로 분리해 overview의 `activeUserTrend`와 `revenueTrend`를 각각 실데이터 그대로 사용합니다.
overview summary는 결제/사용자 지표 외에 `Workspace-Service`의 `/internal/v1/workspace/monitoring/summary`를 통해 전체 노트 수, 총 저장량, 오늘 생성된 노트 수를 함께 내려줍니다. 관리자 모니터링의 Workspace 원장 카드와 일부 실시간 로그는 이 내부 API의 최근 활동 목록을 사용합니다.

| 화면 | Method | Path | 소유 데이터/연동 |
| --- | --- | --- | --- |
| 모니터링 | GET | `/api/v1/admin/dashboard/overview` | Gateway/User/Commerce/Workspace/Ingestion/Intelligence 상태와 KPI 집계, Kafka lag |
| 사용자 목록 | GET | `/api/v1/admin/users` | User-Service 계정 + Workspace note/storage + Commerce current subscription plan |
| 사용자 상세 | GET | `/api/v1/admin/users/{userId}` | 프로필, 플랜, 로그인 세션, 활동 이력 |
| 플랜 변경 | PATCH | `/api/v1/admin/users/{userId}/plan` | Commerce-Service 구독 변경, `SubscriptionChanged` |
| 계정 상태 | PATCH | `/api/v1/admin/users/{userId}/status` | User-Service 상태 변경, 정지 사유/정지 일수 반영 |
| 탈퇴 처리 | POST | `/api/v1/admin/users/{userId}/withdrawal` | User-Service 삭제 요청, `UserDeletionRequested` |
| 일괄 처리 | POST | `/api/v1/admin/users/bulk-actions` | 플랜 변경/정지/재활성화/탈퇴/공지 |
| 문의 목록 | GET | `/api/v1/admin/support/tickets` | 관리자 문의 목록 |
| 문의 상세/배정 | GET/PATCH | `/api/v1/admin/support/tickets/{ticketId}` | 담당자/상태 변경, `SupportTicketUpdated` |
| 문의 답변 | POST | `/api/v1/admin/support/tickets/{ticketId}/replies` | 로그인 관리자 이름으로 답변 등록, 사용자 문의 상세의 ADMIN 메시지로 표시 |
| 결제 KPI | GET | `/api/v1/admin/billing/summary` | Commerce 이번 달 매출/활성 유료 구독/MRR/실패 건 집계 |
| 결제 내역 | GET | `/api/v1/admin/billing/payments` | Commerce 결제 원장. `method`는 PG 제공자명이 아니라 Toss 응답에서 해석한 사용자 선택 결제수단(카카오페이, 토스페이, 신용카드, 체크카드 등) |
| 환불 | POST | `/api/v1/admin/billing/payments/{paymentId}/refund` | Commerce 환불, `PaymentRefunded`. `amount`/`reason`을 받아 Toss 환불을 호출하고 환불 완료 메일을 사용자에게 발송 |
| 결제 재시도 | POST | `/api/v1/admin/billing/payments/{paymentId}/retry` | Commerce 결제 재시도, `PaymentSucceeded`/`PaymentFailed` |
| 구독 현황 | GET | `/api/v1/admin/billing/subscriptions` | Commerce 구독 원장. 무료 플랜은 제외하고 유료 구독만 표시 |
| 결제 실패 추적 | GET | `/api/v1/admin/billing/payment-failures` | Commerce 실패 사유/재시도 횟수 |
| 요금제 목록 | GET | `/api/v1/admin/billing/plans` | Commerce 플랜 카탈로그 |
| 요금제 가격 | PATCH | `/api/v1/admin/billing/plans/{planId}` | Commerce 플랜 가격 변경, `PlanPriceChanged` |
| 관리자 프로필 | GET/PATCH | `/api/v1/admin/me`, `/api/v1/admin/me/profile` | 관리자 본인 정보 |
| 관리자 비밀번호 | PATCH | `/api/v1/admin/me/password` | User-Service credential 변경, `PasswordChanged` |
| 관리자 목록 | GET | `/api/v1/admin/admin-accounts` | 모든 관리자(owner 포함) 조회 가능, 모니터링 화면 관리자 목록에서 사용 |
| 관리자 추가/수정/삭제 | POST/PATCH/DELETE | `/api/v1/admin/admin-accounts`, `/api/v1/admin/admin-accounts/{adminId}` | 최고관리자(owner)만 호출 가능 |
| 관리자 메시지 목록/전송 | GET/POST | `/api/v1/admin/messages` | 모니터링 우측 레일 채팅창, 전체 발송/선택 발송 |
| 관리자 메시지 읽음 | POST | `/api/v1/admin/messages/{messageId}/read` | 우측 프로필 `SMS` 건수와 `읽음` 모달 |

사용자 알림함은 `brainx-next` 상단 종 아이콘과 연결되며, 관리자 `SEND_NOTICE` 일괄 액션이 실행되면 `GET /api/v1/users/me/notifications`, `POST /api/v1/users/me/notifications/{notificationId}/read`로 확인할 수 있습니다.

관리자 목록 조회(GET)는 모든 관리자에게 열려 있지만, 계정 생성/수정/삭제는 owner 역할만 가능합니다. 최고관리자가 아닌 관리자는 관리자 관리 화면 자체에 진입할 수 없습니다(사이드바 메뉴 비노출 + 화면 가드). 관리자 메시지는 모든 관리자가 조회/전송/읽음 처리할 수 있고, 선택 발송 메시지는 수신 대상과 발신자에게만 노출됩니다.

AsyncAPI에는 Admin 화면에서 새로 필요한 `PaymentRefunded`, `PlanPriceChanged`, `SupportTicketUpdated` 이벤트를 추가했습니다. 결제/플랜 이벤트는 Commerce-Service가 발행하고, 문의 상태 변경 이벤트는 Admin-Service가 발행합니다.

### Frontend: BrainX-Design (포트 3000)

```powershell
cd C:\Edu\Final\BrainX-Design
npm install  # 최초 1회
npm run dev
```

### Contract Docs

OpenAPI lint:

```powershell
cd C:\Edu\BrainX\contracts-v2
npx @redocly/cli lint brainx-openapi.ssot.yaml
```

AsyncAPI validate:

```powershell
cd C:\Edu\BrainX\contracts-v2
npx @asyncapi/cli validate brainx-asyncapi.ssot.yaml
```

Swagger UI 문서 서버:

```powershell
cd C:\Edu\BrainX\contracts-v2
npx --yes swagger-ui-watcher .\brainx-openapi.ssot.yaml -p 18080 -h 127.0.0.1 --no-open
```

AsyncAPI 문서 서버:

```powershell
cd C:\Edu\BrainX\contracts-v2
npx --yes http-server . -p 18081 -a 127.0.0.1
```

## Current Notes

- **(2026-06-29 SSOT 계약 변경) 폴더 cascade 삭제 / draft folderId / 이어쓰기 floating UI**:
  - 분석 대상: `contracts-v2/brainx-openapi.ssot.yaml`, `brainX_back/Workspace-Service`(`WorkspaceController`/`WorkspaceService`/`NoteDraftService`/`Note`/`Folder`/`NoteRepository`), `brainx-next`(`workspace-api.ts`/`NotesWorkspace.tsx`/`NoteEditor.tsx`).
  - **폴더 삭제 정책 변경(API 계약 변경)**: `DELETE /api/v1/folders/{folderId}`가 하위 폴더/노트를 부모로 승격하던 것을 그만두고, 하위 폴더(중첩 포함)와 그 안의 노트를 전부 cascade로 삭제하도록 바꿨다. 요청 바디(`FolderDeleteRequest`)를 없애고 노트 삭제와 동일한 `mode`(trash|permanent) 쿼리 파라미터로 통일했으며, 응답을 `DeleteFolderData`(삭제된 폴더/노트 id 목록)로 바꿨다. 같은 actor의 Redis draft(아직 flush 전인 노트)도 같은 폴더 id 집합 기준으로 함께 삭제해 orphan을 막는다.
  - **Redis draft에 folderId 추가(API 계약 변경)**: `NoteDraftSaveRequest`/`NoteDraftData`에 `folderId`를 추가해, draft 저장/flush/guest claim 전 과정에서 노트-폴더 배치가 유지되게 했다. guest 폴더는 claim 시 `Folder.userId`만 갱신(폴더 id는 그대로)하므로 draft.folderId 참조가 끊기지 않는다 — 그 결과 게스트 때 폴더에 넣어둔 노트가 회원가입 직후에도 같은 폴더 배치로 보인다.
  - **이어쓰기 위치를 floating UI로 전환**: ProseMirror Decoration.widget(텍스트 흐름 안에 꽂혀 있던 방식)을 없애고, SlashCommandMenu/CursorContinueButton과 같은 `coordsAtPos` 기반 React 컴포넌트로 바꿔 캐럿 오른쪽 아래에 절대 위치로 띄운다 — 문서 구조/흐름에 영향이 전혀 없다.
- **(2026-06-28 버그 수정) 노트 삭제 API 연결 / 헤딩 위쪽 여백 / 이어쓰기 위치 / 게스트 폴더 승계**:
  - 분석 대상: `brainx-next/lib/workspace-api.ts`, `NotesWorkspace.tsx`, `app/globals.css`, `NoteEditor.tsx`, `brainX_back/Workspace-Service` `WorkspaceController`/`WorkspaceService`/`NoteDraftPersistenceService`/`Folder`.
  - 노트 삭제(`handleDeleteNote`)가 클라이언트 메모리만 바꾸고 백엔드를 호출하지 않던 문제를 고쳤다 — `DELETE /api/v1/notes/{noteId}?mode=trash`를 호출해 성공해야만 화면을 정리하고, guest나 아직 Postgres로 flush되지 않은 draft-only 노트는 컨트롤러가 Redis draft만 지우고 성공으로 응답하도록 백엔드도 함께 고쳤다.
  - 헤딩(H1~H3) `margin-top`이 헤딩 자신의 큰 폰트 기준 1.2~1.4em이라(실제로는 본문의 2배 이상) "# "를 입력해 그 줄이 헤딩으로 바뀌는 순간 줄 자체가 크게 밀려 보이던 문제를 0.25~0.3em으로 좁혀 해결했다. 아래쪽 여백은 변경하지 않았다.
  - "이어쓰기" AI 제안 위젯이 inline-flex라 커서 바로 뒤 같은 줄에 끼어들어 작성 중인 줄을 가리던 문제를 flex(block)로 바꿔 커서 아래 자기 줄로 내렸다(ProseMirror decoration 위치/구조는 그대로, CSS만 변경).
  - 게스트는 노트는 Postgres에 못 만들지만(`memberUserId()` 정책) 폴더 생성에는 그 제약이 없어, 게스트가 만든 폴더가 Postgres에 guestId 소유로 남아 회원가입 후에도 안 보이는 gap을 발견했다 — `claimGuestDrafts`가 note draft와 같은 트랜잭션에서 폴더 소유자도 user로 옮기도록 `WorkspaceService.reassignGuestFolders`를 추가했고, 프론트의 폴더 생성/이름변경/이동/삭제도 이번에 처음으로 백엔드에 연결했다(이전엔 폴더 API 자체가 호출되지 않고 있었음).
- **(2026-06-28 버그 수정) 제목 공백 정규화 / 헤딩 뒤 빈 줄 / 게스트→유저 노트 승계 새로고침 수정**:
  - 분석 대상: `brainx-next/components/notes/EditorPanel.tsx`, `NotesExplorer.tsx`, `NoteEditor.tsx`, `NotesWorkspace.tsx`, `lib/auth-api.ts`.
  - 노트 제목을 전부 지우고 blur하면 `t && ...` 가드 때문에 `onTitleChange`가 전혀 호출되지 않고 입력창만 빈 문자열로 굳어버리던 버그를 고쳤다 — 빈 제목 commit 시 탭바와 동일한 기준("제목 없음")으로 정규화한다(NotesExplorer의 동일한 rename 로직도 함께 수정).
  - tiptap v3 StarterKit이 기본 포함하는 `TrailingNode` 확장이 "마지막 노드가 단락이 아니면 빈 단락을 자동 삽입"하는데, heading은 글 쓰는 동안 거의 항상 마지막 노드라 `#`+Space/슬래시 명령으로 헤딩을 만들 때마다 보이지 않는 빈 단락이 끼어들어 다음 줄이 밀려 보였다 — `trailingNode: { notAfter: ["heading"] }`로 범위를 좁혀 표/이미지 등 다른 블록 뒤의 기존 동작은 유지했다.
  - 회원가입 2단계(`signupWithEmail` → `completeOnboarding`) 중 실제 "가입 완료" 시점인 `completeOnboarding`에는 게스트 draft claim 호출이 빠져 있어 가입 직후 화면에 게스트 노트가 안 보일 수 있었다 — 호출을 추가했다. 또한 `NotesWorkspace`가 마운트 후 로그인 상태 변화를 구독하지 않아, 같은 탭에서 로그인/로그아웃해도 이전 actor의 탭/노트가 화면에 남아있던 문제를 막기 위해, claim 시도 직후와 `clearAuthSession()`(로그아웃) 시점에 기존 `brainx:notes-refresh` 이벤트를 `resetWorkspace:true`로 재사용해 워크스페이스를 비우고 새 actor 기준으로 다시 불러오게 했다.
  - Workspace-Service의 노트 조회/수정/삭제는 이미 모두 `(userId, noteId)` 쌍으로 스코프돼 있어(`NoteRepository.findByNoteIdAndUserId` 등) guest/user 데이터가 DB 레벨에서 섞일 수 있는 경로는 없었다 — 다만 노트 "삭제" UI(`NotesWorkspace.handleDeleteNote`)가 현재 백엔드 호출 없이 클라이언트 메모리에서만 제거되는 상태라는 점을 확인했다(별도 후속 작업 필요, 이번 수정 범위 아님).
- **(2026-06-28 버그 수정) 빈 패널 콘텐츠 잔존 + 슬래시 명령어 H1~H3 미적용 수정**:
  - 분석 대상: `brainx-next/components/notes/PaneTreeRenderer.tsx`, `NotesWorkspace.tsx`, `SlashCommandMenu.tsx`.
  - `PaneTreeRenderer`가 leaf의 탭이 0개일 때 `node.noteId`(닫힌 뒤에도 정리 안 된 leaf 자체 필드)나 `notes[0]`(조회 실패 시 임의의 다른 노트)로 fallback 하던 부분을 제거했다 — 탭이 0개면 항상 "노트 없음" 상태로 렌더링되도록 고쳐, 모든 탭을 닫아도 직전 노트 내용이 패널에 남아있던 문제를 막았다.
  - "탭이 0개인지" 판정(`isWorkspaceEmpty`, 세션 하이드레이션의 "완전히 빈 세션인지" 체크, `nextActiveId` 후보 선정)을 모두 `paneTabs` 객체 전체가 아니라 `root` 트리에 실제로 존재하는 leaf 기준으로 통일했다 — 트리에서 이미 제거된 고아 `paneTabs` 항목이 남아있어도 Welcome 판정이 깨지지 않는다.
  - 슬래시 명령어(`/h1`,`/h2`,`/h3`)로 헤딩을 적용하면 `HeadingLevelSync`(헤딩 본문의 실제 "#" 글자 수로 level을 되돌려 동기화하는 라이브 마크다운 프리뷰 로직)가 "#" 마커 텍스트가 없다는 이유로 즉시 평문으로 되돌리던 버그를 고쳤다 — `# `/`## `/`### ` 마커 텍스트를 직접 삽입한 뒤 `setNode`를 호출해 `# `+Space 단축키와 동일한 경로를 타게 했다.
- **(2026-06-28 버그 수정) 노트 워크스페이스 Welcome 보드/세션 복원 레이스 컨디션 수정**:
  - 분석 대상: `brainx-next/components/notes/NotesWorkspace.tsx`.
  - URL(`/notes/[id]`)로 노트를 열 때, 서버에서 노트 목록을 불러오는 `loadFromServer` 콜백이 컴포넌트 마운트 시점에 캡처한 옛 `state.activeId`(paneId)를 그대로 써서, 그 사이 localStorage 세션이 복원되며 트리의 실제 paneId가 바뀌면 존재하지 않는 paneId에 노트를 매달아버리는 문제가 있었다(화면엔 반영되지 않고 고아 `paneTabs` 항목만 남아, 직전 세션이 Welcome 상태였을 경우 "노트를 클릭/이동해도 Welcome처럼 보이는" 현상으로 나타남). 항상 최신 트리를 들고 있는 `latestSessionRef`에서 현재 보이는 paneId를 다시 계산하도록 고쳤다.
  - 탭을 모두 닫아 Welcome 상태로 돌아가는 전환은 세션 자동저장 디바운스(350ms)를 거치지 않고 즉시 localStorage에 기록하도록 바꿔, 그 안에 새로고침하면 직전(탭이 남아있던) 세션이 복원되어 닫은 탭/분할이 되살아나던 문제를 막았다.
  - API/계약 변경 없음 — 순수 프론트엔드 상태 동기화 버그 수정이라 SSOT/OpenAPI 변경은 없다.
- **(2026-06-28 구현) Workspace Redis dirty draft owner 탐색을 SCAN으로 전환**:
  - 분석 대상: `contracts-v2/brainx-openapi.ssot.yaml`, `contracts-v2/brainx-asyncapi.ssot.yaml`, `README.md`, `Workspace-Service` Redis draft 구현.
  - `NoteDraftService.userIdsWithDirtyDrafts()`가 `redisTemplate.keys("workspace:note:dirty:user:*")`로 Redis 전체 키 공간을 블로킹 탐색하던 문제를 `SCAN MATCH workspace:note:dirty:user:* COUNT 500` 기반 점진 탐색으로 바꿨습니다.
  - API 응답 계약은 그대로이며, OpenAPI에는 백그라운드 PostgreSQL flush 대상 사용자 탐색이 `KEYS` 대신 `SCAN`을 사용한다는 구현 기준을 명시했습니다.
- **(2026-06-25 SSOT 계약 변경) BrainX-Admin 실제 데이터 연동용 관리자 API 확정**:
  - 분석 대상: `contracts-v2/brainx-openapi.ssot.yaml`, `contracts-v2/brainx-asyncapi.ssot.yaml`, `README.md`, `BrainX-Admin/brainx-admin-next`의 현재 UI 더미 데이터.
  - OpenAPI: `/api/v1/admin/**` 아래에 관리자 대시보드, 사용자 목록/상세/플랜 변경/상태 변경/탈퇴/일괄 처리, 문의 상세/배정, 결제 KPI/내역/환불/재시도/구독/실패 추적/요금제 가격 수정, 관리자 프로필/비밀번호 변경 API를 추가했습니다.
  - AsyncAPI: `PaymentRefunded`, `PlanPriceChanged`, `SupportTicketUpdated` 이벤트를 추가했습니다. 기존 `SubscriptionChanged`, `PaymentSucceeded`, `PaymentFailed`, `SupportTicketReplied`, `NotificationRequested`, `PasswordChanged`, `UserDeletionRequested`는 그대로 재사용합니다.
  - 서비스 경계: Admin-Service는 관리자 화면용 read model/orchestration layer로 두고, 사용자 원장은 User-Service, 노트/저장소 통계는 Workspace-Service, 결제/구독/요금제 원장은 Commerce-Service가 유지합니다. Admin-Service는 Gateway 보호 경로 `/api/v1/admin/**` 뒤에서 내부 API/이벤트로 각 서비스와 동기화합니다.
  - 추가 확정: 요금제 관리 탭은 `GET /api/v1/admin/billing/plans`로 플랜 목록을 조회합니다. 결제 실패 안내 메일은 별도 결제 API를 만들지 않고 `POST /api/v1/admin/users/bulk-actions`의 `SEND_NOTICE` 액션으로 처리합니다.
- `brainx-next`의 일부 한글 UI 문자열은 현재 소스 파일에서 인코딩이 깨진 상태입니다. 기능 구조 분석은 가능하지만, 제품화 전에 UTF-8 기준으로 문구를 복구해야 합니다.
- `brainX_front`는 이전 Vite/React 구현으로 보이며, 신규 개발 기준은 `brainx-next`를 우선합니다.
- `brainX_back/identity-access-service`, `brainX_back/knowledge-workspace-service`는 제거 예정이므로 새 문서와 개발 계획에서는 제외합니다.
- DB는 PostgreSQL 16.x를 기준으로 하지만, 현재 `User-Service`에는 H2/MySQL/PostgreSQL runtime dependency가 함께 들어 있습니다. 서비스별 운영 DB 확정 시 정리합니다.
- **Ingestion-Service SSOT/구현 정합성 현황 (2026-06-28 기준)**:
  - 실제 구현 prefix는 `/api/v1/`로 SSOT와 일치 (컨트롤러 `@RequestMapping("/api/v1/imports")` 직접 확인).
  - `GET /api/v1/imports/notion/pages` 엔드포인트가 SSOT에 없었으나 추가 구현됨 → SSOT에 반영 완료.
  - Import job은 현재 구현 기준으로 동기 처리 중이며, `BRAINX_EVENTS_PRODUCER_ENABLED=true`일 때 완료/실패 결과를 `ImportJobCompleted`/`ImportJobFailed` Kafka 이벤트로도 발행합니다. `IntegrationConnected`도 Notion OAuth 저장 commit 이후 발행됩니다. `ImportJobRequested`는 async worker 기반 import로 전환할 때 도입합니다.
  - 노트 생성이 `bulkCreateNotesInternal` 대신 신규 `Workspace-Service`의 `POST /api/v1/notes`를 직접 호출 중 (구 `knowledge-workspace-service`가 아님). 정식 internal API 전환 필요.
  - `brainx-next` import 화면은 `lib/ingestion-api.ts`로 실제 API와 연동되어 있습니다 (더 이상 mock 아님). Notion OAuth는 팝업 + `postMessage` 방식.
  - **(2026-06-23 수정)** Notion 가져오기 완료 후 노트가 `/editor-lab`(테스트 전용 데모)에만 추가되고 실제 `/notes` 화면에는 보이지 않던 배선 문제를 고쳤습니다. `components/utility/import-screen.tsx`가 가져온 노트를 `/notes/{noteId}`로 바로 라우팅하도록 변경했고, `app/(app)/notes/layout.tsx`의 초기 탭 판별 로직이 mock 시드 데이터(`getNoteById`)에만 의존하던 것을 `NEXT_PUBLIC_NOTES_USE_MOCK=false`(실 백엔드 모드)에서는 URL의 noteId를 그대로 신뢰하도록 고쳐, `NotesWorkspace`의 `listNotes()` 결과로 막 가져온 노트도 정상적으로 열립니다.
  - **TEMP**: 실제 로그인 연동 전까지 `/api/v1/imports/notion/**`, `/api/v1/imports/{importJobId}`(GET)를 인증 없이 허용하고(`SecurityConfig` permitAll), 인증이 없으면 고정 `dev-test-user`로 동작하도록 임시 우회되어 있습니다. 코드에 `TEMP` 주석으로 표시. 실제 로그인 연동 완료 후 제거 필요.
  - **(2026-06-23 추가 수정, 계약 변경 없음)**: Notion 텍스트 멘션(`@페이지`)이 마크다운 변환 시 통째로 누락되던 버그를 고쳐 `[[제목]]` 위키링크로 변환되게 함(`NotionApiService.richText`). 하위 페이지 백링크 등록(`POST /api/v1/notes/{id}/links`)이 SSOT에 이미 required로 정의된 `createIfMissing` 필드를 빠뜨려 매번 400으로 실패하던 버그 수정(`WorkspaceApiClient.createNoteLink`) — SSOT는 원래부터 맞았고 구현만 따라가지 못했던 경우. Notion OAuth 콜백이 React Strict Mode로 중복 호출되어 같은 code로 토큰 교환을 두 번 시도하던 레이스 컨디션 수정(`app/notion-callback/page.tsx`). 가져온 노트가 `/notes` 화면에 새로고침 없이는 반영되지 않던 문제를 `brainx:notes-refresh` 커스텀 이벤트로 해결(`NotesWorkspace.tsx`, `import-screen.tsx`).
  - **(2026-06-23 신규 구현, SSOT 계약 변경 포함)**: `/import` 화면의 "콘텐츠 가져오기"(ZIP 드래그&드롭)와 "파일 기반 가져오기"(CSV/PDF/Text/Markdown/HTML/Word 버튼)가 그동안 프런트엔드 `setTimeout` 가짜 진행률만 보여주고 실제로는 아무것도 가져오지 않던 문제를 실제 동작하도록 구현했습니다.
    - 백엔드(Ingestion-Service): `Asset` 엔티티/로컬 디스크 스토리지(`AssetStorageService`, `ASSET_STORAGE_DIR` 환경변수)와 `AssetController`(`POST /api/v1/assets/upload-sessions`, `PUT .../binary`, `POST .../complete`)를 신규 구현. `ContentConverter`가 TXT/MD/HTML(Jsoup)/CSV(commons-csv → 마크다운 표)/PDF(PDFBox)/DOCX(POI)를 마크다운/텍스트로 변환하고, ZIP은 내부 항목을 모두 풀어 각각 노트로 만듭니다. `ImportJob.SourceType`에 `FILE` 추가, 신규 `POST /api/v1/imports/file/jobs` 추가(단일 파일 → 노트 1개, 또는 ZIP이면 항목별 노트). 기존 `POST /api/v1/imports/obsidian/jobs`는 "Job을 PENDING으로 저장만 하고 끝"이던 스텁을 실제 ZIP 추출 로직으로 교체(Obsidian vault 한정이 아니라 범용 ZIP을 지원하도록 일반화). 모두 Notion 가져오기와 동일하게 동기 처리하며, Kafka producer 활성화 시 완료/실패 이벤트를 추가 발행합니다.
    - SSOT(`brainx-openapi.ssot.yaml`): `createAssetUploadSession`/`completeAssetUpload`의 `x-implementation-status: not-implemented`를 제거하고 실제 동작을 설명하는 `x-implementation-note`로 교체. 사전 서명 URL을 위한 외부 스토리지(S3 등)가 아직 없어 `uploadUrl`이 자체 바이너리 업로드 경로를 가리키므로, 신규 `PUT /api/v1/assets/upload-sessions/{uploadSessionId}/binary` 엔드포인트를 SSOT에 추가했습니다. 신규 `POST /api/v1/imports/file/jobs` + `FileImportJobCreateRequest` 스키마 추가. `InternalNoteBulkCreateRequest.source` enum에 `FILE_IMPORT` 추가. `brainx-asyncapi.ssot.yaml`의 `ImportJobRequestedPayload.source` enum에 `FILE` 추가.
    - 프런트엔드(`brainx-next`): `lib/ingestion-api.ts`에 `uploadAndImportFile()`(업로드 세션 생성 → 바이너리 업로드 → 완료 처리 → ZIP이면 obsidian job, 아니면 file job 호출 → 완료까지 폴링)를 추가하고, `components/utility/import-screen.tsx`의 드롭존/파일 타입 버튼이 실제로 이 함수를 호출해 결과 노트로 라우팅하도록 수정. 데모 세션(`isNotionDemoSession()`)은 실제 자산 업로드 백엔드가 없으므로 기존 가짜 진행률 시뮬레이션을 그대로 유지합니다.
    - `getAsset`(`GET /api/v1/assets/{assetId}`)은 이후 PDF 뷰어 작업(바로 아래 항목)에서 구현되었습니다. `/api/v1/conversions*`는 여전히 범위 밖이라 `x-implementation-status: not-implemented`로 남아 있습니다.
    - **TEMP**: 위와 동일한 사유로 `/api/v1/imports/obsidian/**`, `/api/v1/imports/file/**`, `/api/v1/assets/**`를 인증 없이 허용(`SecurityConfig` permitAll) 추가.
  - **(2026-06-23 추가 구현, SSOT 계약 변경 포함) PDF를 옵시디언처럼 원본 그대로(전용 뷰어로) 보기**:
    - 백엔드: `GET /api/v1/assets/{assetId}`(상세 조회)와 신규 `GET /api/v1/assets/{assetId}/file`(원본 바이너리 스트리밍, SSOT에 새로 추가)을 구현. PDF를 가져오면 텍스트 추출 없이 노트의 `markdown` 필드에 `<div data-pdf-block="true" data-asset-id="..." data-file-name="...">` 임베드 마커 하나만 넣습니다(ZIP 안의 PDF도 동일— 별도 asset으로 저장 후 같은 마커 생성). `ContentConverter.sanitize()`로 PDFBox 추출 텍스트에 섞여 나오는 NUL(0x00) 바이트를 제거하는 버그도 함께 고쳤습니다(PostgreSQL UTF8 컬럼이 NUL을 거부해 노트 생성이 500으로 실패하던 문제).
    - 버그 수정: Spring Security 기본 `X-Frame-Options: DENY` 때문에 브라우저가 `<iframe src="...assets/.../file">`를 그릴 수 없던 문제를 `frame-ancestors 'self' http://localhost:3000 http://localhost:5173` CSP로 교체해 해결(`SecurityConfig`). `<iframe src>`/`<img src>` 같은 일반 브라우저 네비게이션은 Authorization 헤더를 보낼 수 없어 소유자(`userId`) 검증에 걸려 "파일을 찾을 수 없습니다"가 나던 문제도, 이 두 조회 엔드포인트만 소유자 검증 없이 assetId만으로 조회하도록 수정(`AssetService.getAssetForViewing`) — TEMP, 실제 로그인/쿠키 인증 도입 후 다시 넣어야 함.
    - 프런트엔드: `components/notes/PdfBlockNode.tsx`(Tiptap 커스텀 노드, 본문에 텍스트가 섞인 경우의 폴백용)와, PDF 단독 노트를 위한 `components/notes/PdfViewerPanel.tsx`(Tiptap 에디터를 전혀 띄우지 않는 전용 풀패널 뷰어)를 신규 작성. `EditorPanel.tsx`가 노트 본문이 PDF 임베드 마커 하나뿐인지(`parsePdfOnlyNote`) 판별해 그 경우 `NoteEditor` 대신 `PdfViewerPanel`을 렌더링하도록 분기. 뷰어는 패널 높이를 가득 채우고(`flex-1`), 헤더의 "큰 화면으로 보기" 버튼으로 Fullscreen API 전체화면 전환도 지원합니다.
    - SSOT(`brainx-openapi.ssot.yaml`): `getAsset`의 `x-implementation-status: not-implemented` 제거 후 구현 내용을 설명하는 `x-implementation-note`로 교체. 신규 `GET /api/v1/assets/{assetId}/file` 엔드포인트 추가(소유자 검증을 하지 않는 이유를 implementation-note에 명시). `requestObsidianImportJob`/`requestFileImportJob`의 implementation-note에 "PDF는 텍스트 추출 대신 임베드 마커로 노트를 만든다"는 내용 추가. AsyncAPI는 추가 변경 없음(이미 `FILE` enum 반영됨).
  - **(2026-06-24 추가 구현, SSOT 계약 변경 포함) 이미지/HTML도 PDF처럼 원본 그대로 보기**:
    - 문제: 이미지 파일을 가져오면 `ContentConverter.convertSingleFile`의 default 분기가 이미지 바이너리를 `new String(bytes, UTF_8)`로 변환해 노트 내용이 깨졌고, HTML은 Jsoup으로 텍스트만 추출해 원본 화면을 볼 수 없었습니다.
    - 백엔드(Ingestion-Service): `ContentConverter`에 `EmbedKind`(PDF/IMAGE/HTML/NONE) 개념을 도입해 `isImage`/`isHtml`/`embedKindOf`/`contentTypeFor`를 추가하고, ZIP 처리(`convertZip`)와 단일 파일 처리(`ImportService`) 양쪽에서 이미지/HTML도 PDF와 동일하게 텍스트 변환 없이 별도 asset으로 저장한 뒤 임베드 마커만 노트 본문에 넣도록 변경했습니다. 마커 형식은 `<div data-image-block="true" data-asset-id="..." data-file-name="...">` / `<div data-html-block="true" ...>`(PDF의 `data-pdf-block`과 동일 패턴). `AssetService.ensureContentType()`을 추가해 브라우저가 보낸 contentType이 부정확할 때 확장자 기준으로 보정합니다.
    - 프런트엔드(`brainx-next`): 기존 `ImageBlockNode.tsx`(pasted 이미지용 Tiptap 노드)가 `assetId` 속성도 받아 `GET /api/v1/assets/{assetId}/file`을 src로 렌더링하도록 확장(노트 에디터 안에 인라인으로 보임, PdfBlock과 달리 풀패널 전환은 하지 않음). PDF와 동일한 패턴으로 `components/notes/HtmlBlockNode.tsx`(Tiptap 노드)와 `components/notes/HtmlViewerPanel.tsx`(전용 풀패널 iframe 뷰어)를 신규 작성하고, `EditorPanel.tsx`에 `parseHtmlOnlyNote` 판별 분기를 추가했습니다.
    - SSOT(`brainx-openapi.ssot.yaml`): `requestObsidianImportJob`/`requestFileImportJob`의 implementation-note를 "PDF는..." → "PDF/이미지/HTML은..."으로 일반화하고 마커 3종을 모두 명시. `getAssetFile`의 description/implementation-note/x-consumers에 ImageBlock(`<img src>`)·HtmlBlock·HtmlViewerPanel 소비 사례를 추가. AsyncAPI는 추가 변경 없음(이벤트 페이로드와 무관한 동기 처리 내부 동작이라 스키마 영향 없음).
  - **(2026-06-24 추가 구현, SSOT 계약 변경 포함) 노트 탐색기 드래그&드롭 가져오기**:
    - `/import` 화면에만 있던 OS 파일 드롭존을 좌측 노트 탐색기(`NotesExplorer.tsx`)에도 추가했습니다. `dataTransfer.types`에 `"Files"`가 있을 때만 가로채 내부 노트/폴더 드래그(`draggable` 항목)와 구분하고, 현재 선택된 폴더로 가져옵니다. 새 `onDropFiles` prop을 통해 `NotesWorkspace.tsx`가 `lib/ingestion-api.ts`의 `uploadAndImportFile()`을 그대로 재사용해 처리하므로 백엔드 엔드포인트는 변경 없습니다. 데모(Notion demo) 세션에서는 지원하지 않는다는 토스트를 띄웁니다.
    - SSOT(`brainx-openapi.ssot.yaml`): 새 엔드포인트는 없으나, 새로 호출하는 프런트 화면을 반영하기 위해 `createAssetUploadSession`/`uploadAssetBinary`/`completeAssetUpload`/`getAsset`/`requestObsidianImportJob`/`requestFileImportJob`의 `x-consumers`에 `web.notes-explorer` 항목을 추가했습니다.
  - **(2026-06-24 추가 구현, SSOT 계약 변경 포함) ZIP 가져오기 시 내부 폴더 구조 재현**:
    - 문제: ZIP을 가져오면 내부 디렉터리 구조와 무관하게 모든 항목이 평탄하게 `targetFolderId` 하나에만 노트로 쌓였습니다(하위 폴더 구조가 사라짐).
    - 백엔드(Ingestion-Service): `WorkspaceApiClient`에 `createFolder(name, parentFolderId, jwtToken)`를 추가(Workspace-Service `POST /api/v1/folders` 호출). `ImportService`에 공용 `importZipEntries()`를 추가해 `createObsidianImportJob`/`createFileImportJob`(ZIP 분기)이 같은 로직을 쓰도록 정리했습니다. ZIP 항목의 전체 경로(`fullFileName`)에서 디렉터리 경로를 뽑아, 경로별로 폴더를 한 번만 생성(메모이즈)하면서 상위 폴더부터 재귀적으로 만들고, 각 노트는 자신의 원래 경로와 일치하는 폴더 밑에 생성됩니다. 빈 디렉터리(파일이 없는 폴더)는 ZIP 추출 단계에서 디렉터리 엔트리 자체를 건너뛰기 때문에 재현되지 않습니다.
    - SSOT(`brainx-openapi.ssot.yaml`): `requestObsidianImportJob`/`requestFileImportJob`의 `x-internal-sync-calls`에 `createFolder`(targetService: knowledge-workspace) 호출을 추가하고, implementation-note에 디렉터리 구조 재현 동작을 명시했습니다.
  - **(2026-06-24 SSOT 표기 오류 수정, 코드 변경 없음) `requestPublishJob`이 실제로는 구현되어 있었음**:
    - `POST /v1/publish-jobs`는 `PublishController`/`PublishService`로 이미 구현되어 있었는데(tistory는 직접 작성한 변환기로 마크다운→HTML 변환, notion/copy는 마크다운 원문 그대로 반환, 매번 동기적으로 `status: COMPLETED` 응답 — 실제 Tistory/Notion API 호출은 없고 클립보드 복사용 콘텐츠 + `openUrl`만 만들어줌), SSOT에는 `x-implementation-status: not-implemented`가 그대로 남아 있었습니다(바로 옆 `description` 필드는 이미 "Currently implemented..."라고 써 있어서 자기 자신과도 모순이었습니다).
    - SSOT(`brainx-openapi.ssot.yaml`): `x-implementation-status: not-implemented` 플래그를 제거하고, 실제 동작과 두 가지 미해결 격차를 설명하는 `x-implementation-note`를 추가했습니다 — (1) `brainx-next`에 이 API를 호출하는 코드가 전혀 없어 `web.note-editor`가 아직 실제 소비자가 아니라는 점, (2) `SecurityConfig`가 `/v1/publish-jobs/**`를 인증 없이 허용(`permitAll`)해서 SSOT가 요구하는 `bearerAuth`와 맞지 않는다는 점(컨트롤러는 미인증 시 `userId="anonymous"`로 처리).
  - **(2026-06-24 버그 수정, SSOT 계약 변경 포함) Notion 가져오기 이미지가 마크다운 텍스트로만 보이고 1시간 후 깨지던 문제**:
    - 문제 1(프런트): `NoteEditor.tsx`의 `markdownToHtml`이 애초에 `![alt](url)` 마크다운 이미지 문법을 전혀 처리하지 않아서, 그냥 일반 문단의 리터럴 텍스트(`![](https://...)` 그대로)로 보였습니다. Notion 가져오기뿐 아니라 마크다운 원문에 이미지 문법이 들어간 모든 노트에 영향이 있던 일반 버그입니다.
    - 문제 2(백엔드): Notion이 `"file"` 타입으로 호스팅하는 이미지의 `url`은 S3 presigned GET URL이라 1시간(`X-Amz-Expires=3600`) 후 만료됩니다 — 가져온 직후엔 보이다가 시간이 지나면 깨집니다.
    - 수정(프런트): `markdownToHtml`에 `![alt](url)` 줄을 인식하는 분기를 추가해 `<div data-image-block="true">...</div>`(기존 `ImageBlock` 노드)로 변환합니다. url이 `asset://{assetId}` 의사 스킴이면 절대 URL을 본문에 박아두지 않고 PdfBlock/HtmlBlock과 동일하게 `data-asset-id`만 채워서 렌더링 시점에 `getAssetFileUrl(assetId)`로 해석되게 합니다(`ImageBlockNode.tsx`가 이미 지원하던 패턴 재사용).
    - 수정(백엔드, `NotionApiService`): 이미지 블록이 `"file"` 타입이면 즉시 다운로드해 우리 자산(Asset)으로 영구 저장하고, 노트 마크다운에는 Notion url 대신 `![](asset://{assetId})`를 넣습니다. `"external"` 타입(Notion 바깥에 호스팅된 이미지)은 만료되지 않으므로 원본 url을 그대로 둡니다. 다운로드가 실패하면 가져오기 전체를 실패시키지 않고 원본(만료될 수 있는) url로 폴백합니다. `getPageMarkdown`/`convertBlocksToMarkdown`/`convertBlock`에 `userId` 파라미터를 추가해 `AssetService.persistDerivedAsset` 호출에 필요한 소유자를 전달합니다.
    - SSOT(`brainx-openapi.ssot.yaml`): `requestNotionImportJob`의 implementation-note에 이미지 처리 동작(presigned URL 만료 문제, `asset://` 의사 스킴, external/file 구분, 다운로드 실패 시 폴백)을 추가했습니다.
- **Workspace-Service**: Gateway가 전달한 `X-User-Id`/`X-Guest-Id`를 `CurrentActor`로 해석하는 흐름을 기준으로 전환 중입니다. 정식 흐름은 Gateway를 통해 회원은 USER actor, 비회원은 GUEST actor로 처리합니다.
  - **(2026-06-29 수정, SSOT 계약 변경 없음) `dev-test-user` 무조건 fallback 제거**:
    - 문제: `CurrentActor.actor()`가 `X-User-Id`/`X-Guest-Id`/JWT가 모두 없을 때 무조건 `dev-test-user`(USER actor)로 처리했습니다. Workspace-Service는 docker-compose에서 8082 포트가 호스트에 직접 노출되어 있어, Gateway를 거치지 않은 식별 정보 없는 요청도 항상 같은 `dev-test-user` 신원으로 성공 처리되는 문제가 있었습니다.
    - 수정(`brainX_back/Workspace-Service/src/main/java/com/brainx/workspace/security/CurrentActor.java`): fallback을 `brainx.workspace.dev-fallback-enabled`(기본값 `false`) 설정으로 게이트했습니다. 이 값이 `false`이면 `X-User-Id`/`X-Guest-Id`/유효한 `Authorization` JWT가 모두 없을 때 `WorkspaceException(401, ACTOR_IDENTIFICATION_FAILED)`를 던져 더 이상 임의의 신원으로 통과시키지 않습니다. Gateway를 거치지 않고 로컬에서 Workspace-Service(8082)를 직접 호출해야 하는 개발 편의가 필요하면 `WORKSPACE_DEV_FALLBACK_ENABLED=true`로 명시적으로 켜야 합니다(`application.yml`에 기본값 `false`로 추가).
    - USER/GUEST actor 판별 우선순위(`X-User-Id` > `X-Guest-Id` > JWT `Authorization` > dev fallback)와 Redis SCAN 기반 dirty draft 탐색, guest→user draft claim 로직은 변경하지 않았습니다.
    - SSOT: OpenAPI는 이미 모든 Workspace 엔드포인트에 `401`(`ApiErrorResponse`) 응답과 `bearerAuth`/`guestSessionAuth` 보안 요구사항을 문서화하고 있어, 이번 수정은 기존 계약을 더 정확히 충족시킬 뿐 SSOT YAML 변경은 필요하지 않습니다.
    - 테스트: `Workspace-Service/src/test/java/com/brainx/workspace/security/CurrentActorTest.java` 신규 추가(헤더 우선순위, JWT fallback, dev fallback 비활성 시 401, dev fallback 활성 시 `dev-test-user` 허용 케이스).
  - **(2026-06-29 수정, SSOT 계약 변경 없음) 비회원 체험을 가짜 `BrainX Demo` 로그인이 아닌 실제 Guest actor로 전환**:
    - 문제: `brainx-next` "무료로 시작하기"가 `startDemoSession()`으로 `accessToken: "demo-access-token"`, `email: "demo@brainx.local"`, `nickname: "BrainX Demo"`인 가짜 `AuthSession`을 localStorage에 저장해 비회원 체험을 "로그인된 사용자"처럼 보이게 했습니다(우측 상단 프로필에 `BrainX Demo`/`demo@brainx.local`이 노출되고, 마이페이지 계정 연동 화면은 `linkedProviders: ["google"]`를 하드코딩해 Google 계정과 연동된 것처럼 보였음 — 실제 연동 없음). 이 가짜 토큰은 Gateway JWT 검증에 실패해 결과적으로 Workspace-Service에는 GUEST actor로 들어갔지만(`JwtAuthenticationGlobalFilter`가 검증 실패 시 guest fallback으로 빠짐), 프런트엔드는 `isDemoSession()` 분기로 commerce/ingestion/user/support API를 모두 가짜 응답으로 대체해 실제 백엔드를 전혀 타지 않았습니다. 이로 인해 "비회원처럼 동작하지만 내부적으로는 로그인 사용자처럼 보이는" 혼란이 있었습니다. `dev-test-user`는 이 가짜 데모 계정과는 별개의 개념입니다(아래 항목 참고).
    - 수정(`lib/auth-api.ts`): `DEMO_AUTH_SESSION`/`startDemoSession`/`isDemoSession`과 그 사용처(`claimGuestDraftsAfterAuth`, `logout`, `refreshToken`)를 제거했습니다. 이제 비회원은 어떤 `AuthSession`도 생성하지 않습니다.
    - 수정(`components/public/landing-screen.tsx`): "무료로 시작하기"/"둘러보기"가 `startDemoSession()` 없이 그냥 `/home`으로 이동하도록 변경(`enterGuestMode`). `/notes`로 이동해도 동일하게 동작합니다. 최초 진입 시 Gateway가 `brainx_guest_id` 쿠키 + `X-Guest-Id` 헤더를 발급하고, `lib/workspace-api.ts`의 `authedRequest`는 `session?.accessToken`이 없으면 `Authorization` 헤더 없이 `credentials: "include"`로만 호출하므로(기존 코드, 변경 없음) Workspace-Service가 GUEST actor로 노트/폴더 CRUD를 처리합니다. 회원가입/로그인 후 `claimGuestDraftsAfterAuth`(`/api/v1/notes/drafts/claim`) 호출과 actor별 localStorage 분리(`components/notes/NotesWorkspace.tsx`의 `resolveActorPersistKey`)는 그대로 동작합니다 — 오히려 가짜 데모 세션이 `userId: "usr_demo"`를 들고 있어 `:user:usr_demo` 키로 잘못 분리되던 문제가 이번 수정으로 함께 해소됩니다.
    - 수정(`components/workspace-shell.tsx`): 상단 프로필 버튼이 `session?.accessToken`이 없으면(Guest) "게스트"/"체험 중"을 표시하고 클릭 시 `AccountSettingsModal`을 열지 않는 대신 "체험 모드 사용 중 / 가입하면 노트가 계정에 저장됩니다" 안내와 회원가입·로그인 메뉴가 있는 드롭다운을 띕니다(opaque `bg-surface`, blur 없음). 로그인 사용자는 기존 프로필 UI/마이페이지 동작을 그대로 유지합니다. `/mypage` 직접 진입 시에도 세션이 없으면 설정 모달을 열지 않고 `/home`으로만 돌려보냅니다.
    - 수정(`components/workspace-shell.tsx`, `lib/user-api.ts`): 상단 우측 액션 영역을 `알림 -> 프로필` 순서로 분리하고, 알림 패널과 Guest 프로필 드롭다운은 동시에 열리지 않게 상호 배타적으로 제어합니다. Guest도 무료 기능 안내/회원가입 유도 공지를 받을 수 있으므로 알림 버튼은 계속 노출합니다. `lib/user-api.ts`는 기본적으로 실제 API를 호출하되, 개발자가 `NEXT_PUBLIC_USER_USE_MOCK=true`를 설정하면 사용자/알림 API mock 응답을 켤 수 있게 했습니다.
    - 수정(`lib/commerce-api.ts`, `lib/ingestion-api.ts`, `lib/user-api.ts`, `lib/support-api.ts`, `components/utility/account-settings-modal.tsx`, `components/utility/import-screen.tsx`, `components/notes/NotesWorkspace.tsx`): 데모 세션에서만 타던 가짜 응답 분기(`demoCommerceResponse`/`isCommerceDemoSession`/`changeSubscriptionDemo`/`demoIngestionResponse`/`isNotionDemoSession`/`connectNotionDemo`/`demoUserResponse`/`demoProfile`/`demoSupportResponse`)를 모두 제거하고 항상 실제 API를 호출하도록 정리했습니다. Notion 가져오기·내보내기·결제 플랜 변경은 더 이상 가짜 데모 경로가 없으며, 로그인하지 않은 상태에서 이 기능들을 쓰면 백엔드가 정상적으로 인증 실패를 돌려줍니다(원래도 실제 계정 없이는 쓸 수 없는 기능들).
    - Google OAuth 로그인 흐름(`/oauth/[provider]/callback`, `completeOAuthLogin`)은 건드리지 않았습니다.
    - 직접 확인: `http://localhost:3000` → "무료로 시작하기" → `/home`(로그인 없음) → `/notes`에서 노트/폴더 생성 → 새로고침 후 유지 → 우측 상단 "게스트" 드롭다운에서 회원가입/로그인 → guest 노트가 새 계정으로 승계되는지 확인.
  - **(2026-06-29 추가 개선, SSOT 계약 변경 없음) Guest 전환 후 남은 UX 항목 정리**:
    - 로그인/회원가입 redirect: `lib/auth-api.ts`에 `readReturnToParam`/`buildAuthPath`/`resolveAuthReturnTo`(claim된 noteId로 `/notes/{id}` 치환, 매핑이 있는데 없으면 `/notes`로 폴백)/`stashOAuthReturnTo`/`consumeOAuthReturnTo`(Google 등 외부 리다이렉트 왕복용 sessionStorage)를 추가했습니다. Guest 프로필 드롭다운·로그인/회원가입 화면·온보딩·OAuth 콜백이 현재 경로를 `returnTo`로 주고받아, 로그인 후 원래 보던 페이지로 돌아갑니다.
    - 화면분할 상태 보존: `claimGuestDraftsAfterAuth`가 claim 응답의 `sourceNoteId → noteId` 매핑을 sessionStorage(`brainx_pending_note_claim_v1`)에 잠깐 저장하고, `NotesWorkspace.tsx`의 `resolveActorPersistKey`(guest→user localStorage 승계 지점)가 그 매핑으로 pane tree/tabs의 draft id를 실제 noteId로 갈아끼웁니다(기존 `replaceNoteIdInNode`/`replaceNoteIdInTabs` 재사용). Redis SCAN/claim 트랜잭션 자체는 변경하지 않았습니다.
    - Guest 마인드맵: `/api/v1/graph`는 Postgres 기반이라 Redis draft만 있는 guest에겐 항상 비어 보였습니다. `lib/graph-api.ts`에 `draftsToBrainXNotes`를 추가해 guest는 `listWorkspaceNoteDrafts()`(기존 actor-aware 엔드포인트) 결과를 연결선 없는 노드로 보여주고, 로그인 사용자는 기존 `getGraph()` 그대로 동작합니다.
    - 같은 depth 폴더/노트 이름 중복: `Workspace-Service`의 `createFolder`/`patchFolder`/`createNote`/`patchMetadata`/`persistDraft`(최초 생성 시점만)에 자동 접미사 정책(차단이 아니라 "이름", "이름 2"…, Notion/Obsidian과 동일)을 추가했습니다. `FolderRepository`/`NoteRepository`에 같은 parentFolderId/folderId(루트 포함) 형제만 조회하는 JPQL 메서드를 추가했고, 프런트(`NotesWorkspace.tsx`)는 폴더 rename/move 응답의 실제 이름을 화면에 반영하도록 고쳤습니다(전엔 입력값을 그대로 표시해 서버가 자동으로 바꾼 이름과 어긋날 수 있었음). Guest Redis draft 자체의 중복은 검사하지 않습니다(NoteDraftService/SCAN 미변경 원칙).
    - 이어쓰기 위치: `NoteEditor.tsx`의 `InlineContinueFloatingWidget` 앵커 계산을 caret `bottom + 4px`에서 caret이 있는 줄의 실제 `line-height + 10px`(화면 아래 경계 보정 포함) 기준으로 바꿔 다음 줄 텍스트와 겹치지 않게 했습니다.
    - 목차 클릭 이동: 우측 목차(`RightSidebar.tsx`)는 클릭해도 아무 동작이 없었습니다. `parseHeadings`가 매기는 문서 순서 인덱스를 그대로 재사용해 `NoteEditor.tsx`에 `scrollToHeading(index)`(에디터 DOM의 h1~h3을 순서대로 찾아 `scrollIntoView` + 잠깐 강조)를 추가했고, `saveSignal`과 같은 nonce 패턴(`EditorPanel`/`PaneTreeRenderer`)으로 전달해 Split View에서도 활성 패널만 반응합니다.
    - 버블 툴바 커스텀 색상: `components/notes/ColorPalette.tsx`의 `MoreColorPopover`에 네이티브 `<input type="color">` 커스텀 색상 선택기와 최근 사용 색상이 이미 구현되어 있었습니다(텍스트 색상/형광펜 각각 분리, 다크모드 안전한 BrainX 토큰 사용) — 추가 구현 없이 확인만 했습니다.
    - Guest `/billing` 401: 우측 상단 프로필이 guest일 때 `AccountSettingsModal`(실제 구독 API 호출)을 열지 않고 드롭다운만 띄우도록 이미 바뀌어 있었고(직전 데모 제거 작업), `/mypage` 직접 진입도 세션이 없으면 모달을 열지 않습니다 — 이번 작업에서 추가 수정 없이 재확인했습니다. `(app)/billing` 페이지(`BillingScreen`) 자체는 처음부터 mock 화면이라 실제 API를 호출하지 않습니다.
    - `WorkspaceDemoDataSeeder`(`dev-test-user` 시드 데이터)는 이번 범위에서 수정하지 않았습니다 — `dev-fallback-enabled` 기본 `false`로 인해 그 데이터는 어떤 실제 Guest/User 흐름과도 연결되지 않는 고아 데이터로 남아 있습니다(별도 작업 권장).
- **Commerce-Service (신규, 2026-06-19 추가)**:
  - Toss Payments 연동: SSOT의 `CheckoutSessionData`에 `checkoutUrl` 단일 필드만 있던 것을 `clientKey`/`orderId`/`orderName`/`amount` 필드로 확장하고, `POST /api/v1/subscriptions/checkout-sessions/{id}/confirm` 엔드포인트를 SSOT에 신규 추가했습니다 (Toss는 호스팅 체크아웃 URL이 아니라 SDK + 서버 confirm 모델이기 때문). AsyncAPI는 변경하지 않았습니다 (기존 이벤트 스키마로 충분).
  - **(2026-06-29 수정)** Toss confirm/취소 응답을 기준으로 관리자 결제 내역의 결제수단을 `TOSS` 고정값이 아니라 `카카오페이`, `토스페이`, `신용카드`, `체크카드` 같은 실제 결제수단으로 표시하고, 관리자 환불 API는 `amount`/`reason`을 Commerce 내부 환불 호출에 전달한 뒤 사용자에게 환불 완료 메일을 발송합니다.
  - **(2026-06-28 수정)** 관리자 결제 관리의 구독 현황은 유료 구독만 표시하고, 사용자 표시는 시스템 문자열이 아니라 사람 이름으로 읽히는 표시명만 노출하도록 정리했습니다.
  - **(2026-06-28 수정)** 관리자 문의 답변은 로그인 관리자 이름으로 User-Service에 저장되며, 관리자 콘솔에는 "관리자명에 의해 답변 완료"와 답변 본문이 표시되고 사용자 마이페이지 문의 상세에는 ADMIN 메시지로 표시됩니다.
  - **TEMP**: 다른 서비스와 동일하게 `/api/v1/plans`, `/api/v1/users/me/subscription`, `/api/v1/subscriptions/**`를 인증 없이 허용. 실제 로그인 연동 전까지는 누가 테스트하든 같은 `dev-test-user` 계정의 구독만 바뀝니다.
  - **TEMP**: 결제/등급 변경 동작 확인용으로 Pro 500원, Max 1000원으로 가격을 임시로 낮춰 두었습니다 (`Commerce-Service/src/main/java/.../service/PlanDataSeeder.java`). 실제 요금으로 전환 전 되돌려야 합니다.
  - **TEMP**: `application.yml`의 Toss `client-key`/`secret-key`는 Toss Payments 공식 문서에 공개된 샌드박스 테스트 키입니다. 실서비스 전환 시 가맹점 본인의 키로 교체해야 합니다.
  - 등급별 기능 제한(entitlement gating)은 이번 1차 구현 범위에 포함하지 않았습니다 — 결제 성공 시 구독 plan/tier가 정확히 바뀌는지까지만 구현했습니다.

## North Star

BrainX는 사용자가 정리 노동에 시간을 쓰는 도구가 아니라, 기록한 생각이 자동으로 연결되고 다시 발견되는 도구입니다. 모든 기능은 사용자가 더 많이 관리하게 만드는 방향이 아니라, 더 잘 생각하게 만드는 방향으로 설계합니다.
