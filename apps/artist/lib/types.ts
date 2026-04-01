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
