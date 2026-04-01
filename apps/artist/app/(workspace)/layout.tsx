import type { ReactNode } from "react";

import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { requireArtistContext } from "@/lib/server/artist-context";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  await requireArtistContext();
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
