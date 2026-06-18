"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Search, Star, ChevronDown, ChevronRight, FileText, Folder, Check, Clock, Plus } from "lucide-react";
import { cx } from "@/lib/utils";
import { MockFolder, MockNote, SortOption } from "@/lib/notes/noteTypes";
import FolderTree from "./FolderTree";

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
  onDragStart: (noteId: string) => void;
  onDragEnd: () => void;
  onMoveNoteToFolder: (noteId: string, targetFolderId: string | null) => void;
  onReorderNote: (noteId: string, referenceNoteId: string, position: "before" | "after") => void;
  onMoveFolderToParent: (folderId: string, targetParentId: string | null) => void;
  onReorderFolder: (folderId: string, referenceFolderId: string, position: "before" | "after") => void;
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
  onDragStart,
  onDragEnd,
  onMoveNoteToFolder,
  onReorderNote,
  onMoveFolderToParent,
  onReorderFolder,
}: Props) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("modified");
  const [favorites, setFavorites] = useState<Set<string>>(
    () => new Set(["spring", "brainx-arch", "rag-flow"])
  );
  const [favExpanded, setFavExpanded] = useState(true);

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
    <div className="hidden w-60 shrink-0 flex-col border-r border-line/50 md:flex" style={{ background: "rgb(var(--bg2))" }}>

      {/* ── 헤더 ──────────────────────────────────────── */}
      <div className="border-b border-line/50 px-3 py-3 space-y-2.5">
        {/* 타이틀 + 카운트 */}
        <div className="flex items-center px-0.5">
          <span className="text-[12px] font-semibold text-txt">노트 탐색기</span>
          <span
            className="ml-2 rounded-full px-1.5 py-px text-[10px] font-medium text-txt3"
            style={{ background: "rgb(var(--surface2))" }}
          >
            {notes.length}
          </span>
        </div>

        {/* + 새 노트 버튼 */}
        <button
          type="button"
          onClick={() => onCreateNote(selectedFolderId ?? undefined)}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold text-white shadow-sm transition-all hover:brightness-110 hover:shadow-md active:scale-[0.98]"
          style={{ background: "rgb(var(--primary))" }}
        >
          <Plus size={15} />
          새 노트
        </button>

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

        {isSearching ? (
          /* 검색 중: 폴더 무시하고 평면 리스트로 표시 */
          <div className="px-2">
            {searchResults.length === 0 ? (
              <p className="px-2 py-4 text-center text-[11px] text-txt3">검색 결과가 없습니다</p>
            ) : (
              searchResults.map((note) => (
                <div
                  key={note.id}
                  draggable
                  onClick={() => onNoteClick(note.id)}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", note.id);
                    e.dataTransfer.effectAllowed = "copy";
                    onDragStart(note.id);
                  }}
                  onDragEnd={onDragEnd}
                  className={cx(
                    "group relative flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-md px-1.5 text-[12px] transition-colors",
                    note.id === activeNoteId ? "font-medium text-txt" : "text-txt2 hover:text-txt"
                  )}
                  style={{ background: note.id === activeNoteId ? "rgb(var(--primary) / 0.12)" : undefined }}
                >
                  <FileText size={11} className="shrink-0 text-txt3" />
                  <span className="flex-1 truncate">{note.title}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(note.id); }}
                    className={cx(
                      "shrink-0 p-0.5 transition-opacity",
                      favorites.has(note.id) ? "opacity-100" : "opacity-0 group-hover:opacity-50"
                    )}
                  >
                    <Star size={10} className={favorites.has(note.id) ? "fill-yellow-400 text-yellow-400" : "text-txt3"} />
                  </button>
                </div>
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
                  {favExpanded
                    ? <ChevronDown size={11} className="shrink-0 text-txt3" />
                    : <ChevronRight size={11} className="shrink-0 text-txt3" />
                  }
                  <Star size={11} className="shrink-0 fill-yellow-400 text-yellow-400" />
                  <span className="flex-1 text-[11px] font-semibold text-txt">즐겨찾기</span>
                  <span className="text-[10px] text-txt3">{favNotes.length + favFolders.length}</span>
                </button>

                {favExpanded && (
                  <div className="mt-0.5 pl-3">
                    {favFolders.map((folder) => (
                      <div
                        key={folder.id}
                        onClick={() => onSelectFolder(folder.id)}
                        className={cx(
                          "group relative flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-md px-1.5 text-[12px] transition-colors",
                          selectedFolderId === folder.id ? "font-medium text-txt" : "text-txt2 hover:text-txt"
                        )}
                        style={{ background: selectedFolderId === folder.id ? "rgb(var(--primary) / 0.12)" : undefined }}
                      >
                        <Folder size={11} className="shrink-0" style={{ color: folder.color ?? "#eab308" }} />
                        <span className="flex-1 truncate">{folder.name}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); onToggleFolderFavorite(folder.id); }}
                          className="shrink-0 p-0.5 opacity-100"
                          title="즐겨찾기 해제"
                        >
                          <Star size={10} className="fill-yellow-400 text-yellow-400" />
                        </button>
                      </div>
                    ))}
                    {favNotes.map((note) => (
                      <div
                        key={note.id}
                        draggable
                        onClick={() => onNoteClick(note.id)}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", note.id);
                          e.dataTransfer.effectAllowed = "copy";
                          onDragStart(note.id);
                        }}
                        onDragEnd={onDragEnd}
                        className={cx(
                          "group relative flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-md px-1.5 text-[12px] transition-colors",
                          note.id === activeNoteId ? "font-medium text-txt" : "text-txt2 hover:text-txt"
                        )}
                        style={{ background: note.id === activeNoteId ? "rgb(var(--primary) / 0.12)" : undefined }}
                      >
                        <FileText size={11} className="shrink-0" style={{ color: "#f59e0b" }} />
                        <span className="flex-1 truncate">{note.title}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(note.id); }}
                          className="shrink-0 p-0.5 opacity-100"
                        >
                          <Star size={10} className="fill-yellow-400 text-yellow-400" />
                        </button>
                      </div>
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
                  className="flex h-7 w-full items-center gap-1.5 rounded-md px-1.5 text-[11px] text-txt3 transition-colors hover:bg-surface2/40 hover:text-txt2"
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
