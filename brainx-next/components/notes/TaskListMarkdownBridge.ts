import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

// TaskItem(@tiptap/extension-list)의 기본 입력 규칙은 "[ ] "(대시 없이)만 인식한다 — 대시를
// 포함한 표준 GFM 문법 "- [ ] "을 한 글자씩 입력하면, 두 번째 글자(공백)에서 먼저 BulletList의
// "- " 입력 규칙이 발동해 문서가 이미 bulletList>listItem>paragraph 구조로 바뀐 뒤이므로,
// TaskItem의 wrappingInputRule이 "[ ] "을 보는 시점엔 이미 listItem 안이라 변환이 실패한다
// (listItem.content="paragraph block*"라 첫 자식 자리를 taskList로 감쌀 수 없음 — findWrapping이
// null을 반환). 이 확장은 "리스트 안에서 그 줄이 사실 체크박스였다"는 사실이 뒤늦게(닫는 "]" 다음
// 공백을 입력하는 시점에) 드러났을 때, 해당 listItem만 리스트에서 들어내(liftListItem) 새
// taskList로 다시 감싸는(toggleTaskList) 후속 변환을 수행해 "- [ ] "/"- [x] " 입력을 그대로
// 지원한다.
const TASK_LINE_RE = /^\[([ xX])\]\s$/;

export const TaskListMarkdownBridge = Extension.create({
  name: "taskListMarkdownBridge",

  addProseMirrorPlugins() {
    const { editor } = this;

    return [
      new Plugin({
        key: new PluginKey("taskListMarkdownBridge"),
        view() {
          let scheduled = false;
          return {
            update(view, prevState) {
              if (scheduled) return;
              if (view.state.doc === prevState.doc) return;
              if (!view.state.selection.empty) return;

              const $from = view.state.selection.$from;
              if ($from.parent.type.name !== "paragraph") return;
              if ($from.depth < 2) return;

              const listItem = $from.node($from.depth - 1);
              if (listItem.type.name !== "listItem") return;
              // 변환 대상 문단이 list item의 유일한 자식일 때만(중첩된 하위 목록이 없을 때만) 처리.
              if (listItem.childCount !== 1) return;

              const text = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
              const match = TASK_LINE_RE.exec(text);
              if (!match) return;

              const checked = match[1].toLowerCase() === "x";
              const delFrom = $from.pos - match[0].length;
              const delTo = $from.pos;

              scheduled = true;
              // appendTransaction이 아니라 view 업데이트 이후 별도 트랜잭션으로 처리한다 —
              // liftListItem + toggleTaskList는 여러 단계의 ProseMirror 변환을 조합한 커맨드라
              // 같은 update 콜백 안에서 즉시 재호출하면 아직 반영되지 않은 view 상태를 참조하게 됨.
              queueMicrotask(() => {
                scheduled = false;
                editor
                  .chain()
                  .deleteRange({ from: delFrom, to: delTo })
                  .liftListItem("listItem")
                  .toggleTaskList()
                  .run();

                if (checked) {
                  const $sel = editor.state.selection.$from;
                  for (let d = $sel.depth; d >= 0; d -= 1) {
                    if ($sel.node(d).type.name === "taskItem") {
                      const pos = $sel.before(d);
                      editor.view.dispatch(
                        editor.state.tr.setNodeMarkup(pos, undefined, { checked: true })
                      );
                      break;
                    }
                  }
                }
              });
            },
          };
        },
      }),
    ];
  },
});
