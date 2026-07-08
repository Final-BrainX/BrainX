"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { getAuthIdentityKey, readAuthSession } from "@/lib/auth-api";
import { getLocalStoredValue, setLocalStoredValue } from "@/lib/client-storage";
import { listWorkspaces, USE_MOCK_NOTES, type WorkspaceSummaryData } from "@/lib/workspace-api";

type WorkspaceContextValue = {
  workspaces: WorkspaceSummaryData[];
  currentWorkspaceId: string | null;
  switchWorkspace: (documentGroupId: string) => void;
  refreshWorkspaces: () => Promise<void>;
  isLoading: boolean;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

/** 로그인 사용자가 마지막으로 선택한 non-default Workspace를 기억해, 새로고침/HMR/재마운트로
    currentWorkspaceId가 null에서 다시 시작되더라도 refreshWorkspaces()가 항상 default를 고르지
    않고 이 값을 우선 복원하게 한다. key에 userId를 포함해 로그아웃 후 다른 사용자로 로그인해도
    이전 사용자의 선택과 섞이지 않는다(별도 정리 로직 없이 key 자체가 분리되어 있어 안전).
    Guest는 readAuthSession()이 없어(session===null) userId가 없으므로 자연히 저장/복원 대상에서
    빠진다(정책상 Guest는 Workspace를 갖지 않는다). */
const SELECTED_WORKSPACE_STORAGE_PREFIX = "brainx_selected_workspace_v1";

function selectedWorkspaceStorageKey(userId: string): string {
  return `${SELECTED_WORKSPACE_STORAGE_PREFIX}:${userId}`;
}

function readStoredWorkspaceId(userId: string | null | undefined): string | null {
  if (!userId) return null;
  return getLocalStoredValue(selectedWorkspaceStorageKey(userId));
}

function writeStoredWorkspaceId(userId: string | null | undefined, documentGroupId: string): void {
  if (!userId) return;
  setLocalStoredValue(selectedWorkspaceStorageKey(userId), documentGroupId);
}

function pickDefaultWorkspaceId(workspaces: WorkspaceSummaryData[]): string | null {
  return workspaces.find((workspace) => workspace.isDefault)?.documentGroupId ?? workspaces[0]?.documentGroupId ?? null;
}

/** Ticket11: Workspace를 선택할 수 있는 전역 Context의 기반만 만든다(docs/Workspace 정책상
    "현재 선택된 Workspace"는 서버에 저장하지 않고 프론트 Context에서만 관리한다). 아직 이
    Context를 구독해 실제로 화면을 다시 그리는 곳은 없다 — Ticket12~16이 이어받는다. */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummaryData[]>([]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [authIdentityKey, setAuthIdentityKey] = useState(() => getAuthIdentityKey(readAuthSession()));
  // saveAuthSession()의 "brainx-auth-session-changed"는 claimGuestDraftsAfterAuth()가 끝나기 전에
  // 먼저 발생하므로, 아래 authIdentityKey 변경 refresh는 Guest Draft Claim과 병렬로 실행될 수 있다.
  // 응답이 도착하는 순서가 요청을 보낸 순서와 다를 수 있어(예: claim 이후 재조회가 먼저 끝나고,
  // claim 이전 시점의 조회가 뒤늦게 끝나는 경우), requestId로 가장 최근에 시작한 조회만 상태를
  // 반영하도록 막는다.
  const refreshRequestIdRef = useRef(0);

  const refreshWorkspaces = useCallback(async () => {
    const requestId = ++refreshRequestIdRef.current;
    // 목데이터 모드는 BrainXProvider의 notes 로딩과 동일하게 실제 Workspace-Service를 치지 않는다.
    if (USE_MOCK_NOTES) {
      setWorkspaces([]);
      setCurrentWorkspaceId(null);
      return;
    }
    setIsLoading(true);
    try {
      const { workspaces: nextWorkspaces } = await listWorkspaces();
      if (requestId !== refreshRequestIdRef.current) return;
      setWorkspaces(nextWorkspaces);
      const userId = readAuthSession()?.userId ?? null;
      setCurrentWorkspaceId((prev) => {
        // 이미 선택돼 있던 workspace가 새 목록에도 여전히 있으면 선택을 유지한다(예: 목록만
        // 재조회된 경우). 없어졌거나 아직 선택된 적이 없으면(Guest→회원 전환, 새로고침/HMR/
        // 재마운트로 currentWorkspaceId가 null부터 다시 시작하는 경우 등) 로그인 사용자가
        // 마지막으로 선택해둔 Workspace가 있으면 그것을 복원하고, 없거나 이미 삭제된 Workspace를
        // 가리키면 기존처럼 default를 고른다.
        if (prev && nextWorkspaces.some((workspace) => workspace.documentGroupId === prev)) {
          return prev;
        }
        const storedWorkspaceId = readStoredWorkspaceId(userId);
        if (storedWorkspaceId && nextWorkspaces.some((workspace) => workspace.documentGroupId === storedWorkspaceId)) {
          return storedWorkspaceId;
        }
        return pickDefaultWorkspaceId(nextWorkspaces);
      });
    } catch {
      if (requestId !== refreshRequestIdRef.current) return;
      // Guest/비로그인 상태(빈 목록)도, 일시적인 조회 실패도 여기서는 동일하게 안전한 빈 상태로
      // 처리한다 — 아직 이 Context를 쓰는 화면이 없어 사용자에게 에러를 보여줄 곳이 없다.
      setWorkspaces([]);
      setCurrentWorkspaceId(null);
    } finally {
      if (requestId === refreshRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const syncAuthIdentity = () => {
      const nextIdentityKey = getAuthIdentityKey(readAuthSession());
      setAuthIdentityKey((prev) => (prev === nextIdentityKey ? prev : nextIdentityKey));
    };
    window.addEventListener("brainx-auth-session-changed", syncAuthIdentity);
    return () => {
      window.removeEventListener("brainx-auth-session-changed", syncAuthIdentity);
    };
  }, []);

  useEffect(() => {
    refreshWorkspaces();
    // authIdentityKey가 바뀔 때마다(로그인/로그아웃/게스트→회원 전환) 다시 조회한다 —
    // BrainXProvider가 notes를 다시 불러오는 것과 동일한 패턴.
  }, [authIdentityKey, refreshWorkspaces]);

  useEffect(() => {
    const handleWorkspaceResetSignal = (event: Event) => {
      const detail = (event as CustomEvent<{ resetWorkspace?: boolean }>).detail;
      if (!detail?.resetWorkspace) return;
      // claimGuestDraftsAfterAuth/clearAuthSession이 실제로 끝난 뒤에만 발생하는 신호다 — 위
      // authIdentityKey effect가 이미 claim과 병렬로 조회를 시작했더라도, claim이 방금 만들었거나
      // 승계한 Workspace 상태를 확실히 반영하도록 이 시점에 한 번 더 안정적으로 재조회한다.
      refreshWorkspaces();
    };
    window.addEventListener("brainx:notes-refresh", handleWorkspaceResetSignal);
    return () => {
      window.removeEventListener("brainx:notes-refresh", handleWorkspaceResetSignal);
    };
  }, [refreshWorkspaces]);

  const switchWorkspace = useCallback((documentGroupId: string) => {
    setCurrentWorkspaceId(documentGroupId);
    writeStoredWorkspaceId(readAuthSession()?.userId ?? null, documentGroupId);
  }, []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaces,
      currentWorkspaceId,
      switchWorkspace,
      refreshWorkspaces,
      isLoading
    }),
    [workspaces, currentWorkspaceId, switchWorkspace, refreshWorkspaces, isLoading]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider.");
  }
  return context;
}
