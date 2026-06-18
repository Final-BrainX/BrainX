"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Search, FileText } from "lucide-react";
import { MockNote } from "@/lib/notes/noteTypes";

interface Props {
  notes: MockNote[];
  onSelect: (noteId: string) => void;
  onClose: () => void;
}

/** "파일로 이동하기" — 검색 후 선택한 노트를 현재 탭에 연다 */
export default function QuickSwitcher({ notes, onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? notes.filter((n) => n.title.toLowerCase().includes(q)) : notes;
    return list.slice(0, 50);
  }, [notes, query]);

  return (
    <div
      className="absolute inset-0 z-20 flex items-start justify-center pt-20"
      style={{ background: "rgb(var(--bg) / 0.55)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] overflow-hidden rounded-xl border border-line/60"
        style={{ background: "rgb(var(--surface))", boxShadow: "0 12px 32px -6px rgba(2,6,23,0.5)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line/50 px-3 py-2.5">
          <Search size={13} className="shrink-0 text-txt3" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter" && filtered[0]) onSelect(filtered[0].id);
            }}
            placeholder="노트 검색..."
            className="flex-1 bg-transparent text-[13px] text-txt outline-none placeholder:text-txt3"
          />
        </div>
        <div className="scroll-thin max-h-[320px] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-center text-[12px] text-txt3">검색 결과가 없습니다</p>
          ) : (
            filtered.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => onSelect(note.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-txt2 transition-colors hover:bg-surface2/60 hover:text-txt"
              >
                <FileText size={12} className="shrink-0 text-txt3" />
                <span className="flex-1 truncate">{note.title}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
