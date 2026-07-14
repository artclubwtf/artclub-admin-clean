"use client";

import { createNetworkApiClient } from "@artclub/api-client";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

const api = createNetworkApiClient();
type Profile = { id: string; networkProfileId?: string; slug: string; displayName: string; username: string; profileType: string; city: string; country?: string; profileImageUrl: string; reason?: string };

function Avatar({ profile }: { profile: any }) {
  return profile?.profileImageUrl ? <img src={profile.profileImageUrl} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover"/> : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--surface-soft)] font-medium">{profile?.displayName?.[0] || "·"}</span>;
}

export function DiscoveryClient() {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [view, setView] = useState("discover");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [relations, setRelations] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (["requests", "connections", "following"].includes(view)) {
        const status = view === "requests" ? "pending" : view === "following" ? "following" : "accepted";
        const data = await api.request<any>(`/connections?status=${status}`);
        setRelations(data.connections);
      } else {
        const data = await api.request<any>(`/profiles?q=${encodeURIComponent(q)}&type=${type}`);
        setProfiles(data.profiles);
      }
      setError("");
    } catch { setError("The network could not be loaded."); }
    finally { setLoading(false); }
  }, [q, type, view]);
  useEffect(() => { void load(); }, [view]);

  async function connect(id: string) {
    try { await api.request("/connections", { method: "POST", body: JSON.stringify({ profileId: id }) }); setProfiles((value) => value.filter((profile) => profile.id !== id)); }
    catch { setError("The connection request could not be sent."); }
  }
  async function respond(id: string, action: string) {
    try { await api.request(`/connections/${id}`, { method: "PATCH", body: JSON.stringify({ action }) }); setRelations((value) => value.filter((item) => item.id !== id)); }
    catch { setError("The request could not be updated."); }
  }

  const visible = view === "discover" ? profiles : relations;
  return <main className="app-page max-w-4xl"><header><h1 className="page-heading">Network</h1><p className="meta-text mt-2">Discover people and organizations across the art world.</p></header><nav className="quiet-tabs mt-7">{[["discover", "Discover"], ["requests", "Requests"], ["connections", "Connections"], ["following", "Following"]].map(([key, label]) => <button key={key} onClick={() => setView(key)} className="quiet-tab" aria-selected={view === key}>{label}</button>)}</nav>{view === "discover" ? <form onSubmit={(event: FormEvent) => { event.preventDefault(); void load(); }} className="my-6 grid gap-3 sm:grid-cols-[1fr_auto_auto]"><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Name, username, city, discipline or interest" className="control min-w-0"/><select value={type} onChange={(event) => setType(event.target.value)} className="control"><option value="">All roles</option><option value="artist">Artists</option><option value="collector">Collectors</option><option value="gallery">Galleries</option><option value="event_series">Event organizers</option><option value="curator">Curators</option><option value="institution">Institutions</option></select><button className="primary-action">Search</button></form> : null}{error ? <p className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}<div className="mt-2 border-t border-[var(--divider)]">{loading ? [1, 2, 3, 4].map((item) => <div key={item} className="list-row animate-pulse"><span className="h-12 w-12 rounded-full bg-[var(--surface-soft)]"/><span className="h-4 w-48 rounded-[4px] bg-[var(--surface-soft)]"/></div>) : view === "discover" ? profiles.map((profile) => <article key={profile.id} className="list-row"><Avatar profile={profile}/><div className="min-w-0 flex-1"><Link href={profile.profileType === "artist" ? `/artist/${profile.slug}` : `/profile/${profile.slug}`} className="font-medium">{profile.displayName}</Link><p className="meta-text truncate">@{profile.username} · {profile.profileType.replaceAll("_", " ")}{profile.city ? ` · ${profile.city}` : ""}</p><p className="text-xs text-[var(--text-faint)]">{profile.reason}</p></div><button onClick={() => void connect(profile.id)} className="secondary-action">Connect</button></article>) : relations.map((item) => <article key={item.id} className="list-row"><Avatar profile={item.profile}/><div className="min-w-0 flex-1"><Link href={item.profile?.profileType === "artist" ? `/artist/${item.profile?.slug}` : `/profile/${item.profile?.slug}`} className="font-medium">{item.profile?.displayName}</Link><p className="meta-text capitalize">{item.state.replaceAll("_", " ")}</p></div>{item.incoming && item.state === "incoming_pending" ? <div className="flex gap-2"><button onClick={() => void respond(item.id, "accept")} className="primary-action">Accept</button><button onClick={() => void respond(item.id, "decline")} className="text-action">Decline</button></div> : item.state === "connected" ? <span className="meta-text">Connected</span> : item.state === "following" ? <span className="meta-text">Following</span> : null}</article>)}</div>{!loading && !visible.length && !error ? <div className="empty-action py-16 text-center"><p>{view === "discover" ? "Complete your profile and search by city, discipline or role to find relevant people." : view === "requests" ? "No incoming requests right now. Discover relevant profiles to grow your network." : view === "connections" ? "Connections unlock direct conversations and professional updates." : "Follow profiles to keep up with their art, events and professional work."}</p>{view !== "discover" ? <button onClick={() => setView("discover")} className="secondary-action mt-4">Discover profiles</button> : null}</div> : null}</main>;
}
