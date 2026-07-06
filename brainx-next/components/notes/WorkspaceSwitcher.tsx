"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import { getWorkspaceDisplayName } from "@/lib/workspace-api";
import { Icon } from "@/components/brainx-ui";
import { cx } from "@/lib/utils";

interface Props {
  onCreateWorkspace: () => void;
}

/** Ticket12.5: 기존 Workspace 목록에서 다른 Workspace로 수동 전환하는 selector.
    switchWorkspace()는 Context의 currentWorkspaceId만 바꾼다 — Home/Notes가 이 값을 구독해
    실제로 데이터를 다시 그리는 로직은 Ticket13/14가 담당하므로 여기서는 다루지 않는다.
    Guest는 Workspace 자체가 없으므로(useWorkspace().workspaces가 항상 빈 배열) 이 컴포넌트는
    TopBar에서 로그인 사용자에게만 마운트된다.

    버튼/드롭다운 모두 고정폭(w-56)을 써서 Workspace 이름 길이와 무관하게 폭이 변하지 않게 한다 —
    이전 max-w 방식은 이름 길이에 따라 버튼 폭 자체가 늘었다 줄었다 해서 오른쪽 테마/알림/프로필
    버튼이 밀리는 원인이었다. Workspace 생성 진입점(구 TopBar "+" 버튼)도 이 드롭다운 안으로
    옮겨왔다 — 실제 생성 로직(CreateWorkspaceModal)은 부모(workspace-shell.tsx)가 그대로 갖고
    있고, 이 컴포넌트는 열기 요청(onCreateWorkspace)만 위로 전달한다. */
export default function WorkspaceSwitcher({ onCreateWorkspace }: Props) {
  const { workspaces, currentWorkspaceId, switchWorkspace, isLoading } = useWorkspace();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const currentWorkspace = workspaces.find((workspace) => workspace.documentGroupId === currentWorkspaceId) ?? null;
  const isInitialLoading = isLoading && workspaces.length === 0;
  const buttonLabel = isInitialLoading ? "불러오는 중…" : currentWorkspace ? getWorkspaceDisplayName(currentWorkspace) : "Workspace";

  return (
    <div ref={rootRef} className="relative w-56 shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-8 w-full items-center gap-1.5 rounded-lg border border-line/60 px-2.5 text-[12px] font-medium text-txt2 transition-colors hover:bg-surface2/60 hover:text-txt"
      >
        <Icon name="folder" size={14} className="shrink-0 text-txt3" />
        <span className="min-w-0 flex-1 truncate text-left">{buttonLabel}</span>
        <Icon name="chevD" size={12} className="shrink-0 text-txt3" />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Workspace 목록"
          className="fade-up glass absolute left-0 top-[calc(100%+8px)] z-50 w-56 rounded-xl p-1.5 shadow-soft"
        >
          <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-txt3">
            Workspace
          </div>
          {isLoading && workspaces.length === 0 ? (
            <div className="px-2 py-3 text-center text-[12px] text-txt3">불러오는 중…</div>
          ) : workspaces.length === 0 ? (
            <div className="px-2 py-3 text-center text-[12px] text-txt3">전환할 Workspace가 없습니다.</div>
          ) : (
            workspaces.map((workspace) => {
              const active = workspace.documentGroupId === currentWorkspaceId;
              return (
                <button
                  key={workspace.documentGroupId}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => {
                    switchWorkspace(workspace.documentGroupId);
                    setOpen(false);
                  }}
                  className={cx(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
                    active ? "bg-surface2/60 text-primary" : "text-txt2 hover:bg-surface2/50 hover:text-txt"
                  )}
                >
                  <span className="min-w-0 truncate">{getWorkspaceDisplayName(workspace)}</span>
                  {active ? <Icon name="check" size={14} className="shrink-0" /> : null}
                </button>
              );
            })
          )}
          <div className="my-1.5 h-px bg-line/50" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onCreateWorkspace();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-primary transition-colors hover:bg-surface2/50"
          >
            <Icon name="plus" size={14} className="shrink-0" />
            <span className="truncate">새 Workspace 만들기</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
