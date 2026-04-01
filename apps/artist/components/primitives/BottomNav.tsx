"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

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

const createActions = [
  { key: "artwork", label: "Add artwork", href: "/artworks/new" },
  { key: "announcement", label: "Add announcement", href: "/announcements?create=1" },
  { key: "exhibition", label: "Add exhibition", href: "/profile?create=exhibition" },
  { key: "education", label: "Add education", href: "/profile?create=education" },
  { key: "link", label: "Add link", href: "/profile?create=link" },
  { key: "experience", label: "Add experience", href: "/profile?create=experience" },
  { key: "series", label: "Add series", href: "/series?create=1" },
] as const;

export function BottomNav() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    setSheetOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!sheetOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSheetOpen(false);
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [sheetOpen]);

  return (
    <>
      {sheetOpen ? (
        <div className="fixed inset-0 z-40 bg-neutral-950/18" onClick={() => setSheetOpen(false)}>
          <div
            className="absolute inset-x-0 bottom-[calc(max(env(safe-area-inset-bottom),1rem)+5.4rem)] px-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto max-w-2xl rounded-[1.9rem] bg-neutral-50 p-3">
              <div className="space-y-0.5">
                {createActions.map((action, index) => (
                  <button
                    key={action.key}
                    type="button"
                    onClick={() => {
                      setSheetOpen(false);
                      router.push(action.href);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-[1.2rem] px-4 py-4 text-left text-[1rem] font-medium tracking-[-0.02em] text-neutral-900 transition-colors hover:bg-white",
                      index > 0 ? "mt-1" : "",
                    )}
                  >
                    <span>{action.label}</span>
                    <span className="text-neutral-300">+</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
        <nav className="pointer-events-auto mx-auto grid max-w-2xl grid-cols-5 items-end rounded-full bg-white/92 px-2 py-2 backdrop-blur-sm">
          {bottomNavItems.slice(0, 2).map((item) => {
            const active = isActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-w-0 flex-col items-center justify-center gap-1 rounded-full px-2 py-2 text-[11px] font-medium tracking-[-0.01em] transition-colors",
                  active ? "bg-neutral-100 text-neutral-950" : "text-neutral-400",
                )}
                aria-current={active ? "page" : undefined}
              >
                <NavIcon item={item} active={active} />
                <span>{item.label}</span>
              </Link>
            );
          })}

          <div className="flex justify-center pb-1">
            <button
              type="button"
              onClick={() => setSheetOpen((current) => !current)}
              className={cn(
                "inline-flex h-14 w-14 items-center justify-center rounded-full bg-neutral-950 text-white transition-transform",
                sheetOpen ? "scale-[0.98]" : "",
              )}
              aria-label="Create"
              aria-expanded={sheetOpen}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {bottomNavItems.slice(2).map((item) => {
            const active = isActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-w-0 flex-col items-center justify-center gap-1 rounded-full px-2 py-2 text-[11px] font-medium tracking-[-0.01em] transition-colors",
                  active ? "bg-neutral-100 text-neutral-950" : "text-neutral-400",
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
    </>
  );
}
