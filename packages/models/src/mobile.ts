import { z } from "zod";

export const ReactionEmoji = z.enum(["🖤", "🔥", "👀", "😵‍💫"]);
export type ReactionEmoji = z.infer<typeof ReactionEmoji>;

export const ArtworkCardImage = z.object({
  urlThumb: z.string(),
  urlMedium: z.string(),
  width: z.number(),
  height: z.number(),
  aspectRatio: z.number(),
});
export type ArtworkCardImage = z.infer<typeof ArtworkCardImage>;

export const ArtworkCardCounts = z.object({
  reactions: z.number(),
  saves: z.number(),
});
export type ArtworkCardCounts = z.infer<typeof ArtworkCardCounts>;

export const ArtworkCardMyState = z.object({
  saved: z.boolean().optional(),
  reaction: ReactionEmoji.optional(),
});
export type ArtworkCardMyState = z.infer<typeof ArtworkCardMyState>;

export const ArtworkCard = z.object({
  id: z.string(),
  productGid: z.string(),
  title: z.string().optional(),
  artistId: z.string(),
  artistName: z.string(),
  tags: z.array(z.string()),
  images: z.array(ArtworkCardImage),
  counts: ArtworkCardCounts,
  myState: ArtworkCardMyState,
  createdAt: z.string(),
  handle: z.string().optional(),
  widthCm: z.number().optional(),
  heightCm: z.number().optional(),
  priceEur: z.number().nullable().optional(),
  isOriginalTagged: z.boolean().optional(),
  shortDescription: z.string().optional(),
});
export type ArtworkCard = z.infer<typeof ArtworkCard>;

export const ArtistCard = z.object({
  id: z.string(),
  handle: z.string(),
  name: z.string(),
  avatarUrl: z.string().optional(),
  tags: z.array(z.string()).optional(),
  counts: z.object({
    artworks: z.number(),
    followers: z.number(),
  }),
  bio: z.string().optional(),
  instagramUrl: z.string().optional(),
});
export type ArtistCard = z.infer<typeof ArtistCard>;

export const ExploreResponse = z.object({
  cursor: z.string().optional(),
  items: z.array(ArtworkCard),
});
export type ExploreResponse = z.infer<typeof ExploreResponse>;

export const SearchResponse = z.object({
  artists: z.array(ArtistCard),
  artworks: z.array(ArtworkCard),
  cursor: z.string().optional(),
});
export type SearchResponse = z.infer<typeof SearchResponse>;

export const FeedResponse = z.object({
  cursor: z.string().optional(),
  items: z.array(ArtworkCard),
});
export type FeedResponse = z.infer<typeof FeedResponse>;
