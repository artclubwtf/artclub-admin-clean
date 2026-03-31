import Link from "next/link";

import { isArtistsV3Enabled } from "@/lib/artistsFlags";
import styles from "./artists-theme.module.css";

export default function ArtistsRootLayout({ children }: { children: React.ReactNode }) {
  if (!isArtistsV3Enabled()) {
    return (
      <div className={styles.artistsTheme}>
        <div className="ac-shell">
          <div className="ac-card" style={{ maxWidth: 720, margin: "40px auto" }}>
            <h1 className="text-2xl font-semibold text-slate-900">Artist workspace is temporarily unavailable</h1>
            <p className="mt-2 text-sm text-slate-600">
              The new artist workspace is currently disabled by configuration.
            </p>
            <div className="mt-5 flex gap-2">
              <Link className="btnPrimary" href="/artists/login">
                Artist login
              </Link>
              <Link className="btnGhost" href="/artists/register">
                Artist register
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <div className={styles.artistsTheme}>{children}</div>;
}
