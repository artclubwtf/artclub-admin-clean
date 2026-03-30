"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

import styles from "./ArtistsWorkspace.module.css";

type WorkspaceShellProps = {
  artist: {
    displayName: string;
    artistKey: string;
    onboardingComplete: boolean;
    email: string;
  };
  children: React.ReactNode;
};

const NAV_ITEMS = [
  { href: "/artists", label: "Overview" },
  { href: "/artists/profile", label: "Profile" },
  { href: "/artists/artworks", label: "Artworks" },
  { href: "/artists/series", label: "Series" },
  { href: "/artists/media", label: "Media" },
  { href: "/artists/messages", label: "Messages" },
  { href: "/artists/settings", label: "Settings" },
] as const;

export default function ArtistsWorkspaceShell({ artist, children }: WorkspaceShellProps) {
  const pathname = usePathname();

  return (
    <div className={styles.shell}>
      <div className={styles.frame}>
        <aside className={styles.sidebar}>
          <div className={styles.brand}>Artclub Artist Workspace</div>
          <div className={styles.title}>{artist.displayName || "Artist"}</div>
          <div className={styles.meta}>{artist.artistKey}</div>
          <div className={styles.statusPill}>{artist.onboardingComplete ? "Active" : "Onboarding"}</div>

          <nav className={styles.nav}>
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`.trim()}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <section className={styles.content}>
          <div className={styles.topbar}>
            <div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Workspace</div>
              <div style={{ fontWeight: 700, color: "#0f172a" }}>{artist.displayName || "Artist"}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <a className="btnGhost" href="/artists/profile">
                Preview Profile
              </a>
              <button className="btnGhost" type="button" onClick={() => signOut({ callbackUrl: "/artists/login" })}>
                Logout
              </button>
            </div>
          </div>

          <div className={styles.main}>{children}</div>
        </section>
      </div>
    </div>
  );
}
