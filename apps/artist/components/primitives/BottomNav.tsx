"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { cn } from "@/lib/cn";
import { bottomNavItems, networkNavItems, type BottomNavItem } from "@/lib/navigation";
import { trackNetwork } from "@/lib/client/network-analytics";
import { NavigationIcon } from "@/components/navigation/NavigationIcon";
import { primaryNavigation } from "@/lib/navigation";
import { ArtclubLogo } from "@/components/branding/ArtclubLogo";

const desktopNavigation: BottomNavItem[] = [
  primaryNavigation[0],
  primaryNavigation[1],
  { id: "network", href: "/network", label: "Network", icon: "network", analyticsEvent: "navigation_network_opened" },
  primaryNavigation[2],
  primaryNavigation[3],
  { id: "notifications", href: "/notifications", label: "Notifications", icon: "notifications" },
  primaryNavigation[4],
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavIcon({ item, active }: { item: BottomNavItem; active: boolean }) {
  const className = cn("h-[18px] w-[18px] transition-colors", active ? "text-[var(--text)]" : "text-[var(--text-faint)]");

  switch (item.icon) {
    case "explore":
    case "events":
    case "messages":
    case "network":
    case "notifications":
      return <NavigationIcon name={item.icon} className={className} />;
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
    case "earnings":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
          <path d="M5.75 18.5V11.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          <path d="M12 18.5V7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          <path d="M18.25 18.5V4.75" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          <path d="M4 18.5h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      );
    case "analytics":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
          <path d="M5 18.5h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          <path d="M7.5 15.5 10.5 12.5l2.5 2.25 4-5.25" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="7.5" cy="15.5" r="1" fill="currentColor" />
          <circle cx="10.5" cy="12.5" r="1" fill="currentColor" />
          <circle cx="13" cy="14.75" r="1" fill="currentColor" />
          <circle cx="17" cy="9.5" r="1" fill="currentColor" />
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
const networkCreateActions = [
  { key: "artwork", label: "Upload artwork", href: "/artworks/new", roles: ["artist"] },
  { key: "post", label: "Create post", href: "/create?type=post", roles: [] },
  { key: "process", label: "Share process image or video", href: "/create?type=process", roles: [] },
  { key: "event", label: "Create event", href: "/events/new", roles: ["artist","gallery","event_series","curator","institution"] },
  { key: "collection", label: "Add to collection", href: "/collection?create=1", roles: ["collector","art_enthusiast","other"] },
] as const;

export function BottomNav({ network = false }: { network?: boolean }) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [profileType,setProfileType]=useState("");
  const items = network ? networkNavItems : bottomNavItems;
  const splitIndex = Math.floor(items.length / 2);
  const leftItems = items.slice(0, splitIndex);
  const rightItems = items.slice(splitIndex);
  const columnCount = leftItems.length + rightItems.length + 1;

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
  useEffect(()=>{if(network)fetch("/api/network/profile").then(response=>response.json()).then(data=>setProfileType(data.profile?.profileType||"")).catch(()=>undefined)},[network]);
  const visibleCreateActions = network ? networkCreateActions.filter(action=>action.roles.length===0||action.roles.includes(profileType as never)) : createActions;

  return (
    <>
      {sheetOpen ? (
        <div className="fixed inset-0 z-40 bg-[var(--overlay)]" onClick={() => setSheetOpen(false)}>
          <div
            className="absolute inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] px-3 lg:bottom-8 lg:left-64 lg:right-auto lg:w-80 lg:px-0"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto max-w-2xl rounded-2xl bg-[var(--surface)] p-2 shadow-2xl">
              <div className="space-y-0.5">
                {visibleCreateActions.map((action, index) => (
                  <button
                    key={action.key}
                    type="button"
                    onClick={() => {
                      setSheetOpen(false);
                      if(network)trackNetwork(action.key==="artwork"?"artwork_upload_started":action.key==="post"||action.key==="process"?"post_create_started":action.key==="event"?"event_create_started":"create_menu_opened");
                      router.push(action.href);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl px-4 py-3.5 text-left text-[.95rem] font-medium tracking-[-0.02em] text-[var(--text)] transition-colors hover:bg-[var(--surface-soft)]",
                      index > 0 ? "mt-1" : "",
                    )}
                  >
                    <span>{action.label}</span>
                    <span className="text-[var(--text-faint)]">+</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className={cn("pointer-events-none fixed inset-x-0 bottom-0 z-50", network ? "lg:hidden" : "px-3 pb-[max(env(safe-area-inset-bottom),.6rem)] lg:inset-y-0 lg:left-5 lg:right-auto lg:flex lg:items-center lg:px-0 lg:pb-0")}>
        <nav
          className={cn("pointer-events-auto mx-auto grid items-end bg-[var(--surface)] px-1 pt-1.5", network ? "w-full max-w-none border-t border-[var(--border)]" : "max-w-2xl rounded-full border border-[var(--divider)] lg:flex lg:w-[5.25rem] lg:flex-col lg:items-stretch lg:gap-1 lg:rounded-2xl lg:p-2")}
          style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`, paddingBottom: network ? "env(safe-area-inset-bottom)" : undefined }}
        >
          {leftItems.map((item) => {
            const active = isActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium tracking-[-0.01em] transition-colors",
                  active ? "text-[var(--text)]" : "text-[var(--text-faint)]",
                )}
                aria-current={active ? "page" : undefined}
              >
                <NavIcon item={item} active={active} />
                <span>{item.label}</span>
              </Link>
            );
          })}

          <div className="flex justify-center lg:order-first lg:mb-1">
            <button
              type="button"
              onClick={() => { if(network&&!sheetOpen)trackNetwork("create_menu_opened"); setSheetOpen((current) => !current); }}
              className={cn(
                "inline-flex min-h-[3.25rem] w-full flex-col items-center justify-center gap-1 bg-transparent text-[10px] font-medium text-[var(--text-faint)] transition-colors lg:h-12 lg:w-12 lg:rounded-full lg:bg-[var(--primary)] lg:text-[var(--primary-foreground)]",
                sheetOpen ? "scale-[0.98]" : "",
              )}
              aria-label="Create"
              aria-expanded={sheetOpen}
            >
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden>
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <span className="lg:hidden">Create</span>
            </button>
          </div>

          {rightItems.map((item) => {
            const active = isActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium tracking-[-0.01em] transition-colors",
                  active ? "text-[var(--text)]" : "text-[var(--text-faint)]",
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

      {network ? <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-[var(--border)] bg-[var(--surface)] px-5 py-6 lg:flex"><ArtclubLogo className="mb-9 h-7 w-auto"/><nav className="space-y-1">{desktopNavigation.map(item=>{const active=isActive(pathname,item.href);return <Link key={item.id} href={item.href} onClick={()=>item.analyticsEvent&&trackNetwork(item.analyticsEvent)} aria-current={active?"page":undefined} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",active?"bg-[var(--surface-muted)] font-medium text-[var(--text)]":"text-[var(--text-muted)] hover:bg-[var(--surface-muted)]")}><NavigationIcon name={item.icon}/><span>{item.label}</span></Link>})}<Link href="/settings" className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm",isActive(pathname,"/settings")?"bg-[var(--surface-muted)] font-medium text-[var(--text)]":"text-[var(--text-muted)] hover:bg-[var(--surface-muted)]")}><NavigationIcon name="settings"/>Settings</Link></nav><button type="button" onClick={()=>setSheetOpen(current=>!current)} className="primary-action mt-7 w-full"><svg viewBox="0 0 24 24" className="mr-2 h-5 w-5" fill="none" aria-hidden><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>Create</button></aside> : null}
    </>
  );
}
