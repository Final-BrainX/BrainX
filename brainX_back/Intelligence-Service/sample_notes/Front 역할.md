| 담당  | 개발 영역          | 주 담당 파일                                                                                                                                                                                          |
| --- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1번  | 홈/대시보드         | components/home-screen.tsx, app/(app)/home/page.tsx, app/(app)/notes/page.tsx                                                                                                                    |
| 2번  | 노트 작성/편집       | components/note-editor-screen.tsx, app/(app)/notes/[id]/page.tsx                                                                                                                                 |
| 3번  | 지식 그래프         | components/graph-screen.tsx, app/(app)/graph/page.tsx                                                                                                                                            |
| 4번  | AI 채팅          | components/chat-screen.tsx, app/(app)/chat/page.tsx                                                                                                                                              |
| 5번  | 공개/계정/설정/기타 화면 | /public-screens.tsx, components/utility-screenscomponents.tsx, app/(public)/*, app/(app)/import/page.tsx, mypage/page.tsx, billing/page.tsx, settings/page.tsx, support/page.tsx, admin/page.tsx |
|     |                |                                                                                                                                                                                                  |

공용 파일은 겹치기 쉬우니 **담당자를 따로 정하고, 아무나 바로 수정하지 않는 규칙**이 좋습니다.

|공용 파일|추천 담당|
|---|---|
|components/brainx-provider.tsx|2번, 노트 상태/저장 로직 담당|
|lib/brainx-data.ts|2번 또는 3번, 노트/그래프 데이터 모델 담당|
|components/brainx-ui.tsx|5번, 공용 UI 컴포넌트 담당|
|components/workspace-shell.tsx|5번, 사이드바/탑바/검색/레이아웃 담당|
|app/globals.css, tailwind.config.js|5번, 스타일 시스템 담당|
|app/layout.tsx, app/providers.tsx, app/(app)/layout.tsx|5번, 앱 골격 담당|

주의할 점은 components/utility-screens.tsx가 너무 큽니다. Import, MyPage, Billing, Settings, Support, Admin이 한 파일에 들어 있어서 5번 담당자 일이 많고 충돌 위험도 있습니다. 가능하면 초반에 아래처럼 분리하면 더 좋습니다.

`components/import-screen.tsx components/mypage-screen.tsx components/billing-screen.tsx components/settings-screen.tsx components/support-screen.tsx components/admin-screen.tsx`

**추천 운영 규칙**

1. 각자 자기 담당 components/*-screen.tsx와 연결된 app/**/page.tsx만 수정한다.
2. brainx-ui.tsx, brainx-provider.tsx, brainx-data.ts, workspace-shell.tsx 수정이 필요하면 담당자에게 요청한다.
3. 새 공용 컴포넌트가 필요하면 바로 brainx-ui.tsx에 넣지 말고, 먼저 자기 화면 파일 안에서 만든 뒤 재사용 확정 시 공용화한다.
4. PR/커밋 단위는 화면 단위로 나눈다. 예: home-screen, note-editor, graph, chat, settings.

현재 구조 기준으로는 이 분담이 제일 안 겹칩니다. 단, 5번이 범위가 넓으니 실제 팀이면 utility-screens.tsx 파일 분리를 먼저 하고 시작하는 걸 추천합니다.