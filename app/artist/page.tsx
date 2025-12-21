"use client";

import { useEffect, useMemo, useState } from "react";

import { ApRow, ApSection, ApSectionHeader } from "@/components/artist/ApElements";

type ArtistProfile = {
  id: string;
  name: string;
  stage?: string;
  heroImageUrl?: string;
  shopifyMetaobjectId?: string;
  createdAt?: string;
  updatedAt?: string;
};

type RequestItem = {
  id: string;
  type: string;
  status: string;
  createdAt?: string;
};

const stageHints: Record<string, string> = {
  Idea: "Upload media and add your profile basics.",
  "In Review": "Hang tight. You’ll hear from the team soon.",
  Offer: "Review contract details and share your media.",
  "Under Contract": "Keep media up to date and track payouts.",
};

const requestTone = (status: string) => {
  const key = status.toLowerCase();
  if (["approved", "completed", "resolved"].includes(key)) return "success";
  if (["pending", "submitted", "in_review"].includes(key)) return "info";
  if (["rejected", "error", "failed"].includes(key)) return "warn";
  return "neutral";
};

export default function ArtistOverviewPage() {
  const [profile, setProfile] = useState<ArtistProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState<RequestItem[]>([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/artist/me", { cache: "no-store" });
        const payload = (await res.json().catch(() => null)) as { error?: string } | ArtistProfile | null;
        if (!res.ok) {
          throw new Error((payload as { error?: string })?.error || "Failed to load profile");
        }
        if (!active) return;
        setProfile(payload as ArtistProfile);
      } catch (err: any) {
        if (!active) return;
        setError(err?.message ?? "Failed to load profile");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadRequests = async () => {
      try {
        const res = await fetch("/api/artist/requests", { cache: "no-store" });
        const payload = (await res.json().catch(() => null)) as { requests?: RequestItem[] } | null;
        if (!res.ok) throw new Error(payload?.requests ? "" : "Failed to load requests");
        if (!active) return;
        setRequests(Array.isArray(payload?.requests) ? payload.requests : []);
      } catch {
        // ignore silently
      }
    };
    loadRequests();
    return () => {
      active = false;
    };
  }, []);

  const nextStep = useMemo(() => {
    if (!profile?.stage) return "Start by adding your media and profile.";
    return stageHints[profile.stage] ?? "Keep your profile and media fresh.";
  }, [profile?.stage]);

  return (
    <div className="space-y-4">
      <ApSection>
        <ApSectionHeader
          title={profile?.name || "Artist Overview"}
          subtitle="Profile summary and next steps"
          action={profile?.stage ? <span className="ap-pill">Stage: {profile.stage}</span> : null}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="ap-section-subtitle">
            {profile?.shopifyMetaobjectId ? "Linked to Shopify" : "You can sync your work when ready."}
          </div>
          {profile?.heroImageUrl && (
            <div
              className="h-14 w-14 overflow-hidden rounded-full border"
              style={{ borderColor: "var(--ap-border)" }}
              aria-hidden
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={profile.heroImageUrl} alt="" className="h-full w-full object-cover" />
            </div>
          )}
        </div>

        {error && <div className="ap-note">Error: {error}</div>}
        {loading && !error && <div className="ap-note">Loading your profile...</div>}
        {!loading && !error && <div className="ap-note">Next steps: {nextStep}</div>}
      </ApSection>

      <ApSection>
        <ApSectionHeader title="Quick actions" subtitle="Jump to the most common tasks" />
        <div className="ap-rows">
          <ApRow title="Media" subtitle="Upload, preview, and pick files" href="/artist/media" icon="🖼️" chevron />
          <ApRow title="Artworks" subtitle="Submit new pieces and track status" href="/artist/artworks" icon="🎨" chevron />
          <ApRow title="Contracts" subtitle="See and download agreements" href="/artist/contracts" icon="📄" chevron />
          <ApRow title="Payout" subtitle="View bank and tax info" href="/artist/payout" icon="💸" chevron />
          <ApRow title="Messages" subtitle="Chat with the Artclub team" href="/artist/messages" icon="💬" chevron />
        </div>
      </ApSection>

      <ApSection>
        <ApSectionHeader title="Requests" subtitle="Track your submitted requests" />
        {requests.length === 0 ? (
          <div className="ap-note">No requests yet.</div>
        ) : (
          <div className="ap-rows">
            {requests.map((r) => (
              <ApRow
                key={r.id}
                title={r.type}
                subtitle={r.createdAt ? new Date(r.createdAt).toLocaleString() : ""}
                meta={<span className="ap-badge" data-tone={requestTone(r.status)}>{r.status}</span>}
              />
            ))}
          </div>
        )}
      </ApSection>
    </div>
  );
}
