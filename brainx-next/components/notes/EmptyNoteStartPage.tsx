"use client";

import type { ReactElement } from "react";
import { FilePlus, FolderOpen } from "lucide-react";
import { Icon } from "@/components/brainx-ui";
import { cx } from "@/lib/utils";

interface StartRowProps {
  icon: ReactElement;
  label: string;
  description: string;
  onClick: () => void;
}

function StartRow({ icon, label, description, onClick }: StartRowProps) {
  return (
    <button
      type="button"
      draggable={false}
      onClick={onClick}
      className={cx(
        "group flex w-full select-none items-center gap-3 rounded-2xl border border-line/50 px-4 py-4 text-left transition-all",
        "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
      )}
      style={{ background: "rgb(var(--surface))" }}
    >
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-primary transition-colors group-hover:bg-primary/15"
        style={{ background: "rgb(var(--primary) / 0.1)" }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-txt">{label}</span>
        <span className="block text-[12px] leading-6 text-txt3">{description}</span>
      </span>
    </button>
  );
}

interface Props {
  onCreateNote: () => void;
  onGoToFile: () => void;
}

export default function EmptyNoteStartPage({ onCreateNote, onGoToFile }: Props) {
  return (
    <div className="flex h-full flex-1 items-center justify-center bg-bg px-6 py-8">
      <div className="w-full max-w-[470px] space-y-7 px-2">
        <div className="flex flex-col items-center gap-3 text-center">
          <span
            className="grid h-16 w-16 place-items-center rounded-[22px]"
            style={{ background: "rgb(var(--primary) / 0.12)" }}
          >
            <Icon name="sparkle" size={24} className="text-primary" />
          </span>
          <h2 className="text-[28px] font-bold tracking-tight text-txt">아직 노트가 비어있어요</h2>
          <p className="max-w-[560px] text-[15px] leading-7 text-txt2">
            첫 노트를 작성하면 AI 연결과 그래프 탐색이 자연스럽게 이어집니다.
          </p>
        </div>

        <div className="space-y-3">
          <StartRow
            icon={<FilePlus size={18} />}
            label="새 노트 생성하기"
            description="빈 노트를 만들고 바로 작성을 시작해요"
            onClick={onCreateNote}
          />
          <StartRow
            icon={<FolderOpen size={18} />}
            label="기존 노트 불러오기"
            description="노트를 검색해서 선택하면 이 탭에서 열려요"
            onClick={onGoToFile}
          />
        </div>
      </div>
    </div>
  );
}
