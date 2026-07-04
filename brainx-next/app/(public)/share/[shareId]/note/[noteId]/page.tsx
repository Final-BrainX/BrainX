import { Suspense } from "react";
import { ShareScreen } from "@/components/public-screens";

interface Props {
  params: Promise<{ shareId: string; noteId: string }>;
}

export default async function LinkedNotePage({ params }: Props) {
  const { shareId, noteId } = await params;
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100svh] items-center justify-center bg-bg text-txt">
          노트를 불러오는 중…
        </div>
      }
    >
      <ShareScreen shareId={shareId} noteId={noteId} />
    </Suspense>
  );
}
