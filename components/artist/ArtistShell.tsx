"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PropsWithChildren } from "react";
import { signOut } from "next-auth/react";

type NavItem = {
  label: string;
  href: string;
  icon: string;
};

const navItems: NavItem[] = [
  { label: "Overview", href: "/artist", icon: "🏠" },
  { label: "Media", href: "/artist/media", icon: "🖼️" },
  { label: "Artworks", href: "/artist/artworks", icon: "🎨" },
  { label: "Contracts", href: "/artist/contracts", icon: "📄" },
  { label: "Payout", href: "/artist/payout", icon: "💸" },
  { label: "Messages", href: "/artist/messages", icon: "💬" },
];

export default function ArtistShell({ children }: PropsWithChildren<{ email?: string }>) {
  const pathname = usePathname() || "";

  const isActive = (href: string) => {
    if (href === "/artist") {
      return pathname === "/artist";
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="artist-shell">
      <aside className="artist-sidebar">
        <div className="artist-logo">
          <span className="artist-logo-dot" />
          <div>
            <div className="artist-logo-text">Artclub</div>
            <div className="artist-logo-sub">Artist Portal</div>
          </div>
        </div>
        <nav className="artist-nav">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className={`artist-nav-link${isActive(item.href) ? " active" : ""}`}>
              <span className="artist-nav-icon" aria-hidden>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="artist-sidebar-footer">
          <button type="button" className="artist-ghost-btn" onClick={() => signOut({ callbackUrl: "/login" })}>
            Logout
          </button>
        </div>
      </aside>

      <div className="artist-main">
        <header className="artist-header">
          <div>
            <div className="artist-header-title">Artist Portal</div>
            <div className="artist-header-sub">Stay up to date and manage your work.</div>
          </div>
          <button type="button" className="artist-ghost-btn" onClick={() => signOut({ callbackUrl: "/login" })}>
            Logout
          </button>
        </header>

        <main className="artist-content">{children}</main>
      </div>

      <nav className="artist-bottom-nav">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} className={`artist-bottom-link${isActive(item.href) ? " active" : ""}`}>
            <span className="artist-bottom-icon" aria-hidden>
              {item.icon}
            </span>
            <span className="artist-bottom-label">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
