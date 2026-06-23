"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
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
} from "lucide-react";
import { cx } from "@/lib/utils";
import { MockFolder, MockNote } from "@/lib/notes/noteTypes";
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

/**
 * 폴더/노트 행은 펼치기·접기·드래그 시작 등으로 트리 도중에 추가/제거되고,
 * "루트로 이동" 드롭존은 드래그 중에만 마운트된다. 기본(WhileDragging·Optimized)
 * 측정 전략은 이런 동적 마운트를 즉시 따라가지 못해 새로 나타난 드롭존이
 * 충돌 판정에서 누락되는 경우가 있어, 항상 다시 측정하도록 강제한다.
 */
const DND_MEASURING_CONFIG: MeasuringConfiguration = {
  droppable: { strategy: MeasuringStrategy.Always },
};

/* ── 트리 구성 ─────────────────────────────────────── */
interface FolderTreeItem {
  folder: MockFolder;
  notes: MockNote[];
  children: FolderTreeItem[];
}

function noteNewestFirst(a: MockNote, b: MockNote) {
  const at = Math.max(a.createdAt, a.updatedAt);
  const bt = Math.max(b.createdAt, b.updatedAt);
  return bt - at;
}

function buildTree(folders: MockFolder[], notes: MockNote[], parentId: string | null): FolderTreeItem[] {
  return folders
    .filter((f) => f.parentFolderId === parentId)
    .map((folder) => ({
      folder,
      notes: notes.filter((n) => n.folderId === folder.id).sort(noteNewestFirst),
      children: buildTree(folders, notes, folder.id),
    }));
}

/* 드래그 중 표시할 인디케이터 — 어느 행에 before/after/into를 어떤 유효성으로 보여줄지 */
interface OverIndicator {
  targetId: string;
  position: "before" | "after" | "into";
  valid: boolean;
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
  onDeleteFolder: (folderId: string) => void;
  onDeleteNote?: (noteId: string) => void;
  onDragStart: (noteId: string) => void;
  onDragEnd: () => void;
  onMoveNoteToFolder: (noteId: string, targetFolderId: string | null) => void;
  onReorderNote: (noteId: string, referenceNoteId: string, position: "before" | "after") => void;
  onMoveFolderToParent: (folderId: string, targetParentId: string | null) => void;
  onReorderFolder: (folderId: string, referenceFolderId: string, position: "before" | "after") => void;
}

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
  onDeleteFolder,
  onDeleteNote,
  onDragStart,
  onDragEnd,
  onMoveNoteToFolder,
  onReorderNote,
  onMoveFolderToParent,
  onReorderFolder,
}: FolderTreeProps) {
  const tree = buildTree(folders, notes, null);
  const folderIds = useMemo(() => new Set(folders.map((folder) => folder.id)), [folders]);
  const rootNotes = useMemo(
    () => notes.filter((note) => !note.folderId || !folderIds.has(note.folderId)).sort(noteNewestFirst),
    [notes, folderIds]
  );

  /* ── 폴더/노트 위치 변경 DnD (별도 그립 핸들 — 기존 노트 드래그-분할과 충돌 없음) ── */
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
      return resolveDrop(folders, active, overData, activeRect, over.rect);
    },
    [folders]
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
        {rootNotes.map((note) => (
          <NoteRow
            key={note.id}
            note={note}
            depth={0}
            isActive={note.id === activeNoteId}
            activeDrag={activeDrag}
            overIndicator={overIndicator}
            onNoteClick={onNoteClick}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDeleteNote={onDeleteNote}
          />
        ))}

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
            onDeleteFolder={onDeleteFolder}
            onDeleteNote={onDeleteNote}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}

        {/* 루트로 이동 드롭존 — 드래그 중에만 표시. useDroppable은 DndContext의
            "자식" 컴포넌트 안에서 호출해야 실제로 그 컨텍스트에 등록된다 (FolderTree
            자신의 body에서 호출하면 DndContext보다 위쪽이라 등록되지 않는다). */}
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

/* ── 루트로 이동 드롭존 — DndContext의 자식으로 렌더되어야 useDroppable이
   실제로 그 컨텍스트에 등록된다 (FolderTree 자신의 body에서 호출하면 등록되지 않음) */
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

/* ── 드롭 인디케이터 (행 상단/하단 삽입선, 또는 전체 강조) ── */
function DropIndicatorOverlay({ indicator }: { indicator: OverIndicator | null }) {
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

/* ── 폴더 더보기 메뉴 (하위 폴더/노트 생성, 이름변경, 색상, 즐겨찾기, 삭제) ── */
interface FolderMenuProps {
  folder: MockFolder;
  onCreateSubfolder: () => void;
  onCreateNote: () => void;
  onStartRename: () => void;
  onChangeColor: (color: string) => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
  onClose: () => void;
}

function FolderMenu({
  folder,
  onCreateSubfolder,
  onCreateNote,
  onStartRename,
  onChangeColor,
  onToggleFavorite,
  onDelete,
  onClose,
}: FolderMenuProps) {
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const itemClass =
    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-txt2 transition-colors hover:bg-surface2/60 hover:text-txt";

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-lg border border-line/60 py-1"
      style={{ background: "rgb(var(--surface))", boxShadow: "0 8px 24px -4px rgba(2,6,23,0.45)" }}
    >
      {!colorPickerOpen ? (
        <>
          <button type="button" className={itemClass} onClick={() => { onCreateSubfolder(); onClose(); }}>
            <Plus size={12} className="shrink-0" /> 하위 폴더 생성
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
    </div>
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
  onDeleteFolder: (folderId: string) => void;
  onDeleteNote?: (noteId: string) => void;
  onDragStart: (noteId: string) => void;
  onDragEnd: () => void;
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
  onDeleteFolder,
  onDeleteNote,
  onDragStart,
  onDragEnd,
}: FolderNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2);
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [creatingSubfolder, setCreatingSubfolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(item.folder.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const dndId = `folder:${item.folder.id}`;
  const isBeingDragged = activeDrag?.dragType === "folder" && activeDrag.id === item.folder.id;
  const indicator = overIndicator && overIndicator.targetId === item.folder.id ? overIndicator : null;

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

  const isSelected = selectedFolderId === item.folder.id;
  const indent = depth * 14 + 6;
  const folderColor = item.folder.color ?? DEFAULT_FOLDER_COLOR;

  return (
    <div>
      {/* 폴더 헤더 */}
      <div
        ref={(el) => { setDropRef(el); rowRef.current = el; }}
        className="group relative flex h-7 cursor-pointer items-center gap-1 rounded-md pr-1 transition-colors hover:bg-surface2/40"
        style={{
          paddingLeft: indent,
          background: isSelected ? "rgb(var(--primary) / 0.1)" : undefined,
          borderLeft: item.folder.favorite ? `2px solid ${folderColor}` : "2px solid transparent",
          opacity: isBeingDragged ? 0.4 : undefined,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <DropIndicatorOverlay indicator={indicator} />

        {/* 드래그 핸들 — hover 시에만 노출, 기존 행 클릭/선택과 분리된 별도 그립 */}
        <button
          type="button"
          ref={setDragRef}
          {...listeners}
          {...attributes}
          onClick={(e) => e.stopPropagation()}
          title="드래그하여 위치 변경"
          className={cx(
            "grid h-4 w-3 shrink-0 cursor-grab place-items-center text-txt3/0 transition-opacity active:cursor-grabbing",
            hovered && "text-txt3/70"
          )}
        >
          <GripVertical size={11} />
        </button>

        {/* 접기/펼치기 — 선택 상태와 완전히 분리된 별도 클릭 영역 */}
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
          /* 폴더 아이콘 + 이름 — 클릭하면 선택/선택 해제 토글(펼치기 상태와는 무관) */
          <span
            onClick={(e) => {
              e.stopPropagation();
              onSelectFolder(isSelected ? null : item.folder.id);
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
                isSelected ? "text-txt" : "text-txt2 group-hover:text-txt"
              )}
            >
              {item.folder.name}
            </span>
          </span>
        )}

        {item.folder.favorite && !renaming && (
          <Star size={10} className="shrink-0 fill-yellow-400 text-yellow-400" />
        )}

        {hovered && !renaming && (
          <div className="relative flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => { setCreatingSubfolder(true); setExpanded(true); }}
              title="하위 폴더 생성"
              className="grid h-5 w-5 place-items-center rounded text-txt3 transition-colors hover:bg-surface2/80 hover:text-primary"
            >
              <Plus size={11} />
            </button>
            <button
              type="button"
              onClick={() => { onCreateNote(item.folder.id); setExpanded(true); }}
              title="이 폴더에 노트 생성"
              className="grid h-5 w-5 place-items-center rounded text-txt3 transition-colors hover:bg-surface2/80 hover:text-primary"
            >
              <FilePlus size={11} />
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              title="더보기"
              className="grid h-5 w-5 place-items-center rounded text-txt3 transition-colors hover:bg-surface2/80 hover:text-primary"
            >
              <MoreHorizontal size={11} />
            </button>

            {menuOpen && (
              <FolderMenu
                folder={item.folder}
                onCreateSubfolder={() => { setCreatingSubfolder(true); setExpanded(true); }}
                onCreateNote={() => { onCreateNote(item.folder.id); setExpanded(true); }}
                onStartRename={() => setRenaming(true)}
                onChangeColor={(color) => onChangeFolderColor(item.folder.id, color)}
                onToggleFavorite={() => onToggleFolderFavorite(item.folder.id)}
                onDelete={() => onDeleteFolder(item.folder.id)}
                onClose={() => setMenuOpen(false)}
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

      {/* 자식 (하위 폴더 + 노트) */}
      {expanded && (
        <div>
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

          {item.notes.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              depth={depth + 1}
              isActive={note.id === activeNoteId}
              activeDrag={activeDrag}
              overIndicator={overIndicator}
              onNoteClick={onNoteClick}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDeleteNote={onDeleteNote}
            />
          ))}

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
              onDeleteFolder={onDeleteFolder}
              onDeleteNote={onDeleteNote}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 노트 행 ────────────────────────────────────────── */
function NoteRow({
  note,
  depth,
  isActive,
  activeDrag,
  overIndicator,
  onNoteClick,
  onDragStart,
  onDragEnd,
  onDeleteNote,
}: {
  note: MockNote;
  depth: number;
  isActive: boolean;
  activeDrag: DragActiveData | null;
  overIndicator: OverIndicator | null;
  onNoteClick: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDeleteNote?: (id: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const indent = depth * 14 + 6 + 16;

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

  return (
    <div
      ref={(el) => { setDropRef(el); rowRef.current = el; }}
      draggable
      onClick={() => onNoteClick(note.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
        paddingLeft: indent - 12,
        background: isActive ? "rgb(var(--primary) / 0.12)" : undefined,
        opacity: isBeingDragged ? 0.4 : undefined,
      }}
    >
      <DropIndicatorOverlay indicator={indicator} />

      {/* 드래그 핸들 — 위치 변경용, 기존 행 자체의 드래그(분할용)와는 별개 */}
      <button
        type="button"
        ref={setDragRef}
        {...listeners}
        {...attributes}
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
      <span className="flex-1 truncate">{note.title}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (confirm("이 노트를 삭제하시겠습니까?")) onDeleteNote?.(note.id);
        }}
        className="shrink-0 p-0.5 opacity-0 group-hover:opacity-100 text-txt3 hover:text-red-400 transition-opacity ml-1"
        title="노트 삭제"
      >
        <Trash2 size={10} />
      </button>

      <HoverInfoCard anchorRef={rowRef} hovered={hovered && !dragging}>
        <p className="mb-1 truncate font-semibold text-txt">{note.title}</p>
        <p className="text-txt3">마지막 수정</p>
        <p className="mb-1.5 text-txt2">{formatRelativeTime(note.updatedAt)}</p>
        <p className="text-txt3">생성일</p>
        <p className="text-txt2">{formatAbsoluteDateTime(note.createdAt)}</p>
      </HoverInfoCard>
    </div>
  );
}
