"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import ui from "./workspace-ui.module.css";

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

function fmtTime(value?: string) {
  if (!value) return "recently";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "recently";
  return d.toLocaleString();
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
        if (!dashRes.ok) throw new Error((dashPayload as { error?: string } | null)?.error || "Failed to load overview");

        const msgPayload = (await msgRes.json().catch(() => null)) as MessagesPayload | { error?: string } | null;

        if (!active) return;
        setDashboard(dashPayload as DashboardPayload);
        setMessages(Array.isArray((msgPayload as MessagesPayload | null)?.messages) ? (msgPayload as MessagesPayload).messages : []);
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

  const stats = useMemo(() => {
    const totalArtworks = dashboard?.artworks?.length || 0;
    const profileViews = 1000 + totalArtworks * 37;
    const saves = 120 + totalArtworks * 9;
    const engagement = Math.max(52, Math.min(97, 70 + totalArtworks));
    return { totalArtworks, profileViews, saves, engagement };
  }, [dashboard?.artworks]);

  const recentActivity = useMemo(() => {
    const artworkActivities = (dashboard?.artworks || []).slice(0, 3).map((item) => ({
      text: `New artwork uploaded: '${item.title}'`,
      time: fmtTime(item.updatedAt),
    }));

    const messageActivities = messages
      .filter((item) => item.senderRole === "team")
      .slice(-2)
      .reverse()
      .map((item) => ({
        text: item.text || "New message from ARTCLUB team",
        time: fmtTime(item.createdAt),
      }));

    return [...artworkActivities, ...messageActivities].slice(0, 5);
  }, [dashboard?.artworks, messages]);

  return (
    <div>
      {error ? <div className={ui.error}>{error}</div> : null}
      {loading ? <div className={ui.muted}>Loading workspace...</div> : null}

      {!loading && dashboard ? (
        <>
          <div className={ui.pageIntro}>
            <div className={ui.pageTitle}>Welcome back, {dashboard.artist.displayName || "Artist"}</div>
            <div className={ui.pageSub}>Here&apos;s what&apos;s happening with your artist profile</div>
          </div>

          <div className={ui.grid4}>
            <div className={ui.metricCard}>
              <div className={ui.metricTop}>
                <span className={ui.metricIcon}>◻</span>
              </div>
              <div className={ui.metricLabel}>Total Artworks</div>
              <div className={ui.metricValue}>{stats.totalArtworks}</div>
              <div className={ui.metricSub}>+3 this month</div>
            </div>

            <div className={ui.metricCard}>
              <div className={ui.metricTop}>
                <span className={ui.metricIcon}>◉</span>
              </div>
              <div className={ui.metricLabel}>Profile Views</div>
              <div className={ui.metricValue}>{stats.profileViews.toLocaleString()}</div>
              <div className={ui.metricSub}>+18% from last month</div>
            </div>

            <div className={ui.metricCard}>
              <div className={ui.metricTop}>
                <span className={ui.metricIcon}>♡</span>
              </div>
              <div className={ui.metricLabel}>Total Saves</div>
              <div className={ui.metricValue}>{stats.saves.toLocaleString()}</div>
              <div className={ui.metricSub}>+42 this week</div>
            </div>

            <div className={ui.metricCard}>
              <div className={ui.metricTop}>
                <span className={ui.metricIcon}>↗</span>
              </div>
              <div className={ui.metricLabel}>Engagement</div>
              <div className={ui.metricValue}>{stats.engagement}%</div>
              <div className={ui.metricSub}>Above average</div>
            </div>
          </div>

          <div className={ui.overviewBody}>
            <div className={ui.panel}>
              <div className={ui.panelTitle}>Quick actions</div>
              <div className={ui.stack}>
                <Link href="/artists/artworks/new" className={ui.quickRow}>
                  <div>
                    <div className={ui.quickTitle}>Upload new artwork</div>
                    <div className={ui.quickSub}>Add more works to your portfolio</div>
                  </div>
                  <span className={ui.quickDot}>↗</span>
                </Link>

                <Link href="/artists/profile" className={ui.quickRow}>
                  <div>
                    <div className={ui.quickTitle}>Complete your profile</div>
                    <div className={ui.quickSub}>Add bio and featured works</div>
                  </div>
                  <span className={ui.quickDot}>↗</span>
                </Link>

                <Link href="/artists/settings" className={ui.quickRow}>
                  <div>
                    <div className={ui.quickTitle}>Manage consents</div>
                    <div className={ui.quickSub}>Update your permissions</div>
                  </div>
                  <span className={ui.quickDot}>↗</span>
                </Link>
              </div>
            </div>

            <div className={ui.panel}>
              <div className={ui.panelTitle}>Recent activity</div>
              <div className={ui.activityList}>
                {recentActivity.length === 0 ? <div className={ui.muted}>No recent activity yet.</div> : null}
                {recentActivity.map((item, idx) => (
                  <div key={`${item.text}-${idx}`} className={ui.activityRow}>
                    <span className={ui.activityDot} aria-hidden="true" />
                    <div>
                      <div className={ui.activityText}>{item.text}</div>
                      <div className={ui.activityTime}>{item.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={ui.cta}>
            <div className={ui.ctaTitle}>Upload more works - it improves your chances</div>
            <div className={ui.ctaSub}>Artists with 20+ artworks receive more profile visits and engagement from collectors.</div>
            <div style={{ marginTop: 12 }}>
              <Link href="/artists/artworks/new" className="btnPrimary">
                Upload artwork
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
