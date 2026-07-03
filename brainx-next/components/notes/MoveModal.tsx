"use client";

import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { Folder, FolderOpen, Inbox, ChevronRight } from "lucide-react";
import { cx } from "@/lib/utils";
import { MockFolder } from "@/lib/notes/noteTypes";

interface Props {
  /** 이동하는 항목들의 id */
  movingIds: string[];
  movingType: "note" | "folder" | "mixed";
  folders: MockFolder[];
  onConfirm: (targetFolderId: string | null) => void;
  onCancel: () => void;
}

interface FolderRow {
  folder: MockFolder;
  depth: number;
}

/** folder와 그 모든 하위 폴더 id를 재귀로 수집한다. 자기 자신 하위로 이동을 막기 위해 사용. */
function collectDescendants(folderId: string, folders: MockFolder[]): Set<string> {
  const result = new Set<string>([folderId]);
  let frontier = [folderId];
  while (frontier.length > 0) {
    const next = folders
      .filter((f) => f.parentFolderId && frontier.includes(f.parentFolderId) && !result.has(f.id))
      .map((f) => f.id);
    next.forEach((id) => result.add(id));
    frontier = next;
  }
  return result;
}

/** 폴더 트리를 depth-first로 평탄화한다. */
function flattenFolders(folders: MockFolder[], parentId: string | null, depth: number): FolderRow[] {
  return folders
    .filter((f) => f.parentFolderId === parentId)
    .flatMap((f) => [{ folder: f, depth }, ...flattenFolders(folders, f.id, depth + 1)]);
}

export default function MoveModal({ movingIds, movingType, folders, onConfirm, onCancel }: Props) {
  const [selectedTarget, setSelectedTarget] = useState<string | null | undefined>(undefined);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const s = new Set<string>();
    folders.forEach((f) => s.add(f.id));
    return s;
  });

  /* 이동 불가 폴더 집합: 이동 중인 폴더 자신과 그 하위 폴더들 */
  const disabledFolderIds = useMemo(() => {
    if (movingType === "note") return new Set<string>();
    const result = new Set<string>();
    movingIds.forEach((id) => {
      const desc = collectDescendants(id, folders);
      desc.forEach((d) => result.add(d));
    });
    return result;
  }, [movingIds, movingType, folders]);

  const rows = useMemo(() => flattenFolders(folders, null, 0), [folders]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /* depth-first로 부모가 접혀있는 행은 숨긴다 */
  const visibleRows = useMemo(() => {
    const result: FolderRow[] = [];
    for (const row of rows) {
      const ancestors = folders.filter((f) => isAncestorOf(f.id, row.folder, folders));
      const anyCollapsed = ancestors.some((a) => !expandedIds.has(a.id));
      if (!anyCollapsed) result.push(row);
    }
    return result;
  }, [rows, expandedIds, folders]);

  const hasChildren = (folderId: string) => folders.some((f) => f.parentFolderId === folderId);

  const handleConfirm = () => {
    if (selectedTarget === undefined) return;
    onConfirm(selectedTarget);
  };

  const itemClass = (folderId: string | null) =>
    cx(
      "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors",
      selectedTarget === folderId
        ? "bg-primary/12 text-primary font-medium"
        : "text-txt2 hover:bg-surface2/50 hover:text-txt"
    );

  return createPortal(
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center"
      style={{ background: "rgba(2, 6, 23, 0.55)" }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[360px] rounded-xl border border-line/60 shadow-2xl flex flex-col"
        style={{ background: "rgb(var(--surface))", maxHeight: "70vh" }}
      >
        <div className="px-4 pt-4 pb-3 border-b border-line/30">
          <h3 className="text-[14px] font-semibold text-txt">이동</h3>
          <p className="mt-0.5 text-[11px] text-txt3">
            {movingType === "note" ? "노트" : movingType === "folder" ? "폴더" : "선택한 항목"}를 이동할 위치를 선택하세요
          </p>
        </div>

        <div className="flex-1 overflow-y-auto py-2 px-2">
          {/* 루트 (최상위) */}
          <button
            type="button"
            onClick={() => setSelectedTarget(null)}
            className={itemClass(null)}
          >
            <Inbox size={13} className="shrink-0 text-txt3" />
            <span>최상위 (루트)</span>
          </button>

          {visibleRows.map(({ folder, depth }) => {
            const disabled = disabledFolderIds.has(folder.id);
            const expanded = expandedIds.has(folder.id);
            const hasChild = hasChildren(folder.id);
            return (
              <div key={folder.id} style={{ paddingLeft: depth * 14 }}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => !disabled && setSelectedTarget(folder.id)}
                  className={cx(
                    itemClass(folder.id),
                    disabled && "opacity-40 cursor-not-allowed"
                  )}
                >
                  {hasChild ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleExpand(folder.id); }}
                      className="shrink-0 text-txt3 hover:text-txt"
                    >
                      <ChevronRight
                        size={11}
                        className={cx("transition-transform", expanded && "rotate-90")}
                      />
                    </button>
                  ) : (
                    <span className="w-[11px] shrink-0" />
                  )}
                  {expanded
                    ? <FolderOpen size={13} className="shrink-0" style={{ color: folder.color ?? "#eab308" }} />
                    : <Folder size={13} className="shrink-0" style={{ color: folder.color ?? "#eab308" }} />
                  }
                  <span className="flex-1 truncate">{folder.name}</span>
                  {disabled && <span className="text-[10px] text-txt3">이동 불가</span>}
                </button>
              </div>
            );
          })}

          {folders.length === 0 && (
            <p className="py-4 text-center text-[11px] text-txt3">폴더가 없습니다</p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-line/30">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-line/50 px-3 py-1.5 text-[12px] font-medium text-txt2 transition-colors hover:bg-surface2/60"
          >
            취소
          </button>
          <button
            type="button"
            disabled={selectedTarget === undefined}
            onClick={handleConfirm}
            className={cx(
              "rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors",
              selectedTarget === undefined
                ? "bg-primary/40 text-white cursor-not-allowed"
                : "bg-primary text-white hover:bg-primary/90"
            )}
          >
            여기로 이동
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function isAncestorOf(candidateId: string, target: MockFolder, folders: MockFolder[]): boolean {
  let current: MockFolder | undefined = target;
  while (current?.parentFolderId) {
    if (current.parentFolderId === candidateId) return true;
    current = folders.find((f) => f.id === current!.parentFolderId);
  }
  return false;
}
