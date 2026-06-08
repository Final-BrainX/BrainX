"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const STORAGE_KEY = "brainx_notes";
const DEFAULT_FOLDER_ID = "root";

const FOLDERS = [
  { id: "root", name: "전체 노트" },
  { id: "research", name: "리서치" },
  { id: "work", name: "업무" },
  { id: "archive", name: "아카이브" }
];

function nowIso() {
  return new Date().toISOString();
}

function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `note-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createDefaultNotes() {
  const createdAt = nowIso();
  return [
    {
      id: "note-demo-1",
      title: "BrainX 시작하기",
      markdown: "# BrainX 시작하기\n\n이곳에 첫 번째 지식을 기록해보세요.\n\n## 빠른 작성\n\n- 마크다운 그대로 작성\n- [[RAG 파이프라인 설계 노트]]처럼 연결\n- [ ] 체크박스도 사용 가능\n\n```js\nconsole.log(\"BrainX\")\n```",
      folderId: DEFAULT_FOLDER_ID,
      tags: ["BrainX"],
      backlinks: [],
      links: [],
      createdAt,
      updatedAt: createdAt,
      version: 1,
      isFavorite: true
    }
  ];
}

function normalizeNote(note) {
  return {
    folderId: DEFAULT_FOLDER_ID,
    tags: [],
    backlinks: [],
    links: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    version: 1,
    isFavorite: false,
    markdown: "",
    ...note
  };
}

function readNotes() {
  if (typeof window === "undefined") return createDefaultNotes();
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return createDefaultNotes();
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.map(normalizeNote) : createDefaultNotes();
  } catch {
    return createDefaultNotes();
  }
}

function persistNotes(notes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function generateUntitledName(notes) {
  const base = "새 노트";
  const titles = notes.map((note) => note.title);
  if (!titles.includes(base)) return base;
  let index = 1;
  while (titles.includes(`${base} ${index}`)) index++;
  return `${base} ${index}`;
}

function extractHeadings(markdown) {
  return markdown
    .split("\n")
    .map((line, index) => {
      const match = /^(#{1,3})\s+(.+)$/.exec(line.trim());
      if (!match) return null;
      return {
        id: `${index}-${match[2].toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-")}`,
        level: match[1].length,
        text: match[2]
      };
    })
    .filter(Boolean);
}

function extractWikiLinks(markdown) {
  const links = new Set();
  const regex = /\[\[([^\]]+)\]\]/g;
  let match = regex.exec(markdown);
  while (match) {
    const text = match[1].trim();
    if (text) links.add(text);
    match = regex.exec(markdown);
  }
  return [...links];
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function useToasts() {
  const [toasts, setToasts] = useState([]);
  const pushToast = useCallback((message) => {
    const id = createId();
    setToasts((prev) => [...prev, { id, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 2600);
  }, []);
  return [toasts, pushToast];
}

function ToastStack({ toasts }) {
  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <div className="toast" key={toast.id}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}

function SaveStatus({ status }) {
  const label = {
    saving: "저장 중...",
    saved: "저장됨",
    error: "저장 실패"
  }[status];

  return <span className={`save-status ${status}`}>{label}</span>;
}

function NoteSidebar({
  notes,
  selectedNoteId,
  selectedFolderId,
  search,
  onSearch,
  onSelectFolder,
  onSelectNote,
  onCreateNote
}) {
  const visibleNotes = notes.filter((note) => {
    const folderOk = selectedFolderId === DEFAULT_FOLDER_ID || note.folderId === selectedFolderId;
    const searchOk = `${note.title} ${note.markdown}`.toLowerCase().includes(search.toLowerCase());
    return folderOk && searchOk;
  });

  return (
    <aside className="note-sidebar">
      <div className="sidebar-header">
        <div className="brand-lockup">
          <div className="brand-mark">B</div>
          <div>
            <h1 className="brand-title">BrainX</h1>
            <p className="brand-subtitle">Obsidian-style notes</p>
          </div>
        </div>
        <button className="icon-button" type="button" title="동기화">
          ↻
        </button>
      </div>

      <button className="primary-button create-note-button" type="button" onClick={onCreateNote}>
        + 새 노트
      </button>

      <section className="sidebar-section">
        <p className="section-label">Folders</p>
        <div className="folder-list">
          {FOLDERS.map((folder) => {
            const count =
              folder.id === DEFAULT_FOLDER_ID
                ? notes.length
                : notes.filter((note) => note.folderId === folder.id).length;
            return (
              <button
                className={`folder-item ${selectedFolderId === folder.id ? "is-active" : ""}`}
                key={folder.id}
                type="button"
                onClick={() => onSelectFolder(folder.id)}
              >
                <span>{folder.name}</span>
                <span className="folder-count">{count}</span>
              </button>
            );
          })}
        </div>
      </section>

      <input
        className="note-search"
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        placeholder="노트 검색"
      />

      <div className="note-list-wrap">
        <p className="section-label">
          Notes <span>{visibleNotes.length}</span>
        </p>
        <div className="note-list">
          {visibleNotes.map((note) => (
            <button
              className={`note-item ${note.id === selectedNoteId ? "is-active" : ""}`}
              key={note.id}
              type="button"
              onClick={() => onSelectNote(note.id)}
            >
              <div className="note-item-title">
                <span>{note.isFavorite ? "★" : "◇"}</span>
                <span>{note.title || "Untitled"}</span>
              </div>
              <div className="note-item-meta">
                <span>{formatDate(note.updatedAt)}</span>
                <span>{note.markdown.length}자</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

function ExportButtons({ selectedNote, onUpload, onShare, onPdf }) {
  const safeName = (selectedNote?.title || "새 노트").replace(/[\\/:*?"<>|]/g, "-");
  const disabled = !selectedNote;

  return (
    <>
      <button className="soft-button" type="button" onClick={onShare} disabled={disabled}>
        공유
      </button>
      <button className="soft-button" type="button" onClick={onPdf} disabled={disabled}>
        PDF
      </button>
      <button
        className="soft-button"
        type="button"
        disabled={disabled}
        onClick={() => downloadText(`${safeName}.txt`, selectedNote?.markdown || "")}
      >
        TXT
      </button>
      <button
        className="soft-button"
        type="button"
        disabled={disabled}
        onClick={() => downloadText(`${safeName}.md`, selectedNote?.markdown || "")}
      >
        MD
      </button>
      <button className="primary-button" type="button" onClick={onUpload}>
        업로드
      </button>
    </>
  );
}

function MarkdownToolbar({ onInsert }) {
  const items = [
    { label: "H1", value: "# " },
    { label: "H2", value: "## " },
    { label: "•", value: "- " },
    { label: "☑", value: "- [ ] " },
    { label: "{}", value: "```\n\n```" },
    { label: "[[", value: "[[노트명]]" }
  ];

  return (
    <div className="markdown-toolbar" aria-label="마크다운 도구">
      {items.map((item) => (
        <button className="toolbar-button" key={item.label} type="button" onClick={() => onInsert(item.value)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

function NoteEditor({
  selectedNote,
  saveStatus,
  titleInputRef,
  markdownRef,
  onCreateNote,
  onChangeTitle,
  onChangeMarkdown
}) {
  if (!selectedNote) {
    return (
      <section className="empty-editor">
        <div className="empty-editor-card">
          <h2>아직 노트가 없습니다.</h2>
          <p>새 노트를 만들어 지식 기록을 시작해보세요.</p>
          <button className="primary-button" type="button" onClick={onCreateNote}>
            + 새 노트 만들기
          </button>
        </div>
      </section>
    );
  }

  const insertMarkdown = (snippet) => {
    const textarea = markdownRef.current;
    const current = selectedNote.markdown || "";
    const start = textarea?.selectionStart ?? current.length;
    const end = textarea?.selectionEnd ?? current.length;
    const next = `${current.slice(0, start)}${snippet}${current.slice(end)}`;
    onChangeMarkdown(next);
    requestAnimationFrame(() => {
      textarea?.focus();
      const position = start + snippet.length;
      textarea?.setSelectionRange(position, position);
    });
  };

  return (
    <section className="editor-main">
      <div className="editor-width">
        <input
          ref={titleInputRef}
          className="title-input"
          value={selectedNote.title}
          onChange={(event) => onChangeTitle(event.target.value)}
          placeholder="새 노트"
        />

        <div className="editor-meta-row">
          <span className="meta-pill">수정 {formatDate(selectedNote.updatedAt)}</span>
          <span className="meta-pill">v{selectedNote.version}</span>
          <span className="meta-pill">{selectedNote.tags.length ? selectedNote.tags.join(", ") : "태그 없음"}</span>
          <SaveStatus status={saveStatus} />
        </div>

        <MarkdownToolbar onInsert={insertMarkdown} />

        <textarea
          ref={markdownRef}
          className="markdown-textarea"
          value={selectedNote.markdown}
          onChange={(event) => onChangeMarkdown(event.target.value)}
          placeholder={"# 제목\n\n마크다운으로 바로 기록하세요. / 를 눌러 명령어를 떠올리는 느낌으로 사용할 수 있습니다."}
          spellCheck="false"
        />

        <div className="slash-command">
          <span>⌘</span>
          <span>/ 명령어: 요약, 체크리스트, 코드블록, AI로 이어쓰기</span>
        </div>
      </div>
    </section>
  );
}

function NoteRightPanel({ selectedNote, headings, wikiLinks }) {
  return (
    <aside className="note-right-panel">
      <div className="panel-card">
        <h3>문서 목차</h3>
        {headings.length ? (
          <ul className="panel-list">
            {headings.map((heading) => (
              <li className={`toc-level-${heading.level}`} key={heading.id}>
                {heading.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="ai-suggestion">`#`, `##`, `###` 헤더를 쓰면 목차가 자동으로 생깁니다.</p>
        )}
      </div>

      <div className="panel-card">
        <h3>백링크</h3>
        {wikiLinks.length ? (
          <ul className="panel-list">
            {wikiLinks.map((link) => (
              <li key={link}>[[{link}]] 연결 후보</li>
            ))}
          </ul>
        ) : (
          <p className="ai-suggestion">본문에 [[노트명]]을 입력하면 연결 영역에 표시됩니다.</p>
        )}
      </div>

      <div className="panel-card">
        <h3>AI 연결 제안</h3>
        <div className="ai-suggestion">
          {selectedNote
            ? `"${selectedNote.title || "새 노트"}"와 관련된 문서를 의미 검색으로 추천할 준비가 되어 있습니다.`
            : "노트를 선택하면 AI 연결 제안이 표시됩니다."}
        </div>
      </div>

      <div className="panel-card chat-panel">
        <h3>인라인 AI 챗</h3>
        <div className="chat-bubble">
          이 노트의 핵심 주장, 다음에 쓸 문단, 관련 링크를 물어볼 수 있는 mock 패널입니다.
        </div>
      </div>
    </aside>
  );
}

function UploadModal({ onClose, onChoice }) {
  return (
    <div className="upload-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="upload-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>파일을 어떻게 처리할까요?</h2>
          <button className="icon-button" type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <button className="upload-choice" type="button" onClick={() => onChoice("convert")}>
            <strong>마크다운으로 변환</strong>
            <span>PDF, TXT, MD 파일의 내용을 BrainX 노트로 변환합니다.</span>
          </button>
          <button className="upload-choice" type="button" onClick={() => onChoice("keep")}>
            <strong>원본 파일로 유지</strong>
            <span>파일을 첨부파일로 보관합니다.</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function NoteEditorPage({ initialNoteId }) {
  const router = useRouter();
  const titleInputRef = useRef(null);
  const markdownRef = useRef(null);
  const [notes, setNotes] = useState(readNotes);
  const [selectedNoteId, setSelectedNoteId] = useState(initialNoteId);
  const [selectedFolderId, setSelectedFolderId] = useState(DEFAULT_FOLDER_ID);
  const [search, setSearch] = useState("");
  const [saveStatus, setSaveStatus] = useState("saved");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [toasts, pushToast] = useToasts();
  const didHydrate = useRef(false);

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedNoteId) || null,
    [notes, selectedNoteId]
  );

  const headings = useMemo(() => extractHeadings(selectedNote?.markdown || ""), [selectedNote?.markdown]);
  const wikiLinks = useMemo(() => extractWikiLinks(selectedNote?.markdown || ""), [selectedNote?.markdown]);

  const selectNote = useCallback(
    (id) => {
      setSelectedNoteId(id);
      router.push(`/notes/${id}`);
    },
    [router]
  );

  const handleCreateNote = useCallback(() => {
    const title = generateUntitledName(notes);
    const createdAt = nowIso();
    const newNote = {
      id: createId(),
      title,
      markdown: "",
      folderId: selectedFolderId || DEFAULT_FOLDER_ID,
      tags: [],
      backlinks: [],
      links: [],
      createdAt,
      updatedAt: createdAt,
      version: 1,
      isFavorite: false
    };

    setNotes((prev) => [newNote, ...prev]);
    setSelectedNoteId(newNote.id);
    router.push(`/notes/${newNote.id}`);

    window.setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 0);
  }, [notes, router, selectedFolderId]);

  const updateSelectedNote = useCallback(
    (patch) => {
      if (!selectedNote) return;
      setNotes((prev) =>
        prev.map((note) =>
          note.id === selectedNote.id
            ? {
                ...note,
                ...patch,
                updatedAt: nowIso(),
                version: note.version + 1
              }
            : note
        )
      );
      setSaveStatus("saving");
    },
    [selectedNote]
  );

  useEffect(() => {
    setSelectedNoteId(initialNoteId);
  }, [initialNoteId]);

  useEffect(() => {
    if (!notes.length || selectedNote) return;
    const firstId = notes[0].id;
    setSelectedNoteId(firstId);
    router.replace(`/notes/${firstId}`);
  }, [notes, router, selectedNote]);

  useEffect(() => {
    if (!didHydrate.current) {
      didHydrate.current = true;
      try {
        persistNotes(notes);
      } catch {
        setSaveStatus("error");
      }
      return;
    }

    const timer = window.setTimeout(() => {
      try {
        persistNotes(notes);
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      }
    }, saveStatus === "saving" ? 1000 : 0);

    return () => window.clearTimeout(timer);
  }, [notes, saveStatus]);

  const handleShare = async () => {
    if (!selectedNote) return;
    const url = `${window.location.origin}/notes/${selectedNote.id}?share=mock-${selectedNote.id.slice(0, 8)}`;
    try {
      await navigator.clipboard?.writeText(url);
      pushToast("공유 링크를 복사했습니다.");
    } catch {
      pushToast(`공유 링크: ${url}`);
    }
  };

  const handleUploadChoice = (choice) => {
    setUploadOpen(false);
    pushToast(choice === "convert" ? "마크다운 변환은 준비 중입니다." : "원본 파일 첨부는 준비 중입니다.");
  };

  return (
    <div className="notes-app">
      <NoteSidebar
        notes={notes}
        selectedNoteId={selectedNoteId}
        selectedFolderId={selectedFolderId}
        search={search}
        onSearch={setSearch}
        onSelectFolder={setSelectedFolderId}
        onSelectNote={selectNote}
        onCreateNote={handleCreateNote}
      />

      <main className="note-editor-shell">
        <header className="editor-topbar">
          <SaveStatus status={saveStatus} />
          <div className="topbar-spacer" />
          <ExportButtons
            selectedNote={selectedNote}
            onUpload={() => setUploadOpen(true)}
            onShare={handleShare}
            onPdf={() => pushToast("PDF 내보내기 준비 중입니다.")}
          />
        </header>

        <NoteEditor
          selectedNote={selectedNote}
          saveStatus={saveStatus}
          titleInputRef={titleInputRef}
          markdownRef={markdownRef}
          onCreateNote={handleCreateNote}
          onChangeTitle={(title) => updateSelectedNote({ title })}
          onChangeMarkdown={(markdown) => updateSelectedNote({ markdown, links: extractWikiLinks(markdown) })}
        />
      </main>

      <NoteRightPanel selectedNote={selectedNote} headings={headings} wikiLinks={wikiLinks} />

      {uploadOpen && <UploadModal onClose={() => setUploadOpen(false)} onChoice={handleUploadChoice} />}
      <ToastStack toasts={toasts} />
    </div>
  );
}
