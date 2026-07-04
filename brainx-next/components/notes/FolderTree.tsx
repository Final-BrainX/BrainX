"use client";

import { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  PointerSensor,
  MeasuringStrategy,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
  type MeasuringConfiguration,
} from "@dnd-kit/core";
import {
  Folder,
  FolderOpen,
  FolderPlus,
  FileText,
  Plus,
  FilePlus,
  MoreHorizontal,
  Pencil,
  Palette,
  Star,
  Trash2,
  Check,
  GripVertical,
  Inbox,
  MoveRight,
} from "lucide-react";
import { cx } from "@/lib/utils";
import { MockFolder, MockNote, type SortOption, type SortDirection, sortNotes, sortFolders } from "@/lib/notes/noteTypes";
import { formatAbsoluteDateTime, formatRelativeTime } from "@/lib/notes/formatDate";
import { CollapseChevron } from "./CollapseChevron";
import { HoverInfoCard } from "./HoverInfoCard";
import {
  resolveDrop,
  type DragActiveData,
  type DropTargetData,
  type ResolvedDrop,
  type DropHandlers,
} from "@/lib/notes/folderDnd";

/* ── 폴더 색상 팔레트 (기본 = 노랑) ───────────────────── */
export const FOLDER_COLORS: { label: string; value: string }[] = [
  { label: "기본(노랑)", value: "#eab308" },
  { label: "파랑",       value: "#3b82f6" },
  { label: "초록",       value: "#22c55e" },
  { label: "빨강",       value: "#ef4444" },
  { label: "보라",       value: "#8b5cf6" },
  { label: "주황",       value: "#f97316" },
  { label: "분홍",       value: "#ec4899" },
  { label: "회색",       value: "#6b7280" },
];
const DEFAULT_FOLDER_COLOR = FOLDER_COLORS[0].value;

const DND_MEASURING_CONFIG: MeasuringConfiguration = {
  droppable: { strategy: MeasuringStrategy.Always },
};

/* ── 트리 구성 ─────────────────────────────────────── */
interface FolderTreeItem {
  folder: MockFolder;
  notes: MockNote[];
  children: FolderTreeItem[];
}

/* 폴더트리 정렬 — NotesExplorer 상단의 정렬 드롭다운(sortBy)과 동일한 기준을 공유한다(sortNotes/
   sortFolders, lib/notes/noteTypes.ts). 형제(같은 depth) 안에서만 정렬하고, 하위 폴더도 재귀적으로
   같은 기준을 적용한다 — "폴더 먼저, 그 아래 노트" 배치 자체는 건드리지 않는다. */
function buildTree(
  folders: MockFolder[],
  notes: MockNote[],
  parentId: string | null,
  sortBy: SortOption,
  favorites: Set<string>,
  direction: SortDirection
): FolderTreeItem[] {
  const siblingFolders = sortFolders(folders.filter((f) => f.parentFolderId === parentId), sortBy, favorites, direction);
  return siblingFolders.map((folder) => ({
    folder,
    notes: sortNotes(notes.filter((n) => n.folderId === folder.id), sortBy, favorites, direction),
    children: buildTree(folders, notes, folder.id, sortBy, favorites, direction),
  }));
}

/* 드래그 중 표시할 인디케이터 */
export interface OverIndicator {
  targetId: string;
  position: "before" | "after" | "into";
  valid: boolean;
}

/* 선택된 항목 정보 */
export interface SelectableItem {
  id: string;
  type: "note" | "folder";
}

/* ── Props ──────────────────────────────────────────── */
interface FolderTreeProps {
  folders: MockFolder[];
  notes: MockNote[];
  activeNoteId: string;
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onNoteClick: (noteId: string) => void;
  onCreateFolder: (parentFolderId: string | null, name: string) => void;
  onCreateNote: (folderId?: string) => void;
  onRenameFolder: (folderId: string, newName: string) => void;
  onChangeFolderColor: (folderId: string, color: string) => void;
  onToggleFolderFavorite: (folderId: string) => void;
  favorites?: Set<string>;
  /** NotesExplorer 상단 정렬 드롭다운의 현재 값 — 폴더트리도 같은 기준으로 정렬한다. */
  sortBy?: SortOption;
  sortDirection?: SortDirection;
  onToggleNoteFavorite?: (noteId: string) => void;
  onRenameNote?: (noteId: string, newTitle: string) => void;
  onDragStart: (noteId: string) => void;
  onDragEnd: () => void;
  onMoveNoteToFolder: (noteId: string, targetFolderId: string | null) => void;
  onReorderNote: (noteId: string, referenceNoteId: string, position: "before" | "after") => void;
  onMoveFolderToParent: (folderId: string, targetParentId: string | null) => void;
  onReorderFolder: (folderId: string, referenceFolderId: string, position: "before" | "after") => void;
  /* 다중 선택 */
  selectedIds?: Set<string>;
  onItemClick?: (item: SelectableItem, e: React.MouseEvent) => void;
  /* 삭제 요청 — 우클릭(또는 "..." 버튼)한 시점의 선택 스냅샷(1개 이상의 id)을 그대로 넘긴다.
     부모(NotesExplorer)가 이 스냅샷을 기준으로 확인 모달을 띄우고, 확인/취소 시 스냅샷 상태를
     정리한다. 이후 selectedIds가 바뀌거나 초기화돼도 이미 열린 삭제 확인에는 영향이 없다. */
  onRequestDelete?: (ids: string[]) => void;
  /* 이동 */
  onMoveItems?: (ids: SelectableItem[], targetFolderId: string | null) => void;
}

const EMPTY_FAVORITES = new Set<string>();
const EMPTY_SELECTED = new Set<string>();

export default function FolderTree({
  folders,
  notes,
  activeNoteId,
  selectedFolderId,
  onSelectFolder,
  onNoteClick,
  onCreateFolder,
  onCreateNote,
  onRenameFolder,
  onChangeFolderColor,
  onToggleFolderFavorite,
  favorites = EMPTY_FAVORITES,
  sortBy = "modified",
  sortDirection = "desc",
  onToggleNoteFavorite,
  onRenameNote,
  onDragStart,
  onDragEnd,
  onMoveNoteToFolder,
  onReorderNote,
  onMoveFolderToParent,
  onReorderFolder,
  selectedIds = EMPTY_SELECTED,
  onItemClick,
  onRequestDelete,
  onMoveItems,
}: FolderTreeProps) {
  const tree = useMemo(
    () => buildTree(folders, notes, null, sortBy, favorites, sortDirection),
    [folders, notes, sortBy, favorites, sortDirection]
  );
  const folderIds = useMemo(() => new Set(folders.map((folder) => folder.id)), [folders]);
  const rootNotes = useMemo(
    () => sortNotes(notes.filter((note) => !note.folderId || !folderIds.has(note.folderId)), sortBy, favorites, sortDirection),
    [notes, folderIds, sortBy, favorites, sortDirection]
  );

  /* DnD */
  const [activeDrag, setActiveDrag] = useState<DragActiveData | null>(null);
  const [overIndicator, setOverIndicator] = useState<OverIndicator | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const dropHandlers: DropHandlers = useMemo(
    () => ({
      moveNoteToFolder: onMoveNoteToFolder,
      reorderNote: onReorderNote,
      moveFolderToParent: onMoveFolderToParent,
      reorderFolder: onReorderFolder,
    }),
    [onMoveNoteToFolder, onReorderNote, onMoveFolderToParent, onReorderFolder]
  );

  const resolveCurrent = useCallback(
    (event: DragOverEvent | DragEndEvent): ResolvedDrop | null => {
      const active = event.active.data.current as DragActiveData | undefined;
      const over = event.over;
      if (!active || !over) return null;
      const overData = over.data.current as DropTargetData | undefined;
      if (!overData) return null;
      const activeRect = event.active.rect.current.translated;
      if (!activeRect) return null;
      return resolveDrop(folders, active, overData, activeRect, over.rect, notes);
    },
    [folders, notes]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDrag((event.active.data.current as DragActiveData) ?? null);
  }, []);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const resolved = resolveCurrent(event);
      setOverIndicator(
        resolved ? { targetId: resolved.indicatorTargetId, position: resolved.position, valid: resolved.valid } : null
      );
    },
    [resolveCurrent]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const resolved = resolveCurrent(event);
      if (resolved?.valid) resolved.commit(dropHandlers);
      setActiveDrag(null);
      setOverIndicator(null);
    },
    [resolveCurrent, dropHandlers]
  );

  const handleDragCancel = useCallback(() => {
    setActiveDrag(null);
    setOverIndicator(null);
  }, []);

  return (
    <DndContext
      sensors={sensors}
      measuring={DND_MEASURING_CONFIG}
      autoScroll={false}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="py-1">
        {tree.map((item) => (
          <FolderNode
            key={item.folder.id}
            item={item}
            depth={0}
            activeNoteId={activeNoteId}
            selectedFolderId={selectedFolderId}
            activeDrag={activeDrag}
            overIndicator={overIndicator}
            onSelectFolder={onSelectFolder}
            onNoteClick={onNoteClick}
            onCreateFolder={onCreateFolder}
            onCreateNote={onCreateNote}
            onRenameFolder={onRenameFolder}
            onChangeFolderColor={onChangeFolderColor}
            onToggleFolderFavorite={onToggleFolderFavorite}
            onRequestDelete={onRequestDelete}
            favorites={favorites}
            onToggleNoteFavorite={(id) => onToggleNoteFavorite?.(id)}
            onRenameNote={onRenameNote}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            selectedIds={selectedIds}
            onItemClick={onItemClick}
            folders={folders}
            onMoveItems={onMoveItems}
          />
        ))}

        {rootNotes.map((note) => (
          <NoteRow
            key={note.id}
            note={note}
            depth={0}
            isActive={note.id === activeNoteId}
            isSelected={selectedIds.has(note.id)}
            selectedIds={selectedIds}
            activeDrag={activeDrag}
            overIndicator={overIndicator}
            onNoteClick={onNoteClick}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onRequestDelete={onRequestDelete}
            isFavorite={favorites.has(note.id)}
            onToggleFavorite={() => onToggleNoteFavorite?.(note.id)}
            onRenameNote={onRenameNote}
            onItemClick={onItemClick}
            folders={folders}
            onMoveItems={onMoveItems}
          />
        ))}

        {activeDrag && <RootDropZone />}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDrag && (
          <div
            className="flex items-center gap-1.5 rounded-md border border-primary/50 px-2.5 py-1.5 text-[13px] font-medium text-txt shadow-lg"
            style={{ background: "rgb(var(--surface))", boxShadow: "0 8px 20px -4px rgba(2,6,23,0.5)" }}
          >
            {activeDrag.dragType === "folder" ? (
              <Folder size={12} className="shrink-0 text-yellow-400" />
            ) : (
              <FileText size={12} className="shrink-0 text-txt3" />
            )}
            <span className="max-w-[160px] truncate">{activeDrag.title}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

/* ── 루트 드롭존 ── */
function RootDropZone() {
  const { setNodeRef, isOver } = useDroppable({
    id: "root-zone",
    data: { dropType: "root" } satisfies DropTargetData,
  });

  return (
    <div
      ref={setNodeRef}
      className={cx(
        "mt-1.5 flex h-9 items-center justify-center gap-1.5 rounded-md border border-dashed text-[11px] transition-colors",
        isOver ? "border-primary bg-primary/10 text-primary" : "border-line/40 text-txt3"
      )}
    >
      <Inbox size={12} />
      루트로 이동
    </div>
  );
}

/* ── 드롭 인디케이터 ── */
export function DropIndicatorOverlay({ indicator }: { indicator: OverIndicator | null }) {
  if (!indicator) return null;
  const color = indicator.valid ? "rgb(var(--primary))" : "rgb(239 68 68)";
  if (indicator.position === "into") {
    return (
      <div
        className="pointer-events-none absolute inset-0 rounded-md"
        style={{ border: `1.5px solid ${color}`, background: indicator.valid ? "rgb(var(--primary) / 0.08)" : "rgb(239 68 68 / 0.08)" }}
      />
    );
  }
  return (
    <div
      className="pointer-events-none absolute left-0 right-0 h-[2px] rounded-full"
      style={{ background: color, top: indicator.position === "before" ? -1 : undefined, bottom: indicator.position === "after" ? -1 : undefined }}
    />
  );
}

/* ── 메뉴 셸 ── */
function MenuShell({
  anchor,
  onClose,
  width = 176,
  children,
}: {
  anchor?: { x: number; y: number } | null;
  onClose: () => void;
  width?: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  useLayoutEffect(() => {
    if (!anchor) { setPos(null); return; }
    const h = ref.current?.offsetHeight ?? 0;
    const left = Math.max(8, Math.min(anchor.x, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(anchor.y, window.innerHeight - h - 8));
    setPos({ left, top });
  }, [anchor, width]);

  if (anchor) {
    return createPortal(
      <div
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        className="fixed z-[2000] overflow-hidden rounded-lg border border-line/60 py-1"
        style={{
          left: pos?.left ?? anchor.x,
          top: pos?.top ?? anchor.y,
          width,
          background: "rgb(var(--surface))",
          boxShadow: "0 8px 24px -4px rgba(2,6,23,0.45)",
          visibility: pos ? "visible" : "hidden",
        }}
      >
        {children}
      </div>,
      document.body
    );
  }

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      className="absolute right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-line/60 py-1"
      style={{ width, background: "rgb(var(--surface))", boxShadow: "0 8px 24px -4px rgba(2,6,23,0.45)" }}
    >
      {children}
    </div>
  );
}

/* ── 폴더 더보기 메뉴 ── */
interface FolderMenuProps {
  folder: MockFolder;
  anchor?: { x: number; y: number } | null;
  onCreateSubfolder: () => void;
  onCreateNote: () => void;
  onStartRename: () => void;
  onChangeColor: (color: string) => void;
  onToggleFavorite: () => void;
  onMove?: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function FolderMenu({
  folder,
  anchor,
  onCreateSubfolder,
  onCreateNote,
  onStartRename,
  onChangeColor,
  onToggleFavorite,
  onMove,
  onDelete,
  onClose,
}: FolderMenuProps) {
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  const itemClass =
    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-txt2 transition-colors hover:bg-surface2/60 hover:text-txt";

  return (
    <MenuShell anchor={anchor} onClose={onClose} width={176}>
      {!colorPickerOpen ? (
        <>
          <button type="button" className={itemClass} onClick={() => { onCreateSubfolder(); onClose(); }}>
            <Plus size={12} className="shrink-0" /> 새 폴더 생성
          </button>
          <button type="button" className={itemClass} onClick={() => { onCreateNote(); onClose(); }}>
            <FilePlus size={12} className="shrink-0" /> 새 노트 생성
          </button>
          <button type="button" className={itemClass} onClick={() => { onStartRename(); onClose(); }}>
            <Pencil size={12} className="shrink-0" /> 이름 변경
          </button>
          <button type="button" className={itemClass} onClick={() => setColorPickerOpen(true)}>
            <Palette size={12} className="shrink-0" /> 색상 변경
          </button>
          <button type="button" className={itemClass} onClick={() => { onToggleFavorite(); onClose(); }}>
            <Star size={12} className={cx("shrink-0", folder.favorite && "fill-yellow-400 text-yellow-400")} />
            {folder.favorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
          </button>
          {onMove && (
            <button type="button" className={itemClass} onClick={() => { onMove(); onClose(); }}>
              <MoveRight size={12} className="shrink-0" /> 이동
            </button>
          )}
          <div className="my-1 border-t border-line/30" />
          <button
            type="button"
            className={cx(itemClass, "text-red-400 hover:text-red-300")}
            onClick={() => { onDelete(); onClose(); }}
          >
            <Trash2 size={12} className="shrink-0" /> 삭제
          </button>
        </>
      ) : (
        <div className="px-3 py-2">
          <p className="mb-1.5 text-[10px] text-txt3">색상 선택</p>
          <div className="grid grid-cols-4 gap-1.5">
            {FOLDER_COLORS.map((c) => {
              const active = (folder.color ?? DEFAULT_FOLDER_COLOR) === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  onClick={() => { onChangeColor(c.value); onClose(); }}
                  className="grid h-6 w-6 place-items-center rounded-full border border-line/40 transition-transform hover:scale-110"
                  style={{ background: c.value }}
                >
                  {active && <Check size={11} className="text-white drop-shadow" strokeWidth={3} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </MenuShell>
  );
}

/* ── 노트 더보기 메뉴 ── */
interface NoteMenuProps {
  note: MockNote;
  isFavorite: boolean;
  anchor?: { x: number; y: number } | null;
  onStartRename: () => void;
  onToggleFavorite: () => void;
  onMove?: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/* 삭제 확인은 이제 이 메뉴 안에서 window.confirm()으로 즉석 처리하지 않는다 — 호출부(NotesExplorer)가
   단일/다중 삭제를 하나의 커스텀 ConfirmDialog로 통일해서 띄운다. 여기서 window.confirm과 커스텀
   모달을 같이 쓰면(과거 구현) 네이티브 모달이 열려있는 동안 나머지 페이지 클릭 처리와 얽혀 "취소" 후
   엉뚱한 클릭에서 확인창이 다시 뜨는 것처럼 보이는 문제가 있었다 — 확인 흐름을 하나로 합쳐 제거했다. */
export function NoteMenu({ note: _note, isFavorite, anchor, onStartRename, onToggleFavorite, onMove, onDelete, onClose }: NoteMenuProps) {
  const itemClass =
    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-txt2 transition-colors hover:bg-surface2/60 hover:text-txt";

  return (
    <MenuShell anchor={anchor} onClose={onClose} width={160}>
      <button type="button" className={itemClass} onClick={() => { onStartRename(); onClose(); }}>
        <Pencil size={12} className="shrink-0" /> 이름 변경
      </button>
      <button type="button" className={itemClass} onClick={() => { onToggleFavorite(); onClose(); }}>
        <Star size={12} className={cx("shrink-0", isFavorite && "fill-yellow-400 text-yellow-400")} />
        {isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
      </button>
      {onMove && (
        <button type="button" className={itemClass} onClick={() => { onMove(); onClose(); }}>
          <MoveRight size={12} className="shrink-0" /> 이동
        </button>
      )}
      <div className="my-1 border-t border-line/30" />
      <button
        type="button"
        className={cx(itemClass, "text-red-400 hover:text-red-300")}
        onClick={() => {
          onClose();
          onDelete();
        }}
      >
        <Trash2 size={12} className="shrink-0" /> 삭제
      </button>
    </MenuShell>
  );
}

/* ── 폴더 노드 (재귀) ─────────────────────────────────── */
interface FolderNodeProps {
  item: FolderTreeItem;
  depth: number;
  activeNoteId: string;
  selectedFolderId: string | null;
  activeDrag: DragActiveData | null;
  overIndicator: OverIndicator | null;
  onSelectFolder: (folderId: string | null) => void;
  onNoteClick: (noteId: string) => void;
  onCreateFolder: (parentFolderId: string | null, name: string) => void;
  onCreateNote: (folderId?: string) => void;
  onRenameFolder: (folderId: string, newName: string) => void;
  onChangeFolderColor: (folderId: string, color: string) => void;
  onToggleFolderFavorite: (folderId: string) => void;
  onRequestDelete?: (ids: string[]) => void;
  favorites: Set<string>;
  onToggleNoteFavorite: (noteId: string) => void;
  onRenameNote?: (noteId: string, newTitle: string) => void;
  onDragStart: (noteId: string) => void;
  onDragEnd: () => void;
  selectedIds: Set<string>;
  onItemClick?: (item: SelectableItem, e: React.MouseEvent) => void;
  folders: MockFolder[];
  onMoveItems?: (ids: SelectableItem[], targetFolderId: string | null) => void;
}

function FolderNode({
  item,
  depth,
  activeNoteId,
  selectedFolderId,
  activeDrag,
  overIndicator,
  onSelectFolder,
  onNoteClick,
  onCreateFolder,
  onCreateNote,
  onRenameFolder,
  onChangeFolderColor,
  onToggleFolderFavorite,
  onRequestDelete,
  favorites,
  onToggleNoteFavorite,
  onRenameNote,
  onDragStart,
  onDragEnd,
  selectedIds,
  onItemClick,
  folders,
  onMoveItems,
}: FolderNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2);
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [creatingSubfolder, setCreatingSubfolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(item.folder.name);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const dndId = `folder:${item.folder.id}`;
  const isBeingDragged = activeDrag?.dragType === "folder" && activeDrag.id === item.folder.id;
  const indicator = overIndicator && overIndicator.targetId === item.folder.id ? overIndicator : null;
  const isMultiSelected = selectedIds.has(item.folder.id);
  /* 삭제 대상 스냅샷 — 우클릭(또는 "..." 버튼)한 "그 순간"의 selectedIds를 얼려서 저장한다. 이후
     selectedIds가 바뀌거나 blur로 선택이 풀려도 이미 연 메뉴의 삭제 대상은 흔들리지 않는다. */
  const [deleteSnapshot, setDeleteSnapshot] = useState<string[]>([item.folder.id]);
  const captureDeleteSnapshot = useCallback(() => {
    const isPartOfSelection = selectedIds.size > 1 && selectedIds.has(item.folder.id);
    setDeleteSnapshot(isPartOfSelection ? [...selectedIds] : [item.folder.id]);
  }, [selectedIds, item.folder.id]);

  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({
    id: dndId,
    data: { dragType: "folder", id: item.folder.id, title: item.folder.name } satisfies DragActiveData,
  });
  const { setNodeRef: setDropRef } = useDroppable({
    id: dndId,
    data: { dropType: "folder", id: item.folder.id, parentFolderId: item.folder.parentFolderId } satisfies DropTargetData,
  });

  useEffect(() => {
    if (creatingSubfolder) inputRef.current?.focus();
  }, [creatingSubfolder]);

  useEffect(() => {
    if (renaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renaming]);

  const commitCreateFolder = useCallback(() => {
    const name = newFolderName.trim();
    if (name) onCreateFolder(item.folder.id, name);
    setNewFolderName("");
    setCreatingSubfolder(false);
  }, [newFolderName, item.folder.id, onCreateFolder]);

  const commitRename = useCallback(() => {
    const name = renameDraft.trim();
    if (name && name !== item.folder.name) onRenameFolder(item.folder.id, name);
    else setRenameDraft(item.folder.name);
    setRenaming(false);
  }, [renameDraft, item.folder.id, item.folder.name, onRenameFolder]);

  const handleRowClick = useCallback((e: React.MouseEvent) => {
    if (renaming) return;
    if (onItemClick) {
      onItemClick({ id: item.folder.id, type: "folder" }, e);
    } else {
      const isSelected = selectedFolderId === item.folder.id;
      onSelectFolder(isSelected ? null : item.folder.id);
    }
  }, [renaming, onItemClick, item.folder.id, selectedFolderId, onSelectFolder]);

  const handleMoveConfirm = useCallback((targetFolderId: string | null) => {
    setShowMoveModal(false);
    if (onMoveItems) {
      onMoveItems([{ id: item.folder.id, type: "folder" }], targetFolderId);
    }
  }, [item.folder.id, onMoveItems]);

  const isSelected = selectedFolderId === item.folder.id;
  const indent = depth * 14 + 6;
  const folderColor = item.folder.color ?? DEFAULT_FOLDER_COLOR;

  return (
    <div>
      <div
        ref={(el) => { setDropRef(el); rowRef.current = el; }}
        className="group relative flex h-7 cursor-pointer items-center gap-1 rounded-md pr-1 transition-colors hover:bg-surface2/40"
        style={{
          paddingLeft: indent,
          // 다중 선택(isMultiSelected)은 배경만으로 표시하고, 왼쪽 강조선은 즐겨찾기 색상 전용으로 남긴다
          // — 노트 행과 동일하게 "배경=다중선택", "왼쪽선=다른 의미"로 표현을 분리한다.
          background: isMultiSelected
            ? "rgb(var(--primary) / 0.15)"
            : isSelected ? "rgb(var(--primary) / 0.1)" : undefined,
          borderLeft: item.folder.favorite ? `2px solid ${folderColor}` : "2px solid transparent",
          opacity: isBeingDragged ? 0.4 : undefined,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={handleRowClick}
        onContextMenu={(e) => {
          e.preventDefault();
          captureDeleteSnapshot();
          setMenuAnchor({ x: e.clientX, y: e.clientY });
          setMenuOpen(true);
        }}
      >
        <DropIndicatorOverlay indicator={indicator} />

        <button
          type="button"
          ref={setDragRef}
          {...listeners}
          {...attributes}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          title="드래그하여 위치 변경"
          className={cx(
            "grid h-4 w-3 shrink-0 cursor-grab place-items-center text-txt3/0 transition-opacity active:cursor-grabbing",
            hovered && "text-txt3/70"
          )}
        >
          <GripVertical size={11} />
        </button>

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          title={expanded ? "접기" : "펼치기"}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-txt3 transition-colors hover:bg-surface2/70"
        >
          <CollapseChevron expanded={expanded} size={11} />
        </button>

        {renaming ? (
          <>
            {expanded
              ? <FolderOpen size={13} className="shrink-0" style={{ color: folderColor }} />
              : <Folder size={13} className="shrink-0" style={{ color: folderColor, opacity: 0.85 }} />
            }
            <input
              ref={renameInputRef}
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") { setRenaming(false); setRenameDraft(item.folder.name); }
              }}
              onBlur={commitRename}
              className="flex-1 rounded border border-primary/40 bg-surface px-1 py-0 text-[12px] text-txt outline-none"
            />
          </>
        ) : (
          <span
            onClick={(e) => {
              e.stopPropagation();
              if (onItemClick) {
                onItemClick({ id: item.folder.id, type: "folder" }, e);
              } else {
                onSelectFolder(isSelected ? null : item.folder.id);
              }
            }}
            className="flex min-w-0 flex-1 items-center gap-1.5"
            title={isSelected ? "클릭하여 선택 해제" : "클릭하여 선택"}
          >
            {expanded
              ? <FolderOpen size={13} className="shrink-0" style={{ color: folderColor }} />
              : <Folder size={13} className="shrink-0" style={{ color: folderColor, opacity: 0.85 }} />
            }
            <span
              className={cx(
                "flex-1 truncate text-[12px] font-medium",
                isSelected || isMultiSelected ? "text-txt" : "text-txt2 group-hover:text-txt"
              )}
            >
              {item.folder.name}
            </span>
          </span>
        )}

        {item.folder.favorite && !renaming && (
          <Star size={10} className="shrink-0 fill-yellow-400 text-yellow-400" />
        )}

        {(hovered || menuOpen) && !renaming && (
          <div className="relative flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => { onCreateNote(item.folder.id); setExpanded(true); }}
              title="이 폴더에 노트 생성"
              className="grid h-5 w-5 place-items-center rounded text-txt3 transition-colors hover:bg-primary/15 hover:text-primary"
            >
              <FilePlus size={11} />
            </button>
            <button
              type="button"
              onClick={() => { setCreatingSubfolder(true); setExpanded(true); }}
              title="새 폴더 생성"
              className="grid h-5 w-5 place-items-center rounded text-txt3 transition-colors hover:bg-surface2/80 hover:text-txt2"
            >
              <FolderPlus size={11} />
            </button>
            <button
              type="button"
              onClick={() => { captureDeleteSnapshot(); setMenuAnchor(null); setMenuOpen((v) => !v); }}
              title="더보기"
              className="grid h-5 w-5 place-items-center rounded text-txt3 transition-colors hover:bg-surface2/80 hover:text-primary"
            >
              <MoreHorizontal size={11} />
            </button>

            {menuOpen && (
              <FolderMenu
                folder={item.folder}
                anchor={menuAnchor}
                onCreateSubfolder={() => { setCreatingSubfolder(true); setExpanded(true); }}
                onCreateNote={() => { onCreateNote(item.folder.id); setExpanded(true); }}
                onStartRename={() => setRenaming(true)}
                onChangeColor={(color) => onChangeFolderColor(item.folder.id, color)}
                onToggleFavorite={() => onToggleFolderFavorite(item.folder.id)}
                onMove={onMoveItems ? () => setShowMoveModal(true) : undefined}
                onDelete={() => onRequestDelete?.(deleteSnapshot)}
                onClose={() => { setMenuOpen(false); setMenuAnchor(null); }}
              />
            )}
          </div>
        )}

        <HoverInfoCard anchorRef={rowRef} hovered={hovered && !renaming && !menuOpen && !isBeingDragged}>
          <p className="mb-1.5 flex items-center gap-1.5 truncate font-semibold text-txt">
            <Folder size={11} className="shrink-0" style={{ color: folderColor }} />
            {item.folder.name}
          </p>
          <p className="text-txt2">{item.children.length}개의 폴더</p>
          <p className="text-txt2">{item.notes.length}개의 노트</p>
        </HoverInfoCard>
      </div>

      {expanded && (
        <div className="relative" style={{ background: "rgb(var(--surface2) / 0.10)" }}>
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0 top-0"
            style={{ left: indent + 11, width: 1, background: "rgb(var(--line) / 0.35)" }}
          />
          {creatingSubfolder && (
            <div className="flex h-7 items-center gap-1.5" style={{ paddingLeft: indent + 20 }}>
              <Folder size={13} className="shrink-0 text-yellow-400/60" />
              <input
                ref={inputRef}
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitCreateFolder();
                  if (e.key === "Escape") { setCreatingSubfolder(false); setNewFolderName(""); }
                }}
                onBlur={commitCreateFolder}
                placeholder="폴더 이름..."
                className="flex-1 rounded border border-primary/40 bg-surface px-1.5 py-0.5 text-[12px] text-txt outline-none"
              />
            </div>
          )}

          {item.children.map((child) => (
            <FolderNode
              key={child.folder.id}
              item={child}
              depth={depth + 1}
              activeNoteId={activeNoteId}
              selectedFolderId={selectedFolderId}
              activeDrag={activeDrag}
              overIndicator={overIndicator}
              onSelectFolder={onSelectFolder}
              onNoteClick={onNoteClick}
              onCreateFolder={onCreateFolder}
              onCreateNote={onCreateNote}
              onRenameFolder={onRenameFolder}
              onChangeFolderColor={onChangeFolderColor}
              onToggleFolderFavorite={onToggleFolderFavorite}
              onRequestDelete={onRequestDelete}
              favorites={favorites}
              onToggleNoteFavorite={onToggleNoteFavorite}
              onRenameNote={onRenameNote}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              selectedIds={selectedIds}
              onItemClick={onItemClick}
              folders={folders}
              onMoveItems={onMoveItems}
            />
          ))}

          {item.notes.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              depth={depth + 1}
              isActive={note.id === activeNoteId}
              isSelected={selectedIds.has(note.id)}
              selectedIds={selectedIds}
              activeDrag={activeDrag}
              overIndicator={overIndicator}
              onNoteClick={onNoteClick}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onRequestDelete={onRequestDelete}
              isFavorite={favorites.has(note.id)}
              onToggleFavorite={() => onToggleNoteFavorite(note.id)}
              onRenameNote={onRenameNote}
              onItemClick={onItemClick}
              folders={folders}
              onMoveItems={onMoveItems}
            />
          ))}
        </div>
      )}

      {showMoveModal && (
        <MoveModalLazy
          movingIds={[item.folder.id]}
          movingType="folder"
          folders={folders}
          onConfirm={handleMoveConfirm}
          onCancel={() => setShowMoveModal(false)}
        />
      )}
    </div>
  );
}

/* ── 이동 모달 (지연 import 방지를 위해 직접 인라인) ── */
function MoveModalLazy(props: {
  movingIds: string[];
  movingType: "note" | "folder" | "mixed";
  folders: MockFolder[];
  onConfirm: (targetFolderId: string | null) => void;
  onCancel: () => void;
}) {
  const MoveModal = require("./MoveModal").default as React.ComponentType<typeof props>;
  return <MoveModal {...props} />;
}

/* ── 노트 행 ────────────────────────────────────────── */
function NoteRow({
  note,
  depth,
  isActive,
  isSelected,
  selectedIds,
  activeDrag,
  overIndicator,
  onNoteClick,
  onDragStart,
  onDragEnd,
  onRequestDelete,
  isFavorite,
  onToggleFavorite,
  onRenameNote,
  onItemClick,
  folders,
  onMoveItems,
}: {
  note: MockNote;
  depth: number;
  isActive: boolean;
  isSelected: boolean;
  selectedIds: Set<string>;
  activeDrag: DragActiveData | null;
  overIndicator: OverIndicator | null;
  onNoteClick: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onRequestDelete?: (ids: string[]) => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onRenameNote?: (id: string, newTitle: string) => void;
  onItemClick?: (item: SelectableItem, e: React.MouseEvent) => void;
  folders: MockFolder[];
  onMoveItems?: (ids: SelectableItem[], targetFolderId: string | null) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(note.title);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const indent = depth * 14 + 6 + 16;
  /* 삭제 대상 스냅샷 — 우클릭(또는 "..." 버튼)한 순간의 selectedIds를 얼려서 저장한다. */
  const [deleteSnapshot, setDeleteSnapshot] = useState<string[]>([note.id]);
  const captureDeleteSnapshot = useCallback(() => {
    const isPartOfSelection = selectedIds.size > 1 && selectedIds.has(note.id);
    setDeleteSnapshot(isPartOfSelection ? [...selectedIds] : [note.id]);
  }, [selectedIds, note.id]);

  const dndId = `note:${note.id}`;
  const isBeingDragged = activeDrag?.dragType === "note" && activeDrag.id === note.id;
  const indicator = overIndicator && overIndicator.targetId === note.id ? overIndicator : null;

  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({
    id: dndId,
    data: { dragType: "note", id: note.id, title: note.title } satisfies DragActiveData,
  });
  const { setNodeRef: setDropRef } = useDroppable({
    id: dndId,
    data: { dropType: "note", id: note.id, folderId: note.folderId ?? null } satisfies DropTargetData,
  });

  useEffect(() => {
    if (renaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renaming]);

  const commitRename = useCallback(() => {
    const name = renameDraft.trim();
    if (name && name !== note.title) onRenameNote?.(note.id, name);
    else setRenameDraft(note.title);
    setRenaming(false);
  }, [renameDraft, note.id, note.title, onRenameNote]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (renaming) return;
    if (onItemClick) {
      onItemClick({ id: note.id, type: "note" }, e);
    } else {
      onNoteClick(note.id);
    }
  }, [renaming, onItemClick, note.id, onNoteClick]);

  const handleMoveConfirm = useCallback((targetFolderId: string | null) => {
    setShowMoveModal(false);
    if (onMoveItems) {
      onMoveItems([{ id: note.id, type: "note" }], targetFolderId);
    }
  }, [note.id, onMoveItems]);

  return (
    <div
      ref={(el) => { setDropRef(el); rowRef.current = el; }}
      draggable={!renaming}
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={(e) => {
        e.preventDefault();
        captureDeleteSnapshot();
        setMenuAnchor({ x: e.clientX, y: e.clientY });
        setMenuOpen(true);
      }}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", note.id);
        e.dataTransfer.effectAllowed = "copy";
        setDragging(true);
        onDragStart(note.id);
      }}
      onDragEnd={() => {
        setDragging(false);
        onDragEnd();
      }}
      className={cx(
        "group relative flex h-7 cursor-pointer select-none items-center gap-1 rounded-md pr-1 text-[12px] transition-colors",
        isActive ? "font-medium text-txt" : "text-txt3 hover:text-txt2",
        dragging && "opacity-40"
      )}
      style={{
        // 다중 선택(isSelected)은 배경만, 탭에서 열려있는 노트(isActive)는 왼쪽 강조선 + 아이콘/글자
        // 색으로만 표시한다 — 두 상태가 같은 행에 동시에 걸려도 서로 겹쳐 헷갈리지 않도록 표현을 분리했다.
        paddingLeft: indent - 12,
        background: isSelected ? "rgb(var(--primary) / 0.15)" : undefined,
        opacity: isBeingDragged ? 0.4 : undefined,
      }}
    >
      <DropIndicatorOverlay indicator={indicator} />

      <button
        type="button"
        ref={setDragRef}
        {...listeners}
        {...attributes}
        draggable={false}
        onClick={(e) => e.stopPropagation()}
        title="드래그하여 위치 변경"
        className={cx(
          "grid h-4 w-3 shrink-0 cursor-grab place-items-center text-txt3/0 transition-opacity active:cursor-grabbing",
          hovered && "text-txt3/70"
        )}
      >
        <GripVertical size={11} />
      </button>

      {isActive && (
        <span
          className="absolute left-0 h-4 w-0.5 rounded-r"
          style={{ background: "rgb(var(--primary))" }}
        />
      )}
      <FileText
        size={11}
        className="shrink-0"
        style={{ color: isActive ? "rgb(var(--primary))" : undefined }}
      />
      {renaming ? (
        <input
          ref={renameInputRef}
          value={renameDraft}
          onChange={(e) => setRenameDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") { setRenaming(false); setRenameDraft(note.title); }
          }}
          onBlur={commitRename}
          className="flex-1 rounded border border-primary/40 bg-surface px-1 py-0 text-[12px] text-txt outline-none"
        />
      ) : (
        <span className="flex-1 truncate">{note.title}</span>
      )}
      {isFavorite && !renaming && (
        <Star size={10} className="shrink-0 fill-yellow-400 text-yellow-400" />
      )}

      {(hovered || menuOpen) && !renaming && (
        <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => { captureDeleteSnapshot(); setMenuAnchor(null); setMenuOpen((v) => !v); }}
            title="더보기"
            className="grid h-5 w-5 place-items-center rounded text-txt3 transition-colors hover:bg-surface2/80 hover:text-primary"
          >
            <MoreHorizontal size={11} />
          </button>

          {menuOpen && (
            <NoteMenu
              note={note}
              isFavorite={!!isFavorite}
              anchor={menuAnchor}
              onStartRename={() => setRenaming(true)}
              onToggleFavorite={() => onToggleFavorite?.()}
              onMove={onMoveItems ? () => setShowMoveModal(true) : undefined}
              onDelete={() => onRequestDelete?.(deleteSnapshot)}
              onClose={() => { setMenuOpen(false); setMenuAnchor(null); }}
            />
          )}
        </div>
      )}

      <HoverInfoCard anchorRef={rowRef} hovered={hovered && !dragging && !renaming && !menuOpen}>
        <p className="mb-1 truncate font-semibold text-txt">{note.title}</p>
        <p className="text-txt3">마지막 수정</p>
        <p className="mb-1.5 text-txt2">{formatRelativeTime(note.updatedAt)}</p>
        <p className="text-txt3">생성일</p>
        <p className="text-txt2">{formatAbsoluteDateTime(note.createdAt)}</p>
      </HoverInfoCard>

      {showMoveModal && (
        <MoveModalLazy
          movingIds={[note.id]}
          movingType="note"
          folders={folders}
          onConfirm={handleMoveConfirm}
          onCancel={() => setShowMoveModal(false)}
        />
      )}
    </div>
  );
}
