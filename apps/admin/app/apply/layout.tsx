import type { ReactNode } from "react";
import Link from "next/link";

import { isArtistLegacyEnabled } from "@/lib/artistLegacy";
import "./apply.css";

export const dynamic = "force-dynamic";

export default function ApplyLayout({ children }: { children: ReactNode }) {
  if (!isArtistLegacyEnabled()) {
    return (
      <div className="ap-apply">
        <div className="ap-shell">
          <div className="ap-card" style={{ maxWidth: 720, margin: "40px auto" }}>
            <div className="ap-eyebrow">Artist Onboarding</div>
            <h1 className="ap-title">This onboarding has migrated.</h1>
            <p className="ap-subtitle">Please continue in the new artist area.</p>
            <div className="mt-6">
              <Link href="/artists" className="btnPrimary">
                Go to /artists
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <div className="ap-apply">{children}</div>;
}
