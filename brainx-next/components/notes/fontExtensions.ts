import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

declare module "@tiptap/core" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
    fontFamily: {
      setFontFamily: (family: string) => ReturnType;
      unsetFontFamily: () => ReturnType;
    };
  }
  interface Storage {
    inlineFontScale: {
      /** 이 pane의 현재 Ctrl+Wheel 배율(%) — NoteEditor.tsx가 fontScale prop이 바뀔 때마다 씀 */
      scale: number;
    };
  }
}

/** 글자 크기 — 새 패키지(`@tiptap/extension-font-size`) 없이, 이미 설치된
    `@tiptap/extension-text-style`의 `textStyle` mark에 `fontSize` 속성을 추가하는 방식으로
    구현했다. `Color`가 정확히 같은 패턴(같은 mark에 `color` 속성 추가)으로 이미 동작하고
    있어서, `style` 속성이 `mergeAttributes`에 의해 `color: ...; font-size: ...`처럼 자동으로
    합쳐진다(TipTap core가 style/class는 합치도록 특별 처리함) — 별도 패키지 설치 없이 공식
    확장과 동일한 결과를 낸다. */
export const FontSize = Extension.create({
  name: "fontSize",
  addOptions() {
    return { types: ["textStyle"] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element: HTMLElement) => element.style.fontSize || null,
            renderHTML: (attributes: { fontSize?: string | null }) =>
              attributes.fontSize ? { style: `font-size: ${attributes.fontSize}` } : {},
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (size: string) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: size }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

/** 글꼴 — FontSize와 동일한 방식(textStyle mark 속성 추가). */
export const FontFamily = Extension.create({
  name: "fontFamily",
  addOptions() {
    return { types: ["textStyle"] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontFamily: {
            default: null,
            parseHTML: (element: HTMLElement) => element.style.fontFamily || null,
            renderHTML: (attributes: { fontFamily?: string | null }) =>
              attributes.fontFamily ? { style: `font-family: ${attributes.fontFamily}` } : {},
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontFamily:
        (family: string) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontFamily: family }).run(),
      unsetFontFamily:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontFamily: null }).removeEmptyTextStyle().run(),
    };
  },
});

/** Ctrl+Wheel pane 줌(EditorPanel.tsx의 fontScale)이 일반 본문/제목/코드블록뿐 아니라
    BubbleToolbar의 "글자 크기"(FontSize 확장, textStyle mark의 fontSize 속성 —
    `<span style="font-size: 20px">`로 저장됨)에도 일관되게 적용되도록 하는 뷰 전용 보정.
    저장되는 mark의 fontSize 값 자체는 절대 바꾸지 않는다 — 대신 ProseMirror decoration으로
    렌더링 시점에만 style을 하나 더 얹는다. decoration이 얹는 style은 mark가 이미 렌더링한
    같은 `<span>`의 style attribute 뒤에 이어붙는데(prosemirror-view가 decoration attrs를
    기존 마크 DOM에 병합하는 방식, patchAttributes의 `dom.style.cssText += cur.style`),
    같은 속성이 두 번 선언되면 나중 선언이 이기는 CSS 규칙 덕에 이 값이 화면에는 반영되면서도
    editor.getHTML()/JSON이 직렬화하는 건 여전히 문서 모델의 원본 fontSize뿐이라 저장 데이터는
    전혀 바뀌지 않는다. scale은 NoteEditor.tsx가 fontScale prop이 바뀔 때마다
    `editor.storage.inlineFontScale.scale`에 직접 써주고, 문서를 바꾸지 않는 빈 트랜잭션을
    한 번 dispatch해 데코레이션만 다시 계산되게 한다(Tiptap의 onUpdate는 그 트랜잭션의
    docChanged가 false면 발생하지 않으므로 저장/자동저장에는 전혀 영향이 없다). */
export const InlineFontScale = Extension.create({
  name: "inlineFontScale",
  addStorage() {
    return { scale: 100 };
  },
  addProseMirrorPlugins() {
    const extension = this;
    return [
      new Plugin({
        key: new PluginKey("inlineFontScale"),
        props: {
          decorations(state) {
            const zoom = extension.storage.scale / 100;
            if (!Number.isFinite(zoom) || zoom === 1) return null;

            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText) return;
              const mark = node.marks.find(
                (m) => m.type.name === "textStyle" && typeof m.attrs.fontSize === "string"
              );
              if (!mark) return;
              const basePx = parseFloat(mark.attrs.fontSize as string);
              if (!Number.isFinite(basePx)) return;
              const scaledPx = Math.round(basePx * zoom * 10) / 10;
              decorations.push(
                Decoration.inline(pos, pos + node.nodeSize, {
                  style: `font-size: ${scaledPx}px`,
                })
              );
            });
            return decorations.length > 0 ? DecorationSet.create(state.doc, decorations) : null;
          },
        },
      }),
    ];
  },
});

export const FONT_SIZE_PRESETS = ["12px", "14px", "16px", "18px", "24px"];

export const FONT_FAMILY_PRESETS: { label: string; value: string | null }[] = [
  { label: "기본", value: null },
  { label: "Pretendard", value: "var(--font-sans, Pretendard, sans-serif)" },
  { label: "Noto Sans KR", value: "'Noto Sans KR', sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Monospace", value: "var(--font-mono, ui-monospace, monospace)" },
];
