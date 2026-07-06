import type { ReactNode } from "react";
import { WorkspaceShell } from "@/components/workspace-shell";
import { WorkspaceProvider } from "@/components/workspace-provider";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <WorkspaceProvider>
      <WorkspaceShell>{children}</WorkspaceShell>
    </WorkspaceProvider>
  );
}
