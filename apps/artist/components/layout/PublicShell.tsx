import type { ReactNode } from "react";

import { Container } from "@/components/primitives/Container";

type PublicShellProps = {
  children: ReactNode;
};

export function PublicShell({ children }: PublicShellProps) {
  return (
    <div className="min-h-screen bg-white" data-artclub-public-shell="true">
      <Container className="flex min-h-screen flex-col justify-between py-8">
        <div className="space-y-10">
          <div className="space-y-2 pt-4">
            <p className="text-[0.68rem] font-medium uppercase tracking-[0.28em] text-neutral-400">ARTCLUB</p>
            <p className="text-sm leading-6 text-neutral-500">
              Dedicated artist workspace. Clean web foundation for onboarding, profile, media and artworks.
            </p>
          </div>
          {children}
        </div>
      </Container>
    </div>
  );
}
