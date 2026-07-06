import Link from "next/link";
import { notFound } from "next/navigation";

import { legalBySlug, LEGAL_DOCUMENTS } from "@/lib/legal";
import { Icon, ThemeToggle, type IconName } from "@/components/brainx-ui";
import { BrandLogo } from "@/components/brand-logo";

export function generateStaticParams() {
  return LEGAL_DOCUMENTS.map((document) => ({ slug: document.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = legalBySlug(slug);
  if (!doc) return {};
  return {
    title: `${doc.title} — BrainX`,
    description: doc.summary
  };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = legalBySlug(slug);
  if (!doc) notFound();

  const other = LEGAL_DOCUMENTS.filter((d) => d.slug !== doc.slug);
  const accentStyle = {
    color: `rgb(${doc.accentColor})`,
    background: `rgb(${doc.accentColor} / 0.10)`,
    borderColor: `rgb(${doc.accentColor} / 0.28)`
  };
  const accentIconStyle = {
    color: `rgb(${doc.accentColor})`,
    background: `rgb(${doc.accentColor} / 0.12)`
  };

  return (
    <div className="min-h-screen bg-bg text-txt">
      {/* ── 상단 탐색 바 ─────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-line/50 bg-bg2/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-5 py-3">
          {/* BrainX BI 로고 */}
          <Link href="/" className="mr-1 flex items-center">
            <BrandLogo size={30} showWordmark />
          </Link>
          <span className="text-line/50">/</span>
          <span className="text-[12.5px] text-txt3">법적 고지</span>
          <span className="text-line/50">/</span>
          <span className="max-w-[140px] truncate text-[12.5px] font-medium text-txt2">{doc.shortLabel}</span>

          {/* 다크모드 토글 + 가입 화면으로 돌아가기 */}
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/signup"
              className="inline-flex items-center gap-1.5 rounded-xl border border-line/60 bg-surface2/50 px-3 py-1.5 text-[12px] font-medium text-txt2 transition-all hover:border-primary/50 hover:bg-surface2 hover:text-primary"
            >
              <Icon name="arrowL" size={12} />
              가입 화면으로
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 pb-24 pt-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_240px]">

          {/* ── 본문 ───────────────────────────────────────── */}
          <div className="min-w-0">
            {/* 문서 헤더 카드 */}
            <div className="mb-8 overflow-hidden rounded-2xl border border-line/60 bg-surface/60">
              {/* 컬러 배너 */}
              <div
                className="h-2 w-full"
                style={{ background: `linear-gradient(90deg, rgb(${doc.accentColor} / 0.7), rgb(${doc.accentColor} / 0.2))` }}
              />
              <div className="p-6 sm:p-8">
                <div className="flex flex-wrap items-start gap-4">
                  {/* 아이콘 */}
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                    style={accentIconStyle}
                  >
                    <Icon name={doc.iconName as IconName} size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    {/* 배지 */}
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
                        style={accentStyle}
                      >
                        <Icon name={doc.required ? "shield" : "star"} size={11} />
                        {doc.required ? "필수 동의" : "선택 동의"}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-line/50 bg-surface2/60 px-2.5 py-0.5 text-[11px] text-txt3">
                        <Icon name="clock" size={11} />
                        시행일: {doc.effectiveDate}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-line/50 bg-surface2/60 px-2.5 py-0.5 text-[11px] text-txt3">
                        {doc.version}
                      </span>
                    </div>

                    <h1 className="text-[26px] font-bold tracking-tight text-txt sm:text-[30px]">
                      {doc.title}
                    </h1>
                    <p className="mt-3 text-[14px] leading-relaxed text-txt2">
                      {doc.summary}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* ── 모바일 목차 (lg 미만에서만 표시) ───────── */}
            <div className="mb-6 overflow-hidden rounded-2xl border border-line/60 bg-surface/50 lg:hidden">
              <div className="border-b border-line/40 bg-surface2/30 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-txt3">목차</p>
              </div>
              <nav className="p-2">
                {doc.sections.map((section, idx) => (
                  <div key={section.title} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] text-txt2 transition-colors hover:bg-surface2/50 hover:text-txt">
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold"
                      style={{ background: `rgb(${doc.accentColor} / 0.12)`, color: `rgb(${doc.accentColor})` }}
                    >
                      {idx + 1}
                    </span>
                    <span className="leading-snug">{section.title}</span>
                  </div>
                ))}
              </nav>
            </div>

            {/* ── 섹션 본문 ─────────────────────────────────── */}
            <div className="space-y-4">
              {doc.sections.map((section, idx) => (
                <section
                  key={section.title}
                  className="overflow-hidden rounded-2xl border border-line/60 bg-surface/50 transition-colors hover:border-line/80"
                >
                  {/* 섹션 헤더 */}
                  <div className="flex items-center gap-3 border-b border-line/40 bg-surface2/30 px-5 py-4">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold"
                      style={{ background: `rgb(${doc.accentColor} / 0.12)`, color: `rgb(${doc.accentColor})` }}
                    >
                      {idx + 1}
                    </span>
                    <h2 className="text-[15px] font-semibold text-txt">{section.title}</h2>
                  </div>

                  {/* 섹션 본문 */}
                  <div className="space-y-3 px-5 py-5">
                    {section.body.map((paragraph) => (
                      <p key={paragraph} className="break-keep text-[13.5px] leading-7 text-txt2">
                        {paragraph}
                      </p>
                    ))}

                    {/* 불릿 목록 */}
                    {section.items && section.items.length > 0 && (
                      <ul className="mt-1 space-y-2 rounded-xl border border-line/40 bg-surface2/30 p-4">
                        {section.items.map((item) => (
                          <li key={item} className="flex items-start gap-2.5 break-keep text-[13px] leading-6 text-txt2">
                            <span
                              className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ background: `rgb(${doc.accentColor})` }}
                            />
                            {item}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>
              ))}
            </div>

            {/* ── 하단 고지 ─────────────────────────────────── */}
            <div className="mt-8 rounded-2xl border border-line/40 bg-surface2/30 px-5 py-4">
              <p className="text-[12px] leading-6 text-txt3">
                본 문서는 BrainX 프로토타입의 서비스 정책 안내문입니다. 실제 서비스 출시 전 관할 법령과 운영 정책에 맞춰 법무 검토가 필요합니다. 문의사항은{" "}
                <a
                  href="mailto:brainx@brainx.app"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  brainx@brainx.app
                </a>
                으로 연락해 주세요.
              </p>
            </div>
          </div>

          {/* ── 사이드바 ─────────────────────────────────────── */}
          <aside className="hidden lg:block">
            <div className="sticky top-[72px] space-y-3">
              {/* 목차 */}
              <div className="rounded-2xl border border-line/60 bg-surface/50 p-4">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-txt3">목차</p>
                <nav className="space-y-1">
                  {doc.sections.map((section, idx) => (
                    <div key={section.title} className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-[12.5px] text-txt2 transition-colors hover:bg-surface2/50 hover:text-txt">
                      <span
                        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold"
                        style={{ background: `rgb(${doc.accentColor} / 0.12)`, color: `rgb(${doc.accentColor})` }}
                      >
                        {idx + 1}
                      </span>
                      <span className="leading-snug">{section.title}</span>
                    </div>
                  ))}
                </nav>
              </div>

              {/* 다른 약관 */}
              <div className="rounded-2xl border border-line/60 bg-surface/50 p-4">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-txt3">다른 약관</p>
                <nav className="space-y-1">
                  {other.map((d) => (
                    <Link
                      key={d.slug}
                      href={`/legal/${d.slug}`}
                      className="flex items-center gap-2 rounded-lg px-2 py-2 text-[12.5px] text-txt2 transition-colors hover:bg-surface2/50 hover:text-primary"
                    >
                      <Icon name={d.iconName as IconName} size={13} className="shrink-0 text-txt3" />
                      <span className="min-w-0 flex-1 leading-snug">{d.shortLabel}</span>
                      <span
                        className="shrink-0 rounded-full border px-1.5 py-0.5 text-[9.5px] font-semibold"
                        style={
                          d.required
                            ? { borderColor: "rgb(79 142 247 / 0.35)", color: "rgb(79 142 247)", background: "rgb(79 142 247 / 0.08)" }
                            : {}
                        }
                      >
                        {d.required ? "필수" : "선택"}
                      </span>
                    </Link>
                  ))}
                </nav>
              </div>

              {/* 문서 정보 */}
              <div className="rounded-2xl border border-line/60 bg-surface/50 p-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-txt3">문서 정보</p>
                <div className="space-y-1.5 text-[12px] text-txt3">
                  <div className="flex items-center justify-between">
                    <span>버전</span>
                    <span className="font-medium text-txt2">{doc.version}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>시행일</span>
                    <span className="font-medium text-txt2">{doc.effectiveDate}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>구분</span>
                    <span
                      className="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                      style={accentStyle}
                    >
                      {doc.required ? "필수" : "선택"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
