"use client";

import type { ReactNode } from "react";
import { FilePlus, FolderOpen } from "lucide-react";
import { Icon } from "@/components/brainx-ui";
import { cx } from "@/lib/utils";

interface StartRowProps {
  icon: ReactNode;
  label: string;
  description: string;
  shortcut?: string;
  onClick: () => void;
}

function StartRow({ icon, label, description, shortcut, onClick }: StartRowProps) {
  return (
    <button
      type="button"
      draggable={false}
      onClick={onClick}
      className={cx(
        "group flex w-full select-none items-center gap-3 rounded-xl border border-line/50 px-4 py-3.5 text-left transition-all",
        "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
      )}
      style={{ background: "rgb(var(--surface))" }}
    >
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-primary transition-colors group-hover:bg-primary/15"
        style={{ background: "rgb(var(--primary) / 0.1)" }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-txt">{label}</span>
        <span className="block text-[11px] text-txt3">{description}</span>
      </span>
      {shortcut && (
        <kbd
          className="shrink-0 rounded border border-line/50 px-1.5 py-0.5 text-[10px] font-medium text-txt3"
          style={{ background: "rgb(var(--surface2) / 0.6)" }}
        >
          {shortcut}
        </kbd>
      )}
    </button>
  );
}

interface Props {
  /** 즉시 새 노트를 생성하고 편집 모드로 활성 탭에 연다 */
  onCreateNote: () => void;
  /** 노트 탐색기와 동일한 역할의 Quick Switcher를 열어 기존 노트를 선택해서 연다 */
  onGoToFile: () => void;
}

/** 빈 시작 화면(Welcome) — 탭이 아니라 "열린 노트가 없음"을 나타내는 empty state다. 노트
    클릭/드롭/새 노트 생성 중 어떤 경로로든 패널에 탭이 하나라도 생기면 이 화면은 사라진다.
    EditorPanel에서는 탭이 있지만 그 노트를 찾을 수 없을 때(삭제된 노트 등) 복구용으로도 쓴다. */
export default function EmptyNoteStartPage({ onCreateNote, onGoToFile }: Props) {
  return (
    <div className="flex h-full flex-1 items-center justify-center" style={{ background: "rgb(var(--surface))" }}>
      <div className="w-full max-w-[380px] space-y-6 px-6">
        <div className="flex flex-col items-center gap-2.5 text-center">
          <span
            className="grid h-12 w-12 place-items-center rounded-2xl"
            style={{ background: "rgb(var(--primary) / 0.12)" }}
          >
            <Icon name="sparkle" size={22} className="text-primary" />
          </span>
          <h2 className="text-[15px] font-bold text-txt">BrainX 노트에 오신 것을 환영합니다</h2>
          <p className="text-[12px] leading-relaxed text-txt3">
            새 노트를 작성하거나 기존 노트를 불러와 이어서 작성해보세요.
          </p>
        </div>

        <div className="space-y-2">
          <StartRow
            icon={<FilePlus size={16} />}
            label="새 노트 생성하기"
            description="빈 노트를 만들고 바로 작성을 시작해요"
            onClick={onCreateNote}
          />
          <StartRow
            icon={<FolderOpen size={16} />}
            label="기존 노트 불러오기"
            description="노트를 검색해서 선택하면 이 탭에서 열려요"
            onClick={onGoToFile}
          />
        </div>
      </div>
    </div>
  );
}
