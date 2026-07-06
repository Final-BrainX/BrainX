# Chat Router 품질 상세 평가 - 2026-06-26

## 평가 대상

`build/chat-router-captures/20260626-chat-router-quality/`의 5개 시나리오를 기준으로 한다. 각 시나리오는 router가 먼저 route를 결정하고, route별 응답/citation 규칙을 검증한다.

## 프롬프트 구조

Router system prompt는 `NOTE_QA`, `WORKSPACE_SEARCH`, `COMPOSE`, `NOTE_ACTION`, `OUT_OF_SCOPE` 중 하나를 strict JSON `{route, reason}`으로 반환하게 한다. 우선순위는 다음과 같다.

- 현재 노트, 선택 텍스트, 현재 문서 그룹을 언급하면 기본적으로 `NOTE_QA`
- 전체 노트, whole workspace, global note search를 명시하면 `WORKSPACE_SEARCH`
- 작성/초안/다시쓰기/outline 생성은 `COMPOSE`. 주제가 최신 뉴스, 스포츠, 정치, 일반 웹 지식처럼 외부 정보여도 사용자의 주된 의도가 문서/보고서/글 초안 생성이면 `COMPOSE`로 둔다.
- 저장/삽입/적용/추가용 초안은 `NOTE_ACTION`
- 날씨, 뉴스, 일반 웹 지식, 앱 설정/계정/빌링 등은 `OUT_OF_SCOPE`. 단, 외부/최신 주제를 언급했다는 이유만으로 작성 요청을 `OUT_OF_SCOPE`로 보내지 않는다.
- “오늘 결과 알려줘”처럼 작성물이 없는 순수 최신 사실 조회는 `OUT_OF_SCOPE`로 유지한다.

Router user prompt는 사용자 message와 `documentGroupId`, `noteScopeKeys`, `clientContextSource`, `clientContextMode`, `clientContextItemCount` metadata를 넣는다.

Route 이후 chat generation prompt는 route에 따라 달라진다. `NOTE_QA`/`WORKSPACE_SEARCH`는 제공된 note context와 최근 대화만 사용하도록 하고, `COMPOSE`는 초안 작성, `NOTE_ACTION`은 실제 mutation 없이 저장 가능한 Markdown 초안 생성으로 제한한다.

## 시나리오별 결과

### NOTE_QA

질의: `현재 문서 그룹 노트 기준으로 RAG 채팅 메시지 전송 흐름을 설명해줘`

Router reason은 현재 문서 그룹 컨텍스트에서 답해야 한다고 판단했다. citation은 8개였고 주요 근거는 다음이다.

- `BrainX 도메인 기준 MSA / API / 이벤트 계약` (`brainx_domain_msa_api_contracts.md`, score `0.521`)
- `BrainX 통합 API 명세서` (`BrainX API 명세서.md`, score `0.485`)
- `주제 배경` (`주제 발표.md`, score `0.440`)

응답은 client 메시지 전송, entitlement check, 벡터 검색, 원문 조회, SSE streaming, token usage event 발행 순서로 설명했다. 문서 그룹 내부 질문으로 분류하고 citation을 붙인 점이 기대 동작과 맞다.

### WORKSPACE_SEARCH

질의: `내 전체 노트에서 인증과 토큰 사용량 관련 내용을 찾아 비교해줘`

Router reason은 "내 전체 노트" 표현을 근거로 workspace-wide 검색/비교가 필요하다고 판단했다. citation은 7개였고 `BrainX 통합 API 명세서`, `BrainX 도메인 기준 MSA / API / 이벤트 계약`, `Async API 문서 해석`이 근거로 쓰였다.

응답은 인증 필요 API와 토큰 사용량 기록/조회 API, `TokenUsageRecordedRequested` 이벤트 소유권을 비교했다. `NOTE_QA`가 아니라 `WORKSPACE_SEARCH`로 간 것이 핵심 통과 지점이다.

### COMPOSE

질의: `BrainX의 AI 노트 검색 기능을 소개하는 짧은 블로그 초안을 써줘`

Router reason은 특정 노트 조회가 아니라 콘텐츠 생성 요청이라고 판단했다. citation은 0개이고, 답변은 블로그 초안 형태의 Markdown 제목과 본문으로 생성됐다. 작성 작업은 citation 필수가 아니므로 통과했다.

추가 정책: `최신 홍명보호 월드컵 성적에 대한 문서 작성해줘`처럼 외부/최신 주제라도 문서 작성 deliverable이 명확하면 `COMPOSE`로 분류한다. 이 경로는 웹 검색을 붙이지 않으므로, 노트 context나 검색 결과가 없을 때 chat generation prompt는 실시간 검증을 주장하지 않고 조심스러운 표현으로 초안을 작성하게 한다.

### NOTE_ACTION

질의: `방금 답변을 노트에 추가할 수 있는 Markdown 초안으로 만들어줘`

Router reason은 노트에 추가하기 위한 Markdown 초안 생성이라고 판단했다. 응답은 Markdown code fence로 감싼 초안이었다. 현재 acceptance rule은 nonblank Markdown 초안을 요구하므로 통과했지만, 실제 editor 적용 UX에서는 code fence를 제거할지 별도 정책이 필요하다.

### OUT_OF_SCOPE

질의: `오늘 서울 날씨 알려줘`

Router reason은 날씨가 노트 검색/작성과 무관한 일반 정보 요청이라고 판단했다. 응답은 "BrainX 본 채팅은 내 노트 검색, 노트 기반 질문, 글 작성, 노트 적용 초안만 처리합니다."라는 guard 문구였고 citation은 0개였다.

순수 최신 사실 조회인 `오늘 월드컵 예선 결과 알려줘`도 작성/초안 deliverable이 없으므로 `OUT_OF_SCOPE`로 둔다.

## 품질 판단

route 분류는 5개 대표 경로 모두 기대값과 일치했다. 특히 `현재 문서 그룹`과 `내 전체 노트`를 구분한 점이 document group 격리와 workspace-wide 검색 라우팅을 나누는 데 중요하다.

## 다음 평가 기준

- `NOTE_ACTION` 응답에서 code fence 허용 여부를 정책화한다.
- `WORKSPACE_SEARCH`가 document group filter를 우회하는 경로인지, public API 정책과 충돌하지 않는지 별도 contract test로 묶는다.
- route event가 항상 첫 SSE event인지 지금처럼 계속 검증한다.
