import type { ReactNode } from "react";

import { ArtistSuccessNotice } from "@/components/feedback/ArtistSuccessNotice";
import { ArtistTopbar } from "@/components/layout/ArtistTopbar";
import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { requireArtistContext } from "@/lib/server/artist-context";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const context = await requireArtistContext();
  return (
    <WorkspaceShell topbar={<ArtistTopbar context={context} />}>
      <ArtistSuccessNotice />
      {children}
    </WorkspaceShell>
  );
}
