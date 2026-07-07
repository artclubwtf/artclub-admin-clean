import type { ReactNode } from "react";

import { Container } from "@/components/primitives/Container";
import { ArtclubLogo } from "@/components/branding/ArtclubLogo";

type PublicShellProps = {
  children: ReactNode;
};

export function PublicShell({ children }: PublicShellProps) {
  return (
    <div className="min-h-screen bg-[var(--background)]" data-artclub-public-shell="true">
      <Container className="flex min-h-screen flex-col justify-between py-8">
        <div className="space-y-10">
          <div className="pt-4"><ArtclubLogo href="/" className="h-7 w-auto" /></div>
          {children}
        </div>
      </Container>
    </div>
  );
}
