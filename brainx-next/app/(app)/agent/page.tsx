"use client";

import dynamic from "next/dynamic";

const AgentScreen = dynamic(
  () => import("@/components/agent-screen").then((mod) => mod.AgentScreen),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full place-items-center text-[13px] text-txt3">
        Agent를 불러오는 중...
      </div>
    ),
  }
);

export default function AgentPage() {
  return <AgentScreen />;
}
