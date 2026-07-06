"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type NavItem = {
  label: string;
  href: string;
  key?: "messages";
};

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/admin" },
  { label: "Messages", href: "/admin/messages", key: "messages" },
  { label: "Artistzentrale", href: "/admin/artists-v2" },
  { label: "Artists", href: "/admin/artists" },
  { label: "Artist Keys", href: "/admin/artists/keys" },
  { label: "Applications", href: "/admin/applications" },
  { label: "Terms", href: "/admin/terms" },
  { label: "Orders", href: "/admin/orders" },
  { label: "Analytics", href: "/admin/analytics" },
  { label: "Network", href: "/admin/network" },
  { label: "Products", href: "/admin/products" },
  { label: "Migration", href: "/admin/migration" },
  { label: "POS", href: "/admin/pos" },
  { label: "Concepts", href: "/admin/concepts" },
  { label: "Brands", href: "/admin/brands" },
  { label: "Users", href: "/admin/users" },
  { label: "Requests", href: "/admin/requests" },
];

export default function AdminSidebar() {
  const pathname = usePathname() || "";
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadUnreadCount() {
      try {
        const res = await fetch("/api/admin/messages/unread-count", { cache: "no-store" });
        const payload = (await res.json().catch(() => null)) as { count?: number } | null;
        if (!active) return;
        setUnreadCount(typeof payload?.count === "number" ? payload.count : 0);
      } catch {
        if (active) setUnreadCount(0);
      }
    }

    void loadUnreadCount();
    const intervalId = window.setInterval(loadUnreadCount, 15000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <aside className="admin-sidebar">
      <div className="admin-logo">
        <span className="admin-logo-dot" aria-hidden />
        <span>Artclub Admin</span>
      </div>

      <nav className="admin-nav">
        {navItems.map((item) => {
          const matchesExact = pathname === item.href;
          const matchesNested = pathname.startsWith(`${item.href}/`);
          const isActive = matchesExact || (item.href !== "/admin" && matchesNested);
          const showBadge = item.key === "messages" && unreadCount > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`admin-nav-link${isActive ? " active" : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              <span>{item.label}</span>
              {showBadge ? <span className="ml-auto inline-flex min-w-6 items-center justify-center rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-semibold text-white">{unreadCount}</span> : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
