import type { ReactNode } from "react";

import { BottomNav } from "@/components/primitives/BottomNav";
import { Container } from "@/components/primitives/Container";

type WorkspaceShellProps = {
  children: ReactNode;
};

export function WorkspaceShell({ children }: WorkspaceShellProps) {
  return (
    <div className="min-h-screen bg-white">
      <Container className="pb-28 pt-3 sm:pb-32">{children}</Container>
      <BottomNav />
    </div>
  );
}
