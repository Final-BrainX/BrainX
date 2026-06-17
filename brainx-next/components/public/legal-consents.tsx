"use client";

import { allConsents, LEGAL_DOCUMENTS, type ConsentKey, type ConsentState } from "@/lib/legal";
import { cx } from "@/lib/utils";
import { Icon } from "@/components/brainx-ui";

export function LegalConsents({
  value,
  onChange,
  disabled,
  className = ""
}: {
  value: ConsentState;
  onChange: (value: ConsentState) => void;
  disabled?: boolean;
  className?: string;
}) {
  const allChecked = LEGAL_DOCUMENTS.every((document) => value[document.consentKey]);

  const toggle = (key: ConsentKey) => {
    onChange({ ...value, [key]: !value[key] });
  };

  return (
    <div className={cx("rounded-xl border border-line/60 bg-surface2/40 p-3", className)}>
      <div className="space-y-1">
        {LEGAL_DOCUMENTS.map((document) => (
          <div key={document.slug} className="flex h-9 items-center gap-2.5">
            <button
              type="button"
              aria-label={`${document.shortLabel} 동의`}
              onClick={() => toggle(document.consentKey)}
              disabled={disabled}
              className={cx(
                "grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors",
                value[document.consentKey] ? "border-primary bg-primary text-white" : "border-line bg-surface/40 text-transparent"
              )}
            >
              <Icon name="check" size={13} />
            </button>
            <a
              href={`/legal/${document.slug}`}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate text-left text-[13px] text-txt2 underline-offset-4 hover:text-primary hover:underline"
            >
              [{document.required ? "필수" : "선택"}] {document.shortLabel}
            </a>
            <Icon name="link" size={13} className="shrink-0 text-txt3" />
          </div>
        ))}
      </div>
      <div className="mt-2 border-t border-line/50 pt-2">
        <button
          type="button"
          onClick={() => onChange(allConsents(!allChecked))}
          disabled={disabled}
          className="flex h-9 w-full items-center gap-2.5 rounded-lg px-0 text-left transition-colors hover:bg-surface2/50 disabled:pointer-events-none disabled:opacity-60"
        >
          <span
            className={cx(
              "grid h-5 w-5 shrink-0 place-items-center rounded-md border",
              allChecked ? "border-primary bg-primary text-white" : "border-line bg-surface/40 text-transparent"
            )}
          >
            <Icon name="check" size={13} />
          </span>
          <span className="text-[13px] font-semibold text-txt">전체 동의</span>
        </button>
      </div>
    </div>
  );
}
