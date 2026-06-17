import { notFound } from "next/navigation";

import { legalBySlug, LEGAL_DOCUMENTS } from "@/lib/legal";
import { Icon } from "@/components/brainx-ui";

export function generateStaticParams() {
  return LEGAL_DOCUMENTS.map((document) => ({ slug: document.slug }));
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const document = legalBySlug(slug);
  if (!document) {
    notFound();
  }

  return (
    <main data-route className="scroll min-h-screen overflow-y-auto px-5 py-8">
      <div className="mx-auto max-w-3xl">
        <a href="/signup" className="mb-6 inline-flex items-center gap-2 text-[13px] text-txt2 hover:text-primary">
          <Icon name="arrowL" size={15} />
          가입 화면으로 돌아가기
        </a>
        <div className="mb-7 rounded-2xl border border-line/60 bg-surface/70 p-6 shadow-soft">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-line/60 bg-surface2/60 px-3 py-1 text-[12px] text-txt2">
            <Icon name={document.required ? "shield" : "doc"} size={14} />
            {document.required ? "필수 동의" : "선택 동의"}
          </div>
          <h1 className="text-[28px] font-bold tracking-tight text-txt">{document.title}</h1>
          <p className="mt-3 text-[14px] leading-relaxed text-txt2">{document.summary}</p>
        </div>
        <article className="space-y-5">
          {document.sections.map((section) => (
            <section key={section.title} className="rounded-2xl border border-line/60 bg-surface/60 p-5">
              <h2 className="mb-3 text-[17px] font-semibold text-txt">{section.title}</h2>
              <div className="space-y-3">
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="text-[14px] leading-7 text-txt2">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </article>
        <p className="mt-8 text-[12px] leading-6 text-txt3">
          본 문서는 BrainX 프로토타입의 서비스 정책 안내문입니다. 실제 서비스 출시 전 관할 법령과 운영 정책에 맞춰 법무 검토가 필요합니다.
        </p>
      </div>
    </main>
  );
}
