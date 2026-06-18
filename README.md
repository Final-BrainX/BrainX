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
├─ brainx-next/       # 현재 주력 Next.js 프론트엔드 프로토타입
├─ brainX_front/      # 이전 Vite/React 프론트엔드 실험 코드
├─ brainX_back/       # Spring Boot MSA 백엔드 워크스페이스
│  └─ User-Service/   # 현재 유지 대상 백엔드 서비스
├─ contracts-v2/      # OpenAPI/AsyncAPI SSOT 계약 문서
└─ BrainX-Design/     # 디자인/레거시 화면 자료
```

`brainX_back/identity-access-service`, `brainX_back/knowledge-workspace-service`는 제거 예정이므로 새 개발 기준에서 제외합니다. 백엔드 개발은 아래 MSA 서비스 경계를 기준으로 진행합니다.

## Frontend: brainx-next

`brainx-next`는 BrainX의 현재 주력 프론트엔드입니다. Next.js App Router 기반이며, 실제 백엔드 연결 전에도 localStorage와 mock seed data로 주요 사용 흐름을 체험할 수 있게 구성되어 있습니다.

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
| `/notes/[id]` | Note Editor | 마크다운 노트 작성, `[[wiki link]]`, 목차, 백링크, 업로드/내보내기 mock |
| `/graph` | Graph | 노트 링크 기반 인터랙티브 지식 그래프, 클러스터/시간 필터 |
| `/chat` | AI Chat | 노트 근거 기반 RAG 채팅 UX, 모델 전환 UI, source note 표시 |
| `/import` | Import | 파일/외부 서비스 가져오기 UX |
| `/billing` | Billing | 플랜/결제 UX |
| `/settings` | Settings | 환경설정 UX |
| `/support` | Support | 문의 생성/조회 API 연동 준비 |
| `/admin` | Admin | 사용자/결제/토큰/문의 관리 화면 UX |
| `/editor-lab` | Editor Lab | TipTap, BlockNote 등 에디터 비교 실험 |

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
- `deriveGraphEdges()`: 노트 링크 기반 그래프 edge 생성
- `createNoteSeed()`, `updateNoteDerived()`: 노트 생성/수정 파생값 관리

### Frontend API Boundary

프론트는 `NEXT_PUBLIC_API_BASE_URL`을 통해 API 서버와 연결합니다. 값이 비어 있으면 같은 origin 기준으로 요청합니다.

현재 구현된 API 클라이언트 파일:

- `lib/auth-api.ts`: 이메일 인증, 회원가입, 로그인, 로그아웃, 토큰 갱신, OAuth, 온보딩
- `lib/support-api.ts`: 문의 목록/생성/상세 조회
- `lib/user-api.ts`: 사용자 계정/마이페이지 계열 API

새 프론트 API 코드는 화면 컴포넌트에 직접 fetch를 흩뿌리지 말고 `lib/*-api.ts` 계층에 먼저 둡니다.

## Backend MSA Direction

백엔드는 Spring Boot 기반 MSA로 구성합니다. 서비스명은 레포/패키지/계약 문서에서 같은 의미로 유지해야 합니다.

### Base Versions

- Java `21`
- Spring Boot `3.5.x`
- Gradle `8.x`
- PostgreSQL `16.x`

현재 `User-Service`는 Spring Boot `3.5.15`, Java toolchain `21` 설정을 사용합니다.

### Service Ownership

| Service | 담당 | 책임 |
| --- | --- | --- |
| User-Service | 채영 | 사용자 신원, 인증, 로그인/회원가입/온보딩, 계정 보안, 동의, 마이페이지, 노트 사용 통계 |
| Admin-Service | 채영 | 관리자 페이지, 사용자 관리, 결제 관리, 환불, 모니터링, 사용자 통계, 문의 답장, 모델별 LLM 토큰 소비량 |
| AI-Service | 영진 | 시맨틱 검색, RAG, LLM 호출, AI 추천, 요약, 토큰 사용량 service 처리 |
| Ingestion-Service | 환유 | 파일 처리, 변환, 가져오기, 내보내기, 외부 연동 |
| Commerce-Service | 환유 | 결제 API, 플랜, 구독/상품 관리 |
| Workspace-Service | 예진, 진주, 채영 | 노트, 폴더, 링크, 그래프, 지식 워크스페이스 원장 |

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

### Backend: User-Service

```powershell
cd C:\Edu\BrainX\brainX_back\User-Service
.\gradlew.bat bootRun
```

테스트:

```powershell
cd C:\Edu\BrainX\brainX_back\User-Service
.\gradlew.bat test
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

- `brainx-next`의 일부 한글 UI 문자열은 현재 소스 파일에서 인코딩이 깨진 상태입니다. 기능 구조 분석은 가능하지만, 제품화 전에 UTF-8 기준으로 문구를 복구해야 합니다.
- `brainX_front`는 이전 Vite/React 구현으로 보이며, 신규 개발 기준은 `brainx-next`를 우선합니다.
- `brainX_back/identity-access-service`, `brainX_back/knowledge-workspace-service`는 제거 예정이므로 새 문서와 개발 계획에서는 제외합니다.
- DB는 PostgreSQL 16.x를 기준으로 하지만, 현재 `User-Service`에는 H2/MySQL/PostgreSQL runtime dependency가 함께 들어 있습니다. 서비스별 운영 DB 확정 시 정리합니다.

## North Star

BrainX는 사용자가 정리 노동에 시간을 쓰는 도구가 아니라, 기록한 생각이 자동으로 연결되고 다시 발견되는 도구입니다. 모든 기능은 사용자가 더 많이 관리하게 만드는 방향이 아니라, 더 잘 생각하게 만드는 방향으로 설계합니다.
