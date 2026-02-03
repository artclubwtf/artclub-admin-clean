import type { Artwork, FeedItem } from "@artclub/models";

export type MobileApiClientOptions = {
  baseUrl: string;
  useMock: boolean;
  token?: string;
};

export type FeedResponse = {
  items: FeedItem[];
  nextCursor?: string;
};

export type ReactionEmoji = "🖤" | "🔥" | "👀" | "😵‍💫";

type ApiFeedItem = {
  id: string;
  title: string;
  handle?: string;
  artistName?: string;
  tags?: string[];
  images?: { thumbUrl?: string; mediumUrl?: string; originalUrl?: string };
  widthCm?: number;
  heightCm?: number;
  priceEur?: number | null;
  isOriginalTagged?: boolean;
  shortDescription?: string;
};

type ApiFeedResponse = {
  items: ApiFeedItem[];
  nextCursor?: string;
};

type ApiArtworkResponse = {
  artwork: ApiFeedItem;
  signals?: {
    savesCount?: number;
    reactions?: Record<string, number>;
    viewsCount?: number;
  };
};

export type MobileAuthUser = {
  id: string;
  email: string;
  name?: string;
};

type AuthResponse = {
  ok: boolean;
  token: string;
  user: MobileAuthUser;
};

type SavesResponse = {
  productGids: string[];
};

type ToggleSaveResponse = {
  ok: boolean;
  saved?: boolean;
};

export type SavesListResponse = {
  items: FeedItem[];
  nextCursor?: string;
};

export type ReactionsMineResponse = {
  ok: boolean;
  reactions: Record<string, ReactionEmoji>;
};

export type EventsIngestResponse = {
  ok: boolean;
  accepted: number;
};

export type ArtistProfile = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  bio?: string | null;
  instagramUrl?: string | null;
};

export type ArtistProfileResponse = {
  ok: boolean;
  artist: ArtistProfile;
  counts?: { artworks?: number };
};

export type ArtistArtworksResponse = {
  ok: boolean;
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
  const handle = `mock-artwork-${index + 1}`;
  const width = 800 + (index % 3) * 120;
  const height = 600 + (index % 4) * 90;
  const thumbWidth = 360;
  const thumbHeight = Math.round((height / width) * thumbWidth);
  const mediumWidth = 960;
  const mediumHeight = Math.round((height / width) * mediumWidth);
  return {
    id,
    title: `Artwork ${index + 1}`,
    handle,
    artistName: `Artist ${((index % 5) + 1).toString().padStart(2, "0")}`,
    media: [
      {
        url: `https://picsum.photos/seed/${encodeURIComponent(id)}-thumb/${thumbWidth}/${thumbHeight}`,
        width: thumbWidth,
        height: thumbHeight,
        type: "image"
      },
      {
        url: `https://picsum.photos/seed/${encodeURIComponent(id)}-medium/${mediumWidth}/${mediumHeight}`,
        width: mediumWidth,
        height: mediumHeight,
        type: "image"
      },
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
  const thumbWidth = 360;
  const thumbHeight = 270;
  const mediumWidth = 960;
  const mediumHeight = 720;
  return {
    id,
    title: "Mock Artwork",
    handle: id,
    artistName: "Mock Artist",
    media: [
      {
        url: `https://picsum.photos/seed/${encodeURIComponent(id)}-thumb/${thumbWidth}/${thumbHeight}`,
        width: thumbWidth,
        height: thumbHeight,
        type: "image"
      },
      {
        url: `https://picsum.photos/seed/${encodeURIComponent(id)}-medium/${mediumWidth}/${mediumHeight}`,
        width: mediumWidth,
        height: mediumHeight,
        type: "image"
      },
      {
        url: `https://picsum.photos/seed/${encodeURIComponent(id)}/1200/900`,
        width: 1200,
        height: 900,
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

function buildMediaFromImages(images?: {
  thumbUrl?: string;
  mediumUrl?: string;
  originalUrl?: string;
}): Artwork["media"] {
  const media: Artwork["media"] = [];
  if (images?.thumbUrl) {
    media.push({ url: images.thumbUrl, width: 360, type: "image" });
  }
  if (images?.mediumUrl) {
    media.push({ url: images.mediumUrl, width: 960, type: "image" });
  }
  if (images?.originalUrl) {
    const duplicate = media.find((item) => item.url === images.originalUrl);
    if (!duplicate) {
      media.push({ url: images.originalUrl, type: "image" });
    }
  }
  return media;
}

function mapFeedItemToArtwork(item: ApiFeedItem): Artwork {
  return {
    id: item.id,
    title: item.title,
    handle: item.handle,
    artistName: item.artistName,
    media: buildMediaFromImages(item.images),
    widthCm: item.widthCm,
    heightCm: item.heightCm,
    priceEur: item.priceEur ?? undefined,
    isOriginal: item.isOriginalTagged,
    shortDescription: item.shortDescription
  };
}

async function requestJson<T>(url: string, init?: RequestInit, token?: string): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers ? (init.headers as Record<string, string>) : {})
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (init?.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    ...init,
    headers
  });
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
  const token = opts.token;

  async function getFeed(cursor?: string): Promise<FeedResponse> {
    if (opts.useMock) return mockFeed(cursor);
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const response = await requestJson<ApiFeedResponse>(`${baseUrl}/api/mobile/v1/feed${query}`);
    return {
      items: response.items.map((item) => ({ artwork: mapFeedItemToArtwork(item) })),
      nextCursor: response.nextCursor
    };
  }

  async function getArtwork(id: string): Promise<Artwork> {
    if (opts.useMock) return mockArtworkById(id);
    const response = await requestJson<ApiArtworkResponse>(
      `${baseUrl}/api/mobile/v1/artworks/${encodeURIComponent(id)}`
    );
    return mapFeedItemToArtwork(response.artwork);
  }

  async function register(input: { email: string; password: string; name?: string }): Promise<AuthResponse> {
    if (opts.useMock) {
      return {
        ok: true,
        token: "mock-token",
        user: { id: "mock-user", email: input.email, name: input.name }
      };
    }
    return requestJson<AuthResponse>(`${baseUrl}/api/mobile/v1/auth/register`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  async function login(input: { email: string; password: string }): Promise<AuthResponse> {
    if (opts.useMock) {
      return {
        ok: true,
        token: "mock-token",
        user: { id: "mock-user", email: input.email }
      };
    }
    return requestJson<AuthResponse>(`${baseUrl}/api/mobile/v1/auth/login`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  async function getMe(): Promise<{ ok: boolean; user: MobileAuthUser } | null> {
    if (opts.useMock) {
      return { ok: true, user: { id: "mock-user", email: "mock@artclub.wtf", name: "Mock User" } };
    }
    if (!token) throw new Error("Missing auth token");
    return requestJson<{ ok: boolean; user: MobileAuthUser }>(`${baseUrl}/api/mobile/v1/me`, undefined, token);
  }

  async function listSaves(): Promise<SavesResponse> {
    if (opts.useMock) return { productGids: [] };
    if (!token) throw new Error("Missing auth token");
    return requestJson<SavesResponse>(`${baseUrl}/api/mobile/v1/saves/ids`, undefined, token);
  }

  async function getSaves(cursor?: string, limit?: number): Promise<SavesListResponse> {
    if (opts.useMock) return { items: [], nextCursor: undefined };
    if (!token) throw new Error("Missing auth token");
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    if (typeof limit === "number" && Number.isFinite(limit)) {
      params.set("limit", String(Math.max(1, Math.floor(limit))));
    }
    const query = params.toString();
    const response = await requestJson<ApiFeedResponse>(
      `${baseUrl}/api/mobile/v1/saves${query ? `?${query}` : ""}`,
      undefined,
      token
    );
    return {
      items: response.items.map((item) => ({ artwork: mapFeedItemToArtwork(item) })),
      nextCursor: response.nextCursor
    };
  }

  async function toggleSave(productGid: string, saved?: boolean): Promise<ToggleSaveResponse> {
    if (opts.useMock) return { ok: true, saved: true };
    if (!token) throw new Error("Missing auth token");
    const payload: { productGid: string; saved?: boolean } = { productGid };
    if (typeof saved === "boolean") {
      payload.saved = saved;
    }
    return requestJson<ToggleSaveResponse>(
      `${baseUrl}/api/mobile/v1/saves/toggle`,
      {
        method: "POST",
        body: JSON.stringify(payload)
      },
      token
    );
  }

  async function postReaction(productGid: string, emoji: ReactionEmoji): Promise<{ ok: boolean }> {
    if (opts.useMock) return { ok: true };
    return requestJson<{ ok: boolean }>(
      `${baseUrl}/api/mobile/v1/reactions`,
      {
        method: "POST",
        body: JSON.stringify({ productGid, emoji })
      },
      token
    );
  }

  async function getMyReactions(ids: string[]): Promise<ReactionsMineResponse> {
    if (opts.useMock) return { ok: true, reactions: {} };
    if (!token) throw new Error("Missing auth token");
    if (!Array.isArray(ids) || ids.length === 0) return { ok: true, reactions: {} };
    const query = `?ids=${encodeURIComponent(ids.join(","))}`;
    return requestJson<ReactionsMineResponse>(
      `${baseUrl}/api/mobile/v1/reactions/mine${query}`,
      undefined,
      token
    );
  }

  async function postEvents(
    events: Array<{ eventName: string; productGid?: string; metadata?: Record<string, unknown>; ts?: number }>
  ): Promise<EventsIngestResponse> {
    if (opts.useMock) return { ok: true, accepted: events.length };
    return requestJson<EventsIngestResponse>(
      `${baseUrl}/api/mobile/v1/events`,
      {
        method: "POST",
        body: JSON.stringify({ events })
      },
      token
    );
  }

  async function getArtist(id: string): Promise<ArtistProfileResponse> {
    if (opts.useMock) {
      return {
        ok: true,
        artist: {
          id,
          name: id.replace(/-/g, " ")
        },
        counts: { artworks: 0 }
      };
    }
    return requestJson<ArtistProfileResponse>(
      `${baseUrl}/api/mobile/v1/artists/${encodeURIComponent(id)}`
    );
  }

  async function getArtistArtworks(
    id: string,
    cursor?: string,
    limit?: number
  ): Promise<ArtistArtworksResponse> {
    if (opts.useMock) return { ok: true, items: [], nextCursor: undefined };
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    if (typeof limit === "number" && Number.isFinite(limit)) {
      params.set("limit", String(Math.max(1, Math.floor(limit))));
    }
    const query = params.toString();
    const response = await requestJson<ApiFeedResponse>(
      `${baseUrl}/api/mobile/v1/artists/${encodeURIComponent(id)}/artworks${query ? `?${query}` : ""}`
    );
    return {
      ok: true,
      items: response.items.map((item) => ({ artwork: mapFeedItemToArtwork(item) })),
      nextCursor: response.nextCursor
    };
  }

  return {
    getFeed,
    getArtwork,
    register,
    login,
    getMe,
    listSaves,
    getSaves,
    toggleSave,
    postReaction,
    getMyReactions,
    postEvents,
    getArtist,
    getArtistArtworks
  };
}
