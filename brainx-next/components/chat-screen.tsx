"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Compass, PencilLine, Sparkles } from "lucide-react";
import { CHAT_SESSIONS, MODELS, noteById, clusterById, type BrainXNote } from "@/lib/brainx-data";
import { useBrainX } from "@/components/brainx-provider";
import { Avatar, Badge, Btn, Card, Icon, RelevanceBar } from "@/components/brainx-ui";
import { cx } from "@/lib/utils";

function renderText(text: string) {
  return text.split("\n").map((line, index) => {
    if (!line.trim()) return <div key={index} className="h-2" />;
    const html = line.replace(/\*\*(.+?)\*\*/g, '<b class="text-txt font-semibold">$1</b>');
    return <p key={index} className="text-[16.5px] leading-[1.75] text-txt2" dangerouslySetInnerHTML={{ __html: html }} />;
  });
}

export function ChatScreen() {
  const router = useRouter();
  const { pushToast, notes } = useBrainX();
  const [sessions] = useState(CHAT_SESSIONS);
  const [active, setActive] = useState("new");
  const [model, setModel] = useState(MODELS[0]);
  const [modelOpen, setModelOpen] = useState(false);
  type SourceNote = BrainXNote;
  const [messages, setMessages] = useState<Array<{ role: "ai" | "user"; text: string; streaming?: boolean; sources?: SourceNote[] }>>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const suggestions = [
    "Transformer 어텐션을 한 문단으로 설명해줘",
    "내 RAG 노트 기준으로 검색 품질 높이는 법",
    "이번 주에 새로 연결된 노트는?"
  ];

  const ask = (question: string) => {
    if (!question.trim() || streaming) return;
    setMessages((current) => [...current, { role: "user", text: question }]);
    setInput("");
    setStreaming(true);

    const sources: SourceNote[] = [noteById(notes, "n2"), noteById(notes, "n1"), noteById(notes, "n12")].filter(
      (item): item is SourceNote => Boolean(item)
    );
    const answer = `검색 품질을 높이는 핵심은 세 가지예요.\n\n1. **청킹 전략** — 너무 큰 청크는 노이즈를, 너무 작은 청크는 맥락 손실을 부릅니다.\n2. **재순위화(Re-ranking)** — 1차 벡터 검색 결과를 cross-encoder로 다시 정렬하면 정확도가 크게 오릅니다.\n3. **출처 강제** — 프롬프트에 "근거 노트를 인용하라"를 넣으면 환각이 줄어듭니다.\n\n이 내용은 아래 노트들을 근거로 정리했어요.`;

    setMessages((current) => [...current, { role: "ai", text: "", streaming: true, sources }]);
    let index = 0;
    const interval = window.setInterval(() => {
      index += 3;
      setMessages((current) => {
        const next = [...current];
        next[next.length - 1] = { ...next[next.length - 1], text: answer.slice(0, index), streaming: index < answer.length };
        return next;
      });
      if (index >= answer.length) {
        window.clearInterval(interval);
        setStreaming(false);
      }
    }, 16);
  };

  const selectedSession = useMemo(() => sessions.find((session) => session.id === active) ?? null, [active, sessions]);

  return (
    <div data-route className="flex h-full">
      <div className="flex w-60 shrink-0 flex-col border-r border-line/50 bg-bg2/30">
        <div className="p-3">
          <Btn
            variant="primary"
            size="md"
            icon="plus"
            className="w-full"
            onClick={() => {
              setActive("new");
              setMessages([]);
            }}
          >
            새 대화
          </Btn>
        </div>
        <div className="scroll flex-1 overflow-y-auto px-2">
          <div className="px-2 py-1.5 text-[12px] font-semibold text-txt3">최근 대화</div>
          {sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              onClick={() => setActive(session.id)}
              className={cx("mb-1 w-full rounded-xl p-2.5 text-left", active === session.id ? "bg-surface2/80" : "hover:bg-surface2/50")}
            >
              <div className="truncate text-[15px] font-medium text-txt">{session.title}</div>
              <div className="mt-0.5 truncate text-[13px] text-txt3">{session.preview}</div>
              <div className="mt-1 text-[12.5px] text-txt3">{session.when}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center gap-3 border-b border-line/50 px-5">
          <div className="flex items-center gap-2 text-[16px] font-semibold">
            <Icon name="chat" size={17} className="text-primary" />
            내 노트 기반 AI 챗
          </div>
          <div className="text-[14px] text-txt3">{selectedSession?.title ?? "새 대화"}</div>
          <div className="flex-1" />
          <div className="relative">
            <button
              type="button"
              onClick={() => setModelOpen((current) => !current)}
              className="flex h-[34px] items-center gap-2 rounded-xl border border-line/60 bg-surface/60 px-3 text-[14px] hover:border-primary/50"
            >
              <span className="h-2 w-2 rounded-full bg-cyan" />
              {model.name}
              <Icon name="chevD" size={14} className="text-txt3" />
            </button>
            {modelOpen ? (
              <div className="fade-up glass absolute right-0 top-11 z-50 w-52 rounded-xl p-1.5 shadow-soft" onMouseLeave={() => setModelOpen(false)}>
                {MODELS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setModel(item);
                      setModelOpen(false);
                    }}
                    className={cx("flex h-10 w-full items-center justify-between rounded-lg px-3 text-left", model.id === item.id ? "bg-surface2/70" : "hover:bg-surface2/50")}
                  >
                    <div>
                      <div className="text-[15px] font-medium text-txt">{item.name}</div>
                      <div className="text-[13px] text-txt3">{item.sub}</div>
                    </div>
                    {model.id === item.id ? <Icon name="check" size={15} className="text-primary" /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div ref={scrollRef} className="scroll flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="mx-auto flex h-full max-w-[860px] flex-col items-center justify-center px-6 py-10 text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[22px] border border-primary/15 bg-white/75 shadow-[0_10px_30px_rgba(108,99,216,0.12)]">
                <Icon name="brain" size={24} className="text-primary" />
              </div>
              <h2 className="text-[28px] font-bold tracking-tight text-txt">내 노트를 기반으로 질문해보세요</h2>
              <p className="mt-2 max-w-[560px] text-[15px] leading-7 text-txt2">
                BrainX는 노트에 적힌 맥락을 근거로 답하고, 필요한 경우 관련 출처를 함께 보여줍니다.
              </p>
              <div className="mt-7 grid w-full gap-3 md:grid-cols-3">
                {[
                  { step: "1", label: "노트 작성", desc: "먼저 생각을 적어두면 AI가 연결을 더 잘 이해해요.", icon: PencilLine, tone: "from-[#EFEAFF] to-[#F7F5FF]", accent: "text-[#6C63D8]" },
                  { step: "2", label: "AI 연결", desc: "관련 노트와 문맥을 함께 읽으며 답을 풍부하게 만들어요.", icon: Sparkles, tone: "from-[#EAF8F2] to-[#F5FBF8]", accent: "text-[#4BC3AC]" },
                  { step: "3", label: "그래프 탐색", desc: "대화로 찾은 주제를 그래프에서 더 넓게 살펴보세요.", icon: Compass, tone: "from-[#EAF1FF] to-[#F5F8FF]", accent: "text-[#5BA8F0]" }
                ].map((item) => (
                  <button
                    key={item.step}
                    type="button"
                    onClick={() => ask(suggestions[0] ?? "내 노트의 핵심 흐름을 정리해줘")}
                    className="group relative overflow-hidden rounded-2xl border border-line/60 bg-white/85 p-5 text-left shadow-[0_12px_30px_rgba(15,23,42,0.05)] transition-all hover:-translate-y-0.5 hover:border-primary/25"
                  >
                    <span className={`absolute -right-1 top-1 text-[56px] font-extrabold leading-none ${item.accent} opacity-[0.08]`}>
                      {item.step}
                    </span>
                    <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${item.tone} ${item.accent}`}>
                      <item.icon size={18} />
                    </div>
                    <div className="text-[13px] font-semibold text-txt">{item.label}</div>
                    <p className="mt-1.5 min-h-[44px] text-[12px] leading-6 text-txt2">{item.desc}</p>
                    <div className="mt-3 text-[12px] font-medium text-primary">바로 보기</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-2xl space-y-6 px-5 py-6">
              {messages.map((message, index) => (
                <div key={index} className={cx("flex gap-3", message.role === "user" ? "flex-row-reverse" : "")}>
                  {message.role === "ai" ? (
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent">
                      <Icon name="brain" size={17} className="text-white" />
                    </div>
                  ) : (
                    <Avatar name="연우" size={32} />
                  )}
                  <div className={cx("min-w-0 flex flex-col", message.role === "user" ? "items-end" : "")}>
                    <div className={cx("rounded-2xl px-4 py-3", message.role === "user" ? "bg-primary text-white" : "card")}>
                      {message.role === "user" ? (
                        <p className="text-[16.5px] leading-relaxed">{message.text}</p>
                      ) : (
                        <div className={message.streaming ? "stream-caret" : ""}>{renderText(message.text)}</div>
                      )}
                    </div>
                    {message.role === "ai" && message.sources && !message.streaming ? (
                      <div className="mt-2.5 w-full">
                        <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-txt3">
                          <Icon name="link" size={12} />
                          근거 노트 {message.sources.length}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {message.sources.map((source, sourceIndex) => (
                            <button key={source.id} type="button" onClick={() => router.push(`/notes/${source.id}`)} className="card flex items-center gap-2 rounded-xl px-3 h-9 hover:border-primary/45 transition-colors">
                              <span className="h-2 w-2 rounded-full" style={{ background: `rgb(${clusterById(source.cluster).color})` }} />
                              <span className="max-w-[160px] truncate text-[14.5px] text-txt2">{source.title}</span>
                              <span className="text-[12px] font-mono text-txt3">[{sourceIndex + 1}]</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-line/50 p-4">
          <div className="mx-auto max-w-2xl">
            <div className="card flex items-end gap-2 rounded-2xl p-2 focus-within:border-primary/50 transition-colors">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={1}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    ask(input);
                  }
                }}
                placeholder="내 노트에게 질문하기…  (Shift+Enter 줄바꿈)"
                className="max-h-32 flex-1 resize-none bg-transparent px-2 py-2 text-[15.5px] text-txt outline-none placeholder:text-[15px] placeholder:text-txt3"
              />
              <button type="button" onClick={() => ask(input)} disabled={!input.trim() || streaming} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-white hover:brightness-110 disabled:opacity-40">
                <Icon name="send" size={17} />
              </button>
            </div>
            <p className="mt-2 text-center text-[13px] text-txt3">
              BrainX는 당신의 노트만 근거로 답합니다 · {model.name}
            </p>
          </div>
        </div>
      </div>

      <div className="hidden w-72 shrink-0 flex-col border-l border-line/50 bg-bg2/30 lg:flex">
        <div className="flex items-center gap-2 border-b border-line/50 p-4 text-[15px] font-semibold text-txt2">
          <Icon name="doc" size={15} />
          참조·유사 노트
        </div>
        <div className="scroll flex-1 space-y-2.5 overflow-y-auto p-3">
          <div className="px-1 text-[13px] text-txt3">이 대화와 관련도 높은 노트</div>
          {[
            { note: noteById(notes, "n2"), relevance: 96 },
            { note: noteById(notes, "n3"), relevance: 84 },
            { note: noteById(notes, "n12"), relevance: 79 },
            { note: noteById(notes, "n1"), relevance: 71 }
          ].map((item) => {
            const note = item.note;
            if (!note) return null;
            return (
              <button key={note.id} type="button" onClick={() => router.push(`/notes/${note.id}`)} className="card w-full rounded-xl p-3 text-left hover:border-primary/45 transition-colors">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: `rgb(${clusterById(note.cluster).color})` }} />
                  <span className="flex-1 truncate text-[15px] font-medium text-txt">{note.title}</span>
                </div>
                <p className="mb-2 line-clamp-2 text-[13.5px] text-txt3">{note.summary}</p>
                <RelevanceBar value={item.relevance} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
