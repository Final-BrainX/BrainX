"use client";

import { useState, useMemo, useRef, useEffect, useCallback, type DragEvent } from "react";
import { Search, Star, ChevronDown, FileText, Folder, Check, Clock, Plus, MoreHorizontal, Upload, Trash2 } from "lucide-react";
import { CollapseChevron } from "./CollapseChevron";
import { HoverInfoCard } from "./HoverInfoCard";
import { cx } from "@/lib/utils";
import { MockFolder, MockNote, SortOption } from "@/lib/notes/noteTypes";
import { formatAbsoluteDateTime, formatRelativeTime } from "@/lib/notes/formatDate";
import FolderTree, { NoteMenu, FolderMenu } from "./FolderTree";
import { Btn } from "@/components/brainx-ui";

/** 즐겨찾기 섹션의 노트 행 — FolderTree.tsx의 NoteRow와 별개 렌더링 경로라 hover 카드도
    똑같이 따로 달아준다(요구사항: 탐색기 어디서든 hover 정보가 보여야 함). */
function FavNoteRow({
  note,
  isActive,
  onNoteClick,
  onDragStart,
  onDragEnd,
  onToggleFavorite,
  onDeleteNote,
  onRenameNote,
}: {
  note: MockNote;
  isActive: boolean;
  onNoteClick: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onToggleFavorite: (id: string) => void;
  onDeleteNote?: (id: string) => void;
  onRenameNote?: (id: string, newTitle: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(note.title);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

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

  return (
    <div
      ref={rowRef}
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
        "group relative flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-md px-1.5 text-[12px] transition-colors",
        isActive ? "font-medium text-txt" : "text-txt2 hover:text-txt"
      )}
      style={{ background: isActive ? "rgb(var(--primary) / 0.12)" : undefined }}
    >
      <FileText size={11} className="shrink-0" style={{ color: "#f59e0b" }} />
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
        <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
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

/** 검색 결과(평면 리스트)의 노트 행 — FavNoteRow와 거의 동일한 구조지만 활성 노트 강조가
    필요해 별도 컴포넌트로 분리했다. */
function SearchNoteRow({
  note,
  isActive,
  isFavorite,
  onNoteClick,
  onDragStart,
  onDragEnd,
  onToggleFavorite,
  onDeleteNote,
  onRenameNote,
}: {
  note: MockNote;
  isActive: boolean;
  isFavorite: boolean;
  onNoteClick: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onToggleFavorite: (id: string) => void;
  onDeleteNote?: (id: string) => void;
  onRenameNote?: (id: string, newTitle: string) => void;
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
    const name = renameDraft.trim();
    if (name && name !== note.title) onRenameNote?.(note.id, name);
    else setRenameDraft(note.title);
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
        "group relative flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-md px-1.5 text-[12px] transition-colors",
        isActive ? "font-medium text-txt" : "text-txt2 hover:text-txt"
      )}
      style={{ background: isActive ? "rgb(var(--primary) / 0.12)" : undefined }}
    >
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
      {isFavorite && !renaming && (
        <Star size={10} className="shrink-0 fill-yellow-400 text-yellow-400" />
      )}

      {!renaming && (
        <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
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
              onDelete={() => onDeleteNote?.(note.id)}
              onClose={() => { setMenuOpen(false); setMenuAnchor(null); }}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** 즐겨찾기 섹션의 폴더 행 — FolderTree.tsx의 FolderNode와 별개 렌더링 경로지만, 동일한
    FolderMenu/우클릭/"..." 메뉴 UX를 그대로 제공한다(요구사항: 파일/노트와 폴더 모두 동일
    기준). 이 행은 트리처럼 자식을 펼쳐 보여주지 않으므로 "새 폴더 생성"/"노트 생성"은
    즉시 기본 이름으로 생성한다(FolderNode의 inline 입력 UI는 여기 없음). */
function FavFolderRow({
  folder,
  childFolderCount,
  childNoteCount,
  isSelected,
  onSelectFolder,
  onToggleFavorite,
  onCreateFolder,
  onCreateNote,
  onRenameFolder,
  onChangeFolderColor,
  onDeleteFolder,
}: {
  folder: MockFolder;
  childFolderCount: number;
  childNoteCount: number;
  isSelected: boolean;
  onSelectFolder: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onCreateFolder: (parentFolderId: string | null, name: string) => void;
  onCreateNote: (folderId?: string) => void;
  onRenameFolder: (folderId: string, newName: string) => void;
  onChangeFolderColor: (folderId: string, color: string) => void;
  onDeleteFolder: (folderId: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(folder.name);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

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
    <div
      ref={rowRef}
      onClick={() => { if (!renaming) onSelectFolder(folder.id); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuAnchor({ x: e.clientX, y: e.clientY });
        setMenuOpen(true);
      }}
      className={cx(
        "group relative flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-md px-1.5 text-[12px] transition-colors",
        isSelected ? "font-medium text-txt" : "text-txt2 hover:text-txt"
      )}
      style={{ background: isSelected ? "rgb(var(--primary) / 0.12)" : undefined }}
    >
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

      {!renaming && (
        <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
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
              onCreateSubfolder={() => onCreateFolder(folder.id, "새 폴더")}
              onCreateNote={() => onCreateNote(folder.id)}
              onStartRename={() => setRenaming(true)}
              onChangeColor={(color) => onChangeFolderColor(folder.id, color)}
              onToggleFavorite={() => onToggleFavorite(folder.id)}
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
        <p className="text-txt2">{childFolderCount}개의 폴더</p>
        <p className="text-txt2">{childNoteCount}개의 노트</p>
      </HoverInfoCard>
    </div>
  );
}

/* ── 정렬 옵션 ─────────────────────────────────────── */
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "modified",  label: "최근 수정순" },
  { value: "viewed",    label: "최근 열람순" },
  { value: "created",   label: "생성일순" },
  { value: "title",     label: "제목순" },
  { value: "favorites", label: "즐겨찾기 우선" },
  { value: "ai",        label: "AI 추천순" },
];

/* ── 정렬 함수 ─────────────────────────────────────── */
function sortNotes(notes: MockNote[], sortBy: SortOption, favorites: Set<string>): MockNote[] {
  const arr = [...notes];
  switch (sortBy) {
    case "modified":
    case "viewed":
      return arr.sort((a, b) => b.updatedAt - a.updatedAt);
    case "created":
      return arr.sort((a, b) => b.createdAt - a.createdAt);
    case "title":
      return arr.sort((a, b) => a.title.localeCompare(b.title, "ko"));
    case "favorites":
      return arr.sort((a, b) => {
        const fa = favorites.has(a.id) ? 1 : 0;
        const fb = favorites.has(b.id) ? 1 : 0;
        return fb - fa || a.title.localeCompare(b.title, "ko");
      });
    case "ai":
      return arr;
  }
}

/* ── 커스텀 정렬 드롭다운 ──────────────────────────── */
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
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={cx(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors",
                o.value === value
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
          ))}
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
  onCreateFolder: (parentFolderId: string | null, name: string) => void;
  onCreateNote: (folderId?: string) => void;
  onRenameFolder: (folderId: string, newName: string) => void;
  onChangeFolderColor: (folderId: string, color: string) => void;
  onToggleFolderFavorite: (folderId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onDeleteNote: (noteId: string) => void;
  onRenameNote?: (noteId: string, newTitle: string) => void;
  onDragStart: (noteId: string) => void;
  onDragEnd: () => void;
  onMoveNoteToFolder: (noteId: string, targetFolderId: string | null) => void;
  onReorderNote: (noteId: string, referenceNoteId: string, position: "before" | "after") => void;
  onMoveFolderToParent: (folderId: string, targetParentId: string | null) => void;
  onReorderFolder: (folderId: string, referenceFolderId: string, position: "before" | "after") => void;
  /** OS 파일 탐색기에서 노트 탐색기 위로 파일을 드래그&드롭했을 때 호출된다(선택된 폴더로 가져오기).
      내부 노트/폴더 드래그(draggable 항목들)와는 별개 경로 — dataTransfer.types로 구분한다. */
  onDropFiles?: (files: FileList) => void;
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
  onDeleteFolder,
  onDeleteNote,
  onRenameNote,
  onDragStart,
  onDragEnd,
  onMoveNoteToFolder,
  onReorderNote,
  onMoveFolderToParent,
  onReorderFolder,
  onDropFiles,
}: Props) {
  const [search, setSearch] = useState("");
  // OS 파일을 끌어오는 중인지(내부 노트/폴더 드래그와 구분) — dataTransfer.types에 "Files"가
  // 있을 때만 true가 되며, dragenter/dragleave 카운팅으로 자식 요소를 오갈 때 깜빡이지 않게 한다.
  const [fileDragOver, setFileDragOver] = useState(false);
  const fileDragDepthRef = useRef(0);

  const isFileDrag = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  const [sortBy, setSortBy] = useState<SortOption>("modified");
  const [favorites, setFavorites] = useState<Set<string>>(
    () => new Set(["spring", "brainx-arch", "rag-flow"])
  );
  const [favExpanded, setFavExpanded] = useState(true);

  /* 노트 삭제 시 즐겨찾기 Set에도 남지 않도록 함께 정리 — filtered가 이미 notes 기준이라
     화면에는 영향 없지만(고아 id), 상태를 깨끗하게 유지한다. */
  const handleDeleteNote = useCallback((noteId: string) => {
    setFavorites((prev) => {
      if (!prev.has(noteId)) return prev;
      const next = new Set(prev);
      next.delete(noteId);
      return next;
    });
    onDeleteNote(noteId);
  }, [onDeleteNote]);

  /* 새 폴더(루트) 생성 — 즐겨찾기 바로 아래에 배치해 탐색기 맨 아래까지 내려가지 않아도
     쉽게 찾을 수 있게 한다 */
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

  const favFolders = useMemo(() => folders.filter((f) => f.favorite), [folders]);

  const filtered = useMemo(() => {
    if (!search.trim()) return notes;
    const q = search.toLowerCase();
    return notes.filter((n) => n.title.toLowerCase().includes(q));
  }, [notes, search]);

  const isSearching = search.trim().length > 0;

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const favNotes = useMemo(
    () => sortNotes(filtered.filter((n) => favorites.has(n.id)), sortBy, favorites),
    [filtered, sortBy, favorites]
  );

  const searchResults = useMemo(
    () => sortNotes(filtered, sortBy, favorites),
    [filtered, sortBy, favorites]
  );

  return (
    <div
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

      {/* ── 헤더 ──────────────────────────────────────── */}
      <div className="border-l border-line/20 px-3 py-3 space-y-2.5">
        {/* + 새 노트 버튼 */}
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

        {/* 검색창 */}
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

        {/* 정렬 */}
        <div className="flex items-center gap-2 px-0.5">
          <span className="text-[10px] font-medium text-txt3">정렬</span>
          <SortDropdown value={sortBy} onChange={setSortBy} />
        </div>
      </div>

      {/* ── 콘텐츠 ──────────────────────────────────── */}
      <div className="scroll-thin flex-1 overflow-y-auto py-2">
        {/* 타이틀 + 카운트 */}
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
          /* 검색 중: 폴더 무시하고 평면 리스트로 표시 */
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
                  onNoteClick={onNoteClick}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onToggleFavorite={toggleFavorite}
                  onDeleteNote={handleDeleteNote}
                  onRenameNote={onRenameNote}
                />
              ))
            )}
          </div>
        ) : (
          <>
            {/* 즐겨찾기 (노트 + 폴더) */}
            {(favNotes.length > 0 || favFolders.length > 0) && (
              <div className="mb-1 px-2">
                <button
                  onClick={() => setFavExpanded((v) => !v)}
                  className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-surface2/40"
                >
                  <CollapseChevron expanded={favExpanded} size={11} />
                  <Star size={11} className="shrink-0 fill-yellow-400 text-yellow-400" />
                  <span className="flex-1 text-[13px] font-bold text-txt">즐겨찾기</span>
                  <span className="text-[10px] text-txt3">{favNotes.length + favFolders.length}</span>
                </button>

                {favExpanded && (
                  <div className="mt-0.5 pl-3">
                    {favFolders.map((folder) => (
                      <FavFolderRow
                        key={folder.id}
                        folder={folder}
                        childFolderCount={folders.filter((f) => f.parentFolderId === folder.id).length}
                        childNoteCount={notes.filter((n) => n.folderId === folder.id).length}
                        isSelected={selectedFolderId === folder.id}
                        onSelectFolder={onSelectFolder}
                        onToggleFavorite={onToggleFolderFavorite}
                        onCreateFolder={onCreateFolder}
                        onCreateNote={onCreateNote}
                        onRenameFolder={onRenameFolder}
                        onChangeFolderColor={onChangeFolderColor}
                        onDeleteFolder={onDeleteFolder}
                      />
                    ))}
                    {favNotes.map((note) => (
                      <FavNoteRow
                        key={note.id}
                        note={note}
                        isActive={note.id === activeNoteId}
                        onNoteClick={onNoteClick}
                        onDragStart={onDragStart}
                        onDragEnd={onDragEnd}
                        onToggleFavorite={toggleFavorite}
                        onDeleteNote={handleDeleteNote}
                        onRenameNote={onRenameNote}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {(favNotes.length > 0 || favFolders.length > 0) && (
              <div className="mx-3 my-2 border-t border-line/30" />
            )}

            {/* 새 폴더(루트) — 즐겨찾기 바로 아래, 폴더/노트 목록보다 위에 배치 */}
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
                <button
                  type="button"
                  onClick={() => setCreatingRootFolder(true)}
                  className="flex h-7 w-full items-center gap-1.5 rounded-md px-1.5 text-[13px] font-bold text-txt3 transition-colors hover:bg-surface2/40 hover:text-txt2"
                >
                  <Plus size={12} className="shrink-0" />
                  <span>새 폴더 (루트)</span>
                </button>
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
              onDeleteFolder={onDeleteFolder}
              onDeleteNote={handleDeleteNote}
              favorites={favorites}
              onToggleNoteFavorite={toggleFavorite}
              onRenameNote={onRenameNote}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onMoveNoteToFolder={onMoveNoteToFolder}
              onReorderNote={onReorderNote}
              onMoveFolderToParent={onMoveFolderToParent}
              onReorderFolder={onReorderFolder}
            />
          </>
        )}

        {/* 드래그 힌트 */}
        <div className="mx-3 mt-3 rounded-lg border border-line/30 px-3 py-2">
          <p className="text-[10px] leading-relaxed text-txt3">
            <span className="font-medium text-txt3">클릭</span> → 활성 패널에 탭으로 열기
            <br />
            <span className="font-medium text-txt3">드래그</span> → 패널 분할
          </p>
        </div>
      </div>
    </div>
  );
}
