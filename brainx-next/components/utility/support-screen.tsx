"use client";

import { useMemo, useState } from "react";

import { useBrainX } from "@/components/brainx-provider";

import { Badge, Btn, Card, EmptyState, Icon } from "@/components/brainx-ui";

import { SectionCard } from "@/components/utility/utility-shared";

const FAQ_ITEMS = [
  {
    id: "faq-1",
    question: "공유 링크는 얼마나 유지되나요?",
    answer: "기본 공유 링크는 30일 동안 유효합니다. 만료 전에는 링크를 다시 생성할 수 있고, 읽기 전용으로 유지됩니다."
  },
  {
    id: "faq-2",
    question: "노트가 사라졌다고 느껴질 때는 어떻게 하나요?",
    answer: "대부분은 필터나 검색 결과 때문입니다. 최근 노트, 즐겨찾기, 검색어를 확인하고 그래도 없으면 지원 티켓을 남겨주세요."
  },
  {
    id: "faq-3",
    question: "PDF 가져오기가 느린 이유는 무엇인가요?",
    answer: "문서 구조 분석과 요약, 링크 복원 단계가 순차적으로 진행되기 때문입니다. 큰 파일은 분할 업로드를 권장합니다."
  },
  {
    id: "faq-4",
    question: "AI 답변이 애매할 때는 어떻게 개선하나요?",
    answer: "더 구체적인 질문, 관련 노트 연결, 출처 강제 프롬프트를 사용하면 검색 품질이 안정됩니다."
  }
] as const;

const SUPPORT_CHANNELS = [
  { name: "이메일", value: "help@brainx.app", desc: "24시간 이내 응답", icon: "bell" as const },
  { name: "문서", value: "docs.brainx.app", desc: "가이드·FAQ·릴리즈 노트", icon: "doc" as const },
  { name: "운영 상태", value: "모든 시스템 정상", desc: "최근 장애 없음", icon: "shield" as const }
] as const;

export function SupportScreen() {
  const { pushToast } = useBrainX();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string>("faq-1");
  const [category, setCategory] = useState("계정");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const filteredFaq = useMemo(
    () =>
      FAQ_ITEMS.filter(
        (item) =>
          !query.trim() ||
          item.question.toLowerCase().includes(query.toLowerCase()) ||
          item.answer.toLowerCase().includes(query.toLowerCase())
      ),
    [query]
  );

  return (
    <div data-route className="mx-auto max-w-[1180px] px-6 py-7 md:px-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge color="34 211 238" dot className="mb-2.5">
            지원 · 도움말
          </Badge>
          <h1 className="text-[27px] font-bold tracking-tight">지원 센터</h1>
          <p className="mt-1.5 max-w-2xl text-[14px] text-txt2">FAQ, 문의, 상태를 한 곳에 모아둔 mock 지원 화면입니다.</p>
        </div>
        <Btn variant="primary" icon="chat" onClick={() => pushToast("상담 요청을 접수했어요", "ok")}>
          상담 요청
        </Btn>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="grid gap-4">
          <SectionCard title="자주 묻는 질문" sub="검색어로 FAQ를 좁혀볼 수 있습니다.">
            <label className="mb-4 block">
              <div className="mb-1.5 text-[12px] font-medium text-txt2">질문 검색</div>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="예: 공유 링크, PDF, 환각"
                className="h-11 w-full rounded-xl border border-line/60 bg-surface2/50 px-3.5 text-[14px] text-txt outline-none focus:border-primary/60"
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
                    <div className="text-[14px] font-medium text-txt">{item.question}</div>
                    <Icon name={open === item.id ? "chevD" : "chevR"} size={16} className="text-txt3" />
                  </div>
                  {open === item.id ? <div className="mt-2 text-[13px] leading-relaxed text-txt2">{item.answer}</div> : null}
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
                    <div className="text-[13px] font-medium text-txt">{channel.name}</div>
                    <div className="truncate text-[11.5px] text-txt3">{channel.value}</div>
                  </div>
                  <Badge>{channel.desc}</Badge>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <div className="grid gap-4">
          <SectionCard title="문의 작성" sub="문의는 실제 전송되지 않고 토스트로만 기록됩니다.">
            <div className="space-y-3">
              <label className="block">
                <div className="mb-1.5 text-[12px] font-medium text-txt2">카테고리</div>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="h-11 w-full rounded-xl border border-line/60 bg-surface2/50 px-3.5 text-[14px] text-txt outline-none"
                >
                  {["계정", "결제", "가져오기", "버그", "기능 요청"].map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <div className="mb-1.5 text-[12px] font-medium text-txt2">제목</div>
                <input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="예: 공유 링크가 열리지 않아요"
                  className="h-11 w-full rounded-xl border border-line/60 bg-surface2/50 px-3.5 text-[14px] text-txt outline-none focus:border-primary/60"
                />
              </label>
              <label className="block">
                <div className="mb-1.5 text-[12px] font-medium text-txt2">내용</div>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={6}
                  placeholder="문제가 재현되는 과정을 적어주세요."
                  className="w-full rounded-xl border border-line/60 bg-surface2/50 px-3.5 py-3 text-[14px] text-txt outline-none focus:border-primary/60"
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
                    <div className="text-[13px] font-medium text-txt">{ticket.title}</div>
                    <div className="text-[11.5px] text-txt3">답변 예정: 24시간 이내</div>
                  </div>
                  <Badge color={ticket.tone} dot>{ticket.state}</Badge>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
