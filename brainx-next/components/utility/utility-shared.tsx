"use client";

import { type ReactNode } from "react";

import { Card, Icon } from "@/components/brainx-ui";

export type WorkspacePreferences = {
  autoTag: boolean;
  semanticSearch: boolean;
  aiSummaries: boolean;
  shareLinks: boolean;
  emailDigest: boolean;
  compactMode: boolean;
};

export const SETTINGS_KEY = "brainx_settings_v1";

export const ADMIN_FLAGS = [
  { key: "semanticSearch", label: "의미 기반 검색", desc: "벡터 검색과 재순위화" },
  { key: "shareLinks", label: "공유 링크", desc: "외부 접근 허용" },
  { key: "aiSummaries", label: "AI 요약", desc: "저장 시 자동 요약" },
  { key: "autoTag", label: "자동 태깅", desc: "클러스터 추천" }
] as const;

export function readPreferences(): WorkspacePreferences {
  if (typeof window === "undefined") {
    return {
      autoTag: true,
      semanticSearch: true,
      aiSummaries: true,
      shareLinks: true,
      emailDigest: false,
      compactMode: false
    };
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) throw new Error("missing");
    const parsed = JSON.parse(raw) as Partial<WorkspacePreferences>;
    return {
      autoTag: parsed.autoTag ?? true,
      semanticSearch: parsed.semanticSearch ?? true,
      aiSummaries: parsed.aiSummaries ?? true,
      shareLinks: parsed.shareLinks ?? true,
      emailDigest: parsed.emailDigest ?? false,
      compactMode: parsed.compactMode ?? false
    };
  } catch {
    return {
      autoTag: true,
      semanticSearch: true,
      aiSummaries: true,
      shareLinks: true,
      emailDigest: false,
      compactMode: false
    };
  }
}

export function SectionCard({
  title,
  sub,
  children,
  action
}: {
  title: string;
  sub?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-semibold text-txt">{title}</h2>
          {sub ? <p className="mt-1 text-[14px] text-txt3">{sub}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

export function Stat({
  label,
  value,
  desc,
  icon,
  color
}: {
  label: string;
  value: string;
  desc: string;
  icon: Parameters<typeof Icon>[0]["name"];
  color: string;
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: `rgb(${color} / 0.14)`, color: `rgb(${color})` }}>
        <Icon name={icon} size={20} />
      </div>
      <div>
        <div className="text-[23px] font-bold leading-none tracking-tight text-txt">{value}</div>
        <div className="mt-1 text-[14px] font-medium text-txt2">{label}</div>
        <div className="mt-1 text-[13px] text-txt3">{desc}</div>
      </div>
    </Card>
  );
}
