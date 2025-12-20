"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type ArtistProfile = {
  id: string;
  name: string;
  stage?: string;
  heroImageUrl?: string;
  shopifyMetaobjectId?: string;
  createdAt?: string;
  updatedAt?: string;
};

const stageHints: Record<string, string> = {
  Idea: "Upload media and add your profile basics.",
  "In Review": "Hang tight. You’ll hear from the team soon.",
  Offer: "Review contract details and share your media.",
  "Under Contract": "Keep media up to date and track payouts.",
};

export default function ArtistOverviewPage() {
  const [profile, setProfile] = useState<ArtistProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const nextStep = useMemo(() => {
    if (!profile?.stage) return "Start by adding your media and profile.";
    return stageHints[profile.stage] ?? "Keep your profile and media fresh.";
  }, [profile?.stage]);

  return (
    <div className="artist-card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="artist-section-title">{profile?.name || "Artist Overview"}</div>
          <div className="artist-section-sub">
            {profile?.stage ? `Stage: ${profile.stage}` : "Loading your artist details..."}
          </div>
        </div>
        {profile?.heroImageUrl && (
          <div className="h-14 w-14 overflow-hidden rounded-full shadow" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={profile.heroImageUrl} alt="" className="h-full w-full object-cover" />
          </div>
        )}
      </div>

      {error && <div className="artist-placeholder">Error: {error}</div>}
      {loading && !error && <div className="artist-placeholder">Loading your profile...</div>}
      {!loading && !error && (
        <>
          <div className="artist-placeholder">Next steps: {nextStep}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/artist/media" className="artist-card">
              <div className="artist-section-title">Your media</div>
              <div className="artist-section-sub">Upload files and keep assets organized.</div>
              <div className="artist-placeholder">Coming next: uploads & previews.</div>
            </Link>
            <Link href="/artist/artworks" className="artist-card">
              <div className="artist-section-title">Your artworks</div>
              <div className="artist-section-sub">Prepare drafts and view statuses.</div>
              <div className="artist-placeholder">Coming next: drafts & statuses.</div>
            </Link>
            <Link href="/artist/contracts" className="artist-card">
              <div className="artist-section-title">Contracts</div>
              <div className="artist-section-sub">View agreements when ready.</div>
              <div className="artist-placeholder">Coming next: contract list.</div>
            </Link>
            <Link href="/artist/payout" className="artist-card">
              <div className="artist-section-title">Payout</div>
              <div className="artist-section-sub">Track upcoming payouts and details.</div>
              <div className="artist-placeholder">Coming next: payout history.</div>
            </Link>
            <Link href="/artist/messages" className="artist-card">
              <div className="artist-section-title">Messages</div>
              <div className="artist-section-sub">Stay in touch with the team.</div>
              <div className="artist-placeholder">Coming next: inbox & replies.</div>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
