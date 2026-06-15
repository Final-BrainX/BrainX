"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { CLUSTERS, type ClusterId, createNoteSeed, noteById } from "@/lib/brainx-data";
import { countWords, safeFilename, stripMarkdown, cx } from "@/lib/utils";
import { useBrainX } from "@/components/brainx-provider";
import { Avatar, Badge, Btn, Card, EmptyState, Icon } from "@/components/brainx-ui";

function parseHeadings(markdown: string) {
  return markdown
    .split("\n")
    .map((line, index) => {
      const match = /^(#{1,3})\s+(.+)/.exec(line.trim());
      if (!match) return null;
      return {
        id: `${index}-${match[2].toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-")}`,
        level: match[1].length,
        text: match[2].trim()
      };
    })
    .filter((item): item is { id: string; level: number; text: string } => Boolean(item));
}

function parseWikiLinks(markdown: string) {
  const links = new Set<string>();
  const regex = /\[\[([^\]]+)\]\]/g;
  let match: RegExpExecArray | null = regex.exec(markdown);
  while (match) {
    const text = match[1].trim();
    if (text) links.add(text);
    match = regex.exec(markdown);
  }
  return [...links];
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function MarkdownToolbar({ onInsert }: { onInsert: (snippet: string) => void }) {
  const items = [
    { label: "H1", value: "# " },
    { label: "H2", value: "## " },
    { label: "•", value: "- " },
    { label: "☑", value: "- [ ] " },
    { label: "{}", value: "```\n\n```" },
    { label: "[[", value: "[[노트명]]" }
  ];

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line/60 bg-surface2/50 p-2">
      {items.map((item) => (
        <button key={item.label} type="button" onClick={() => onInsert(item.value)} className="grid h-8 min-w-8 place-items-center rounded-lg px-2 text-[13px] font-semibold text-txt2 hover:bg-surface2/70 hover:text-txt">
          {item.label}
        </button>
      ))}
    </div>
  );
}

function UploadModal({
  open,
  onClose,
  onPick
}: {
  open: boolean;
  onClose: () => void;
  onPick: (kind: "md" | "raw") => void;
}) {
  if (!open) return null;

  const options = [
    { key: "md" as const, icon: "rewrite" as const, title: "마크다운으로 변환", desc: "PDF · TXT · MD 파일의 내용을 BrainX 노트로 변환합니다." },
    { key: "raw" as const, icon: "doc" as const, title: "원본 파일로 유지", desc: "파일을 첨부파일로 그대로 보관합니다." }
  ];

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-6" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <Card glow className="fade-up relative w-full max-w-md p-6" onClick={(event) => event.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between">
          <h2 className="text-[18px] font-bold tracking-tight">파일을 어떻게 처리할까요?</h2>
          <button type="button" onClick={onClose} className="text-txt3 hover:text-txt">
            <Icon name="x" size={18} />
          </button>
        </div>
        <p className="mb-5 text-[13px] text-txt2">업로드한 파일의 처리 방식을 선택하세요.</p>
        <div className="space-y-2.5">
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => onPick(option.key)}
              className="flex w-full items-start gap-3.5 rounded-xl border border-line/40 bg-surface2/40 p-4 text-left transition-colors hover:border-primary/45"
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/14 text-primary">
                <Icon name={option.icon} size={19} />
              </div>
              <div>
                <div className="mb-0.5 text-[14px] font-semibold text-txt">{option.title}</div>
                <div className="text-[12.5px] leading-relaxed text-txt2">{option.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function NoteRow({
  id,
  active,
  indent,
  onSelect
}: {
  id: string;
  active: boolean;
  indent?: boolean;
  onSelect: (id: string) => void;
}) {
  const { notes } = useBrainX();
  const note = noteById(notes, id);
  if (!note) return null;
  const cluster = CLUSTERS.find((entry) => entry.id === (note.folderId || note.cluster)) ?? CLUSTERS[0];

  return (
    <button
      type="button"
      onClick={() => onSelect(note.id)}
      className={cx(
        "group relative flex h-8 w-full items-center gap-2 rounded-lg pr-2 text-left text-[13px] transition-colors",
        indent ? "pl-7" : "pl-2.5",
        active ? "bg-surface2/80 text-txt" : "text-txt2 hover:bg-surface2/50"
      )}
    >
      {active ? <span className="absolute left-0 -ml-0.5 h-4 w-0.5 rounded-r bg-gradient-to-b from-primary to-accent" /> : null}
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: `rgb(${cluster.color})` }} />
      <span className="flex-1 truncate">{note.title || "제목 없음"}</span>
      {note.isFavorite ? <Icon name="star" size={12} className="shrink-0 text-yellow-400" fill="currentColor" strokeWidth={0} /> : null}
    </button>
  );
}

export function NoteEditorScreen({ initialNoteId }: { initialNoteId: string }) {
  const router = useRouter();
  const { notes, createNote, updateNote, deleteNote, saveStatus, pushToast } = useBrainX();
  const [search, setSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiMessages, setAiMessages] = useState<Array<{ role: "ai" | "user"; text: string; streaming?: boolean }>>([
    { role: "ai", text: "이 노트에 대해 무엇이든 물어보세요. 관련 노트도 함께 찾아드려요." }
  ]);
  const [slashOpen, setSlashOpen] = useState(false);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const markdownRef = useRef<HTMLTextAreaElement | null>(null);
  const createdFor = useRef<string | null>(null);

  const selected = useMemo(() => notes.find((note) => note.id === initialNoteId) ?? null, [initialNoteId, notes]);
  const current = selected ?? notes[0] ?? null;

  useEffect(() => {
    if (initialNoteId === "new" && createdFor.current !== "new") {
      createdFor.current = "new";
      const next = createNote("proj");
      router.replace(`/notes/${next.id}`);
      window.setTimeout(() => titleRef.current?.focus(), 60);
      return;
    }
    if (initialNoteId !== "new") createdFor.current = null;
  }, [createNote, initialNoteId, router]);

  useEffect(() => {
    if (!selected && notes.length > 0 && initialNoteId !== "new") {
      router.replace(`/notes/${notes[0].id}`);
    }
  }, [initialNoteId, notes, router, selected]);

  const filteredNotes = useMemo(() => {
    if (!search.trim()) return notes;
    const needle = search.toLowerCase();
    return notes.filter((note) => `${note.title} ${note.markdown}`.toLowerCase().includes(needle));
  }, [notes, search]);

  const toc = useMemo(() => parseHeadings(current?.markdown ?? ""), [current?.markdown]);
  const wikiLinks = useMemo(() => parseWikiLinks(current?.markdown ?? ""), [current?.markdown]);
  const backlinks = useMemo(() => {
    if (!current) return [];
    return notes.filter((note) => note.id !== current.id && parseWikiLinks(note.markdown).includes(current.title));
  }, [current, notes]);

  const insertSnippet = (snippet: string) => {
    const textarea = markdownRef.current;
    const source = current?.markdown ?? "";
    if (!current || !textarea) return;
    const start = textarea.selectionStart ?? source.length;
    const end = textarea.selectionEnd ?? source.length;
    const next = `${source.slice(0, start)}${snippet}${source.slice(end)}`;
    updateNote(current.id, { markdown: next, links: parseWikiLinks(next) });
    window.requestAnimationFrame(() => {
      textarea.focus();
      const position = start + snippet.length;
      textarea.setSelectionRange(position, position);
    });
  };

  const handleTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!current) return;
    updateNote(current.id, { title: event.target.value });
  };

  const handleMarkdownChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    if (!current) return;
    const markdown = event.target.value;
    updateNote(current.id, { markdown, links: parseWikiLinks(markdown) });
  };

  const sendAi = () => {
    if (!aiInput.trim()) return;
    const prompt = aiInput;
    setAiMessages((messages) => [...messages, { role: "user", text: prompt }]);
    setAiInput("");
    setAiMessages((messages) => [...messages, { role: "ai", text: "", streaming: true }]);

    const answer = `이 노트의 내용과 「RAG 파이프라인」 노트의 검색 단계가 연결돼요.\n\n1. 청킹 전략은 컨텍스트 품질에 직접 영향이 있고\n2. 재순위화는 정확도를 끌어올리며\n3. 출처 강제는 환각을 줄입니다.\n\n이제 두 노트를 함께 보면 핵심 구조가 더 선명해집니다.`;
    let index = 0;
    const interval = window.setInterval(() => {
      index += 3;
      setAiMessages((messages) => {
        const next = [...messages];
        next[next.length - 1] = { role: "ai", text: answer.slice(0, index), streaming: index < answer.length };
        return next;
      });
      if (index >= answer.length) {
        window.clearInterval(interval);
      }
    }, 16);
  };

  const handleUploadChoice = (kind: "md" | "raw") => {
    setUploadOpen(false);
    if (kind === "md" && current) {
      updateNote(current.id, {
        markdown: "## 가져온 문서\n\n업로드한 파일이 마크다운으로 변환되었습니다. (mock)",
        links: []
      });
      pushToast("파일을 마크다운 노트로 변환했어요", "ok");
    } else {
      pushToast("원본 파일을 첨부로 보관했어요", "ok");
    }
  };

  const exportNote = (kind: "md" | "txt" | "pdf" | "share") => {
    if (!current) return;
    const safe = safeFilename(current.title || "무제");
    if (kind === "md") {
      const blob = new Blob([`# ${current.title}\n\n${current.markdown}`], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safe}.md`;
      link.click();
      URL.revokeObjectURL(url);
      pushToast("MD 파일을 내보냈어요", "ok");
    } else if (kind === "txt") {
      const blob = new Blob([`${current.title}\n\n${stripMarkdown(current.markdown)}`], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safe}.txt`;
      link.click();
      URL.revokeObjectURL(url);
      pushToast("TXT 파일을 내보냈어요", "ok");
    } else if (kind === "pdf") {
      pushToast("PDF 내보내기 준비 중입니다");
    } else if (kind === "share") {
      const url = `${window.location.origin}/share?id=${current.id}`;
      navigator.clipboard?.writeText(url).catch(() => null);
      pushToast("공유 링크를 복사했어요 · 30일 유효", "ok");
    }
  };

  const removeNote = () => {
    if (!current) return;
    deleteNote(current.id);
    pushToast("노트를 삭제했어요");
    router.push("/home");
  };

  if (!notes.length) {
    return (
      <div data-route className="grid h-full place-items-center">
        <EmptyState icon="notes" title="아직 노트가 없습니다" desc="새 노트를 만들어 지식 기록을 시작해보세요." action={<Btn variant="primary" size="lg" icon="plus" onClick={() => router.push("/notes/new")}>새 노트 만들기</Btn>} />
      </div>
    );
  }

  if (!current) {
    return (
      <div data-route className="grid h-full place-items-center">
        <EmptyState icon="notes" title="노트를 찾을 수 없습니다" desc="다른 노트를 선택하거나 새 노트를 만들어보세요." action={<Btn variant="primary" size="lg" icon="plus" onClick={() => router.push("/notes/new")}>새 노트 만들기</Btn>} />
      </div>
    );
  }

  const folder = CLUSTERS.find((cluster) => cluster.id === (current.folderId || current.cluster)) ?? CLUSTERS[0];
  const saveLabel = {
    saving: { label: "저장 중…", color: "text-txt3", icon: "refresh" as const, spin: true },
    saved: { label: "저장됨", color: "text-cyan", icon: "check" as const, spin: false },
    error: { label: "저장 실패", color: "text-pink-400", icon: "x" as const, spin: false }
  }[saveStatus];

  return (
    <div data-route className="flex h-full">
      <div className="hidden w-60 shrink-0 flex-col border-r border-line/50 bg-bg2/30 md:flex">
        <div className="space-y-2 border-b border-line/50 p-3">
          <Btn variant="primary" size="sm" icon="plus" className="w-full" onClick={() => router.push("/notes/new")}>
            새 노트
          </Btn>
          <div className="flex h-9 items-center gap-2 rounded-lg border border-line/50 bg-surface2/50 px-2.5 focus-within:border-primary/50">
            <Icon name="search" size={15} className="text-txt3" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="노트 검색" className="flex-1 bg-transparent text-[13px] text-txt outline-none placeholder:text-txt3" />
          </div>
        </div>

        <div className="scroll flex-1 overflow-y-auto p-2">
          {search.trim() ? (
            filteredNotes.length ? (
              filteredNotes.map((note) => <NoteRow key={note.id} id={note.id} active={note.id === current.id} onSelect={(id) => router.push(`/notes/${id}`)} />)
            ) : (
              <p className="px-3 py-6 text-center text-[12px] text-txt3">검색 결과가 없어요</p>
            )
          ) : (
            CLUSTERS.map((cluster) => {
              const clusterNotes = notes.filter((note) => (note.folderId || note.cluster) === cluster.id);
              if (!clusterNotes.length) return null;
              return (
                <div key={cluster.id} className="mb-1">
                  <div className="flex h-8 items-center gap-2 px-2 text-[12px] text-txt3">
                    <Icon name="folder" size={14} />
                    <span className="flex-1">{cluster.label}</span>
                    <span className="font-mono">{clusterNotes.length}</span>
                  </div>
                  {clusterNotes.map((note) => (
                    <NoteRow key={note.id} id={note.id} active={note.id === current.id} indent onSelect={(id) => router.push(`/notes/${id}`)} />
                  ))}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-line/50 px-5 py-2.5">
          <div className={cx("flex items-center gap-1.5 text-[12px]", saveLabel.color)}>
            <Icon name={saveLabel.icon} size={14} className={cx(saveLabel.spin ? "animate-spin" : "")} />
            {saveLabel.label}
          </div>
          <div className="flex-1" />
          <button type="button" onClick={() => setUploadOpen(true)} className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] text-txt2 hover:bg-surface2/60 hover:text-txt">
            <Icon name="upload" size={14} />
            업로드
          </button>
          {(
            [
              ["pdf", "PDF"],
              ["txt", "TXT"],
              ["md", "MD"]
            ] as const
          ).map(([kind, label]) => (
            <button key={kind} type="button" onClick={() => exportNote(kind)} className="h-8 rounded-lg px-2.5 text-[12px] text-txt2 hover:bg-surface2/60 hover:text-txt">
              {label}
            </button>
          ))}
          <Btn variant="soft" size="sm" icon="globe" onClick={() => exportNote("share")}>
            공유 링크
          </Btn>
          <button type="button" onClick={removeNote} className="grid h-8 w-8 place-items-center rounded-lg text-txt2 hover:bg-surface2/60 hover:text-pink-400" title="삭제">
            <Icon name="trash" size={15} />
          </button>
        </div>

        <div className="scroll flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-8 py-10">
            <input
              ref={titleRef}
              value={current.title}
              onChange={handleTitleChange}
              placeholder="제목 없는 노트"
              className="mb-3 w-full bg-transparent text-[32px] font-bold tracking-tight text-txt outline-none placeholder:text-txt3/50"
            />
            <div className="mb-6 flex items-center gap-2 text-[12px] text-txt3">
              <Badge color={folder.color} dot className="!h-6">
                {folder.label}
              </Badge>
              <span>·</span>
              <span>{current.updated || "방금"} 수정</span>
              <span>·</span>
              <span>{countWords(current.markdown)} 단어</span>
            </div>

            <MarkdownToolbar onInsert={insertSnippet} />

            <textarea
              ref={markdownRef}
              value={current.markdown}
              onChange={handleMarkdownChange}
              onKeyDown={(event) => {
                if (event.key === "/" && !event.metaKey && !event.ctrlKey) {
                  setSlashOpen(true);
                }
                if (event.key === "Escape") {
                  setSlashOpen(false);
                }
              }}
              onFocus={() => setSlashOpen(false)}
              placeholder="여기에 입력하세요.  ‘/’ 를 눌러 명령어를, [[ ]] 로 다른 노트를 연결하세요."
              spellCheck="false"
              className="min-h-[52vh] w-full resize-none bg-transparent text-[15px] leading-[1.85] text-txt2 outline-none placeholder:text-txt3/60"
              style={{ whiteSpace: "pre-wrap" }}
            />

            <div className="mt-3 rounded-xl border border-line/60 bg-surface2/50 p-3 text-[13px] text-txt2">
              <span className="font-semibold text-txt">/</span> 명령어: 요약, 체크리스트, 코드블록, AI로 이어쓰기
            </div>
          </div>
        </div>
      </div>

      <div className="hidden w-72 shrink-0 flex-col border-l border-line/50 bg-bg2/30 lg:flex">
        <div className="scroll flex-1 space-y-5 overflow-y-auto p-4">
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-txt3">
              <Icon name="summarize" size={13} />
              목차
            </div>
            <div className="space-y-0.5">
              {toc.length ? (
                toc.map((heading) => (
                  <div
                    key={heading.id}
                    style={{ paddingLeft: (heading.level - 1) * 12 + 8 }}
                    className="flex h-7 cursor-pointer items-center truncate rounded-lg pr-2 text-[12.5px] text-txt2 hover:bg-surface2/50 hover:text-primary"
                  >
                    {heading.text}
                  </div>
                ))
              ) : (
                <p className="px-2 text-[12px] text-txt3"># 으로 제목을 추가하면 목차가 생겨요</p>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-txt3">
              <Icon name="link" size={13} />
              연결 · 백링크
            </div>
            <div className="space-y-1.5">
              {wikiLinks.map((title) => {
                const linked = notes.find((note) => note.title === title);
                return (
                  <button
                    key={title}
                    type="button"
                    onClick={() => linked && router.push(`/notes/${linked.id}`)}
                    className="flex w-full items-center gap-2 rounded-lg bg-surface2/40 p-2.5 text-left transition-colors hover:bg-surface2/70"
                  >
                    <Icon name="link" size={13} className="shrink-0 text-cyan" />
                    <span className="flex-1 truncate text-[12.5px] font-medium text-txt">{title}</span>
                    {!linked ? <span className="text-[10px] text-txt3">새로 만들기</span> : null}
                  </button>
                );
              })}
              {backlinks.map((backlink) => (
                <button key={backlink.id} type="button" onClick={() => router.push(`/notes/${backlink.id}`)} className="w-full rounded-lg bg-surface2/40 p-2.5 text-left transition-colors hover:bg-surface2/70">
                  <div className="flex items-center gap-1.5 truncate text-[12.5px] font-medium text-txt">
                    <Icon name="arrowL" size={12} className="text-txt3" />
                    {backlink.title}
                  </div>
                </button>
              ))}
              {!wikiLinks.length && !backlinks.length ? <p className="px-2 text-[12px] text-txt3">[[노트명]] 으로 다른 노트를 연결해보세요</p> : null}
            </div>
          </div>

          <div className="rounded-xl border border-accent/20 bg-accent/[0.07] p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-accent">
              <Icon name="sparkle" size={13} />
              AI 연결 제안
            </div>
            <p className="mb-2.5 text-[12.5px] leading-relaxed text-txt2">
              이 노트는 <b className="text-txt">「벡터 데이터베이스 비교」</b>와 강하게 연관돼요.
            </p>
            <Btn variant="soft" size="sm" icon="link" className="w-full" onClick={() => pushToast("새 연결을 추가했어요", "ok")}>
              연결 추가
            </Btn>
          </div>
        </div>

        <div className="flex h-[40%] flex-col border-t border-line/50">
          <div className="flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-semibold text-txt3">
            <Icon name="chat" size={13} />
            인라인 AI
          </div>
          <div className="scroll flex-1 space-y-2.5 overflow-y-auto px-3">
            {aiMessages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={cx("rounded-xl p-2.5 text-[12.5px] leading-relaxed", message.role === "user" ? "ml-6 bg-primary/15 text-txt" : "mr-2 bg-surface2/50 text-txt2")}>
                <span className={message.streaming ? "stream-caret" : ""}>{message.text}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 p-3">
            <input
              value={aiInput}
              onChange={(event) => setAiInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") sendAi();
              }}
              placeholder="이 노트에 질문…"
              className="h-9 flex-1 rounded-lg border border-line/50 bg-surface2/60 px-3 text-[12.5px] text-txt outline-none placeholder:text-txt3 focus:border-primary/50"
            />
            <button type="button" onClick={sendAi} className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-white hover:brightness-110">
              <Icon name="send" size={15} />
            </button>
          </div>
        </div>
      </div>

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onPick={handleUploadChoice} />

      {slashOpen ? (
        <div className="fade-up fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="glass w-[480px] rounded-xl p-1.5 shadow-soft">
            <div className="px-2 py-1 text-[10.5px] uppercase tracking-wide text-txt3">블록</div>
            {[
              { icon: "summarize" as const, label: "제목 1", ins: "# " },
              { icon: "summarize" as const, label: "제목 2", ins: "## " },
              { icon: "notes" as const, label: "체크리스트", ins: "- [ ] " },
              { icon: "doc" as const, label: "인용", ins: "> " },
              { icon: "bolt" as const, label: "코드 블록", ins: "```\n\n```" }
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  insertSnippet(item.ins);
                  setSlashOpen(false);
                }}
                className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[13px] text-txt2 hover:bg-surface2/60 hover:text-txt"
              >
                <Icon name={item.icon} size={15} className="text-txt3" />
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
