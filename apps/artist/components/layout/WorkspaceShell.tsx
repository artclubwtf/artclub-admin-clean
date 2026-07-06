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
    <div className="min-h-screen bg-white">
      <Container className="pb-28 pt-3 sm:pb-32">
        {topbar}
        {children}
      </Container>
      <BottomNav network={network} />
    </div>
  );
}
