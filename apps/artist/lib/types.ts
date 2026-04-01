export type ArtistMediaItem = {
  id: string;
  kind: "artwork" | "gallery" | "avatar" | "hero" | "other";
  s3Key?: string;
  url: string;
  previewUrl: string;
  filename: string;
  mimeType?: string;
  sizeBytes?: number | null;
  createdAt?: string | Date;
};

export type ArtistSeriesItem = {
  id: string;
  name: string;
  description: string;
  coverImageUrl: string;
  artworkCount?: number;
  artworkProductKeys?: string[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

export type ArtistArtworkItem = {
  id: string;
  productKey: string;
  title: string;
  description: string;
  year: number | null;
  status: string;
  forSale: boolean;
  originalAvailable: boolean;
  printsEnabled: boolean;
  syncState?: string;
  seriesId: string;
  seriesName: string;
  images: {
    thumbUrl: string;
    mediumUrl: string;
    originalUrl: string;
    galleryUrls: string[];
  };
  variants?: Array<{
    id: string;
    variantKey: string;
    finish: string;
    sizeCode: string;
    sku: string;
    priceCents: number;
  }>;
  updatedAt?: string | Date;
};

export type ArtistProfileData = {
  artistKey: string;
  email: string;
  displayName: string;
  handle: string;
  locationCity: string;
  locationCountry: string;
  bio: string;
  profileImages: {
    avatarUrl: string;
    heroUrl: string;
    galleryUrls: string[];
  };
  profileLinks: ArtistProfileLinkItem[];
  experience: ArtistExperienceItem[];
  education: ArtistEducationItem[];
  exhibitions: ArtistExhibitionItem[];
};

export type ArtistExperienceItem = {
  id: string;
  title: string;
  organization: string;
  employmentType: string;
  location: string;
  locationType: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  description: string;
  imageUrl: string;
  sortOrder: number;
};

export type ArtistEducationItem = {
  id: string;
  school: string;
  degree: string;
  fieldOfStudy: string;
  startDate: string;
  endDate: string;
  grade: string;
  activities: string;
  description: string;
  courses: string;
  imageUrl: string;
  sortOrder: number;
};

export type ArtistExhibitionItem = {
  id: string;
  title: string;
  venue: string;
  exhibitionType: string;
  city: string;
  country: string;
  startDate: string;
  endDate: string;
  isOngoing: boolean;
  description: string;
  link: string;
  coverImageUrl: string;
  sortOrder: number;
  visibility: "public" | "private";
};

export type ArtistProfileLinkItem = {
  id: string;
  label: string;
  url: string;
  type: string;
  sortOrder: number;
  isVisible: boolean;
  isHighlighted: boolean;
};

export type ArtistAnnouncementItem = {
  id: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  startsAt: string;
  endsAt: string;
  isPinned: boolean;
  isPublished: boolean;
  sortOrder: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

export type ArtistFeaturedWorkItem = {
  productKey: string;
  title: string;
  seriesName: string;
  imageUrl: string;
  status: string;
};

export type ActiveTermsModule = {
  document: {
    id: string;
    slug: string;
    key: string;
    title: string;
    isActive: boolean;
  };
  version: {
    id: string;
    documentSlug: string;
    version: number;
    bodyMarkdown: string;
    effectiveAt?: string | Date | null;
    createdAt?: string | Date | null;
    status: "draft" | "published" | "archived";
  };
};
