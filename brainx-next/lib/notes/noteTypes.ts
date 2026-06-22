export type NoteCategory = "backend" | "frontend" | "ai" | "architecture" | "database" | "devops";

export type SortOption = "modified" | "viewed" | "created" | "title" | "favorites" | "ai";

export interface MockFolder {
  id: string;
  name: string;
  parentFolderId: string | null;
  color?: string;
  favorite?: boolean;
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

/** 일반 노트 탭 */
export interface NoteTab {
  id: string;
  kind: "note";
  noteId: string;
  /** 고정된 탭은 "다른 탭 닫기"/"모두 닫기"에서 제외된다 */
  pinned?: boolean;
}

/** Obsidian 스타일 빈 시작 탭 — 새 파일 생성하기/파일로 이동하기/닫기 */
export interface StartTab {
  id: string;
  kind: "start";
}

export type Tab = NoteTab | StartTab;

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
