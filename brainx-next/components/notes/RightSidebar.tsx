"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { ChevronRight } from "lucide-react";
import { CollapseChevron } from "./CollapseChevron";
import { cx } from "@/lib/utils";
import { Icon } from "@/components/brainx-ui";
import { MockNote } from "@/lib/notes/noteTypes";
import { MOCK_CONTEXT_DATA } from "@/lib/notes/mockNotes";
import { createInlineAssistStream } from "@/lib/intelligence-api";

/* ── 헤딩 파싱 ─────────────────────────────────────── */
function parseHeadings(content: string) {
  return content
    .split("\n")
    .map((line, index) => {
      const m = /^(#{1,3})\s+(.+)/.exec(line.trim());
      if (!m) return null;
      return { id: `h-${index}`, level: m[1].length, text: m[2].trim() };
    })
    .filter((x): x is { id: string; level: number; text: string } => Boolean(x));
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
      className="overflow-hidden rounded-xl border border-line/50"
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
      className="flex items-center gap-2 rounded-lg border border-line/40 px-2.5 py-1.5 transition-colors hover:border-line/70 hover:bg-surface2/50"
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
  const chatEndRef = useRef<HTMLDivElement>(null);

  const toc = useMemo(() => (activeNote ? parseHeadings(activeNote.content) : []), [activeNote]);
  const ctx = (activeNote && MOCK_CONTEXT_DATA[activeNote.id]) || { backlinks: [], connections: [], aiSuggestions: [] };

  const sendAi = () => {
    if (!activeNote || !aiInput.trim()) return;
    const prompt = aiInput.trim();
    setAiMessages((m) => [...m, { role: "user", text: prompt }]);
    setAiInput("");

    const answer = ctx.aiSuggestions.length > 0
      ? `「${activeNote.title}」 노트를 분석했습니다.\n\n${ctx.aiSuggestions.slice(0, 2).join(", ")} 등의 개념과 연결하면 더 풍부한 지식 체계가 만들어져요.`
      : `「${activeNote.title}」 노트를 분석했습니다. 내용을 더 추가하면 연관 노트를 찾아드릴 수 있어요.`;

    setAiMessages((m) => [...m, { role: "ai", text: "", streaming: true }]);
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
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }, 16);
  };

  /* 버블 툴바의 AI 버튼(요약/다시쓰기) → 인라인 AI 채팅에 응답 추가 */
  useEffect(() => {
    if (!pendingAiRequest || !activeNote) return;
    const { type, text } = pendingAiRequest;
    const selectedText = text.trim();
    const preview = selectedText ? (selectedText.length > 60 ? `${selectedText.slice(0, 60)}…` : selectedText) : "(선택된 텍스트 없음)";
    const label = type === "summarize" ? "선택한 텍스트 요약 요청" : "선택한 텍스트 다시쓰기 요청";

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
      const controller = new AbortController();
      let streamedText = "";

      createInlineAssistStream(
        {
          noteId: activeNote.id,
          selectedText,
          contextBefore: "",
          contextAfter: "",
          action: "SUMMARIZE",
          language: "ko",
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
      )
        .then((done) => {
          if (!done) throw new Error("AI 요약 완료 이벤트를 받지 못했습니다.");
          setAiMessages((m) => {
            const next = [...m];
            next[next.length - 1] = { role: "ai", text: streamedText || "요약 결과가 비어 있습니다.", streaming: false };
            return next;
          });
          chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          const message = error instanceof Error ? error.message : "AI 요약 요청에 실패했습니다.";
          setAiMessages((m) => {
            const next = [...m];
            next[next.length - 1] = { role: "ai", text: message, streaming: false };
            return next;
          });
        });

      onAiRequestHandled?.();
      return () => controller.abort();
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
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }, 16);
    onAiRequestHandled?.();
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAiRequest?.nonce]);

  const totalLinks = ctx.connections.length + ctx.backlinks.length;

  return (
    <div
      className="flex h-full w-full min-w-0 flex-col border-l border-line/50"
      style={{ background: "rgb(var(--bg2))" }}
    >
      {/* ── 패널 헤더 ──────────────────────────────── */}
      <div
        className="flex items-center gap-2 border-b border-line/50 px-4 py-3"
        style={{ background: "rgb(var(--surface))" }}
      >
        <Icon name="sparkle" size={14} className="shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold text-txt">{activeNote?.title ?? "노트 없음"}</p>
          <p className="text-[10px] text-txt3">컨텍스트 패널</p>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          title="패널 닫기"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-txt3 transition-colors hover:bg-surface2/70 hover:text-txt"
        >
          <ChevronRight size={14} />
        </button>
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
      <div className="scroll-thin flex-1 space-y-2.5 overflow-y-auto p-3">

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
        className="shrink-0 border-t border-line/50"
        style={{ background: "rgb(var(--surface))" }}
      >
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
          <div className="flex flex-col" style={{ height: "200px" }}>
            {/* 메시지 목록 */}
            <div className="scroll-thin flex-1 space-y-2 overflow-y-auto p-3">
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
                  <span className={cx("whitespace-pre-wrap", msg.streaming ? "stream-caret" : "")}>{msg.text}</span>
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
                className="h-8 flex-1 rounded-lg border border-line/50 px-2.5 text-[12px] text-txt outline-none placeholder:text-txt3 transition-colors focus:border-primary/50"
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
