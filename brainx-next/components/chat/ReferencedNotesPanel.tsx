import type { BrainXNote } from "@/lib/brainx-data";
import { clusterById } from "@/lib/brainx-data";
import { Icon, RelevanceBar } from "@/components/brainx-ui";
import type { ChatCitation } from "@/components/chat/types";

type ReferencedNotesPanelProps = {
  referencedCitations: ChatCitation[];
  notes: BrainXNote[];
  onOpenNote: (noteId: string) => void;
};

export function ReferencedNotesPanel({
  referencedCitations,
  notes,
  onOpenNote,
}: ReferencedNotesPanelProps) {
  return (
    <div className="hidden w-72 shrink-0 flex-col border-l border-line/50 bg-bg2/30 lg:flex">
      <div className="flex items-center gap-2 border-b border-line/50 p-4 text-[15px] font-semibold text-txt2">
        <Icon name="doc" size={15} />
        참조·근거 노트
      </div>
      <div className="scroll flex-1 space-y-2.5 overflow-y-auto p-3">
        <div className="px-1 text-[13px] text-txt3">
          현재 대화에서 인용된 노트
        </div>
        {referencedCitations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line/60 px-3 py-4 text-[13px] leading-5 text-txt3">
            답변이 노트를 인용하면 여기에 표시됩니다.
          </div>
        ) : null}
        {referencedCitations.map((citation, index) => {
          const note = notes.find((item) => item.id === citation.noteId);
          const color = note ? clusterById(note.cluster).color : "108,99,216";
          const relevance =
            citation.score == null
              ? null
              : Math.round(Math.max(0, Math.min(1, citation.score)) * 100);
          return (
            <button
              key={citation.noteId || `${citation.title}-${index}`}
              type="button"
              disabled={!citation.noteId}
              onClick={() => citation.noteId && onOpenNote(citation.noteId)}
              className="card w-full rounded-xl p-3 text-left transition-colors hover:border-primary/45 disabled:cursor-default"
            >
              <div className="mb-1.5 flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: `rgb(${color})` }}
                />
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-txt">
                  {citation.title}
                </span>
              </div>
              <p className="mb-2 line-clamp-2 text-[13.5px] text-txt3">
                {citation.sourcePath ||
                  citation.sourceFilename ||
                  note?.summary ||
                  "RAG 검색 근거로 사용된 노트입니다."}
              </p>
              {relevance == null ? null : <RelevanceBar value={relevance} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
