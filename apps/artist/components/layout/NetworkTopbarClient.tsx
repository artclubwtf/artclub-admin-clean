"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { NavigationIcon } from "@/components/navigation/NavigationIcon";
import { trackNetwork } from "@/lib/client/network-analytics";
import { secondaryNavigation } from "@/lib/navigation";

function Action({ href, label, icon, badge, event }: { href: string; label: string; icon: "network" | "messages" | "notifications"; badge?: number; event?: string }) {
  return <Link href={href} aria-label={label} onClick={()=>event&&trackNetwork(event)} className="relative grid h-10 w-10 place-items-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"><NavigationIcon name={icon}/>{badge ? <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-[var(--danger)] px-1 text-center text-[9px] leading-4 text-white">{badge > 9 ? "9+" : badge}</span> : null}</Link>;
}

export function NetworkTopbarClient({ profile }: { profile: any }) {
  const router = useRouter();
  const [query,setQuery]=useState("");
  const [badges,setBadges]=useState({notifications:0,network:0,messages:0});
  useEffect(()=>{Promise.all([fetch("/api/network/notifications").then(r=>r.json()),fetch("/api/network/connections?status=pending").then(r=>r.json()),fetch("/api/network/conversations").then(r=>r.json())]).then(([notifications,connections,conversations])=>setBadges({notifications:notifications.unreadCount||0,network:connections.connections?.length||0,messages:(conversations.conversations||[]).reduce((sum:number,item:any)=>sum+(item.unreadCount||0),0)})).catch(()=>undefined)},[]);
  function search(event:FormEvent){event.preventDefault();if(query.trim())router.push(`/network?q=${encodeURIComponent(query.trim())}`)}
  return <header className="sticky top-0 z-30 -mx-4 flex h-14 items-center justify-between border-b border-[var(--divider)] bg-[color-mix(in_srgb,var(--canvas)_90%,transparent)] px-4 backdrop-blur-xl sm:-mx-8 sm:px-8 lg:mx-0 lg:h-16"><Link href="/feed" className="text-base font-semibold tracking-[-.04em] lg:hidden">ARTCLUB</Link><div className="hidden text-sm font-medium lg:block">ARTCLUB Network</div><form onSubmit={search} className="mx-auto hidden w-full max-w-md lg:block"><label className="sr-only" htmlFor="network-search">Search ARTCLUB Network</label><input id="network-search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search artists, people and galleries" className="control h-10 min-h-0 w-full border-0 bg-[var(--surface-soft)]"/></form><nav className="flex items-center gap-0.5"><Action href={secondaryNavigation.network.href} label="Network and connections" icon="network" badge={badges.network} event={secondaryNavigation.network.analyticsEvent}/><Action href="/messages" label="Messages" icon="messages" badge={badges.messages} event="navigation_messages_opened"/><Action href={secondaryNavigation.notifications.href} label="Notifications" icon="notifications" badge={badges.notifications}/><details className="relative"><summary className="ml-1 grid h-9 w-9 cursor-pointer list-none place-items-center overflow-hidden rounded-full bg-[var(--surface-soft)]" aria-label="Open account menu">{profile.profileImageUrl?<img src={profile.profileImageUrl} alt="" className="h-full w-full object-cover"/>:<span className="text-xs font-medium">{profile.displayName?.slice(0,1)}</span>}</summary><div className="absolute right-0 top-12 w-48 rounded-xl border border-[var(--divider)] bg-[var(--surface)] p-1 shadow-xl"><Link href="/profile" className="block rounded-lg px-3 py-2 text-sm hover:bg-[var(--surface-soft)]">Profile</Link><Link href="/settings" className="block rounded-lg px-3 py-2 text-sm hover:bg-[var(--surface-soft)]">Settings</Link></div></details></nav></header>;
}
