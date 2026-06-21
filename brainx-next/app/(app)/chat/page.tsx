"use client";

import dynamic from "next/dynamic";

const ChatScreen = dynamic(
  () => import("@/components/chat-screen").then((mod) => mod.ChatScreen),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full place-items-center text-[13px] text-txt3">
        AI 챗을 불러오는 중...
      </div>
    ),
  }
);

export default function ChatPage() {
  return <ChatScreen />;
}
