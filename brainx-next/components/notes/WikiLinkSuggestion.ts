import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export interface WikiLinkSuggestionState {
  active: boolean;
  range: { from: number; to: number } | null;
  query: string;
}

export const WikiLinkSuggestionKey = new PluginKey<WikiLinkSuggestionState>("wikiLinkSuggestion");

const INACTIVE: WikiLinkSuggestionState = { active: false, range: null, query: "" };

// `[[` 다음에 아직 `]]`로 닫히지 않은 텍스트를 찾는다 — 한 글자라도 입력될 때마다(트랜잭션마다)
// 다시 계산하므로 쿼리는 항상 최신 상태다.
const TRIGGER_RE = /\[\[([^[\]]*)$/;

/** `[[` 입력 트리거 감지만 담당하는 작은 플러그인. 실제 후보 목록 필터링·키보드 네비게이션·
    삽입은 NoteEditor.tsx의 `WikiLinkAutocomplete`(React)가 `editor.view.dom`에 직접 단 네이티브
    keydown 리스너로 처리한다 — 이 확장은 여러 에디터 인스턴스가 공유하는 정적 모듈이라(다른
    확장들과 동일한 패턴) 노트 목록 같은 인스턴스별 데이터를 들고 있을 수 없기 때문이다. */
export const WikiLinkSuggestion = Extension.create({
  name: "wikiLinkSuggestion",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: WikiLinkSuggestionKey,
        state: {
          init: () => INACTIVE,
          apply(tr, prev): WikiLinkSuggestionState {
            // Escape 등으로 명시적으로 닫힌 경우 — 같은 위치에서 다시 입력 중이어도 닫힌 상태를
            // 존중한다(메타가 있는 트랜잭션 자체에서만 강제 비활성화).
            if (tr.getMeta(WikiLinkSuggestionKey) === "close") return INACTIVE;
            // Split View의 다른(포커스 없는) 패널이 sync를 위해 setContent({emitUpdate:false})를
            // 호출할 때 tiptap이 자동으로 다는 'preventUpdate' meta — 그 트랜잭션에서 매핑된
            // 커서가 우연히 "[[…" 뒤에 놓이면 타이핑한 적 없는 패널에도 위키링크 자동완성이
            // 뜨는 버그가 있었다(SlashCommand.ts와 동일한 원인/수정).
            if (tr.getMeta("preventUpdate")) return INACTIVE;

            const { selection } = tr;
            if (!selection.empty) return INACTIVE;

            const $from = selection.$from;
            if ($from.parent.type.name === "codeBlock") return INACTIVE;

            const start = Math.max(0, $from.parentOffset - 80);
            const textBefore = $from.parent.textBetween(start, $from.parentOffset, undefined, "￼");
            const match = TRIGGER_RE.exec(textBefore);
            if (!match) return INACTIVE;

            const from = $from.pos - match[0].length;
            const to = $from.pos;
            const query = match[1];
            if (prev.active && prev.range?.from === from && prev.range?.to === to && prev.query === query) {
              return prev;
            }
            return { active: true, range: { from, to }, query };
          },
        },
      }),
    ];
  },
});
