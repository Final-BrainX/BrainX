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
import { listWorkspaces, USE_MOCK_NOTES, type WorkspaceSummaryData } from "@/lib/workspace-api";

type WorkspaceContextValue = {
  workspaces: WorkspaceSummaryData[];
  currentWorkspaceId: string | null;
  switchWorkspace: (documentGroupId: string) => void;
  refreshWorkspaces: () => Promise<void>;
  isLoading: boolean;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

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
      setCurrentWorkspaceId((prev) => {
        // 이미 선택돼 있던 workspace가 새 목록에도 여전히 있으면 선택을 유지한다(예: 목록만
        // 재조회된 경우). 없어졌거나 아직 선택된 적이 없으면(Guest→회원 전환 등) default를 고른다.
        if (prev && nextWorkspaces.some((workspace) => workspace.documentGroupId === prev)) {
          return prev;
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
