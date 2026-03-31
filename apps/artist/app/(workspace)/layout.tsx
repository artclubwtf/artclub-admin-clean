import type { ReactNode } from "react";

import { WorkspaceShell } from "@/components/layout/WorkspaceShell";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  // Future auth gate lives here. Public routes stay isolated in app/(public).
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
