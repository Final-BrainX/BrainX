import { Icon } from "@/components/brainx-ui";
import type { ChatModelOption } from "@/components/chat/types";
import { cx } from "@/lib/utils";

type ChatHeaderProps = {
  activeTitle: string;
  activeThreadArchived: boolean;
  streaming: boolean;
  model: ChatModelOption;
  models: ChatModelOption[];
  modelOpen: boolean;
  onToggleModelOpen: () => void;
  onCloseModelMenu: () => void;
  onSelectModel: (model: ChatModelOption) => void;
};

export function ChatHeader({
  activeTitle,
  activeThreadArchived,
  streaming,
  model,
  models,
  modelOpen,
  onToggleModelOpen,
  onCloseModelMenu,
  onSelectModel,
}: ChatHeaderProps) {
  return (
    <div className="flex h-14 items-center gap-3 border-b border-line/50 px-5">
      <div className="flex items-center gap-2 text-[16px] font-semibold">
        <Icon name="chat" size={17} className="text-primary" />내 노트 기반 AI 챗
      </div>
      <div className="min-w-0 truncate text-[14px] text-txt3">
        {activeTitle}
      </div>
      {activeThreadArchived ? (
        <span className="rounded-full border border-line/60 bg-surface2/70 px-2 py-1 text-[12px] font-semibold text-txt3">
          보관됨
        </span>
      ) : null}
      <div className="flex-1" />
      <div className="relative">
        <button
          type="button"
          disabled={streaming}
          onClick={onToggleModelOpen}
          className="flex h-[34px] items-center gap-2 rounded-xl border border-line/60 bg-surface/60 px-3 text-[14px] hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="h-2 w-2 rounded-full bg-cyan" />
          {model.name}
          <Icon name="chevD" size={14} className="text-txt3" />
        </button>
        {modelOpen ? (
          <div
            className="fade-up glass absolute right-0 top-11 z-50 w-56 rounded-xl p-1.5 shadow-soft"
            onMouseLeave={onCloseModelMenu}
          >
            {models.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectModel(item)}
                className={cx(
                  "flex h-10 w-full items-center justify-between rounded-lg px-3 text-left",
                  model.id === item.id ? "bg-surface2/70" : "hover:bg-surface2/50",
                )}
              >
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-medium text-txt">
                    {item.name}
                  </div>
                  <div className="truncate text-[13px] text-txt3">
                    {item.sub}
                  </div>
                </div>
                {model.id === item.id ? (
                  <Icon name="check" size={15} className="text-primary" />
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
