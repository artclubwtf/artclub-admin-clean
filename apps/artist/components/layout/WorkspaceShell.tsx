import type { ReactNode } from "react";

import { BottomNav } from "@/components/primitives/BottomNav";
import { Container } from "@/components/primitives/Container";
import { isNetworkMvpEnabled } from "@/lib/server/network-flags";

type WorkspaceShellProps = {
  children: ReactNode;
  topbar?: ReactNode;
};

export function WorkspaceShell({ children, topbar }: WorkspaceShellProps) {
  const network = isNetworkMvpEnabled();
  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--text)]">
      <Container className="pb-28 pt-2 sm:pb-32 lg:pb-12 lg:pl-32">
        {topbar}
        {children}
      </Container>
      <BottomNav network={network} />
    </div>
  );
}
