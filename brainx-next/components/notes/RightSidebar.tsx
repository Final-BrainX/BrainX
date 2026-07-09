"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { CollapseChevron } from "./CollapseChevron";
import { cx } from "@/lib/utils";
import { Icon } from "@/components/brainx-ui";
import { MockFolder, MockNote } from "@/lib/notes/noteTypes";
import { MOCK_CONTEXT_DATA } from "@/lib/notes/mockNotes";
import { readAuthSession } from "@/lib/auth-api";
import { extractResolvedWikiLinkTargets, resolveWikiLinkByTitle } from "@/lib/wiki-links";
import {
  AiUsageLimitExceededError,
  createChatThread,
  generateNoteSummary,
  createInlineAssistStream,
  createLinkSuggestions,
  decideAiSuggestion,
  getNoteSummary,
  sendChatMessageStream,
  type NoteSummaryData,
} from "@/lib/intelligence-api";
import {
  applyLinkSuggestionToMarkdown,
  filterLinkSuggestions,
  linkSuggestionApplyContent,
  linkAcceptErrorMessage,
  linkSuggestionErrorMessage,
  linkSuggestionKey,
  linkSuggestionTargetTitle,
  type LinkSuggestion,
  type LinkSuggestionEdge,
} from "@/lib/link-suggestions";
import { getNote, matchesWorkspaceScope, updateWorkspaceNoteContent, USE_MOCK_NOTES, WorkspaceApiError } from "@/lib/workspace-api";
import { contentHasWikiLinkTo } from "@/lib/wiki-links";
import { useBrainX } from "@/components/brainx-provider";
import { useWorkspace } from "@/components/workspace-provider";
import {
  DEFAULT_DRAFT_TARGET_LENGTH,
  clampDraftTargetLength,
  routeInlineAiInput,
  buildNoteAiContext,
  validateAiContextSufficiency,
  type InlineAiMode,
  type InlineAiRoute,
} from "@/lib/ai-context";
import type { EditMode, InlineDraftSession, NoteEditorHandle } from "./NoteEditor";

/* ── 헤딩 파싱 ─────────────────────────────────────────────────────────────
   note.content는 두 가지 형태일 수 있다 — 한 번도 편집 안 한 시드 노트는 원문 마크다운
   ("# 제목\n..."), 에디터에서 한 번이라도 저장된 노트는 getHTML() 결과(HTML, 예:
   "<h2>## 제목</h2>" — "#"는 라이브 프리뷰용 decoration이 아니라 실제 텍스트라 HTML에도
   그대로 들어있음, NoteEditor.tsx의 MarkdownHeading 참고). 기존엔 항상 줄바꿈 기준으로
   "^#{1,3}\s+"만 찾았는데, 그건 마크다운 원문에만 맞는 파싱이라 한 번이라도 편집된 노트는
   목차가 항상 비어 있었다(이번 헤딩 작업으로 새로 생긴 문제가 아니라 원래부터 있던 제약). */
function parseHeadings(content: string) {
  const trimmed = content.trim();
  if (trimmed.startsWith("<")) {
    const headings: { id: string; level: number; text: string }[] = [];
    const re = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
    let match: RegExpExecArray | null;
    let i = 0;
    while ((match = re.exec(trimmed))) {
      const level = Number(match[1]);
      const text = match[2]
        .replace(/<[^>]+>/g, "")
        .replace(/^#{1,6}\s*/, "")
        .trim();
      if (text) headings.push({ id: `h-${i++}`, level, text });
    }
    return headings;
  }
  let headingIndex = 0;
  return content
    .split("\n")
    .map((line) => {
      const m = /^(#{1,3})\s+(.+)/.exec(line.trim());
      if (!m) return null;
      return { id: `h-${headingIndex++}`, level: m[1].length, text: m[2].trim() };
    })
    .filter((x): x is { id: string; level: number; text: string } => Boolean(x));
}

function safeMarkdownHref(href: string) {
  if (href.startsWith("/")) return href;
  try {
    const url = new URL(href);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? href : null;
  } catch {
    return null;
  }
}

function renderInlineMarkdown(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const tokenPattern = /(\*\*[^*\n]+?\*\*|~~[^~\n]+?~~|`[^`\n]+?`|\[([^\]\n]+)\]\(([^)\s]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = tokenPattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));

    const token = match[0];
    const key = `${keyPrefix}-inline-${index++}`;
    if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{renderInlineMarkdown(token.slice(2, -2), key)}</strong>);
    } else if (token.startsWith("~~")) {
      nodes.push(<s key={key}>{renderInlineMarkdown(token.slice(2, -2), key)}</s>);
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="rounded bg-surface2/70 px-1 py-0.5 text-[11px] text-accent">
          {token.slice(1, -1)}
        </code>
      );
    } else {
      const href = safeMarkdownHref(match[3] ?? "");
      nodes.push(
        href ? (
          <a key={key} href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
            {renderInlineMarkdown(match[2] ?? "", key)}
          </a>
        ) : (
          token
        )
      );
    }

    lastIndex = tokenPattern.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function MarkdownLine({ text, id }: { text: string; id: string }) {
  return <>{renderInlineMarkdown(text, id)}</>;
}

function AiMarkdownMessage({ text, streaming }: { text: string; streaming?: boolean }) {
  const blocks: React.ReactNode[] = [];
  const paragraph: string[] = [];
  const listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const key = `p-${blocks.length}`;
    blocks.push(
      <p key={key} className="whitespace-normal">
        {paragraph.map((line, index) => (
          <span key={`${key}-${index}`}>
            {index > 0 && <br />}
            <MarkdownLine text={line} id={`${key}-${index}`} />
          </span>
        ))}
      </p>
    );
    paragraph.length = 0;
  };

  const flushList = () => {
    if (!listType || listItems.length === 0) return;
    const key = `list-${blocks.length}`;
    const Tag = listType;
    blocks.push(
      <Tag key={key} className="ml-4 space-y-1 pl-1 marker:text-txt3">
        {listItems.map((item, index) => (
          <li key={`${key}-${index}`} className={listType === "ul" ? "list-disc" : "list-decimal"}>
            <MarkdownLine text={item} id={`${key}-${index}`} />
          </li>
        ))}
      </Tag>
    );
    listItems.length = 0;
    listType = null;
  };

  text.replace(/\r\n/g, "\n").split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      return;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push(
        <p key={`h-${blocks.length}`} className="font-semibold text-txt">
          <MarkdownLine text={heading[2]} id={`h-${blocks.length}`} />
        </p>
      );
      return;
    }

    const quote = /^>\s+(.+)$/.exec(trimmed);
    if (quote) {
      flushParagraph();
      flushList();
      blocks.push(
        <blockquote key={`q-${blocks.length}`} className="border-l-2 border-line/70 pl-2 text-txt3">
          <MarkdownLine text={quote[1]} id={`q-${blocks.length}`} />
        </blockquote>
      );
      return;
    }

    const unordered = /^[-*]\s+(.+)$/.exec(trimmed);
    if (unordered) {
      flushParagraph();
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listItems.push(unordered[1]);
      return;
    }

    const ordered = /^\d+\.\s+(.+)$/.exec(trimmed);
    if (ordered) {
      flushParagraph();
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      listItems.push(ordered[1]);
      return;
    }

    flushList();
    paragraph.push(line.trimEnd());
  });

  flushParagraph();
  flushList();

  return (
    <div className={cx("space-y-1.5 break-words", streaming ? "stream-caret" : "")}>
      {blocks.length > 0 ? blocks : <span>&nbsp;</span>}
    </div>
  );
}

/* ── 사이드 카드 ─────────────────────────────────────── */
function SideCard({
  title,
  icon,
  accent = false,
  defaultOpen = true,
  count,
  children,
}: {
  title: string;
  icon: Parameters<typeof Icon>[0]["name"];
  accent?: boolean;
  defaultOpen?: boolean;
  count?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="overflow-hidden rounded-xl border border-line/70"
      style={{ background: "rgb(var(--surface))" }}
    >
      {/* 카드 헤더 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cx(
          "flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition-colors",
          "hover:bg-surface2/30"
        )}
        style={{
          background: accent ? "rgb(var(--accent) / 0.06)" : "transparent",
          borderBottom: open ? "1px solid rgb(var(--border) / 0.4)" : "none",
        }}
      >
        <Icon
          name={icon}
          size={13}
          className={cx("shrink-0", accent ? "text-accent" : "text-txt3")}
        />
        <span
          className={cx(
            "flex-1 text-[12px] font-semibold leading-none",
            accent ? "text-accent" : "text-txt"
          )}
        >
          {title}
        </span>
        {count !== undefined && count > 0 && (
          <span
            className="rounded-full px-1.5 py-px text-[10px] font-medium"
            style={{
              background: accent ? "rgb(var(--accent) / 0.15)" : "rgb(var(--surface2))",
              color: accent ? "rgb(var(--accent))" : "rgb(var(--txt3))",
            }}
          >
            {count}
          </span>
        )}
        <CollapseChevron expanded={open} size={12} />
      </button>

      {/* 카드 본문 */}
      {open && <div className="px-3.5 py-3">{children}</div>}
    </div>
  );
}

/* ── TOC 아이템 ─────────────────────────────────────── */
function TocItem({
  heading,
  isActive,
  onClick,
}: {
  heading: { id: string; level: number; text: string };
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex w-full items-center rounded-lg py-1 pr-2 text-left transition-colors hover:bg-surface2/50"
      style={{ paddingLeft: (heading.level - 1) * 12 + 8 }}
    >
      {/* 활성 바 */}
      {isActive && (
        <span
          className="absolute left-0 h-full w-0.5 rounded-r"
          style={{ background: "rgb(var(--primary))" }}
        />
      )}
      <span
        className={cx(
          "truncate text-[12px] transition-colors",
          isActive
            ? "font-medium text-primary"
            : "text-txt2 group-hover:text-txt"
        )}
      >
        {heading.text}
      </span>
    </button>
  );
}

/* ── 링크 칩 ─────────────────────────────────────────── */
function LinkChip({
  note,
  path,
  type,
  onClick,
}: {
  note: Pick<MockNote, "id" | "title" | "documentGroupId">;
  path?: string;
  type: "outbound" | "backlink";
  onClick: () => void;
}) {
  const isBacklink = type === "backlink";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex w-full items-start gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors",
        isBacklink
          ? "border-blue-200 bg-blue-50 hover:border-blue-300 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/35 dark:hover:border-blue-700 dark:hover:bg-blue-900/40"
          : "border-line/60 hover:border-line/80 hover:bg-surface2/50"
      )}
      style={{
        background: isBacklink
          ? undefined
          : "rgb(var(--surface2) / 0.3)",
      }}
    >
      <Icon
        name="link"
        size={12}
        className={cx(
          "mt-0.5 shrink-0",
          isBacklink ? "text-blue-500 dark:text-blue-300" : "text-cyan"
        )}
      />
      <span className="min-w-0 flex-1">
        <span className={cx(
          "block truncate text-[12px] font-medium",
          isBacklink ? "text-txt" : "text-txt"
        )}>
          {note.title}
        </span>
        {path ? <span className="block truncate text-[10px] text-txt3">{path}</span> : null}
      </span>
      {isBacklink ? (
        <span
          className="shrink-0 rounded-md border border-blue-200 bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-900/50 dark:text-blue-200"
        >
          상위
        </span>
      ) : null}
    </button>
  );
}

/* ── 메인 컴포넌트 ──────────────────────────────────── */
export interface PendingAiRequest {
  type: "summarize" | "rewrite";
  text: string;
  nonce: number;
}

type NoteLinkSuggestionStatus = "idle" | "loading" | "success" | "error";
type NoteLinkAcceptStatus = "saving" | "saved" | "error";
type NoteSummaryStatus = "idle" | "loading" | "refreshing" | "success" | "insufficient" | "error";
type NoteLinkAcceptState = {
  status: NoteLinkAcceptStatus;
  error?: string;
};

const DEFAULT_CHAT_MODEL_ID = "gpt-5.4-mini";
const INLINE_AI_HEIGHT_KEY = "brainx_notes_inline_ai_height_v1";
const INLINE_AI_DEFAULT_HEIGHT = 260;
const INLINE_AI_MIN_HEIGHT = 180;
const INLINE_AI_MAX_HEIGHT = 640;
const INLINE_AI_TOP_RESERVE = 140;
const NOTE_SUMMARY_MIN_CHARS = 80;

function clampInlineAiHeight(height: number, sidebarHeight: number) {
  const measuredMax = sidebarHeight > 0 ? sidebarHeight - INLINE_AI_TOP_RESERVE : INLINE_AI_MAX_HEIGHT;
  const max = Math.max(INLINE_AI_MIN_HEIGHT, Math.min(INLINE_AI_MAX_HEIGHT, measuredMax));
  return Math.max(INLINE_AI_MIN_HEIGHT, Math.min(max, height));
}

function notePlainText(content: string) {
  return content
    .replace(/<[^>]+>/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[#>*_~`()\[\]-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function noteSummaryErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "세줄 요약을 불러오지 못했습니다.";
  if (message.includes("요약할 텍스트가 부족") || message.includes("INSUFFICIENT_NOTE_CONTENT")) {
    return "요약할 텍스트가 부족합니다.";
  }
  return message || "세줄 요약을 불러오지 못했습니다.";
}

interface Props {
  activeNote: MockNote | null;
  allNotes: MockNote[];
  allFolders: MockFolder[];
  onCollapse: () => void;
  onNoteSelect?: (noteId: string) => void;
  pendingAiRequest?: PendingAiRequest | null;
  onAiRequestHandled?: () => void;
  activeEditor?: NoteEditorHandle | null;
  activeEditorMode?: EditMode;
  /** 목차 항목 클릭 → 현재 활성 패널의 에디터를 해당 heading으로 스크롤(NotesWorkspace.tsx). */
  onHeadingSelect?: (index: number) => void;
}

export default function RightSidebar({
  activeNote,
  allNotes,
  allFolders,
  onCollapse,
  onNoteSelect,
  pendingAiRequest,
  onAiRequestHandled,
  activeEditor,
  activeEditorMode = "edit",
  onHeadingSelect,
}: Props) {
  const [activeTocId, setActiveTocId] = useState<string | null>(null);
  const [aiInput, setAiInput] = useState("");
  const [inlineAiMode, setInlineAiMode] = useState<InlineAiMode>("ask");
  const [draftTargetLength, setDraftTargetLength] = useState(DEFAULT_DRAFT_TARGET_LENGTH);
  const [aiMessages, setAiMessages] = useState<Array<{ role: "ai" | "user"; text: string; streaming?: boolean }>>([
    { role: "ai", text: "이 노트에 대해 무엇이든 물어보세요. 관련 노트도 함께 찾아드려요." },
  ]);
  const [linkSuggestionStatus, setLinkSuggestionStatus] = useState<NoteLinkSuggestionStatus>("idle");
  const [linkSuggestions, setLinkSuggestions] = useState<LinkSuggestion[]>([]);
  const [linkSuggestionError, setLinkSuggestionError] = useState<string | null>(null);
  const [linkAcceptStates, setLinkAcceptStates] = useState<Record<string, NoteLinkAcceptState>>({});
  const [noteSummaryStatus, setNoteSummaryStatus] = useState<NoteSummaryStatus>("idle");
  const [noteSummary, setNoteSummary] = useState<NoteSummaryData | null>(null);
  const [noteSummaryError, setNoteSummaryError] = useState<string | null>(null);
  const [hasAuthenticatedSession, setHasAuthenticatedSession] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [inlineAiHeight, setInlineAiHeight] = useState<number>(() => {
    if (typeof window === "undefined") return INLINE_AI_DEFAULT_HEIGHT;
    const saved = Number(window.localStorage.getItem(INLINE_AI_HEIGHT_KEY));
    return Number.isFinite(saved)
      ? clampInlineAiHeight(saved, 0)
      : INLINE_AI_DEFAULT_HEIGHT;
  });
  const [sidebarHeight, setSidebarHeight] = useState(0);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const aiRequestAbortRef = useRef<AbortController | null>(null);
  const aiMockTimerRef = useRef<number | null>(null);
  const activeDraftSessionRef = useRef<InlineDraftSession | null>(null);
  const chatThreadIdsRef = useRef<Record<string, string>>({});
  const { currentWorkspaceId, workspaces } = useWorkspace();
  const { openAiUsageLimitModal, pushToast } = useBrainX();
  const activeNoteDocumentGroupId = activeNote?.documentGroupId ?? undefined;

  // 노트별 스레드는 note.documentGroupId와 항상 같은 범위에서만 재사용한다.
  useEffect(() => {
    chatThreadIdsRef.current = {};
  }, [activeNoteDocumentGroupId]);

  const toc = useMemo(() => (activeNote ? parseHeadings(activeNote.content) : []), [activeNote]);
  const folderPathByNoteId = useMemo(() => {
    if (!activeNote) return new Map<string, string>();

    const folderById = new Map(
      allFolders
        .filter((folder) => (folder.documentGroupId ?? null) === (activeNote.documentGroupId ?? null))
        .map((folder) => [folder.id, folder])
    );

    const resolveFolderPath = (folderId: string | undefined) => {
      if (!folderId) return "";
      const names: string[] = [];
      const visited = new Set<string>();
      let currentId: string | null | undefined = folderId;

      while (currentId) {
        if (visited.has(currentId)) break;
        visited.add(currentId);
        const folder = folderById.get(currentId);
        if (!folder) break;
        names.push(folder.name);
        currentId = folder.parentFolderId;
      }

      return names.reverse().join(" / ");
    };

    return new Map(
      allNotes
        .filter((note) => (note.documentGroupId ?? null) === (activeNote.documentGroupId ?? null))
        .map((note) => [note.id, resolveFolderPath(note.folderId)])
    );
  }, [activeNote, allFolders, allNotes]);
  const ctx = useMemo(() => {
    if (!activeNote) return { backlinks: [], connections: [], aiSuggestions: [] as string[] };

    const mockContext = MOCK_CONTEXT_DATA[activeNote.id];
    // NotesWorkspace.tsx의 visibleNotes(matchesCurrentWorkspace)와 동일한 판정을 쓴다 — default
    // Workspace에서는 documentGroupId=null인 레거시 노트도 링크 스코프에 포함해야 하고, 그 외
    // Workspace에서는 해당 Workspace 노트만 포함해야 한다(activeNote.documentGroupId 단순 비교로는
    // 이 규칙을 재현할 수 없다).
    const workspaceNotes = allNotes.filter((note) =>
      matchesWorkspaceScope(note.documentGroupId ?? null, currentWorkspaceId, workspaces)
    );
    const outboundSeen = new Set<string>();
    const connections: MockNote[] = [];
    for (const target of extractResolvedWikiLinkTargets(activeNote.content)) {
      const resolved = resolveWikiLinkByTitle(workspaceNotes, target);
      if (!resolved || resolved.id === activeNote.id || outboundSeen.has(resolved.id)) continue;
      outboundSeen.add(resolved.id);
      connections.push(resolved);
    }

    // backlink도 outbound와 동일하게 workspaceNotes 전체를 대상으로 resolve해야 한다 — 대상 노트
    // 하나만 놓고 resolve하면 "Spring" / "Spring Security"처럼 제목이 겹치는 경우, 실제로는 다른
    // 노트를 가리키는 링크까지 activeNote의 backlink로 오판(false backlink)할 수 있다.
    const backlinks = workspaceNotes.filter((note) => {
      if (note.id === activeNote.id) return false;
      const targets = extractResolvedWikiLinkTargets(note.content);
      return targets.some((target) => resolveWikiLinkByTitle(workspaceNotes, target)?.id === activeNote.id);
    });

    return { backlinks, connections, aiSuggestions: mockContext?.aiSuggestions ?? [] };
  }, [activeNote, allNotes, currentWorkspaceId, workspaces]);

  useEffect(() => {
    setLinkSuggestionStatus("idle");
    setLinkSuggestions([]);
    setLinkSuggestionError(null);
    setLinkAcceptStates({});
  }, [activeNote?.id]);

  useEffect(() => {
    const syncAuthSession = () => {
      setHasAuthenticatedSession(Boolean(readAuthSession()?.accessToken));
    };
    syncAuthSession();
    window.addEventListener("brainx-auth-session-changed", syncAuthSession);
    return () => window.removeEventListener("brainx-auth-session-changed", syncAuthSession);
  }, []);

  const cancelActiveAiRequest = useCallback(() => {
    aiRequestAbortRef.current?.abort();
    aiRequestAbortRef.current = null;
    activeDraftSessionRef.current?.rollback();
    activeDraftSessionRef.current = null;
    if (aiMockTimerRef.current !== null) {
      window.clearInterval(aiMockTimerRef.current);
      aiMockTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cancelActiveAiRequest();
    };
  }, [cancelActiveAiRequest]);

  useEffect(() => {
    const element = sidebarRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(([entry]) => {
      const nextHeight = entry?.contentRect.height ?? 0;
      setSidebarHeight(nextHeight);
      setInlineAiHeight((current) => clampInlineAiHeight(current, nextHeight));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const persistInlineAiHeight = useCallback((height: number) => {
    try {
      window.localStorage.setItem(INLINE_AI_HEIGHT_KEY, String(height));
    } catch {
      // localStorage 접근 불가
    }
  }, []);

  const setClampedInlineAiHeight = useCallback((height: number, persist = false) => {
    const next = clampInlineAiHeight(height, sidebarHeight);
    setInlineAiHeight(next);
    if (persist) persistInlineAiHeight(next);
  }, [persistInlineAiHeight, sidebarHeight]);

  const handleInlineAiResizePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = inlineAiHeight;
    let latest = startHeight;

    const onMove = (moveEvent: PointerEvent) => {
      latest = clampInlineAiHeight(startHeight - (moveEvent.clientY - startY), sidebarHeight);
      setInlineAiHeight(latest);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      persistInlineAiHeight(latest);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, [inlineAiHeight, persistInlineAiHeight, sidebarHeight]);

  const updateLatestAiMessage = (text: string, streaming: boolean) => {
    setAiMessages((m) => {
      const next = [...m];
      next[next.length - 1] = { role: "ai", text, streaming };
      return next;
    });
  };

  const resolveNoteDocumentGroupId = useCallback((note: MockNote) => (
    note.documentGroupId ?? currentWorkspaceId ?? undefined
  ), [currentWorkspaceId]);

  const activeNoteDocumentGroupIdForLinks = activeNote ? resolveNoteDocumentGroupId(activeNote) : undefined;
  const activeNoteHasServerSource = Boolean(activeNote && activeNote.persisted === true && activeNoteDocumentGroupIdForLinks);
  const activeNotePlainTextLength = activeNote ? notePlainText(activeNote.content).length : 0;
  const canRefreshNoteSummary = Boolean(activeNote && !USE_MOCK_NOTES && hasAuthenticatedSession && activeNoteHasServerSource && activeNotePlainTextLength >= NOTE_SUMMARY_MIN_CHARS);
  const noteSummaryDisabledReason = !activeNote
    ? "노트를 먼저 열어 주세요."
    : USE_MOCK_NOTES
      ? "데모 노트에서는 실제 세줄 요약을 생성하지 않습니다."
      : !hasAuthenticatedSession
        ? "로그인 후 세줄 요약을 생성할 수 있습니다."
        : !activeNote.persisted
          ? "노트가 서버에 저장된 뒤 세줄 요약을 생성할 수 있습니다."
          : !activeNoteDocumentGroupIdForLinks
            ? "Workspace 정보가 동기화된 뒤 세줄 요약을 생성할 수 있습니다."
            : activeNotePlainTextLength < NOTE_SUMMARY_MIN_CHARS
              ? "요약할 텍스트가 부족합니다."
              : null;
  const canRequestLinkSuggestions = Boolean(activeNote && !USE_MOCK_NOTES && hasAuthenticatedSession && activeNoteHasServerSource);
  const linkSuggestionDisabledReason = !activeNote
    ? "노트를 먼저 열어 주세요."
    : USE_MOCK_NOTES
      ? "데모 노트에서는 실제 AI 연결 추천을 실행하지 않습니다."
      : !hasAuthenticatedSession
        ? "로그인 후 AI 연결 추천을 실행할 수 있습니다."
        : !activeNote.persisted
          ? "노트가 서버에 저장된 뒤 AI 연결 추천을 실행할 수 있습니다."
          : !activeNoteDocumentGroupIdForLinks
            ? "Workspace 정보가 동기화된 뒤 AI 연결 추천을 실행할 수 있습니다."
            : null;

  useEffect(() => {
    setNoteSummary(null);
    setNoteSummaryError(null);
    if (!activeNote || !hasAuthenticatedSession || !activeNoteHasServerSource || USE_MOCK_NOTES) {
      setNoteSummaryStatus("idle");
      return;
    }

    let cancelled = false;
    setNoteSummaryStatus("loading");
    getNoteSummary(activeNote.id)
      .then((summary) => {
        if (cancelled) return;
        setNoteSummary(summary);
        setNoteSummaryStatus("success");
      })
      .catch((error) => {
        if (cancelled) return;
        setNoteSummaryError(noteSummaryErrorMessage(error));
        setNoteSummaryStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [activeNote?.id, activeNoteHasServerSource, hasAuthenticatedSession]);

  const handleRefreshNoteSummary = async () => {
    if (!activeNote || !activeNoteDocumentGroupIdForLinks) return;
    if (!canRefreshNoteSummary) {
      pushToast(noteSummaryDisabledReason ?? "세줄 요약을 생성할 수 없습니다.", "info");
      if (activeNotePlainTextLength < NOTE_SUMMARY_MIN_CHARS) {
        setNoteSummaryStatus("insufficient");
        setNoteSummaryError("요약할 텍스트가 부족합니다.");
      }
      return;
    }

    setNoteSummaryStatus("refreshing");
    setNoteSummaryError(null);
    try {
      const summary = await generateNoteSummary(activeNote.id, {
        documentGroupId: activeNoteDocumentGroupIdForLinks,
        force: true,
      });
      setNoteSummary(summary);
      setNoteSummaryStatus("success");
      pushToast("세줄 요약을 갱신했습니다.", "ok");
    } catch (error) {
      const message = noteSummaryErrorMessage(error);
      setNoteSummaryStatus(message.includes("부족") ? "insufficient" : "error");
      setNoteSummaryError(message);
      if (error instanceof AiUsageLimitExceededError) {
        openAiUsageLimitModal(error.reason);
      }
    }
  };

  const existingLinkSuggestionEdges = useMemo<LinkSuggestionEdge[]>(() => {
    if (!activeNote) return [];
    return allNotes.flatMap((note) => {
      if (note.id === activeNote.id) return [];
      const linkedFromActive = contentHasWikiLinkTo(activeNote.content, note.title);
      const linkedToActive = contentHasWikiLinkTo(note.content, activeNote.title);
      return linkedFromActive || linkedToActive
        ? [{ source: activeNote.id, target: note.id }]
        : [];
    });
  }, [activeNote, allNotes]);

  const ensureNoteChatThread = async (note: MockNote) => {
    const existing = chatThreadIdsRef.current[note.id];
    if (existing) return existing;
    const created = await createChatThread({
      documentGroupId: resolveNoteDocumentGroupId(note),
      title: `${note.title} AI`,
      modelId: DEFAULT_CHAT_MODEL_ID,
    });
    chatThreadIdsRef.current[note.id] = created.threadId;
    return created.threadId;
  };

  const sendDraftToEditor = async (note: MockNote, route: Extract<InlineAiRoute, { kind: "draft" }>) => {
    if (!activeEditor || activeEditorMode !== "edit") {
      updateLatestAiMessage("편집 가능한 노트를 열어 주세요.", false);
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    const draftSession = activeEditor.startInlineDraftSession();
    if (!draftSession) {
      updateLatestAiMessage("편집 가능한 노트를 열어 주세요.", false);
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    const controller = new AbortController();
    aiRequestAbortRef.current = controller;
    activeDraftSessionRef.current = draftSession;
    let streamedText = "";
    updateLatestAiMessage("편집기에 초안을 작성 중입니다.", true);

    try {
      const done = await createInlineAssistStream(
        {
          noteId: note.id,
          selectedText: "",
          contextBefore: draftSession.contextBefore,
          contextAfter: draftSession.contextAfter,
          action: "DRAFT",
          draftPrompt: route.prompt,
          targetLength: route.targetLength,
          language: "ko",
        },
        {
          signal: controller.signal,
          onDelta: (delta) => {
            streamedText += delta;
            draftSession.appendDelta(delta);
          },
        }
      );
      if (aiRequestAbortRef.current === controller) aiRequestAbortRef.current = null;
      if (activeDraftSessionRef.current === draftSession) activeDraftSessionRef.current = null;
      if (!done) throw new Error("AI 작성 완료 이벤트를 받지 못했습니다.");
      if (!streamedText.trim()) {
        draftSession.rollback();
        decideAiSuggestion(done.suggestionId, { decision: "REJECTED" }).catch((error) => {
          console.warn("Failed to record rejected AI draft suggestion.", error);
        });
        updateLatestAiMessage("작성 결과가 비어 있습니다.", false);
        return;
      }

      draftSession.commit(streamedText);
      updateLatestAiMessage(`${route.targetLength}자 기준 초안을 편집기에 삽입했습니다.`, false);
      decideAiSuggestion(done.suggestionId, { decision: "ACCEPTED" }).catch((error) => {
        console.warn("Failed to record accepted AI draft suggestion.", error);
      });
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (aiRequestAbortRef.current === controller) aiRequestAbortRef.current = null;
      if (activeDraftSessionRef.current === draftSession) activeDraftSessionRef.current = null;
      draftSession.rollback();
      const message = error instanceof Error ? error.message : "AI 작성 요청에 실패했습니다.";
      updateLatestAiMessage(message, false);
      if (error instanceof AiUsageLimitExceededError) {
        openAiUsageLimitModal(error.reason);
      }
    }
  };

  const handleCreateLinkSuggestions = async () => {
    if (!activeNote) return;
    const documentGroupId = resolveNoteDocumentGroupId(activeNote);
    if (!canRequestLinkSuggestions || !documentGroupId) {
      const fallbackLabels = ctx.aiSuggestions.filter((item) => item.trim());
      if (fallbackLabels.length > 0) {
        setLinkSuggestionStatus("success");
        setLinkSuggestions([]);
        setLinkSuggestionError(null);
      }
      pushToast(linkSuggestionDisabledReason ?? "AI 연결 추천을 실행할 수 없습니다.", "info");
      return;
    }

    setLinkSuggestionStatus("loading");
    setLinkSuggestionError(null);
    setLinkSuggestions([]);
    setLinkAcceptStates({});

    try {
      const result = await createLinkSuggestions({
        documentGroupId,
        noteId: activeNote.id,
      });
      const suggestions = filterLinkSuggestions(
        activeNote.id,
        result.suggestions,
        allNotes,
        existingLinkSuggestionEdges
      );
      setLinkSuggestions(suggestions);
      setLinkSuggestionStatus("success");
      if (suggestions.length > 0) {
        pushToast("AI 연결 후보를 찾았어요.", "ok");
      }
    } catch (error) {
      setLinkSuggestionStatus("error");
      setLinkSuggestionError(linkSuggestionErrorMessage(error));
      if (error instanceof AiUsageLimitExceededError) {
        openAiUsageLimitModal(error.reason);
      }
    }
  };

  const handleAcceptLinkSuggestion = async (suggestion: LinkSuggestion) => {
    if (!activeNote) return;
    const key = linkSuggestionKey(activeNote.id, suggestion);
    const currentState = linkAcceptStates[key];
    if (currentState?.status === "saving" || currentState?.status === "saved") return;

    setLinkAcceptStates((current) => ({
      ...current,
      [key]: { status: "saving" },
    }));

    try {
      const targetNote = allNotes.find((note) => note.id === suggestion.targetNoteId);
      const targetTitle = linkSuggestionTargetTitle(suggestion, targetNote);
      activeEditor?.flushPendingSave();
      const latestSource = await getNote(activeNote.id);
      const currentContent = linkSuggestionApplyContent(
        activeEditor?.getHTML(),
        latestSource.markdown,
        activeNote.content
      );
      const applied = applyLinkSuggestionToMarkdown(currentContent, suggestion, targetTitle);
      if (applied.error) {
        throw new Error(applied.error);
      }

      if (applied.changed) {
        await updateWorkspaceNoteContent({
          id: activeNote.id,
          title: latestSource.title || activeNote.title,
          content: applied.markdown,
          tags: latestSource.tags ?? activeNote.tags,
          category: activeNote.category,
          folderId: latestSource.folder?.folderId ?? activeNote.folderId,
          documentGroupId: latestSource.documentGroupId ?? activeNote.documentGroupId,
          createdAt: Date.parse(latestSource.createdAt) || activeNote.createdAt || Date.now(),
          updatedAt: Date.now(),
          version: latestSource.version ?? activeNote.version,
          persisted: true,
          typography: latestSource.typography ?? activeNote.typography,
        });
      }

      setLinkAcceptStates((current) => ({
        ...current,
        [key]: { status: "saved" },
      }));
      window.dispatchEvent(new CustomEvent("brainx:notes-refresh", {
        detail: { sourceNoteId: activeNote.id, targetNoteId: suggestion.targetNoteId },
      }));
      pushToast("AI 연결 후보를 본문 링크로 저장했어요.", "ok");
    } catch (error) {
      if (error instanceof WorkspaceApiError && error.code === "NOTE_VERSION_CONFLICT") {
        window.dispatchEvent(new CustomEvent("brainx:notes-refresh", {
          detail: { sourceNoteId: activeNote.id, targetNoteId: suggestion.targetNoteId },
        }));
      }
      setLinkAcceptStates((current) => ({
        ...current,
        [key]: { status: "error", error: linkAcceptErrorMessage(error) },
      }));
    }
  };

  const sendAi = async () => {
    if (!activeNote || !aiInput.trim()) return;
    const note = activeNote;
    const prompt = aiInput.trim();
    const route = routeInlineAiInput(prompt, {
      mode: inlineAiMode,
      targetLength: draftTargetLength,
    });

    cancelActiveAiRequest();

    setAiMessages((m) => [...m, { role: "user", text: prompt }]);
    setAiInput("");
    setAiMessages((m) => [...m, { role: "ai", text: "", streaming: true }]);

    if (route.kind === "draft") {
      await sendDraftToEditor(note, route);
      return;
    }

    const clientContext = buildNoteAiContext({
      task: "note.ask",
      surface: "RIGHT_SIDEBAR",
      documentGroupId: resolveNoteDocumentGroupId(note),
      noteId: note.id,
      title: note.title,
      content: note.content,
    });
    const sufficiency = validateAiContextSufficiency("note.ask", clientContext);
    if (!sufficiency.ok) {
      updateLatestAiMessage(sufficiency.message, false);
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    const controller = new AbortController();
    aiRequestAbortRef.current = controller;
    let streamedText = "";

    try {
      const threadId = await ensureNoteChatThread(note);
      await sendChatMessageStream(
        threadId,
        {
          message: prompt,
          noteScope: {
            documentGroupId: resolveNoteDocumentGroupId(note),
            noteId: note.id,
          },
          clientContext,
          modelId: DEFAULT_CHAT_MODEL_ID,
        },
        {
          signal: controller.signal,
          onDelta: (delta) => {
            streamedText += delta;
            updateLatestAiMessage(streamedText, true);
          },
        }
      );
      if (aiRequestAbortRef.current === controller) aiRequestAbortRef.current = null;
      updateLatestAiMessage(streamedText || "응답 결과가 비어 있습니다.", false);
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (aiRequestAbortRef.current === controller) aiRequestAbortRef.current = null;
      const message = error instanceof Error ? error.message : "AI 요청에 실패했습니다.";
      updateLatestAiMessage(message, false);
      if (error instanceof AiUsageLimitExceededError) {
        openAiUsageLimitModal(error.reason);
      }
    }
  };

  /* 버블 툴바의 AI 버튼(요약/다시쓰기) → 인라인 AI 채팅에 응답 추가 */
  useEffect(() => {
    if (!pendingAiRequest || !activeNote) return;
    const { type, text } = pendingAiRequest;
    const selectedText = text.trim();
    const preview = selectedText ? (selectedText.length > 60 ? `${selectedText.slice(0, 60)}…` : selectedText) : "(선택된 텍스트 없음)";
    const label = type === "summarize" ? "선택한 텍스트 요약 요청" : "선택한 텍스트 다시쓰기 요청";

    cancelActiveAiRequest();

    setChatOpen(true);
    setAiMessages((m) => [...m, { role: "user", text: `${label}: "${preview}"` }]);

    setAiMessages((m) => [...m, { role: "ai", text: "", streaming: true }]);

    if (!selectedText) {
      setAiMessages((m) => {
        const next = [...m];
        next[next.length - 1] = {
          role: "ai",
          text: type === "summarize" ? "요약할 텍스트를 먼저 선택해 주세요." : "다시 쓸 텍스트를 먼저 선택해 주세요.",
          streaming: false,
        };
        return next;
      });
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      onAiRequestHandled?.();
      return;
    }

    if (type === "summarize") {
      const clientContext = buildNoteAiContext({
        task: "note.summarize.selection",
        surface: "RIGHT_SIDEBAR",
        documentGroupId: resolveNoteDocumentGroupId(activeNote),
        noteId: activeNote.id,
        title: activeNote.title,
        selectedText,
      });
      const sufficiency = validateAiContextSufficiency("note.summarize.selection", clientContext);
      if (!sufficiency.ok) {
        setAiMessages((m) => {
          const next = [...m];
          next[next.length - 1] = { role: "ai", text: sufficiency.message, streaming: false };
          return next;
        });
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
        onAiRequestHandled?.();
        return;
      }

      const controller = new AbortController();
      aiRequestAbortRef.current = controller;
      let streamedText = "";

      ensureNoteChatThread(activeNote)
        .then((threadId) => sendChatMessageStream(
          threadId,
          {
            message: "선택한 텍스트를 요약해줘.",
            noteScope: {
              documentGroupId: resolveNoteDocumentGroupId(activeNote),
              noteId: activeNote.id,
            },
            clientContext,
            modelId: DEFAULT_CHAT_MODEL_ID,
          },
          {
            signal: controller.signal,
            onDelta: (delta) => {
              streamedText += delta;
              setAiMessages((m) => {
                const next = [...m];
                next[next.length - 1] = { role: "ai", text: streamedText, streaming: true };
                return next;
              });
            },
          }
        ))
        .then((done) => {
          if (!done) throw new Error("AI 요약 완료 이벤트를 받지 못했습니다.");
          if (aiRequestAbortRef.current === controller) aiRequestAbortRef.current = null;
          setAiMessages((m) => {
            const next = [...m];
            next[next.length - 1] = { role: "ai", text: streamedText || "요약 결과가 비어 있습니다.", streaming: false };
            return next;
          });
          chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          if (aiRequestAbortRef.current === controller) aiRequestAbortRef.current = null;
          const message = error instanceof Error ? error.message : "AI 요약 요청에 실패했습니다.";
          setAiMessages((m) => {
            const next = [...m];
            next[next.length - 1] = { role: "ai", text: message, streaming: false };
            return next;
          });
        });

      onAiRequestHandled?.();
      return;
    }

    const answer = `다시쓰기 제안: "${preview}"를 더 간결하고 명확한 문장으로 다듬어 보세요. (Mock 응답)`;
    let idx = 0;
    const timer = window.setInterval(() => {
      idx += 4;
      setAiMessages((m) => {
        const next = [...m];
        next[next.length - 1] = { role: "ai", text: answer.slice(0, idx), streaming: idx < answer.length };
        return next;
      });
      if (idx >= answer.length) {
        window.clearInterval(timer);
        if (aiMockTimerRef.current === timer) aiMockTimerRef.current = null;
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }, 16);
    aiMockTimerRef.current = timer;
    onAiRequestHandled?.();
    return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAiRequest?.nonce]);

  const totalLinks = ctx.connections.length + ctx.backlinks.length;
  const mockLinkSuggestionLabels = ctx.aiSuggestions.filter((item) => item.trim());
  const showMockLinkSuggestions = !canRequestLinkSuggestions && mockLinkSuggestionLabels.length > 0;
  const aiLinkSuggestionCount = linkSuggestions.length > 0
    ? linkSuggestions.length
    : showMockLinkSuggestions
      ? mockLinkSuggestionLabels.length
      : 0;
  const aiLinkButtonDisabled = linkSuggestionStatus === "loading" || !canRequestLinkSuggestions;
  const aiLinkButtonLabel = linkSuggestionStatus === "loading"
    ? "추천 분석 중…"
    : linkSuggestionStatus === "error"
      ? "다시 분석"
      : "AI 연결 제안";

  return (
    <div
      ref={sidebarRef}
      className="flex h-full w-full min-w-0 flex-col border-l border-line/70"
      style={{ background: "rgb(var(--bg2))" }}
    >
      {/* ── 패널 헤더 ──────────────────────────────── */}
      <div
        className="flex h-9 items-center gap-[5px] border-b border-line/70 px-4"
        style={{ background: "rgb(var(--surface))" }}
      >
        <Icon name="sparkle" size={14} className="shrink-0 text-accent" />
        <div className="flex min-w-0 flex-1 items-center gap-[5px]">
          <p className="truncate text-[12px] font-semibold text-txt">{activeNote?.title ?? "노트 없음"}</p>
          <p className="text-[10px] text-txt3">컨텍스트 패널</p>
        </div>
      </div>

      {!activeNote ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="text-center text-[12px] leading-relaxed text-txt3">
            노트를 열면 목차·연결·AI 제안이
            <br />
            여기에 표시돼요.
          </p>
        </div>
      ) : (
      <>
      {/* ── 스크롤 영역 ────────────────────────────── */}
      <div className="no-scrollbar flex-1 space-y-2.5 overflow-y-auto p-3">

        {/* 1. 목차 */}
        <SideCard
          title="목차"
          icon="summarize"
          defaultOpen
          count={toc.length}
        >
          {toc.length > 0 ? (
            <div className="space-y-0.5">
              {toc.map((h) => (
                <TocItem
                  key={h.id}
                  heading={h}
                  isActive={activeTocId === h.id}
                  onClick={() => {
                    setActiveTocId(h.id);
                    // heading.id는 parseHeadings가 문서 순서대로 매긴 "h-{index}" 형식이라
                    // 그 숫자를 그대로 에디터 쪽 heading 인덱스로 재사용할 수 있다.
                    const index = Number(h.id.slice(2));
                    if (Number.isFinite(index)) onHeadingSelect?.(index);
                  }}
                />
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-txt3">
              <code className="rounded bg-surface2/60 px-1.5 py-0.5 text-[11px] text-accent">#</code>
              {" "} 으로 제목을 추가하면 목차가 생겨요
            </p>
          )}
        </SideCard>

        {/* 2. 세줄 요약 */}
        <SideCard
          title="세줄 요약"
          icon="sparkle"
          defaultOpen
        >
          <div className="space-y-2.5" aria-live="polite">
            <div className="rounded-lg border border-line/60 bg-surface2/40 px-3 py-2.5">
              {noteSummaryStatus === "loading" ? (
                <p className="text-[12px] leading-5 text-txt3">저장된 세줄 요약을 확인하는 중...</p>
              ) : noteSummaryStatus === "refreshing" ? (
                <p className="text-[12px] leading-5 text-txt3">세줄 요약을 갱신하는 중...</p>
              ) : noteSummaryStatus === "success" && noteSummary?.summary ? (
                <p className="whitespace-pre-line break-words text-[12px] leading-5 text-txt2">{noteSummary.summary}</p>
              ) : noteSummaryStatus === "insufficient" ? (
                <p className="text-[12px] leading-5 text-txt3">요약할 텍스트가 부족합니다.</p>
              ) : noteSummaryStatus === "error" ? (
                <p className="text-[12px] leading-5 text-txt3">{noteSummaryError ?? "세줄 요약을 불러오지 못했습니다."}</p>
              ) : (
                <p className="text-[12px] leading-5 text-txt3">요약이 아직 없습니다.</p>
              )}
            </div>
            <button
              type="button"
              disabled={!canRefreshNoteSummary || noteSummaryStatus === "refreshing"}
              onClick={handleRefreshNoteSummary}
              className={cx(
                "flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-[12px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-55",
                canRefreshNoteSummary && noteSummaryStatus !== "refreshing"
                  ? "bg-primary text-white hover:bg-primary/90"
                  : "border border-line/60 bg-surface2/60 text-txt3"
              )}
            >
              <Icon name={noteSummaryStatus === "refreshing" ? "refresh" : "summarize"} size={12} className={noteSummaryStatus === "refreshing" ? "animate-spin" : undefined} />
              {noteSummaryStatus === "refreshing" ? "갱신 중" : "요약 갱신"}
            </button>
            {noteSummaryDisabledReason ? (
              <p className="text-[11px] leading-5 text-txt3">{noteSummaryDisabledReason}</p>
            ) : null}
          </div>
        </SideCard>

        {/* 3. 연결 · 백링크 */}
        <SideCard
          title="연결 · 백링크"
          icon="link"
          defaultOpen
          count={totalLinks}
        >
          {totalLinks > 0 ? (
            <div className="space-y-1.5">
              {ctx.connections.map((title) => (
                <LinkChip
                  key={`out-${title.id}`}
                  note={title}
                  path={folderPathByNoteId.get(title.id) || undefined}
                  type="outbound"
                  onClick={() => onNoteSelect?.(title.id)}
                />
              ))}
              {ctx.backlinks.map((title) => (
                <LinkChip
                  key={`back-${title.id}`}
                  note={title}
                  path={folderPathByNoteId.get(title.id) || undefined}
                  type="backlink"
                  onClick={() => onNoteSelect?.(title.id)}
                />
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-txt3">
              <code className="rounded bg-surface2/60 px-1.5 py-0.5 text-[11px] text-accent">[[노트명]]</code>
              {" "}으로 노트를 연결해보세요
            </p>
          )}
        </SideCard>

        {/* 4. AI 연결 제안 */}
        <SideCard
          title="AI 연결 제안"
          icon="sparkle"
          accent
          defaultOpen
          count={aiLinkSuggestionCount}
        >
          <div className="space-y-3" aria-live="polite">
            {showMockLinkSuggestions ? (
              <div>
                <p className="mb-2 text-[12px] leading-relaxed text-txt2">
                  데모 추천 주제입니다. 실제 Workspace 노트에서는 AI가 연결할 노트를 직접 찾습니다.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {mockLinkSuggestionLabels.map((label) => (
                    <span
                      key={label}
                      className="rounded-full border border-accent/30 px-2 py-0.5 text-[11px] font-medium text-accent"
                      style={{ background: "rgb(var(--accent) / 0.08)" }}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <button
              type="button"
              disabled={aiLinkButtonDisabled}
              onClick={handleCreateLinkSuggestions}
              className={cx(
                "flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-[12px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-55",
                aiLinkButtonDisabled
                  ? "border border-line/60 bg-surface2/60 text-txt3"
                  : "border border-accent/30 text-accent hover:border-accent/50 hover:bg-accent/10"
              )}
            >
              <Icon name={linkSuggestionStatus === "loading" ? "refresh" : "link"} size={12} className={linkSuggestionStatus === "loading" ? "animate-spin" : undefined} />
              {aiLinkButtonLabel}
            </button>

            {linkSuggestionDisabledReason ? (
              <p className="text-[11px] leading-5 text-txt3">{linkSuggestionDisabledReason}</p>
            ) : null}

            {linkSuggestionStatus === "error" ? (
              <div className="rounded-lg border border-primary/25 bg-primary/[0.08] p-2.5 text-[12px] leading-5 text-txt2">
                {linkSuggestionError ?? "AI 연결 추천 생성에 실패했습니다. 다시 시도해 주세요."}
              </div>
            ) : null}

            {linkSuggestionStatus === "success" && linkSuggestions.length === 0 && !showMockLinkSuggestions ? (
              <div className="rounded-lg border border-line/60 bg-surface2/40 p-3 text-center">
                <p className="text-[12px] font-semibold text-txt">새로 연결할 후보가 없습니다</p>
                <p className="mt-1 text-[11px] leading-5 text-txt3">
                  노트를 더 저장하거나 다른 노트에서 다시 실행해 보세요.
                </p>
              </div>
            ) : null}

            {linkSuggestions.length > 0 ? (
              <div className="space-y-2">
                {linkSuggestions.map((suggestion) => {
                  const key = activeNote ? linkSuggestionKey(activeNote.id, suggestion) : suggestion.suggestionId;
                  const acceptState = linkAcceptStates[key];
                  const acceptStatus = acceptState?.status ?? "idle";
                  const isSaving = acceptStatus === "saving";
                  const isSaved = acceptStatus === "saved";
                  const targetNote = allNotes.find((note) => note.id === suggestion.targetNoteId);
                  const title = suggestion.targetTitle || targetNote?.title || "연결 후보";
                  return (
                    <article
                      key={key}
                      className="rounded-lg border border-line/60 bg-surface2/40 p-3"
                    >
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-[12.5px] font-semibold text-txt">{title}</div>
                          <p className="mt-1 truncate text-[11px] text-txt3">
                            기준 문구: {suggestion.anchorText || "본문 위치"}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent tabular-nums">
                          {Math.round((suggestion.score ?? 0) * 100)}%
                        </span>
                      </div>

                      {suggestion.reason ? (
                        <p className="mt-2 max-h-20 overflow-y-auto break-words text-[12px] leading-5 text-txt2">
                          {suggestion.reason}
                        </p>
                      ) : null}

                      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line/50 pt-2.5">
                        <span
                          className={cx(
                            "min-w-0 truncate text-[11px]",
                            acceptStatus === "error" ? "text-primary" : "text-txt3"
                          )}
                        >
                          {isSaving
                            ? "본문 링크로 저장 중…"
                            : isSaved
                              ? "본문 링크로 저장됨"
                              : acceptStatus === "error"
                                ? acceptState.error
                                : "현재 노트 본문에 링크로 저장할 수 있습니다"}
                        </span>
                        <button
                          type="button"
                          disabled={isSaving || isSaved}
                          onClick={() => handleAcceptLinkSuggestion(suggestion)}
                          className={cx(
                            "inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-60",
                            isSaved
                              ? "bg-txt/10 text-txt"
                              : "bg-accent text-white hover:bg-accent/90"
                          )}
                        >
                          <Icon name={isSaving ? "refresh" : isSaved ? "check" : "plus"} size={12} className={isSaving ? "animate-spin" : undefined} />
                          {isSaving ? "저장 중" : isSaved ? "수락됨" : "수락"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}
          </div>
        </SideCard>
      </div>

      {/* ── 인라인 AI 채팅 (하단 고정) ─────────────── */}
      <div
        className="shrink-0 border-t border-line/70"
        style={{ background: "rgb(var(--surface))" }}
      >
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-valuemin={INLINE_AI_MIN_HEIGHT}
          aria-valuemax={clampInlineAiHeight(INLINE_AI_MAX_HEIGHT, sidebarHeight)}
          aria-valuenow={inlineAiHeight}
          tabIndex={0}
          onPointerDown={handleInlineAiResizePointerDown}
          onKeyDown={(event) => {
            if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === "Home"
              ? INLINE_AI_MIN_HEIGHT
              : event.key === "End"
                ? INLINE_AI_MAX_HEIGHT
                : inlineAiHeight + (event.key === "ArrowUp" ? 20 : -20);
            setClampedInlineAiHeight(next, true);
          }}
          className="group grid h-2 cursor-row-resize touch-none place-items-center outline-none"
          title="인라인 AI 높이 조절"
        >
          <span className="h-px w-10 rounded-full bg-line/70 transition-all group-hover:h-0.5 group-hover:bg-primary/60 group-focus-visible:h-0.5 group-focus-visible:bg-primary/70" />
        </div>
        {/* 채팅 헤더 */}
        <button
          type="button"
          onClick={() => setChatOpen((v) => !v)}
          className="flex w-full items-center gap-2 border-b border-line/40 px-4 py-2.5 transition-colors hover:bg-surface2/30"
        >
          <Icon name="chat" size={13} className="shrink-0 text-txt3" />
          <span className="flex-1 text-left text-[12px] font-semibold text-txt">인라인 AI</span>
          <CollapseChevron expanded={chatOpen} size={11} />
        </button>

        {chatOpen && (
          <div className="flex flex-col" style={{ height: inlineAiHeight }}>
            {/* 메시지 목록 */}
            <div className="no-scrollbar flex-1 space-y-2 overflow-y-auto p-3">
              {aiMessages.map((msg, i) => (
                <div
                  key={`${msg.role}-${i}`}
                  className={cx(
                    "rounded-xl px-3 py-2 text-[12px] leading-relaxed",
                    msg.role === "user"
                      ? "ml-6 text-txt"
                      : "mr-2 text-txt2"
                  )}
                  style={{
                    background: msg.role === "user"
                      ? "rgb(var(--primary) / 0.12)"
                      : "rgb(var(--surface2) / 0.6)",
                  }}
                >
                  {msg.role === "ai" ? (
                    <AiMarkdownMessage text={msg.text} streaming={msg.streaming} />
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.text}</span>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* 입력창 */}
            <div className="border-t border-line/40 p-2.5">
              <div className="mb-2 flex items-center gap-2">
                <div className="grid h-7 grid-cols-2 rounded-lg border border-line/60 bg-surface2/40 p-0.5">
                  {(["ask", "draft"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setInlineAiMode(mode)}
                      className={cx(
                        "min-w-12 rounded-md px-2 text-[11px] font-medium transition-colors",
                        inlineAiMode === mode
                          ? "bg-primary text-white"
                          : "text-txt3 hover:bg-surface2/70 hover:text-txt"
                      )}
                    >
                      {mode === "ask" ? "질문" : "작성"}
                    </button>
                  ))}
                </div>
                {inlineAiMode === "draft" ? (
                  <label className="flex min-w-0 items-center gap-1.5 text-[11px] text-txt3">
                    <span className="shrink-0">길이</span>
                    <input
                      type="number"
                      min={100}
                      max={3000}
                      step={50}
                      value={draftTargetLength}
                      onChange={(event) => setDraftTargetLength(Number(event.target.value))}
                      onBlur={() => setDraftTargetLength((value) => clampDraftTargetLength(value))}
                      className="h-7 w-20 rounded-md border border-line/60 bg-bg2 px-2 text-right text-[11px] text-txt outline-none focus:border-primary/50"
                    />
                  </label>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") sendAi(); }}
                  placeholder={
                    inlineAiMode === "draft"
                      ? "주제와 원하는 형식 입력…"
                      : `${activeNote.title.length > 10 ? activeNote.title.slice(0, 10) + "…" : activeNote.title}에 질문…`
                  }
                  className="h-8 flex-1 rounded-lg border border-line/70 px-2.5 text-[12px] text-txt outline-none placeholder:text-txt3 transition-colors focus:border-primary/50"
                  style={{ background: "rgb(var(--bg2))" }}
                />
                <button
                  type="button"
                  onClick={sendAi}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white transition-all hover:brightness-110 active:scale-95"
                  style={{ background: "rgb(var(--primary))" }}
                >
                  <Icon name="send" size={14} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}
