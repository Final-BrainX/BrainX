"use client";

import { useParams } from "next/navigation";
import { NoteEditorScreen } from "@/components/note-editor-screen";

export default function NotePage() {
  const params = useParams() as { id?: string | string[] };
  const raw = params.id;
  const id = Array.isArray(raw) ? raw[0] : raw || "n1";

  return <NoteEditorScreen initialNoteId={id} />;
}
