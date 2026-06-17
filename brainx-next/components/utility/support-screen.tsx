"use client";

import { useEffect, useMemo, useState } from "react";

import { useBrainX } from "@/components/brainx-provider";
import { Badge, Btn, EmptyState, Icon } from "@/components/brainx-ui";
import { SectionCard } from "@/components/utility/utility-shared";
import { createSupportInquiry, getMySupportInquiries, type SupportInquiry } from "@/lib/support-api";
import { cx } from "@/lib/utils";

const CATEGORIES = ["기능 문의", "버그 신고", "결제/환불", "계정", "기타"] as const;

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  RECEIVED: { label: "접수", color: "99 102 241" },
  IN_PROGRESS: { label: "처리 중", color: "234 179 8" },
  ANSWERED: { label: "답변 완료", color: "34 197 94" },
  CLOSED: { label: "종료", color: "148 163 184" }
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function SupportScreen() {
  const { pushToast } = useBrainX();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("기능 문의");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [inquiries, setInquiries] = useState<SupportInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return inquiries;
    return inquiries.filter((item) => `${item.category} ${item.title} ${item.content}`.toLowerCase().includes(keyword));
  }, [inquiries, query]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getMySupportInquiries()
      .then((data) => {
        if (active) setInquiries(data);
      })
      .catch((error) => pushToast(error instanceof Error ? error.message : "문의 내역을 불러오지 못했습니다.", "err"))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [pushToast]);

  const submitInquiry = async () => {
    const nextTitle = title.trim();
    const nextContent = content.trim();
    if (!nextTitle || !nextContent) {
      pushToast("제목과 내용을 입력해 주세요.", "err");
      return;
    }

    setSubmitting(true);
    try {
      const created = await createSupportInquiry({ category, title: nextTitle, content: nextContent });
      setInquiries((current) => [created, ...current]);
      setTitle("");
      setContent("");
      pushToast("문의가 접수되었습니다.", "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "문의 접수에 실패했습니다.", "err");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div data-route className="mx-auto max-w-[1180px] px-6 py-7 md:px-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge color="99 102 241" dot className="mb-2.5">
            고객 지원
          </Badge>
<<<<<<< HEAD
          <h1 className="text-[27px] font-bold tracking-tight text-txt">문의하기</h1>
          <p className="mt-1.5 max-w-2xl text-[14px] text-txt2">문의 작성과 처리 상태를 한 곳에서 확인하세요.</p>
=======
          <h1 className="text-[29px] font-bold tracking-tight">지원 센터</h1>
          <p className="mt-1.5 max-w-2xl text-[16px] text-txt2">FAQ, 문의, 상태를 한 곳에 모아둔 mock 지원 화면입니다.</p>
>>>>>>> 4a3f3ce90ebe3972ec6a16e6c3f125625c33e8bb
        </div>
      </div>

<<<<<<< HEAD
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="문의 작성" sub="접수된 문의는 내 문의 내역에 바로 반영됩니다.">
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-[12px] font-medium text-txt2">문의 유형</div>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCategory(item)}
                    className={cx(
                      "h-9 rounded-full border px-4 text-[13px] font-medium transition-colors",
                      category === item ? "border-primary bg-primary text-white" : "border-line/60 bg-surface2/40 text-txt2 hover:text-txt"
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <div className="mb-1.5 text-[12px] font-medium text-txt2">제목</div>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={120}
                placeholder="문의 제목을 입력하세요"
                className="h-11 w-full rounded-xl border border-line/60 bg-surface2/50 px-3.5 text-[14px] text-txt outline-none focus:border-primary/60"
              />
            </label>

            <label className="block">
              <div className="mb-1.5 text-[12px] font-medium text-txt2">내용</div>
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={9}
                maxLength={10000}
                placeholder="문제가 발생한 상황이나 요청 내용을 자세히 적어 주세요."
                className="w-full resize-none rounded-xl border border-line/60 bg-surface2/50 px-3.5 py-3 text-[14px] text-txt outline-none focus:border-primary/60"
              />
            </label>
=======
      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="grid gap-4">
          <SectionCard title="자주 묻는 질문" sub="검색어로 FAQ를 좁혀볼 수 있습니다.">
            <label className="mb-4 block">
              <div className="mb-1.5 text-[14px] font-medium text-txt2">질문 검색</div>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="예: 공유 링크, PDF, 환각"
                className="h-11 w-full rounded-xl border border-line/60 bg-surface2/50 px-3.5 text-[16px] text-txt outline-none focus:border-primary/60"
              />
            </label>
            <div className="space-y-2">
              {filteredFaq.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setOpen((current) => (current === item.id ? "" : item.id))}
                  className="w-full rounded-xl border border-line/50 bg-surface2/40 p-4 text-left transition-colors hover:border-primary/35"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[16px] font-medium text-txt">{item.question}</div>
                    <Icon name={open === item.id ? "chevD" : "chevR"} size={16} className="text-txt3" />
                  </div>
                  {open === item.id ? <div className="mt-2 text-[15px] leading-relaxed text-txt2">{item.answer}</div> : null}
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="지원 채널" sub="운영 상태와 응답 기대치를 안내합니다.">
            <div className="space-y-2.5">
              {SUPPORT_CHANNELS.map((channel) => (
                <div key={channel.name} className="flex items-center gap-3 rounded-xl bg-surface2/40 px-3 py-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/14 text-primary">
                    <Icon name={channel.icon} size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-medium text-txt">{channel.name}</div>
                    <div className="truncate text-[13.5px] text-txt3">{channel.value}</div>
                  </div>
                  <Badge>{channel.desc}</Badge>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
>>>>>>> 4a3f3ce90ebe3972ec6a16e6c3f125625c33e8bb

            <Btn variant="primary" icon="send" className="w-full" disabled={submitting} onClick={submitInquiry}>
              {submitting ? "접수 중" : "문의 접수"}
            </Btn>
          </div>
        </SectionCard>

        <SectionCard
          title="내 문의 내역"
          sub="최근 접수된 문의부터 표시됩니다."
          action={
            <div className="relative">
              <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt3" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="검색"
                className="h-9 w-44 rounded-xl border border-line/60 bg-surface2/40 pl-9 pr-3 text-[13px] text-txt outline-none focus:border-primary/60"
              />
            </div>
          }
        >
          {loading ? (
            <div className="grid min-h-[320px] place-items-center text-[13px] text-txt3">문의 내역을 불러오는 중입니다.</div>
          ) : filtered.length ? (
            <div className="space-y-3">
<<<<<<< HEAD
              {filtered.map((item) => {
                const status = STATUS_LABEL[item.status] ?? STATUS_LABEL.RECEIVED;
                return (
                  <article key={item.inquiryId} className="rounded-xl border border-line/60 bg-surface2/35 p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <Badge>{item.category}</Badge>
                          <span className="text-[11.5px] text-txt3">{formatDate(item.createdAt)}</span>
                        </div>
                        <h2 className="truncate text-[15px] font-semibold text-txt">{item.title}</h2>
                      </div>
                      <Badge color={status.color} dot>{status.label}</Badge>
                    </div>
                    <p className="line-clamp-3 whitespace-pre-wrap text-[13px] leading-relaxed text-txt2">{item.content}</p>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState icon="chat" title="문의 내역이 없습니다" desc="궁금한 점이나 문제가 생기면 문의를 남겨 주세요." />
          )}
        </SectionCard>
=======
              <label className="block">
                <div className="mb-1.5 text-[14px] font-medium text-txt2">카테고리</div>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="h-11 w-full rounded-xl border border-line/60 bg-surface2/50 px-3.5 text-[16px] text-txt outline-none"
                >
                  {["계정", "결제", "가져오기", "버그", "기능 요청"].map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <div className="mb-1.5 text-[14px] font-medium text-txt2">제목</div>
                <input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="예: 공유 링크가 열리지 않아요"
                  className="h-11 w-full rounded-xl border border-line/60 bg-surface2/50 px-3.5 text-[16px] text-txt outline-none focus:border-primary/60"
                />
              </label>
              <label className="block">
                <div className="mb-1.5 text-[14px] font-medium text-txt2">내용</div>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={6}
                  placeholder="문제가 재현되는 과정을 적어주세요."
                  className="w-full rounded-xl border border-line/60 bg-surface2/50 px-3.5 py-3 text-[16px] text-txt outline-none focus:border-primary/60"
                />
              </label>
              <div className="flex gap-2">
                <Btn
                  variant="primary"
                  icon="send"
                  className="flex-1"
                  onClick={() => {
                    if (!subject.trim() || !message.trim()) {
                      pushToast("제목과 내용을 먼저 입력하세요");
                      return;
                    }
                    pushToast(`${category} 문의를 접수했어요`, "ok");
                    setSubject("");
                    setMessage("");
                  }}
                >
                  보내기
                </Btn>
                <Btn variant="soft" icon="copy" onClick={() => pushToast("문의 양식을 복사했어요")}>
                  복사
                </Btn>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="진행 중인 티켓" sub="지원 흐름을 설명하는 목업 데이터입니다.">
            <div className="space-y-2.5">
              {[
                { title: "PDF 가져오기 지연", state: "해결 중", tone: "234 179 8" },
                { title: "공유 링크 만료 시점", state: "안내 완료", tone: "34 211 238" },
                { title: "모바일 편집 버그", state: "검토 중", tone: "244 114 182" }
              ].map((ticket) => (
                <div key={ticket.title} className="flex items-center justify-between rounded-xl bg-surface2/40 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-[15px] font-medium text-txt">{ticket.title}</div>
                    <div className="text-[13.5px] text-txt3">답변 예정: 24시간 이내</div>
                  </div>
                  <Badge color={ticket.tone} dot>{ticket.state}</Badge>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
>>>>>>> 4a3f3ce90ebe3972ec6a16e6c3f125625c33e8bb
      </div>
    </div>
  );
}
