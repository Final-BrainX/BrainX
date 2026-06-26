import LoadingSkeleton from "@/components/loading/loading-skeleton";

export default function PublicLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-[linear-gradient(145deg,rgba(232,229,255,0.9)_0%,rgba(244,243,255,0.82)_50%,rgba(229,245,239,0.9)_100%)] px-4 py-10 dark:bg-[linear-gradient(145deg,rgba(10,12,26,0.96)_0%,rgba(13,18,38,0.94)_50%,rgba(23,16,47,0.96)_100%)]">
      <div className="fade-up w-full max-w-xl">
        <LoadingSkeleton compact description="로그인과 회원가입 화면을 준비하는 중입니다." />
      </div>
    </main>
  );
}
