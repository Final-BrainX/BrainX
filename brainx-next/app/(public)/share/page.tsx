import { Suspense } from "react";
import { ShareScreen } from "@/components/public-screens";

export default function SharePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100svh] items-center justify-center bg-bg text-txt">
          공유 노트를 불러오는 중…
        </div>
      }
    >
      <ShareScreen />
    </Suspense>
  );
}
