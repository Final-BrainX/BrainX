"use client";

import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";

const dragHandleKey = new PluginKey("dragHandle");

type BlockRef = { pos: number; node: ProseMirrorNode };

const BLOCK_DRAG_START_EVENT = "brainx:block-drag-start";

/** ImageBlock/PdfBlock/HtmlBlock처럼 자체 NodeView를 가진 atom 블록이 네이티브 HTML5 드래그
    대신 이 ⠿ 손잡이와 같은 휠-호환 드래그 시스템을 쓰고 싶을 때 호출한다(노션이 이미지를
    네이티브 드래그가 아니라 자체 마우스 이벤트로 옮기는 것과 같은 이유 — 네이티브 드래그
    중에는 브라우저가 'wheel' 이벤트를 보내지 않는다). dragHandlePlugin이 window에서 이
    이벤트를 받아 일반 ⠿ 손잡이를 잡았을 때와 동일한 드래그 상태로 전환한다. */
export function startBlockDrag(pos: number) {
  window.dispatchEvent(new CustomEvent(BLOCK_DRAG_START_EVENT, { detail: { pos } }));
}

/** 노트 본문에서 "옮길 수 있는 블록 하나"를 찾는다 — 문서 최상위 블록이거나, 다단 컬럼
    블록(Column) 바로 안의 블록이어야 한다. $pos에서 시작해 바깥쪽으로 올라가다가 그 조건을
    처음 만족하는 깊이를 채택한다(중첩이 더 깊으면 그 컨테이너 전체를 통째로 옮긴다 —
    splitBlockIntoColumns의 depth===1 제약과 같은 단순화). */
function findMovableBlock($pos: ResolvedPos): BlockRef | null {
  for (let depth = $pos.depth; depth >= 1; depth -= 1) {
    const container = $pos.node(depth - 1);
    if (depth === 1 || container.type.name === "column") {
      return { pos: $pos.before(depth), node: $pos.node(depth) };
    }
  }
  return null;
}

/** view.dom(.ProseMirror)에서 시작해 실제로 스크롤되는 조상 엘리먼트를 찾는다. */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const style = getComputedStyle(node);
    if ((style.overflowY === "auto" || style.overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * 이미지/PDF/HTML 블록이나 선택한 텍스트를 끄는 건 우리 손잡이가 아니라 브라우저 네이티브
 * HTML5 드래그앤드롭이다(ImageBlock 등의 draggable:true + data-drag-handle, 텍스트 선택은
 * 에디터 기본 동작). 실측해보니 네이티브 드래그가 진행되는 동안에는 'wheel' 이벤트 자체가
 * 전혀 발생하지 않는다(크로미움 공통 동작, JS로 막을 수 있는 종류가 아님) — 그래서 같은 휠
 * 동기화 방식을 여기 적용할 수 없다. 대신 네이티브 드래그 중 계속 발생하는 'dragover'를 써서,
 * 마우스가 스크롤 영역 위/아래 가장자리에 가까워지면 자동으로 스크롤한다.
 */
function nativeDragAutoScroll(view: EditorView) {
  const EDGE = 60;
  const MAX_SPEED = 18;
  let direction = 0;
  let speed = 0;
  let timer: number | null = null;

  function tick() {
    const scrollParent = findScrollParent(view.dom as HTMLElement);
    if (!scrollParent || direction === 0) return;
    scrollParent.scrollTop += direction * speed;
  }

  function start() {
    if (timer != null) return;
    timer = window.setInterval(tick, 16);
  }

  function stop() {
    if (timer != null) { window.clearInterval(timer); timer = null; }
    direction = 0;
  }

  function onDragOver(event: DragEvent) {
    const scrollParent = findScrollParent(view.dom as HTMLElement);
    if (!scrollParent) { stop(); return; }
    const rect = scrollParent.getBoundingClientRect();
    const distanceFromTop = event.clientY - rect.top;
    const distanceFromBottom = rect.bottom - event.clientY;

    if (event.clientY < rect.top || event.clientY > rect.bottom) {
      stop();
    } else if (distanceFromTop < EDGE) {
      direction = -1;
      speed = MAX_SPEED * (1 - Math.max(0, distanceFromTop) / EDGE);
      start();
    } else if (distanceFromBottom < EDGE) {
      direction = 1;
      speed = MAX_SPEED * (1 - Math.max(0, distanceFromBottom) / EDGE);
      start();
    } else {
      stop();
    }
  }

  window.addEventListener("dragover", onDragOver);
  window.addEventListener("dragend", stop);
  window.addEventListener("drop", stop);

  return () => {
    stop();
    window.removeEventListener("dragover", onDragOver);
    window.removeEventListener("dragend", stop);
    window.removeEventListener("drop", stop);
  };
}

function dragHandlePlugin(editor: Editor) {
  return new Plugin({
    key: dragHandleKey,
    view(view: EditorView) {
      const handle = document.createElement("div");
      handle.className = "split-drag-handle";
      handle.contentEditable = "false";
      handle.textContent = "⠿";
      document.body.appendChild(handle);

      const indicator = document.createElement("div");
      indicator.className = "split-drag-indicator";
      document.body.appendChild(indicator);

      let hovered: BlockRef | null = null;
      let dragSource: BlockRef | null = null;
      let dropTargetPos: number | null = null;
      let lastClientX = 0;
      let lastClientY = 0;
      let ghost: HTMLElement | null = null;
      let dimmedDom: HTMLElement | null = null;

      /** 네이티브 드래그의 "반투명 미리보기가 커서를 따라다니는" 느낌을 직접 만든다 — 우리
          드래그는 네이티브 HTML5 DnD가 아니라 일반 마우스 이벤트라 그 기본 제공 고스트가 없다.
          원본 블록의 DOM을 그대로 복제해 옅게 띄우고, 원본은 옮기는 동안 흐리게 해서 "들어
          올려졌다"는 느낌을 준다. iframe(PDF/HTML 블록)은 복제하면 새로 로드되어 무겁고
          깜빡이므로 자리표시자로 바꿔치기한다. */
      function startGhost(target: BlockRef) {
        const sourceDom = view.nodeDOM(target.pos) as HTMLElement | null;
        ghost = document.createElement("div");
        ghost.className = "split-drag-ghost";
        if (sourceDom) {
          dimmedDom = sourceDom;
          sourceDom.style.opacity = "0.35";

          const clone = sourceDom.cloneNode(true) as HTMLElement;
          clone.querySelectorAll("iframe").forEach((el) => {
            const placeholder = document.createElement("div");
            placeholder.className = "split-drag-ghost-placeholder";
            placeholder.textContent = "…";
            el.replaceWith(placeholder);
          });
          clone.querySelectorAll("[contenteditable]").forEach((el) => el.removeAttribute("contenteditable"));
          const rect = sourceDom.getBoundingClientRect();
          ghost.style.width = `${Math.min(rect.width, 360)}px`;
          ghost.appendChild(clone);
        } else {
          ghost.classList.add("split-drag-ghost-fallback");
          ghost.textContent = "블록 이동 중…";
        }
        document.body.appendChild(ghost);
        positionGhost(lastClientX, lastClientY);
      }

      function positionGhost(clientX: number, clientY: number) {
        if (!ghost) return;
        ghost.style.left = `${clientX + 18}px`;
        ghost.style.top = `${clientY + 14}px`;
      }

      function stopGhost() {
        if (ghost) { ghost.remove(); ghost = null; }
        if (dimmedDom) { dimmedDom.style.opacity = ""; dimmedDom = null; }
      }

      function hideHandle() {
        handle.style.display = "none";
        hovered = null;
      }

      function hideIndicator() {
        indicator.style.display = "none";
        dropTargetPos = null;
      }

      function positionHandle(pos: number) {
        const dom = view.nodeDOM(pos) as HTMLElement | null;
        if (!dom) { hideHandle(); return; }
        const rect = dom.getBoundingClientRect();
        handle.style.left = `${rect.left - 22}px`;
        handle.style.top = `${rect.top + 2}px`;
        handle.style.display = "flex";
      }

      function updateDropIndicator(clientX: number, clientY: number) {
        const coords = view.posAtCoords({ left: clientX, top: clientY });
        if (!coords) { hideIndicator(); return; }
        const $pos = view.state.doc.resolve(coords.pos);
        const target = findMovableBlock($pos);
        if (!target) { hideIndicator(); return; }
        const dom = view.nodeDOM(target.pos) as HTMLElement | null;
        if (!dom) { hideIndicator(); return; }

        const rect = dom.getBoundingClientRect();
        const before = clientY < rect.top + rect.height / 2;
        const targetPos = before ? target.pos : target.pos + target.node.nodeSize;

        if (dragSource && targetPos > dragSource.pos && targetPos < dragSource.pos + dragSource.node.nodeSize) {
          hideIndicator();
          return;
        }

        dropTargetPos = targetPos;
        indicator.style.left = `${rect.left}px`;
        indicator.style.width = `${rect.width}px`;
        indicator.style.top = `${(before ? rect.top : rect.bottom) - 1}px`;
        indicator.style.display = "block";
      }

      function onMouseMove(event: MouseEvent) {
        lastClientX = event.clientX;
        lastClientY = event.clientY;
        if (!editor.isEditable) { hideHandle(); return; }
        if (dragSource) {
          updateDropIndicator(event.clientX, event.clientY);
          positionGhost(event.clientX, event.clientY);
          return;
        }
        // 손잡이 자체가 본문 영역 왼쪽 바깥(positionHandle의 left: rect.left - 22)에 떠 있어서,
        // 좌측 경계를 본문 rect 그대로 쓰면 마우스가 손잡이로 다가가는 순간 "에디터 밖"으로
        // 판정돼 숨어버려 클릭(드래그 시작)할 기회조차 없었다 — 손잡이 너비만큼 여유를 둔다.
        const editorRect = view.dom.getBoundingClientRect();
        const leftMargin = 32;
        if (
          event.clientX < editorRect.left - leftMargin || event.clientX > editorRect.right ||
          event.clientY < editorRect.top || event.clientY > editorRect.bottom
        ) {
          hideHandle();
          return;
        }
        const coords = view.posAtCoords({ left: Math.max(editorRect.left + 4, event.clientX), top: event.clientY });
        if (!coords) { hideHandle(); return; }
        const $pos = view.state.doc.resolve(coords.pos);
        const found = findMovableBlock($pos);
        if (!found) { hideHandle(); return; }
        hovered = found;
        positionHandle(found.pos);
      }

      function beginDrag(target: BlockRef) {
        dragSource = target;
        document.body.style.cursor = "grabbing";
        hideHandle();
        startGhost(target);
      }

      function onHandleMouseDown(event: MouseEvent) {
        if (!hovered || !editor.isEditable) return;
        event.preventDefault();
        beginDrag(hovered);
      }

      function onBlockDragStartRequest(event: Event) {
        if (!editor.isEditable) return;
        const pos = (event as CustomEvent<{ pos: number }>).detail?.pos;
        if (pos == null) return;
        const node = view.state.doc.nodeAt(pos);
        if (!node) return;
        beginDrag({ pos, node });
      }

      function onMouseUp() {
        if (dragSource && dropTargetPos != null) {
          const { pos: sourcePos, node: sourceNode } = dragSource;
          const sourceEnd = sourcePos + sourceNode.nodeSize;
          const targetPos = dropTargetPos;
          if (targetPos < sourcePos || targetPos > sourceEnd) {
            const tr = view.state.tr;
            tr.delete(sourcePos, sourceEnd);
            const mappedTarget = tr.mapping.map(targetPos);
            tr.insert(mappedTarget, sourceNode);
            view.dispatch(tr);
          }
        }
        dragSource = null;
        document.body.style.cursor = "";
        hideIndicator();
        stopGhost();
      }

      // 드래그 중에 마우스 휠로 스크롤하면 그 휠 스크롤 자체는 브라우저가 그대로 처리하지만
      // (우리가 막는 게 없음), 손잡이/드롭 인디케이터는 마지막 mousemove 좌표 기준 위치에 그대로
      // 멈춰 있어서 스크롤된 화면과 어긋난다. scroll 이벤트는 버블링하지 않으므로 window에
      // capture:true로 걸어 어떤 스크롤 컨테이너에서 발생하든 잡고, 마지막 마우스 좌표로
      // 다시 계산해 위치를 맞춘다.
      function onScroll() {
        if (dragSource) {
          updateDropIndicator(lastClientX, lastClientY);
        } else if (hovered) {
          positionHandle(hovered.pos);
        }
      }

      handle.addEventListener("mousedown", onHandleMouseDown);
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener(BLOCK_DRAG_START_EVENT, onBlockDragStartRequest);
      const stopNativeDragAutoScroll = nativeDragAutoScroll(view);

      return {
        destroy() {
          handle.removeEventListener("mousedown", onHandleMouseDown);
          window.removeEventListener("mousemove", onMouseMove);
          window.removeEventListener("mouseup", onMouseUp);
          window.removeEventListener("scroll", onScroll, true);
          window.removeEventListener(BLOCK_DRAG_START_EVENT, onBlockDragStartRequest);
          stopNativeDragAutoScroll();
          handle.remove();
          indicator.remove();
        },
      };
    },
  });
}

/** 노션처럼 블록 왼쪽에 호버하면 뜨는 "⠿" 손잡이로 블록을 드래그해 다른 위치(최상위 또는
    다단 컬럼의 다른 칸)로 옮기는 기능. 네이티브 HTML5 드래그 대신 mousedown/mousemove/mouseup
    조합으로 직접 구현했다 — 손잡이가 ProseMirror contenteditable 영역 바깥(document.body)에
    붙는 플로팅 엘리먼트라 브라우저의 기본 dragstart가 그 위치를 알 길이 없기 때문이다. */
export const DragHandle = Extension.create({
  name: "dragHandle",
  addProseMirrorPlugins() {
    return [dragHandlePlugin(this.editor)];
  },
});
