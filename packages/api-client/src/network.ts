export type NetworkApiError = { code: string; details?: unknown };
export function createNetworkApiClient(baseUrl = "") {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${baseUrl}/api/network${path}`, { ...init, headers: { ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...init?.headers } });
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) { const error = new Error(payload?.error?.code || `request_failed_${response.status}`) as Error & { status: number; details?: unknown }; error.status = response.status; error.details = payload?.error?.details; throw error; }
    return payload as T;
  }
  function exploreArt(params: { cursor?: string; q?: string; category?: string; sort?: "recent" | "popular" } = {}) {
    const search = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])));
    return request<import("@artclub/models").ExploreArtPage>(`/explore-art?${search.toString()}`);
  }
  return { request, exploreArt };
}
