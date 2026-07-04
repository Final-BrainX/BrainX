import { ListItem, TaskItem } from "@tiptap/extension-list";
import { Fragment, type Node as PMNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/core";

const NESTED_LIST_TYPES = new Set(["bulletList", "orderedList", "taskList"]);

/**
 * 버그 재현(Playwright): "- 작성1" 끝에서 Enter를 누르면 ProseMirror의 표준 split이 "작성1"이
 * 갖고 있던 트레일링 하위 목록(하위작성1)을 전부 새로 생긴 빈 형제 항목 쪽으로 넘겨준다 —
 * 이 중간 상태 자체는 화면에 정상적으로(같은 레벨의 새 항목 + 그 아래 하위작성1) 보이고
 * 사용자도 문제 삼지 않았다. 문제는 그다음: 이 빈 항목에서 Tab을 누르면 표준 sinkListItem이
 * "항목 전체"(빈 문단 + 그 항목이 떠안고 있던 하위 목록)를 통째로 한 단계 더 안으로 밀어 넣어,
 * 원래 형제였던 하위작성1이 두 단계나 깊어진다(작성1 > 추가된 하위작성2 > 하위작성1).
 *
 * customSink는 정확히 이 패턴(현재 항목이 자신의 트레일링 중첩 목록을 이미 갖고 있고, 앞에
 * sink해 들어갈 형제가 있는 경우)만 감지해서, 새 항목만 그 형제의 하위 목록으로 들여쓰고
 * 트레일링 중첩 목록(하위작성1)은 형제로 유지한다. 이 패턴이 아니면(가장 흔한 일반적인 Tab)
 * 그대로 표준 sinkListItem에 위임하므로, 이 특정 케이스 밖에서는 동작이 전혀 바뀌지 않는다.
 * 문서 모양이 예상과 다르면(스키마 변형 등) try/catch로 표준 동작으로 안전하게 되돌아간다.
 */
function customSink(itemTypeName: string) {
  return ({ editor }: { editor: Editor }) => {
    const { state } = editor;
    const { $from, $to } = state.selection;
    if (!$from.sameParent($to)) return editor.commands.sinkListItem(itemTypeName);

    const itemType = state.schema.nodes[itemTypeName];
    if (!itemType) return false;

    let itemDepth = -1;
    for (let d = $from.depth; d > 0; d -= 1) {
      if ($from.node(d).type === itemType) {
        itemDepth = d;
        break;
      }
    }
    if (itemDepth === -1) return editor.commands.sinkListItem(itemTypeName);

    const listDepth = itemDepth - 1;
    if (listDepth < 0) return editor.commands.sinkListItem(itemTypeName);
    const list = $from.node(listDepth);
    const itemIndex = $from.index(listDepth);
    if (itemIndex === 0) return editor.commands.sinkListItem(itemTypeName);

    const cur = $from.node(itemDepth);
    const curLastChild: PMNode | null = cur.childCount > 0 ? cur.child(cur.childCount - 1) : null;
    const curHasTrailingList = !!curLastChild && cur.childCount > 1 && NESTED_LIST_TYPES.has(curLastChild.type.name);
    if (!curHasTrailingList || !curLastChild) return editor.commands.sinkListItem(itemTypeName);

    try {
      const prevSibling = list.child(itemIndex - 1);

      const listContentStart = $from.start(listDepth);
      let pos = listContentStart;
      for (let i = 0; i < itemIndex - 1; i += 1) pos += list.child(i).nodeSize;
      const prevStart = pos;
      const prevEnd = prevStart + prevSibling.nodeSize;
      const curEnd = prevEnd + cur.nodeSize;

      const curNestedList = curLastChild;
      const curOwnContent = cur.content.cut(0, cur.content.size - curNestedList.nodeSize);
      const newItem = itemType.create(cur.attrs, curOwnContent);

      const prevLastChild: PMNode | null = prevSibling.childCount > 0 ? prevSibling.child(prevSibling.childCount - 1) : null;
      const prevHasNestedList = !!prevLastChild && NESTED_LIST_TYPES.has(prevLastChild.type.name);

      const mergedChildren: PMNode[] = [];
      if (prevHasNestedList && prevLastChild) {
        prevLastChild.forEach((child) => mergedChildren.push(child));
      }
      mergedChildren.push(newItem);
      curNestedList.forEach((child) => mergedChildren.push(child));

      const mergedListType = prevHasNestedList && prevLastChild ? prevLastChild.type : curNestedList.type;
      const mergedListAttrs = prevHasNestedList && prevLastChild ? prevLastChild.attrs : curNestedList.attrs;
      const mergedList = mergedListType.create(mergedListAttrs, Fragment.fromArray(mergedChildren));

      const prevOwnContent = prevHasNestedList && prevLastChild
        ? prevSibling.content.cut(0, prevSibling.content.size - prevLastChild.nodeSize)
        : prevSibling.content;
      const newPrevSibling = prevSibling.type.create(prevSibling.attrs, prevOwnContent.append(Fragment.from(mergedList)));

      const skipExisting = prevHasNestedList && prevLastChild ? prevLastChild.content.size : 0;
      const newItemContentPos = prevStart + 1 + prevOwnContent.size + 1 + skipExisting + 1;

      const tr = state.tr.replaceWith(prevStart, curEnd, newPrevSibling);
      tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(newItemContentPos, tr.doc.content.size))));
      editor.view.dispatch(tr);
      return true;
    } catch {
      return editor.commands.sinkListItem(itemTypeName);
    }
  };
}

/** StarterKit 번들 ListItem 대신 쓰는 버전 — Tab만 위 customSink로 바꾸고 나머지(Enter,
    Shift-Tab→liftListItem 등)는 그대로 상속한다. StarterKit.configure({ listItem: false })로
    번들 버전을 끄고 이 확장을 NOTE_EDITOR_EXTENSIONS에 별도로 추가해서 쓴다. */
export const ListItemTabFix = ListItem.extend({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Tab: customSink(this.name),
    };
  },
});

/** TaskItem도 동일한 패턴 — 기존 .configure({ nested: true })는 이 확장에 그대로 이어서 쓰면 된다. */
export const TaskItemTabFix = TaskItem.extend({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Tab: customSink(this.name),
    };
  },
});
