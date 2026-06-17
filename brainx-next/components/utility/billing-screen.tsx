"use client";

import { useMemo, useState } from "react";

import { PRICING } from "@/lib/brainx-data";

import { cx } from "@/lib/utils";

import { useBrainX } from "@/components/brainx-provider";

import { Badge, Btn, Card, Icon, RelevanceBar, SectionHead, ThemeToggle, Toggle } from "@/components/brainx-ui";

import { SectionCard, Stat } from "@/components/utility/utility-shared";

const INVOICES = [
  { id: "inv-1", date: "2026-06-01", plan: "Free", amount: "₩0", status: "납부 완료" },
  { id: "inv-2", date: "2026-05-01", plan: "Free", amount: "₩0", status: "납부 완료" },
  { id: "inv-3", date: "2026-04-01", plan: "Free", amount: "₩0", status: "납부 완료" }
] as const;

export function BillingScreen() {
  const { notes, pushToast } = useBrainX();
  const [annual, setAnnual] = useState(true);

  const usage = useMemo(
    () => [
      { label: "AI 토큰", value: 64 },
      { label: "저장 용량", value: 28 },
      { label: "공유 링크", value: 18 }
    ],
    []
  );

  return (
    <div data-route className="mx-auto max-w-[1180px] px-6 py-7 md:px-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge color="234 179 8" dot className="mb-2.5">
            플랜 · 결제
          </Badge>
          <h1 className="text-[29px] font-bold tracking-tight">요금제와 사용량</h1>
          <p className="mt-1.5 max-w-2xl text-[16px] text-txt2">
            현재는 mock 결제 화면이며, 실제 결제는 연결되어 있지 않습니다. 노트 수와 사용량을 기준으로 플랜을 살펴봅니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <div className="inline-flex items-center rounded-xl border border-line/60 bg-surface2/50 p-1">
            <button type="button" onClick={() => setAnnual(false)} className={cx("h-9 rounded-lg px-4 text-[15px]", annual ? "text-txt2" : "bg-surface text-txt")}>
              월간
            </button>
            <button type="button" onClick={() => setAnnual(true)} className={cx("h-9 rounded-lg px-4 text-[15px]", annual ? "bg-surface text-txt" : "text-txt2")}>
              연간 <span className="ml-1 text-[13px] text-cyan">-20%</span>
            </button>
          </div>
        </div>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Stat label="노트 수" value={String(notes.length)} desc="현재 저장된 문서" icon="doc" color="59 130 246" />
        <Stat label="AI 연결" value={String(notes.reduce((sum, note) => sum + note.links.length, 0))} desc="노트 간 그래프" icon="link" color="139 92 246" />
        <Stat label="오늘 사용" value="12.8K" desc="추정 토큰 사용량" icon="bolt" color="34 211 238" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
        <Card className="p-5">
          <SectionHead icon="bill" title="플랜 선택" sub="월간/연간 요금을 전환해 비교합니다." />
          <div className="grid gap-4 xl:grid-cols-3">
            {PRICING.map((plan) => {
              const price = annual ? plan.yr : plan.price;
              return (
                <Card key={plan.id} glow={plan.best} className={cx("relative p-5", plan.best && "border-primary/50")}>
                  {plan.best ? <Badge color="59 130 246" className="absolute -top-3 left-1/2 -translate-x-1/2">추천</Badge> : null}
                  <div className="mb-1 text-[17px] font-semibold text-txt2">{plan.name}</div>
                  <div className="mb-1 flex items-end gap-1">
                    <span className="text-[32px] font-bold tracking-tight text-txt">₩{price.toLocaleString()}</span>
                    <span className="mb-1.5 text-[16px] text-txt3">/월</span>
                  </div>
                  <p className="mb-4 text-[14.5px] text-txt3">{plan.tag}</p>
                  <Btn
                    variant={plan.best ? "primary" : "soft"}
                    className="mb-4 w-full"
                    onClick={() => pushToast(`${plan.name} 플랜을 선택했어요`, "ok")}
                  >
                    {plan.cta}
                  </Btn>
                  <ul className="space-y-2">
                    {plan.feats.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-[14.5px] text-txt2">
                        <Icon name="check" size={14} className="mt-0.5 shrink-0 text-cyan" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>
        </Card>

        <div className="grid gap-4">
          <SectionCard title="사용량" sub="현재 로컬 워크스페이스 기준의 추정치입니다.">
            <div className="space-y-3">
              {usage.map((item) => (
                <div key={item.label}>
                  <div className="mb-1.5 flex items-center justify-between text-[14px] text-txt2">
                    <span>{item.label}</span>
                    <span className="font-mono text-txt3">{item.value}%</span>
                  </div>
                  <RelevanceBar value={item.value} />
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="최근 청구서" sub="결제는 연결되어 있지 않으므로 모의 기록만 표시합니다.">
            <div className="space-y-2.5">
              {INVOICES.map((invoice) => (
                <div key={invoice.id} className="flex items-center gap-3 rounded-xl border border-line/50 bg-surface2/40 px-3 py-2.5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/14 text-primary">
                    <Icon name="bill" size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-medium text-txt">{invoice.date}</div>
                    <div className="text-[13.5px] text-txt3">{invoice.plan} · {invoice.status}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[15px] font-semibold text-txt">{invoice.amount}</div>
                    <div className="text-[13px] text-txt3">세금계산서</div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
