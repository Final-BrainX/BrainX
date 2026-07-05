import { Suspense } from "react";
import { ShareScreen } from "@/components/public-screens";

// /share?id=SHARE_ID 형식의 쿼리 파라미터 지원 (레거시 호환)
interface Props {
  searchParams: Promise<{ id?: string }>;
}

export default async function ShareQueryPage({ searchParams }: Props) {
  const { id } = await searchParams;
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100svh] items-center justify-center bg-bg text-txt">
          공유 노트를 불러오는 중…
        </div>
      }
    >
      <ShareScreen shareId={id} />
    </Suspense>
  );
}
