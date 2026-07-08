"use client";

import { createContext, useContext } from "react";
import { normalizeTitleForMatch } from "@/lib/wiki-links";

export interface WikiLinkNoteRef {
  id: string;
  title: string;
  /** 자동완성 후보에 폴더 경로를 보조 텍스트로 보여주기 위한 값 — 최상위 노트는 null. */
  folderId: string | null;
}

export interface WikiLinkFolderRef {
  id: string;
  name: string;
  parentFolderId: string | null;
}

export interface WikiLinkContextValue {
  /** 자동완성 목록/존재 여부 확인에 쓰는 전체 노트 제목 목록(가벼운 참조만). */
  notes: WikiLinkNoteRef[];
  /** 후보의 폴더 경로("Backend / Spring")를 계산하기 위한 가벼운 폴더 참조 목록. */
  folders: WikiLinkFolderRef[];
  /** 제목으로 노트를 찾는다 — 정확히 일치하는 제목이 없으면, 그 제목을 포함하는 노트가
      유일할 때만 그 노트로 간주한다("Spring"만 입력해도 "Spring 정리"를 찾아주는 식 —
      Obsidian의 퍼지 매칭과 비슷한 타협, 단순 텍스트 치환이 아니라 실제 노트 목록을 본다). */
  resolveTitle: (title: string) => WikiLinkNoteRef | null;
  /** 존재하는 노트로 이동(활성 패널에 연다). */
  onNavigate: (title: string) => void;
  /** 존재하지 않는 노트를 그 제목으로 즉시 생성하고 연다. sourceHtml을 주면(자동완성이 방금
      `[[title]]`을 넣은 직후 editor.getHTML()을 그 자리에서 바로 읽은 값) 호출부가 나중에
      activeEditorHandle.getHTML()을 다시 읽지 않고 이 값을 그대로 신뢰한다 — 삽입과 읽기
      사이의 시간차(리렌더/탭 전환 등)를 최대한 없애기 위함이다. 없으면(예: 이미 존재하는
      깨진 링크의 "생성" 클릭처럼 "방금 입력"이 아닌 경우) 기존처럼 활성 에디터에서 다시 읽는다. */
  onCreate: (title: string, sourceHtml?: string) => void;
}

export const WikiLinkContext = createContext<WikiLinkContextValue | null>(null);

export function useWikiLinkContext() {
  return useContext(WikiLinkContext);
}

export function normalizeWikiLinkText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeWikiLinkText(item)).join(" ").trim();
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("title" in record) return normalizeWikiLinkText(record.title);
    if ("text" in record) return normalizeWikiLinkText(record.text);
    if ("value" in record) return normalizeWikiLinkText(record.value);
  }
  return "";
}

export function normalizeOptionalWikiLinkText(value: unknown): string | null {
  const normalized = normalizeWikiLinkText(value).trim();
  return normalized || null;
}

/** 정확히 일치 → 부분 일치(유일할 때만) 순서로 찾는다. 공유 로직이라 Context value를 만드는
    쪽(NotesWorkspace)과 자동완성 쪽(WikiLinkAutocomplete) 모두 이 함수를 쓴다.
    normalizeTitleForMatch로 노트 제목 앞의 이모지 아이콘(📄, 🔲 등)을 무시한다 — 링크 텍스트
    쪽에는 보통 이모지가 없어서, 이 정규화가 없으면 이모지가 붙은 제목의 노트는 exact match가
    항상 실패하고 이름이 겹치는 다른 노트가 있으면 partial match도 실패해 "새 노트 생성"
    상태(주황색)로 잘못 표시된다. */
export function resolveWikiLinkTitle(notes: WikiLinkNoteRef[], title: unknown): WikiLinkNoteRef | null {
  const needle = normalizeTitleForMatch(normalizeWikiLinkText(title));
  if (!needle) return null;
  const exact = notes.find((n) => normalizeTitleForMatch(normalizeWikiLinkText(n.title)) === needle);
  if (exact) return exact;
  const partial = notes.filter((n) => normalizeTitleForMatch(normalizeWikiLinkText(n.title)).includes(needle));
  return partial.length === 1 ? partial[0] : null;
}

/** folderId → "Backend / Spring" 형태의 경로 문자열. 최상위(folderId가 null이거나 folders에서
    못 찾음)면 null을 돌려줘서 호출부가 보조 텍스트 자체를 생략할 수 있게 한다. 부모 체인이
    끊기거나 순환 참조가 있어도(방어적으로 20단계에서 끊음) 죽지 않고 그때까지 모은 경로만
    돌려준다 — "폴더 경로 계산 실패 시 UI 깨지지 않기" 요구사항. */
export function folderPathOf(folders: WikiLinkFolderRef[], folderId: string | null): string | null {
  if (!folderId) return null;
  const byId = new Map(folders.map((f) => [f.id, f]));
  const names: string[] = [];
  let current = byId.get(folderId);
  let guard = 0;
  while (current && guard < 20) {
    names.unshift(current.name);
    current = current.parentFolderId ? byId.get(current.parentFolderId) : undefined;
    guard += 1;
  }
  return names.length ? names.join(" / ") : null;
}
