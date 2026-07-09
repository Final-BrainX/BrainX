"use client";

import { useState, useMemo, useRef, useEffect, useCallback, type DragEvent } from "react";
import { Search, Star, ChevronDown, FileText, FilePlus, Folder, FolderPlus, Check, Clock, MoreHorizontal, Upload, Trash2, MoveRight, ArrowUp, ArrowDown, GripVertical } from "lucide-react";
import {
  DndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  PointerSensor,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CollapseChevron } from "./CollapseChevron";
import { HoverInfoCard } from "./HoverInfoCard";
import { cx } from "@/lib/utils";
import {
  MockFolder,
  MockNote,
  SortOption,
  SortDirection,
  SORT_OPTION_ENABLED,
  DEFAULT_SORT_DIRECTION,
  SORT_DIRECTION_APPLICABLE,
  sortNotes,
} from "@/lib/notes/noteTypes";
import { computeDropPosition } from "@/lib/notes/folderDnd";
import { formatAbsoluteDateTime, formatRelativeTime } from "@/lib/notes/formatDate";
import FolderTree, { NoteMenu, FolderMenu, DropIndicatorOverlay, type SelectableItem, type OverIndicator } from "./FolderTree";
import { Btn } from "@/components/brainx-ui";
import ConfirmDialog from "./ConfirmDialog";
import MoveModal from "./MoveModal";

/** 즐겨찾기 섹션의 노트 행 */
/** 즐겨찾기 영역 전용 수동 순서 배열 안에서 id를 refId 기준 앞/뒤로 재배치한다. 일반 노트
    목록의 lib/notes/folderDnd.ts와는 별개로 둔다 — 그쪽은 폴더 이동까지 다루는 트리 전용
    계약이라 즐겨찾기의 "순서 배열만 바꾸는" 단순한 요구와 섞으면 관심사가 흐려진다. */
function reorderIdInArray(order: string[], id: string, refId: string, position: "before" | "after"): string[] {
  if (id === refId) return order;
  const without = order.filter((x) => x !== id);
  const refIdx = without.indexOf(refId);
  if (refIdx === -1) return order;
  const insertAt = position === "before" ? refIdx : refIdx + 1;
  return [...without.slice(0, insertAt), id, ...without.slice(insertAt)];
}

function isTextInputLikeTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLInputElement) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  if (target.closest(".ProseMirror")) return true;
  const editable = target.closest("[contenteditable='true'], [contenteditable='']");
  return !!editable;
}

function pruneNestedMoveItems(
  items: SelectableItem[],
  folders: MockFolder[],
  notes: MockNote[]
): SelectableItem[] {
  if (items.length <= 1) return items;
  const folderMap = new Map(folders.map((folder) => [folder.id, folder]));
  const noteMap = new Map(notes.map((note) => [note.id, note]));
  const selectedFolderIds = new Set(items.filter((item) => item.type === "folder").map((item) => item.id));

  if (selectedFolderIds.size === 0) return items;

  const hasSelectedAncestorFolder = (folderId: string | null | undefined) => {
    let currentFolderId = folderId ?? null;
    while (currentFolderId) {
      if (selectedFolderIds.has(currentFolderId)) return true;
      currentFolderId = folderMap.get(currentFolderId)?.parentFolderId ?? null;
    }
    return false;
  };

  return items.filter((item) => {
    if (item.type === "note") {
      const note = noteMap.get(item.id);
      return note ? !hasSelectedAncestorFolder(note.folderId ?? null) : true;
    }
    const folder = folderMap.get(item.id);
    return folder ? !hasSelectedAncestorFolder(folder.parentFolderId ?? null) : true;
  });
}

function FavNoteRow({
  note,
  isActive,
  isSelected,
  overIndicator,
  isBeingDragged,
  onNoteClick,
  onDragStart,
  onDragEnd,
  onToggleFavorite,
  onDeleteNote,
  onRenameNote,
  onMoveNote,
}: {
  note: MockNote;
  isActive: boolean;
  isSelected: boolean;
  overIndicator?: OverIndicator | null;
  isBeingDragged?: boolean;
  onNoteClick: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onToggleFavorite: (id: string) => void;
  onDeleteNote?: (id: string) => void;
  onRenameNote?: (id: string, newTitle: string) => void;
  onMoveNote?: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(note.title);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const dndId = `fav-note:${note.id}`;
  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({
    id: dndId,
    data: { id: note.id },
  });
  const { setNodeRef: setDropRef } = useDroppable({
    id: dndId,
    data: { id: note.id },
  });
  const indicator = overIndicator && overIndicator.targetId === note.id ? overIndicator : null;

  useEffect(() => {
    if (renaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renaming]);

  const commitRename = useCallback(() => {
    const name = renameDraft.trim() || "제목 없음";
    if (name !== note.title) onRenameNote?.(note.id, name);
    setRenameDraft(name);
    setRenaming(false);
  }, [renameDraft, note.id, note.title, onRenameNote]);

  return (
    <div
      ref={(el) => { setDropRef(el); rowRef.current = el; }}
      draggable={!renaming}
      onClick={() => { if (!renaming) onNoteClick(note.id); }}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", note.id);
        e.dataTransfer.effectAllowed = "copy";
        onDragStart(note.id);
      }}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuAnchor({ x: e.clientX, y: e.clientY });
        setMenuOpen(true);
      }}
      className={cx(
        "group relative flex h-7 cursor-pointer select-none items-center gap-1 rounded-md pr-1.5 text-[12px] transition-colors",
        isActive ? "font-medium text-txt" : "text-txt2 hover:text-txt"
      )}
      style={{
        background: isSelected ? "rgb(var(--primary) / 0.15)" : undefined,
        opacity: isBeingDragged ? 0.4 : undefined,
      }}
    >
      <DropIndicatorOverlay indicator={indicator ?? null} />
      {isActive && (
        <span className="absolute left-0 h-4 w-0.5 rounded-r" style={{ background: "rgb(var(--primary))" }} />
      )}
      <button
        type="button"
        ref={setDragRef}
        {...listeners}
        {...attributes}
        draggable={false}
        onClick={(e) => e.stopPropagation()}
        title="드래그하여 즐겨찾기 순서 변경"
        className={cx(
          "grid h-4 w-3 shrink-0 cursor-grab place-items-center text-txt3/0 transition-opacity active:cursor-grabbing",
          hovered && "text-txt3/70"
        )}
      >
        <GripVertical size={11} />
      </button>
      <FileText size={11} className="shrink-0 text-txt3" />
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
      {/* 별표/더보기를 일반 트리 행(FolderTree NoteRow)과 동일하게 하나의 gap-0.5 그룹으로
          묶는다 — 예전에는 별표(span)와 더보기(div)가 행의 gap-1을 그대로 쓰는 별개의 자식
          이라 더보기와의 간격이 일반 트리보다 넓었고, 그만큼 별표 위치도 어긋나 보였다. */}
      {!renaming && (
        <div className="relative flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <span className="grid h-5 w-5 shrink-0 place-items-center">
            <Star size={11} className="shrink-0 fill-yellow-400 text-yellow-400" />
          </span>
          <button
            type="button"
            onClick={() => { setMenuAnchor(null); setMenuOpen((v) => !v); }}
            title="더보기"
            className={cx(
              "grid h-5 w-5 place-items-center rounded text-txt3 transition-colors hover:bg-surface2/80 hover:text-primary",
              !hovered && !menuOpen && "opacity-0 group-hover:opacity-100"
            )}
          >
            <MoreHorizontal size={11} />
          </button>

          {menuOpen && (
            <NoteMenu
              note={note}
              isFavorite
              anchor={menuAnchor}
              onStartRename={() => setRenaming(true)}
              onToggleFavorite={() => onToggleFavorite(note.id)}
              onMove={onMoveNote ? () => onMoveNote(note.id) : undefined}
              onDelete={() => onDeleteNote?.(note.id)}
              onClose={() => { setMenuOpen(false); setMenuAnchor(null); }}
            />
          )}
        </div>
      )}

      <HoverInfoCard anchorRef={rowRef} hovered={hovered && !renaming && !menuOpen}>
        <p className="mb-1 truncate font-semibold text-txt">{note.title}</p>
        <p className="text-txt3">마지막 수정</p>
        <p className="mb-1.5 text-txt2">{formatRelativeTime(note.updatedAt)}</p>
        <p className="text-txt3">생성일</p>
        <p className="text-txt2">{formatAbsoluteDateTime(note.createdAt)}</p>
      </HoverInfoCard>
    </div>
  );
}

/** 검색 결과 노트 행 */
function SearchNoteRow({
  note,
  isActive,
  isFavorite,
  isSelected,
  onNoteClick,
  onDragStart,
  onDragEnd,
  onToggleFavorite,
  onDeleteNote,
  onRenameNote,
  onMoveNote,
}: {
  note: MockNote;
  isActive: boolean;
  isFavorite: boolean;
  isSelected: boolean;
  onNoteClick: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onToggleFavorite: (id: string) => void;
  onDeleteNote?: (id: string) => void;
  onRenameNote?: (id: string, newTitle: string) => void;
  onMoveNote?: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(note.title);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renaming]);

  const commitRename = useCallback(() => {
    const name = renameDraft.trim() || "제목 없음";
    if (name !== note.title) onRenameNote?.(note.id, name);
    setRenameDraft(name);
    setRenaming(false);
  }, [renameDraft, note.id, note.title, onRenameNote]);

  return (
    <div
      draggable={!renaming}
      onClick={() => { if (!renaming) onNoteClick(note.id); }}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", note.id);
        e.dataTransfer.effectAllowed = "copy";
        onDragStart(note.id);
      }}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuAnchor({ x: e.clientX, y: e.clientY });
        setMenuOpen(true);
      }}
      className={cx(
        "group relative flex h-7 cursor-pointer select-none items-center gap-1 rounded-md px-1.5 text-[12px] transition-colors",
        isActive ? "font-medium text-txt" : "text-txt2 hover:text-txt"
      )}
      style={{ background: isSelected ? "rgb(var(--primary) / 0.15)" : undefined }}
    >
      {isActive && (
        <span className="absolute left-0 h-4 w-0.5 rounded-r" style={{ background: "rgb(var(--primary))" }} />
      )}
      <FileText size={11} className="shrink-0 text-txt3" />
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
      {!renaming && (
        <div className="relative flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          {isFavorite && (
            <span className="grid h-5 w-5 shrink-0 place-items-center">
              <Star size={11} className="shrink-0 fill-yellow-400 text-yellow-400" />
            </span>
          )}
          <button
            type="button"
            onClick={() => { setMenuAnchor(null); setMenuOpen((v) => !v); }}
            title="더보기"
            className={cx(
              "grid h-5 w-5 place-items-center rounded text-txt3 transition-colors hover:bg-surface2/80 hover:text-primary",
              !hovered && !menuOpen && "opacity-0 group-hover:opacity-100"
            )}
          >
            <MoreHorizontal size={11} />
          </button>

          {menuOpen && (
            <NoteMenu
              note={note}
              isFavorite={isFavorite}
              anchor={menuAnchor}
              onStartRename={() => setRenaming(true)}
              onToggleFavorite={() => onToggleFavorite(note.id)}
              onMove={onMoveNote ? () => onMoveNote(note.id) : undefined}
              onDelete={() => onDeleteNote?.(note.id)}
              onClose={() => { setMenuOpen(false); setMenuAnchor(null); }}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** 즐겨찾기 섹션의 노트 행(즐겨찾기한 폴더 내부 노트용) — 드래그 재정렬은 지원하지 않는다
    (그 폴더 안의 순서는 일반 트리와 동일한 규칙을 따르고, 즐겨찾기 영역 전용 수동 순서는
    루트 즐겨찾기 항목에만 의미가 있다). */
function FavChildNoteRow({
  note,
  depth,
  isActive,
  isFavorite,
  isSelected,
  onNoteClick,
  onToggleFavorite,
  onDeleteNote,
  onRenameNote,
  onMoveNote,
}: {
  note: MockNote;
  depth: number;
  isActive: boolean;
  isFavorite: boolean;
  isSelected: boolean;
  onNoteClick: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onDeleteNote?: (id: string) => void;
  onRenameNote?: (id: string, newTitle: string) => void;
  onMoveNote?: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(note.title);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renaming]);

  const commitRename = useCallback(() => {
    const name = renameDraft.trim() || "제목 없음";
    if (name !== note.title) onRenameNote?.(note.id, name);
    setRenameDraft(name);
    setRenaming(false);
  }, [renameDraft, note.id, note.title, onRenameNote]);

  return (
    <div
      onClick={() => { if (!renaming) onNoteClick(note.id); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuAnchor({ x: e.clientX, y: e.clientY });
        setMenuOpen(true);
      }}
      className={cx(
        "group relative flex h-7 cursor-pointer select-none items-center gap-1 rounded-md pr-1.5 text-[12px] transition-colors",
        isActive ? "font-medium text-txt" : "text-txt2 hover:text-txt"
      )}
      style={{ paddingLeft: depth * 14 + 6, background: isSelected ? "rgb(var(--primary) / 0.15)" : undefined }}
    >
      {isActive && (
        <span className="absolute left-0 h-4 w-0.5 rounded-r" style={{ background: "rgb(var(--primary))" }} />
      )}
      <FileText size={11} className="shrink-0 text-txt3" />
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
      {!renaming && (
        <div className="relative flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => onToggleFavorite(note.id)}
            title={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
            className={cx(
              "grid h-5 w-5 place-items-center rounded text-txt3 transition-colors hover:bg-surface2/80 hover:text-yellow-400",
              !hovered && !menuOpen && !isFavorite && "opacity-0 group-hover:opacity-100"
            )}
          >
            <Star size={11} className={cx("shrink-0", isFavorite && "fill-yellow-400 text-yellow-400")} />
          </button>
          <button
            type="button"
            onClick={() => { setMenuAnchor(null); setMenuOpen((v) => !v); }}
            title="더보기"
            className={cx(
              "grid h-5 w-5 place-items-center rounded text-txt3 transition-colors hover:bg-surface2/80 hover:text-primary",
              !hovered && !menuOpen && "opacity-0 group-hover:opacity-100"
            )}
          >
            <MoreHorizontal size={11} />
          </button>

          {menuOpen && (
            <NoteMenu
              note={note}
              isFavorite={isFavorite}
              anchor={menuAnchor}
              onStartRename={() => setRenaming(true)}
              onToggleFavorite={() => onToggleFavorite(note.id)}
              onMove={onMoveNote ? () => onMoveNote(note.id) : undefined}
              onDelete={() => onDeleteNote?.(note.id)}
              onClose={() => { setMenuOpen(false); setMenuAnchor(null); }}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** 즐겨찾기 섹션의 폴더 트리 노드 — 즐겨찾기한 폴더는 요약 행 하나로 끝나지 않고, 그 안의
    하위 폴더/노트를 실제 트리로 펼쳐 보여준다(접기/펼치기 지원). 재귀적으로 자기 자신을
    렌더링해 중첩 폴더도 그대로 반영한다. */
function FavFolderTreeNode({
  folder,
  depth,
  notes,
  folders,
  favorites,
  activeNoteId,
  selectedFolderId,
  selectedIds,
  onSelectFolder,
  onNoteClick,
  onToggleFavorite,
  onToggleNoteFavorite,
  onCreateFolder,
  onCreateNote,
  onRenameFolder,
  onChangeFolderColor,
  onDeleteFolder,
  onDeleteNote,
  onRenameNote,
  onMoveFolder,
  onMoveNote,
}: {
  folder: MockFolder;
  depth: number;
  notes: MockNote[];
  folders: MockFolder[];
  favorites: Set<string>;
  activeNoteId: string;
  selectedFolderId: string | null;
  selectedIds: Set<string>;
  onSelectFolder: (id: string | null) => void;
  onNoteClick: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onToggleNoteFavorite: (id: string) => void;
  onCreateFolder: (parentFolderId: string | null, name: string, favorite?: boolean) => void;
  onCreateNote: (folderId?: string, favorite?: boolean) => void;
  onRenameFolder: (folderId: string, newName: string) => void;
  onChangeFolderColor: (folderId: string, color: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onDeleteNote: (noteId: string) => void;
  onRenameNote?: (noteId: string, newTitle: string) => void;
  onMoveFolder?: (id: string) => void;
  onMoveNote?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(folder.name);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  /* 즐겨찾기 폴더 안에서 만드는 하위 폴더 — 정책: 자동 즐겨찾기하지 않는다(일반 트리와 동일한
     "새 폴더" 인라인 입력 패턴, 하드코딩된 이름으로 즉시 생성하던 이전 동작을 대체). */
  const [creatingSubfolder, setCreatingSubfolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creatingSubfolder) newFolderInputRef.current?.focus();
  }, [creatingSubfolder]);

  const commitCreateSubfolder = useCallback(() => {
    const name = newFolderName.trim();
    if (name) onCreateFolder(folder.id, name);
    setNewFolderName("");
    setCreatingSubfolder(false);
  }, [newFolderName, folder.id, onCreateFolder]);

  const isSelected = selectedFolderId === folder.id;
  const isMultiSelected = selectedIds.has(folder.id);
  const childFolders = folders.filter((f) => f.parentFolderId === folder.id);
  // 즐겨찾기 폴더 안에서는 그중 별도로 즐겨찾기한 노트를 먼저 보여준다 — 나머지 순서는
  // 그대로 유지되는 안정 정렬(favorite 여부만 앞으로 당김).
  const childNotes = [...notes.filter((n) => n.folderId === folder.id)].sort(
    (a, b) => Number(favorites.has(b.id)) - Number(favorites.has(a.id))
  );

  useEffect(() => {
    if (renaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renaming]);

  const commitRename = useCallback(() => {
    const name = renameDraft.trim();
    if (name && name !== folder.name) onRenameFolder(folder.id, name);
    else setRenameDraft(folder.name);
    setRenaming(false);
  }, [renameDraft, folder.id, folder.name, onRenameFolder]);

  return (
    <div>
      <div
        ref={rowRef}
        onClick={() => { if (!renaming) onSelectFolder(isSelected ? null : folder.id); }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuAnchor({ x: e.clientX, y: e.clientY });
          setMenuOpen(true);
        }}
        className={cx(
          "group relative flex h-7 cursor-pointer select-none items-center gap-1 rounded-md pr-1.5 text-[12px] transition-colors",
          isSelected ? "font-medium text-txt" : "text-txt2 hover:text-txt"
        )}
        style={{
          paddingLeft: depth * 14,
          background: isMultiSelected ? "rgb(var(--primary) / 0.15)" : isSelected ? "rgb(var(--primary) / 0.12)" : undefined,
        }}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          title={expanded ? "접기" : "펼치기"}
          className="grid h-4 w-4 shrink-0 place-items-center text-txt3 transition-colors hover:text-txt2"
        >
          <CollapseChevron expanded={expanded} size={11} />
        </button>
        <Folder size={11} className="shrink-0" style={{ color: folder.color ?? "#eab308" }} />
        {renaming ? (
          <input
            ref={renameInputRef}
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") { setRenaming(false); setRenameDraft(folder.name); }
            }}
            onBlur={commitRename}
            className="flex-1 rounded border border-primary/40 bg-surface px-1 py-0 text-[12px] text-txt outline-none"
          />
        ) : (
          <span className="flex-1 truncate">{folder.name}</span>
        )}
        {/* 아이콘 순서: 노트 생성 → 폴더 생성 → 즐겨찾기 → 더보기(...) — 일반 트리와 동일하게
            통일한다. 즐겨찾기/더보기는(일반 트리와 동일한 이유로 별 위치가 흔들리지 않도록)
            hover 여부와 무관하게 항상 마운트해두고 opacity만 토글한다. */}
        {(hovered || menuOpen) && !renaming && (
          <div className="relative flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => { onCreateNote(folder.id); setExpanded(true); }}
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
          </div>
        )}
        {!renaming && (
          <div className="relative flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => onToggleFavorite(folder.id)}
              title={folder.favorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
              className={cx(
                "grid h-5 w-5 place-items-center rounded text-txt3 transition-colors hover:bg-surface2/80 hover:text-yellow-400",
                !hovered && !menuOpen && !folder.favorite && "opacity-0 group-hover:opacity-100"
              )}
            >
              <Star size={11} className={cx("shrink-0", folder.favorite && "fill-yellow-400 text-yellow-400")} />
            </button>
            <button
              type="button"
              onClick={() => { setMenuAnchor(null); setMenuOpen((v) => !v); }}
              title="더보기"
              className={cx(
                "grid h-5 w-5 place-items-center rounded text-txt3 transition-colors hover:bg-surface2/80 hover:text-primary",
                !hovered && !menuOpen && "opacity-0 group-hover:opacity-100"
              )}
            >
              <MoreHorizontal size={11} />
            </button>

            {menuOpen && (
              <FolderMenu
                folder={folder}
                anchor={menuAnchor}
                onCreateSubfolder={() => { setCreatingSubfolder(true); setExpanded(true); }}
                onCreateNote={() => { onCreateNote(folder.id); setExpanded(true); }}
                onStartRename={() => setRenaming(true)}
                onChangeColor={(color) => onChangeFolderColor(folder.id, color)}
                onToggleFavorite={() => onToggleFavorite(folder.id)}
                onMove={onMoveFolder ? () => onMoveFolder(folder.id) : undefined}
                onDelete={() => onDeleteFolder(folder.id)}
                onClose={() => { setMenuOpen(false); setMenuAnchor(null); }}
              />
            )}
          </div>
        )}

        <HoverInfoCard anchorRef={rowRef} hovered={hovered && !renaming && !menuOpen}>
          <p className="mb-1.5 flex items-center gap-1.5 truncate font-semibold text-txt">
            <Folder size={11} className="shrink-0" style={{ color: folder.color ?? "#eab308" }} />
            {folder.name}
          </p>
          <p className="text-txt2">{childFolders.length}개의 폴더</p>
          <p className="text-txt2">{childNotes.length}개의 노트</p>
        </HoverInfoCard>
      </div>

      {expanded && (childFolders.length > 0 || childNotes.length > 0 || creatingSubfolder) && (
        <div>
          {creatingSubfolder && (
            <div className="flex h-7 items-center gap-1.5" style={{ paddingLeft: (depth + 1) * 14 + 20 }}>
              <Folder size={13} className="shrink-0 text-yellow-400/60" />
              <input
                ref={newFolderInputRef}
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitCreateSubfolder();
                  if (e.key === "Escape") { setCreatingSubfolder(false); setNewFolderName(""); }
                }}
                onBlur={commitCreateSubfolder}
                placeholder="폴더 이름..."
                className="flex-1 rounded border border-primary/40 bg-surface px-1.5 py-0.5 text-[12px] text-txt outline-none"
              />
            </div>
          )}
          {childFolders.map((cf) => (
            <FavFolderTreeNode
              key={cf.id}
              folder={cf}
              depth={depth + 1}
              notes={notes}
              folders={folders}
              favorites={favorites}
              activeNoteId={activeNoteId}
              selectedFolderId={selectedFolderId}
              selectedIds={selectedIds}
              onSelectFolder={onSelectFolder}
              onNoteClick={onNoteClick}
              onToggleFavorite={onToggleFavorite}
              onToggleNoteFavorite={onToggleNoteFavorite}
              onCreateFolder={onCreateFolder}
              onCreateNote={onCreateNote}
              onRenameFolder={onRenameFolder}
              onChangeFolderColor={onChangeFolderColor}
              onDeleteFolder={onDeleteFolder}
              onDeleteNote={onDeleteNote}
              onRenameNote={onRenameNote}
              onMoveFolder={onMoveFolder}
              onMoveNote={onMoveNote}
            />
          ))}
          {childNotes.map((note) => (
            <FavChildNoteRow
              key={note.id}
              note={note}
              depth={depth + 1}
              isActive={note.id === activeNoteId}
              isFavorite={favorites.has(note.id)}
              isSelected={selectedIds.has(note.id)}
              onNoteClick={onNoteClick}
              onToggleFavorite={onToggleNoteFavorite}
              onDeleteNote={onDeleteNote}
              onRenameNote={onRenameNote}
              onMoveNote={onMoveNote}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 정렬 ──────────────────────────────────────────── */
/* "최근 열람순"은 옵션 목록에서 아예 제외했다 — 노트 모델에 열람 기록이 실제로 연결돼 있지
   않아서다(lib/notes/noteTypes.ts 상단 주석 참고). "최근 수정순"은 대신 실제로 신뢰할 수 있게
   고쳤다(NoteEditor.tsx의 setContent emitUpdate:false — 열기만 해도 갱신되던 버그 수정).
   "AI 추천순"은 추천 데이터가 없어 옵션은 남기되 disabled로 표시한다. */
const SORT_OPTIONS: { value: SortOption; label: string; disabledReason?: string }[] = [
  { value: "modified",  label: "최근 수정순" },
  { value: "created",   label: "생성일순" },
  { value: "title",     label: "제목순" },
  { value: "ai",        label: "AI 추천순 (Beta 준비 중)", disabledReason: "추천 근거 데이터 연동 전이라 비활성화됨" },
];

function SortDirectionToggle({
  sortBy,
  direction,
  onChange,
}: {
  sortBy: SortOption;
  direction: SortDirection;
  onChange: (d: SortDirection) => void;
}) {
  const applicable = SORT_DIRECTION_APPLICABLE[sortBy];
  const label = direction === "asc" ? "오름차순" : "내림차순";
  return (
    <button
      type="button"
      disabled={!applicable}
      title={applicable ? `${label} — 클릭하면 반대로 정렬` : "이 정렬 기준에는 방향을 적용하지 않습니다"}
      onClick={() => onChange(direction === "asc" ? "desc" : "asc")}
      className={cx(
        "flex items-center justify-center rounded-md border p-1 transition-colors",
        !applicable
          ? "cursor-not-allowed border-line/30 text-txt3/40"
          : "border-line/50 bg-surface2/40 text-txt2 hover:border-line/80 hover:bg-surface2/70"
      )}
    >
      {direction === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
    </button>
  );
}

function SortDropdown({ value, onChange }: { value: SortOption; onChange: (v: SortOption) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = SORT_OPTIONS.find((o) => o.value === value)!;

  useEffect(() => {
    if (!open) return;
    const handler = (e: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cx(
          "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors",
          open
            ? "border-primary/40 bg-primary/5 text-primary"
            : "border-line/50 bg-surface2/40 text-txt2 hover:border-line/80 hover:bg-surface2/70"
        )}
      >
        <Clock size={10} className="shrink-0" />
        <span className="max-w-[80px] truncate">{current.label}</span>
        <ChevronDown size={9} className={cx("shrink-0 transition-transform duration-150", open && "rotate-180")} />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-40 overflow-hidden rounded-lg border border-line/60 bg-surface py-1"
          style={{ boxShadow: "0 8px 24px -4px rgba(2,6,23,0.45), 0 0 0 1px rgb(var(--border)/0.25)" }}
        >
          {SORT_OPTIONS.map((o) => {
            const enabled = SORT_OPTION_ENABLED[o.value];
            return (
              <button
                key={o.value}
                disabled={!enabled}
                title={enabled ? undefined : o.disabledReason}
                onClick={() => {
                  if (!enabled) return;
                  onChange(o.value);
                  setOpen(false);
                }}
                className={cx(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors",
                  !enabled
                    ? "cursor-not-allowed text-txt3/50"
                    : o.value === value
                      ? "bg-primary/8 text-primary"
                      : "text-txt2 hover:bg-surface2/60 hover:text-txt"
                )}
              >
                <Check
                  size={10}
                  className={cx("shrink-0 transition-opacity", o.value === value ? "opacity-100 text-primary" : "opacity-0")}
                />
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Props ──────────────────────────────────────────── */
interface Props {
  notes: MockNote[];
  folders: MockFolder[];
  activeNoteId: string;
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onNoteClick: (noteId: string) => void;
  onCreateFolder: (parentFolderId: string | null, name: string, favorite?: boolean) => void;
  onCreateNote: (folderId?: string, favorite?: boolean) => void;
  onRenameFolder: (folderId: string, newName: string) => void;
  onChangeFolderColor: (folderId: string, color: string) => void;
  onToggleFolderFavorite: (folderId: string) => void;
  onToggleNoteFavorite: (noteId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onDeleteNote: (noteId: string) => void;
  onDeleteMultiple?: (noteIds: string[], folderIds: string[]) => void;
  onRenameNote?: (noteId: string, newTitle: string) => void;
  onDragStart: (noteId: string) => void;
  onDragEnd: () => void;
  onMoveNoteToFolder: (noteId: string, targetFolderId: string | null) => void;
  onReorderNote: (noteId: string, referenceNoteId: string, position: "before" | "after") => void;
  onMoveFolderToParent: (folderId: string, targetParentId: string | null) => void;
  onReorderFolder: (folderId: string, referenceFolderId: string, position: "before" | "after") => void;
  onDropFiles?: (files: FileList) => void;
  /** 게스트 여부 — 생성 제한 표시에 사용 */
  isGuest?: boolean;
}

/* ── 메인 컴포넌트 ──────────────────────────────────── */
export default function NotesExplorer({
  notes,
  folders,
  activeNoteId,
  selectedFolderId,
  onSelectFolder,
  onNoteClick,
  onCreateFolder,
  onCreateNote,
  onRenameFolder,
  onChangeFolderColor,
  onToggleFolderFavorite,
  onToggleNoteFavorite,
  onDeleteFolder,
  onDeleteNote,
  onDeleteMultiple,
  onRenameNote,
  onDragStart,
  onDragEnd,
  onMoveNoteToFolder,
  onReorderNote,
  onMoveFolderToParent,
  onReorderFolder,
  onDropFiles,
  isGuest = false,
}: Props) {
  const [search, setSearch] = useState("");
  const [fileDragOver, setFileDragOver] = useState(false);
  const fileDragDepthRef = useRef(0);
  const isFileDrag = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  const [sortBy, setSortByRaw] = useState<SortOption>("modified");
  const [sortDirection, setSortDirection] = useState<SortDirection>(DEFAULT_SORT_DIRECTION.modified);
  const activeNote = notes.find((note) => note.id === activeNoteId);
  const [modifiedSortAnchor, setModifiedSortAnchor] = useState<{ noteId: string; updatedAt: number } | null>(() =>
    activeNote ? { noteId: activeNote.id, updatedAt: activeNote.updatedAt } : null
  );

  /* 본문 입력/AI 연결 수락은 실제 updatedAt을 정상 갱신하되, 활성 노트가 편집 도중 같은 폴더
     안에서 갑자기 재배치되지 않도록 "열었을 때의 수정 시각"만 정렬용으로 고정한다. 다른 노트를
     열거나 사용자가 정렬 기준/방향을 명시적으로 바꾸면 현재 시각으로 다시 잡아 최신 정렬을
     반영한다. notes 변경은 의도적으로 dependency에 넣지 않는다 — 저장 refresh가 고정값을
     덮어쓰면 원래 문제(타이핑할 때마다 행 이동)가 되살아난다. */
  useEffect(() => {
    const nextActive = notes.find((note) => note.id === activeNoteId);
    setModifiedSortAnchor(nextActive ? { noteId: nextActive.id, updatedAt: nextActive.updatedAt } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNoteId]);

  const modifiedAtByNoteId = useMemo<ReadonlyMap<string, number>>(
    () => modifiedSortAnchor
      ? new Map([[modifiedSortAnchor.noteId, modifiedSortAnchor.updatedAt]])
      : new Map(),
    [modifiedSortAnchor]
  );

  const resetModifiedSortAnchor = () => {
    const nextActive = notes.find((note) => note.id === activeNoteId);
    setModifiedSortAnchor(nextActive ? { noteId: nextActive.id, updatedAt: nextActive.updatedAt } : null);
  };
  /* 정렬 "옵션"을 바꾸면 방향은 그 옵션의 자연스러운 기본값으로 리셋한다(예: 수정일순 desc →
     제목순으로 바꾸면 asc) — 같은 옵션에서 방향만 토글하는 것과는 별개 동작이다. */
  const setSortBy = (next: SortOption) => {
    setSortByRaw(next);
    setSortDirection(DEFAULT_SORT_DIRECTION[next]);
    resetModifiedSortAnchor();
  };

  const changeSortDirection = (next: SortDirection) => {
    setSortDirection(next);
    resetModifiedSortAnchor();
  };
  // 즐겨찾기 여부는 이제 notes[].favorite(백엔드 PUT /api/v1/favorites/NOTE/{id}로 저장됨)에서
  // 파생한다 — 이 컴포넌트가 자체적으로 들고 있던 하드코딩 시드 상태는 새로고침하면 항상
  // 초기값으로 되돌아가는 문제가 있었다.
  const favorites = useMemo(() => new Set(notes.filter((n) => n.favorite).map((n) => n.id)), [notes]);
  const [favExpanded, setFavExpanded] = useState(true);
  /* 즐겨찾기 영역 전용 수동 순서 — null이면 아직 커스텀하지 않은 상태라 현재 sortBy를 따르고,
     사용자가 즐겨찾기 안에서 한 번이라도 드래그로 순서를 바꾸면 그 뒤로는 이 배열을 따른다.
     일반 노트 목록과는 완전히 분리된 개념(그쪽은 애초에 순서 변경 자체를 지원하지 않는다). */
  const [favoriteOrder, setFavoriteOrder] = useState<string[] | null>(null);
  const [activeFavDragId, setActiveFavDragId] = useState<string | null>(null);
  const [favOverIndicator, setFavOverIndicator] = useState<OverIndicator | null>(null);
  const favSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  /* 다중 선택 */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  /* 삭제 확인 대상 — 삭제 메뉴를 누른 "그 순간"의 스냅샷만 담는다. selectedIds가 나중에 바뀌거나
     비워져도 이미 열린 확인창의 삭제 대상에는 영향이 없다. 확인/취소 어느 쪽이든 null로 되돌아간다. */
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(null);
  const [pendingMoveItems, setPendingMoveItems] = useState<SelectableItem[] | null>(null);
  const explorerRef = useRef<HTMLDivElement>(null);
  const explorerInteractionActiveRef = useRef(false);

  /* 플랫 가시 항목 목록 — Shift 범위 선택에 사용 */
  const flatVisibleItems = useMemo((): SelectableItem[] => {
    const result: SelectableItem[] = [];
    const folderMap = new Map(folders.map((f) => [f.id, f]));

    function addFolder(folderId: string) {
      result.push({ id: folderId, type: "folder" });
      notes
        .filter((n) => n.folderId === folderId)
        .sort((a, b) => Math.max(b.createdAt, b.updatedAt) - Math.max(a.createdAt, a.updatedAt))
        .forEach((n) => result.push({ id: n.id, type: "note" }));
      folders
        .filter((f) => f.parentFolderId === folderId)
        .forEach((f) => addFolder(f.id));
    }

    notes
      .filter((n) => !n.folderId || !folderMap.has(n.folderId))
      .sort((a, b) => Math.max(b.createdAt, b.updatedAt) - Math.max(a.createdAt, a.updatedAt))
      .forEach((n) => result.push({ id: n.id, type: "note" }));

    folders
      .filter((f) => !f.parentFolderId)
      .forEach((f) => addFolder(f.id));

    return result;
  }, [notes, folders]);

  /* Shift 범위 선택에서 항목 하나의 "소속 스코프"를 구한다 — 노트는 자신의 folderId(루트면
     null), 폴더는 자신의 parentFolderId(루트면 null)를 스코프로 쓴다. 두 항목의 스코프가 같을
     때만(둘 다 루트, 또는 둘 다 같은 폴더 바로 아래) range를 만든다 — flatVisibleItems가 접힌
     폴더 내부까지 포함한 전체 트리 순서라서, 스코프 제한 없이 범위를 잡으면 화면에 안 보이는
     다른 폴더 내부 노트까지 통째로 선택되는(부자연스러운) 문제가 있었다. */
  const scopeOfId = useCallback((id: string): string | null | undefined => {
    const note = notes.find((n) => n.id === id);
    if (note) return note.folderId ?? null;
    const folder = folders.find((f) => f.id === id);
    if (folder) return folder.parentFolderId ?? null;
    return undefined;
  }, [notes, folders]);

  /* 아이템 클릭 핸들러 — Ctrl/Shift 지원 */
  const handleItemClick = useCallback((item: SelectableItem, e: React.MouseEvent) => {
    if (e.shiftKey && lastSelectedId) {
      const anchorScope = scopeOfId(lastSelectedId);
      const targetScope = scopeOfId(item.id);
      if (anchorScope !== undefined && anchorScope === targetScope) {
        const ids = flatVisibleItems.filter((i) => scopeOfId(i.id) === anchorScope).map((i) => i.id);
        const lastIdx = ids.indexOf(lastSelectedId);
        const currIdx = ids.indexOf(item.id);
        if (lastIdx !== -1 && currIdx !== -1) {
          const [from, to] = lastIdx <= currIdx ? [lastIdx, currIdx] : [currIdx, lastIdx];
          const rangeIds = new Set(ids.slice(from, to + 1));
          setSelectedIds((prev) => {
            const next = new Set(prev);
            rangeIds.forEach((id) => next.add(id));
            return next;
          });
          setLastSelectedId(item.id);
          return;
        }
      }
      // 스코프가 다르면(폴더 안 ↔ 폴더 밖처럼) 범위를 잇지 않고, Ctrl 클릭처럼 이 항목 하나만
      // 토글 추가한다 — "다른 스코프까지 몰래 딸려온다"는 놀라움을 없앤다.
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.add(item.id);
        return next;
      });
      setLastSelectedId(item.id);
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(item.id)) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
      setLastSelectedId(item.id);
    } else {
      /* 일반 클릭: 선택 초기화, 노트면 열고(폴더 생성 위치 선택은 해제), 폴더면 다시 클릭할 때
         해제되도록 토글한다 — 폴더 클릭이 "새 노트 생성 위치" 선택을 의미하므로, 선택 해제
         수단이 없거나 노트를 연 뒤에도 이전 폴더 선택이 그대로 남아 있으면 안 된다. */
      setSelectedIds(new Set([item.id]));
      setLastSelectedId(item.id);
      if (item.type === "note") {
        onNoteClick(item.id);
        onSelectFolder(null);
      } else {
        onSelectFolder(selectedFolderId === item.id ? null : item.id);
      }
    }
  }, [flatVisibleItems, lastSelectedId, onNoteClick, onSelectFolder, scopeOfId, selectedFolderId]);

  /* 삭제 요청 — 삭제 메뉴(우클릭/"..." 버튼)를 눌렀을 때만 호출된다. ids는 그 순간의 스냅샷이라
     이후 selectedIds가 바뀌어도 흔들리지 않는다. */
  const requestDelete = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setPendingDeleteIds(ids);
  }, []);

  /* 확인/취소 어느 쪽이든 이 함수로 정리한다 — pending 상태만 지우고 selectedIds는 건드리지 않는다
     (취소 후에도 사용자가 하던 다중 선택 작업을 이어갈 수 있게). */
  const cancelDelete = useCallback(() => {
    setPendingDeleteIds(null);
  }, []);

  /* 확인창 문구/실제 삭제에 쓸 "실제로 삭제될 총 개수" — 폴더를 선택하면 그 폴더 자신 + 하위 폴더
     전부 + 하위(중첩 포함) 노트 전부가 함께 삭제되므로(handleDeleteFolder의 cascade 정책과 동일
     기준), 선택한 원본 id 개수가 아니라 이 전개된 총 개수를 보여줘야 한다. Folder A와 그 하위인
     Folder B를 동시에 선택해도 Set로 모으므로 하위가 두 번 집계되지 않는다. */
  const pendingDeleteExpanded = useMemo(() => {
    if (!pendingDeleteIds || pendingDeleteIds.length === 0) {
      return { totalCount: 0, folderIds: [] as string[], noteIds: [] as string[] };
    }
    const selectedFolderIds = pendingDeleteIds.filter((id) => folders.some((f) => f.id === id));
    const selectedNoteIds = pendingDeleteIds.filter((id) => notes.some((n) => n.id === id));

    const allFolderIds = new Set<string>();
    selectedFolderIds.forEach((rootId) => {
      allFolderIds.add(rootId);
      let frontier = [rootId];
      while (frontier.length > 0) {
        const next = folders
          .filter((f) => f.parentFolderId && frontier.includes(f.parentFolderId) && !allFolderIds.has(f.id))
          .map((f) => f.id);
        next.forEach((id) => allFolderIds.add(id));
        frontier = next;
      }
    });

    const allNoteIds = new Set<string>(selectedNoteIds);
    notes.forEach((n) => {
      if (n.folderId && allFolderIds.has(n.folderId)) allNoteIds.add(n.id);
    });

    return {
      totalCount: allFolderIds.size + allNoteIds.size,
      folderIds: [...allFolderIds],
      noteIds: [...allNoteIds],
    };
  }, [pendingDeleteIds, folders, notes]);

  /* 다중(또는 단일) 삭제 확인 — pendingDeleteIds 스냅샷만 사용하고 live selectedIds는 다시 읽지 않는다.
     실제 삭제 API 호출은 선택한 "최상위" 노트/폴더 id만 넘긴다 — handleDeleteFolder가 하위 폴더/노트를
     자체적으로 cascade 삭제하므로, 여기서 미리 전개한 하위 id까지 같이 넘기면 같은 노트/폴더를 두 번
     지우려는 중복 API 호출이 생긴다. pendingDeleteExpanded(전개된 집합)는 확인창 문구에만 쓰인다 —
     favorites는 이제 notes[].favorite에서 파생되므로, 노트가 notes에서 지워지면 즐겨찾기 표시도
     자동으로 함께 사라진다(별도 정리 불필요). */
  const confirmDelete = useCallback(() => {
    if (!pendingDeleteIds) return;
    const noteIds = pendingDeleteIds.filter((id) => notes.some((n) => n.id === id));
    const folderIds = pendingDeleteIds.filter((id) => folders.some((f) => f.id === id));
    if (onDeleteMultiple) {
      onDeleteMultiple(noteIds, folderIds);
    } else {
      noteIds.forEach((id) => onDeleteNote(id));
      folderIds.forEach((id) => onDeleteFolder(id));
    }
    setPendingDeleteIds(null);
    setSelectedIds(new Set());
  }, [pendingDeleteIds, pendingDeleteExpanded, notes, folders, onDeleteMultiple, onDeleteNote, onDeleteFolder]);

  const pendingDeleteLabel = useMemo(() => {
    const { totalCount } = pendingDeleteExpanded;
    if (totalCount === 0 || !pendingDeleteIds) return "";
    if (totalCount === 1) {
      const id = pendingDeleteIds[0];
      const name = notes.find((n) => n.id === id)?.title ?? folders.find((f) => f.id === id)?.name ?? "항목";
      return `"${name}"을(를) 삭제하시겠습니까?`;
    }
    return `${totalCount}개의 항목을 삭제하시겠습니까?`;
  }, [pendingDeleteExpanded, pendingDeleteIds, notes, folders]);

  /* 탐색기와의 "마지막 상호작용"을 별도 추적한다. 노트/폴더 row는 일반 div라 클릭 선택 후에도
     DOM focus가 body나 이전 editor에 남을 수 있어, keydown target만으로는 사용자의 의도를
     알 수 없다. 대신 document capture 단계에서 pointer/focus 출처를 보고 탐색기 활성 상태를
     갱신한다. editor/input/contenteditable/ProseMirror 쪽 상호작용은 항상 false가 되므로,
     그 상태에서 Delete/Backspace가 탐색기 삭제로 오동작하지 않는다. */
  useEffect(() => {
    const syncExplorerInteractionState = (target: EventTarget | null) => {
      const explorer = explorerRef.current;
      if (!explorer || !(target instanceof Node)) {
        explorerInteractionActiveRef.current = false;
        return;
      }
      explorerInteractionActiveRef.current = explorer.contains(target);
    };
    const handlePointerDown = (event: PointerEvent) => syncExplorerInteractionState(event.target);
    const handleFocusIn = (event: FocusEvent) => syncExplorerInteractionState(event.target);
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("focusin", handleFocusIn, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("focusin", handleFocusIn, true);
    };
  }, []);

  /* Delete 키 처리 — 현재 다중 선택 전체를 스냅샷으로 삼는다(선택이 없으면 무시) */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete") return;
      if (selectedIds.size === 0) return;
      if (isTextInputLikeTarget(document.activeElement)) return;
      const explorer = explorerRef.current;
      const targetInExplorer = explorer && e.target instanceof Node ? explorer.contains(e.target) : false;
      if (!targetInExplorer && !explorerInteractionActiveRef.current) return;
      e.preventDefault();
      requestDelete([...selectedIds]);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedIds, requestDelete]);

  /* 이동 처리 */
  const handleMoveItems = useCallback((items: SelectableItem[], targetFolderId: string | null) => {
    items.forEach((item) => {
      if (item.type === "note") onMoveNoteToFolder(item.id, targetFolderId);
      else onMoveFolderToParent(item.id, targetFolderId);
    });
    setPendingMoveItems(null);
    setSelectedIds(new Set());
  }, [onMoveNoteToFolder, onMoveFolderToParent]);

  const handleExplorerMoveItems = useCallback((items: SelectableItem[], targetFolderId: string | null) => {
    handleMoveItems(pruneNestedMoveItems(items, folders, notes), targetFolderId);
  }, [folders, handleMoveItems, notes]);

  /* 단일 노트 이동 (즐겨찾기/검색 섹션) */
  const handleMoveSingleNote = useCallback((noteId: string) => {
    setPendingMoveItems([{ id: noteId, type: "note" }]);
  }, []);

  const handleMoveSingleFolder = useCallback((folderId: string) => {
    setPendingMoveItems([{ id: folderId, type: "folder" }]);
  }, []);

  const [creatingRootFolder, setCreatingRootFolder] = useState(false);
  const [rootFolderName, setRootFolderName] = useState("");
  const rootFolderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creatingRootFolder) rootFolderInputRef.current?.focus();
  }, [creatingRootFolder]);

  const commitRootFolder = useCallback(() => {
    const name = rootFolderName.trim();
    if (name) onCreateFolder(null, name);
    setRootFolderName("");
    setCreatingRootFolder(false);
  }, [rootFolderName, onCreateFolder]);

  const selectedFolderName = useMemo(
    () => (selectedFolderId ? folders.find((f) => f.id === selectedFolderId)?.name ?? null : null),
    [selectedFolderId, folders]
  );

  /* 즐겨찾기 폴더 트리 — 부모가 이미 즐겨찾기된 폴더는 루트 목록에서 뺀다. 그 자식은 부모
     트리 노드 아래에서 이미 재귀적으로 보여지므로, 여기서도 넣으면 같은 폴더가 즐겨찾기 영역에
     두 번(루트+중첩) 나타나는 버그성 중복이 생긴다. */
  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const hasFavoritedAncestor = useCallback((folder: MockFolder): boolean => {
    let current = folder;
    while (current.parentFolderId) {
      const parent = folderById.get(current.parentFolderId);
      if (!parent) return false;
      if (parent.favorite) return true;
      current = parent;
    }
    return false;
  }, [folderById]);
  const favFolders = useMemo(
    () => folders.filter((f) => f.favorite && !hasFavoritedAncestor(f)),
    [folders, hasFavoritedAncestor]
  );
  /* 즐겨찾기한 폴더 내부에 있는 노트는 그 폴더의 트리 안에서 이미 보여지므로, 루트 즐겨찾기
     노트 목록에는 넣지 않는다(중복 방지) — 개별적으로 즐겨찾기했지만 소속 폴더는 즐겨찾기되지
     않은 노트만 루트에 남는다. */
  const isNoteCoveredByFavoritedFolder = useCallback((note: MockNote): boolean => {
    let current = note.folderId ? folderById.get(note.folderId) : undefined;
    while (current) {
      if (current.favorite) return true;
      current = current.parentFolderId ? folderById.get(current.parentFolderId) : undefined;
    }
    return false;
  }, [folderById]);

  const filtered = useMemo(() => {
    if (!search.trim()) return notes;
    const q = search.toLowerCase();
    return notes.filter((n) => n.title.toLowerCase().includes(q));
  }, [notes, search]);

  const isSearching = search.trim().length > 0;

  const toggleFavorite = onToggleNoteFavorite;

  const favNotes = useMemo(() => {
    const favSet = filtered.filter((n) => favorites.has(n.id) && !isNoteCoveredByFavoritedFolder(n));
    if (!favoriteOrder) return sortNotes(favSet, sortBy, favorites, sortDirection, modifiedAtByNoteId);
    const idx = new Map(favoriteOrder.map((id, i) => [id, i]));
    return [...favSet].sort(
      (a, b) => (idx.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (idx.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    );
  }, [filtered, sortBy, favorites, sortDirection, favoriteOrder, isNoteCoveredByFavoritedFolder, modifiedAtByNoteId]);

  const handleFavDragStart = useCallback((event: DragStartEvent) => {
    setActiveFavDragId((event.active.data.current?.id as string | undefined) ?? null);
  }, []);

  const resolveFavDrop = useCallback((event: DragOverEvent | DragEndEvent) => {
    const activeId = event.active.data.current?.id as string | undefined;
    const overId = event.over?.data.current?.id as string | undefined;
    if (!activeId || !overId || activeId === overId) return null;
    const activeRect = event.active.rect.current.translated;
    const overRect = event.over?.rect;
    if (!activeRect || !overRect) return null;
    const position = computeDropPosition(activeRect, overRect, false);
    return { activeId, overId, position: position === "into" ? ("after" as const) : position };
  }, []);

  const handleFavDragOver = useCallback(
    (event: DragOverEvent) => {
      const resolved = resolveFavDrop(event);
      setFavOverIndicator(resolved ? { targetId: resolved.overId, position: resolved.position, valid: true } : null);
    },
    [resolveFavDrop]
  );

  const handleFavDragEnd = useCallback(
    (event: DragEndEvent) => {
      // FolderTree.handleDragEnd와 동일한 이유 — 커밋 중 예외가 나도 드래그 상태는 항상 reset.
      try {
        const resolved = resolveFavDrop(event);
        if (resolved) {
          setFavoriteOrder((prev) => {
            const base = prev ?? favNotes.map((n) => n.id);
            return reorderIdInArray(base, resolved.activeId, resolved.overId, resolved.position);
          });
        }
      } finally {
        setActiveFavDragId(null);
        setFavOverIndicator(null);
      }
    },
    [resolveFavDrop, favNotes]
  );

  const handleFavDragCancel = useCallback(() => {
    setActiveFavDragId(null);
    setFavOverIndicator(null);
  }, []);

  /* 방어적 안전망: FolderTree와 동일하게, dnd-kit onDragEnd/onDragCancel이 누락되는 경우에도
     즐겨찾기 섹션 드래그 상태가 영구히 남지 않도록 pointerup/pointercancel/blur에서 정리한다. */
  useEffect(() => {
    if (!activeFavDragId) return;
    const clear = () => {
      setActiveFavDragId(null);
      setFavOverIndicator(null);
    };
    const onVisibility = () => { if (document.hidden) clear(); };
    window.addEventListener("pointerup", clear);
    window.addEventListener("pointercancel", clear);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pointerup", clear);
      window.removeEventListener("pointercancel", clear);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [activeFavDragId]);

  const searchResults = useMemo(
    () => sortNotes(filtered, sortBy, favorites, sortDirection, modifiedAtByNoteId),
    [filtered, sortBy, favorites, sortDirection, modifiedAtByNoteId]
  );

  /* 선택된 항목 중 노트/폴더 구분 */
  const selectedCount = selectedIds.size;
  const hasMultiSelect = selectedCount > 1;

  /* 탐색기 바깥 클릭 시 선택 초기화 */
  useEffect(() => {
    const handleDocClick = (e: MouseEvent) => {
      if (explorerRef.current && !explorerRef.current.contains(e.target as Node)) {
        setSelectedIds(new Set());
      }
    };
    document.addEventListener("mousedown", handleDocClick);
    return () => document.removeEventListener("mousedown", handleDocClick);
  }, []);

  return (
    <div
      ref={explorerRef}
      className="relative hidden w-60 shrink-0 flex-col border-r border-line/50 md:flex"
      style={{ background: "rgb(var(--bg2))" }}
      onDragEnter={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        fileDragDepthRef.current += 1;
        setFileDragOver(true);
      }}
      onDragOver={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        if (!isFileDrag(e)) return;
        fileDragDepthRef.current = Math.max(0, fileDragDepthRef.current - 1);
        if (fileDragDepthRef.current === 0) setFileDragOver(false);
      }}
      onDrop={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        fileDragDepthRef.current = 0;
        setFileDragOver(false);
        if (e.dataTransfer.files.length > 0) onDropFiles?.(e.dataTransfer.files);
      }}
    >
      {fileDragOver && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-primary/60 bg-primary/10 backdrop-blur-[1px]">
          <Upload size={22} className="text-primary" />
          <p className="text-[12px] font-medium text-primary">
            놓으면 {selectedFolderId ? "선택한 폴더로" : "가져오기"} 추가됩니다
          </p>
        </div>
      )}

      {/* ── 헤더 ── */}
      <div className="border-l border-line/20 px-3 py-3 space-y-2.5">
        <div className="group relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-[-3px] right-[-3px] top-[-3px] bottom-[-3px] rounded-[12px] border-1 border-primary/50 opacity-80 animate-[ping_3.8s_cubic-bezier(0.2,0,0.2,1)_infinite]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-[-3px] right-[-3px] top-[-3px] bottom-[-3px] rounded-[12px] border border-primary/30 opacity-40 animate-[ping_3.8s_cubic-bezier(0.2,0,0.2,1)_infinite] [animation-delay:1.9s]"
          />
          <Btn
            variant="primary"
            size="md"
            icon="plus"
            className="relative z-10 w-full text-[14px]"
            onClick={() => onCreateNote(selectedFolderId ?? undefined)}
          >
            새 노트
          </Btn>
          <div className="pointer-events-none absolute left-1/2 top-[calc(100%+10px)] z-20 -translate-x-1/2 whitespace-nowrap rounded-lg bg-txt px-2.5 py-1 text-[11px] font-medium text-bg2 opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100">
            첫 노트를 만들어 보세요
            <span className="absolute left-1/2 top-[-4px] h-2 w-2 -translate-x-1/2 rotate-45 bg-txt" />
          </div>
        </div>

        {/* 새 노트 생성 위치 안내 — selectedFolderId가 새 노트의 실제 생성 위치를 결정하므로,
            폴더를 선택해 둔 상태에서는 어디에 생성될지 눈에 보여야 한다(해제는 같은 폴더를
            다시 클릭). */}
        {selectedFolderName && (
          <div className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[10.5px] text-primary">
            <Folder size={10} className="shrink-0" />
            <span className="flex-1 truncate">&ldquo;{selectedFolderName}&rdquo; 폴더에 생성됩니다</span>
            <button
              type="button"
              onClick={() => onSelectFolder(null)}
              title="생성 위치 선택 해제"
              className="shrink-0 rounded px-1 text-primary/80 hover:bg-primary/15 hover:text-primary"
            >
              해제
            </button>
          </div>
        )}

        {/* 게스트 생성 제한 안내 */}
        {isGuest && (
          <div className="rounded-md border border-line/40 px-2.5 py-1.5 text-[10px] text-txt3">
            체험 모드: 노트 {notes.length}/10, 폴더 {folders.length}/10
          </div>
        )}

        <div
          className="flex h-8 items-center gap-2 rounded-lg border border-line/50 px-2.5 transition-colors focus-within:border-primary/50"
          style={{ background: "rgb(var(--surface))" }}
        >
          <Search size={12} className="shrink-0 text-txt3" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="노트 검색..."
            className="flex-1 bg-transparent text-[12px] text-txt outline-none placeholder:text-txt3"
          />
        </div>

        <div className="flex items-center gap-2 px-0.5">
          <span className="text-[10px] font-medium text-txt3">정렬</span>
          <SortDropdown value={sortBy} onChange={setSortBy} />
          <SortDirectionToggle sortBy={sortBy} direction={sortDirection} onChange={changeSortDirection} />
        </div>
      </div>

      {/* 다중 선택 액션 바 */}
      {hasMultiSelect && (
        <div className="flex items-center gap-1.5 border-b border-line/30 px-3 py-1.5">
          <span className="flex-1 text-[11px] text-txt3">{selectedCount}개 선택됨</span>
          <button
            type="button"
            onClick={() => setPendingMoveItems(pruneNestedMoveItems(
              [...selectedIds].map((id) => {
                const isNote = notes.some((n) => n.id === id);
                return { id, type: isNote ? "note" : "folder" } as SelectableItem;
              }),
              folders,
              notes
            ))}
            title="이동"
            className="grid h-5 w-5 place-items-center rounded text-txt3 transition-colors hover:bg-surface2/80 hover:text-primary"
          >
            <MoveRight size={12} />
          </button>
          <button
            type="button"
            onClick={() => requestDelete([...selectedIds])}
            title="삭제"
            className="grid h-5 w-5 place-items-center rounded text-txt3 transition-colors hover:bg-surface2/80 hover:text-red-400"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}

      {/* ── 콘텐츠 ── */}
      <div className="scroll-thin flex-1 overflow-y-auto py-2">
        <div className="flex items-center px-3.5 py-1 mb-1.5">
          <span className="text-[13px] font-bold text-txt">노트 탐색기</span>
          <span
            className="ml-2 rounded-full px-1.5 py-px text-[10px] font-medium text-txt3"
            style={{ background: "rgb(var(--surface2))" }}
          >
            {notes.length}
          </span>
        </div>

        {isSearching ? (
          <div className="px-2">
            {searchResults.length === 0 ? (
              <p className="px-2 py-4 text-center text-[11px] text-txt3">검색 결과가 없습니다</p>
            ) : (
              searchResults.map((note) => (
                <SearchNoteRow
                  key={note.id}
                  note={note}
                  isActive={note.id === activeNoteId}
                  isFavorite={favorites.has(note.id)}
                  isSelected={selectedIds.has(note.id)}
                  onNoteClick={onNoteClick}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onToggleFavorite={toggleFavorite}
                  onDeleteNote={(id) => requestDelete([id])}
                  onRenameNote={onRenameNote}
                  onMoveNote={handleMoveSingleNote}
                />
              ))
            )}
          </div>
        ) : (
          <>
            {(favNotes.length > 0 || favFolders.length > 0) && (
              <div className="mb-1 px-2">
                {/* 단순 섹션 헤더(인덱스) — 일반 트리의 폴더/노트 행과 달리 노트/폴더 생성
                    버튼을 두지 않는다. 즐겨찾기 루트에 새로 만들고 싶으면 탐색기 상단의
                    "+ 새 노트"/일반 트리에서 만든 뒤 별표로 즐겨찾기하면 된다. */}
                <button
                  type="button"
                  onClick={() => setFavExpanded((v) => !v)}
                  className="flex w-full items-center gap-1.5 overflow-hidden rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-surface2/40"
                >
                  <CollapseChevron expanded={favExpanded} size={11} />
                  <Star size={11} className="shrink-0 fill-yellow-400 text-yellow-400" />
                  <span className="flex-1 truncate text-[13px] font-bold text-txt">즐겨찾기</span>
                  <span className="shrink-0 text-[10px] text-txt3">{favNotes.length + favFolders.length}</span>
                </button>

                {favExpanded && (
                  <div className="mt-0.5 pl-3">
                    {favFolders.map((folder) => (
                      <FavFolderTreeNode
                        key={folder.id}
                        folder={folder}
                        depth={0}
                        notes={notes}
                        folders={folders}
                        favorites={favorites}
                        activeNoteId={activeNoteId}
                        selectedFolderId={selectedFolderId}
                        selectedIds={selectedIds}
                        onSelectFolder={onSelectFolder}
                        onNoteClick={onNoteClick}
                        onToggleFavorite={onToggleFolderFavorite}
                        onToggleNoteFavorite={toggleFavorite}
                        onCreateFolder={onCreateFolder}
                        onCreateNote={onCreateNote}
                        onRenameFolder={onRenameFolder}
                        onChangeFolderColor={onChangeFolderColor}
                        onDeleteFolder={(id) => requestDelete([id])}
                        onDeleteNote={(id) => requestDelete([id])}
                        onRenameNote={onRenameNote}
                        onMoveFolder={handleMoveSingleFolder}
                        onMoveNote={handleMoveSingleNote}
                      />
                    ))}
                    <DndContext
                      sensors={favSensors}
                      onDragStart={handleFavDragStart}
                      onDragOver={handleFavDragOver}
                      onDragEnd={handleFavDragEnd}
                      onDragCancel={handleFavDragCancel}
                    >
                      {favNotes.map((note) => (
                        <FavNoteRow
                          key={note.id}
                          note={note}
                          isActive={note.id === activeNoteId}
                          isSelected={selectedIds.has(note.id)}
                          overIndicator={favOverIndicator}
                          isBeingDragged={activeFavDragId === note.id}
                          onNoteClick={onNoteClick}
                          onDragStart={onDragStart}
                          onDragEnd={onDragEnd}
                          onToggleFavorite={toggleFavorite}
                          onDeleteNote={(id) => requestDelete([id])}
                          onRenameNote={onRenameNote}
                          onMoveNote={handleMoveSingleNote}
                        />
                      ))}
                    </DndContext>
                  </div>
                )}
              </div>
            )}

            {(favNotes.length > 0 || favFolders.length > 0) && (
              <div className="mx-3 my-2 border-t border-line/30" />
            )}

            {/* 일반 트리 섹션 헤더 — 즐겨찾기 헤더와 같은 톤의 단순 섹션 인덱스(레이블 + 루트에
                새 폴더 생성 아이콘)로 통일한다. 예전에는 행 전체가 "새 폴더 생성" 버튼이라
                레이블 자체가 "새 폴더 (루트)"처럼 헤더가 아니라 액션처럼 보였다. */}
            <div className="px-2 pb-1">
              {creatingRootFolder ? (
                <div className="flex h-7 items-center gap-1.5 px-1.5">
                  <Folder size={13} className="shrink-0 text-yellow-400/60" />
                  <input
                    ref={rootFolderInputRef}
                    value={rootFolderName}
                    onChange={(e) => setRootFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRootFolder();
                      if (e.key === "Escape") { setCreatingRootFolder(false); setRootFolderName(""); }
                    }}
                    onBlur={commitRootFolder}
                    placeholder="폴더 이름..."
                    className="flex-1 rounded border border-primary/40 bg-surface px-1.5 py-0.5 text-[12px] text-txt outline-none"
                  />
                </div>
              ) : (
                <div className="group/treehead flex h-7 w-full items-center gap-1.5 rounded-md px-1.5 text-[13px] font-bold text-txt3">
                  <span className="flex-1 truncate text-left">전체 노트</span>
                  <button
                    type="button"
                    onClick={() => setCreatingRootFolder(true)}
                    title="루트에 새 폴더 생성"
                    className="grid h-5 w-5 shrink-0 place-items-center rounded text-txt3 opacity-0 transition-opacity hover:bg-surface2/80 hover:text-txt2 group-hover/treehead:opacity-100"
                  >
                    <FolderPlus size={12} />
                  </button>
                </div>
              )}
            </div>

            {/* 폴더 트리 */}
            <FolderTree
              folders={folders}
              notes={filtered}
              activeNoteId={activeNoteId}
              selectedFolderId={selectedFolderId}
              onSelectFolder={onSelectFolder}
              onNoteClick={onNoteClick}
              onCreateFolder={onCreateFolder}
              onCreateNote={onCreateNote}
              onRenameFolder={onRenameFolder}
              onChangeFolderColor={onChangeFolderColor}
              onToggleFolderFavorite={onToggleFolderFavorite}
              favorites={favorites}
              sortBy={sortBy}
              sortDirection={sortDirection}
              modifiedAtByNoteId={modifiedAtByNoteId}
              onToggleNoteFavorite={toggleFavorite}
              onRenameNote={onRenameNote}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onMoveNoteToFolder={onMoveNoteToFolder}
              onReorderNote={onReorderNote}
              onMoveFolderToParent={onMoveFolderToParent}
              onReorderFolder={onReorderFolder}
              selectedIds={selectedIds}
              onItemClick={handleItemClick}
              onRequestDelete={requestDelete}
              onMoveItems={handleExplorerMoveItems}
            />
          </>
        )}

        <div className="mx-3 mt-3 rounded-lg border border-line/30 px-3 py-2">
          <p className="text-[10px] leading-relaxed text-txt3">
            <span className="font-medium text-txt3">클릭</span> → 활성 패널에 탭으로 열기
            <br />
            <span className="font-medium text-txt3">Ctrl+클릭</span> → 다중 선택
            <br />
            <span className="font-medium text-txt3">드래그</span> → 패널 분할
          </p>
        </div>
      </div>

      {/* 삭제 확인 모달 — 단일/다중 삭제를 하나의 모달로 통일했다(window.confirm과의 혼용 제거) */}
      {pendingDeleteIds && pendingDeleteIds.length > 0 && (
        <ConfirmDialog
          title={pendingDeleteLabel}
          description="삭제한 항목은 복구할 수 없습니다."
          confirmLabel="삭제"
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}

      {/* 이동 모달 */}
      {pendingMoveItems && (
        <MoveModal
          movingIds={pendingMoveItems.map((i) => i.id)}
          movingType={
            pendingMoveItems.every((i) => i.type === "note")
              ? "note"
              : pendingMoveItems.every((i) => i.type === "folder")
                ? "folder"
                : "mixed"
          }
          folders={folders}
          onConfirm={(targetFolderId) => handleMoveItems(pendingMoveItems, targetFolderId)}
          onCancel={() => setPendingMoveItems(null)}
        />
      )}
    </div>
  );
}
