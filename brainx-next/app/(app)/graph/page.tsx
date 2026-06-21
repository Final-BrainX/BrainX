"use client";

import dynamic from "next/dynamic";

const GraphScreen = dynamic(
  () => import("@/components/graph-screen").then((mod) => mod.GraphScreen),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full place-items-center text-[13px] text-txt3">
        그래프를 불러오는 중...
      </div>
    ),
  }
);

export default function GraphPage() {
  return <GraphScreen />;
}
