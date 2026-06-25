export type ArtistSuccessNoticeVariant = "default" | "artwork";

export type ArtistSuccessNoticePayload = {
  title: string;
  message: string;
};

export const ARTIST_SUCCESS_NOTICE_STORAGE_KEY = "artist-success-notice";
export const ARTIST_SUCCESS_NOTICE_EVENT = "artist-success-notice";

const DEFAULT_MESSAGE = "It may take a few minutes for your changes to appear on the website.";
const ARTWORK_MESSAGE = `${DEFAULT_MESSAGE} For artwork, they will appear on the platform within the next 24 hours.`;

export function buildArtistSuccessNotice(variant: ArtistSuccessNoticeVariant = "default"): ArtistSuccessNoticePayload {
  return {
    title: "Done",
    message: variant === "artwork" ? ARTWORK_MESSAGE : DEFAULT_MESSAGE,
  };
}
