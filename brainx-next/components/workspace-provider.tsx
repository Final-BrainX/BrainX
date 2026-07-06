"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

  const refreshWorkspaces = useCallback(async () => {
    // 목데이터 모드는 BrainXProvider의 notes 로딩과 동일하게 실제 Workspace-Service를 치지 않는다.
    if (USE_MOCK_NOTES) {
      setWorkspaces([]);
      setCurrentWorkspaceId(null);
      return;
    }
    setIsLoading(true);
    try {
      const { workspaces: nextWorkspaces } = await listWorkspaces();
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
      // Guest/비로그인 상태(빈 목록)도, 일시적인 조회 실패도 여기서는 동일하게 안전한 빈 상태로
      // 처리한다 — 아직 이 Context를 쓰는 화면이 없어 사용자에게 에러를 보여줄 곳이 없다.
      setWorkspaces([]);
      setCurrentWorkspaceId(null);
    } finally {
      setIsLoading(false);
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
