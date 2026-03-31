"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";
import { bottomNavItems, type BottomNavItem } from "@/lib/navigation";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavIcon({ item, active }: { item: BottomNavItem; active: boolean }) {
  const className = cn("h-[18px] w-[18px] transition-colors", active ? "text-neutral-950" : "text-neutral-400");

  switch (item.icon) {
    case "home":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
          <path d="M4 10.5L12 4l8 6.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M7.5 9.5V20h9V9.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "artworks":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
          <path d="M5 7.5c0-1.38 1.12-2.5 2.5-2.5h9A2.5 2.5 0 0 1 19 7.5v9A2.5 2.5 0 0 1 16.5 19h-9A2.5 2.5 0 0 1 5 16.5v-9Z" stroke="currentColor" strokeWidth="1.75" />
          <path d="M8 14.5 10.5 12l2 2 3.5-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "media":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
          <path d="M4.5 7.5A2.5 2.5 0 0 1 7 5h2.8c.54 0 1.05.22 1.42.61l.88.93c.38.39.89.61 1.42.61H17A2.5 2.5 0 0 1 19.5 9.5v7A2.5 2.5 0 0 1 17 19H7a2.5 2.5 0 0 1-2.5-2.5v-9Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
          <circle cx="12.5" cy="13" r="2.5" stroke="currentColor" strokeWidth="1.75" />
        </svg>
      );
    case "profile":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
          <circle cx="12" cy="8.25" r="3.25" stroke="currentColor" strokeWidth="1.75" />
          <path d="M6 18.5c1.1-2.17 3.16-3.5 6-3.5s4.9 1.33 6 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      );
    case "settings":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
          <path d="M12 4.75v2.5M12 16.75v2.5M19.25 12h-2.5M7.25 12h-2.5M17.13 6.87l-1.77 1.77M8.64 15.36l-1.77 1.77M17.13 17.13l-1.77-1.77M8.64 8.64 6.87 6.87" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          <circle cx="12" cy="12" r="3.25" stroke="currentColor" strokeWidth="1.75" />
        </svg>
      );
  }
}

export function BottomNav() {
  const pathname = usePathname() || "/";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
      <nav className="pointer-events-auto mx-auto flex max-w-2xl items-center justify-between rounded-full bg-white/92 px-2 py-2 backdrop-blur-sm">
        {bottomNavItems.map((item) => {
          const active = isActive(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-full px-2 py-2 text-[11px] font-medium tracking-[-0.01em] transition-colors",
                active ? "bg-neutral-100 text-neutral-950" : "text-neutral-400"
              )}
              aria-current={active ? "page" : undefined}
            >
              <NavIcon item={item} active={active} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
