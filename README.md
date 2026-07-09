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

| 구분      | 예시             | 잘하는 것                             | 한계                                        |
| --------- | ---------------- | ------------------------------------- | ------------------------------------------- |
| AI 도구   | ChatGPT, Claude  | 질문 답변, 글 요약                    | 내 자료의 장기 저장, 구조화, 검색이 약함    |
| 노트 도구 | Obsidian, Notion | 저장, 정리, 수동 검색                 | 연결 자동화와 RAG 대화가 제한적임           |
| BrainX    | BrainX           | 저장 + AI 정리 + 자동 연결 + RAG 대화 | 사용자가 생각에 집중하도록 만드는 것이 목표 |

### 타 플랫폼과의 차별점

타 플랫폼은 사용자가 직접 `[[ ]]` 링크를 만들고 구조를 관리하는 수동형 세컨드 브레인에 가깝습니다. BrainX는 AI와 RAG가 문서 맥락을 이해해 자동으로 링크 후보, 클러스터, 마인드맵, 근거 기반 답변을 만들어 주는 자율형 오토 브레인을 목표로 합니다.

| 구분      | 타 플랫폼                      | BrainX                                      |
| --------- | ------------------------------ | ------------------------------------------- |
| 핵심 컨셉 | 수동형, 로컬형 세컨드 브레인   | 자율형, 초연결형 RAG 오토 브레인            |
| 지식 연결 | 사용자가 직접 링크 작성        | AI가 맥락 분석 후 연결 후보와 그래프 생성   |
| 정보 탐색 | 폴더, 수동 그래프, 키워드 검색 | RAG 챗봇, 시맨틱 검색, 요약 기반 탐색       |
| 시간 흐름 | 정적인 문서 중심               | 과거/현재 변화와 성장 흐름 시각화           |
| AI 연동   | 외부 플러그인 의존             | ChatGPT, Claude, Gemini 등 모델 전환 지향   |
| 생태계    | 로컬 중심                      | Notion, Obsidian, 블로그, 외부 앱 연동 지향 |

## Core Concepts

- **RAG형 오토 브레인**: AI가 내 문서를 이해하고 자동으로 연결, 정리, 추천하는 자율 두뇌
- **Brain Exploration**: 우주의 별처럼 흩어진 지식 노드를 항해하듯 탐색하는 경험
- **Digital Twin Brain**: 사용자의 생각 흐름과 지식 구조를 현실 서비스에 복제한 AI 쌍둥이 뇌
- **Open AI Knowledge Hub**: 모든 AI 플러그인과 생산성 앱을 연결하는 개방형 지식 허브

## Workspace Model

2026-07 SSOT 기준으로 BrainX의 지식 원장 최상위 경계는 `Workspace(documentGroup)`입니다.

기존 구조:

```text
User
├─ Folder
└─ Note
```

현재 SSOT 기준 구조:

```text
User
├─ Workspace(documentGroup)
│  ├─ Folder
│  └─ Note
├─ Workspace(documentGroup)
│  ├─ Folder
│  └─ Note
└─ ...
```

- 사용자는 여러 Workspace를 가질 수 있습니다.
- 모든 Note와 Folder는 정확히 하나의 `documentGroupId`에 소속됩니다.
- 회원가입 직후 기본(default) Workspace 1개를 자동 생성합니다.
- Guest는 Workspace를 생성할 수 없습니다.
- Guest draft는 로그인/회원가입 후 사용자의 default Workspace로 claim됩니다.
- 현재 선택된 Workspace는 전역 프론트 컨텍스트이며, Home/Notes 화면 전환과 API의 `documentGroupId` 전달 기준이 됩니다.
- 공유 링크, 그래프 projection, RAG 검색/채팅 컨텍스트도 모두 Workspace 경계를 따라야 합니다.
- 1차에서는 Workspace 생성, 목록 조회, 이름 변경, 전환, Note의 Workspace 간 이동만 지원합니다.
- Workspace 삭제, Folder의 Workspace 간 이동, Workspace별 split/tabs 복원, 로그인 직후 Workspace 선택 모달, 마이페이지 기본 Workspace 설정은 2차 범위입니다.
- 1차에서는 Note만 Workspace 간 이동할 수 있습니다.
- Workspace-Service의 Ticket 2 기반 작업으로 `document_groups` 테이블과 `workspace_notes`/`workspace_folders`의 nullable `document_group_id` 컬럼을 먼저 도입하고, backfill과 제약 추가는 후속 Ticket에서 진행합니다.
- Ticket 3 backfill은 `workspace_notes.user_id`로 member가 확실한 사용자만 대상으로 default Workspace를 만들고 note/folder를 귀속합니다. Guest folder처럼 member 여부가 불명확한 `workspace_folders` 단독 소유 데이터는 이번 단계에서 `document_group_id`가 null로 남을 수 있으며, 후속 검증/보완 대상입니다.
- Ticket 4 1차는 Kafka `UserRegistered` 이벤트를 붙이지 않고, `User-Service -> Workspace-Service` internal API를 통한 Best-Effort default Workspace provisioning만 적용합니다. 이메일 회원가입과 OAuth 온보딩 완료 직후 `POST /internal/v1/workspace/users/{userId}/default-workspace`를 호출하되, 실패해도 회원가입/온보딩/JWT 발급은 그대로 진행합니다.
- Ticket 5 1차는 `Workspace-Service`에 public Workspace API `GET /api/v1/workspaces`, `GET /api/v1/workspaces/{documentGroupId}`, `POST /api/v1/workspaces`, `PATCH /api/v1/workspaces/{documentGroupId}`만 추가합니다. 응답은 `documentGroupId`, `name`, `isDefault`, `createdAt`, `updatedAt`만 반환하고, count/storage/description 및 DELETE/default 변경은 후속 Ticket 범위로 남깁니다.
- Ticket 6 1차는 Note/Folder 생성과 sync/snapshot DTO에 `documentGroupId`를 반영합니다. 기존 프론트 호출처럼 `documentGroupId`를 생략하면 서버가 호출자의 default Workspace로 채우고, 조회 스코프는 아직 `userId` 기준 전체 조회를 유지합니다.
- Ticket 7 1차는 Note/Folder 생성·수정 시 documentGroupId/folderId/parentFolderId 관계를 검증합니다(`FOLDER_WORKSPACE_MISMATCH`, `PARENT_FOLDER_WORKSPACE_MISMATCH`, `FOLDER_CYCLE_NOT_ALLOWED`). documentGroupId가 null인 레거시 Folder는 완화 처리해 기존 동작을 깨지 않습니다. 또한 Ticket 6에서 발견된 회귀(Guest가 폴더를 만들면 documentGroupId 생략 시 default Workspace가 자동 생성되던 문제)를 수정해, Guest(`gst_` prefix) 경로에서는 Workspace를 절대 생성하지 않고 documentGroupId=null로 유지합니다. 이름 중복 검사 확장(Ticket8), Workspace 간 이동(Ticket10), Guest Claim(Ticket9), 조회 스코프의 documentGroupId 전환은 이번 범위에 포함하지 않습니다.
- Ticket 8 1차는 Note/Folder 이름 자동 suffix(`이름`, `이름 2`, `이름 3`...) 정책은 그대로 유지한 채, 중복 검사 스코프를 `userId + folderId`/`userId + parentFolderId`에서 `userId + documentGroupId + folderId`/`userId + documentGroupId + parentFolderId`로 넓힙니다. documentGroupId는 folderId/parentFolderId와 동일하게 null을 wildcard로 취급하지 않고 null끼리만 매치해, 같은 사용자의 서로 다른 Workspace 루트가 서로 섞이지 않고 Guest(`gst_`)/레거시(documentGroupId=null) 데이터는 기존처럼 null 그룹 안에서만 비교됩니다. createNote/createFolder/persistDraft는 documentGroupId를 resolve하고 Ticket7 검증을 마친 뒤에 dedupe를 수행하도록 순서를 바꿨습니다. Workspace 이름 중복 정책(409, Ticket5)과 DB unique 제약(Ticket2/3 이후 후속)은 이번 범위가 아닙니다.
- Ticket 9 1차는 Guest Draft Claim(`POST /api/v1/notes/drafts/claim`)이 documentGroupId 도입 이후에도 올바르게 동작하도록 두 가지를 고칩니다. (1) `reassignGuestFolders`가 Guest 폴더의 소유자만 바꾸고 documentGroupId는 null로 남기던 회귀를 고쳐, 승계된 폴더를 회원의 default Workspace로 귀속시키고 Ticket8의 `dedupeFolderName`을 그대로 재사용해 이름 충돌 시 자동 suffix를 적용합니다. (2) `claimGuestDrafts`의 Redis draft 삭제 시점을 `persistDraft` 직후에서 `TransactionSynchronization.afterCommit` 이후로 미뤄, Postgres 트랜잭션이 롤백되면 Redis draft가 그대로 남아 재시도할 수 있게 했습니다(삭제 실패는 로그만 남기고 claim 응답에는 영향 없음). Note의 documentGroupId 해석(`resolveDocumentGroupId`)은 Ticket6~8에서 이미 올바르게 동작하고 있어 변경하지 않았습니다. Guest Workspace 생성, Note/Folder Workspace 이동, 조회 스코프 변경은 이번 범위가 아닙니다.
- Ticket 10 1차는 새 엔드포인트를 만들지 않고 `PATCH /api/v1/notes/{noteId}/metadata`의 `documentGroupId` 필드를 사용해 Note Workspace 이동을 처리합니다. 다른 Workspace로 이동하면 `folderId`는 항상 `null`로 초기화돼 대상 Workspace root에 배치되고, 대상 root에서 제목이 겹치면 기존 suffix 규칙을 재사용하며 `NotesMoved` 이벤트를 함께 발행합니다.
- Ticket 11 1차는 `brainx-next`에 다중 Workspace 선택을 위한 전역 Context 기반만 추가합니다. `lib/workspace-api.ts`에 `listWorkspaces()`(`GET /api/v1/workspaces`, Guest/비로그인/데스크톱 vault는 빈 목록)를 추가하고, `components/workspace-provider.tsx`(`WorkspaceProvider`/`useWorkspace()`)가 `BrainXProvider`의 인증 상태 변화 감지 패턴을 그대로 재사용해 로그인 상태가 바뀔 때마다 Workspace 목록을 다시 불러오고 `isDefault` Workspace를 기본 선택합니다. `app/(app)/layout.tsx`에 Provider를 마운트만 했고, 아직 이 Context를 구독해 실제로 화면을 바꾸는 곳은 없습니다(Home/Notes 반영은 Ticket12~14, AI "default" 제거는 Ticket16).
- Ticket 12 1차는 `brainx-next`에 Workspace 생성 UI만 추가합니다. `lib/workspace-api.ts`에 `createWorkspace(name)`(`POST /api/v1/workspaces`, `listWorkspaces()`와 동일한 `WorkspaceSummaryData` 응답 재사용)을 추가하고, 신규 `components/notes/CreateWorkspaceModal.tsx`(`ConfirmDialog.tsx`의 portal/overlay/Escape 패턴 재사용)가 생성 성공 시 `refreshWorkspaces()` → `switchWorkspace()` 순서로 호출해 새 Workspace를 자동 선택합니다. 이름 중복(`WORKSPACE_NAME_DUPLICATE`, 409)은 인라인 에러로, 그 외 실패는 `pushToast`로 보여줍니다. `components/workspace-shell.tsx`의 TopBar(알림 버튼 옆)에 진입점을 하나만 추가했고, Guest는 클릭 시 `graph-screen.tsx`와 동일한 패턴(토스트 안내 + `/login`으로 이동)으로 처리됩니다. Workspace 이름변경/삭제 UI, 기존 Workspace 목록을 보여주는 Selector, Home/Notes가 실제로 Workspace를 구독해 다시 그리는 로직은 이번 범위가 아닙니다(각각 2차, Ticket13/14).
- Ticket 12.5 1차는 기존 Workspace 목록에서 다른 Workspace로 수동 전환하는 selector UI를 추가합니다. 신규 `components/notes/WorkspaceSwitcher.tsx`가 `useWorkspace()`의 `workspaces`/`currentWorkspaceId`를 읽어 TopBar에 고정폭(`w-56`) selector로 현재 Workspace 이름을 truncate 표시하고, 드롭다운에서 다른 항목을 클릭하면 `switchWorkspace(documentGroupId)`만 호출합니다(서버 조회 없이 Context 상태만 변경). 드롭다운 안에는 Workspace 목록에 이어 "+ 새 Workspace 만들기" 항목도 함께 두어, TopBar에 있던 별도 생성 버튼을 제거하고 이 selector 하나가 전환/생성 진입점을 모두 맡습니다(클릭 시 기존 `CreateWorkspaceModal`을 그대로 재사용). 로딩 중이거나 목록이 비어 있으면 드롭다운 안에 각각 안내 문구를 보여주고, `components/workspace-shell.tsx`의 TopBar는 Guest일 때 이 컴포넌트를 아예 마운트하지 않습니다(Guest는 Workspace 자체가 없어 `listWorkspaces()`가 항상 빈 목록을 반환하므로 selector를 숨기는 쪽을 선택). `switchWorkspace()` 호출 이후 Home/Notes 데이터를 실제로 다시 조회하는 로직은 이번 범위가 아닙니다(Ticket13/14).
- Ticket 13 1차는 `components/home-screen.tsx`가 `useWorkspace()`를 구독해 `currentWorkspaceId`가 바뀔 때마다 반응하도록만 연결합니다. Home 상단 날짜 줄 옆에 현재 선택된 Workspace 이름을 배지로 보여주고, `getMyWorkspaceStats()`(`/api/v1/workspaces/me/stats`) 호출을 `currentWorkspaceId` 변경 시에도 다시 트리거합니다. 다만 이 API는 SSOT 설명대로 "인증된 사용자 본인의 전체 Workspace(documentGroup) 기준" 합산값이라 documentGroupId로 필터링되지 않습니다 — 지금은 어떤 Workspace를 선택해도 같은 숫자가 돌아오며, Workspace가 2개 이상일 때는 그 사실을 Home 문구에 그대로 안내합니다. 노트 목록 응답에도 아직 documentGroupId가 없어 클라이언트가 노트를 Workspace별로 걸러서 흉내내는 것도 불가능합니다. 진짜 Workspace별 Home 통계/최근 활동을 보여주려면 Backend가 SSOT에 이미 정의돼 있는 `GET /api/v1/workspaces/{documentGroupId}/sync`(`WorkspaceSyncData`, documentGroupId로 스코프된 notes/folders/recentActivities) 라우트를 실제로 노출해야 합니다 — 현재 구현은 documentGroupId 없는 단수 `/api/v1/workspace/sync`만 있어 이 계약과 매치되지 않습니다(후속 Backend Ticket 필요, 이번 Ticket13 범위 아님). Notes Welcome Board 초기화, split/tabs 초기화는 Ticket14 범위로 남겨둡니다.
- Ticket 14 1단계는 `components/notes/NotesWorkspace.tsx`가 `useWorkspace().currentWorkspaceId`를 구독해 탐색기와 Quick Switcher의 노트/폴더 목록을 현재 Workspace 기준으로 클라이언트 필터링합니다. `documentGroupId=null` 레거시 데이터는 Guest/미선택 상태에서는 그대로 보이고, default Workspace가 선택된 경우에만 함께 노출되며, non-default Workspace에서는 숨깁니다. 기존 열린 탭, Welcome Board 초기화, Recent/Favorites/Graph 범위 전환은 아직 후속 단계입니다.
- 2026-07 계약 정렬 기준: 사용자 Workspace 통계의 canonical route는 `/api/v1/workspaces/me/stats`이며, Workspace-Service가 발행하는 note lifecycle 이벤트(`NoteCreated`, `NoteContentSaved`, `NoteMetadataChanged`, `NoteTrashed`, `NoteDeleted`) payload는 모두 `documentGroupId`를 포함해야 합니다.
- 회원가입/OAuth 온보딩 직후의 default Workspace provisioning은 User-Service → Workspace-Service internal API가 Best-Effort라 실패할 수 있다는 게 알려진 한계였습니다(Google OAuth로 로그인한 실제 계정에서 signup 이후 약 4시간 46분 동안 default Workspace 없이 이름 있는 Workspace만 쌓인 사례를 DB에서 직접 확인). 이를 보완하기 위해 `WorkspaceServiceClient.provisionDefaultWorkspace()`가 짧은 backoff로 최대 3회까지 재시도하고, `WorkspaceService.listWorkspaces()`는 조회 시점에 해당 사용자의 default Workspace가 없으면 `getOrCreateDefaultWorkspace()`로 그 자리에서 보정한 뒤 목록을 반환합니다(둘 다 API 응답 모양은 그대로라 SSOT 계약 변경은 없습니다).

## Current Repository Map

```text
BrainX/
├─ brainx-next/           # 현재 주력 Next.js 프론트엔드 프로토타입
├─ brainx-electron/       # Electron 기반 PC 앱 셸 (brainx-next 재사용)
├─ brainX_front/          # 이전 Vite/React 프론트엔드 실험 코드
├─ brainX_back/           # Spring Boot MSA 백엔드 워크스페이스
│  ├─ User-Service/       # 인증/사용자 서비스 (포트 8080)
│  ├─ Discovery-Service/  # Eureka registry (포트 8761)
│  ├─ Gateway-Service/    # 프론트 단일 진입점/API 라우팅 서비스 (포트 8088)
│  ├─ Ingestion-Service/  # 가져오기/내보내기 서비스 (포트 8083) — 구현 중
│  ├─ Workspace-Service/  # 노트/폴더/그래프 원장 서비스 (포트 8082) — 구현 중
│  └─ Commerce-Service/   # 결제/구독/플랜 서비스 (포트 8084) — 구현 중, Toss Payments 연동
├─ contracts-v2/          # OpenAPI/AsyncAPI SSOT 계약 문서
├─ infra/aws-dev/         # AWS 개발환경 Terraform + GitHub Actions + Prometheus/Grafana 배포 구성
└─ BrainX-Design/         # Next.js + iframe 기반 디자인 프로토타입 (포트 3000)
                          # Notion 가져오기 UI 구현됨 (BrainX-Design 전용, brainx-next와 별도)
```

`brainX_back/identity-access-service`, `brainX_back/knowledge-workspace-service`는 제거 예정이므로 새 개발 기준에서 제외합니다. 백엔드 개발은 아래 MSA 서비스 경계를 기준으로 진행합니다.

### 로컬 Kafka

`brainX_back/docker-compose.yml`에는 로컬 Kafka broker가 들어 있습니다. 호스트에서는 `localhost:9092`, 컨테이너 내부에서는 `kafka:9092`로 접근합니다. 1차 Kafka 범위에서는 기존 동기 흐름을 그대로 유지하고, 이벤트 발행은 서비스 플래그로 켜는 방식입니다. `BRAINX_EVENTS_OUTBOX_ENABLED=true`이면 Workspace-Service와 Commerce-Service가 outbox row를 Kafka로 흘리고, `BRAINX_EVENTS_PRODUCER_ENABLED=true`이면 Ingestion-Service가 `IntegrationConnected`, `ImportJobCompleted`, `ImportJobFailed`를 발행합니다. `BRAINX_EVENTS_CONSUMER_ENABLED=true`이면 Intelligence-Service가 workspace note 이벤트, `CaptureReceived`, note link 이벤트, folder 이벤트, `UserDeletionRequested`를 소비합니다. 작업 요약은 [`brainX_back/KAFKA_IMPLEMENTATION_SUMMARY.md`](brainX_back/KAFKA_IMPLEMENTATION_SUMMARY.md)에 둡니다. `ImportJobRequested`는 앞으로의 async worker 흐름에서 다룹니다.
`apache/kafka:3.8.0` 이미지는 컨테이너 내부 Kafka CLI PATH가 고정적이지 않고, `kafka-topics.sh` 기반 healthcheck가 환경에 따라 느리거나 timeout을 내기 쉬워 로컬 Compose에서는 `nc -z localhost 9092` TCP probe를 사용합니다. 현재 Compose의 named volume `brainx_kafka_data`는 `/bitnami/kafka`로 연결돼 있어 Bitnami 경로 흔적이 남아 있습니다. 실제 런타임 데이터 디렉터리는 `/var/lib/kafka/data`이므로, 이 경로를 바꾸는 작업은 기존 Kafka 데이터 마운트 영향 범위를 확인한 뒤 별도 마이그레이션으로 다룹니다.
`brainX_back/docker-compose.yml`의 `Intelligence-Service`는 env_file, Eureka, Kafka, Qdrant, and workspace-token settings를 한 서비스 블록으로 합쳐 두었습니다.
`Admin-Service`가 Docker Compose로 뜰 때 관리자 모니터링의 Kafka lag는 `KAFKA_BOOTSTRAP_SERVERS=kafka:9092`, `BRAINX_KAFKA_MONITORING_CONSUMER_GROUP_ID=intelligence-service` 기준으로 읽습니다. 배포 compose에서도 같은 값을 `admin-service` 환경변수로 주입하며, 호스트에서 직접 `Admin-Service`를 실행할 때만 `localhost:9092` 기본값을 사용합니다.

## Frontend: brainx-next

`brainx-next`는 BrainX의 현재 주력 프론트엔드입니다. Next.js App Router 기반이며, 실제 백엔드 연결 전에도 localStorage와 mock seed data로 주요 사용 흐름을 체험할 수 있게 구성되어 있습니다.

- `next.config.mjs`에서 Turbopack root를 `brainx-next` 폴더로 고정해, 루트에 다른 lockfile이 있어도 개발 서버가 잘못된 워크스페이스 루트를 잡지 않도록 했습니다.
- 관리자 콘솔 mock 기준으로 관리자 계정 이메일 입력, 미확인 문의 수 배지, 답변 완료 문의의 답변 입력 숨김, 환불 시 무료 플랜 전환, 로그인 기기 국가만 표시, 구독 다음 결제일의 월간/연간 표기를 반영했습니다.
- 관리자 생성 계정의 이메일은 로그인 후 프로필 이메일 칸까지 그대로 이어지도록 맞췄고, Billing 화면과 Admin 화면에서는 구독 시작일과 다음 결제일을 주기별(월간 30일, 연간 365일)로 표시합니다.
- 관리자 모니터링 화면에는 검은색 `status-line` 업데이트 문구, 최근 14일 활성 사용자/매출 그래프, Excel 호환 리포트 다운로드가 추가되었습니다. 활성 사용자 추이는 전일까지는 `admin_monitoring_snapshots` persisted 이력을 사용하고, 오늘 23:59 Asia/Seoul snapshot이 아직 없으면 오늘 칸만 `User-Service` live 값으로 overlay합니다.
- 관리자 모니터링 우측 레일에는 관리자 목록 아래 게임 채팅형 메시지함이 있으며, 전체 발송/선택 발송과 unread `SMS` 건수, `읽음` 모달을 함께 지원합니다.
- 환불은 관리자 사유를 함께 전달하고, 환불 안내 메일 발송과 Commerce 구독의 `free` 전환을 기준으로 사용자 화면이 주기적으로 최신 플랜을 다시 읽어오도록 맞췄습니다.
- Commerce 환불은 `REFUNDED` 상태를 DB 체크 제약에 포함하도록 보정했고, 결제사에서 이미 취소된 결제라면 로컬 원장과 구독 상태를 `환불 완료 + free 전환`으로 재동기화하도록 처리했습니다.
- `/notes` 우측 인라인 AI는 질문 모드와 작성 모드를 지원하며, 작성 요청은 Intelligence Service의 `DRAFT` inline assist action으로 현재 편집기 커서에 스트리밍 삽입됩니다.

## Desktop App: brainx-electron

`brainx-electron`은 `brainx-next`를 재사용하는 BrainX의 데스크톱 셸입니다. 1차 목표는 웹앱을 다시 만드는 것이 아니라, 현재 배포/개발 중인 Next.js 앱을 Electron 창 안에서 안정적으로 실행하고 브라우저 전용 흐름을 데스크톱 친화적으로 감싸는 것입니다.

- main process: 앱 창 생성, 팝업 창 정책, 외부 링크 위임, 보안 기본 정책
- preload: renderer에 노출할 최소 bridge (`openExternal`, 런타임 설정 조회)
- preload/main bridge는 renderer `fetch`가 실패해도 로그인/OAuth 완료 같은 핵심 인증 API를 메인 프로세스가 직접 호출해 앱 로그인을 마무리할 수 있다
- renderer: 별도 UI를 중복 구현하지 않고 기존 `brainx-next`를 그대로 사용
- Electron 첫 진입은 웹 랜딩 대신 데스크톱 시작 허브를 사용한다. 비로그인 상태면 바로 로그인 화면을 띄우고, 로그인 이후에는 최근 vault 자동 복원 또는 vault 생성/열기 화면으로 이어진다.
- 로그인 화면의 `로그인 유지`를 끄면 세션은 앱 실행 중에만 유지되고, 켜면 다음 실행에도 자동 로그인 상태를 복원한다.
- 데스크톱 앱 버전이 바뀐 새 빌드를 실행하면 저장된 로그인 세션은 한 번 비워 다시 로그인하도록 정리한다.
- 데스크톱 앱은 웹 개발용 `dev` 우회 세션을 만들지 않으며, 저장된 세션이 없거나 버전 변경으로 세션이 정리되면 항상 기존 로그인 화면으로 되돌아간다.
- 개발 모드: `brainx-next` dev server(`localhost:3000`)에 연결
- 패키징 모드: 기본적으로 `https://brainx.p-e.kr/` 배포본을 로드하고, 추후 Next standalone 내장으로 확장
- active vault가 있으면 vault 설정/인덱스/동기화 상태는 `.brainx/`에 보관하고, 사용자 노트/첨부파일은 vault 루트 폴더에 실제 파일명과 확장자로 기록하며 export는 vault `exports/`에 저장
- manual-cloud vault에서 동기화된 노트를 앱에서 삭제하면 로컬에서 바로 사라지고, 다음 수동 동기화에서 원격 워크스페이스 삭제까지 이어지도록 `.brainx/sync-state.json`에 삭제 대기 목록을 함께 기록
- Home, Graph, 노트 통계는 active vault snapshot 기준으로 읽고 sync mode는 `local-only` / `manual-cloud`로 분리
- 데스크톱 `/notes`는 active vault가 있으면 노트 생성/수정/자동저장을 항상 로컬 vault 파일에만 기록하고, 웹 반영은 상단 `웹 동기화` 버튼 또는 설정의 수동 Sync 실행에서만 일어나도록 유지합니다.
- 데스크톱 수동 동기화 최근 결과는 설정 화면에서 확인하고, 노트 화면 상단의 일시적인 성공/실패 배너는 노출하지 않는다.
- 수동 동기화가 완료되면 노트 화면은 동기화된 항목이 모두 다시 보일 때까지 `동기화 중..` 로딩 셸을 유지한다.

Electron으로 우선 감싸야 하는 핵심 웹 흐름은 아래와 같습니다.

- Notion OAuth 팝업
- Toss 결제 팝업
- 노트 새 창 열기
- 외부 링크/파일 다운로드
- 로컬 세션 및 향후 OS 연동 기능
- `/notes` 성능 최적화는 저위험 변경을 우선 적용합니다. 내보내기 유틸은 클릭 시점에 지연 로드하고, Mermaid 자동 preview 전환과 본문 저장 동기화는 변경이 실제 발생한 경우에만 후속 렌더링이 이어지도록 유지합니다.
- `/notes` 초기 탐색기 렌더링은 저장된 워크스페이스 스냅샷을 먼저 복원한 뒤 서버/Redis 최신값으로 동기화해, 빈 탐색기 상태가 먼저 보였다가 다시 채워지는 깜빡임을 줄입니다.
- `/notes` 에디터의 표는 바로 다음 블록 맨 앞에서 Backspace 시 삭제되고, 좌상단 그립을 hold&drop하면(누른 채 이동) 다른 위치로 옮길 수 있습니다. 노트탐색기/즐겨찾기 트리는 즐겨찾기 폴더 안에서 즐겨찾기 노트를 우선 정렬하고, 별 아이콘 위치를 트리 전체에서 통일했으며, 드래그 상태(반투명/선택)가 성공·실패·no-op·취소 모든 경로에서 정상 reset되도록 방어적 안전망을 추가했습니다.
- 게스트(비로그인) 노트 목록은 Postgres `listNotes()`가 아니라 draft 목록(`listWorkspaceNoteDrafts`) 기준으로 불러오도록 고쳐, 새로고침 후에도 게스트가 만든 노트와 그 위키링크 기반 마인드맵 연결이 유지됩니다.
- non-default Workspace에서 막 만든 draft note는 후속 `PUT /api/v1/notes/{noteId}/draft` 요청 직전에 pending-created-note 캐시에 남겨둔 원래 `documentGroupId`를 다시 주입해 저장합니다. 프런트 note state가 잠시 `documentGroupId`를 잃더라도 Redis draft가 `null`로 덮여 background persist 시 default Workspace로 재해석되는 경로를 막기 위한 방어선이며, API/SSOT 모양은 바꾸지 않습니다.
- `/graph`는 서버 projection edge를 그대로 신뢰하되, 로컬 markdown에서 지금 유효한 `[[WikiLink]]`로 파생되는 `REFERENCE` edge 집합으로만 즉시 보정합니다. 그래서 `[[노트]]`가 `[[노트]`/`[노트]]`로 깨지는 순간 stale 연결선이 바로 사라지고, 새 위키링크/optimistic edge도 서버 projection과 같은 파란 점선(`bridge: true`) 스타일로 첫 렌더부터 보입니다.
- 노트 우측 Context Panel의 연결(Outgoing Links)/백링크(Backlinks)는 mock 데이터가 아니라 현재 메모리에 올라온 노트 목록과 본문 WikiLink 파싱 결과를 기준으로 즉시 재계산합니다. 계산 범위는 현재 노트와 같은 `documentGroupId` 내부로만 제한하며, rename/save/load 이후에도 별도 API 재조회 없이 같은 규칙으로 다시 그립니다.
- 개발환경 배포 workflow(`.github/workflows/brainx-dev-deploy.yml`)의 desktop installer job은 optional입니다. `frontend` 변경이 감지됐고 installer job이 skip돼도 `build` job은 계속 실행돼 SHA 태그 이미지를 ECR에 push해야 하며, skip된 optional need 때문에 frontend 이미지 build 전체가 빠지면 deploy는 존재하지 않는 SHA 태그를 pull하려다 실패합니다.
- Ctrl+F 인노트 검색창은 탭바와 스크롤 영역 사이의 크기 0 앵커에 절대 위치로 겹쳐 그려, 탭-본문 사이에 별도 공간을 차지하지 않고 스크롤해도 같은 위치에 고정됩니다.

### Tech Stack

- Next.js `16.2.7`
- React `19.2.7`
- TypeScript `5.8.x`
- Tailwind CSS `3.4.x`
- lucide-react 아이콘
- TipTap, BlockNote, Shiki 에디터 실험 코드 포함
- Playwright dev dependency 포함

### Main Screens

| Route                              | Screen                  | 역할                                                                                                                                                      |
| ---------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                | Landing                 | BrainX 소개 및 진입                                                                                                                                       |
| `/login`, `/signup`, `/onboarding` | Auth                    | 이메일 인증, 로그인, OAuth, 온보딩 UI                                                                                                                     |
| `/home`                            | Home                    | 지식 통계, 즐겨찾기, 최근 노트, AI 추천 연결                                                                                                              |
| `/notes`, `/notes/[id]`            | Note Editor             | TipTap 기반 리치 에디터. 표/Mermaid/이미지/위키링크/문서 타이포그래피, 폴더 드래그앤드롭을 지원. 본문 저장 포맷(HTML/JSON/Markdown)은 아직 설계 결정 대상 |
| `/graph`                           | Graph                   | 노트 링크 기반 인터랙티브 지식 그래프, 클러스터/시간 필터, 색인 완료 노트 기준 AI 연결/두 개념 wiki-link 기반 징검다리 추천                               |
| `/chat`                            | AI Chat                 | 노트 근거 기반 RAG 채팅 UX, 모델 전환 UI, source note 표시, 제목+개인 노트 톤 AI 초안 작성 및 Workspace 노트 저장                                         |
| `/import`                          | Import                  | 파일/외부 서비스 가져오기 UX                                                                                                                              |
| `/billing`                         | Billing                 | 플랜/결제 UX                                                                                                                                              |
| `/settings`                        | Settings                | 환경설정 UX                                                                                                                                               |
| `/support`                         | Support                 | 문의 생성/조회 API 연동 준비                                                                                                                              |
| `/admin`                           | Admin                   | 사용자/결제/토큰/문의 관리 화면 UX                                                                                                                        |
| `/editor-lab`                      | Editor Lab(테스트 전용) | 노트 기능 실험실, 실제 서비스 페이지 아님                                                                                                                 |

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

프론트는 기본적으로 `NEXT_PUBLIC_API_BASE_URL`을 통해 public API gateway와 연결합니다. 값이 비어 있으면 같은 origin 기준으로 요청합니다. 로컬 개발 기본값 `API_SERVER_URL=http://localhost:8088`은 `Gateway-Service`를 가리킵니다.

현재 `lib/workspace-api.ts`, `lib/graph-api.ts`는 별도 `NEXT_PUBLIC_WORKSPACE_API_BASE_URL`도 읽습니다. 이 값은 로컬에서 `Workspace-Service`를 직접 붙일 때만 사용하며 기본값은 `http://localhost:8082`입니다. 따라서 `brainx-next/.env.example` 기준값처럼 `8082`가 맞고, `8088`은 workspace direct URL이 아니라 gateway URL입니다.

현재 구현된 API 클라이언트 파일:

- `lib/auth-api.ts`: 이메일 인증, 회원가입, 로그인, 로그아웃, 토큰 갱신, OAuth, 온보딩
- `lib/support-api.ts`: 문의 목록/생성/상세 조회
- `lib/user-api.ts`: 사용자 계정/마이페이지 계열 API, 관리자 공지 알림함 조회/읽음 처리
- `lib/ingestion-api.ts`: Notion OAuth 연결/콜백, 페이지 목록 조회, 가져오기 작업 생성/상태 조회
- `lib/workspace-api.ts`: 노트 단건 조회, 사용자 워크스페이스 통계 조회(`/api/v1/workspaces/me/stats`), 워크스페이스 목록/생성/이름변경 계약 반영 예정
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

| Service              | 담당             | 책임                                                                                                           | 상태                                                          |
| -------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| User-Service         | 채영             | 사용자 신원, 인증, 로그인/회원가입/온보딩, 계정 보안, 동의, 마이페이지, 노트 사용 통계, 로그인 세션 Redis 기록 | 구현 중 (포트 8080)                                           |
| Admin-Service        | 채영             | 관리자 페이지, 사용자 관리, 결제 관리, 환불, 모니터링, 사용자 통계, 문의 답장, 모델별 LLM 토큰 소비량          | API shell 구현 중 (포트 8085)                                 |
| Intelligence-Service | 영진             | 시맨틱 검색, RAG, LLM 호출, AI 추천, 요약, 토큰 사용량 service 처리                                            | 구현 중 (포트 8086)                                           |
| Mcp-Service          | 미정             | 외부 agent/MCP client용 API key 발급/검증, MCP Streamable HTTP endpoint, agent note tool gateway               | API key 및 노트 tool v1 구현 중 (포트 8087)                   |
| Ingestion-Service    | 환유             | 파일 처리, 변환, 가져오기, 내보내기, 외부 연동                                                                 | 구현 중 (포트 8083)                                           |
| Commerce-Service     | 환유             | 결제 API, 플랜, 구독/상품 관리                                                                                 | 구현 중 (포트 8084) — Toss Payments 결제, 플랜 조회/변경/취소 |
| Workspace-Service    | 예진, 진주, 채영 | 노트, 폴더, 링크, 그래프, 지식 워크스페이스 원장                                                               | 구현 중 (포트 8082) — 노트/폴더/링크/그래프/공유 API          |

- User-Service의 기본 access token TTL은 10시간(`JWT_ACCESS_EXPIRATION=36000000`)입니다. refresh token은 기존 7일 정책을 유지합니다.

### Service Boundary Rules

- Browser/external client는 `/api/v1/**` public API를 기준으로 호출합니다.
- 현재 Ingestion-Service의 publish helper는 구현 기준으로 `/v1/publish-jobs`를 사용합니다. 이 엔드포인트는 `noteContent`를 받아 즉시 clipboard-ready content를 반환하는 동기 API입니다.
- Service-to-service 동기 호출은 `/internal/v1/**` 하위로 분리합니다.
- 서비스 간 상태 전파는 가능하면 이벤트 기반으로 처리합니다.
- Gateway는 public edge로만 쓰고, 서비스 상태 점검과 운영 조회는 가능한 한 소유 서비스의 직접 URL을 사용합니다. Gateway 라우트는 서비스별 circuit breaker와 짧은 timeout으로 감싸서 한 서비스 장애가 다른 서비스 요청까지 끌고 가지 않게 합니다. 단, Intelligence-Service의 LLM성 AI 라우트는 정상 처리도 수 초~수십 초가 걸릴 수 있으므로 route metadata와 timelimiter를 120초 기준으로 둡니다.
- Workspace-Service는 노트 원장의 authoritative source입니다.
- 홈(`/home`)과 사용자 설정의 노트 통계 메뉴는 `Workspace-Service`의 `GET /api/v1/workspaces/me/stats`와 노트/그래프 조회 응답을 조합해 실제 사용자 데이터만 보여줍니다.
- 다중 Workspace 기준의 1차 public 계약은 `GET/POST /api/v1/workspaces`, `GET/PATCH /api/v1/workspaces/{documentGroupId}`, `GET /api/v1/workspaces/{documentGroupId}/sync`를 따른다.
- Workspace 전환은 1차에서 별도 selection 저장 API 없이 프론트 Context와 각 API 호출의 `documentGroupId` 전달로 처리한다.
- AI, import, extension, MCP 등에서 노트를 변경할 때도 Workspace command API를 통해 처리합니다.
- Mcp-Service는 외부 agent 인증과 MCP `/mcp` transport를 소유합니다. 노트 검색/쓰기 tool은 Workspace/Intelligence public 또는 internal API를 통해 붙입니다.
- 토큰 사용량은 public command API로 직접 노출하지 않고 event 기반으로 집계합니다.
- 서비스 책임이 겹치면 DB를 공유하지 말고 API/이벤트 계약을 먼저 정의합니다.

## API Contract SSOT

API와 이벤트 계약의 기준은 `contracts-v2`입니다.

- `contracts-v2/brainx-openapi.ssot.yaml`: public REST API와 internal sync API 계약
- `contracts-v2/brainx-asyncapi.ssot.yaml`: service-to-service event contract
- `contracts-v2/brainx-ssot-readme.md`: SSOT 구성과 검증 방법
- `contracts-v2/brainx-asyncapi.html`: AsyncAPI 문서 산출물

공통 public prefix는 `/api/v1`입니다. 단, 현재 구현된 Ingestion publish helper는 `/v1/publish-jobs`입니다. 인증은 Access Token Bearer 방식과 Refresh Token/HttpOnly Secure Cookie 전략을 기준으로 합니다. AI 응답 스트리밍은 SSE를 기준으로 둡니다.
MCP client용 API key 관리는 `POST|GET /api/v1/mcp/api-clients`, `DELETE /api/v1/mcp/api-clients/{clientId}`가 담당하고, 실제 MCP transport endpoint는 `/mcp`입니다.

### MCP Agent Access

MCP 기본 연결 방식은 OAuth 2.1 + PKCE입니다. Codex 같은 MCP client는 BrainX의 protected resource metadata를 읽고 `/oauth/authorize` 브라우저 승인 흐름을 거쳐 `/mcp`에 접근합니다.

1. MCP client는 `https://<public-domain>/mcp`에 연결하고, 인증이 없으면 `WWW-Authenticate`의 `resource_metadata`를 따라 OAuth discovery를 수행합니다.
2. `codex mcp login brainx` 같은 client login 흐름에서 BrainX `/oauth/authorize` 화면이 열리고, 로그인 사용자가 scope를 승인합니다.
3. User-Service는 `typ=mcp_access`, `aud/resource=https://<public-domain>/mcp`, `scope`를 가진 MCP access token과 refresh token을 발급합니다.
4. Mcp-Service는 `/mcp`와 `GET /api/v1/mcp/whoami`에서 OAuth access token 또는 기존 MCP API key를 모두 허용합니다.

개발자용 fallback으로 API key도 유지합니다. 사용자 JWT로 `POST /api/v1/mcp/api-clients`에 `{ "name": "...", "scopes": ["whoami", "notes:read", "ai:search", "notes:write"] }`를 보내 `apiKeyOnce`를 발급하고, `Authorization: Bearer bxk_live_...` 또는 `X-BrainX-Api-Key`로 사용할 수 있습니다. `/settings`의 MCP API Keys 패널도 같은 네 scope를 기본으로 보냅니다. `apiKeyOnce`는 한 번만 표시되므로 안전한 password manager에 저장해야 하며, DB에는 원문 대신 hash만 저장됩니다. REST `/api/v1/mcp/tools`와 `/api/v1/mcp/tool-calls`는 compatibility 계약으로 남아 있고 Codex v1 연동은 `/mcp` transport를 사용합니다.

MCP v1 tool:

- `brainx_whoami`: API key의 `userId`, `clientId`, `scopes` 확인
- `brainx_search_notes`: Intelligence semantic search 기반 노트 검색, `notes:read` + `ai:search` 필요
- `brainx_get_note`: Workspace 노트 단건 조회, `notes:read` 필요
- `brainx_create_note`: Workspace 새 노트 생성, `notes:write` 필요

Codex Streamable HTTP 설정 예시:

```toml
[mcp_servers.brainx]
url = "https://<public-domain>/mcp"
scopes = ["whoami", "notes:read", "ai:search", "notes:write"]
oauth_resource = "https://<public-domain>/mcp"
```

API key fallback을 직접 테스트할 때만 `bearer_token_env_var = "BRAINX_MCP_API_KEY"`를 사용할 수 있습니다. 공개 플러그인 기본 경로는 OAuth login입니다.

#### MCP Kubernetes 준비

MCP Kubernetes 준비 자산은 `k8s/apps/mcp-service-configmap.yaml`, `k8s/apps/mcp-service.yaml`, `k8s/secrets/mcp-service-secret.example.yaml`에 둡니다. `mcp-service` Deployment는 `postgres-secret`의 `POSTGRES_USER`/`POSTGRES_PASSWORD`, `gateway-secret`의 `SERVICE_TOKEN`, `mcp-service-secret`의 `JWT_SECRET`을 참조합니다. 실제 Secret YAML은 커밋하지 않고 example 파일만 저장소에 둡니다.

비민감 값은 `mcp-service-config` ConfigMap으로 분리합니다. 현재 기준 추천 키는 `SERVER_PORT`, `POSTGRES_HOST`, `POSTGRES_PORT`, `MCP_DB_NAME`, `EUREKA_CLIENT_SERVICE_URL_DEFAULTZONE`, `EUREKA_INSTANCE_HOSTNAME`, `PUBLIC_BASE_URL`, `BRAINX_OAUTH_ISSUER`, `BRAINX_MCP_RESOURCE`, `BRAINX_MCP_PROTECTED_RESOURCE_METADATA_URL`, `WORKSPACE_SERVICE_URL`, `INTELLIGENCE_SERVICE_URL`, 각 timeout, `BRAINX_MCP_API_KEY_PREFIX`입니다.

Probe는 현재 `brainX_back/Mcp-Service/src/main/resources/application.yaml`이 `health,info`만 노출하므로 `startup`, `readiness`, `liveness` 모두 `/actuator/health`를 사용합니다. OAuth metadata와 protected resource URL이 실제 공개 도메인과 다르면 MCP OAuth discovery가 깨질 수 있고, `JWT_SECRET`이 User-Service와 다르면 `/mcp`와 `GET /api/v1/mcp/whoami`의 토큰 검증이 실패하므로 Kubernetes Secret 적용 전에 동일 값을 맞춰야 합니다.

#### Ingestion Kubernetes 준비

Ingestion Kubernetes 준비 자산은 `k8s/apps/ingestion-service-configmap.yaml`, `k8s/apps/ingestion-service.yaml`, `k8s/secrets/ingestion-service-secret.example.yaml`에 둡니다. `ingestion-service` Deployment는 `postgres-secret`의 `POSTGRES_USER`/`POSTGRES_PASSWORD`, `gateway-secret`의 `JWT_SECRET`, `ingestion-service-secret`의 `NOTION_CLIENT_ID`/`NOTION_CLIENT_SECRET`을 참조합니다. 비민감 값은 `ingestion-service-config` ConfigMap으로 분리하고, 로컬 Docker Desktop Kubernetes 검증 단계에서는 Postgres, Kafka, Workspace-Service를 `host.docker.internal` 경유로 바라봅니다.

Probe는 기능 코드 수정 금지 범위 때문에 현재 공개된 `/actuator/health` 기준으로 `startup`, `readiness`, `liveness`를 모두 구성합니다. `application.yml`에는 readiness/liveness group이 이미 있지만, 현재 `SecurityConfig`가 `/actuator/health`와 `/actuator/prometheus`만 `permitAll`이라 `/actuator/health/readiness`, `/actuator/health/liveness`는 그대로 쓰면 401 가능성이 있습니다. 또 asset storage는 이번 준비 단계에서 `emptyDir`라 Pod 재생성 시 업로드 자산이 사라질 수 있으므로, 로컬 검증 이후에는 PVC 또는 외부 스토리지 전환이 필요합니다.

#### Commerce Kubernetes 준비

Commerce Kubernetes 준비 자산은 `k8s/apps/commerce-service.yaml`, `k8s/secrets/commerce-service-secret.example.yaml`에 둡니다. `commerce-service` Deployment는 `postgres-secret`의 `POSTGRES_USER`/`POSTGRES_PASSWORD`, `gateway-secret`의 `SERVICE_TOKEN`, `commerce-service-secret`의 `JWT_SECRET`/`TOSS_CLIENT_KEY`/`TOSS_SECRET_KEY`를 참조합니다. 비민감 값은 `commerce-service-config` ConfigMap으로 분리하고, 로컬 Docker Desktop Kubernetes 검증 단계에서는 Postgres와 Kafka를 `host.docker.internal` 경유로 바라봅니다.

Probe는 Ingestion과 같은 이유로 현재 공개된 `/actuator/health` 기준 `startup`, `readiness`, `liveness`를 모두 사용합니다. `application.yml`에는 readiness/liveness group이 있지만 현재 `SecurityConfig`가 `/actuator/health`와 `/actuator/prometheus`만 `permitAll`이라 하위 probe path를 그대로 쓰면 401 가능성이 있습니다.

#### Intelligence Kubernetes 준비

Intelligence Kubernetes 준비 자산은 `k8s/apps/intelligence-service-configmap.yaml`, `k8s/apps/intelligence-service.yaml`, `k8s/secrets/intelligence-service-secret.example.yaml`에 둡니다. `intelligence-service` Deployment는 `postgres-secret`의 `POSTGRES_USER`/`POSTGRES_PASSWORD`, `gateway-secret`의 `SERVICE_TOKEN`/`JWT_SECRET`, `intelligence-service-secret`의 `OPENAI_API_KEY`/`QDRANT_API_KEY`를 참조합니다. 비민감 값은 `intelligence-service-config` ConfigMap으로 분리하고, 로컬 Docker Desktop Kubernetes 검증 단계에서는 Postgres, Redis, Kafka, Qdrant는 `host.docker.internal`, Workspace-Service는 in-cluster `http://workspace-service:8082`, Commerce-Service는 `http://host.docker.internal:8084`를 사용합니다.

Probe는 `brainX_back/Intelligence-Service/src/main/resources/application.yaml`이 readiness/liveness group과 actuator probe를 이미 노출하고 있고, `SecurityConfig`도 `/api/v1/**` 외 요청을 별도로 막지 않으므로 `startup=/actuator/health/liveness`, `readiness=/actuator/health/readiness`, `liveness=/actuator/health/liveness`로 바로 구성합니다. Compose에서 이미 쓰는 Hikari 제한(`maximumPoolSize=3`, `minimumIdle=1`)도 ConfigMap에 그대로 반영합니다. 다만 Gateway의 현재 정적 매핑은 여전히 `http://host.docker.internal:8086`을 가리키므로, 최초 검증은 `svc/intelligence-service` 또는 `port-forward` direct 호출 기준으로 하고 Gateway cutover는 별도 작업으로 남깁니다.

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
- 운영 DB에 이미 행이 있는 테이블에 `NOT NULL` 컬럼을 추가할 때는 Hibernate `ddl-auto:update`만 믿지 말고, `NULL 허용 -> 백필 -> 기본값 설정 -> NOT NULL` 순서의 SQL 보정 마이그레이션을 먼저 넣습니다.
- 인증/인가, 토큰, 동의, 마이페이지는 User-Service 책임입니다.
- 노트 본문, 링크, 폴더, 그래프 원장은 Workspace-Service 책임입니다.

## Getting Started

### Local Backend Environment

```powershell
cd C:\Edu\Final\BrainX\brainX_back
Copy-Item .env.example .env
Copy-Item .\env\discovery-service.env.example .\env\discovery-service.env
Copy-Item .\env\gateway-service.env.example .\env\gateway-service.env
Copy-Item .\env\user-service.env.example .\env\user-service.env
Copy-Item .\env\workspace-service.env.example .\env\workspace-service.env
Copy-Item .\env\ingestion-service.env.example .\env\ingestion-service.env
Copy-Item .\env\commerce-service.env.example .\env\commerce-service.env
Copy-Item .\env\intelligence-service.env.example .\env\intelligence-service.env
Copy-Item .\env\mcp-service.env.example .\env\mcp-service.env
docker compose up -d
```

`.env`는 각자 로컬 값만 넣고 Git에 올리지 않습니다. `JWT_SECRET`은 JWT를 발급/검증하는 User-Service, Workspace-Service, Ingestion-Service, Intelligence-Service, Mcp-Service가 같은 값을 사용해야 합니다.
`env/*.env`도 서비스별 로컬 실행 값이므로 Git에 올리지 않습니다.
배포 환경은 이 로컬 예시 파일을 읽지 않고, `infra/aws-dev/scripts/deploy_remote.sh`가 만든 `/opt/brainx/env/runtime.env`와 `infra/aws-dev/deploy/docker-compose.yml`을 사용합니다.
`brainx-dev-deploy` 워크플로우는 코드 변경 서비스만 이미지를 다시 빌드하지만, 원격 배포 스크립트는 최신 RDS 시크릿을 매번 다시 읽고 이전에 적용된 DB 자격증명 fingerprint와 비교합니다.
RDS 비밀번호처럼 공통 런타임 시크릿이 바뀌면 `user-service`, `workspace-service`, `ingestion-service`, `commerce-service`, `admin-service`, `intelligence-service`, `mcp-service`를 `docker compose up -d --no-deps --force-recreate`로 강제 재생성해 새 env를 주입합니다.
코드 변경 없이 시크릿만 다시 반영해야 할 때는 GitHub Actions `BrainX Dev Deploy`를 `workflow_dispatch`로 실행하면서 `force_runtime_refresh=true`를 선택하면 이미지 재빌드 없이 런타임 시크릿 의존 서비스를 재기동합니다.

DB만 Docker로 띄우려면 `docker compose up -d`를 사용합니다. 백엔드 앱까지 컨테이너로 함께 띄우려면 아래처럼 `apps` 프로필을 사용합니다.

```powershell
cd C:\Edu\Final\BrainX\brainX_back
docker compose --profile apps up -d --build
```

`apps` 프로필은 `Discovery-Service`(8761), `Gateway-Service`(8088), `User-Service`(8080), `Workspace-Service`(8082), `Ingestion-Service`(8083), `Commerce-Service`(8084), `Intelligence-Service`(8086), `Admin-Service`(8085), `Mcp-Service`(8087)를 모두 실행합니다. MCP semantic search가 Intelligence-Service를 호출하고 Discovery가 Eureka registry 역할을 하므로, 이 프로필에서 필요한 공용 인프라와 앱을 한 번에 올릴 수 있습니다. 이 방식으로 앱을 띄우면 각 서비스를 로컬 Gradle/IDE에서 따로 실행할 필요는 없습니다. 프론트엔드는 계속 `brainx-next`에서 실행하면 됩니다.

권장 실행 순서는 다음과 같습니다.

1. `postgres`, `redis`, `neo4j`, `kafka` 같은 공용 인프라를 먼저 올립니다.
1. `Discovery-Service`가 `UP`이 된 뒤 각 백엔드가 Eureka에 등록되도록 기다립니다.
1. `Gateway-Service`, `User-Service`, `Workspace-Service`, `Ingestion-Service`, `Commerce-Service`, `Intelligence-Service`, `Admin-Service`, `Mcp-Service`를 순서대로 확인합니다.
1. `Admin-Service`는 `apps` 프로필에서 Discovery에 등록된 서비스명(`User-Service`, `Commerce-Service`, `Workspace-Service`, `Ingestion-Service`, `Intelligence-Service`, `Mcp-Service`) 기준으로 내부 호출을 수행합니다.

Eureka 서비스명은 `spring.application.name`과 대소문자가 정확히 같아야 합니다. BrainX 배포에서는 `User-Service`, `Commerce-Service`, `Workspace-Service`, `Admin-Service`, `Gateway-Service`는 대문자 표기 그대로 쓰고, `ingestion-service`, `intelligence-service`, `mcp-service`는 소문자 표기를 유지합니다.

앱 포트 매핑은 아래와 같습니다.

| Service              | Port | Purpose                          |
| -------------------- | ---- | -------------------------------- |
| Discovery-Service    | 8761 | Eureka registry                  |
| Gateway-Service      | 8088 | Public API gateway               |
| User-Service         | 8080 | Auth, account, identity          |
| Workspace-Service    | 8082 | Notes, folders, graph            |
| Ingestion-Service    | 8083 | Import/export                    |
| Commerce-Service     | 8084 | Billing, subscriptions           |
| Admin-Service        | 8085 | Admin console backend            |
| Intelligence-Service | 8086 | AI, search, RAG                  |
| Mcp-Service          | 8087 | MCP endpoint and API key gateway |

Admin-Service만 Docker로 실행하려면 아래 명령을 사용합니다.

```powershell
cd C:\Edu\Final\BrainX\brainX_back
docker compose --profile apps up -d --build admin-service
```

관리자 프론트(`BrainX-Admin/brainx-admin-next`)는 기본적으로 실제 Admin-Service 프록시를 사용합니다. 개발 중에만 `.env.local`에 `ADMIN_MOCK_ENABLED=true`를 명시했을 때 mock API를 켜고, 그 외에는 `ADMIN_SERVICE_URL=http://localhost:8085`로 프록시합니다. 단, 관리자 메시지(`/api/v1/admin/messages*`)는 Admin-Service가 아직 준비되지 않은 개발 구간에서도 레일 채팅을 검증할 수 있도록 `brainx-admin-next`의 API route가 `.dev-data/admin-messages.json` 공용 로컬 파일 저장소를 직접 처리하며, 브라우저별 localStorage fallback 없이 같은 메시지 원장을 공유합니다.

각 서비스는 자기 폴더 기준으로 실행하면 아래 파일을 자동으로 읽습니다.

| Service              | 자동 import                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| Discovery-Service    | `../.env`, `../env/discovery-service.env`                                                         |
| Gateway-Service      | `../.env`, `../env/gateway-service.env`                                                           |
| Admin-Service        | `../.env`, `../env/admin-service.env`                                                             |
| User-Service         | `../.env`, `../env/user-service.env`                                                              |
| Workspace-Service    | Docker 실행 시 `env/workspace-service.env`; 로컬 IDE 실행 시 동일한 값을 Run Configuration에 지정 |
| Ingestion-Service    | `../.env`, `../env/ingestion-service.env`                                                         |
| Commerce-Service     | `../.env`, `../env/commerce-service.env`                                                          |
| Intelligence-Service | `../.env`, `../env/intelligence-service.env`                                                      |
| Mcp-Service          | `../.env`, `../env/mcp-service.env`                                                               |

`JWT_SECRET`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT`, `DB_DRIVER`, `JPA_DDL_AUTO`처럼 모든 서비스가 공유하는 값은 `.env`에 둡니다. 서비스별 논리 DB 이름도 `.env`의 `USER_DB_NAME`, `WORKSPACE_DB_NAME`, `INGESTION_DB_NAME`, `COMMERCE_DB_NAME`, `INTELLIGENCE_DB_NAME`, `MCP_DB_NAME`으로 관리합니다.
Admin-Service는 관리자 시드용 `SEED_ADMIN_LOGIN_ID`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`도 `../env/admin-service.env`에서 함께 읽습니다. 2026-07 기준으로 이 시드 계정은 "빈 DB일 때만 1회 생성"이 아니라, 서비스 부팅 때마다 해당 `loginId` 계정을 owner 권한/지정 비밀번호와 동기화하는 운영용 break-glass 자격으로 취급합니다. 따라서 운영 DB를 재사용하더라도 `SEED_ADMIN_PASSWORD`를 바꾸고 재배포하면 `https://admin.brainx.p-e.kr/login`의 기본 관리자 로그인과 Grafana 초기 로그인 비밀번호가 다시 환경값과 일치해야 합니다.
Docker Compose로 앱을 실행할 때는 앱 컨테이너에만 `POSTGRES_HOST=postgres`를 자동으로 덮어씁니다. 로컬 Gradle/IDE 실행은 `.env`의 `POSTGRES_HOST=localhost`를 그대로 사용합니다.
기존 `brainx_postgres_data` 볼륨이 있는 개발 환경에서도 새 논리 DB가 누락되지 않도록 `apps` 프로필은 `postgres-service-databases` one-shot 컨테이너로 DB 생성 스크립트를 매번 idempotent하게 확인한 뒤 앱 컨테이너를 시작합니다.

기본 DB 접속 정보:

| Service           | DB         | JDBC URL                                            |
| ----------------- | ---------- | --------------------------------------------------- |
| User-Service      | PostgreSQL | `jdbc:postgresql://localhost:5432/brainx_user`      |
| Workspace-Service | PostgreSQL | `jdbc:postgresql://localhost:5432/brainx_workspace` |
| Ingestion-Service | PostgreSQL | `jdbc:postgresql://localhost:5432/brainx_ingestion` |
| Commerce-Service  | PostgreSQL | `jdbc:postgresql://localhost:5432/brainx_commerce`  |
| Mcp-Service       | PostgreSQL | `jdbc:postgresql://localhost:5432/brainx_mcp`       |

그래프 projection/read model용 Neo4j도 Docker Compose로 함께 실행됩니다. Neo4j는 Workspace-Service의 PostgreSQL 원장을 대체하지 않으며, 노트/링크 이벤트를 바탕으로 갱신되는 그래프 조회 저장소입니다.

| Store         | 용도                                  | Local URL               |
| ------------- | ------------------------------------- | ----------------------- |
| Neo4j Browser | 그래프 projection 확인 및 Cypher 실행 | `http://localhost:7474` |
| Neo4j Bolt    | 백엔드 서비스 접속 URI                | `bolt://localhost:7687` |

기본 로컬 계정은 `.env`의 `NEO4J_USERNAME`, `NEO4J_PASSWORD`로 관리합니다. Docker Compose 내부에서 Workspace-Service는 `bolt://neo4j:7687`로 접속하고, 로컬 IDE 실행 시에는 `bolt://localhost:7687`을 사용합니다.
Workspace-Service는 노트 저장 시 본문 `[[...]]` 위키링크와 TipTap `data-wiki-link` span을 authoritative `workspace_note_links` 원장으로 정규화하고, Neo4j는 그 원장을 projection/read model로 반영합니다. `workspace_note_links.link_type`는 MANUAL/WIKI를 구분하는 필수 컬럼이며, 레거시 운영 DB는 `Workspace-Service/src/main/resources/db/migration/V20260702_01__repair_workspace_note_links_link_type.sql`가 기존 행을 백필한 뒤 Hibernate `NOT NULL` 스키마 업데이트가 지나가도록 맞췄습니다. 기본 앱 설정은 `SPRING_SQL_INIT_MODE=always`를 유지하지만, `brainX_back/docker-compose.yml`의 로컬 fresh DB 프로필은 `workspace-service`에 `SPRING_SQL_INIT_MODE=never`를 주입해 빈 DB에서 repair SQL이 선행 실행되어 부팅이 막히지 않게 합니다. 타깃 노트가 나중에 생성되거나 제목이 바뀌는 경우에도 기존 노트들을 다시 스캔해 wiki-link 관계를 재물질화합니다. `/api/v1/graph/sync`는 기존 노트 전체를 다시 스캔해 위키링크 원장을 백필한 뒤 Neo4j `LINKED` 관계를 재구성합니다.

DB 접속 계정과 비밀번호는 루트 `.env`의 `POSTGRES_USER`, `POSTGRES_PASSWORD`를 모든 서비스가 공통으로 사용합니다. 각 서비스는 자기 `application.yml`에서 `.env`의 DB host/port와 서비스별 DB name을 조합해 JDBC URL을 만듭니다.

Discovery-Service는 Eureka registry 역할을 하는 인프라 서비스입니다. Gateway와 각 백엔드는 Discovery에 등록한 뒤 `lb://` 라우팅과 서비스명 기반 조회를 사용합니다.

### Backend: Gateway-Service (포트 8088)

프론트가 바라보는 단일 API 진입점입니다. 현재는 Eureka 등록 서비스명을 `lb://`로 조회해 라우팅합니다.

| Path                                                                                                                                    | Target               |
| --------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `/api/v1/auth/**`, `/api/v1/users/**`, `/api/v1/support/**`                                                                             | User-Service         |
| `/api/v1/notes/**`, `/api/v1/folders/**`, `/api/v1/graph/**`, `/api/v1/share-links/**`                                                  | Workspace-Service    |
| `/api/v1/imports/**`, `/api/v1/exports/**`, `/v1/publish-jobs/**`                                                                       | Ingestion-Service    |
| `/api/v1/plans/**`, `/api/v1/subscriptions/**`, `/api/v1/users/me/subscription`, `/api/v1/users/me/token-usage`, `/api/v1/ai/usage`     | Commerce-Service     |
| `/api/v1/intelligence/**`, `/api/v1/ai/**`(`/api/v1/ai/usage` 제외), `/api/v1/notes/{noteId}/summary`, `/api/v1/users/me/style-profile` | Intelligence-Service |
| `/api/v1/admin/**`                                                                                                                      | Admin-Service        |

Gateway는 보호 API에 대해 `Authorization: Bearer <access-token>`을 검증하고, 통과한 요청에 내부 식별 헤더를 추가합니다. Workspace 체험 API와 AI 기능(`/api/v1/ai/**`, `/api/v1/intelligence/semantic-search`)은 비회원도 사용할 수 있게 Gateway가 guest session cookie(`brainx_guest_id`)를 발급하고 내부 `X-Guest-Id` 헤더를 추가합니다.
공개 랜딩 계측 경로 `/api/v1/landing/**`도 Gateway의 public path로 유지하며 `Admin-Service`로 라우팅합니다. `brainx-next`의 `/download/windows` route는 이 경로를 통해 Windows 설치 파일 다운로드 집계를 남깁니다.
LLM 호출이 포함될 수 있는 Intelligence route(`/api/v1/ai/**`, `/api/v1/intelligence/**`, `/api/v1/notes/{noteId}/summary`)는 Gateway 전역 5초 response timeout을 쓰지 않고 route-level 120초 timeout을 사용합니다. 이 값은 동기 clustering, summary, inline assist처럼 요청 안에서 모델 호출을 마친 뒤 응답하는 작업이 정상 완료 전에 fallback으로 끊기는 것을 막기 위한 상한입니다.

| 구분 | Path                                                                                                        |
| ---- | ----------------------------------------------------------------------------------------------------------- |
| 공개 | `OPTIONS /**`, `/actuator/health`, `/actuator/info`, `/api/v1/auth/**`, `/api/v1/plans`, `/api/v1/plans/**` |
| 보호 | 위 공개 경로를 제외한 모든 Gateway 라우팅 경로                                                              |

검증 성공 시 내부 서비스로 전달되는 헤더:

| Header         | Value                                                           |
| -------------- | --------------------------------------------------------------- |
| `X-User-Id`    | JWT `sub`                                                       |
| `X-User-Email` | JWT `email`                                                     |
| `X-User-Role`  | JWT `role`                                                      |
| `X-Guest-Id`   | Gateway-issued guest id for non-member Workspace trial requests |

클라이언트가 임의로 보낸 `X-User-*`, `X-Guest-Id` 헤더는 Gateway에서 제거한 뒤 JWT 클레임 또는 Gateway guest cookie 기준으로 다시 설정합니다. 로그인/회원가입/OAuth 콜백은 JWT가 아직 없으므로 `/api/v1/auth/**` 공개 경로로 유지합니다.

Workspace-Service는 내부 식별 헤더를 `CurrentActor`로 해석합니다.

- 회원 요청: `X-User-Id`가 있으면 `actorType=USER`, `actorId=<userId>`
- 비회원 요청: `X-Guest-Id`가 있으면 `actorType=GUEST`, `actorId=<guestId>`
- 프런트의 `NEXT_PUBLIC_WORKSPACE_DEV_USER_ID`는 로컬 비로그인 개발 우회용으로만 사용합니다. 실제 로그인 세션(access token)이 있으면 이 dev header로 덮어쓰지 말고 bearer 토큰 기준 사용자 컨텍스트를 그대로 전달해야 사용자별 Workspace/PostgreSQL 데이터가 섞이지 않습니다.

비회원 노트/폴더/링크/그래프 데이터는 체험용 임시 데이터로 취급합니다. Redis in-memory 저장소가 도입되면 guest actor의 Workspace 데이터는 Redis에 저장하고 TTL 만료 또는 세션 종료로 사라지게 합니다. 회원 데이터는 계속 Workspace-Service의 PostgreSQL 원장에 저장합니다.

#### AI 기능 사용 한도

모든 AI 기능(시맨틱 검색, RAG 챗봇, 인라인 어시스트, 에이전트, 클러스터링, 인사이트 리포트, 링크 제안, 브릿지 개념, 폴더 정리 제안)은 호출 전에 Intelligence-Service가 Commerce-Service의 내부 API `POST /internal/v1/entitlements/check`를 동기 호출해 preflight 판정을 받습니다(`EntitlementPort` → `ExternalEntitlementAdapter`, `X-Service-Token`).

- **회원**: 이번 달 사용 크레딧이 플랜의 `monthlyCreditLimit`에 도달하면 이후 AI 호출이 차단됩니다(크레딧 자체는 기존처럼 `TokenUsageRecordedRequested` 이벤트로 비동기 누적).
- **게스트**: capability 종류와 무관하게 합산 **10회**까지만 AI 기능을 호출할 수 있습니다. 카운터는 Commerce-Service의 `commerce_guest_ai_usage` 테이블에 `X-Guest-Id`(Gateway가 발급하는 `gst_` 접두 id) 기준으로 저장되며, 원자적 UPSERT로 동시 요청에서도 한도를 초과하지 않습니다.
- 판정 서비스 장애 시에는 fail-closed(차단)합니다.
- 좌측 하단 AI 사용량 패널(`GET /api/v1/ai/usage`)은 회원이면 크레딧 사용률 %, 게스트면 `사용 횟수 / 10`을 보여줍니다.
- 게스트 노트는 Redis draft로만 존재하고 PostgreSQL/Kafka에는 반영되지 않으므로, 노트 문맥이 필요한 AI 기능(시맨틱 검색, 노트 기반 RAG, 클러스터링 등)은 게스트에게 빈 결과를 줄 수 있습니다 — 이는 별도 과제이며 이번 한도 기능의 범위가 아닙니다.

User-Service도 같은 Redis를 사용합니다. 인증 토큰 자체는 PostgreSQL `RefreshToken` 원장과 JWT에 남기고, 실제 로그인 세션 이력은 Redis에 저장해 관리자 페이지와 내부 API가 읽습니다. 다만 Redis 세션 이력 기록이 실패해도 로그인/OAuth 콜백/토큰 재발급/로그아웃 응답 자체는 계속 성공하도록 best-effort로 처리합니다.
Docker Compose로 실행할 때는 `user-service` 컨테이너가 `REDIS_HOST=redis`를 사용해야 하며, `localhost`를 쓰면 컨테이너 자기 자신을 보게 되어 로그인/OAuth 흐름이 500으로 실패할 수 있습니다.

```powershell
cd C:\Edu\Final\BrainX\brainX_back\Gateway-Service
.\gradlew.bat bootRun
```

### Backend: Discovery-Service (포트 8761)

Eureka registry를 띄우는 인프라 서비스입니다.

```powershell
cd C:\Edu\Final\BrainX\brainX_back\Discovery-Service
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

| Method | Path                                                    | 설명                                                        |
| ------ | ------------------------------------------------------- | ----------------------------------------------------------- |
| POST   | `/v1/imports/notion/oauth/authorize`                    | Notion OAuth URL 생성                                       |
| POST   | `/v1/imports/notion/oauth/callback`                     | Notion OAuth 콜백 처리                                      |
| GET    | `/v1/imports/notion/pages`                              | 연동된 Notion 페이지 목록                                   |
| POST   | `/v1/imports/notion/jobs`                               | Notion 페이지 가져오기                                      |
| POST   | `/v1/imports/obsidian/jobs`                             | ZIP 가져오기 (Obsidian vault 한정이 아닌 범용 ZIP)          |
| POST   | `/v1/imports/file/jobs`                                 | 단일 파일 가져오기 (CSV/PDF/Text/Markdown/HTML/Word)        |
| GET    | `/v1/imports/{importJobId}`                             | 가져오기 작업 상태 조회                                     |
| POST   | `/v1/assets/upload-sessions`                            | 파일 업로드 세션 생성                                       |
| PUT    | `/v1/assets/upload-sessions/{uploadSessionId}/binary`   | 파일 바이너리 업로드                                        |
| POST   | `/v1/assets/upload-sessions/{uploadSessionId}/complete` | 파일 업로드 완료 처리                                       |
| GET    | `/v1/assets/{assetId}`                                  | 파일 상세 조회                                              |
| GET    | `/v1/assets/{assetId}/file`                             | 파일 원본 바이너리 스트리밍 (PDF 임베드 뷰어 iframe이 사용) |

### Backend: Commerce-Service (포트 8084)

결제/구독/플랜 담당 서비스. PostgreSQL 16의 `brainx_commerce` 데이터베이스가 미리 생성되어 있어야 합니다. `application.yml`에 Toss Payments 샌드박스 테스트 키가 기본값으로 포함되어 있습니다.

```powershell
cd C:\Edu\Final\brainX_back\Commerce-Service
.\gradlew.bat bootRun
```

주요 엔드포인트:

| Method | Path                                                   | 설명                                                                                                                    |
| ------ | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/plans`                                        | 플랜 목록 조회                                                                                                          |
| GET    | `/api/v1/users/me/subscription`                        | 내 구독 정보 조회                                                                                                       |
| GET    | `/api/v1/users/me/token-usage`                         | 이번 달 AI 토큰 사용량 조회 (인증된 사용자 기준, Intelligence-Service의 TokenUsageRecordedRequested 이벤트를 구독·집계) |
| POST   | `/api/v1/subscriptions/checkout-sessions`              | 결제 체크아웃 세션 생성 (Toss SDK 구동에 필요한 clientKey/orderId/amount 반환)                                          |
| POST   | `/api/v1/subscriptions/checkout-sessions/{id}/confirm` | Toss 결제 승인 confirm (서버 간 호출로 결제 확정, 성공 시 플랜 즉시 업그레이드)                                         |
| POST   | `/api/v1/subscriptions/change`                         | 구독 플랜 변경 (결제 없이 즉시 변경 — 테스트/다운그레이드용)                                                            |
| POST   | `/api/v1/subscriptions/cancel`                         | 구독 취소                                                                                                               |

자세한 결제 흐름과 DB 스키마는 `brainX_back/Commerce-Service/README.md`를 참고하세요.
결제 팝업은 프런트의 월간/연간 토글 값을 `billingCycle`으로 체크아웃 세션 생성 API에 함께 전달해야 하며, 이 값이 빠지면 Toss SDK를 띄우기 전에 계약 검증 단계에서 실패합니다.

### Backend: Admin-Service API Contract

`BrainX-Admin/brainx-admin-next`가 실제 데이터로 동작하기 위한 관리자 API는 `contracts-v2/brainx-openapi.ssot.yaml`의 `/api/v1/admin/**`로 확정합니다. Admin-Service는 관리자 화면 전용 read model/orchestration layer이며, 원장 데이터는 각 소유 서비스가 유지합니다.

Admin-Service의 Kubernetes 준비 매니페스트는 [k8s/apps/admin-service.yaml](/C:/Edu/0_Final_Project/brainX_2/BrainX/k8s/apps/admin-service.yaml)에서 관리하며, 비민감 설정은 `admin-service-config` ConfigMap으로 분리하고 민감값은 `postgres-secret`, `gateway-secret`, `admin-service-secret`의 `secretKeyRef`로만 주입합니다. `admin-service-secret`에는 최소 `JWT_SECRET`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `SEED_ADMIN_LOGIN_ID`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`가 필요하며, `JWT_SECRET` 값은 다른 인증 서비스와 동일한 서명 키를 사용해야 합니다. 로컬 Kubernetes 검증 단계에서는 Discovery만 클러스터 내부 DNS를 사용하고, Postgres/Kafka 및 나머지 앱 서비스는 `host.docker.internal` + Compose publish 포트를 통해 연결합니다.

공개 랜딩(`brainx-next`) 첫 화면에는 `Windows 앱 다운로드` CTA가 추가되어 `BrainX Setup 0.1.0.exe`를 브라우저 다운로드로 제공합니다. 로컬 개발에서는 `brainx-next`가 `prebuild` 단계에서 작업공간의 `brainx-electron/release/BrainX Setup 0.1.0.exe`를 `brainx-next/public/downloads/`로 복사하고, AWS dev 배포에서는 GitHub Actions가 `brainx-electron` 변경 또는 `build_desktop_installer=true` manual dispatch 시 Windows installer를 새로 빌드해 asset bucket에 업로드한 뒤 같은 workflow 안에서 그 객체를 `brainx-next/public/downloads/`로 주입해 `frontend` 이미지를 빌드합니다. 이 설치 파일은 Git 추적 대상이 아니므로 repo에는 커밋하지 않습니다. 실제 다운로드를 제공하려면 빌드 전에 `brainx-next/public/downloads/BrainX Setup 0.1.0.exe`가 작업공간 또는 CI build context에 준비돼 있어야 하며, 없으면 `/download/windows` route는 `404 Installer not found`를 반환합니다. 파일이 존재할 때는 해당 route가 배포 산출물 안의 `public/downloads` 파일을 스트리밍하면서 동시에 Gateway 공개 경로 `/api/v1/landing/desktop-downloads`를 통해 Admin-Service ledger에 집계를 남깁니다. 이 집계 POST가 비정상 응답을 돌려주면 `brainx-next` 서버 로그에 상태 코드와 응답 본문 일부를 남겨 원인 추적이 가능하도록 했습니다. 관리자 모니터링 overview에는 누적 다운로드 사용자 수/다운로드 횟수와 최근 14일 다운로드 그래프(`desktopDownloadTrend`)가 함께 노출됩니다. 실행 파일 자동 실행은 브라우저/OS 보안 정책을 따르므로, BrainX는 다운로드가 바로 시작되도록만 보장합니다.

현재 관리자 화면은 실제 백엔드 데이터를 기준으로 사용자 플랜, 메모 수, 가입일, 최근 활동을 표시하며, 시간 표시는 모두 `Asia/Seoul` 기준으로 통일합니다. 사용자 목록의 플랜은 결제/환불 이력으로 추정하지 않고 Commerce-Service의 현재 구독 상태를 그대로 보여 주며, 상세 패널과 같은 값이 나오도록 맞췄습니다. 사용자 목록의 메모 수는 `Workspace-Service` note 원장 개수, 최근 활동은 실제 마지막 로그인 세션 시간으로 채웁니다. 사용자 상세의 로그인 기기는 같은 기기/IP 접속을 하나로 합쳐 최신 접속 시간만 갱신하고, 최근 2건만 노출합니다. Electron 기반 데스크톱 앱 로그인은 관리자 화면에서 `BrainX App / Windows`, `BrainX App / macOS`처럼 앱 사용으로 구분해 표시합니다. 사용자 관리 화면에서는 정지된 계정을 바로 정지 취소할 수 있습니다.
관리자 프런트는 `/favicon.ico`를 자체 route로 제공하며, 사용자 상세 활동 내역은 같은 문구와 같은 시각이 겹쳐도 React key 충돌이 나지 않도록 렌더링 키를 보강했습니다.
관리자 로그인 세션 검증은 `localStorage`/same-site cookie에 저장된 최신 access token을 기준으로 동작해야 하며, 로그인 화면이나 콘솔 진입 시점에 먼저 날아간 오래된 `GET /api/v1/admin/me` 실패가 방금 새로 발급된 세션을 지우면 안 됩니다. 따라서 관리자 프런트는 401/403 인증 실패가 실제로 "현재 토큰"에 대응하는 경우에만 세션을 정리하고 `/login`으로 되돌리며, 그 외 일시적인 GET 오류는 로그아웃 대신 오류 표시/fallback으로 처리합니다.
현재 로그인한 관리자의 이름/역할/이메일이 변경되면 관리자 관리 화면, 모니터링 레일의 관리자 목록, 왼쪽 사이드바 프로필, 로컬 세션 값이 함께 갱신되도록 맞췄습니다.
관리자 프로필 사진은 로컬 저장소 값을 공통 상태로 올려, 오른쪽 프로필 레일에서 바꾸면 왼쪽 사이드바와 모니터링 레일 관리자 목록의 현재 로그인 관리자 아바타도 즉시 같이 바뀝니다.
관리자 로그인 세션은 브라우저 `localStorage`와 same-site 쿠키에 함께 저장해 `admin.brainx.p-e.kr -> admin-frontend -> admin-service` 프록시 체인에서도 후속 `/api/v1/admin/**` 요청이 안정적으로 같은 액세스 토큰을 전달하도록 유지합니다.
Admin-Service의 관리자 첫 화면 read model은 Commerce-Service billing read 실패를 그대로 화면 500으로 전파하지 않도록 완화했습니다. 구독/결제 내부 API가 일시적으로 깨지면 사용자 목록은 `free` fallback plan과 빈 결제/구독 목록, 0원 KPI로라도 렌더링해 운영자가 먼저 진입하고 장애를 확인할 수 있게 유지합니다. 다만 근본 원인은 Commerce-Service 운영 DB `commerce_subscriptions.billing_cycle`, `commerce_checkout_sessions.billing_cycle` 같은 원장 스키마를 엔티티와 맞추는 것입니다.
Commerce-Service는 EC2에서 수동으로 넣었던 `commerce_subscriptions.billing_cycle`, `commerce_checkout_sessions.billing_cycle`, `commerce_checkout_sessions_status_check` 보정을 `src/main/resources/db/migration/V20260701_01__repair_billing_cycle_columns.sql`로 추적합니다. Spring SQL init가 이 migration SQL들을 JPA schema update보다 먼저 적용해 오래된 운영 DB도 같은 스키마 보정을 따라가게 했습니다. 기본 앱 설정은 `SPRING_SQL_INIT_MODE=always`를 유지하지만, `brainX_back/docker-compose.yml`의 로컬 fresh DB 프로필은 `commerce-service`에 `SPRING_SQL_INIT_MODE=never`를 주입해 빈 DB에서 repair SQL이 선행 실행되어 부팅이 막히지 않게 합니다.
모니터링 대시보드의 Kafka 큐 대기 Lag는 추정값이 아니라 Kafka consumer group의 현재 lag를 읽어오며, 일별 스냅샷에도 함께 저장해서 목록과 상세가 같은 상태를 보게 했습니다.
Kafka lag 카드의 live 값은 별도 `/api/v1/admin/monitoring/kafka-lag`로 읽어 UI를 가볍게 유지하고, 브로커 연결 실패는 `연결 실패`, committed offset이 없으면 `미집계`, 실제 lag가 0일 때만 `정상`으로 보여 줍니다. 운영 알람 기준은 `1,000 msgs` 이상 경고, `5,000 msgs` 이상 심각으로 두었습니다.
모니터링 서비스 체크에는 `Intelligence-Service`와 `Mcp-Service`도 포함해 AI/MCP 응답과 지연을 실제 health probe 기준으로 보여 줍니다.
모니터링 overview의 KPI delta는 직전 persisted snapshot 대비 증감률로 계산하고, 서비스 uptime은 최근 health snapshot 표본(최대 20건)에서 `DOWN`이 아닌 상태(`UP`, `DEGRADED`) 비율로 계산합니다. 프런트는 overview 응답의 KPI를 다시 mock으로 조립하지 않고 Admin-Service가 내려준 값을 그대로 사용합니다. persisted snapshot은 Admin-Service가 매일 `23:59`에 스케줄러로 저장하며, 오늘 날짜가 아직 `23:59 Asia/Seoul` 이전이면 관리자 화면은 persisted 이력만 보지 않고 live overview와 current-day monitoring overlay를 함께 새로고침해야 합니다.
서비스 체크 상태는 `UP`(정상 응답 + 허용 지연), `DEGRADED`(비정상 응답 또는 지연 임계치 초과), `DOWN`(호출 실패) 3단계로 통일합니다.
overview의 차트 응답은 숫자 배열만 내려주지 않고 `periodLabel`/`timezone`/`source`를 함께 내려, 프런트가 `최근 14일` 같은 고정 문구를 하드코딩하지 않고 Admin-Service overview 메타데이터를 그대로 사용합니다.
overview의 실데이터 차트는 `Commerce-Service`의 `/internal/v1/billing/revenue-trend`와 Admin persisted monitoring snapshot을 함께 사용합니다. 활성 사용자 추이는 최근 13일 persisted monitoring snapshot 값 위에 오늘 현재 `ACTIVE` 회원 수를 live overlay로 얹어 계산하며, 당일 snapshot이 이미 있으면 live 대신 persisted 값을 사용합니다.
`/api/v1/admin/monitoring/snapshots`는 과거 날짜에 대해서는 persisted row만 내려주고, 오늘 날짜의 persisted row가 아직 없으면 live KPI/active user/Kafka lag를 합성한 `persisted=false` current-day overlay row를 맨 앞에 함께 내려줍니다. `brainx-admin-next` 모니터링 화면은 이 목록과 overview를 주기적으로 다시 읽고, `새로고침` 버튼도 실제 API reload를 수행해야 합니다.
운영 로그 기반으로 MSA 개선률을 비교할 때는 [`brainX_back/scripts/calc_msa_efficiency.py`](brainX_back/scripts/calc_msa_efficiency.py)를 사용합니다. baseline/current 폴더에 `Admin-Service`의 `GET /api/v1/admin/monitoring/health` JSON과 Gateway access log를 넣고 `--json` 또는 일반 출력으로 실행하면 `latency reduction`, `fallback interference reduction`, `availability change`를 함께 계산합니다.
Gateway health proxy(`/internal/v1/health/*`)는 downstream actuator가 직접 `503`을 돌려줘도 circuit breaker fallback으로 흡수하도록 `statusCodes: 503`을 명시합니다. 또한 Gateway outbound DNS resolver는 `brainx.gateway.httpclient.dns.*` 설정으로 query timeout, negative TTL, resolve query count를 짧게 제한해 이름 해석 단계 블로킹을 줄입니다.
관리자 모니터링 화면은 상단 선형 차트를 활성 사용자 추이로, 하단 막대 차트를 매출 분석으로 분리해 overview의 `activeUserTrend`와 `revenueTrend`를 각각 실데이터 그대로 사용합니다. `activeUserTrend`는 최근 13일 persisted monitoring snapshot에 오늘 live overlay를 합성하며, 당일 snapshot이 이미 있으면 live 대신 persisted 값을 사용합니다. 하단 모니터링 카드 영역은 `매출 분석`, `Intelligence-Service 응답`, `Kafka 큐 대기 Lag`, `Workspace 원장` 카드 사이 간격을 조금 더 넓혀 시인성을 높였습니다.
overview summary는 결제/사용자 지표 외에 `Workspace-Service`의 `/internal/v1/workspace/monitoring/summary`를 통해 전체 노트 수, 총 저장량, 오늘 생성된 노트 수를 함께 내려줍니다. 관리자 모니터링의 Workspace 원장 카드와 일부 실시간 로그는 이 내부 API의 최근 활동 목록을 사용합니다.
관리자 모니터링 카드 배치는 `매출 분석`과 `Windows 앱 다운로드 + Intelligence-Service 응답`을 상단 두 열로 맞추고, 그 아래 행에 `Workspace 원장`과 `Kafka 큐 대기 Lag`를 좌우 동일 폭으로 배치해 빈 공간 없이 읽히도록 유지합니다. 차트 카드는 축 라벨과 보조 문구를 포함한 하단 여백을 서로 맞춰 카드 간 시각 간격이 일정하게 보이도록 정렬합니다.

| 화면                    | Method            | Path                                                                     | 소유 데이터/연동                                                                                                                           |
| ----------------------- | ----------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 모니터링                | GET               | `/api/v1/admin/dashboard/overview`                                       | Gateway/User/Commerce/Workspace/Ingestion/Intelligence 상태와 KPI 집계, Kafka lag                                                          |
| 사용자 목록             | GET               | `/api/v1/admin/users`                                                    | User-Service 계정 + Workspace note/storage + Commerce current subscription plan                                                            |
| 사용자 상세             | GET               | `/api/v1/admin/users/{userId}`                                           | 프로필, 플랜, 로그인 세션, 활동 이력                                                                                                       |
| 플랜 변경               | PATCH             | `/api/v1/admin/users/{userId}/plan`                                      | Commerce-Service 구독 변경, `SubscriptionChanged`                                                                                          |
| 계정 상태               | PATCH             | `/api/v1/admin/users/{userId}/status`                                    | User-Service 상태 변경, 정지 사유/정지 일수 반영                                                                                           |
| 탈퇴 처리               | POST              | `/api/v1/admin/users/{userId}/withdrawal`                                | User-Service 삭제 요청, `UserDeletionRequested`                                                                                            |
| 일괄 처리               | POST              | `/api/v1/admin/users/bulk-actions`                                       | 플랜 변경/정지/재활성화/탈퇴/공지                                                                                                          |
| 문의 목록               | GET               | `/api/v1/admin/support/tickets`                                          | 관리자 문의 목록                                                                                                                           |
| 문의 상세/배정          | GET/PATCH         | `/api/v1/admin/support/tickets/{ticketId}`                               | 담당자/상태 변경, `SupportTicketUpdated`                                                                                                   |
| 문의 답변               | POST              | `/api/v1/admin/support/tickets/{ticketId}/replies`                       | 로그인 관리자 이름으로 답변 등록, 사용자 문의 상세의 ADMIN 메시지로 표시                                                                   |
| 결제 KPI                | GET               | `/api/v1/admin/billing/summary`                                          | Commerce 이번 달 매출/활성 유료 구독/MRR/실패 건 집계                                                                                      |
| 결제 내역               | GET               | `/api/v1/admin/billing/payments`                                         | Commerce 결제 원장. `method`는 PG 제공자명이 아니라 Toss 응답에서 해석한 사용자 선택 결제수단(카카오페이, 토스페이, 신용카드, 체크카드 등) |
| 환불                    | POST              | `/api/v1/admin/billing/payments/{paymentId}/refund`                      | Commerce 환불, `PaymentRefunded`. `amount`/`reason`을 받아 Toss 환불을 호출하고 환불 완료 메일을 사용자에게 발송                           |
| 결제 재시도             | POST              | `/api/v1/admin/billing/payments/{paymentId}/retry`                       | Commerce 결제 재시도, `PaymentSucceeded`/`PaymentFailed`                                                                                   |
| 구독 현황               | GET               | `/api/v1/admin/billing/subscriptions`                                    | Commerce 구독 원장. 무료 플랜은 제외하고 유료 구독만 표시                                                                                  |
| 결제 실패 추적          | GET               | `/api/v1/admin/billing/payment-failures`                                 | Commerce 실패 사유/재시도 횟수                                                                                                             |
| 요금제 목록             | GET               | `/api/v1/admin/billing/plans`                                            | Commerce 플랜 카탈로그                                                                                                                     |
| 요금제 가격             | PATCH             | `/api/v1/admin/billing/plans/{planId}`                                   | Commerce 플랜 가격 변경, `PlanPriceChanged`                                                                                                |
| 관리자 프로필           | GET/PATCH         | `/api/v1/admin/me`, `/api/v1/admin/me/profile`                           | 관리자 본인 정보                                                                                                                           |
| 관리자 비밀번호         | PATCH             | `/api/v1/admin/me/password`                                              | User-Service credential 변경, `PasswordChanged`                                                                                            |
| 관리자 목록             | GET               | `/api/v1/admin/admin-accounts`                                           | 모든 관리자(owner 포함) 조회 가능, 모니터링 화면 관리자 목록에서 사용                                                                      |
| 관리자 추가/수정/삭제   | POST/PATCH/DELETE | `/api/v1/admin/admin-accounts`, `/api/v1/admin/admin-accounts/{adminId}` | 최고관리자(owner)만 호출 가능                                                                                                              |
| 관리자 메시지 목록/전송 | GET/POST          | `/api/v1/admin/messages`                                                 | 모니터링 우측 레일 채팅창, 전체 발송/선택 발송                                                                                             |
| 관리자 메시지 읽음      | POST              | `/api/v1/admin/messages/{messageId}/read`                                | 우측 프로필 `SMS` 건수와 `읽음` 모달                                                                                                       |

사용자 알림함은 `brainx-next` 상단 종 아이콘과 연결되며, 관리자 `SEND_NOTICE` 일괄 액션이 실행되면 `GET /api/v1/users/me/notifications`, `POST /api/v1/users/me/notifications/{notificationId}/read`, `DELETE /api/v1/users/me/notifications/{notificationId}`로 확인/정리할 수 있습니다. 알림함의 "모두 읽음" 버튼은 `POST /api/v1/users/me/notifications/read-all`로 목록에 보이지 않는(top20 밖) 미확인 알림까지 한 번에 읽음 처리합니다. 이때 서버는 요청 시작 시 cutoff 시각을 고정하고 `createdAt <= cutoff` 인 unread 알림만 읽음 처리하므로, 처리 중 새로 생성된 알림은 unread로 남습니다.

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

- **(2026-07-05 버그 수정) NotesWorkspace editor handle 무한 업데이트 방지**:
  - 분석 대상: `contracts-v2/brainx-openapi.ssot.yaml`, `brainx-next/components/notes/NotesWorkspace.tsx`, `EditorPanel.tsx`.
  - `EditorPanel`이 ref 콜백과 effect 양쪽에서 같은 editor handle을 부모에 반복 등록하고, `NotesWorkspace`가 실제 변경 여부와 무관하게 revision state를 올리면서 `Maximum update depth exceeded` 루프가 날 수 있던 문제를 고쳤다.
  - 이제 부모 등록은 effect 한 군데로만 모으고, 같은 pane/tab 키에 같은 handle이 다시 들어오면 no-op 처리한다. 활성 편집기 추적, 우측 패널의 active editor 연동, split view 편집 기능은 그대로 유지된다.

- **(2026-07-05 버그 수정) 위키링크 title 타입 오염 방어**:
  - 분석 대상: `contracts-v2/brainx-openapi.ssot.yaml`, `brainx-next/components/notes/WikiLinkContext.tsx`, `WikiLinkNode.tsx`.
  - `resolveWikiLinkTitle()`가 `title.trim()`을 바로 호출해, 직렬화가 꼬인 위키링크 attrs에서 `title`이 문자열이 아닌 값으로 들어오면 `/notes` 에디터가 즉시 `TypeError`로 깨지던 문제를 고쳤다.
  - 위키링크 제목/별칭/헤딩은 이제 렌더링, 자동완성, 이동, 생성 전부 공통 정규화 함수로 문자열화하고 trim한 뒤 사용한다. 덕분에 손상된 `data-title`/TipTap attrs가 섞여도 기존 링크 탐색 기능은 유지되고, 비정상 값은 빈 제목으로만 안전하게 격리된다.

- **(2026-07-05 버그 수정) 위키링크 노트명 변경 전파, 로그아웃 400, 탐색기 별 정렬/드래그 상태**:
  - 분석 대상: `brainx-next/lib/auth-api.ts`, `brainx-next/lib/wiki-links.ts`, `brainx-next/components/notes/NotesWorkspace.tsx`, `FolderTree.tsx`, `NotesExplorer.tsx`.
  - 로그아웃: `refreshToken`이 없는 세션에서도 `{"refreshToken":""}` 바디로 서버에 요청을 보내 항상 400(`Refresh Token은 필수입니다`)이 나던 문제를 고쳤다. 이제 refreshToken이 없으면 서버 호출 없이 로컬 세션만 정리하고, 서버 로그아웃이 실패해도(만료된 토큰 등) 로컬 정리는 그대로 진행해 호출부에 "로그아웃 실패"가 잘못 표시되지 않는다.
  - 위키링크: 노트 제목을 바꾸면(`handleTitleChange`) 그 제목을 참조하던 다른 노트의 `[[이전제목]]`을 `[[새제목]]`으로 갱신한다(`lib/wiki-links.ts`의 `renameWikiLinkReferencesInContent` — HTML로 저장된 위키링크 span과 순수 마크다운 `[[...]]` 표기 모두 처리, alias는 보존). 영향받은 다른 노트는 draft/저장 API로 best-effort 백그라운드 저장 후 `brainx:notes-refresh`를 다시 쏴서 그래프/마인드맵에도 반영한다.
  - 노트 탐색기 별(즐겨찾기) 아이콘: 이전에는 "hover 중이면 4개 아이콘 그룹의 3번째", "hover 아니면 단독 아이콘"으로 서로 다른 DOM이 마운트/해제되어 hover 전후로 별 위치가 좌우로 흔들렸다. 이제 즐겨찾기/더보기 버튼은 항상 마운트해두고 opacity만 토글해, 노트/하위 노트/폴더/하위 폴더/즐겨찾기 영역 전체에서 별이 같은 세로선에 고정된다.
  - 드래그 상태 방어: 사이드바 노트의 네이티브 HTML5 드래그(`dragging`)와 본문 위 DnD 오버레이(`dragPayload`)에 dnd-kit 쪽과 동일한 pointerup/pointercancel/blur/visibilitychange 안전망을 추가했다. 드롭 실패/no-op 이동 등에서 브라우저가 dragend를 놓쳐도 탐색기 제목이 흐릿하게 고착되거나, 에디터 첫 클릭이 안 남아 있던 오버레이에 가로채져 더블클릭이 필요하던 문제가 줄어든다.
  - 보류: 홀드앤드랍 이동 영역을 점 6개 핸들에서 행 전체로 넓히는 것은 이번에 적용하지 않았다 — 행 전체에는 이미 별도 목적(에디터로 드롭해 열기/교체)의 네이티브 HTML5 `draggable`이 걸려 있고, 점 6개에는 dnd-kit 포인터 드래그가 걸려 있어 같은 요소에 두 드래그 시스템을 동시에 걸면 클릭/우클릭/펼치기/즐겨찾기/제목 편집과 충돌할 위험이 크다고 판단했다.

- **(2026-07-05 버그 수정) 위키링크 새 노트 생성 race condition 방지**:
  - 분석 대상: `brainx-next/components/notes/NotesWorkspace.tsx`, `WikiLinkAutocomplete.tsx`.
  - 원인: `[[title` 자동완성에서 "새 노트 만들기"를 선택하면 소스 노트의 방금 삽입된 `[[A]]`는 `flushPendingSave()`로 `notes[]` 클라이언트 state에만 반영됐고, 실제 서버 저장은 "지금 활성 탭인 노트만" 저장하는 draft autosave effect(1500ms 디바운스)에 의존했다. `createNote`가 곧바로 새 탭(A)으로 전환하면 그 effect의 대상이 소스 노트에서 A로 바뀌면서 cleanup이 소스 노트의 저장 타이머를 취소해버려, 사용자가 A 탭 이동 직후 다른 곳으로 빠르게 이동하면 소스 노트의 `[[A]]`가 서버에 한 번도 저장되지 못하고 새로고침 시 유실될 수 있었다.
  - 수정: `onCreate`에서 `flushPendingSave()` 직후 `activeEditorHandle.getHTML()`로 지금 이 순간의 최신 본문을 직접 읽어, `notes[]` state 갱신을 기다리지 않고 소스 노트를 즉시 best-effort로 서버에 저장(`persistNoteBestEffort` — 게스트/미확정 노트는 draft save, 로그인 확정 노트는 content PUT)한 뒤에 새 노트를 만들고 탭을 전환한다. 이 저장 호출은 활성 탭 여부와 무관하게 독립적으로 진행되는 네트워크 요청이라 탭 전환에 취소되지 않는다.
  - 소스 노트 자신이 아직 draft id 발급 전(local id)이라 즉시 저장할 방법이 없는 드문 경우에는 `pendingWikiLinkFlushRef`에 표시해두고, 그 노트의 draft id가 확정되는 시점(`createNote`의 `issueWorkspaceNoteDraftId().then`)에 한 번 더 저장을 시도한다 — 이 경우에도 `notes[]` state/화면에는 `[[A]]`가 즉시 반영돼 있어 이번 세션 안에서는 유실되지 않는다.
  - 서버 NoteLink(그래프 edge) 생성은 기존과 동일하게 소스 노트 id가 확정된 이후로 미뤄질 수 있는 범위로 남겨뒀다(게스트/로그인 모두 마크다운 기반 그래프 파생이 있어 새로고침 후에는 연결된다) — 이번 수정은 "링크 텍스트 유실 방지"를 우선했다.

- **(2026-07-05 버그 수정 추가 보완) 위키링크 새 노트(target) 자체의 저장 누락, 그래프 edge 재시도 큐**:
  - 분석 대상: `brainx-next/components/notes/NotesWorkspace.tsx`, `lib/wiki-links.ts`.
  - 추가로 남아있던 원인: 위키링크로 만든 새 노트(A) 자신도 "지금 활성 탭인 동안만" 저장하는 draft autosave effect(1500ms 디바운스)에만 의존했다 — `issueWorkspaceNoteDraftId()`가 draft id(빈 레코드)만 예약해줄 뿐, title="A"/본문을 서버에 실제로 반영하는 건 이 effect뿐이었다. 사용자가 A 탭이 열리자마자 바로 다른 곳으로 이동하면 A는 "예약된 id만 있고 제목/본문은 없는" 상태로 남아 사라진 것처럼 보이거나, 서버 NoteLink 생성이 실패하거나, 게스트 그래프(제목 기준 마크다운 매칭)에서 A라는 제목의 노트를 찾지 못해 연결이 보이지 않았다.
  - 수정: `createNote`의 `issueWorkspaceNoteDraftId().then`에서, draft id가 확정되는 즉시 그 노트(A) 자신의 title/content를 activeNote 여부와 무관하게 `persistNoteBestEffort`로 독립 저장한다. 서버 NoteLink 생성은 이 저장이 끝난(성공/실패 모두) 뒤에 시도해, 최소한 대상 노트가 실제로 존재하는 상태에서 링크를 건다.
  - `pendingWikiLinkEdgeRef` 큐 추가: 링크 생성 시점에 소스 또는 타깃 중 어느 한쪽이 아직 local id라 즉시 `createWorkspaceNoteLink`를 못 부르면, 소스의 local id를 key로 등록해두고, 그 노트가 나중에(다른 `createNote` 호출에서) 자기 draft id를 확정 짓는 순간 실제 id로 링크 생성을 재시도한다. source/target 어느 쪽이 먼저 확정되든 항상 잡힌다.
  - `contentHasWikiLinkTo`/`ensureWikiLinkAppended`(`lib/wiki-links.ts`) 추가: 저장 직전에 `[[title]]`이 실제 문서(HTML span 또는 텍스트)에 남아있는지 검증하고, 라이브에딧 전환 타이밍 등으로 비어있거나(`[[]]`) 사라진 경우 본문 끝에 `[[title]]`을 직접 덧붙여 링크 텍스트 자체는 어떤 경우에도 유실되지 않게 하는 최후의 안전망을 추가했다.
  - actor(guest/user) 전환 시 `pendingWikiLinkFlushRef`/`pendingWikiLinkEdgeRef`도 `draftDirtyNoteIdsRef`와 함께 초기화해, 이전 세션의 local id가 다음 세션에 잘못 매치되지 않게 했다.

- **(2026-07-05 버그 수정 2차 보완) 위키링크 로그인 사용자 `[[A` 미확정 버그, pane별 Ctrl+Wheel 줌**:
  - 분석 대상: `brainx-next/lib/wiki-links.ts`, `brainx-next/components/notes/NotesWorkspace.tsx`, `EditorPanel.tsx`, `PaneTreeRenderer.tsx`, `lib/notes/noteTypes.ts`.
  - 원인: 직전 보완에서 추가한 `contentHasWikiLinkTo`의 정규식(`(?:[|#\]]|\s*$)`)이 닫는 `]]` 없이 문서 끝에서 끝나는 `[[A`까지 "링크가 이미 있다"로 잘못 판단했다 — 그래서 라이브에딧 전환 타이밍 등으로 닫는 `]]`가 아직 안 붙은 상태가 나와도 보정 로직(`ensureWikiLinkAppended`)이 아예 호출되지 않고 미완성 `[[A`가 그대로 저장됐다.
  - 수정: 정규식이 반드시 닫는 `]]`까지 확인하도록 고쳤고(`[[title(#heading)(|alias)]]`만 인정), 실패 시 보정 로직도 `ensureWikiLinkPresent`로 교체했다 — 본문 끝에 무작정 새로 덧붙이던 방식(깨진 `[[A`와 새 `[[A]]`가 중복으로 남을 위험) 대신, 이미 남아있는 미완성 `[[A`를 그 자리에서 `]]`로 닫거나 빈 `[[]]`를 채우고, 흔적이 아예 없을 때만 최후 수단으로 append한다.
  - 위키링크 저장/링크 생성의 `.catch(() => {})`가 실패를 조용히 삼켜 원인을 알 수 없던 부분에 개발 환경 전용 `console.warn`(`warnWikiLinkFailure`)을 추가해, 프로덕션 동작은 그대로 두고 개발 중에만 실패를 확인할 수 있게 했다.
  - Ctrl+Wheel 에디터 줌을 `note.typography.scalePercent`(서식 패널, 문서 자체에 저장)와 완전히 분리했다. 새 `paneFontScale`(pane id → %, 기본 100)을 `NotesWorkspaceSession`에 옵셔널 필드로 추가해 기존 localStorage 세션과 호환되게 하고, `EditorPanel`은 이 값을 CSS `zoom`으로만 적용한다(문서 HTML/note.typography는 건드리지 않음) — 서식 패널의 글자 크기 조절 기능은 그대로 유지된다.

- **(2026-07-05 버그 수정 3차 보완) 위키링크 로그인 그래프 fallback, 화면분할 회귀, 즐겨찾기 헤더/정렬 정리**:
  - 분석 대상: `brainx-next/components/graph-screen.tsx`, `components/notes/WikiLinkAutocomplete.tsx`, `WikiLinkContext.tsx`, `NotesWorkspace.tsx`, `PaneTreeRenderer.tsx`, `NotesExplorer.tsx`.
  - 위키링크 삽입-읽기 시간차 축소: `WikiLinkAutocomplete.commit()`이 `.run()` 직후(같은 동기 실행 안에서) `editor.getHTML()`을 직접 읽어 `onCreate(title, sourceHtml)`로 넘긴다. `NotesWorkspace.onCreate`는 이 값을 최우선으로 신뢰하고, 없을 때만(기존 깨진 링크 "생성" 클릭 등) `activeEditorHandle.getHTML()`을 다시 읽는다 — 리렌더/탭 전환을 거친 뒤 다시 읽으며 생길 수 있는 시간차를 없앴다.
  - 로그인 사용자 그래프 fallback: `graph-screen.tsx`의 `edges`가 서버 `liveEdges`를 받으면 그 값만 쓰고 게스트 markdown 파생(`deriveGraphEdges`)은 아예 무시했다 — 그래서 서버 NoteLink 생성/재조회가 늦으면 방금 만든 위키링크 연결이 로그인 사용자 화면에 전혀 안 보였다. 이제 `liveEdges`가 있어도, 그중 없는 REFERENCE(위키링크) 연결만 markdown 기반으로 보강해 합친다(RELATED/SIMILAR 등 서버 고유 의미 관계는 그대로 서버 값만 신뢰해 노이즈를 늘리지 않는다).
  - 화면분할 회귀: 원인은 `canSplitPane`(`hasSplitPanels || tabs.length > 1`)이 탭이 1개뿐인(가장 흔한) 상태에서 분할을 막고 있던 기존 로직이었다 — pane별 글자 크기 관련 수정과는 무관했다. `tabs.length >= 1`로 완화해 노트를 하나만 열어도 "우측 분할"/"하단 분할"이 정상 동작한다(`NotesWorkspace.tsx`, `PaneTreeRenderer.tsx` 양쪽 동일 기준으로 통일).
  - 즐겨찾기 섹션 헤더(`⭐ 즐겨찾기 (n)`)에서 hover 시 뜨던 노트/폴더 생성 버튼을 제거해 단순 인덱스 헤더로 정리했다(탐색기 상단 "+ 새 노트"/일반 트리에서 만든 뒤 즐겨찾기하는 기존 경로는 그대로 유효). 즐겨찾기 루트 노트 행의 별표/더보기를 일반 트리 노트 행과 동일한 `gap-0.5` 그룹으로 묶어, 간격/세로 정렬이 일반 트리와 일치하도록 맞췄다.

- **(2026-07-05 버그 수정 4차 보완) 화면분할이 노트 텍스트 드롭으로 새던 회귀, 일반 트리 헤더 정리**:
  - 분석 대상: `brainx-next/components/notes/NotesWorkspace.tsx`, `FolderTree.tsx`, `NotesExplorer.tsx`.
  - 원인(화면분할): 3차 보완에서 "에디터 첫 클릭이 막히는 문제"를 고치려고 `dragPayload`/`dragging` 방어 로직에 `pointerup`/`pointercancel` 리스너를 추가했는데, 네이티브 HTML5 드래그(`draggable` 속성)는 `dragstart` 시점에 그 포인터의 캡처를 브라우저가 OS 레벨 드래그로 넘기면서 **표준적으로 `pointercancel`을 쏜다** — 이게 드래그 "실패/취소" 신호가 아니라 드래그 "시작" 신호인데도 같은 리스너로 잡고 있어서, 탭/사이드바 노트를 드래그하자마자 `dragPayload`/`dragging`이 곧바로 `null`/`false`로 리셋됐다. 그 결과 본문 위 분할/교체 오버레이가 뜨지 못했고, 드롭이 오버레이의 `onDrop`이 아니라 에디터 contentEditable의 브라우저 기본 텍스트 드롭으로 새어 들어가 `TabBar`가 `dataTransfer`에 실어둔 `noteId`(`text/plain`)가 그대로 본문에 삽입됐다.
  - 수정: 두 안전망에서 `pointerup`/`pointercancel` 리스너를 제거하고, 실제로 "드래그가 확실히 끝났거나 컨텍스트가 사라진" 신호(`dragend`/`drop`/`blur`/`visibilitychange`)만 남겼다. dnd-kit(PointerSensor) 기반 안전망(`FolderTree`의 `activeDrag`)은 네이티브 드래그가 아니라 이 문제가 없어 그대로 뒀다.
  - 일반 트리 섹션 헤더를 즐겨찾기 헤더와 같은 톤으로 정리했다 — 행 전체가 "새 폴더 생성" 버튼이던 것을 "전체 노트" 레이블 + hover 시 나타나는 루트 폴더 생성 아이콘으로 분리해, 헤더가 액션처럼 보이지 않게 했다. 루트 폴더 생성 자체(입력창, 완료 시 `onCreateFolder`)는 그대로 유지.
  - 위키링크/그래프 항목은 3차 보완(sourceHtml 즉시 전달, REFERENCE edge markdown fallback)에서 코드 경로상 새로운 결함을 추가로 찾지 못했다 — cross-page(그래프 화면과 노트 화면 간) optimistic 캐시는 위험도가 있어 이번엔 설계안만 검토하고 보류했다(본문 참고).

- **(2026-07-05 버그 수정 5차 보완) 위키링크 로그인 사용자 cross-page optimistic 그래프 캐시**:
  - 분석 대상: `brainx-next/lib/notes/pending-wikilink-cache.ts`(신규), `lib/graph-api.ts`, `components/notes/NotesWorkspace.tsx`, `components/graph-screen.tsx`.
  - 원인: `/notes`와 `/graph`는 완전히 별도로 마운트되는 페이지라 컴포넌트 상태를 공유하지 않는다 — 로그인 사용자가 위키링크로 A를 만들고 바로 `/graph`로 이동하면, 그 페이지가 새로 마운트되며 서버에서 노트/그래프를 다시 fetch하는데, 그 시점에 A의 서버 저장(draft/`NoteLink` 생성)이 아직 안 끝났으면 A 자체가 안 보였다. 게스트는 마운트 시 항상 draft 목록을 markdown 기반으로 다시 파생해 상대적으로 덜 겪었지만, 로그인 사용자는 서버 `liveNotes`/`liveEdges`가 비어있으면 그대로 빈 그래프였다.
  - 수정: `lib/notes/pending-wikilink-cache.ts`(sessionStorage, TTL 10분)를 새로 추가해, 위키링크로 새 노트를 만드는 순간(`NotesWorkspace.onCreate`) `{localKey, noteId, title, sourceNoteId, sourceTitle, createdAt}`를 기록하고, draft id가 확정되면(`createNote`의 `issueWorkspaceNoteDraftId().then`) `noteId`를 갱신한다. `graph-screen.tsx`는 기존에 "징검다리 개념" 기능이 쓰던 `optimisticGraphNotesRef`(서버 데이터에 없는 노트를 그래프에 얹었다가, 서버가 같은 id를 내려주면 자동으로 빼는 기존 병합/reconcile 로직)를 그대로 재사용한다 — `refreshGraph`가 호출될 때마다 sessionStorage의 pending 항목을 이 ref에 seed하고, 서버 응답에 같은 id가 나타나면(로그인/게스트 두 경로 모두) ref와 sessionStorage 양쪽에서 함께 제거한다. edge는 따로 합성하지 않는다 — 소스 노트(이미 서버에 저장된 `[[title]]` 텍스트를 가진 실제 노트)와 이 optimistic placeholder가 같은 `notes` 배열에 있으면 기존 `deriveGraphEdges`/`deriveDraftWikiLinkEdges`의 제목 매칭이 알아서 연결선을 만든다.
  - 서버 `createWorkspaceNoteLink` 성공 시(두 호출 경로 모두) sessionStorage 항목도 함께 제거해, 다음 마운트에서 중복 optimistic 삽입이 일어나지 않게 했다. 실패하면 `.catch`가 `warnWikiLinkFailure`(개발 환경 전용 warn)만 남기고 조용히 넘어가되, sessionStorage 항목은 지우지 않아 다음 그래프 새로고침에서도 계속 optimistic하게 보인다.
  - actor(guest/user) 전환 시 `clearPendingWikiLinkEntries()`로 이전 세션 기록을 함께 비운다.

- **(2026-07-05 버그 수정 6차 보완) optimistic edge 직접 합성 — 노드는 바로 보이는데 연결선만 안 보이던 문제**:
  - 분석 대상: `brainx-next/lib/graph-api.ts`, `components/graph-screen.tsx`.
  - 원인: 5차 보완은 A 노드만 optimistic하게 주입하고, 연결선은 "소스 노트(노트1)의 저장된 markdown에서 `[[A]]`를 찾아 제목 매칭"하는 기존 `deriveGraphEdges`/`deriveDraftWikiLinkEdges`에 그대로 의존했다. 이 매칭은 **노트1 자신의 서버 저장(content PUT/draft 저장)이 끝나야** 노트1의 fetch된 markdown에 `[[A]]`가 반영돼 있다는 전제가 있는데, 그 저장도 비동기라 `/graph`가 막 새로 마운트된 시점에는 아직 안 끝나 있을 수 있었다 — 그래서 A 노드는 바로 보이는데 노트1-A 연결선만 안 보이는 정확히 그 증상이 났다.
  - 수정: `pendingWikiLinkEntryToEdge()`(`graph-api.ts`)를 추가해, pending 항목이 이미 알고 있는 `sourceNoteId`/`noteId`/`title`만으로 `{source, target, type:"REFERENCE", weight:0.95, reason, bridge:false}` optimistic edge를 **소스 노트의 저장 상태와 무관하게** 직접 합성한다. `graph-screen.tsx`의 `edges` useMemo에서 서버 edge/markdown 파생 edge를 합친 뒤(`base`), 그 `base`에 같은 source-target 쌍이 이미 있으면 optimistic edge를 제외하고, 없을 때만 추가한다(`edgePairKey`로 방향 무관 중복 판정). 소스/타깃 노트 둘 다 현재 `notes` 배열에 실제로 있을 때만 만든다(존재하지 않는 id로 그려지는 고아 edge 방지).
  - reconcile: 별도 정리 로직이 필요 없다 — optimistic edge는 매 렌더마다 pending 캐시에서 다시 계산되므로, 5차 보완에서 이미 구현한 "서버가 노트를 확인하면 pending 항목을 지운다" 로직이 그대로 동작하면 다음 recompute에서 그 edge도 자동으로 사라진다. 서버 edge가 노트보다 먼저 도착하는 경우(드묾)도 `base`와의 중복 판정으로 즉시 optimistic edge가 걸러진다.
  - 게스트 경로에도 동일한 로직이 적용된다(분기 없음) — 기존 게스트 동작 위에 방어적으로 얹힌 것이라 회귀 없음.

- **(2026-07-05 버그 수정 7차 보완) optimistic 그래프 반영을 일반 새 노트 생성까지 확장**:
  - 분석 대상: `brainx-next/lib/notes/pending-created-note-cache.ts`(`pending-wikilink-cache.ts`를 이 이름으로 일반화), `lib/graph-api.ts`, `components/notes/NotesWorkspace.tsx`, `components/graph-screen.tsx`.
  - 원인: 5~6차 보완의 optimistic 캐시 기록이 `NotesWorkspace.onCreate`(위키링크 전용 콜백)에만 있었다 — "+ 새 노트"/우클릭 새 노트처럼 `linkFromNoteId` 없이 `createNote`를 직접 호출하는 일반 생성 경로는 이 기록을 전혀 타지 않아, 그래프 새 마운트 시점에 서버 저장이 안 끝났으면 새 노트가 그래프에 바로 안 보였다.
  - 수정: 캐시를 위키링크 전용에서 범용으로 일반화했다 — `PendingWikiLinkEntry`의 `sourceNoteId`/`sourceTitle`을 옵셔널로 바꾸고 `PendingCreatedNoteEntry`로 이름을 바꿨으며(`addPendingCreatedNote`/`updatePendingCreatedNoteId`/`removePendingCreatedNote(ByNoteId)`/`readPendingCreatedNotes`/`clearPendingCreatedNotes`), 기록 지점을 `onCreate`에서 **`createNote` 자신**으로 옮겼다 — 위키링크 여부와 무관하게 `createNote`가 호출되는 모든 새 노트 생성이 local id 발급 즉시 기록되고, `linkFromNoteId`가 있을 때만 `sourceNoteId`/`sourceTitle`을 함께 채워 graph-screen이 optimistic edge(6차 보완)까지 만들 수 있게 유지했다.
  - `graph-screen.tsx`의 edge 합성(`pendingWikiLinkEntryToEdge`)은 `sourceNoteId`가 있는 항목에만 적용된다 — 일반 새 노트 항목은 자연히 필터링돼 node만 optimistic 처리되고 edge는 만들어지지 않는다(요구사항 그대로).
  - 서버 `listNotes`/draft 목록에 같은 noteId가 나타나면 5차 보완의 기존 reconcile 로직(`optimisticGraphNotesRef` 병합 + `removePendingCreatedNoteByNoteId`)이 위키링크 여부와 무관하게 동일하게 동작해 중복 없이 정리한다.

- **(2026-07-05 버그 수정 8차 보완) optimistic 캐시 title이 최초 생성 시점 제목으로 박제되던 문제**:
  - 분석 대상: `brainx-next/lib/notes/pending-created-note-cache.ts`, `components/notes/NotesWorkspace.tsx`, `components/graph-screen.tsx`.
  - 원인 1(캐시 자체): `pending-created-note-cache.ts`에는 title을 나중에 갱신하는 함수가 없어서, 노트가 "새 노트"/"새 노트1" 같은 기본 제목으로 처음 기록된 뒤 사용자가 곧바로 제목을 바꿔도 캐시의 `title` 필드는 그대로 남아있었다.
  - 원인 2(graph-screen 쪽 seed 로직): 설령 캐시의 title이 갱신돼도, `refreshGraph`의 seed 루프가 `optimisticGraphNotesRef.current[entry.noteId]`가 **이미 있으면 건너뛰는**(`if (!...)`) 방식이라, 마운트 시점에 한 번 옛 제목으로 seed된 뒤로는 캐시가 갱신돼도 다시 읽어오지 않아 그래프에는 계속 옛 제목이 보였다.
  - 수정: `updatePendingCreatedNoteTitle(noteId, title)`을 추가해 `NotesWorkspace.handleTitleChange`에서 제목이 실제로 바뀔 때마다 호출한다 — `localKey`/`noteId` 양쪽으로 매칭해 draft id 확정 전(local id로 리네임)/후(real id로 리네임) 어느 시점에 이름을 바꿔도 같은 항목을 찾고, 이 노트가 다른 pending 항목의 위키링크 소스였다면 그 `sourceTitle`도 함께 맞춘다. `graph-screen.tsx`의 seed 루프는 "이미 있으면 건너뛰기"를 없애고 매 `refreshGraph`마다 캐시 내용으로 무조건 덮어쓰도록 바꿨다(노트 id가 전역적으로 고유해 다른 optimistic 기능과 충돌할 일이 없다).
  - 위키링크 edge(`pendingWikiLinkEntryToEdge`)는 매 렌더 `edges` useMemo에서 최신 pending 항목으로 다시 계산되므로, 캐시 title이 갱신되면 edge의 표시 라벨도 별도 처리 없이 최신 제목을 반영한다 — 연결(id 기준) 자체는 원래도 안정적이라 A→B 리네임에도 그대로 유지된다.
  - 일반 새 노트/위키링크 새 노트 모두 같은 `updatePendingCreatedNoteTitle` 호출 하나로 커버된다(분기 없음).

- **(2026-07-05 버그 수정 9차 보완) 게스트→로그인 claim 후 화면분할 pane-노트 매핑 꼬임, 프로필 로그아웃 UI/redirect**:
  - 분석 대상: `brainx-next/components/notes/NotesWorkspace.tsx`, `components/utility/account-settings-modal.tsx`, `lib/auth-api.ts`.
  - 원인(화면분할): `resolveActorPersistKey`가 claim mapping(`{from,to}`)으로 guest 세션의 `root`/`paneTabs`를 이미 올바르게 치환해뒀는데도, 뒤이어 실행되는 `loadFromServer`에는 `applyHydration`과 달리 "actor 전환 직후에는 URL의 initialTab을 다시 붙이지 않는다"는 가드가 없었다 — `initialTab.kind === "note"`(로그인 전 특정 노트를 보고 있던 경우)면 무조건 활성 pane을 그 노트(또는 서버가 못 찾으면 `nextNotes[0]`)로 갈아끼우는 폴백이 그대로 실행돼, 방금 복원된 pane 중 하나(예: pane3)의 노트가 엉뚱한 노트로 덮어써졌다.
  - 수정: `loadFromServer`에 `applyHydration`과 동일한 의도의 `attachInitialTab` 매개변수(기본값 `true`)를 추가해 `targetNoteId` 계산과 "첫 번째 노트로 대체" 폴백 양쪽을 이 플래그로 감쌌다. `handleExternalRefresh`의 호출부는 `void loadFromServer(detail?.noteId, false, !detail?.resetWorkspace)`로 바꿔, `resetWorkspace`(actor 전환) 이벤트에서는 `attachInitialTab=false`로 호출해 claim mapping 복원 결과를 덮어쓰지 않게 했다. 일반 URL 직접 진입(비-actor-전환) 경로는 `attachInitialTab`이 기본 `true`라 기존 동작(초기 노트 자동 첨부) 그대로 유지된다.
  - `resolveActorPersistKey`/`replaceNoteIdInNode`/`replaceNoteIdInTabs`는 이미 root tree와 paneTabs 양쪽의 noteId를 mapping대로 일관되게 치환하고 있어 별도 수정이 필요 없었고, `paneFontScale`은 pane id(노트 id 아님) 기준이라 객체 스프레드로 그대로 보존됨을 코드 경로 확인만으로 검증했다(mapping 실패 시 임의 폴백 없이 기존 tab을 유지하는 정책도 이번 수정으로 함께 확보됨).
  - 원인(로그아웃 UI): 프로필 팝업(`ProfilePanel`)에서 "세션(로그아웃)" 섹션이 "계정 연동" 섹션 뒤에 있어 "2단계 인증" 바로 아래에 위치해야 한다는 요구와 어긋났다. `handleLogout`은 `logout()` 성공 시에만 `router.replace("/")`를 호출해, 실패 시(과거 400 재발 등) redirect가 누락될 수 있는 구조였다.
  - 수정: "세션" `<section>`을 "계정 보안"(2단계 인증 포함) 섹션 바로 뒤, "계정 연동" 섹션 앞으로 이동했고, 행 제목을 "로그아웃"에서 "현재 세션"으로 바꿔 버튼(로그아웃)과 구분했다. `handleLogout`은 `router.replace("/")`를 `finally` 블록으로 옮겨 `logout()` 성공/실패와 무관하게 항상 `/`로 이동하도록 했다 — `auth-api.ts`의 `logout()`이 이미 네트워크 실패를 삼키고 항상 `clearAuthSession()`을 호출하도록 고쳐져 있어(이전 라운드 수정) 로컬 세션 정리 자체는 always 보장되고, 이번 수정은 UI 쪽 redirect 누락 가능성까지 방어적으로 제거한 것이다. `mypage-screen.tsx`의 `handleLogout`은 이미 `router.replace("/")`가 try/catch 바깥에서 무조건 실행되는 구조라 별도 수정이 필요 없었다.

- **(2026-07-05 버그 수정 10차 보완) 로그아웃 1클릭 redirect, 세션&로그아웃 UI 재배치, 게스트 폴더 노트 claim 시 루트로 풀리는 버그**:
  - 분석 대상: `brainx-next/components/utility/account-settings-modal.tsx`, `components/utility/mypage-screen.tsx`, `components/notes/NotesWorkspace.tsx`, `app/(app)/notes/layout.tsx`, `lib/auth-api.ts`, 백엔드 `Workspace-Service`의 `NoteDraftPersistenceService`/`WorkspaceService.reassignGuestFolders`.
  - 원인 1(로그아웃 2클릭): `logout()`의 `clearAuthSession()`은 `"brainx:notes-refresh"`(`resetWorkspace:true`)를 쏘는데, `/notes` 페이지에 `NotesWorkspace`가 살아있는 상태에서 이걸 받으면 게스트로 되돌아간 워크스페이스의 `activeNoteId`가 바뀌면서 `app/(app)/notes/layout.tsx`의 `onActiveNoteChange` 콜백이 `router.replace("/notes"...)`를 호출한다 — 이게 `handleLogout`의 `router.replace("/")`와 같은 틱 근처에서 경합해, 첫 클릭은 `/notes`에 남고(경합에서 짐) 세션이 이미 비어 `resetWorkspace`가 다시 안 쏘아지는 두 번째 클릭에서야 `/`로 이동하는 것처럼 보였다.
  - 수정 1: `account-settings-modal.tsx`/`mypage-screen.tsx`의 `handleLogout`에서 `router.replace("/")` 대신 `window.location.replace("/")`(하드 네비게이션)를 쓴다 — 전체 페이지 이동은 이후 어떤 SPA 라우터 호출과도 경합하지 않는다. `replace`를 써서 로그아웃 직전 페이지가 history에 남지 않게 해 뒤로가기로 세션이 복구된 것처럼 보이는 화면에 못 돌아가게 했다.
  - 후속 수정(2026-07-05): 처음엔 `account-settings-modal.tsx`에서 이동 직전 `onClose()`도 호출했으나, 이 경우 "모달이 닫히는 화면"이 한 프레임 보인 뒤 이동하는 게 사용자에게 보였다 — 페이지 자체가 통째로 교체되는 하드 네비게이션이라 모달을 따로 닫을 필요가 없다는 점에 착안해 `onClose()` 호출을 제거하고 `window.location.href` 대신 `window.location.replace`로 바꿔, 모달 닫힘 화면 없이 즉시 `/`로 이동하면서 history도 남기지 않도록 정리했다.
  - 원인 2(UI 위치): "세션(현재 세션/로그아웃)" 섹션이 "계정 보안"보다 아래(정확히는 "계정 연동" 뒤)에 있어, "프로필 사진 변경 바로 아래, 계정 보안보다 위" 요구와 어긋났다.
  - 수정 2: "세션" 섹션을 "계정"(프로필 사진) 섹션 바로 뒤, "계정 보안" 섹션 앞으로 옮겼다. 다른 탭("일반" 패널)의 별도 세션/로그아웃 행은 2단계 인증과 무관한 별개 탭이라 그대로 두었다.
  - 원인 3(폴더 claim): `handleMoveNoteToFolder`(노트 탐색기 드래그앤드랍)가 로컬 `notes` state만 갱신하고 서버에는 전혀 반영하지 않았다 — `handleMoveFolderToParent`(폴더 이동)와 달리 대응하는 PATCH/PUT 호출이 없었다. draft autosave effect는 `activeNote`의 title/content 변화에만 반응해(folderId 변화는 deps에 없음) 백그라운드에서 폴더로 옮긴 노트는 저장 신호를 받을 방법이 없었다. 그 결과 게스트 상태에서 노트를 폴더 안으로 드래그만 하고 내용은 안 건드리면 Redis draft/Postgres에는 이동 전 folderId(주로 루트)가 그대로 남고, 로그인 claim은 그 낡은 값을 그대로 승계해 "일부만 루트로 풀리는" 현상으로 나타났다. 백엔드 `reassignGuestFolders`/`persistDraft`는 폴더 id 자체를 바꾸지 않고(소유자 필드만 변경) `draft.folderId()`를 그대로 복사하므로 claim 로직 자체에는 결함이 없었다.
  - 수정 3: `handleMoveNoteToFolder`에 이동 직후 best-effort 서버 반영을 추가했다 — persisted 노트는 `updateWorkspaceNoteMetadata`(PATCH metadata, OCC 불필요), 아직 draft인 게스트 노트(`note_` 접두 id)는 `saveWorkspaceNoteDraft`(PUT draft)를 호출해 옮긴 폴더로 즉시 저장한다. 실패해도 토스트만 띄우고 로컬 상태는 유지한다(폴더 생성/이동과 동일한 정책).
  - claim 시 화면분할/탭 noteId mapping(9차 보완) 회귀는 없다 — 이번 수정은 폴더 이동 저장 경로만 건드렸다.

- **(2026-07-02 UX 정리) 마이페이지 로그아웃, 위키 자동완성 키 충돌, 그래프 hover 대비 조정**:
  - 마이페이지 프로필 메뉴에 로그아웃 버튼을 회원탈퇴 영역 위로 옮기고, 로그아웃 후에는 `/`(landing)으로 돌아가도록 정리했다.
  - `WikiLinkAutocomplete`는 동일한 제목의 노트가 여러 개 있어도 `note.id` 기반 key를 써서 React 경고가 나지 않도록 보정했다.
  - 그래프 hover 상태에서 비활성 노드/엣지의 투명도를 조금 올려, 흐려지긴 하지만 지나치게 안 보이진 않도록 조정했다.

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
    - 로그인/회원가입 redirect: `lib/auth-api.ts`에 `readReturnToParam`/`buildAuthPath`/`resolveAuthReturnTo`(claim된 noteId로 `/notes/{id}` 치환, 매핑이 있는데 없으면 `/notes`로 폴백)/`stashOAuthReturnTo`/`consumeOAuthReturnTo`(Google 등 외부 리다이렉트 왕복용 sessionStorage)를 추가했습니다. Guest 프로필 드롭다운·로그인/회원가입 화면·온보딩·OAuth 콜백이 현재 경로를 `returnTo`로 주고받아, 로그인 후 원래 보던 페이지로 돌아갑니다. 온보딩 화면은 고정 크기 카드와 좌우 화살표 네비게이션, 마지막 `회원가입 완료` CTA, 애니메이션 진행바로 정리했습니다.
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

## 2026-07 Desktop Popup Bridge Update

- `brainx-next/lib/desktop-bridge.ts` routes popup callbacks through browser `postMessage` on Web and preload/IPC custom events on Electron.
- Notion OAuth callback (`app/notion-callback/page.tsx`), Toss checkout popup (`app/billing/checkout/*`), and note new-window open flows now share the same desktop-aware popup branch.
- Electron social login may use a hosted web origin that is separate from the direct desktop API origin. `NEXT_PUBLIC_WEB_BASE_URL`/`BRAINX_ELECTRON_WEB_ORIGIN` control the browser-facing OAuth pages, while `NEXT_PUBLIC_API_BASE_URL`/`BRAINX_DESKTOP_API_ORIGIN` control the app's direct API calls and may stay aligned or be split for local debugging.

## 2026-07 Signup Reliability Notes

- Email signup already records required consent acceptance inside `POST /api/v1/auth/signup/email` and returns an authenticated session immediately. When the frontend reuses `/onboarding` after this path, the final CTA must not be blocked by empty consent state if no `onboardingToken` exists.
- `brainx-next/components/public/onboarding-screen.tsx` now only requires consent completion for the final submit button when `onboardingToken` is present, which keeps OAuth onboarding strict while allowing email-signup users to finish profile setup.
- `brainX_back/User-Service/src/main/java/brain/web/mvc/service/EmailVerificationService.java` persists the verification code before mail delivery, falls back from an invalid optional `MAIL_FROM` to `spring.mail.username`, skips delivery entirely when SMTP credentials are incomplete, and only returns HTTP 500 for real mail transport/runtime failures.
- Electron auth requests no longer try to enrich `X-Client-Location` through browser geolocation, avoiding Chromium network-location-provider noise during desktop login.

## 2026-07 Desktop File And Session Bridge Update

- `brainx-electron` now exposes native file open/save dialogs and desktop-backed renderer storage for Electron.
- `brainx-next` auth/session persistence now prefers the desktop storage bridge on Electron while keeping browser localStorage/sessionStorage fallback on Web.
- Import file selection and note export download flows now use native dialogs on Electron and browser file flows on Web.

## 2026-07 Desktop Phase 1 Installable App Update

- `brainx-electron` phase 1 now targets an installable desktop shell that each user can run on their own PC before the full local-first vault phase.
- packaged Electron builds now prefer a bundled local Next standalone renderer and fall back to the remote deployment only when the local renderer is unavailable.
- the Electron shell now includes a single-instance lock, custom protocol deep-link scaffold, basic desktop menu, and renderer load fallback screen for desktop stability.
- packaged Windows builds now bootstrap the bundled standalone renderer from unpacked app resources and spawn it with an Electron-compatible Node runtime path instead of relying on the installer executable as a generic fork target.
- packaged Windows builds now use a BrainX-tinted title-bar overlay that keeps the native minimize/maximize/close buttons while removing the default left app icon/title text from the OS chrome.
- bundled Electron renderer requests now prefer same-origin Next proxy routes for auth and public API traffic, so installed apps do not depend on backend CORS allowing the local desktop origin during login.
- Electron social login on the public auth screen now opens the hosted BrainX OAuth start page in the system browser, then returns provider callback completion into the installed app through the `brainx://oauth/...` custom protocol so the desktop renderer can finalize the session and route to Home.
- the Windows desktop package now reads branded icon assets from `brainx-electron/build/icon.png` and `brainx-electron/build/icon.ico`, and those files are kept in the repository build resources so the executable, installer, and development BrowserWindow all share the same app icon instead of Electron defaults.
- the Windows Electron shell now also reports its title-bar overlay height through the desktop bridge, and `brainx-next` reserves that top inset only inside the packaged app so the native minimize/maximize/close controls no longer overlap the header profile and notification actions.

## 2026-07 Desktop Phase 2 Local Vault Foundation

- `brainx-electron` now persists recent vault metadata under the desktop app user-data path and exposes vault discovery/creation IPC bridges to the renderer.
- each selected vault now keeps only BrainX-managed metadata under `.brainx/`, while user-visible notes and imported files live directly under the vault root with their real filenames/extensions and `exports/` remains the explicit export output directory.
- desktop vault snapshots now also reconcile the visible vault tree, so files that users add directly from Windows Explorer appear in the notes workspace on the next refresh without auto-starting cloud sync.
- the desktop vault launcher now follows the active BrainX theme, using the same bright gradient and frosted light panels in light mode instead of a desktop-only dark splash.
- after desktop auto-login, the shell now restores the most recently worked active vault, and the in-app My Page settings flow can switch or create vaults without leaving the desktop app.
- phase 2 is still a foundation step: local vault selection exists, but note CRUD and sync are not yet redirected to the vault storage layer.

## 2026-07 Desktop Phase 2 Local Vault Runtime

- `/notes` on Electron now gates first-run entry behind vault selection so users choose or create a local vault before the workspace mounts.
- the Electron desktop bridge now persists vault note and folder metadata in `.brainx/index.json`, keeps workspace/sync descriptors under `.brainx/`, and stores note bodies as real markdown files directly inside the visible vault folder tree.
- vault assets can now be written into the visible local vault tree with their original filenames/extensions, ZIP imports can expand directly into the active vault while recreating nested folders, and PDF/HTML/image imports now render from the local vault file path instead of requiring the server asset endpoint.
- files copied directly into the visible vault tree from Explorer are now discovered during desktop snapshot reload, turned into local note/asset entries, and shown in `/notes` before any optional manual-cloud sync run.
- PPT notes on Electron now detect local vault assets and fall back to opening the original presentation in the desktop app instead of requesting remote slide previews that do not exist for local-only files.
- packaged Electron renderer builds now pin `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_WORKSPACE_API_BASE_URL`, `NEXT_PUBLIC_INGESTION_API_BASE_URL`, and `API_SERVER_URL` to the production BrainX origin so installed desktop apps keep auth and API flows pointed at the hosted backend instead of accidental localhost defaults.
- `manual-cloud` now runs a real authenticated desktop sync worker for vault note/folder metadata and mirrored asset references, uploads local vault assets before note push, downloads remote image/PDF/HTML assets into the active vault on pull, keeps local-remote id mappings plus asset checksums in `.brainx/sync-state.json`, and writes conflict reports to `.brainx/conflicts/` when both sides changed since the last sync.
- the desktop settings modal now surfaces the latest manual sync result, failed file excerpts, and conflict summaries so users can inspect sync outcomes without opening the vault folder first.
- the latest manual sync job is now persisted inside the active vault so desktop restart or relaunch can restore the last known sync outcome without requiring a fresh manual sync.
- conflict summary rows can now open a detailed conflict report payload from `.brainx/conflicts/`, and the same recent sync status is re-exposed on Home and Notes so active-vault health stays visible outside Settings.
- manual-cloud desktop graph snapshots now preserve each local note's mapped remote note id so the app's `다시 분석`, `전체 선택`, and `추천 생성` AI graph actions call the same server-side note intelligence flows as the web app.
- desktop graph note index-status lookups also resolve against the mapped remote note ids, so synced vault notes no longer stay permanently disabled for graph AI actions after packaging.

## 2026-07 Admin Monitoring Resilience

- `Admin-Service` now self-heals missing `admin_monitoring_snapshots.desktop_download_count` and `desktop_download_users` columns on startup with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ... DEFAULT 0`, which avoids repeated rollout breakage when old rows exist before the new download metrics land.
- `AdminService.dashboardOverview()` and `getMonitoringSnapshots()` no longer hard-fail the whole dashboard when persisted monitoring snapshot reads hit schema drift. They fall back to live-only overview and trend inputs so admin login can still complete and the monitoring page can render while the database catches up.
- This does not replace a proper migration audit on RDS, but it turns the previous “login succeeds then dashboard 500 blocks the console” failure mode into a recoverable degraded state.

## 2026-07 Kubernetes Monitoring Preparation

- `k8s/monitoring/` now contains preparation-only manifests for Prometheus and Grafana on the existing `brainx` namespace. This scope does not install anything and does not change `docker-compose` or any existing application manifest.
- Prometheus is split into a dedicated `ConfigMap` (`prometheus-configmap.yaml`) plus `Deployment`/`Service` (`prometheus.yaml`). The scrape config uses the in-cluster Service DNS names and the shared Spring Boot Actuator metrics path `/actuator/prometheus`.
- The initial scrape targets are the services already prepared in Kubernetes and currently wired in Prometheus: `user-service`, `gateway-service`, `admin-service`, `workspace-service`, and `commerce-service`. `Discovery-Service` is intentionally excluded because its current `application.yml` exposes only `health` and `info`, not `prometheus`.
- `Ingestion-Service` and `Intelligence-Service` already expose `/actuator/prometheus` and stamp `management.metrics.tags.application`, so the Prometheus config keeps commented target blocks ready until their Kubernetes Services are applied.
- Grafana is split into a provisioning `ConfigMap` (`grafana-configmap.yaml`) plus `Deployment`/`Service` (`grafana.yaml`), and admin credentials now come from `k8s/secrets/grafana-secret.example.yaml` via `secretKeyRef`. The datasource is pre-wired to `http://prometheus:9090`, so once both Pods are created Grafana can read Prometheus without manual UI setup.
- `ServiceMonitor` is not included in this preparation. The current repository does not provision Prometheus Operator or its CRDs, so a `ServiceMonitor` object would add a hard dependency without being consumable by the plain Prometheus Deployment prepared here. If the stack later adopts `kube-prometheus-stack` or another Operator-based distribution, revisiting `ServiceMonitor` then is appropriate.
- Apply order when this preparation is used later: `k8s/namespace.yaml` -> `k8s/monitoring/prometheus-configmap.yaml` -> `k8s/monitoring/prometheus.yaml` -> `k8s/secrets/grafana-secret.yaml` -> `k8s/monitoring/grafana-configmap.yaml` -> `k8s/monitoring/grafana.yaml`.
- Known risks: both Deployments currently use `emptyDir`, so Prometheus TSDB data and Grafana state are ephemeral; `grafana-secret.yaml` must be created locally from the example and must not be committed; commented Prometheus jobs must stay disabled until the matching Kubernetes Services actually exist.

## 2026-07 Signup Mail Delivery Fallback

- `User-Service` email verification and temporary-password delivery now logs the underlying mail exception class/message, attempts HTML mail first, and falls back to plain-text delivery if MIME/HTML creation or send fails.
- This keeps the public auth contract the same while making deploy-time diagnosis far clearer: if delivery still fails after the fallback, the logs should now point directly to SMTP authentication, network egress, or provider rejection instead of collapsing every case into an opaque generic failure.
