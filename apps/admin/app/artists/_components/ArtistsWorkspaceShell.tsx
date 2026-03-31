"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

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

type NavItem = { href: string; label: string; icon: ReactNode };

const NAV_ITEMS: NavItem[] = [
  { href: "/artists", label: "Overview", icon: <GridIcon /> },
  { href: "/artists/profile", label: "Profile", icon: <UserIcon /> },
  { href: "/artists/artworks", label: "Artworks", icon: <ArtIcon /> },
  { href: "/artists/series", label: "Series", icon: <StackIcon /> },
  { href: "/artists/media", label: "Media", icon: <FolderIcon /> },
  { href: "/artists/messages", label: "Messages", icon: <MessageIcon /> },
  { href: "/artists/settings", label: "Settings", icon: <SettingsIcon /> },
];

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

          <nav className={styles.nav}>
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link key={item.href} href={item.href} className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`.trim()}>
                  <span className={styles.navIcon} aria-hidden="true">
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className={styles.footer}>© {new Date().getFullYear()} ARTCLUB</div>
        </aside>

        <section className={styles.content}>
          <div className={styles.topbar}>
            <div className={styles.topTitle}>{currentLabel}</div>
            <div className={styles.topActions}>
              <span className={styles.statusChip}>{artist.onboardingComplete ? "Active" : "Onboarding"}</span>
              <button className={styles.iconBtn} type="button" aria-label="Theme toggle">
                <MoonIcon />
              </button>
              <span className={styles.avatarChip}>{initials || "AR"}</span>
            </div>
          </div>

          <div className={styles.main}>{children}</div>
        </section>
      </div>
    </div>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21a8 8 0 1 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function ArtIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m8 13 3-3 3 3 2-2 3 3" />
      <circle cx="8" cy="8" r="1" />
    </svg>
  );
}

function StackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 16 9 5 9-5" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10Z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 1-3 0 1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 1 0-3 1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 1 3 0 1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.27.39.48.83.6 1.3a1.7 1.7 0 0 1 0 3c-.12.47-.33.91-.6 1.3Z" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3c-.07.33-.11.67-.11 1.02a8 8 0 0 0 8 8c.65 0 1.27-.08 1.9-.23Z" />
    </svg>
  );
}
