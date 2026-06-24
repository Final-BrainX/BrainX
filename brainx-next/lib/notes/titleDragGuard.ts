/** 노트 제목 입력창 안에서 마우스 드래그(mousedown~mouseup)가 진행 중인지 추적하는 전역
    플래그. `EditorPanel.tsx`의 제목 input이 mousedown에서 켜고, window의 capture 단계
    mouseup에서 끈다(제목 input 자신의 mouseup은 stopPropagation 되어 있어, 드래그가 입력창
    경계를 벗어나 다른 곳에서 끝나는 경우에도 놓치지 않으려면 capture 단계 window 리스너가
    필요하다). `NoteEditor.tsx`의 버블 메뉴/선택 추적 로직은 이 플래그가 true인 동안 자신의
    selection 상태를 전혀 건드리지 않는다(보이거나 숨기거나 focus를 가져가지 않음) — 제목은
    제목 컴포넌트 안에서만 독립적으로 selection/focus를 관리해야 하고, 본문 에디터 쪽 로직이
    그 사이에 끼어들 여지를 원천적으로 차단한다. */
export const titleDragGuard = { active: false };
