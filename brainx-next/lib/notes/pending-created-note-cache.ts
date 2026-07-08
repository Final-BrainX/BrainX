/** 새 노트를 만든 직후 프론트 화면(노트 탐색기/에디터/그래프)에서는 이미 존재하는 것처럼
    보여야 하지만, 실제 서버 저장(draft/persisted note 저장, 위키링크의 경우 NoteLink 생성,
    graph projection 재계산)은 그 뒤에 비동기로 따라온다. 이 시간차 동안:
    - NotesWorkspace(같은 세션 안)는 이미 로컬 notes[] state로 즉시 반영되므로 문제없다.
    - 하지만 /graph는 완전히 별도로 마운트되는 페이지라, 그 사이(예: 새 노트 생성 직후 바로
      /graph로 이동)에 마운트되면 서버가 아직 그 노트를 모르는 상태로 그래프를 그린다.
    이 모듈은 그 간극을 메우기 위해 "방금 만든 노트"를 sessionStorage에 짧게 기록해두고,
    graph-screen.tsx가 마운트/새로고침될 때 이 기록을 읽어 optimistic node로 병합할 수 있게
    한다. sessionStorage를 쓰는 이유: 같은 탭(세션) 안에서만 유효하면 충분하고, 다른 탭/기기의
    실제 서버 데이터와 섞일 위험이 없다.

    위키링크로 만든 노트(sourceNoteId가 있는 경우)는 여기에 더해 optimistic edge(노트1→A
    연결선)도 함께 합성할 수 있다 — graph-screen.tsx의 pendingWikiLinkEntryToEdge 참고.
    일반 "+ 새 노트"/우클릭 새 노트처럼 연결할 대상이 없는 생성은 sourceNoteId를 비워두면
    node만 optimistic 처리되고 edge는 만들어지지 않는다. createNote(NotesWorkspace.tsx)
    하나가 위키링크 여부와 무관하게 모든 새 노트 생성에서 이 캐시를 기록하므로, 두 경로가
    별도 캐시/로직으로 갈라지지 않는다. */
"use client";

const STORAGE_KEY = "brainx_pending_created_notes_v1";
/** 이 시간(10분) 안에 서버가 못 따라오면 낡은 optimistic 기록으로 보고 버린다 — 무한정 쌓이거나
    아주 오래된(예: 실패해서 다시 시도하지 않은) 항목이 그래프에 계속 유령처럼 남지 않게 한다. */
const TTL_MS = 10 * 60 * 1000;

export interface PendingCreatedNoteEntry {
  /** 생성 시점에 할당된 로컬 id — noteId는 draft id가 확정되며 나중에 바뀌지만, localKey는
      그 항목을 계속 같은 것으로 식별하기 위해 끝까지 바뀌지 않는다. */
  localKey: string;
  /** 지금까지 알려진 가장 최신 노트 id(처음엔 localKey와 동일, draft id 확정 후 교체됨). */
  noteId: string;
  title: string;
  /** 생성 당시의 Workspace(documentGroup) 경계. /graph가 완전히 별도 마운트되더라도
      현재 Workspace가 바뀐 뒤 다른 Workspace 그래프에 잠깐 섞이지 않게 하기 위해 함께 저장한다. */
  documentGroupId?: string | null;
  /** 위키링크로 만든 경우에만 채워진다 — 있으면 graph-screen이 optimistic edge도 합성한다.
      일반 새 노트 생성은 undefined로 두어 node만 optimistic 처리한다. */
  sourceNoteId?: string;
  sourceTitle?: string;
  createdAt: number;
}

function readAll(): PendingCreatedNoteEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    const fresh = parsed.filter(
      (entry): entry is PendingCreatedNoteEntry =>
        !!entry &&
        typeof entry === "object" &&
        typeof (entry as PendingCreatedNoteEntry).localKey === "string" &&
        typeof (entry as PendingCreatedNoteEntry).noteId === "string" &&
        (((entry as PendingCreatedNoteEntry).documentGroupId ?? null) === null ||
          typeof (entry as PendingCreatedNoteEntry).documentGroupId === "string") &&
        typeof (entry as PendingCreatedNoteEntry).createdAt === "number" &&
        now - (entry as PendingCreatedNoteEntry).createdAt < TTL_MS
    );
    if (fresh.length !== parsed.length) writeAll(fresh);
    return fresh;
  } catch {
    return [];
  }
}

function writeAll(entries: PendingCreatedNoteEntry[]) {
  if (typeof window === "undefined") return;
  try {
    if (entries.length === 0) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // sessionStorage 실패(쿼터 초과 등)는 무시 — optimistic 표시만 못 할 뿐 기능 자체는 유지된다.
  }
}

/** 새 노트를 만드는 순간(아직 draft id도 없는 로컬 상태) 기록한다. 위키링크로 만든 경우
    sourceNoteId/sourceTitle을 함께 넘기면 graph-screen이 optimistic edge도 합성한다. */
export function addPendingCreatedNote(entry: PendingCreatedNoteEntry) {
  const all = readAll().filter((e) => e.localKey !== entry.localKey);
  all.push(entry);
  writeAll(all);
}

/** 대상 노트의 draft id/실제 noteId가 확정되는 시점에 갱신한다. */
export function updatePendingCreatedNoteId(localKey: string, realNoteId: string) {
  const all = readAll();
  const idx = all.findIndex((e) => e.localKey === localKey);
  if (idx === -1) return;
  all[idx] = { ...all[idx], noteId: realNoteId };
  writeAll(all);
}

/** 노트 제목이 바뀔 때(handleTitleChange) 호출한다 — 이 노트 자신이 pending 항목의 대상이면
    title을, 이 노트가 다른 pending 항목(위키링크)의 소스 노트였으면 그 항목의 sourceTitle도
    함께 갱신한다. noteId는 호출 시점에 알려진 최신 id를 그대로 넘기면 된다 — localKey/noteId
    양쪽으로 매칭하므로 draft id 확정 전(local id로 리네임)/후(real id로 리네임) 어느 시점에
    이름을 바꿔도 같은 항목을 찾는다. 처음 생성 시점의 "새 노트"/"새 노트1" 같은 기본 제목이
    캐시에 그대로 박제돼, 사용자가 바로 제목을 바꾸고 곧장 /graph로 이동해도 optimistic 노드가
    옛 제목으로 보이던 문제를 막기 위한 함수다. */
export function updatePendingCreatedNoteTitle(noteId: string, title: string) {
  const all = readAll();
  let changed = false;
  const next = all.map((e) => {
    let updated = e;
    if (e.noteId === noteId || e.localKey === noteId) {
      if (updated.title !== title) {
        updated = { ...updated, title };
        changed = true;
      }
    }
    if (e.sourceNoteId === noteId && e.sourceTitle !== title) {
      updated = { ...updated, sourceTitle: title };
      changed = true;
    }
    return updated;
  });
  if (changed) writeAll(next);
}

/** localKey 기준 제거 — 생성 쪽(NotesWorkspace)에서 서버 NoteLink 생성까지 성공을 확인했을 때
    (위키링크 경로). */
export function removePendingCreatedNote(localKey: string) {
  const all = readAll().filter((e) => e.localKey !== localKey);
  writeAll(all);
}

/** noteId 기준 제거 — 그래프 쪽(graph-screen)에서 서버가 이미 이 노트를 알고 있음을 확인했을 때.
    localKey를 모르는 소비자를 위한 보조 경로(서버가 확인해준 이상 sessionStorage에도 미리
    저장해둔 기록을 정리해, 다음 마운트에서 중복 optimistic 삽입이 일어나지 않게 한다). */
export function removePendingCreatedNoteByNoteId(noteId: string) {
  const all = readAll().filter((e) => e.noteId !== noteId);
  writeAll(all);
}

export function readPendingCreatedNotes(): PendingCreatedNoteEntry[] {
  return readAll();
}

/** actor(guest/user) 전환 시 — 이전 세션의 항목이 다음 세션에 잘못 섞이지 않도록 전부 비운다. */
export function clearPendingCreatedNotes() {
  writeAll([]);
}
