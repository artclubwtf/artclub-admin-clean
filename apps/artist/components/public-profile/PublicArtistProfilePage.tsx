"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  ArtistEducationItem,
  ArtistExhibitionItem,
  ArtistExperienceItem,
  ArtistProfileLinkItem,
  PublicArtistArtworkItem,
  PublicArtistProfilePageData,
} from "@/lib/types";
import { formatDateRange, summarizeHost } from "@/components/profile/section-utils";

type PublicArtistProfilePageProps = {
  profile: PublicArtistProfilePageData;
};

const tabs = [
  { key: "artworks", label: "Artworks" },
  { key: "exhibitions", label: "Exhibitions" },
  { key: "education", label: "Education" },
  { key: "experience", label: "Experience" },
  { key: "links", label: "Links" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

function parseTabFromHash(hash: string): TabKey {
  const cleaned = hash.replace(/^#/, "").trim().toLowerCase();
  return (tabs.find((tab) => tab.key === cleaned)?.key || "artworks") as TabKey;
}

function SocialIcon({ type }: { type: string }) {
  const className = "h-[18px] w-[18px] text-neutral-900";
  switch (type) {
    case "instagram":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke="currentColor" strokeWidth="1.7" />
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.7" />
          <circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" />
        </svg>
      );
    case "linkedin":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
          <rect x="4" y="8.5" width="3.2" height="11.5" fill="currentColor" />
          <rect x="4" y="4" width="3.2" height="3.2" rx="1.6" fill="currentColor" />
          <path d="M10.5 8.5h3v1.7c.7-1.1 1.9-1.9 3.7-1.9 3 0 4.3 1.8 4.3 5.2V20h-3.2v-5.7c0-1.8-.6-3-2.2-3-1.7 0-2.6 1.1-2.6 3.1V20h-3.2V8.5Z" fill="currentColor" />
        </svg>
      );
    case "tiktok":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
          <path d="M13.8 4v8.4a3 3 0 1 1-2.1-2.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M13.8 4c.8 2 2.1 3.2 4.2 3.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "youtube":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
          <rect x="3.5" y="6.5" width="17" height="11" rx="3" stroke="currentColor" strokeWidth="1.7" />
          <path d="m10 9.5 5 2.5-5 2.5v-5Z" fill="currentColor" />
        </svg>
      );
    case "behance":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
          <path d="M4 6.5h5.2c2.5 0 4 1.2 4 3 0 1.2-.7 2.1-1.8 2.5 1.6.3 2.6 1.5 2.6 3.1 0 2.2-1.8 3.7-4.7 3.7H4V6.5Zm5 5c1.2 0 1.9-.5 1.9-1.4S10.2 8.7 9 8.7H6.4v2.8H9Zm.3 5.1c1.4 0 2.2-.6 2.2-1.6 0-1-.8-1.6-2.2-1.6H6.4v3.2h2.9Zm5.7-8.3h5.5M15.1 12.1c.2-2.1 1.8-3.5 4.2-3.5 2.6 0 4.2 1.5 4.2 4.1v1H17c.1 1.8 1 2.7 2.7 2.7 1.1 0 1.9-.4 2.2-1.1h1.5c-.5 1.9-2 3-3.9 3-2.8 0-4.5-1.9-4.5-4.9 0-.4 0-.8.1-1.3Zm6.9.2c-.1-1.5-1-2.3-2.5-2.3-1.4 0-2.3.8-2.5 2.3h5Z" fill="currentColor" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />
          <path d="M8.5 12h7M12 8.5v7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      );
  }
}

function EntryImage({ src, alt }: { src: string; alt: string }) {
  if (!src) return null;
  return (
    <div className="mt-4 overflow-hidden rounded-[1.1rem] bg-neutral-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="h-44 w-full object-cover" />
    </div>
  );
}

function ArtworksTab({
  artworks,
  onSelect,
}: {
  artworks: PublicArtistArtworkItem[];
  onSelect: (artwork: PublicArtistArtworkItem) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8">
      {artworks.map((artwork) => (
        <button key={artwork.productKey} type="button" className="space-y-3 text-left" onClick={() => onSelect(artwork)}>
          <div className="relative overflow-hidden rounded-[0.25rem] bg-neutral-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={artwork.imageUrl} alt={artwork.title} className="aspect-[0.78] w-full object-cover" />
            <div className="absolute bottom-3 right-3 rounded-full bg-white/92 px-3 py-1 text-[11px] font-medium tracking-[-0.01em] text-neutral-900">
              {artwork.detailLabel}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[0.95rem] font-semibold tracking-[-0.02em] text-neutral-950">{artwork.title}</div>
            {artwork.year ? <div className="text-sm text-neutral-600">{artwork.year}</div> : null}
            <div className="text-sm text-neutral-500">{artwork.priceLabel}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

function ListEntry({
  title,
  metaLeft,
  metaRight,
  subline,
  description,
  imageUrl,
}: {
  title: string;
  metaLeft: string;
  metaRight?: string;
  subline?: string;
  description?: string;
  imageUrl?: string;
}) {
  return (
    <article className="space-y-2 border-b border-neutral-300/80 pb-8">
      <div className="space-y-1">
        <h3 className="text-[1.08rem] font-semibold tracking-[-0.02em] text-neutral-950">{title}</h3>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-neutral-400">
          <span>{metaLeft}</span>
          {metaRight ? <span>{metaRight}</span> : null}
        </div>
        {subline ? <div className="text-sm text-neutral-400">{subline}</div> : null}
      </div>
      {description ? <p className="max-w-xl text-[0.95rem] leading-6 text-neutral-500">{description}</p> : null}
      <EntryImage src={imageUrl || ""} alt={title} />
    </article>
  );
}

function ExhibitionsTab({ upcoming, history }: { upcoming: ArtistExhibitionItem[]; history: ArtistExhibitionItem[] }) {
  const entries = [...upcoming, ...history];
  if (!entries.length) {
    return <div className="text-sm text-neutral-400">No public exhibitions yet.</div>;
  }

  return (
    <div className="space-y-8">
      {entries.map((item) => (
        <ListEntry
          key={item.id}
          title={item.title}
          metaLeft={formatDateRange(item.startDate, item.endDate, item.isOngoing, "Ongoing")}
          metaRight={[item.venue, item.city || item.country].filter(Boolean).join(" · ")}
          subline={item.country && item.city ? `${item.city}, ${item.country}` : ""}
          description={item.description}
          imageUrl={item.coverImageUrl}
        />
      ))}
    </div>
  );
}

function EducationTab({ items }: { items: ArtistEducationItem[] }) {
  if (!items.length) {
    return <div className="text-sm text-neutral-400">No public education entries yet.</div>;
  }

  return (
    <div className="space-y-8">
      {items.map((item) => (
        <ListEntry
          key={item.id}
          title={item.school}
          metaLeft={formatDateRange(item.startDate, item.endDate, false, "")}
          metaRight={[item.degree, item.fieldOfStudy].filter(Boolean).join(" · ")}
          subline={[item.grade ? `Grade ${item.grade}` : "", item.activities].filter(Boolean).join(" · ")}
          description={item.description || item.courses}
          imageUrl={item.imageUrl}
        />
      ))}
    </div>
  );
}

function ExperienceTab({ items }: { items: ArtistExperienceItem[] }) {
  if (!items.length) {
    return <div className="text-sm text-neutral-400">No public experience entries yet.</div>;
  }

  return (
    <div className="space-y-8">
      {items.map((item) => (
        <ListEntry
          key={item.id}
          title={item.title}
          metaLeft={formatDateRange(item.startDate, item.endDate, item.isCurrent, "Present")}
          metaRight={[item.organization, item.locationType].filter(Boolean).join(" · ")}
          subline={[item.location, item.employmentType].filter(Boolean).join(" · ")}
          description={item.description}
          imageUrl={item.imageUrl}
        />
      ))}
    </div>
  );
}

function LinksTab({ items }: { items: ArtistProfileLinkItem[] }) {
  if (!items.length) {
    return <div className="text-sm text-neutral-400">No public links yet.</div>;
  }

  return (
    <div className="space-y-8">
      {items.map((item) => (
        <a
          key={item.id}
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="block border-b border-neutral-300/80 pb-8 text-center"
        >
          <div className="text-[1.08rem] font-semibold tracking-[-0.02em] text-neutral-950">{item.label}</div>
          <div className="mt-2 text-sm text-neutral-400">{summarizeHost(item.url)}</div>
        </a>
      ))}
    </div>
  );
}

function ArtworkOverlay({
  artwork,
  onClose,
}: {
  artwork: PublicArtistArtworkItem | null;
  onClose: () => void;
}) {
  if (!artwork) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 px-4 py-6" onClick={onClose}>
      <div
        className="mx-auto max-w-3xl rounded-[1.5rem] bg-white p-4 shadow-[0_10px_40px_rgba(0,0,0,0.12)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex justify-end">
          <button type="button" onClick={onClose} className="text-sm text-neutral-400">
            Close
          </button>
        </div>
        <div className="space-y-5">
          <div className="overflow-hidden rounded-[1.2rem] bg-neutral-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={artwork.imageUrl} alt={artwork.title} className="max-h-[70vh] w-full object-cover" />
          </div>
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.03em] text-neutral-950">{artwork.title}</h2>
                <div className="mt-1 text-sm text-neutral-500">{[artwork.year || "", artwork.seriesName].filter(Boolean).join(" · ")}</div>
              </div>
              <div className="text-sm text-neutral-500">{artwork.priceLabel}</div>
            </div>
            {artwork.description ? <p className="max-w-2xl text-[0.98rem] leading-7 text-neutral-600">{artwork.description}</p> : null}
            <div className="inline-flex rounded-full bg-neutral-100 px-4 py-2 text-sm font-medium tracking-[-0.01em] text-neutral-900">
              {artwork.detailLabel}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PublicArtistProfilePage({ profile }: PublicArtistProfilePageProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("artworks");
  const [selectedArtwork, setSelectedArtwork] = useState<PublicArtistArtworkItem | null>(null);

  useEffect(() => {
    setActiveTab(parseTabFromHash(window.location.hash));
    const handleHashChange = () => setActiveTab(parseTabFromHash(window.location.hash));
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const heroAnnouncement = useMemo(() => profile.announcements.find((item) => item.isPinned) || profile.announcements[0] || null, [profile.announcements]);

  function changeTab(tab: TabKey) {
    setActiveTab(tab);
    window.history.replaceState(null, "", `#${tab}`);
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-5xl px-3 py-3 sm:px-8 sm:py-8">
        <div className="overflow-hidden rounded-[1rem] bg-white">
          <div className="relative">
            <div className="overflow-hidden rounded-[1rem] bg-neutral-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={profile.heroUrl || profile.avatarUrl} alt={profile.displayName} className="h-44 w-full object-cover sm:h-64" />
            </div>
            <div className="absolute -bottom-14 right-3 h-32 w-32 overflow-hidden rounded-full border-[5px] border-white bg-neutral-100 sm:right-8 sm:h-44 sm:w-44">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={profile.avatarUrl || profile.heroUrl} alt={profile.displayName} className="h-full w-full object-cover" />
            </div>
          </div>

          <div className="px-2 pb-4 pt-4 sm:px-6">
            <div className="max-w-[14rem] space-y-1 sm:max-w-md">
              <h1 className="text-[1.7rem] font-semibold tracking-[-0.04em] text-neutral-950">{profile.displayName}</h1>
              {profile.bio ? <p className="text-[0.95rem] leading-6 text-neutral-400">{profile.bio}</p> : null}
            </div>

            {profile.socialLinks.length ? (
              <div className="mt-4 flex items-center gap-3">
                {profile.socialLinks.map((link) => (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100"
                    aria-label={link.label}
                  >
                    <SocialIcon type={link.type} />
                  </a>
                ))}
              </div>
            ) : null}

            {heroAnnouncement ? (
              <div className="mt-5 rounded-[1rem] bg-neutral-50 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.18em] text-neutral-400">Announcement</div>
                <div className="mt-1 text-sm font-medium tracking-[-0.01em] text-neutral-950">{heroAnnouncement.title}</div>
                <div className="mt-1 text-sm leading-6 text-neutral-500">{heroAnnouncement.body}</div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 overflow-x-auto border-b border-neutral-200/90">
          <div className="flex min-w-max items-center gap-6 px-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => changeTab(tab.key)}
                className={`pb-3 pt-1 text-[1.02rem] font-medium tracking-[-0.02em] ${activeTab === tab.key ? "text-neutral-950" : "text-neutral-400"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="py-5">
          {activeTab === "artworks" ? <ArtworksTab artworks={profile.artworks} onSelect={setSelectedArtwork} /> : null}
          {activeTab === "exhibitions" ? <ExhibitionsTab upcoming={profile.upcomingExhibitions} history={profile.exhibitionHistory} /> : null}
          {activeTab === "education" ? <EducationTab items={profile.education} /> : null}
          {activeTab === "experience" ? <ExperienceTab items={profile.experience} /> : null}
          {activeTab === "links" ? <LinksTab items={profile.links} /> : null}
        </div>
      </div>

      <ArtworkOverlay artwork={selectedArtwork} onClose={() => setSelectedArtwork(null)} />
    </div>
  );
}
