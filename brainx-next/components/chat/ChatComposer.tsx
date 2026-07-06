"use client";

import { useLayoutEffect, useRef } from "react";
import { Icon } from "@/components/brainx-ui";

type ChatComposerProps = {
  input: string;
  disabled: boolean;
  activeThreadArchived: boolean;
  modelName: string;
  onInputChange: (value: string) => void;
  onSubmit: (question: string) => void;
};

export function ChatComposer({
  input,
  disabled,
  activeThreadArchived,
  modelName,
  onInputChange,
  onSubmit,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [input]);

  return (
    <div className="border-t border-line/50 p-4">
      <div className="mx-auto max-w-2xl">
        <div className="card flex items-end gap-2 rounded-2xl p-2 transition-colors focus-within:border-primary/50">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            rows={1}
            disabled={disabled}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSubmit(input);
              }
            }}
            placeholder={
              activeThreadArchived
                ? "보관된 대화는 보관 해제 후 이어서 쓸 수 있습니다."
                : "내 노트에게 질문하기…  (Shift+Enter 줄바꿈)"
            }
            className="scroll max-h-[min(240px,32svh)] min-h-10 flex-1 resize-none overflow-y-auto bg-transparent px-2 py-2 text-[15.5px] leading-6 text-txt outline-none placeholder:text-[15px] placeholder:text-txt3 disabled:cursor-wait"
          />
          <button
            type="button"
            onClick={() => onSubmit(input)}
            disabled={!input.trim() || disabled}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-white hover:brightness-110 disabled:opacity-40"
            aria-label="메시지 보내기"
          >
            <Icon name="send" size={17} />
          </button>
        </div>
        <p className="mt-2 text-center text-[13px] text-txt3">
          {activeThreadArchived
            ? "보관된 대화입니다. 보관 해제 후 새 메시지를 보낼 수 있습니다."
            : `BrainX는 당신의 노트를 근거로 답합니다 · ${modelName}`}
        </p>
      </div>
    </div>
  );
}
