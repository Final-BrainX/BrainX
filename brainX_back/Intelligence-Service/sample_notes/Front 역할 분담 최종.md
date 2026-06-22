
| 인원       | 역할                             | 담당 영역                                     |
| -------- | ------------------------------ | ----------------------------------------- |
| Front PM | **UI 총괄 + 마인드맵 그래프 + 공용 컴포넌트** | 디자인 시스템, 그래프 UX, 공용 컴포넌트, 전체 화면 톤 통일      |
| 1번       | **노트/에디터 담당**                  | 노트 목록, 노트 작성/수정/삭제, 저장 상태                 |
| 2번       | **홈/AI 채팅 담당**                 | 홈 대시보드, 추천/요약, AI 채팅                      |
| 3번       | **계정/사용자 설정 담당**               | 마이페이지, 설정, 프로필, 개인화 옵션                    |
| 4번       | **공개/가입/운영 화면 담당**             | 랜딩, 로그인, 회원가입, 온보딩, 공유, 결제, 지원, 관리자, 가져오기 |
|          |                                |                                           |

**Front PM 담당 파일**
```
`components/graph-screen.tsx components/brainx-ui.tsx components/workspace-shell.tsx components/utility/utility-shared.tsx app/globals.css tailwind.config.js`
```
-

PM은 특히 아래를 잡아주는 역할입니다.

```
- 마인드맵 그래프 화면 구조/인터랙션
- 공용 Button, Card, Badge, Toggle, EmptyState 등 UI 컴포넌트
- 사이드바/탑바/검색바의 전체 레이아웃
- 색상, 간격, 타이포그래피, 반응형 기준
- 다른 팀원이 만든 화면의 UI 일관성 리뷰
```

----

**1번: 노트/에디터 담당** - 예진

```
components/note-editor-screen.tsx
app/(app)/notes/page.tsx
app/(app)/notes/[id]/page.tsx
components/brainx-provider.tsx
lib/brainx-data.ts
components/public/share-screen.tsx
```
담당 기능:

```
- 노트 생성/수정/삭제
- 마크다운 편집
- 폴더/클러스터 선택
- 즐겨찾기, 링크, 태그
- 저장 상태와 localStorage 연동
- 공유 페이지
```

---

**2번: 토큰 사용량/AI 채팅 담당** - 영진

```
components/chat-screen.tsx app/(app)/home/page.tsx app/(app)/chat/page.tsx components/public/share-screen.tsx components/utility/billing-screen.tsx
```
`

담당 기능:
```
- 사용량 화면
- AI 채팅 UI - 모델 선택, 출처 노트 표시
````

---

**3번: 계정/설정 담당** - 채영

```
components/utility/mypage-screen.tsx
components/utility/settings-screen.tsx
app/(app)/mypage/page.tsx
app/(app)/settings/page.tsx
components/public/landing-screen.tsx
components/public/auth-shared.tsx
components/public/login-screen.tsx
components/public/signup-screen.tsx
components/public/onboarding-screen.tsx
```

담당 기능:
```
- 마이페이지
- 사용자 통계
- 프로필/개인 설정
- 테마, 사이드바, AI 기능 토글
- 로그인/회원가입/온보딩
  랜닝
```

---

**4번: 공개/운영/기타 화면 담당** - 환유

```
components/utility/import-screen.tsx
components/utility/billing-screen.tsx
components/utility/support-screen.tsx
components/utility/admin-screen.tsx
app/(public)/*
app/(app)/import/page.tsx
app/(app)/billing/page.tsx
app/(app)/support/page.tsx
app/(app)/admin/page.tsx
```

담당 기능:

```
- 가져오기
- 내보내기
- 결제/플랜
- 고객지원
- 관리자 화면 (문의처리, 현재 프론트 기능 유지), 페이지 분리 (사이드바 x)
```

---

**협업 규칙**

```
`PM 승인 필요: 
- components/brainx-ui.tsx 
- components/graph-screen.tsx 
  - components/workspace-shell.tsx
     - app/globals.css 
       - tailwind.config.js 1번 승인 필요: 
         - components/brainx-provider.tsx 
           - lib/brainx-data.ts 각 기능 담당자는 자기 화면 안에서 먼저 구현하고, 공용화가 필요할 때만 PM에게 brainx-ui 반영 요청`
```
이 구조가 좋은 이유는 PM이 그래프와 전체 UI의 “기준점”을 잡고, 나머지는 기능별 화면을 병렬로 만들 수 있기 때문입니다. 특히 마인드맵 그래프가 BrainX의 핵심 화면이면 PM이 graph-screen.tsx를 직접 들고 있는 게 맞습니다.

오후 5:38