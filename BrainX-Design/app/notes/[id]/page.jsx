import NoteEditorPage from "./NoteEditorPage";

export default async function Page({ params }) {
  const { id } = await params;
  return <NoteEditorPage initialNoteId={id} />;
}
