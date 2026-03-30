"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import EmptyState from "@/app/artists/_components/EmptyState";
import PageShell from "@/app/artists/_components/PageShell";
import SectionCard from "@/app/artists/_components/SectionCard";

type DashboardPayload = {
  ok: boolean;
  artist: {
    displayName: string;
    onboardingComplete: boolean;
    profileImages: { avatarUrl: string; heroUrl: string; galleryUrls: string[] };
  };
  artworks: Array<{
    productKey: string;
    title: string;
    status: string;
    updatedAt?: string;
    images?: { thumbUrl?: string; mediumUrl?: string; originalUrl?: string };
  }>;
};

type MessagesPayload = {
  ok: boolean;
  messages: Array<{ id: string; text: string; senderRole: "artist" | "team"; createdAt?: string }>;
};

function fmtDate(value?: string) {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

export default function ArtistsOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [messages, setMessages] = useState<MessagesPayload["messages"]>([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [dashRes, msgRes] = await Promise.all([
          fetch("/api/artists/v2/dashboard", { cache: "no-store" }),
          fetch("/api/artists/v3/messages", { cache: "no-store" }),
        ]);

        const dashPayload = (await dashRes.json().catch(() => null)) as DashboardPayload | { error?: string } | null;
        if (!dashRes.ok) {
          throw new Error((dashPayload as { error?: string } | null)?.error || "Failed to load overview");
        }

        const msgPayload = (await msgRes.json().catch(() => null)) as MessagesPayload | { error?: string } | null;
        if (msgRes.ok && active) {
          setMessages(Array.isArray((msgPayload as MessagesPayload | null)?.messages) ? (msgPayload as MessagesPayload).messages : []);
        }

        if (active) {
          setDashboard(dashPayload as DashboardPayload);
        }
      } catch (err: any) {
        if (active) setError(err?.message || "Failed to load overview");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <PageShell
      title="Overview"
      subtitle="Your artist workspace at a glance"
      actions={
        <>
          <Link href="/artists/artworks/new" className="btnPrimary">
            New artwork
          </Link>
          <Link href="/artists/media" className="btnGhost">
            Upload media
          </Link>
        </>
      }
    >
      {error ? <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {loading ? <div className="text-sm text-slate-600">Loading workspace…</div> : null}

      {!loading && dashboard ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <SectionCard title="Profile completeness" subtitle="Keep your public profile fresh">
            <div className="text-sm text-slate-700">
              <div>Display name: {dashboard.artist.displayName || "Missing"}</div>
              <div>Avatar: {dashboard.artist.profileImages.avatarUrl ? "Added" : "Missing"}</div>
              <div>Hero: {dashboard.artist.profileImages.heroUrl ? "Added" : "Missing"}</div>
              <div>Gallery: {dashboard.artist.profileImages.galleryUrls?.length || 0} image(s)</div>
            </div>
            <div className="mt-3">
              <Link href="/artists/profile" className="btnGhost">
                Edit profile
              </Link>
            </div>
          </SectionCard>

          <SectionCard title="Latest artworks" subtitle="Recent updates">
            {dashboard.artworks.length === 0 ? (
              <EmptyState
                title="No artworks yet"
                description="Create your first artwork draft to start your catalog."
                action={
                  <Link href="/artists/artworks/new" className="btnPrimary">
                    Create artwork
                  </Link>
                }
              />
            ) : (
              <div className="space-y-2">
                {dashboard.artworks.slice(0, 6).map((item) => (
                  <Link
                    key={item.productKey}
                    href={`/artists/artworks/${encodeURIComponent(item.productKey)}`}
                    className="block rounded border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    <div className="font-semibold text-slate-900">{item.title}</div>
                    <div className="text-xs text-slate-500">
                      {item.status} · Updated {fmtDate(item.updatedAt)}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Messages" subtitle="Latest thread preview">
            {messages.length === 0 ? (
              <EmptyState
                title="No messages yet"
                description="Start a conversation with the Artclub team."
                action={
                  <Link href="/artists/messages" className="btnGhost">
                    Open inbox
                  </Link>
                }
              />
            ) : (
              <div className="space-y-2">
                {messages.slice(-3).map((message) => (
                  <div key={message.id} className="rounded border border-slate-200 px-3 py-2 text-sm">
                    <div className="text-xs text-slate-500">{message.senderRole.toUpperCase()}</div>
                    <div className="text-slate-800">{message.text || "(attachment)"}</div>
                    <div className="text-xs text-slate-500">{fmtDate(message.createdAt)}</div>
                  </div>
                ))}
                <Link href="/artists/messages" className="btnGhost inline-flex">
                  Open messages
                </Link>
              </div>
            )}
          </SectionCard>
        </div>
      ) : null}
    </PageShell>
  );
}
