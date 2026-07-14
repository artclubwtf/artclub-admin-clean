"use client";

import { createNetworkApiClient } from "@artclub/api-client";
import Link from "next/link";
import { useEffect, useState } from "react";

import { MessageRequestModal } from "@/components/messages/MessageRequestModal";
import { PublicArtistProfilePage } from "@/components/public-profile/PublicArtistProfilePage";
import { trackNetwork } from "@/lib/client/network-analytics";
import type { PublicArtistProfilePageData } from "@/lib/types";

const api = createNetworkApiClient();
type Props = { profile: any; artistProfile?: PublicArtistProfilePageData | null; viewerMode: "public" | "network"; mine?: boolean };

export function UnifiedProfileView({ profile, artistProfile, viewerMode, mine = false }: Props) {
  const [details, setDetails] = useState<any>(null);
  const [completion, setCompletion] = useState<any>(null);
  const [error, setError] = useState("");
  const [messageRequestOpen, setMessageRequestOpen] = useState(false);

  useEffect(() => {
    if (viewerMode !== "network") return;
    api.request<any>(`/profiles/${encodeURIComponent(profile.slug)}`).then(setDetails).catch(() => setError("Profile actions are temporarily unavailable."));
    if (mine) api.request<any>("/home").then((data) => setCompletion(data.profileSummary?.completion)).catch(() => undefined);
    trackNetwork("profile_view", { targetProfileId: profile.networkProfileId });
  }, [mine, profile.networkProfileId, profile.slug, viewerMode]);

  const state = details?.relation?.state || "none";
  const followed = details?.viewer?.followed === true;
  const liked = details?.viewer?.liked === true;
  const counts = details?.counts || { connections: 0, followers: 0, likes: 0, posts: 0 };

  async function connection(action?: string) {
    try {
      if (!action) {
        const data = await api.request<any>("/connections", { method: "POST", body: JSON.stringify({ profileId: profile.id }) });
        setDetails((value: any) => ({ ...value, relation: data.connection, viewer: { ...value.viewer, followed: true }, counts: { ...value.counts, followers: value.counts.followers + (value.viewer?.followed ? 0 : 1) } }));
        return;
      }
      const data = await api.request<any>(`/connections/${details.relation.id}`, { method: "PATCH", body: JSON.stringify({ action }) });
      setDetails((value: any) => ({ ...value, relation: data.connection, counts: { ...value.counts, connections: value.counts.connections + (action === "accept" ? 1 : action === "remove" ? -1 : 0) } }));
    } catch { setError("The connection could not be updated."); }
  }

  async function follow() {
    try {
      await api.request(`/profiles/${encodeURIComponent(profile.id)}/follow`, { method: followed ? "DELETE" : "POST" });
      trackNetwork(followed ? "profile_unfollow" : "profile_follow", { targetProfileId: profile.networkProfileId });
      setDetails((value: any) => ({ ...value, viewer: { ...value.viewer, followed: !followed }, counts: { ...value.counts, followers: value.counts.followers + (followed ? -1 : 1) } }));
    } catch { setError("Follow could not be updated."); }
  }

  async function appreciate() {
    try {
      await api.request(`/profiles/${encodeURIComponent(profile.id)}/like`, { method: liked ? "DELETE" : "POST" });
      setDetails((value: any) => ({ ...value, viewer: { ...value.viewer, liked: !liked }, counts: { ...value.counts, likes: value.counts.likes + (liked ? -1 : 1) } }));
    } catch { setError("Appreciation could not be updated."); }
  }

  async function message() {
    if (state === "connected") {
      try { const data = await api.request<any>("/conversations", { method: "POST", body: JSON.stringify({ profileId: profile.id }) }); location.href = `/messages/${data.conversation.id}`; }
      catch { setError("The conversation could not be opened."); }
      return;
    }
    setMessageRequestOpen(true);
  }

  async function sendMessageRequest(text: string) {
    await api.request("/message-requests", { method: "POST", body: JSON.stringify({ profileId: profile.id, text }) });
    setDetails((value: any) => ({ ...value, relation: { ...value.relation, state: "outgoing_pending" } }));
  }

  async function share(native = false) {
    const url = profile.profileType === "artist" ? `${location.origin}/artist/${profile.slug}` : `${location.origin}/profile/${profile.slug}`;
    if (native && navigator.share) await navigator.share({ title: profile.displayName, url }); else await navigator.clipboard.writeText(url);
    trackNetwork(native ? "profile_share" : "profile_link_copy", { targetProfileId: profile.networkProfileId });
  }

  function Counts() {
    return <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--text-muted)]"><span><b className="font-medium text-[var(--text)]">{counts.connections}</b> connections</span><span><b className="font-medium text-[var(--text)]">{counts.followers}</b> followers</span><span><b className="font-medium text-[var(--text)]">{counts.likes}</b> appreciations</span></div>;
  }

  function Actions() {
    if (viewerMode !== "network") return null;
    if (mine) return <div className="space-y-4"><div className="flex flex-wrap gap-2"><Link href="/settings/profile" onClick={() => trackNetwork("profile_edit_started")} className="primary-action">Edit profile</Link><button onClick={() => void share(true)} className="secondary-action">Share</button><button onClick={() => void share(false)} className="text-action px-2 py-3">Copy link</button><Link href="/create" className="text-action px-2 py-3">Create</Link><Link href="/analytics" className="text-action px-2 py-3">Analytics</Link></div><Counts/>{completion ? <div className="border-t border-[var(--divider)] pt-4"><div className="flex items-center justify-between text-sm"><span>Profile completeness</span><span className="tabular-nums">{completion.percentage}%</span></div><div className="mt-2 h-1.5 bg-[var(--surface-soft)]"><div className="h-full bg-[var(--primary)]" style={{ width: `${completion.percentage}%` }}/></div>{completion.missing?.slice(0, 3).map((task: any) => <Link key={task.id} href={task.href} className="task-link">{task.label}<span aria-hidden>→</span></Link>)}</div> : null}</div>;
    if (state === "blocked") return <p className="meta-text">Interactions unavailable</p>;
    return <div className="space-y-4"><div className="flex flex-wrap gap-2">{state === "none" ? <button onClick={() => void connection()} className="primary-action">Connect</button> : null}{state === "outgoing_pending" ? <><span className="secondary-action">Request sent</span><button onClick={() => void connection("cancel")} className="text-action px-2">Cancel</button></> : null}{state === "incoming_pending" ? <><button onClick={() => void connection("accept")} className="primary-action">Accept</button><button onClick={() => void connection("decline")} className="secondary-action">Decline</button></> : null}{state === "connected" ? <><button onClick={() => void message()} className="primary-action">Message</button><button onClick={() => void connection("remove")} className="text-action px-2">Remove connection</button></> : null}{state !== "connected" ? <button onClick={() => void message()} className="secondary-action">Message request</button> : null}<button onClick={() => void follow()} className="secondary-action">{followed ? "Following" : "Follow"}</button><button onClick={() => void appreciate()} className="text-action px-2">{liked ? "Appreciated" : "Appreciate"}</button><button onClick={() => void share(true)} className="text-action px-2">Share</button></div><Counts/></div>;
  }

  const actionBlock = <>{error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}<Actions/><MessageRequestModal open={messageRequestOpen} recipient={profile} onClose={() => setMessageRequestOpen(false)} onSend={sendMessageRequest}/></>;
  if (artistProfile) return <PublicArtistProfilePage profile={artistProfile} headerActions={actionBlock}/>;

  const sectionsByRole: Record<string, string[]> = {
    artist: ["About", "Artworks", "Exhibitions", "Education", "Experience", "Events", "Updates", "Connections", "Links"],
    collector: ["About", "Collection", "Events", "Updates", "Connections", "Links"],
    art_enthusiast: ["About", "Collection", "Events", "Updates", "Connections", "Links"],
    event_series: ["About", "Events", "Participating Artists", "Updates", "Connections", "Links"],
    gallery: ["About", "Artists", "Exhibitions", "Events", "Updates", "Connections", "Links"],
  };
  const sections = sectionsByRole[profile.profileType] || ["About", "Events", "Updates", "Connections", "Links"];
  return <main className="mx-auto max-w-5xl pb-16"><div className="relative"><div className="h-48 overflow-hidden bg-[var(--surface-soft)] sm:h-64 sm:rounded-b-[6px]">{profile.coverImageUrl ? <img src={profile.coverImageUrl} alt="" className="h-full w-full object-cover"/> : null}</div><div className="app-page !pt-0"><div className="-mt-12 h-24 w-24 overflow-hidden rounded-full border-4 border-[var(--canvas)] bg-[var(--surface-soft)] sm:-mt-16 sm:h-32 sm:w-32">{profile.profileImageUrl ? <img src={profile.profileImageUrl} alt="" className="h-full w-full object-cover"/> : <span className="grid h-full w-full place-items-center text-3xl font-medium">{profile.displayName[0]}</span>}</div><div className="mt-5 grid gap-6 md:grid-cols-[1fr_auto] md:items-start"><div><h1 className="page-heading">{profile.displayName}</h1><p className="meta-text mt-2">@{profile.username} · {profile.profileType.replaceAll("_", " ")}{profile.city || profile.country ? ` · ${[profile.city, profile.country].filter(Boolean).join(", ")}` : ""}</p>{profile.bio ? <p className="mt-5 max-w-2xl whitespace-pre-wrap leading-7 text-[var(--text-muted)]">{profile.bio}</p> : mine ? <Link href="/settings/profile" className="meta-text mt-5 inline-block">Add a bio →</Link> : null}{profile.website || profile.instagram ? <div className="mt-4 flex gap-4 text-sm">{profile.website ? <a href={profile.website} target="_blank" rel="noreferrer">Website ↗</a> : null}{profile.instagram ? <span>@{profile.instagram.replace(/^@/, "")}</span> : null}</div> : null}</div><div className="md:min-w-72">{actionBlock}</div></div><nav className="quiet-tabs mt-10">{sections.map((section, index) => <span key={section} className="quiet-tab" aria-selected={index === 0 ? "true" : undefined}>{section}</span>)}</nav></div></div></main>;
}
