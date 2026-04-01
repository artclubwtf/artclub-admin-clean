"use client";

import { useMemo, useState } from "react";

import { AnnouncementsManager } from "@/components/announcements/AnnouncementsManager";
import { CheckboxField } from "@/components/forms/CheckboxField";
import { ImageUploader } from "@/components/forms/ImageUploader";
import { StatusMessage } from "@/components/forms/StatusMessage";
import { Textarea } from "@/components/forms/Textarea";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { Modal } from "@/components/primitives/Modal";
import { Section } from "@/components/primitives/Section";
import { EducationSection } from "@/components/profile/EducationSection";
import { EditIconButton } from "@/components/profile/EditIconButton";
import { ExhibitionsSection } from "@/components/profile/ExhibitionsSection";
import { ExperienceSection } from "@/components/profile/ExperienceSection";
import { ProfileLinksSection } from "@/components/profile/ProfileLinksSection";
import { asSingleMedia, formatDateRange, isUpcomingOrOngoingDateRange, summarizeHost } from "@/components/profile/section-utils";
import { requestJson } from "@/lib/client/request";
import type {
  ArtistAnnouncementItem,
  ArtistEducationItem,
  ArtistExhibitionItem,
  ArtistExperienceItem,
  ArtistMediaItem,
  ArtistProfileData,
  ArtistProfileLinkItem,
  PublicArtistArtworkItem,
} from "@/lib/types";

type ProfileFormProps = {
  initialProfile: ArtistProfileData;
  artworksPreview: PublicArtistArtworkItem[];
  initialAnnouncements: ArtistAnnouncementItem[];
  initialCreateIntent?: string;
};

const tabs = [
  { key: "artworks", label: "Artworks" },
  { key: "exhibitions", label: "Exhibitions" },
  { key: "education", label: "Education" },
  { key: "experience", label: "Experience" },
  { key: "links", label: "Links" },
] as const;

type TabKey = (typeof tabs)[number]["key"];
type ModalKey =
  | "basic"
  | "bio"
  | "avatar"
  | "cover"
  | "gallery"
  | "links"
  | "experience"
  | "education"
  | "exhibitions"
  | "announcements"
  | "featured-works"
  | null;

function isActiveAnnouncement(item: ArtistAnnouncementItem) {
  if (!item.isPublished) return false;
  const now = Date.now();
  const startsAt = item.startsAt ? Date.parse(item.startsAt) : null;
  const endsAt = item.endsAt ? Date.parse(item.endsAt) : null;
  if (startsAt && startsAt > now) return false;
  if (endsAt && endsAt < now) return false;
  return true;
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

function PreviewEntry({
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
      {imageUrl ? (
        <div className="mt-4 overflow-hidden rounded-[1.1rem] bg-neutral-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={title} className="h-44 w-full object-cover" />
        </div>
      ) : null}
    </article>
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
    <div className="fixed inset-0 z-50 bg-neutral-950/35 px-3 py-4 sm:px-6 sm:py-8" onClick={onClose}>
      <div className="mx-auto max-h-[calc(100vh-2rem)] max-w-3xl overflow-y-auto rounded-[1.5rem] bg-white p-4 sm:max-h-[calc(100vh-4rem)] sm:p-6" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex justify-end">
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

function BasicProfileModal({
  open,
  profile,
  onClose,
  onSave,
}: {
  open: boolean;
  profile: ArtistProfileData;
  onClose: () => void;
  onSave: (next: Partial<ArtistProfileData>) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [handle, setHandle] = useState(profile.handle);
  const [locationCity, setLocationCity] = useState(profile.locationCity);
  const [locationCountry, setLocationCountry] = useState(profile.locationCountry);
  const [publicProfileVisible, setPublicProfileVisible] = useState(profile.publicProfileVisible);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit() {
    setIsPending(true);
    setError(null);
    const result = await onSave({ displayName, handle, locationCity, locationCountry, publicProfileVisible });
    setIsPending(false);
    if (!result.ok) {
      setError(result.error || "Could not save basic profile.");
      return;
    }
    onClose();
  }

  return (
    <Modal open={open} title="Edit basic profile" subtitle="Update the public core identity, handle, location and visibility." onClose={onClose}>
      <div className="space-y-4">
        <Input label="Display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} disabled={isPending} />
        <Input label="Handle / slug" value={handle} onChange={(event) => setHandle(event.target.value)} disabled={isPending} hint={`Public page: /artist/${handle || "your-handle"}`} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="City" value={locationCity} onChange={(event) => setLocationCity(event.target.value)} disabled={isPending} />
          <Input label="Country" value={locationCountry} onChange={(event) => setLocationCountry(event.target.value)} disabled={isPending} />
        </div>
        <CheckboxField label="Public profile visible" checked={publicProfileVisible} onChange={setPublicProfileVisible} disabled={isPending} />
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => void handleSubmit()} disabled={isPending}>
            {isPending ? "Saving..." : "Save"}
          </Button>
          <Button type="button" tone="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function BioModal({
  open,
  bio,
  onClose,
  onSave,
}: {
  open: boolean;
  bio: string;
  onClose: () => void;
  onSave: (next: Partial<ArtistProfileData>) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [value, setValue] = useState(bio);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit() {
    setIsPending(true);
    setError(null);
    const result = await onSave({ bio: value });
    setIsPending(false);
    if (!result.ok) {
      setError(result.error || "Could not save bio.");
      return;
    }
    onClose();
  }

  return (
    <Modal open={open} title="Edit bio" subtitle="Shape the short public introduction that appears on your profile." onClose={onClose}>
      <div className="space-y-4">
        <Textarea
          label="About"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={4000}
          hint={`${value.length}/4000 characters`}
          disabled={isPending}
        />
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => void handleSubmit()} disabled={isPending}>
            {isPending ? "Saving..." : "Save"}
          </Button>
          <Button type="button" tone="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SingleImageModal({
  open,
  title,
  subtitle,
  label,
  kind,
  currentUrl,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  label: string;
  kind: ArtistMediaItem["kind"];
  currentUrl: string;
  onClose: () => void;
  onSave: (url: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [items, setItems] = useState<ArtistMediaItem[]>(asSingleMedia(currentUrl, kind));
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit() {
    setIsPending(true);
    setError(null);
    const result = await onSave(items[0]?.url || "");
    setIsPending(false);
    if (!result.ok) {
      setError(result.error || `Could not save ${label.toLowerCase()}.`);
      return;
    }
    onClose();
  }

  return (
    <Modal open={open} title={title} subtitle={subtitle} onClose={onClose}>
      <div className="space-y-5">
        <ImageUploader label={label} kind={kind} items={items} onChange={(next) => setItems(next.slice(-1))} />
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => void handleSubmit()} disabled={isPending}>
            {isPending ? "Saving..." : "Save"}
          </Button>
          <Button type="button" tone="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function GalleryModal({
  open,
  galleryUrls,
  onClose,
  onSave,
}: {
  open: boolean;
  galleryUrls: string[];
  onClose: () => void;
  onSave: (urls: string[]) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [items, setItems] = useState<ArtistMediaItem[]>(
    galleryUrls.map((url, index) => ({ id: "", kind: "gallery", url, previewUrl: url, filename: `Gallery ${index + 1}` })),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit() {
    setIsPending(true);
    setError(null);
    const result = await onSave(items.map((item) => item.url));
    setIsPending(false);
    if (!result.ok) {
      setError(result.error || "Could not save gallery.");
      return;
    }
    onClose();
  }

  return (
    <Modal open={open} title="Edit gallery images" subtitle="Manage the supporting images that complete the public profile." onClose={onClose}>
      <div className="space-y-5">
        <ImageUploader label="Gallery images" kind="gallery" multiple items={items} onChange={setItems} />
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => void handleSubmit()} disabled={isPending}>
            {isPending ? "Saving..." : "Save"}
          </Button>
          <Button type="button" tone="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function FeaturedWorksModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      title="Featured works"
      subtitle="The profile preview currently uses your latest public artworks. Create or update works in the artworks area and this preview will reflect them."
      onClose={onClose}
      className="max-w-2xl"
    >
      <div className="space-y-4">
        <StatusMessage tone="info">Featured works are currently derived from your latest canonical artworks.</StatusMessage>
        <div className="flex flex-wrap gap-3">
          <Button href="/artworks">Manage artworks</Button>
          <Button type="button" tone="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function normalizeCreateIntent(value: string | undefined) {
  switch ((value || "").trim().toLowerCase()) {
    case "exhibition":
    case "exhibitions":
      return { modal: "exhibitions" as const, tab: "exhibitions" as const, createSection: "exhibitions" as const };
    case "education":
      return { modal: "education" as const, tab: "education" as const, createSection: "education" as const };
    case "experience":
      return { modal: "experience" as const, tab: "experience" as const, createSection: "experience" as const };
    case "link":
    case "links":
      return { modal: "links" as const, tab: "links" as const, createSection: "links" as const };
    case "announcement":
    case "announcements":
      return { modal: "announcements" as const, tab: "artworks" as const, createSection: "announcements" as const };
    default:
      return null;
  }
}

export function ProfileForm({ initialProfile, artworksPreview, initialAnnouncements, initialCreateIntent }: ProfileFormProps) {
  const initialIntent = normalizeCreateIntent(initialCreateIntent);
  const [profile, setProfile] = useState(initialProfile);
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [activeTab, setActiveTab] = useState<TabKey>(initialIntent?.tab || "artworks");
  const [selectedArtwork, setSelectedArtwork] = useState<PublicArtistArtworkItem | null>(null);
  const [openModal, setOpenModal] = useState<ModalKey>(initialIntent?.modal || null);
  const [status, setStatus] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  const visibleLinks = useMemo(
    () => [...profile.profileLinks].filter((item) => item.isVisible).sort((a, b) => a.sortOrder - b.sortOrder),
    [profile.profileLinks],
  );
  const socialLinks = useMemo(
    () => visibleLinks.filter((item) => ["instagram", "website", "linkedin", "tiktok", "youtube", "behance"].includes(item.type)).slice(0, 5),
    [visibleLinks],
  );
  const publicExhibitions = useMemo(
    () => [...profile.exhibitions].filter((item) => item.visibility === "public").sort((a, b) => a.sortOrder - b.sortOrder),
    [profile.exhibitions],
  );
  const upcomingExhibitions = useMemo(() => publicExhibitions.filter((item) => isUpcomingOrOngoingDateRange(item)), [publicExhibitions]);
  const exhibitionHistory = useMemo(() => publicExhibitions.filter((item) => !isUpcomingOrOngoingDateRange(item)), [publicExhibitions]);
  const activeAnnouncements = useMemo(
    () => [...announcements].filter(isActiveAnnouncement).sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0) || a.sortOrder - b.sortOrder),
    [announcements],
  );
  const experienceItems = useMemo(() => [...profile.experience].sort((a, b) => a.sortOrder - b.sortOrder), [profile.experience]);
  const educationItems = useMemo(() => [...profile.education].sort((a, b) => a.sortOrder - b.sortOrder), [profile.education]);
  const heroAnnouncement = activeAnnouncements[0] || null;
  const heroImage = profile.profileImages.heroUrl || profile.profileImages.galleryUrls[0] || artworksPreview[0]?.imageUrl || "";
  const avatarImage = profile.profileImages.avatarUrl || profile.profileImages.galleryUrls[0] || artworksPreview[0]?.imageUrl || heroImage;
  const locationLabel = [profile.locationCity, profile.locationCountry].filter(Boolean).join(", ");

  async function saveProfilePatch(partial: Partial<ArtistProfileData>) {
    setStatus(null);
    const nextProfile: ArtistProfileData = {
      ...profile,
      ...partial,
      profileImages: {
        ...profile.profileImages,
        ...(partial.profileImages || {}),
      },
    };

    try {
      const { response, json } = await requestJson<{ ok?: boolean; profile?: Partial<ArtistProfileData>; error?: string }>("/api/artist/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: nextProfile.displayName,
          handle: nextProfile.handle,
          locationCity: nextProfile.locationCity,
          locationCountry: nextProfile.locationCountry,
          bio: nextProfile.bio,
          publicProfileVisible: nextProfile.publicProfileVisible,
          avatarUrl: nextProfile.profileImages.avatarUrl,
          heroUrl: nextProfile.profileImages.heroUrl,
          galleryUrls: nextProfile.profileImages.galleryUrls,
        }),
        retries: 2,
      });

      if (!response.ok || !json?.ok) {
        return { ok: false as const, error: json?.error || "Could not save profile." };
      }

      setProfile((current) => ({
        ...current,
        ...json.profile,
        ...partial,
        profileImages: {
          ...current.profileImages,
          ...(json.profile?.profileImages || {}),
          ...(partial.profileImages || {}),
        },
      }));
      setStatus({ tone: "success", text: "Profile updated." });
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Could not save profile." };
    }
  }

  function handleItemsChange<K extends keyof ArtistProfileData>(key: K, value: ArtistProfileData[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-[0.22em] text-neutral-400">ARTCLUB for Artists</div>
          <h1 className="text-[1.55rem] font-semibold tracking-[-0.04em] text-neutral-950">Public profile editor</h1>
          <p className="max-w-2xl text-sm leading-6 text-neutral-500">
            This page is your editable preview. Each public section can be adjusted directly from its own modal.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className={`inline-flex min-h-11 items-center rounded-full px-4 py-2.5 text-sm ${profile.publicProfileVisible ? "bg-neutral-100 text-neutral-900" : "bg-neutral-50 text-neutral-500"}`}>
            {profile.publicProfileVisible ? "Public profile visible" : "Public profile hidden"}
          </div>
          <Button href={`/artist/${encodeURIComponent(profile.handle)}`} tone="secondary">
            Preview public page
          </Button>
        </div>
      </div>

      {status ? <StatusMessage tone={status.tone}>{status.text}</StatusMessage> : null}

      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-5xl">
          <div className="overflow-hidden rounded-[1rem] bg-white">
            <div className="relative">
              <div className="overflow-hidden rounded-[1rem] bg-neutral-100">
                {heroImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={heroImage} alt={profile.displayName} className="h-44 w-full object-cover sm:h-64" />
                ) : (
                  <div className="h-44 w-full bg-neutral-100 sm:h-64" />
                )}
              </div>
              <div className="absolute right-3 top-3">
                <EditIconButton label="Edit cover image" onClick={() => setOpenModal("cover")} />
              </div>
              <div className="absolute -bottom-14 right-3 h-32 w-32 overflow-hidden rounded-full border-[5px] border-white bg-neutral-100 sm:right-8 sm:h-44 sm:w-44">
                {avatarImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarImage} alt={profile.displayName} className="h-full w-full object-cover" />
                ) : null}
                <div className="absolute inset-x-0 bottom-2 flex justify-center">
                  <EditIconButton label="Edit avatar image" onClick={() => setOpenModal("avatar")} className="bg-white" />
                </div>
              </div>
            </div>

            <div className="px-2 pb-4 pt-4 sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div className="max-w-[14rem] space-y-2 sm:max-w-md">
                  <h2 className="text-[1.7rem] font-semibold tracking-[-0.04em] text-neutral-950">{profile.displayName}</h2>
                  {locationLabel ? <div className="text-sm text-neutral-500">{locationLabel}</div> : null}
                  {profile.bio ? <p className="text-[0.95rem] leading-6 text-neutral-400">{profile.bio}</p> : <p className="text-[0.95rem] leading-6 text-neutral-300">Add a short public introduction.</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <EditIconButton label="Edit basic profile" onClick={() => setOpenModal("basic")} />
                  <EditIconButton label="Edit bio" onClick={() => setOpenModal("bio")} />
                </div>
              </div>

              {socialLinks.length ? (
                <div className="mt-4 flex items-center gap-3">
                  {socialLinks.map((link) => (
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
              ) : (
                <div className="mt-4 text-sm text-neutral-400">No public social links yet.</div>
              )}

              {heroAnnouncement ? (
                <div className="mt-5 rounded-[1rem] bg-neutral-50 px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-neutral-400">Announcement</div>
                      <div className="mt-1 text-sm font-medium tracking-[-0.01em] text-neutral-950">{heroAnnouncement.title}</div>
                      <div className="mt-1 text-sm leading-6 text-neutral-500">{heroAnnouncement.body}</div>
                    </div>
                    <EditIconButton label="Edit announcements" onClick={() => setOpenModal("announcements")} className="bg-neutral-100" />
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-[1rem] bg-neutral-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-sm text-neutral-400">No active public announcements yet.</div>
                    <EditIconButton label="Edit announcements" onClick={() => setOpenModal("announcements")} className="bg-neutral-100" />
                  </div>
                </div>
              )}
            </div>
          </div>

          <Section
            title="Gallery"
            subtitle="These supporting images appear as part of your public visual identity."
            action={<EditIconButton label="Edit gallery images" onClick={() => setOpenModal("gallery")} />}
          >
            {profile.profileImages.galleryUrls.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {profile.profileImages.galleryUrls.map((url, index) => (
                  <div key={`${url}-${index}`} className="overflow-hidden rounded-[1rem] bg-neutral-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Gallery ${index + 1}`} className="aspect-[1/1] w-full object-cover" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm text-neutral-500">No gallery images yet.</div>
            )}
          </Section>

          <div className="mt-6 overflow-x-auto border-b border-neutral-200/90">
            <div className="flex min-w-max items-center gap-6 px-1">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`pb-3 pt-1 text-[1.02rem] font-medium tracking-[-0.02em] ${activeTab === tab.key ? "text-neutral-950" : "text-neutral-400"}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="py-5">
            {activeTab === "artworks" ? (
              <Section
                title="Artworks preview"
                subtitle="Your latest public artworks as they currently appear on the public page."
                action={<EditIconButton label="Edit featured works" onClick={() => setOpenModal("featured-works")} />}
              >
                {artworksPreview.length ? (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-8">
                    {artworksPreview.map((artwork) => (
                      <button key={artwork.productKey} type="button" className="space-y-3 text-left" onClick={() => setSelectedArtwork(artwork)}>
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
                ) : (
                  <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm text-neutral-500">No artworks available yet.</div>
                )}
              </Section>
            ) : null}

            {activeTab === "exhibitions" ? (
              <Section
                title="Exhibitions preview"
                subtitle="Public exhibitions are split into upcoming and history on the read layer."
                action={<EditIconButton label="Edit exhibitions" onClick={() => setOpenModal("exhibitions")} />}
              >
                {[...upcomingExhibitions, ...exhibitionHistory].length ? (
                  <div className="space-y-8">
                    {[...upcomingExhibitions, ...exhibitionHistory].map((item) => (
                      <PreviewEntry
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
                ) : (
                  <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm text-neutral-500">No public exhibitions yet.</div>
                )}
              </Section>
            ) : null}

            {activeTab === "education" ? (
              <Section
                title="Education preview"
                subtitle="Formal education and training appear in the public profile exactly from these records."
                action={<EditIconButton label="Edit education" onClick={() => setOpenModal("education")} />}
              >
                {profile.education.length ? (
                  <div className="space-y-8">
                    {educationItems.map((item: ArtistEducationItem) => (
                      <PreviewEntry
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
                ) : (
                  <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm text-neutral-500">No education entries yet.</div>
                )}
              </Section>
            ) : null}

            {activeTab === "experience" ? (
              <Section
                title="Experience preview"
                subtitle="Professional and artistic background entries as visitors will read them."
                action={<EditIconButton label="Edit experience" onClick={() => setOpenModal("experience")} />}
              >
                {profile.experience.length ? (
                  <div className="space-y-8">
                    {experienceItems.map((item: ArtistExperienceItem) => (
                      <PreviewEntry
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
                ) : (
                  <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm text-neutral-500">No experience entries yet.</div>
                )}
              </Section>
            ) : null}

            {activeTab === "links" ? (
              <Section
                title="Links preview"
                subtitle="Visible profile links become your public link-list."
                action={<EditIconButton label="Edit profile links" onClick={() => setOpenModal("links")} />}
              >
                {visibleLinks.length ? (
                  <div className="space-y-8">
                    {visibleLinks.map((item: ArtistProfileLinkItem) => (
                      <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="block border-b border-neutral-300/80 pb-8 text-center">
                        <div className="text-[1.08rem] font-semibold tracking-[-0.02em] text-neutral-950">{item.label}</div>
                        <div className="mt-2 text-sm text-neutral-400">{summarizeHost(item.url)}</div>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm text-neutral-500">No visible links yet.</div>
                )}
              </Section>
            ) : null}
          </div>

          <Section
            title="Announcements preview"
            subtitle="Announcements are managed separately, but this section shows what is currently active or prepared."
            action={<EditIconButton label="Edit announcements" onClick={() => setOpenModal("announcements")} />}
          >
            {announcements.length ? (
              <div className="space-y-3">
                {announcements.slice(0, 4).map((item) => (
                  <div key={item.id} className="space-y-1 rounded-[2rem] bg-neutral-50 px-4 py-4">
                    <div className="text-sm font-semibold tracking-[-0.01em] text-neutral-950">{item.title}</div>
                    <div className="text-sm leading-6 text-neutral-600">{item.body}</div>
                    <div className="text-xs uppercase tracking-[0.18em] text-neutral-400">
                      {item.isPublished ? "published" : "draft"}
                      {item.isPinned ? " · pinned" : ""}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm text-neutral-500">No announcements yet.</div>
            )}
          </Section>
        </div>
      </div>

      {openModal === "basic" ? <BasicProfileModal open profile={profile} onClose={() => setOpenModal(null)} onSave={saveProfilePatch} /> : null}
      {openModal === "bio" ? <BioModal open bio={profile.bio} onClose={() => setOpenModal(null)} onSave={saveProfilePatch} /> : null}
      {openModal === "avatar" ? (
        <SingleImageModal
          open
          title="Edit avatar"
          subtitle="Update the circular profile image shown across the public page."
          label="Avatar"
          kind="avatar"
          currentUrl={profile.profileImages.avatarUrl}
          onClose={() => setOpenModal(null)}
          onSave={(url) => saveProfilePatch({ profileImages: { ...profile.profileImages, avatarUrl: url } })}
        />
      ) : null}
      {openModal === "cover" ? (
        <SingleImageModal
          open
          title="Edit cover image"
          subtitle="Update the large header image at the top of the public profile."
          label="Header image"
          kind="hero"
          currentUrl={profile.profileImages.heroUrl}
          onClose={() => setOpenModal(null)}
          onSave={(url) => saveProfilePatch({ profileImages: { ...profile.profileImages, heroUrl: url } })}
        />
      ) : null}
      {openModal === "gallery" ? (
        <GalleryModal
          open
          galleryUrls={profile.profileImages.galleryUrls}
          onClose={() => setOpenModal(null)}
          onSave={(urls) => saveProfilePatch({ profileImages: { ...profile.profileImages, galleryUrls: urls } })}
        />
      ) : null}

      <Modal open={openModal === "links"} title="Edit links" subtitle="Add, reorder, hide or highlight the public links for your profile." onClose={() => setOpenModal(null)} className="max-w-4xl">
        <ProfileLinksSection
          initialItems={profile.profileLinks}
          onItemsChange={(items) => handleItemsChange("profileLinks", items)}
          initialOpenCreate={initialIntent?.createSection === "links"}
        />
      </Modal>

      <Modal
        open={openModal === "experience"}
        title="Edit experience"
        subtitle="Manage professional and artistic background entries in the order they should appear publicly."
        onClose={() => setOpenModal(null)}
        className="max-w-4xl"
      >
        <ExperienceSection
          initialItems={profile.experience}
          onItemsChange={(items) => handleItemsChange("experience", items)}
          initialOpenCreate={initialIntent?.createSection === "experience"}
        />
      </Modal>

      <Modal
        open={openModal === "education"}
        title="Edit education"
        subtitle="Manage schools, degrees and other education entries for your public profile."
        onClose={() => setOpenModal(null)}
        className="max-w-4xl"
      >
        <EducationSection
          initialItems={profile.education}
          onItemsChange={(items) => handleItemsChange("education", items)}
          initialOpenCreate={initialIntent?.createSection === "education"}
        />
      </Modal>

      <Modal
        open={openModal === "exhibitions"}
        title="Edit exhibitions"
        subtitle="Manage your exhibition history and upcoming public exhibitions from one place."
        onClose={() => setOpenModal(null)}
        className="max-w-4xl"
      >
        <ExhibitionsSection
          initialItems={profile.exhibitions}
          onItemsChange={(items) => handleItemsChange("exhibitions", items)}
          initialOpenCreate={initialIntent?.createSection === "exhibitions"}
        />
      </Modal>

      <Modal
        open={openModal === "announcements"}
        title="Edit announcements"
        subtitle="Draft, publish and pin profile announcements without leaving the preview."
        onClose={() => setOpenModal(null)}
        className="max-w-4xl"
      >
        <AnnouncementsManager
          embedded
          initialItems={announcements}
          onItemsChange={setAnnouncements}
          initialOpenCreate={initialIntent?.createSection === "announcements"}
        />
      </Modal>

      {openModal === "featured-works" ? <FeaturedWorksModal open onClose={() => setOpenModal(null)} /> : null}

      <ArtworkOverlay artwork={selectedArtwork} onClose={() => setSelectedArtwork(null)} />
    </div>
  );
}
