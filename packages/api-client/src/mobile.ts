import type { Artwork, FeedItem } from "@artclub/models";

export type MobileApiClientOptions = {
  baseUrl: string;
  useMock: boolean;
};

export type FeedResponse = {
  items: FeedItem[];
  nextCursor?: string;
};

const MOCK_PAGE_SIZE = 10;
const MOCK_TOTAL = 30;

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function parseCursor(cursor?: string) {
  if (!cursor) return 0;
  const parsed = Number(cursor);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function mockArtworkByIndex(index: number): Artwork {
  const id = `mock-artwork-${index + 1}`;
  const width = 800 + (index % 3) * 120;
  const height = 600 + (index % 4) * 90;
  return {
    id,
    title: `Artwork ${index + 1}`,
    artistName: `Artist ${((index % 5) + 1).toString().padStart(2, "0")}`,
    media: [
      {
        url: `https://picsum.photos/seed/${encodeURIComponent(id)}/${width}/${height}`,
        width,
        height,
        type: "image"
      }
    ],
    widthCm: 50 + (index % 5) * 10,
    heightCm: 40 + (index % 6) * 8,
    priceEur: 120 + index * 15,
    isOriginal: index % 2 === 0,
    shortDescription: "Placeholder artwork for the mobile feed."
  };
}

function mockArtworkById(id: string): Artwork {
  const match = /mock-artwork-(\d+)/i.exec(id);
  if (match) {
    const idx = Math.max(0, Number(match[1]) - 1);
    if (Number.isFinite(idx)) return mockArtworkByIndex(idx);
  }
  return {
    id,
    title: "Mock Artwork",
    artistName: "Mock Artist",
    media: [
      {
        url: `https://picsum.photos/seed/${encodeURIComponent(id)}/800/600`,
        width: 800,
        height: 600,
        type: "image"
      }
    ],
    shortDescription: "Placeholder artwork for the mobile feed."
  };
}

function mockFeed(cursor?: string): FeedResponse {
  const start = parseCursor(cursor);
  const end = Math.min(start + MOCK_PAGE_SIZE, MOCK_TOTAL);
  const items: FeedItem[] = [];
  for (let i = start; i < end; i += 1) {
    items.push({ artwork: mockArtworkByIndex(i) });
  }
  const nextCursor = end < MOCK_TOTAL ? String(end) : undefined;
  return { items, nextCursor };
}

async function requestJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    let details = res.statusText;
    try {
      const text = await res.text();
      if (text) details = text;
    } catch {
      // ignore body read errors
    }
    throw new Error(`Mobile API ${res.status}: ${details}`);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new Error("Mobile API: Invalid JSON response");
  }
}

export function createMobileApiClient(opts: MobileApiClientOptions) {
  const baseUrl = normalizeBaseUrl(opts.baseUrl);

  async function getFeed(cursor?: string): Promise<FeedResponse> {
    if (opts.useMock) return mockFeed(cursor);
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    return requestJson<FeedResponse>(`${baseUrl}/api/mobile/v1/feed${query}`);
  }

  async function getArtwork(id: string): Promise<Artwork> {
    if (opts.useMock) return mockArtworkById(id);
    return requestJson<Artwork>(`${baseUrl}/api/mobile/v1/artworks/${encodeURIComponent(id)}`);
  }

  return { getFeed, getArtwork };
}
