import type { ReactNode } from "react";

import { ArtistSuccessNotice } from "@/components/feedback/ArtistSuccessNotice";
import { ArtistTopbar } from "@/components/layout/ArtistTopbar";
import { NetworkTopbar } from "@/components/layout/NetworkTopbar";
import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { requireArtistContext } from "@/lib/server/artist-context";
import { requireNetworkContext } from "@/lib/server/network-context";
import { isNetworkMvpEnabled } from "@/lib/server/network-flags";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  if (isNetworkMvpEnabled()) {
    const context = await requireNetworkContext();
    return <WorkspaceShell topbar={<NetworkTopbar profile={context.profile} />}><ArtistSuccessNotice />{children}</WorkspaceShell>;
  }
  const context = await requireArtistContext();
  return (
    <WorkspaceShell topbar={<ArtistTopbar context={context} />}>
      <ArtistSuccessNotice />
      {children}
    </WorkspaceShell>
  );
}
