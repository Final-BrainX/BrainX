export type NoteCategory = "backend" | "frontend" | "ai" | "architecture" | "database" | "devops";

/* "최근 열람순"은 노트 모델에 lastViewedAt/열람 기록이 실제로 연결되어 있지 않아(WorkspaceNoteItem에
   필드 자체가 없고, 프론트가 POST /notes/{id}/views도 호출하지 않는다) 옵션에서 아예 제외했다.
   "최근 수정순"은 NoteEditor.tsx의 setContent 호출에 emitUpdate:false를 명시해, 노트를 열기만
   해도(탭 전환 등 프로그램적 로드) updatedAt이 갱신되던 버그를 고쳐서 신뢰할 수 있게 만들었다 —
   실제 제목/본문 변경에만 반응한다. */
export type SortOption = "modified" | "created" | "title" | "ai";

export type SortDirection = "asc" | "desc";

/** 정렬 옵션을 바꿀 때(방향은 그대로 두고 옵션만 바꿀 때) 적용할 자연스러운 기본 방향.
    제목은 "정방향"이 오름차순(A→Z)이고, 수정일/생성일은 "정방향"이 최신이 먼저 오는
    내림차순이라 서로 반대다 — 옵션을 바꿀 때마다 이 표를 참고해 리셋한다. */
export const DEFAULT_SORT_DIRECTION: Record<SortOption, SortDirection> = {
  modified: "desc",
  created: "desc",
  title: "asc",
  ai: "asc",
};

/** 실제 데이터가 뒷받침되는 정렬 옵션만 이 값이 true다 — "AI 추천순"은 추천 score/근거 데이터가
    없다. UI에서 disabled 처리하고, 실수로 선택되는 경우를 막기 위해 sortNotes/sortFolders에서도
    "정렬 안 함"(원래 순서 유지)으로만 동작한다 — 동작하는 척하지 않는다. */
export const SORT_OPTION_ENABLED: Record<SortOption, boolean> = {
  modified: true,
  created: true,
  title: true,
  ai: false,
};

export const SORT_DIRECTION_APPLICABLE: Record<SortOption, boolean> = {
  modified: true,
  created: true,
  title: true,
  ai: false,
};

/** 제목순 자연 정렬 — 단순 localeCompare 대신 제품 규칙을 명시한다:
    1) 숫자로 시작 2) 알파벳으로 시작 3) 한글로 시작 4) 그 외(기호/이모지 등) 순으로 그룹을 나누고,
    같은 그룹 안에서는 Intl.Collator("ko-KR", {numeric:true, sensitivity:"base"})로 비교한다.
    numeric:true 덕분에 "2장"이 "10장"보다, "API 2"가 "API 10"보다 먼저 오고, sensitivity:"base"라
    대소문자 차이로 순서가 흔들리지 않는다. */
const titleCollator = new Intl.Collator("ko-KR", { numeric: true, sensitivity: "base" });

function titleGroup(title: string): number {
  const ch = title.trim().charAt(0);
  if (/[0-9]/.test(ch)) return 0;
  if (/[a-zA-Z]/.test(ch)) return 1;
  if (/[가-힣ㄱ-ㆎ]/.test(ch)) return 2;
  return 3;
}

export function naturalTitleCompare(a: string, b: string): number {
  const groupDiff = titleGroup(a) - titleGroup(b);
  if (groupDiff !== 0) return groupDiff;
  return titleCollator.compare(a, b);
}

export interface MockFolder {
  id: string;
  name: string;
  parentFolderId: string | null;
  color?: string;
  favorite?: boolean;
}

function directionSign(direction: SortDirection): 1 | -1 {
  return direction === "asc" ? 1 : -1;
}

/** 노트 정렬 — 탐색기(즐겨찾기/검색/폴더트리) 전체가 공유하는 단일 기준. 폴더트리에서도 같은
    depth(형제) 안에서만 이 기준으로 정렬한다. direction은 "오름차순 기준값"에 부호만 곱해서
    적용한다 — modified/created의 "오름차순"은 오래된 것이 먼저(작은 timestamp가 먼저)이므로,
    기존 기본 동작(최신이 먼저)은 direction="desc"에 해당한다. */
export function sortNotes<T extends { title: string; createdAt: number; updatedAt: number; id: string }>(
  notes: T[],
  sortBy: SortOption,
  favorites: Set<string>,
  direction: SortDirection = DEFAULT_SORT_DIRECTION[sortBy]
): T[] {
  const arr = [...notes];
  const sign = directionSign(direction);
  switch (sortBy) {
    case "modified":
      return arr.sort((a, b) => (a.updatedAt - b.updatedAt) * sign);
    case "created":
      return arr.sort((a, b) => (a.createdAt - b.createdAt) * sign);
    case "title":
      return arr.sort((a, b) => naturalTitleCompare(a.title, b.title) * sign);
    case "ai":
      // 실제 데이터가 없다 — SORT_OPTION_ENABLED에서 UI 선택 자체를 막고, 여기서도
      // "동작하는 척" 재정렬하지 않고 원래 순서를 그대로 유지한다.
      return arr;
  }
}

/** 폴더 정렬 — 폴더에는 생성/수정 시각이 없어(MockFolder 참고) "제목순"만 실제로 재정렬하고,
    그 외 기준(최근 수정순 등)에서는 기존 순서를 그대로 유지한다. */
export function sortFolders<T extends { name: string; id: string; favorite?: boolean }>(
  folders: T[],
  sortBy: SortOption,
  favorites: Set<string>,
  direction: SortDirection = DEFAULT_SORT_DIRECTION[sortBy]
): T[] {
  const arr = [...folders];
  const sign = directionSign(direction);
  switch (sortBy) {
    case "title":
      return arr.sort((a, b) => naturalTitleCompare(a.name, b.name) * sign);
    default:
      return arr;
  }
}

/** 노트 전체(문서 단위) 타이포그래피 설정 — 선택한 텍스트에만 적용되는 BubbleToolbar의
    Aa(FontPopover, fontExtensions.ts)와는 별개로 노트 전체의 기본값을 결정한다. */
export interface NoteTypography {
  /** 기본 글꼴 크기 배율(%, 기본 100) — 본문/H1/H2/H3가 이 비율로 함께 커지거나 작아진다 */
  scalePercent?: number;
  /** 문서 전체 기본 글꼴 — null/undefined면 앱 기본 글꼴 사용 */
  fontFamily?: string | null;
  /** 레벨별 개별 글자 크기(px) 오버라이드. 설정된 레벨은 scalePercent 계산값을 무시하고 이 값을 그대로 쓴다 */
  overrides?: {
    body?: number;
    h1?: number;
    h2?: number;
    h3?: number;
  };
}

export interface MockNote {
  id: string;
  title: string;
  content: string;
  tags: string[];
  category: NoteCategory;
  folderId?: string;
  createdAt: number;
  updatedAt: number;
  version?: number;
  persisted?: boolean;
  /** 선택 사항 — 설정하지 않은 노트는 기존 기본 스타일을 그대로 사용한다 */
  typography?: NoteTypography;
}

/** 일반 노트 탭 — 패널에 열린 탭은 항상 실제 노트를 가리킨다. 열린 노트가 하나도 없는 패널은
    탭이 아니라 PaneTabsState.tabs가 빈 배열인 상태(empty state)로 표현하고, 그 경우 워크스페이스는
    Welcome 보드를 보여준다(Welcome은 탭 목록에 들어가지 않는다 — NotesWorkspace.tsx 참고). */
export interface NoteTab {
  id: string;
  kind: "note";
  noteId: string;
  /** 고정된 탭은 "다른 탭 닫기"/"모두 닫기"에서 제외된다 */
  pinned?: boolean;
}

export type Tab = NoteTab;

/** 사이드바 노트 드래그 vs 탭 드래그를 구분 — 드롭 위치별 동작(교체/탭추가/분할/재정렬)을 결정하는 데 사용 */
export type DragPayload =
  | { kind: "note"; noteId: string }
  | { kind: "tab"; paneId: string; tabId: string; noteId: string };

export interface PaneTabsState {
  tabs: Tab[];
  activeTabId: string;
}

export interface PaneLeaf {
  type: "leaf";
  id: string;
  noteId: string;
}

export interface PaneSplit {
  type: "split";
  id: string;
  /** horizontal = 좌|우 분할, vertical = 위/아래 분할 */
  direction: "horizontal" | "vertical";
  children: PaneNode[];
}

export type PaneNode = PaneLeaf | PaneSplit;

/** localStorage에 저장되는 워크스페이스 세션 전체 상태 */
export interface NotesWorkspaceSession {
  root: PaneNode;
  activeId: string;
  paneTabs: Record<string, PaneTabsState>;
  notes: MockNote[];
  folders: MockFolder[];
}
