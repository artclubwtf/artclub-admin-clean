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

const mainNavItems: NavItem[] = [
  { label: "Overview", href: "/artist", icon: "🏠" },
  { label: "Media", href: "/artist/media", icon: "🖼️" },
  { label: "Artworks", href: "/artist/artworks", icon: "🎨" },
  { label: "Contracts", href: "/artist/contracts", icon: "📄" },
  { label: "Messages", href: "/artist/messages", icon: "💬" },
];

const extraNavItems: NavItem[] = [{ label: "Payout", href: "/artist/payout", icon: "💸" }];

export default function ArtistShell({ children }: PropsWithChildren<{ email?: string }>) {
  const pathname = usePathname() || "";

  const isActive = (href: string) => {
    if (href === "/artist") {
      return pathname === "/artist";
    }
    return pathname.startsWith(href);
  };

  const navItems = [...mainNavItems, ...extraNavItems];
  const current = navItems.find((item) => isActive(item.href));

  return (
    <div className="ap-layout">
      <aside className="ap-sidebar">
        <div className="ap-logo">
          <span className="ap-logo-mark" />
          <div>
            <div className="ap-logo-text">Artclub</div>
            <div className="ap-logo-sub">Artist Portal</div>
          </div>
        </div>
        <nav className="ap-nav">
          {mainNavItems.map((item) => (
            <Link key={item.href} href={item.href} className={`ap-nav-link${isActive(item.href) ? " active" : ""}`}>
              <span className="ap-nav-icon" aria-hidden>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="ap-nav-label">More</div>
        <nav className="ap-nav">
          {extraNavItems.map((item) => (
            <Link key={item.href} href={item.href} className={`ap-nav-link${isActive(item.href) ? " active" : ""}`}>
              <span className="ap-nav-icon" aria-hidden>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="ap-sidebar-footer">
          <button type="button" className="ap-btn-ghost" onClick={() => signOut({ callbackUrl: "/login" })}>
            Logout
          </button>
        </div>
      </aside>

      <div className="ap-main">
        <header className="ap-header">
          <div>
            <div className="ap-title-eyebrow">Artist Portal</div>
            <div className="ap-title">{current?.label || "Welcome"}</div>
          </div>
          <div className="ap-header-actions">
            <button type="button" className="ap-icon-btn" onClick={() => signOut({ callbackUrl: "/login" })}>
              Logout
            </button>
          </div>
        </header>

        <main className="ap-content">{children}</main>
      </div>

      <nav className="ap-bottom-nav">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} className={`ap-bottom-link${isActive(item.href) ? " active" : ""}`}>
            <span className="ap-bottom-icon" aria-hidden>
              {item.icon}
            </span>
            <span className="ap-bottom-label">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
