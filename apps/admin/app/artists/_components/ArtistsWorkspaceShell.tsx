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
  const currentLabel = NAV_ITEMS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.label || "Workspace";
  const initials = (artist.displayName || "AR")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");

  return (
    <div className={styles.shell}>
      <div className={styles.frame}>
        <aside className={styles.sidebar}>
          <div className={styles.brand}>ARTCLUB</div>
          <div className={styles.title}>Artist Workspace</div>
          <div className={styles.meta}>{artist.displayName || artist.artistKey}</div>
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
          <div className={styles.footer}>© {new Date().getFullYear()} ARTCLUB</div>
        </aside>

        <section className={styles.content}>
          <div className={styles.topbar}>
            <div>
              <div className={styles.topTitle}>{currentLabel}</div>
              <div className={styles.topSub}>{artist.displayName || "Artist"}</div>
            </div>
            <div className={styles.topActions}>
              <span className={styles.statusChip}>{artist.onboardingComplete ? "Active" : "Onboarding"}</span>
              <span className={styles.avatarChip}>{initials || "AR"}</span>
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
