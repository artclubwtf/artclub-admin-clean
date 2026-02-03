export type ArtworkId = string;

export type ArtworkMedia = {
  url: string;
  width?: number;
  height?: number;
  type?: "image" | "video";
};

export type Artwork = {
  id: string;
  title: string;
  artistName?: string;
  media: ArtworkMedia[];
  widthCm?: number;
  heightCm?: number;
  priceEur?: number;
  isOriginal?: boolean;
  shortDescription?: string;
};

export type FeedItem = {
  artwork: Artwork;
};
