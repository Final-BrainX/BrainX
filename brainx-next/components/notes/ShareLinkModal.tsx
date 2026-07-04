"use client";

import { useState, useEffect, useCallback } from "react";
import { Link2, Copy, X, Check, Trash2, Loader2, Plus } from "lucide-react";
import { cx } from "@/lib/utils";
import {
  createShareLink,
  listShareLinks,
  revokeShareLink,
  type ShareLinkData,
} from "@/lib/workspace-api";
import type { MockNote } from "@/lib/notes/noteTypes";

const EXPIRY_OPTIONS = [
  { label: "7일", days: 7 },
  { label: "30일", days: 30 },
  { label: "90일", days: 90 },
] as const;

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function formatExpiry(isoString: string): string {
  const date = new Date(isoString);
  const diffMs = date.getTime() - Date.now();
  if (diffMs <= 0) return "만료됨";
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return `${diffDays}일 후 만료`;
}

interface ShareLinkModalProps {
  note: MockNote;
  onClose: () => void;
}

export function ShareLinkModal({ note, onClose }: ShareLinkModalProps) {
  const [links, setLinks] = useState<ShareLinkData[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ok" | "err">("loading");
  const [creating, setCreating] = useState(false);
  const [selectedDays, setSelectedDays] = useState<7 | 30 | 90>(30);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const activeLinks = links.filter(
    (l) => !l.revoked && new Date(l.expiresAt) > new Date()
  );

  useEffect(() => {
    listShareLinks(note.id)
      .then((data) => { setLinks(data); setLoadState("ok"); })
      .catch(() => setLoadState("err"));
  }, [note.id]);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const link = await createShareLink(note.id, "READ", addDays(selectedDays));
      setLinks((prev) => [link, ...prev]);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "링크 생성에 실패했습니다.");
    } finally {
      setCreating(false);
    }
  }, [note.id, selectedDays]);

  const handleRevoke = useCallback(async (shareId: string) => {
    setRevoking(shareId);
    try {
      await revokeShareLink(shareId);
      setLinks((prev) => prev.map((l) => l.shareId === shareId ? { ...l, revoked: true } : l));
    } finally {
      setRevoking(null);
    }
  }, []);

  const handleCopy = useCallback(async (url: string, shareId: string) => {
    try { await navigator.clipboard.writeText(url); } catch {}
    setCopiedId(shareId);
    setTimeout(() => setCopiedId((id) => id === shareId ? null : id), 2000);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative z-10 w-[460px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-line/60 bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-line/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <Link2 size={14} className="text-txt3" />
            <span className="text-[13px] font-semibold text-txt">공유 링크</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-0.5 text-txt3 hover:bg-surface2 hover:text-txt"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-[12px] text-txt3">
            링크를 가진 누구나 이 노트를 읽을 수 있어요. 로그인 없이 접근 가능합니다.
          </p>

          {/* 새 링크 생성 */}
          <div className="rounded-lg border border-line/40 bg-surface2/30 p-3 space-y-3">
            <div className="text-[11px] font-medium text-txt3 uppercase tracking-wide">새 링크 만들기</div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-txt2 shrink-0">만료</span>
              <div className="flex gap-1.5">
                {EXPIRY_OPTIONS.map((opt) => (
                  <button
                    key={opt.days}
                    type="button"
                    onClick={() => setSelectedDays(opt.days)}
                    className={cx(
                      "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                      selectedDays === opt.days
                        ? "bg-primary text-white"
                        : "bg-surface2 text-txt3 hover:text-txt"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {createError && (
              <p className="text-[11px] text-red-400">{createError}</p>
            )}
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary/10 py-1.5 text-[12px] font-medium text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
            >
              {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              링크 생성
            </button>
          </div>

          {/* 활성 링크 목록 */}
          <div className="space-y-2">
            {loadState === "loading" && (
              <div className="flex items-center justify-center py-4 text-[12px] text-txt3 gap-2">
                <Loader2 size={13} className="animate-spin" />
                불러오는 중…
              </div>
            )}
            {loadState === "err" && (
              <div className="py-3 text-center text-[12px] text-txt3">링크 목록을 불러올 수 없어요.</div>
            )}
            {loadState === "ok" && activeLinks.length === 0 && (
              <div className="py-3 text-center text-[12px] text-txt3">아직 공유 링크가 없어요.</div>
            )}
            {loadState === "ok" && activeLinks.length > 0 && (
              <>
                <div className="text-[11px] font-medium text-txt3 uppercase tracking-wide">활��� 링크</div>
                {activeLinks.map((link) => (
                  <div
                    key={link.shareId}
                    className="flex items-center gap-2 rounded-lg border border-line/30 bg-surface2/30 px-3 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-[12px] text-txt2 font-mono">{link.url}</div>
                      <div className="text-[11px] text-txt3">{formatExpiry(link.expiresAt)}</div>
                    </div>
                    <button
                      type="button"
                      title="링크 복사"
                      onClick={() => handleCopy(link.url, link.shareId)}
                      className="shrink-0 rounded p-1 text-txt3 hover:text-txt transition-colors"
                    >
                      {copiedId === link.shareId
                        ? <Check size={13} className="text-green-500" />
                        : <Copy size={13} />
                      }
                    </button>
                    <button
                      type="button"
                      title="링크 해제"
                      onClick={() => handleRevoke(link.shareId)}
                      disabled={revoking === link.shareId}
                      className="shrink-0 rounded p-1 text-txt3 hover:text-red-400 disabled:opacity-40 transition-colors"
                    >
                      {revoking === link.shareId
                        ? <Loader2 size={13} className="animate-spin" />
                        : <Trash2 size={13} />
                      }
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
