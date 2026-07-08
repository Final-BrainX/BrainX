import type { CSSProperties } from "react";
import type { NoteTypography } from "./noteTypes";

/** 에디터 본문 wrapper는 항상 `split-pane-editor` 클래스를 함께 갖고 있어(NoteEditor.tsx),
    더 높은 specificity의 `.split-pane-editor.tiptap-note-content .ProseMirror` 규칙(0.8125rem)이
    `.tiptap-note-content .ProseMirror`(0.9375rem)를 항상 덮어쓴다 — 실제 기본 본문 크기는
    13px다. h1/h2/h3는 그 13px 기준 em 비율(1.8/1.35/1.1)이 실제 렌더링 값과 일치한다.
    scalePercent 계산의 출발점이므로, 여기 값을 바꾸면 CSS 쪽 기본값과 어긋난다. */
export const TYPOGRAPHY_BASE_PX = {
  body: 13, // 0.8125rem * 16px
  h1: 23.4, // 13 * 1.8
  h2: 17.55, // 13 * 1.35
  h3: 14.3, // 13 * 1.1
} as const;

export const TYPOGRAPHY_SCALE_MIN = 80;
export const TYPOGRAPHY_SCALE_MAX = 150;

/** 코드블록 본문(CodeBlockView.tsx의 `<pre>`)의 기본 font-size — note.typography.scalePercent와는
    처음부터 무관하게 고정 12px이었다(서식 패널은 코드블록 크기를 건드리지 않는다는 기존 정책).
    Ctrl+Wheel pane 줌만은 "본문 콘텐츠 확대"로 코드 텍스트도 함께 커지길 기대하므로, 그 정책은
    유지한 채 fontScale만 곱해 --note-fs-code로 내려보낸다. */
export const TYPOGRAPHY_CODE_BASE_PX = 12;

/** scalePercent + 레벨별 overrides를 합쳐 최종 px 값을 계산한다.
    overrides에 값이 있는 레벨은 scalePercent 계산을 무시하고 그 값을 그대로 쓴다 — 전역 배율과
    개별 설정이 서로 독립적으로 동작해야 한다는 요구사항(개별 설정은 전역 배율 변경에 영향받지 않음). */
export function computeTypographyPx(typography?: NoteTypography) {
  const scale = (typography?.scalePercent ?? 100) / 100;
  const ov = typography?.overrides ?? {};
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    body: ov.body ?? round(TYPOGRAPHY_BASE_PX.body * scale),
    h1: ov.h1 ?? round(TYPOGRAPHY_BASE_PX.h1 * scale),
    h2: ov.h2 ?? round(TYPOGRAPHY_BASE_PX.h2 * scale),
    h3: ov.h3 ?? round(TYPOGRAPHY_BASE_PX.h3 * scale),
  };
}

/** typography 설정이 없고 pane 줌(fontScale)도 100%면(아무것도 커스터마이징하지 않은 노트) 빈
    객체를 반환해 globals.css의 기존 em 기반 기본값(var(--note-fs-h1, 1.8em) 등)이 그대로
    적용되게 한다 — 기본 노트의 모양은 이 기능 도입 전과 100% 동일하게 유지된다.

    fontScale은 EditorPanel의 Ctrl+Wheel pane 줌(§EditorPanel.tsx) 배율이다 — 문서 자체의
    typography.scalePercent와는 완전히 별개의, pane 세션 전용 배율이라 여기서 곱셈으로만
    합성하고 note.typography는 전혀 건드리지 않는다. 이전에는 이 pane 줌을 CSS `zoom`으로
    구현해 wrapper의 레이아웃 박스(width/padding/margin) 전체를 함께 확대했는데, `zoom`은
    스케일이 정수 px로 딱 떨어지지 않을 때 자손별로 반올림 오차가 누적돼 줄마다 시작 x축이
    계단식으로 어긋나는 렌더링 버그가 있었다(줌 배율이 body/heading의 font-size에만 곱해지는
    이 CSS 변수 방식은 레이아웃 박스 자체는 그대로이므로 그 문제가 없다). */
export function typographyCssVars(typography?: NoteTypography, fontScale = 100): CSSProperties {
  const hasCustomTypography = Boolean(
    typography && (typography.scalePercent || typography.overrides || typography.fontFamily)
  );
  if (fontScale === 100 && !hasCustomTypography) {
    return {};
  }
  const px = computeTypographyPx(typography);
  const zoom = fontScale / 100;
  const round = (n: number) => Math.round(n * 10) / 10;
  const vars: Record<string, string> = {
    "--note-fs-body": `${round(px.body * zoom)}px`,
    "--note-fs-h1": `${round(px.h1 * zoom)}px`,
    "--note-fs-h2": `${round(px.h2 * zoom)}px`,
    "--note-fs-h3": `${round(px.h3 * zoom)}px`,
  };
  // 코드블록은 scalePercent와 무관하므로 zoom이 100%일 때는 var 자체를 생략해 CodeBlockView의
  // 폴백(12px)이 그대로 적용되게 한다 — hasCustomTypography만으로 이 함수가 호출된 경우(Ctrl+Wheel
  // 없이 서식 패널만 바꾼 경우)에 코드블록 크기가 갑자기 따라 바뀌는 회귀를 막기 위함.
  if (zoom !== 1) {
    vars["--note-fs-code"] = `${round(TYPOGRAPHY_CODE_BASE_PX * zoom)}px`;
  }
  if (typography?.fontFamily) vars["--note-font-family"] = typography.fontFamily;
  return vars as CSSProperties;
}
