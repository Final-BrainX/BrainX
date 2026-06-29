"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { CollapseChevron } from "./CollapseChevron";
import { cx } from "@/lib/utils";
import { Icon } from "@/components/brainx-ui";
import { MockNote } from "@/lib/notes/noteTypes";
import { MOCK_CONTEXT_DATA } from "@/lib/notes/mockNotes";
import { createChatThread, sendChatMessageStream } from "@/lib/intelligence-api";
import { buildNoteAiContext, validateAiContextSufficiency } from "@/lib/ai-context";

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
  return content
    .split("\n")
    .map((line, index) => {
      const m = /^(#{1,3})\s+(.+)/.exec(line.trim());
      if (!m) return null;
      return { id: `h-${index}`, level: m[1].length, text: m[2].trim() };
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
  title,
  type,
}: {
  title: string;
  type: "outbound" | "backlink";
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-line/60 px-2.5 py-1.5 transition-colors hover:border-line/80 hover:bg-surface2/50"
      style={{ background: "rgb(var(--surface2) / 0.3)" }}
    >
      <Icon
        name={type === "outbound" ? "link" : "arrowL"}
        size={12}
        className={type === "outbound" ? "shrink-0 text-cyan" : "shrink-0 text-txt3"}
      />
      <span className="flex-1 truncate text-[12px] font-medium text-txt">{title}</span>
    </div>
  );
}

/* ── 메인 컴포넌트 ──────────────────────────────────── */
export interface PendingAiRequest {
  type: "summarize" | "rewrite";
  text: string;
  nonce: number;
}

const DEFAULT_DOCUMENT_GROUP_ID = "default";
const DEFAULT_CHAT_MODEL_ID = "gpt-5.4-mini";
const INLINE_AI_HEIGHT_KEY = "brainx_notes_inline_ai_height_v1";
const INLINE_AI_DEFAULT_HEIGHT = 260;
const INLINE_AI_MIN_HEIGHT = 180;
const INLINE_AI_MAX_HEIGHT = 640;
const INLINE_AI_TOP_RESERVE = 140;

function clampInlineAiHeight(height: number, sidebarHeight: number) {
  const measuredMax = sidebarHeight > 0 ? sidebarHeight - INLINE_AI_TOP_RESERVE : INLINE_AI_MAX_HEIGHT;
  const max = Math.max(INLINE_AI_MIN_HEIGHT, Math.min(INLINE_AI_MAX_HEIGHT, measuredMax));
  return Math.max(INLINE_AI_MIN_HEIGHT, Math.min(max, height));
}

interface Props {
  activeNote: MockNote | null;
  allNotes: MockNote[];
  onCollapse: () => void;
  pendingAiRequest?: PendingAiRequest | null;
  onAiRequestHandled?: () => void;
}

export default function RightSidebar({ activeNote, allNotes, onCollapse, pendingAiRequest, onAiRequestHandled }: Props) {
  const [activeTocId, setActiveTocId] = useState<string | null>(null);
  const [aiInput, setAiInput] = useState("");
  const [aiMessages, setAiMessages] = useState<Array<{ role: "ai" | "user"; text: string; streaming?: boolean }>>([
    { role: "ai", text: "이 노트에 대해 무엇이든 물어보세요. 관련 노트도 함께 찾아드려요." },
  ]);
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
  const chatThreadIdsRef = useRef<Record<string, string>>({});

  const toc = useMemo(() => (activeNote ? parseHeadings(activeNote.content) : []), [activeNote]);
  const ctx = (activeNote && MOCK_CONTEXT_DATA[activeNote.id]) || { backlinks: [], connections: [], aiSuggestions: [] };

  useEffect(() => {
    return () => {
      aiRequestAbortRef.current?.abort();
      if (aiMockTimerRef.current !== null) window.clearInterval(aiMockTimerRef.current);
    };
  }, []);

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

  const ensureNoteChatThread = async (note: MockNote) => {
    const existing = chatThreadIdsRef.current[note.id];
    if (existing) return existing;
    const created = await createChatThread({
      documentGroupId: DEFAULT_DOCUMENT_GROUP_ID,
      title: `${note.title} AI`,
      modelId: DEFAULT_CHAT_MODEL_ID,
    });
    chatThreadIdsRef.current[note.id] = created.threadId;
    return created.threadId;
  };

  const sendAi = async () => {
    if (!activeNote || !aiInput.trim()) return;
    const note = activeNote;
    const prompt = aiInput.trim();

    aiRequestAbortRef.current?.abort();
    aiRequestAbortRef.current = null;
    if (aiMockTimerRef.current !== null) {
      window.clearInterval(aiMockTimerRef.current);
      aiMockTimerRef.current = null;
    }

    setAiMessages((m) => [...m, { role: "user", text: prompt }]);
    setAiInput("");
    setAiMessages((m) => [...m, { role: "ai", text: "", streaming: true }]);

    const clientContext = buildNoteAiContext({
      task: "note.ask",
      surface: "RIGHT_SIDEBAR",
      documentGroupId: DEFAULT_DOCUMENT_GROUP_ID,
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
            documentGroupId: DEFAULT_DOCUMENT_GROUP_ID,
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
    }
  };

  /* 버블 툴바의 AI 버튼(요약/다시쓰기) → 인라인 AI 채팅에 응답 추가 */
  useEffect(() => {
    if (!pendingAiRequest || !activeNote) return;
    const { type, text } = pendingAiRequest;
    const selectedText = text.trim();
    const preview = selectedText ? (selectedText.length > 60 ? `${selectedText.slice(0, 60)}…` : selectedText) : "(선택된 텍스트 없음)";
    const label = type === "summarize" ? "선택한 텍스트 요약 요청" : "선택한 텍스트 다시쓰기 요청";

    aiRequestAbortRef.current?.abort();
    aiRequestAbortRef.current = null;
    if (aiMockTimerRef.current !== null) {
      window.clearInterval(aiMockTimerRef.current);
      aiMockTimerRef.current = null;
    }

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
        documentGroupId: DEFAULT_DOCUMENT_GROUP_ID,
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
              documentGroupId: DEFAULT_DOCUMENT_GROUP_ID,
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
                  onClick={() => setActiveTocId(h.id === activeTocId ? null : h.id)}
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

        {/* 2. 연결 · 백링크 */}
        <SideCard
          title="연결 · 백링크"
          icon="link"
          defaultOpen
          count={totalLinks}
        >
          {totalLinks > 0 ? (
            <div className="space-y-1.5">
              {ctx.connections.map((title) => (
                <LinkChip key={`out-${title}`} title={title} type="outbound" />
              ))}
              {ctx.backlinks.map((title) => (
                <LinkChip key={`back-${title}`} title={title} type="backlink" />
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-txt3">
              <code className="rounded bg-surface2/60 px-1.5 py-0.5 text-[11px] text-accent">[[노트명]]</code>
              {" "}으로 노트를 연결해보세요
            </p>
          )}
        </SideCard>

        {/* 3. AI 연결 제안 */}
        <SideCard
          title="AI 연결 제안"
          icon="sparkle"
          accent
          defaultOpen
          count={ctx.aiSuggestions.length}
        >
          {ctx.aiSuggestions.length > 0 ? (
            <>
              <p className="mb-2.5 text-[12px] leading-relaxed text-txt2">
                이 노트는{" "}
                <span className="font-semibold text-txt">「{ctx.aiSuggestions[0]}」</span>
                {ctx.aiSuggestions.length > 1 ? ` 외 ${ctx.aiSuggestions.length - 1}개 주제` : ""}와 강하게 연관돼요.
              </p>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {ctx.aiSuggestions.map((s) => (
                  <span
                    key={s}
                    className="rounded-full border border-accent/30 px-2 py-0.5 text-[11px] font-medium text-accent"
                    style={{ background: "rgb(var(--accent) / 0.08)" }}
                  >
                    {s}
                  </span>
                ))}
              </div>
              <button
                type="button"
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-accent/30 py-1.5 text-[12px] font-medium text-accent transition-colors hover:border-accent/50 hover:bg-accent/10"
              >
                <Icon name="link" size={12} />
                연결 추가
              </button>
            </>
          ) : (
            <p className="text-[12px] leading-relaxed text-txt2">
              분석 중입니다. 내용을 더 추가하면 연관 노트를 제안해드려요.
            </p>
          )}
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
            <div className="flex items-center gap-2 border-t border-line/40 p-2.5">
              <input
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") sendAi(); }}
                placeholder={`${activeNote.title.length > 10 ? activeNote.title.slice(0, 10) + "…" : activeNote.title}에 질문…`}
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
        )}
      </div>
      </>
      )}
    </div>
  );
}
