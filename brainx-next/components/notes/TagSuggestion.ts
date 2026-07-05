import { Extension, InputRule } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export interface TagSuggestionState {
  active: boolean;
  range: { from: number; to: number } | null;
  query: string;
  manual: boolean;
}

export const TagSuggestionKey = new PluginKey<TagSuggestionState>("tagSuggestion");

const INACTIVE: TagSuggestionState = { active: false, range: null, query: "", manual: false };

/**
 * `#` 입력 트리거를 감지하는 ProseMirror Plugin.
 * - codeBlock 내부에서는 동작하지 않는다.
 * - `#`로 시작하되 공백·줄바꿈이 없는 단어 범위를 실시간으로 추적한다.
 * - 실제 후보 필터링·키보드 네비게이션·삽입은 React 컴포넌트(`TagAutocomplete`)가 담당한다.
 *   (WikiLinkSuggestion과 동일한 분리 패턴)
 */
// 커서 왼쪽에서 가장 최근 `#`로 시작하고 공백/줄바꿈이 없는 부분을 찾는다.
// 단, `#`가 줄 맨 앞이고 공백이 바로 뒤따르면 헤딩 입력 규칙과 겹치므로 제외한다.
const TRIGGER_RE = /(?:^|\s)(#[^\s#]*)$/;

export const TagSuggestion = Extension.create({
  name: "tagSuggestion",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: TagSuggestionKey,
        state: {
          init: () => INACTIVE,
          apply(tr, prev): TagSuggestionState {
            if (tr.getMeta(TagSuggestionKey) === "open") {
              const selection = tr.selection;
              if (!selection.empty) return INACTIVE;
              const $from = selection.$from;
              if ($from.parent.type.name === "codeBlock") return INACTIVE;
              return { active: true, range: { from: selection.from, to: selection.to }, query: "", manual: true };
            }

            // 명시적 닫기(Escape 등) 메타가 있으면 즉시 비활성화
            if (tr.getMeta(TagSuggestionKey) === "close") return INACTIVE;
            // Split View의 다른(포커스 없는) 패널이 sync를 위해 setContent({emitUpdate:false})를
            // 호출할 때 tiptap이 자동으로 다는 'preventUpdate' meta — SlashCommand.ts/
            // WikiLinkSuggestion.ts와 동일한 이유로 트리거 판정에서 제외한다.
            if (tr.getMeta("preventUpdate")) return INACTIVE;

            const { selection } = tr;
            if (!selection.empty) return INACTIVE;

            const $from = selection.$from;
            // 코드블록 내부에서는 태그 자동완성을 띄우지 않는다
            if ($from.parent.type.name === "codeBlock") return INACTIVE;

            // 커서 기준으로 최대 100자까지 역방향으로 텍스트를 읽어 트리거를 찾는다
            const start = Math.max(0, $from.parentOffset - 100);
            const textBefore = $from.parent.textBetween(start, $from.parentOffset, undefined, "\uFFFC");
            const match = TRIGGER_RE.exec(textBefore);
            if (!match) return INACTIVE;

            // match[1]은 `#쿼리` 전체, match[0]에는 앞의 공백이 포함될 수 있다
            const tagPart = match[1]; // "#..." 부분만
            const from = $from.pos - tagPart.length;
            const to = $from.pos;
            const query = tagPart.slice(1); // '#' 제거한 순수 쿼리

            // 변경이 없으면 이전 상태 객체를 재사용해 불필요한 리렌더 방지
            if (
              prev.active &&
              prev.range?.from === from &&
              prev.range?.to === to &&
              prev.query === query
            ) {
              return prev;
            }

            return { active: true, range: { from, to }, query, manual: false };
          },
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Space": () => {
        const { state, view } = this.editor;
        const { selection } = state;
        if (!selection.empty) return false;
        if (selection.$from.parent.type.name === "codeBlock") return false;
        view.dispatch(state.tr.setMeta(TagSuggestionKey, "open"));
        return true;
      },
    };
  },

  /**
   * `#단어 ` (스페이스바)를 감지해 TagNode 인라인 노드로 변환.
   * - 코드블록 내부에서는 동작하지 않음 (codeBlock 진입 시 InputRule 자체가 비활성화)
   * - `#` 뒤에 글자가 1개 이상 있어야 트리거됨
   * - 삽입 후 공백 한 칸을 텍스트로 남겨서 계속 입력 가능하게 함
   */
  addInputRules() {
    // `#단어 ` 패턴 — 스페이스바를 누르는 순간 매치.
    // 캡처 그룹: [1] = 앞 공백(또는 빈 문자열), [2] = #단어 (공백 미포함)
    // lookbehind 없이 전체 매치(앞 공백 포함)를 캡처하고 handler에서 처리한다.
    const TAG_INPUT_RULE = /(^|\s)(#[^\s#]{1,64}) $/;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = ({ state, range, match }: any): any => {
      const $from = state.selection.$from;
      // 코드블록 내부에서는 변환하지 않음
      if ($from.parent.type.name === "codeBlock") return null;

      const tagName = (match[2] as string | undefined)?.slice(1);
      if (!tagName) return null;

      const tagNodeType = state.schema.nodes["tagNode"];
      if (!tagNodeType) return null;

      const { tr } = state;
      const prefixLen = (match[1] as string | undefined)?.length ?? 0;
      const insertFrom = range.from + prefixLen; // 앞 공백은 유지

      // #단어 + 뒤 공백(트리거)을 TagNode + 공백으로 교체
      tr.replaceWith(
        insertFrom,
        range.to,
        [
          tagNodeType.create({ name: tagName }),
          state.schema.text(" "), // 입력 계속 가능하게 공백 유지
        ]
      );

      return tr;
    };

    return [new InputRule({ find: TAG_INPUT_RULE, handler })];
  },
});
