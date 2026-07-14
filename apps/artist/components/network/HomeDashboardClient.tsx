"use client";

import { createNetworkApiClient } from "@artclub/api-client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { trackNetwork } from "@/lib/client/network-analytics";

const api = createNetworkApiClient();

function Avatar({ profile, size = "md" }: { profile: any; size?: "sm" | "md" | "lg" }) {
  const dimensions = size === "lg" ? "h-16 w-16" : size === "sm" ? "h-10 w-10" : "h-12 w-12";
  return profile?.profileImageUrl ? <img src={profile.profileImageUrl} alt="" className={`${dimensions} shrink-0 rounded-full object-cover`} /> : <span className={`${dimensions} grid shrink-0 place-items-center rounded-full bg-[var(--surface-soft)] font-medium`}>{profile?.displayName?.[0] || "·"}</span>;
}

function Module({ title, action, children, hidden = false }: { title: string; action?: React.ReactNode; children: React.ReactNode; hidden?: boolean }) {
  if (hidden) return null;
  return <section className="dashboard-module"><div className="mb-4 flex items-baseline justify-between gap-4"><h2 className="section-heading">{title}</h2>{action}</div>{children}</section>;
}

export function HomeDashboardClient() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { setData(await api.request("/home")); setError(""); }
    catch { setError("Your network dashboard could not be loaded."); }
  }, []);
  useEffect(() => { void load(); trackNetwork("home_view"); }, [load]);

  async function respond(id: string, action: "accept" | "decline") {
    try {
      await api.request(`/connections/${id}`, { method: "PATCH", body: JSON.stringify({ action }) });
      if (action === "accept") trackNetwork("home_connection_request_accept");
      setData((current: any) => ({ ...current, connectionRequests: current.connectionRequests.filter((item: any) => item.id !== id) }));
    } catch { setError("The connection request could not be updated."); }
  }

  async function connect(profile: any) {
    try {
      await api.request("/connections", { method: "POST", body: JSON.stringify({ profileId: profile.id }) });
      trackNetwork("home_suggested_profile_click", { targetProfileId: profile.networkProfileId });
      setData((current: any) => ({ ...current, suggestedProfiles: current.suggestedProfiles.filter((item: any) => item.id !== profile.id) }));
    } catch { setError("The connection request could not be sent."); }
  }

  async function shareProfile() {
    if (!data) return;
    const profile = data.profileSummary.profile;
    const url = `${location.origin}${profile.profileType === "artist" ? "/artist" : "/profile"}/${profile.slug}`;
    if (navigator.share) await navigator.share({ title: profile.displayName, url }); else await navigator.clipboard.writeText(url);
    trackNetwork("profile_share", { targetProfileId: profile.id });
  }

  if (!data && !error) return <main className="app-page"><div className="grid gap-4 lg:grid-cols-2">{[1, 2, 3, 4].map((item) => <div key={item} className="h-48 animate-pulse rounded-[4px] bg-[var(--surface-soft)]" />)}</div></main>;
  if (!data) return <main className="app-page"><p className="text-[var(--danger)]">{error}</p><button onClick={() => void load()} className="secondary-action mt-4">Try again</button></main>;

  const summary = data.profileSummary;
  return <main className="app-page max-w-[90rem]">
    <header className="mb-6"><p className="eyebrow">Your network</p><h1 className="page-heading mt-1">Home</h1>{error ? <p className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}</header>
    <div className="dashboard-grid">
      <Module title="Profile status" action={<Link href="/profile" className="text-action">View profile</Link>}>
        <div className="flex items-start gap-4"><Avatar profile={summary.profile} size="lg"/><div className="min-w-0 flex-1"><p className="truncate text-lg font-medium">{summary.profile.displayName}</p><p className="meta-text capitalize">{summary.profile.profileType.replaceAll("_", " ")}{summary.profile.city ? ` · ${summary.profile.city}` : ""}</p><div className="mt-4 flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden bg-[var(--surface-soft)]"><div className="h-full bg-[var(--primary)]" style={{ width: `${summary.completion.percentage}%` }} /></div><span className="text-sm tabular-nums">{summary.completion.percentage}%</span></div><p className="meta-text mt-1">{summary.completion.completed} of {summary.completion.total} profile essentials complete</p></div></div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[var(--text-muted)]"><span>{summary.profileViews} profile views · 30 days</span><span>{summary.newConnections} new connections · 30 days</span></div>
        {summary.completion.missing.length ? <div className="mt-4 grid gap-1 sm:grid-cols-2">{summary.completion.missing.slice(0, 4).map((task: any) => <Link key={task.id} href={task.href} onClick={() => trackNetwork("home_profile_completion_click")} className="task-link">{task.label}<span aria-hidden>→</span></Link>)}</div> : <p className="meta-text mt-4">Your profile essentials are complete. Keep your work and activity current.</p>}
        <div className="mt-4 flex gap-2"><Link href="/settings/profile" className="primary-action">Edit profile</Link><button onClick={() => void shareProfile()} className="secondary-action">Share profile</button></div>
      </Module>

      <Module title="Important messages" action={<Link href="/messages" onClick={() => trackNetwork("home_message_click")} className="text-action">View all messages</Link>}>
        {data.conversations.length ? <div>{data.conversations.map((item: any) => <Link key={item.id} href={`/messages/${item.id}`} onClick={() => trackNetwork("home_message_click")} className="list-row first:border-t"><Avatar profile={item.participant} size="sm"/><div className="min-w-0 flex-1"><p className="truncate font-medium">{item.participant?.displayName}</p><p className="meta-text truncate">{item.lastMessagePreview || "Start the conversation"}</p></div>{item.unreadCount ? <span className="status-count">{item.unreadCount}</span> : null}</Link>)}</div> : <div className="empty-action"><p>Start conversations with people from the art world.</p><Link href="/network" className="secondary-action mt-4">Discover people</Link></div>}
      </Module>

      <Module title="Next events" action={<Link href="/events" className="text-action">View all events</Link>}>
        {data.upcomingEvents.length ? <div className="grid grid-cols-3 gap-3">{data.upcomingEvents.map((event: any) => <Link key={event.id} href={`/events/${event.id}`} onClick={() => trackNetwork("home_event_click", { eventId: event.id })} className="min-w-0"><div className="aspect-[4/5] overflow-hidden rounded-[4px] bg-[var(--surface-soft)]">{event.coverImageUrl ? <img src={event.coverImageUrl} alt="" className="h-full w-full object-cover"/> : null}</div><p className="mt-2 truncate text-sm font-medium">{event.title}</p><p className="meta-text truncate">{new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(event.startAt))}{event.city ? ` · ${event.city}` : ""}</p>{event.attending ? <span className="meta-text">Going</span> : null}</Link>)}</div> : <div className="empty-action"><p>No upcoming events are available yet. Connect with organizers to see what is next.</p><div className="mt-4 flex gap-2"><Link href="/network" className="secondary-action">Find organizers</Link>{["artist", "gallery", "event_series", "curator", "institution"].includes(summary.profile.profileType) ? <Link href="/events/new" className="primary-action">Create event</Link> : null}</div></div>}
      </Module>

      <Module title="Connection requests" hidden={!data.connectionRequests.length}>
        <div>{data.connectionRequests.map((item: any) => <article key={item.id} className="list-row first:border-t"><Avatar profile={item.profile}/><div className="min-w-0 flex-1"><Link href={`/profile/${item.profile?.slug}`} className="font-medium">{item.profile?.displayName}</Link><p className="meta-text capitalize">{item.profile?.profileType.replaceAll("_", " ")}</p></div><div className="flex gap-2"><button onClick={() => void respond(item.id, "accept")} className="primary-action">Accept</button><button onClick={() => void respond(item.id, "decline")} className="text-action px-2">Decline</button></div></article>)}</div>
      </Module>

      <Module title="People to connect with" action={<Link href="/network" className="text-action">Open Network</Link>}>
        {data.suggestedProfiles.length ? <div>{data.suggestedProfiles.map((profile: any) => <article key={profile.id} className="list-row first:border-t"><Avatar profile={profile}/><div className="min-w-0 flex-1"><Link href={profile.profileType === "artist" ? `/artist/${profile.slug}` : `/profile/${profile.slug}`} onClick={() => trackNetwork("home_suggested_profile_click", { targetProfileId: profile.networkProfileId })} className="font-medium">{profile.displayName}</Link><p className="meta-text truncate">{profile.reason}</p></div><button onClick={() => void connect(profile)} className="secondary-action">Connect</button></article>)}</div> : <div className="empty-action"><p>Explore profiles by city, discipline and role to build your network.</p><Link href="/network" className="secondary-action mt-4">Explore Network</Link></div>}
      </Module>

      <Module title="Network updates" action={<Link href="/updates" onClick={() => trackNetwork("home_updates_opened")} className="text-action">View all updates</Link>}>
        {data.recentUpdates.length ? <div>{data.recentUpdates.map((update: any) => <Link key={update.id} href={`/profile/${update.author?.slug}`} className="list-row first:border-t"><Avatar profile={update.author} size="sm"/><div className="min-w-0 flex-1"><p className="font-medium">{update.author?.displayName}</p><p className="meta-text line-clamp-2">{update.text || `Published a ${update.type.replaceAll("_", " ")}`}</p></div></Link>)}</div> : <div className="empty-action"><p>Updates from your connections and followed profiles will appear here.</p><Link href="/network" className="secondary-action mt-4">Find relevant profiles</Link></div>}
      </Module>
    </div>
  </main>;
}
