"use client";

import Link from "next/link";
import type { KeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useGuideStore } from "@/lib/use-guide-store";
import { useBrainX } from "@/components/brainx-provider";
import { Avatar, Badge, Btn, Icon, ThemeToggle } from "@/components/brainx-ui";
import { BrandLogo } from "@/components/brand-logo";
import { AccountSettingsModal } from "@/components/utility/account-settings-modal";
import CreateWorkspaceModal from "@/components/notes/CreateWorkspaceModal";
import WorkspaceSwitcher from "@/components/notes/WorkspaceSwitcher";
import { useWorkspace } from "@/components/workspace-provider";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import type { BrainXNote } from "@/lib/brainx-data";
import { addPopupResultListener } from "@/lib/desktop-bridge";
import { cx, stripMarkdown } from "@/lib/utils";
import { matchesWorkspaceScope } from "@/lib/workspace-api";
import {
  semanticSearch,
  AiUsageLimitExceededError,
  type SemanticSearchData,
} from "@/lib/intelligence-api";
import { formatCreditCount, formatTokenPercent } from "@/lib/token-usage";
import {
  buildAuthPath,
  clearAuthSession,
  isDevAuthSession,
  isSameAuthSession,
  readAuthSession,
  type AuthSession,
} from "@/lib/auth-api";
import {
  getAiUsage,
  getMySubscription,
  PAYMENT_RESULT_MESSAGE_TYPE,
  type AiUsageData,
  type Subscription,
} from "@/lib/commerce-api";
import {
  AuthRequiredError,
  deleteMyNotification,
  getMyNotifications,
  getMyProfile,
  markAllMyNotificationsRead,
  markMyNotificationRead,
  type MyNotification,
} from "@/lib/user-api";

const NAV = [
  {
    id: "home",
    labelKey: "nav.home" as const,
    icon: "home" as const,
    path: "/home",
  },
  {
    id: "notes",
    labelKey: "nav.notes" as const,
    icon: "notes" as const,
    path: "/notes",
  },
  {
    id: "graph",
    labelKey: "nav.graph" as const,
    icon: "graph" as const,
    path: "/graph",
  },
  {
    id: "chat",
    labelKey: "nav.chat" as const,
    icon: "chat" as const,
    path: "/chat",
  },
  {
    id: "agent",
    labelKey: "nav.agent" as const,
    icon: "brain" as const,
    path: "/agent",
  },
];

type SettingsTab =
  | "profile"
  | "general"
  | "style"
  | "notifications"
  | "apiKeys"
  | "import"
  | "usage"
  | "stats"
  | "support"
  | "upgrade";

function isActive(pathname: string, path: string) {
  if (path === "/notes") return pathname.startsWith("/notes");
  return pathname === path;
}

function planLabel(subscription: Subscription | null) {
  if (
    !subscription ||
    subscription.status === "FREE" ||
    subscription.status === "CANCELLED" ||
    subscription.plan.planId === "free"
  ) {
    return "Free";
  }

  const name = subscription.plan.name.trim();
  return name === "무료" ? "Free" : name || "Free";
}

const SEARCH_FILTERS = [
  "최신순",
  "오래된순",
  "제목 기준",
  "내용 기준",
  "기간 검색",
] as const;
const SEARCH_RESULT_LIMIT = 8;
const RECENT_RESULT_LIMIT = 5;
const searchDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "2-digit",
  day: "2-digit",
});

type SearchFilter = (typeof SEARCH_FILTERS)[number];
type SearchMatchField =
  | "제목"
  | "본문"
  | "태그"
  | "최근"
  | "의미"
  | "혼합"
  | "키워드";
type SemanticSearchStatus = "idle" | "loading" | "success" | "error";
type SemanticSearchResultItem = SemanticSearchData["results"][number];
type SearchableNote = {
  note: BrainXNote;
  title: string;
  body: string;
  tags: string[];
  normalizedTitle: string;
  normalizedBody: string;
  normalizedTags: string[];
  updatedTime: number;
};
type SearchResult = SearchableNote & {
  matchField: SearchMatchField;
  score: number;
  snippet: string;
};
type DisplaySearchResult = {
  key: string;
  noteId: string;
  title: string;
  snippet: string;
  tags: string[];
  updatedTime: number;
  matchField: SearchMatchField;
  source: "keyword" | "semantic";
  score?: number;
};
type SemanticSearchState = {
  status: SemanticSearchStatus;
  query: string;
  results: SemanticSearchResultItem[];
  error: string | null;
};

function normalizeSearchText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").trim();
}

function parseSearchDate(value: string) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatSearchDate(timestamp: number) {
  if (!timestamp) return "날짜 없음";
  return searchDateFormatter.format(new Date(timestamp));
}

function createSearchSnippet(source: string, query: string) {
  const compact = source.replace(/\s+/g, " ").trim();
  if (!compact) return "본문 미리보기가 없습니다.";
  if (!query) return compact.slice(0, 120);

  const index = normalizeSearchText(compact).indexOf(query);
  if (index < 0) return compact.slice(0, 120);

  const start = Math.max(0, index - 34);
  const end = Math.min(compact.length, index + query.length + 78);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < compact.length ? "…" : "";
  return `${prefix}${compact.slice(start, end)}${suffix}`;
}

function createSearchIndex(notes: BrainXNote[]): SearchableNote[] {
  return notes.map((note) => {
    const title = note.title.trim() || "Untitled";
    const body = stripMarkdown(note.markdown ?? "");
    const tags = note.tags ?? [];
    return {
      note,
      title,
      body,
      tags,
      normalizedTitle: normalizeSearchText(title),
      normalizedBody: normalizeSearchText(body),
      normalizedTags: tags.map(normalizeSearchText),
      updatedTime:
        parseSearchDate(note.updatedAt) || parseSearchDate(note.createdAt),
    };
  });
}

function scoreSearchResult(
  item: SearchableNote,
  query: string,
  filter: SearchFilter,
): SearchResult | null {
  if (!query) {
    return {
      ...item,
      matchField: "최근",
      score: 0,
      snippet: createSearchSnippet(item.body || item.note.summary, query),
    };
  }

  const titleStarts = item.normalizedTitle.startsWith(query);
  const titleIncludes = item.normalizedTitle.includes(query);
  const bodyIncludes = item.normalizedBody.includes(query);
  const tagIncludes = item.normalizedTags.some((tag) => tag.includes(query));

  if (!titleIncludes && !bodyIncludes && !tagIncludes) return null;

  let score = 0;
  let matchField: SearchMatchField = "본문";
  if (titleStarts) {
    score = 100;
    matchField = "제목";
  } else if (titleIncludes) {
    score = 90;
    matchField = "제목";
  } else if (tagIncludes) {
    score = 80;
    matchField = "태그";
  } else if (bodyIncludes) {
    score = 70;
  }

  if (filter === "제목 기준" && titleIncludes) score += 40;
  if (filter === "내용 기준" && bodyIncludes) score += 40;

  const tagSnippet =
    item.tags.length > 0
      ? item.tags.map((tag) => `#${tag}`).join(" ")
      : "태그가 일치했습니다.";
  return {
    ...item,
    matchField,
    score,
    snippet:
      matchField === "제목"
        ? createSearchSnippet(item.body || item.note.summary, "")
        : matchField === "태그"
          ? tagSnippet
          : createSearchSnippet(item.body, query),
  };
}

function sortSearchResults(
  a: SearchResult,
  b: SearchResult,
  filter: SearchFilter,
) {
  if (filter === "오래된순") return a.updatedTime - b.updatedTime;
  if (filter === "최신순" || filter === "기간 검색")
    return b.updatedTime - a.updatedTime;
  return b.score - a.score || b.updatedTime - a.updatedTime;
}

function createKeywordDisplayResult(result: SearchResult): DisplaySearchResult {
  return {
    key: `keyword-${result.note.id}`,
    noteId: result.note.id,
    title: result.title,
    snippet: result.snippet,
    tags: result.tags,
    updatedTime: result.updatedTime,
    matchField: result.matchField,
    source: "keyword",
    score: result.score,
  };
}

function semanticMatchField(
  matchedType: SemanticSearchResultItem["matchedType"],
): SearchMatchField {
  if (matchedType === "HYBRID") return "혼합";
  if (matchedType === "KEYWORD") return "키워드";
  return "의미";
}

function createSemanticDisplayResult(
  result: SemanticSearchResultItem,
  noteById: Map<string, BrainXNote>,
): DisplaySearchResult {
  const note = noteById.get(result.noteId);
  const title = result.title?.trim() || note?.title.trim() || "Untitled";
  const fallbackBody = note
    ? stripMarkdown(note.markdown ?? "") || note.summary
    : "";
  const snippet = createSearchSnippet(
    result.excerpt?.trim() || fallbackBody,
    "",
  );
  return {
    key: `semantic-${result.noteId}`,
    noteId: result.noteId,
    title,
    snippet,
    tags: note?.tags ?? [],
    updatedTime: note
      ? parseSearchDate(note.updatedAt) || parseSearchDate(note.createdAt)
      : 0,
    matchField: semanticMatchField(result.matchedType),
    source: "semantic",
    score: result.score,
  };
}

function isAuthExpiredError(error: unknown) {
  return (
    error instanceof Error && error.message.includes("로그인이 만료되었습니다")
  );
}

function isImeComposing(event: KeyboardEvent<HTMLInputElement>) {
  return event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229;
}

function SearchBar() {
  const [value, setValue] = useState("");
  const [filter, setFilter] = useState<SearchFilter>("최신순");
  const [semantic, setSemantic] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [semanticState, setSemanticState] = useState<SemanticSearchState>({
    status: "idle",
    query: "",
    results: [],
    error: null,
  });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const semanticAbortRef = useRef<AbortController | null>(null);
  const router = useRouter();
  const searchId = useId();
  const { hydrated, notes: allNotes, pushToast, saveStatus, openAiUsageLimitModal } = useBrainX();
  const { currentWorkspaceId, workspaces } = useWorkspace();
  /* Search 정책(§12): 현재 Workspace 내부에서만 검색한다 — NotesExplorer/QuickSwitcher의
     visibleNotes와 동일한 판정(matchesWorkspaceScope)을 재사용한다. currentWorkspaceId가
     null(Guest 또는 Workspace 미선택)이면 항상 전체 notes와 같아져 기존 동작이 그대로
     유지된다. */
  const notes = useMemo(
    () => allNotes.filter((note) => matchesWorkspaceScope(note.documentGroupId, currentWorkspaceId, workspaces)),
    [allNotes, currentWorkspaceId, workspaces]
  );
  const query = normalizeSearchText(value);
  const searchIndex = useMemo(() => createSearchIndex(notes), [notes]);
  const noteById = useMemo(
    () => new Map(notes.map((note) => [note.id, note])),
    [notes],
  );
  const isLoadingNotes =
    !hydrated || (saveStatus === "saving" && notes.length === 0);
  const keywordResults = useMemo(() => {
    const matches = searchIndex
      .map((item) => scoreSearchResult(item, query, filter))
      .filter((item): item is SearchResult => item !== null)
      .sort((a, b) => sortSearchResults(a, b, filter));
    return matches.slice(0, query ? SEARCH_RESULT_LIMIT : RECENT_RESULT_LIMIT);
  }, [filter, query, searchIndex]);
  const keywordDisplayResults = useMemo(
    () => keywordResults.map(createKeywordDisplayResult),
    [keywordResults],
  );
  const semanticDisplayResults = useMemo(
    () =>
      semanticState.results.map((result) =>
        createSemanticDisplayResult(result, noteById),
      ),
    [noteById, semanticState.results],
  );
  const semanticQueryIsCurrent = semanticState.query === query;
  const semanticIsLoading =
    semantic && semanticQueryIsCurrent && semanticState.status === "loading";
  const hasFreshSemanticResponse =
    semantic &&
    query.length >= 2 &&
    semanticQueryIsCurrent &&
    (semanticState.status === "success" || semanticState.status === "error");
  const useSemanticResults =
    semantic &&
    semanticQueryIsCurrent &&
    semanticState.status === "success" &&
    semanticDisplayResults.length > 0;
  const results = useSemanticResults
    ? semanticDisplayResults
    : keywordDisplayResults;
  const activeResult = results[activeIndex] ?? null;
  const panelVisible = resultOpen;
  const semanticStatusLabel = !query
    ? "검색어 입력"
    : query.length < 2
      ? "2글자 이상"
      : semanticIsLoading
        ? "의미 검색 중…"
        : useSemanticResults
          ? `${results.length}개 의미 결과`
          : hasFreshSemanticResponse
            ? "키워드 결과"
            : "Enter로 의미 검색";
  const resultCountLabel = query
    ? `${results.length}개 결과`
    : results.length > 0
      ? "최근 노트"
      : "최근 노트 없음";

  useEffect(() => {
    setActiveIndex(0);
  }, [filter, query, notes.length, semantic]);

  useEffect(() => {
    return () => {
      semanticAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!resultOpen && !filterOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (
        rootRef.current &&
        event.target instanceof Node &&
        !rootRef.current.contains(event.target)
      ) {
        setResultOpen(false);
        setFilterOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [filterOpen, resultOpen]);

  function closeSearch() {
    setResultOpen(false);
    setFilterOpen(false);
  }

  function abortSemanticSearch() {
    semanticAbortRef.current?.abort();
    semanticAbortRef.current = null;
  }

  function openResult(noteId: string) {
    router.push(`/notes/${encodeURIComponent(noteId)}`);
    closeSearch();
  }

  async function runSemanticSearch() {
    if (query.length < 2) {
      pushToast("의미 검색은 2글자 이상 입력해 주세요.", "info");
      setResultOpen(true);
      return;
    }

    const requestQuery = value.trim();
    abortSemanticSearch();
    const controller = new AbortController();
    semanticAbortRef.current = controller;
    setResultOpen(true);
    setSemanticState({
      status: "loading",
      query,
      results: [],
      error: null,
    });

    try {
      // Search 정책(§12): Workspace가 선택돼 있으면(currentWorkspaceId) SSOT가 정의한
      // scope=DOCUMENT_GROUP + documentGroupId로 그 Workspace 안에서만 검색한다. Guest/
      // Workspace 미선택(currentWorkspaceId===null)은 documentGroupId 개념이 없으므로
      // 기존처럼 scope=USER(계정 전체) 그대로 유지한다 — SSOT 설명대로 USER scope에는
      // documentGroupId를 함께 보내지 않는다.
      const result = await semanticSearch(
        currentWorkspaceId
          ? {
              scope: "DOCUMENT_GROUP",
              documentGroupId: currentWorkspaceId,
              query: requestQuery,
              limit: SEARCH_RESULT_LIMIT,
            }
          : {
              scope: "USER",
              query: requestQuery,
              limit: SEARCH_RESULT_LIMIT,
            },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setSemanticState({
        status: "success",
        query,
        results: result.results ?? [],
        error: null,
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof AiUsageLimitExceededError) {
        openAiUsageLimitModal(error.reason);
      } else if (isAuthExpiredError(error)) {
        pushToast((error as Error).message, "err");
      }
      setSemanticState({
        status: "error",
        query,
        results: [],
        error:
          error instanceof Error ? error.message : "의미 검색에 실패했습니다.",
      });
    } finally {
      if (semanticAbortRef.current === controller) {
        semanticAbortRef.current = null;
      }
    }
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSearch();
      return;
    }

    if (
      isImeComposing(event) &&
      ["ArrowDown", "ArrowUp", "Enter"].includes(event.key)
    ) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setResultOpen(true);
      setActiveIndex((current) =>
        Math.min(current + 1, Math.max(results.length - 1, 0)),
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setResultOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (semantic && query.length >= 2 && !semanticQueryIsCurrent) {
        void runSemanticSearch();
        return;
      }
      if (semanticIsLoading) return;
      if (activeResult) {
        openResult(activeResult.noteId);
        return;
      }
      if (semantic) {
        void runSemanticSearch();
      }
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative w-full md:flex-1 md:max-w-xl tutorial-target-search"
    >
      <div
        className={cx(
          "group flex h-9 items-center gap-2 rounded-xl border px-3 transition-colors duration-200 focus-within:ring-2 focus-within:ring-primary/35",
          semantic
            ? "border-accent/50 bg-accent/[0.06] shadow-glowv"
            : "border-line/60 bg-surface/60 hover:border-line",
        )}
      >
        <Icon
          name={semanticIsLoading ? "refresh" : "search"}
          size={18}
          className={cx(
            semantic ? "text-accent" : "text-txt3",
            semanticIsLoading && "animate-spin",
          )}
        />
        <input
          value={value}
          onChange={(event) => {
            abortSemanticSearch();
            setValue(event.target.value);
            setResultOpen(true);
          }}
          onFocus={() => setResultOpen(true)}
          onKeyDown={handleInputKeyDown}
          placeholder={
            semantic
              ? "의미로 검색… 예: 어텐션이 왜 작동하는지"
              : "노트 제목, 본문, 태그 검색…"
          }
          type="search"
          name="global-note-search"
          autoComplete="off"
          aria-label="노트 검색"
          role="combobox"
          aria-expanded={panelVisible}
          aria-controls={`${searchId}-results`}
          aria-activedescendant={
            activeResult ? `${searchId}-result-${activeIndex}` : undefined
          }
          className="min-w-0 flex-1 bg-transparent text-[14px] text-txt outline-none placeholder:text-txt3"
        />
        {value ? (
          <button
            type="button"
            aria-label="검색어 지우기"
            onClick={() => {
              abortSemanticSearch();
              setValue("");
              setResultOpen(true);
            }}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-txt3 transition-colors hover:bg-surface2/60 hover:text-txt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <Icon name="x" size={13} />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setSemantic((current) => {
              if (current) abortSemanticSearch();
              return !current;
            });
            setResultOpen(true);
          }}
          className={cx(
            "flex h-6 items-center gap-1.5 rounded-md border px-2 text-[12px] font-medium whitespace-nowrap transition-colors",
            semantic
              ? "border-accent bg-accent text-white"
              : "border-line/60 bg-surface2/60 text-txt2 hover:text-txt",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          )}
        >
          <Icon name="sparkle" size={13} /> 의미
        </button>
        <div className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={filterOpen}
            onClick={() => setFilterOpen((current) => !current)}
            className="flex h-6 items-center gap-1 rounded-md px-2 text-[12px] whitespace-nowrap text-txt2 transition-colors hover:bg-surface2/60 hover:text-txt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <Icon name="filter" size={13} /> {filter}{" "}
            <Icon name="chevD" size={12} />
          </button>
          {filterOpen ? (
            <div
              role="menu"
              className="fade-up glass absolute right-0 top-9 z-[60] w-40 rounded-xl p-1.5 shadow-soft"
            >
              {SEARCH_FILTERS.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="menuitemradio"
                  aria-checked={item === filter}
                  onClick={() => {
                    setFilter(item);
                    setFilterOpen(false);
                    setResultOpen(true);
                    if (item === "기간 검색")
                      pushToast("기간 검색은 준비 중입니다.", "info");
                  }}
                  className={cx(
                    "flex h-8 w-full items-center justify-between rounded-lg px-3 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
                    item === filter
                      ? "bg-surface2/60 text-primary"
                      : "text-txt2 hover:bg-surface2/50 hover:text-txt",
                  )}
                >
                  {item}
                  {item === filter ? <Icon name="check" size={14} /> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {panelVisible ? (
        <div className="fade-up absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-xl border border-line/70 bg-bg shadow-soft">
          <div className="flex min-w-0 items-center justify-between gap-3 border-b border-line/50 px-3 py-2">
            <div className="min-w-0 truncate text-[12px] font-semibold text-txt">
              {useSemanticResults
                ? "의미 검색 결과"
                : query
                  ? "검색 결과"
                  : "최근 노트"}
            </div>
            <div aria-live="polite" className="shrink-0 text-[11px] text-txt3">
              {isLoadingNotes && !useSemanticResults
                ? "불러오는 중…"
                : semantic
                  ? semanticStatusLabel
                  : resultCountLabel}
            </div>
          </div>
          {semantic ? (
            <div className="flex min-w-0 items-start gap-2 border-b border-line/40 bg-accent/[0.06] px-3 py-2 text-[12px] leading-5 text-txt2">
              <Icon
                name={semanticIsLoading ? "refresh" : "sparkle"}
                size={14}
                className={cx(
                  "mt-0.5 shrink-0 text-accent",
                  semanticIsLoading && "animate-spin",
                )}
              />
              <span className="min-w-0 break-words">
                {semanticIsLoading
                  ? "의미 검색 중…"
                  : query.length >= 2
                    ? "Enter로 의미 검색을 실행합니다."
                    : "2글자 이상 입력하면 Enter로 의미 검색할 수 있습니다."}
              </span>
            </div>
          ) : null}
          {filter === "기간 검색" ? (
            <div className="border-b border-line/40 px-3 py-2 text-[12px] text-txt3">
              기간 검색은 준비 중입니다. 최신순 결과를 표시합니다.
            </div>
          ) : null}
          <div
            id={`${searchId}-results`}
            role="listbox"
            aria-label="노트 검색 결과"
            aria-busy={semanticIsLoading}
            className="max-h-[340px] overflow-y-auto py-1"
          >
            {isLoadingNotes && !useSemanticResults ? (
              <div className="px-3 py-5 text-center text-[13px] text-txt3">
                노트를 불러오는 중…
              </div>
            ) : results.length === 0 && notes.length === 0 ? (
              <div className="px-3 py-5 text-center text-[13px] text-txt3">
                검색할 노트가 없습니다.
              </div>
            ) : results.length === 0 ? (
              <div className="px-3 py-5 text-center text-[13px] text-txt3">
                {query
                  ? "일치하는 노트가 없습니다. 다른 키워드로 검색해 보세요."
                  : "최근 노트가 없습니다."}
              </div>
            ) : (
              results.map((result, index) => (
                <Link
                  id={`${searchId}-result-${index}`}
                  key={result.key}
                  href={`/notes/${encodeURIComponent(result.noteId)}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  onClick={closeSearch}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cx(
                    "flex min-w-0 gap-3 px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
                    index === activeIndex
                      ? "bg-surface2/70"
                      : "hover:bg-surface2/50",
                  )}
                >
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line/50 bg-surface2/50 text-txt3">
                    <Icon name="doc" size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-txt">
                      {result.title}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] leading-5 text-txt3">
                      {result.snippet}
                    </span>
                    <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-txt3">
                      <span
                        className={cx(
                          "shrink-0 rounded-md border px-1.5 py-0.5 text-[10px]",
                          result.source === "semantic"
                            ? "border-accent/40 bg-accent/[0.08] text-accent"
                            : "border-line/50 text-txt2",
                        )}
                      >
                        {result.matchField}
                      </span>
                      {result.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="min-w-0 truncate">
                          #{tag}
                        </span>
                      ))}
                      <span className="shrink-0 tabular-nums">
                        {formatSearchDate(result.updatedTime)}
                      </span>
                    </span>
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MobileNavButton({
  icon,
  label,
  path,
  onMyPageClick,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  path: string;
  onMyPageClick?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const active = isActive(pathname, path);

  return (
    <button
      type="button"
      onClick={() => {
        if (path === "/mypage") {
          onMyPageClick?.();
          return;
        }
        router.push(path);
      }}
      className={cx(
        "flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[14px] font-medium whitespace-nowrap transition-colors",
        active
          ? "border-primary/40 bg-primary/10 text-txt"
          : "border-line/50 bg-surface2/40 text-txt2 hover:bg-surface2/70 hover:text-txt",
      )}
    >
      <Icon name={icon} size={15} className={active ? "text-primary" : ""} />
      {label}
    </button>
  );
}

function SidebarItem({
  icon,
  label,
  path,
  onMyPageClick,
  notesExplorerOpen,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  path: string;
  onMyPageClick?: () => void;
  notesExplorerOpen?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  const active = isActive(pathname, path);
  const isNotes = path === "/notes";

  return (
    <button
      type="button"
      onClick={() => {
        if (path === "/mypage") {
          onMyPageClick?.();
          return;
        }
        if (path === "/notes" && pathname.startsWith("/notes")) {
          window.dispatchEvent(new CustomEvent("brainx-toggle-notes-explorer"));
          return;
        }
        router.push(path);
      }}
      className={cx(
        "group relative flex aspect-square w-full items-center justify-center gap-3 rounded-[0.4rem] transition-all duration-200",
        path === "/home" && "tutorial-target-home",
        path === "/notes" && "tutorial-target-notes",
        path === "/graph" && "tutorial-target-mindmap",
        path === "/chat" && "tutorial-target-ai",
        path === "/agent" && "tutorial-target-agent",
        active
          ? "bg-surface2/80 text-txt"
          : "text-txt2 hover:bg-surface2/50 hover:text-txt",
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {active ? (
        <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-primary to-accent" />
      ) : null}

      {isNotes && active ? (
        hovered ? (
          notesExplorerOpen !== false ? (
            <PanelLeftClose size={19} className="text-primary" />
          ) : (
            <PanelLeft size={19} className="text-primary" />
          )
        ) : (
          <Icon name={icon} size={19} className="text-primary" />
        )
      ) : (
        <Icon name={icon} size={19} className={active ? "text-primary" : ""} />
      )}

      {/* Tooltip on Hover */}
      <span className="pointer-events-none absolute left-[calc(100%+12px)] z-50 whitespace-nowrap rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium bg-txt text-bg2 shadow-md opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        {label}
        <div
          className="absolute left-[-4px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rotate-45 bg-txt"
          style={{ zIndex: -1 }}
        />
      </span>
    </button>
  );
}

function Sidebar({
  onOpenSettings,
  notesExplorerOpen,
}: {
  onOpenSettings: (tab?: SettingsTab) => void;
  notesExplorerOpen?: boolean;
}) {
  const { t } = useBrainX();
  const router = useRouter();
  const pathname = usePathname();
  const [aiUsage, setAiUsage] = useState<AiUsageData | null>(null);

  useEffect(() => {
    let active = true;

    const refreshAiUsage = () => {
      getAiUsage()
        .then((data) => {
          if (active) setAiUsage(data);
        })
        .catch(() => {
          if (active) setAiUsage(null);
        });
    };

    refreshAiUsage();
    window.addEventListener("brainx-auth-session-changed", refreshAiUsage);
    window.addEventListener("brainx-subscription-changed", refreshAiUsage);
    window.addEventListener("brainx-token-usage-changed", refreshAiUsage);

    return () => {
      active = false;
      window.removeEventListener(
        "brainx-auth-session-changed",
        refreshAiUsage,
      );
      window.removeEventListener(
        "brainx-subscription-changed",
        refreshAiUsage,
      );
      window.removeEventListener(
        "brainx-token-usage-changed",
        refreshAiUsage,
      );
    };
  }, []);

  const hasUsage = aiUsage != null;
  const isGuest = aiUsage?.actorType === "GUEST";
  const usedCredits = aiUsage?.usedCount ?? 0;
  const usagePercent = aiUsage?.usagePercent ?? 0;
  const creditLimit = aiUsage?.limit ?? null;
  const panelLabel = isGuest ? "AI 기능 사용 횟수" : "AI 크레딧 사용량";
  // aiUsage가 null인 건 "요청 실패로 데이터가 없음"이지 "무제한"이 아니다 — 둘을 구분해야
  // 인증/네트워크 문제로 요청이 실패했을 때도 실제 무제한 플랜인 것처럼 보이지 않는다.
  const panelValue = !hasUsage
    ? "-"
    : isGuest
      ? `${formatCreditCount(usedCredits)} / ${formatCreditCount(creditLimit ?? 0)}`
      : formatTokenPercent(usagePercent);
  const panelSubValue = !hasUsage
    ? "사용량을 불러오지 못했어요"
    : isGuest
      ? "게스트 · 로그인하면 계속 이용할 수 있어요"
      : `${formatCreditCount(usedCredits)} / ${
          creditLimit != null ? `${formatCreditCount(creditLimit)} 크레딧` : "무제한"
        }`;

  const handlePanelClick = () => {
    if (isGuest) {
      router.push(buildAuthPath("/login", pathname));
      return;
    }
    onOpenSettings("usage");
  };

  return (
    <aside className="relative z-20 hidden h-full w-[50px] shrink-0 flex-col border-r border-line/50 bg-bg2/40 backdrop-blur-xl transition-all duration-300 md:flex pt-4">
      <nav className="flex-1 space-y-2 px-1">
        {NAV.map((item) => (
          <SidebarItem
            key={item.id}
            {...item}
            label={t(item.labelKey)}
            onMyPageClick={onOpenSettings}
            notesExplorerOpen={notesExplorerOpen}
          />
        ))}
      </nav>

      <div className="group relative mt-auto px-1 pb-3 flex flex-col gap-2">
        <button
          type="button"
          onClick={handlePanelClick}
          className="group relative grid aspect-square w-full place-items-center rounded-[0.4rem] glass text-accent transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-soft"
          aria-label={panelLabel}
        >
          <Icon name="bolt" size={18} />
          <span className="hidden">
            업그레이드
            <div
              className="absolute left-[-4px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rotate-45 bg-txt"
              style={{ zIndex: -1 }}
            />
          </span>
        </button>
        <div className="pointer-events-none absolute bottom-0 left-[calc(100%+12px)] z-50 w-[280px] opacity-0 transition duration-200 ease-out group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
          <button
            type="button"
            onClick={handlePanelClick}
            className="w-full rounded-[18px] border border-[#ded8cf] bg-white p-4 text-left shadow-[0_18px_45px_rgba(18,16,14,.14)] transition-transform duration-200 hover:-translate-y-0.5"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#8c877f]">
                  {panelLabel}
                </div>
                <div className="mt-2 text-[22px] font-bold tracking-[-0.03em] text-[#2f2d2a]">
                  {panelValue}
                </div>
                <div className="mt-1 text-[12px] text-[#6d6861]">
                  {panelSubValue}
                </div>
              </div>
              <div className="rounded-full bg-[#f4efe8] px-2.5 py-1 text-[11px] font-semibold text-[#8c877f]">
                {isGuest ? "게스트" : "이번 달"}
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-[11px] text-[#6d6861]">
                <span>{isGuest ? "현재 AI 기능 사용 횟수" : "현재 전체 크레딧 사용량"}</span>
                <span>{formatTokenPercent(usagePercent ?? 0)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#ebe7e1]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary via-accent to-cyan"
                  style={{
                    width: `${Math.min(100, Math.max(0, usagePercent ?? 0))}%`,
                  }}
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-[#eee7dc] pt-3">
              <span className="text-[12px] font-medium text-[#4d4944]">
                {isGuest ? "로그인하기" : "자세히 보기"}
              </span>
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[#f4efe8] text-[#6d6861]">
                <Icon name="chevR" size={14} />
              </span>
            </div>
          </button>
          <div className="absolute bottom-6 left-[-5px] h-2.5 w-2.5 rotate-45 border-l border-b border-[#ded8cf] bg-white" />
        </div>
      </div>
    </aside>
  );
}

function formatNotificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function TopBar({
  onOpenSettings,
}: {
  onOpenSettings: (tab?: SettingsTab) => void;
}) {
  const { t, pushToast } = useBrainX();
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState("Free");
  const [guestMenuOpen, setGuestMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<MyNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [deletingNotificationId, setDeletingNotificationId] = useState<string | null>(null);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const isDemoSession = isDevAuthSession(session);
  const isGuest = !session?.accessToken || isDemoSession;

  useEffect(() => {
    const syncSession = () => {
      const nextSession = readAuthSession();
      setSession((prev) =>
        isSameAuthSession(prev, nextSession) ? prev : nextSession,
      );
    };
    syncSession();
    window.addEventListener("brainx-auth-session-changed", syncSession);
    return () =>
      window.removeEventListener("brainx-auth-session-changed", syncSession);
  }, []);

  useEffect(() => {
    let active = true;

    if (!session?.accessToken) {
      setProfileName("");
      setProfileImageUrl(null);
      return () => {
        active = false;
      };
    }

    getMyProfile()
      .then((profile) => {
        if (!active) return;
        setProfileName(
          profile.nickname?.trim() || profile.email.split("@")[0] || "",
        );
        setProfileImageUrl(profile.profileImageUrl);
      })
      .catch((error) => {
        if (!active) return;
        setProfileName("");
        setProfileImageUrl(null);
        // AuthRequiredError는 authedRequest가 401/403(또는 세션 없음)일 때만 던진다 — 이미 그 안에서
        // clearAuthSession()을 호출하지만, 여기서도 한 번 더 방어적으로 정리해 헤더가 만료된 세션을
        // 붙들고 "로그아웃" 버튼을 계속 보여주는 일이 없게 한다. 단순 네트워크 오류(백엔드 일시 다운 등)는
        // AuthRequiredError가 아니므로 여기서 세션을 지우지 않는다 — 일시적 오류로 정상 로그인 사용자를
        // 로그아웃시키지 않기 위함. dev bypass 세션은 애초에 실제 백엔드 검증 대상이 아니므로 건드리지 않는다.
        const session = readAuthSession();
        if (
          error instanceof AuthRequiredError &&
          session &&
          !isDevAuthSession(session)
        ) {
          clearAuthSession();
        }
      });

    return () => {
      active = false;
    };
  }, [
    session?.accessToken,
    session?.userId,
    session?.nickname,
    session?.profileImageUrl,
  ]);

  useEffect(() => {
    let active = true;

    const refreshPlan = () => {
      if (!session?.accessToken) {
        setCurrentPlan("Free");
        return;
      }

      getMySubscription()
        .then((subscription) => {
          if (active) setCurrentPlan(planLabel(subscription));
        })
        .catch(() => {
          if (active) setCurrentPlan("Free");
        });
    };

    refreshPlan();

    window.addEventListener("focus", refreshPlan);
    window.addEventListener("brainx-auth-session-changed", refreshPlan);
    window.addEventListener("brainx-subscription-changed", refreshPlan);
    const removePaymentListener = addPopupResultListener(
      PAYMENT_RESULT_MESSAGE_TYPE,
      () => refreshPlan(),
    );
    const refreshInterval = window.setInterval(refreshPlan, 30000);

    return () => {
      active = false;
      window.removeEventListener("focus", refreshPlan);
      window.removeEventListener("brainx-auth-session-changed", refreshPlan);
      window.removeEventListener("brainx-subscription-changed", refreshPlan);
      removePaymentListener();
      window.clearInterval(refreshInterval);
    };
  }, [session?.accessToken, session?.userId]);

  useEffect(() => {
    let active = true;

    const refreshNotifications = () => {
      if (!session?.accessToken) {
        setNotifications([]);
        setUnreadCount(0);
        return;
      }

      getMyNotifications()
        .then((data) => {
          if (!active) return;
          setNotifications(data.notifications);
          setUnreadCount(data.unreadCount);
        })
        .catch(() => {
          if (!active) return;
          setNotifications([]);
          setUnreadCount(0);
        });
    };

    refreshNotifications();
    window.addEventListener("focus", refreshNotifications);
    window.addEventListener(
      "brainx-auth-session-changed",
      refreshNotifications,
    );

    return () => {
      active = false;
      window.removeEventListener("focus", refreshNotifications);
      window.removeEventListener(
        "brainx-auth-session-changed",
        refreshNotifications,
      );
    };
  }, [session?.accessToken, session?.userId]);

  /* "모두 읽음" — 서버 응답을 기다리지 않고 먼저 화면(목록/배지)을 전부 읽음 처리해 즉시
     반영하고(optimistic), 실패하면 직전 상태로 되돌린다. 개별 확인(markMyNotificationRead)과
     달리 이 목록에 없는(top20 밖) 미확인 알림까지 서버에서 함께 처리되므로, 성공 후에는 서버가
     돌려주는 최신 목록/개수로 다시 맞춘다. */
  const handleMarkAllNotificationsRead = useCallback(async () => {
    if (markingAllRead) return;
    const previousNotifications = notifications;
    const previousUnreadCount = unreadCount;
    setMarkingAllRead(true);
    const now = new Date().toISOString();
    setNotifications((current) =>
      current.map((item) => (item.read ? item : { ...item, read: true, readAt: now })),
    );
    setUnreadCount(0);
    try {
      const data = await markAllMyNotificationsRead();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch (error) {
      setNotifications(previousNotifications);
      setUnreadCount(previousUnreadCount);
      pushToast(
        error instanceof Error ? error.message : "알림을 모두 읽음 처리하지 못했습니다.",
        "err",
      );
    } finally {
      setMarkingAllRead(false);
    }
  }, [markingAllRead, notifications, unreadCount, pushToast]);

  const handleDeleteNotification = useCallback(async (notification: MyNotification) => {
    if (deletingNotificationId) return;

    const previousNotifications = notifications;
    const previousUnreadCount = unreadCount;
    const nextUnreadCount = notification.read ? unreadCount : Math.max(0, unreadCount - 1);

    setDeletingNotificationId(notification.notificationId);
    setNotifications((current) =>
      current.filter((item) => item.notificationId !== notification.notificationId),
    );
    setUnreadCount(nextUnreadCount);

    try {
      const data = await deleteMyNotification(notification.notificationId);
      setUnreadCount((current) => Math.min(current, data.unreadCount));
    } catch (error) {
      setNotifications(previousNotifications);
      setUnreadCount(previousUnreadCount);
      pushToast(
        error instanceof Error ? error.message : "알림을 삭제하지 못했습니다.",
        "err",
      );
    } finally {
      setDeletingNotificationId(null);
    }
  }, [deletingNotificationId, notifications, unreadCount, pushToast]);

  const displayName = isGuest
    ? "게스트"
    : profileName ||
      session?.nickname?.trim() ||
      session?.email?.split("@")[0] ||
      "사용자";
  const displayImageUrl = profileImageUrl ?? session?.profileImageUrl;
  const mobileNav = [
    { label: t("nav.home"), icon: "home" as const, path: "/home" },
    { label: t("nav.notes"), icon: "notes" as const, path: "/notes" },
    { label: t("nav.graph"), icon: "graph" as const, path: "/graph" },
    { label: t("nav.chat"), icon: "chat" as const, path: "/chat" },
    { label: t("nav.agent"), icon: "brain" as const, path: "/agent" },
  ];
  const topTooltipClass =
    "pointer-events-none absolute top-[calc(100%+12px)] left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-[6px] bg-txt px-2.5 py-1.5 text-[12px] font-medium text-bg2 opacity-0 shadow-md transition-opacity duration-200 group-hover:opacity-100";

  return (
    <>
      <header className="relative z-[100] border-b border-line/50 bg-bg2/30 backdrop-blur-xl">
        <div className="flex flex-col gap-3 px-4 py-3 md:h-[50px] md:flex-row md:items-center md:gap-2.5 md:pl-0 md:pr-4 md:py-0">
          <div className="hidden h-full w-[50px] shrink-0 items-center justify-center border-r border-line/50 md:flex">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="flex items-center group"
            >
              <BrandLogo size={36} shadow />
            </button>
          </div>
          <div className="md:ml-2 md:flex-1 md:max-w-lg">
            <SearchBar />
          </div>
          <div className="flex items-center justify-between gap-2 md:ml-auto md:justify-end">
            {!isGuest ? (
              <WorkspaceSwitcher
                onCreateWorkspace={() => {
                  setNotificationOpen(false);
                  setGuestMenuOpen(false);
                  setCreateWorkspaceOpen(true);
                }}
              />
            ) : null}
            <div className="tutorial-target-darkmode group relative shrink-0 [&>button]:h-8 [&>button]:w-8 [&>button]:rounded-lg [&_svg]:h-[15px] [&_svg]:w-[15px]">
              <ThemeToggle />
              <span className={topTooltipClass}>
                테마 변경
                <div
                  className="absolute left-1/2 top-[-4px] h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-txt"
                  style={{ zIndex: -1 }}
                />
              </span>
            </div>
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => {
                  setGuestMenuOpen(false);
                  setNotificationOpen((open) => !open);
                }}
                className="tutorial-target-notifications group relative grid h-8 w-8 place-items-center rounded-lg border border-line/60 text-txt2 transition-colors hover:bg-surface2/60 hover:text-txt"
              >
                <Icon name="bell" size={15} />
                {unreadCount > 0 ? (
                  <span className="absolute right-1 top-1 grid min-h-[16px] min-w-[16px] place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">
                    {Math.min(unreadCount, 9)}
                  </span>
                ) : null}
                <span className={topTooltipClass}>
                  알림
                  <div
                    className="absolute left-1/2 top-[-4px] h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-txt"
                    style={{ zIndex: -1 }}
                  />
                </span>
              </button>
              {notificationOpen ? (
                <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-[320px] overflow-hidden rounded-2xl border border-line/70 bg-bg shadow-soft">
                  <div className="flex items-center justify-between border-b border-line/50 px-4 py-3">
                    <div>
                      <div className="text-[14px] font-semibold text-txt">
                        알림
                      </div>
                      <div className="text-[12px] text-txt3">
                        관리자 공지와 주요 안내를 확인할 수 있어요.
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <div className="text-[12px] font-semibold text-accent">
                        {unreadCount}개 미확인
                      </div>
                      {unreadCount > 0 ? (
                        <button
                          type="button"
                          onClick={handleMarkAllNotificationsRead}
                          disabled={markingAllRead}
                          aria-busy={markingAllRead}
                          className="text-[11px] font-medium text-txt3 transition-colors hover:text-txt disabled:opacity-50"
                        >
                          {markingAllRead ? "처리 중..." : "모두 읽음"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="max-h-[360px] overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-6 text-[13px] text-txt3">
                        새 알림이 없습니다.
                      </div>
                    ) : (
                      notifications.map((notification) => (
                        <button
                          key={notification.notificationId}
                          type="button"
                          onClick={async () => {
                            if (!notification.read) {
                              const updated = await markMyNotificationRead(
                                notification.notificationId,
                              );
                              setNotifications((current) =>
                                current.map((item) =>
                                  item.notificationId === updated.notificationId
                                    ? updated
                                    : item,
                                ),
                              );
                              setUnreadCount((count) => Math.max(0, count - 1));
                            }
                          }}
                          className={cx(
                            "w-full border-b border-line/40 px-4 py-3 text-left transition-colors hover:bg-surface2/50",
                            notification.read
                              ? "bg-transparent"
                              : "bg-accent/[0.06]",
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-[13px] font-semibold text-txt">
                                {notification.title}
                              </div>
                              <div className="mt-1 whitespace-pre-wrap text-[12px] leading-5 text-txt2">
                                {notification.body}
                              </div>
                              <div className="mt-2 text-[11px] text-txt3">
                                {(notification.sentByAdminName ||
                                  "BrainX Admin") +
                                  " · " +
                                  formatNotificationTime(
                                    notification.createdAt,
                                  )}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-start gap-2">
                              {!notification.read ? (
                                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" />
                              ) : null}
                              <button
                                type="button"
                                aria-label="알림 삭제"
                                disabled={deletingNotificationId === notification.notificationId}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleDeleteNotification(notification);
                                }}
                                className="rounded p-1 text-txt3 transition-colors hover:bg-surface2/70 hover:text-txt disabled:opacity-40"
                              >
                                <Icon name="x" size={12} />
                              </button>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="mx-1 hidden h-6 w-px bg-line/60 md:block" />
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => {
                  setNotificationOpen(false);
                  if (isGuest) {
                    setGuestMenuOpen((current) => !current);
                    return;
                  }
                  onOpenSettings("profile");
                }}
                className="tutorial-target-profile group relative flex h-8 items-center gap-1.5 rounded-lg px-2 transition-colors hover:bg-surface2/60"
              >
                <Avatar
                  name={displayName}
                  size={26}
                  imageUrl={displayImageUrl}
                />
                <div className="hidden text-left leading-tight sm:block">
                  <div className="max-w-[110px] truncate text-[12px] font-semibold text-txt">
                    {displayName}
                  </div>
                  <div className="text-[10px] text-txt3">
                    {isGuest ? "체험 중" : currentPlan}
                  </div>
                </div>
                {isGuest ? (
                  <Icon name="chevD" size={12} className="text-txt3" />
                ) : null}
                {!isGuest ? (
                  <span className={topTooltipClass}>
                    사용자 프로필
                    <div
                      className="absolute left-1/2 top-[-4px] h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-txt"
                      style={{ zIndex: -1 }}
                    />
                  </span>
                ) : null}
              </button>
              {isGuest && guestMenuOpen ? (
                <div
                  className="fade-up absolute right-0 top-[calc(100%+8px)] z-50 w-64 rounded-xl border border-line/60 bg-surface p-3 shadow-soft"
                  onMouseLeave={() => setGuestMenuOpen(false)}
                >
                  <div className="px-1">
                    <div className="text-[13px] font-semibold text-txt">
                      체험 모드 사용 중
                    </div>
                    <div className="mt-1 text-[12px] leading-relaxed text-txt2">
                      가입하면 현재 작성한 노트와 폴더를 계정에 저장할 수
                      있어요.
                    </div>
                  </div>
                  <div className="my-2 h-px bg-line/50" />
                  <button
                    type="button"
                    onClick={() => {
                      setGuestMenuOpen(false);
                      clearAuthSession();
                      router.push(buildAuthPath("/login", pathname));
                    }}
                    className="flex h-9 w-full items-center rounded-lg px-2 text-left text-[13px] font-medium text-txt hover:bg-surface2/60"
                  >
                    로그인하기
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="border-t border-line/40 px-4 py-2 md:hidden">
          <div className="scroll flex gap-2 overflow-x-auto pb-1">
            {mobileNav.map((item) => (
              <MobileNavButton
                key={item.path}
                {...item}
                onMyPageClick={onOpenSettings}
              />
            ))}
          </div>
        </div>
      </header>
      {createWorkspaceOpen ? (
        <CreateWorkspaceModal onClose={() => setCreateWorkspaceOpen(false)} />
      ) : null}
    </>
  );
}

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("profile");
  const [notesExplorerOpen, setNotesExplorerOpen] = useState(true);

  useEffect(() => {
    const handleExplorerState = (e: Event) => {
      const customEvent = e as CustomEvent<{ open: boolean }>;
      if (customEvent.detail) {
        setNotesExplorerOpen(customEvent.detail.open);
      } else {
        // Toggle if no detail
        setNotesExplorerOpen((prev) => !prev);
      }
    };
    window.addEventListener(
      "brainx-toggle-notes-explorer",
      handleExplorerState,
    );
    return () =>
      window.removeEventListener(
        "brainx-toggle-notes-explorer",
        handleExplorerState,
      );
  }, []);

  const openSettings = (tab: SettingsTab = "profile") => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  };

  return (
    <div className="flex h-[100svh] w-full flex-col overflow-hidden">
      <TopBar onOpenSettings={openSettings} />
      <div className="relative z-0 flex min-h-0 flex-1">
        <Sidebar
          onOpenSettings={openSettings}
          notesExplorerOpen={notesExplorerOpen}
        />
        <main className="scroll relative z-0 flex-1 min-w-0 overflow-y-auto">
          {children}
        </main>
      </div>
      <AccountSettingsModal
        open={settingsOpen}
        defaultTab={settingsTab}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
