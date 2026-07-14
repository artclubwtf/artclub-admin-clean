"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { NavigationIcon } from "@/components/navigation/NavigationIcon";
import { trackNetwork } from "@/lib/client/network-analytics";
import { ArtclubLogo } from "@/components/branding/ArtclubLogo";

function NotificationsAction({ badge }: { badge: number }) {
  return <Link href="/notifications" aria-label="Notifications" onClick={() => trackNetwork("navigation_notifications")} className="relative grid h-10 w-10 place-items-center text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"><NavigationIcon name="notifications"/>{badge ? <span className="absolute right-0 top-0 min-w-4 rounded-full bg-[var(--danger)] px-1 text-center text-[9px] leading-4 text-white">{badge > 9 ? "9+" : badge}</span> : null}</Link>;
}

export function NetworkTopbarClient({ profile }: { profile: any }) {
  const [unread,setUnread]=useState(0);
  useEffect(()=>{fetch("/api/network/notifications").then(r=>r.json()).then(data=>setUnread(data.unreadCount||0)).catch(()=>undefined)},[]);
  return <header className="sticky top-0 z-30 -mx-3 grid h-14 grid-cols-[1fr_auto_1fr] items-center border-b border-[var(--border)] bg-[var(--background)] px-3 sm:-mx-4 sm:px-4 lg:hidden"><Link href="/create" aria-label="Create" onClick={() => trackNetwork("navigation_create")} className="grid h-10 w-10 place-items-center justify-self-start"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg></Link><ArtclubLogo className="h-4 w-auto"/><div className="justify-self-end"><NotificationsAction badge={unread}/></div></header>;
}
