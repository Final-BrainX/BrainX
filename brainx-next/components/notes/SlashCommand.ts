import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export interface SlashCommandState {
  active: boolean;
  range: { from: number; to: number } | null;
  query: string;
}

export const SlashCommandKey = new PluginKey<SlashCommandState>("slashCommand");

const INACTIVE: SlashCommandState = { active: false, range: null, query: "" };

// "/"는 빈 문단의 맨 앞일 때만 명령어 메뉴를 띈운다 — 본문 중간에서 쓰는 "/"(분수, 경로, URL 등)와
// 충돌하지 않도록 현재 문단의 시작부터 커서까지 전체 텍스트가 "/명령어" 형태인지 검사한다.
// WikiLinkSuggestion과 동일한 패턴(트리거 감지만 이 플러그인이, 후보 필터링/키보드 네비게이션은
// React 쪽 SlashCommandMenu가 담당).
const TRIGGER_RE = /^\/([a-zA-Z0-9가-힣]*)$/;

export const SlashCommandSuggestion = Extension.create({
  name: "slashCommandSuggestion",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: SlashCommandKey,
        state: {
          init: () => INACTIVE,
          apply(tr, prev): SlashCommandState {
            if (tr.getMeta(SlashCommandKey) === "close") return INACTIVE;
            // Split View에서 같은 노트를 두 패널에 열어두면, 한쪽에서 타이핑한 내용이 디바운스
            // 뒤 다른(포커스 없는) 쪽 에디터에 setContent({emitUpdate:false})로 반영된다 — 이
            // setContent가 만드는 트랜잭션은 tiptap이 자동으로 'preventUpdate' meta를 단다.
            // 이 트랜잭션에서 매핑된 커서 위치가 우연히 "/…" 패턴 뒤에 놓이면, 사용자가 그
            // 패널에서 타이핑한 적이 없는데도 슬래시 메뉴가 함께 뜨는 버그가 있었다 — 그
            // 패널에 포커스가 없는 동안 벌어진 외부 동기화 트랜잭션은 트리거 판정에서 제외한다.
            if (tr.getMeta("preventUpdate")) return INACTIVE;

            const { selection } = tr;
            if (!selection.empty) return INACTIVE;

            const $from = selection.$from;
            if ($from.parent.type.name !== "paragraph") return INACTIVE;

            const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
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
