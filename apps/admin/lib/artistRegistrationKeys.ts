import { randomBytes } from "crypto";

export const ARTIST_KEY_DEFAULT_EXPIRY_DAYS = 14;
const CODE_PREFIX = "ARK";

export function normalizeArtistRegistrationCode(value: string): string {
  return value.trim().toUpperCase();
}

export function generateArtistRegistrationCode(): string {
  return `${CODE_PREFIX}-${randomBytes(8).toString("hex").toUpperCase()}`;
}

export function getExpiryDateFromDays(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

