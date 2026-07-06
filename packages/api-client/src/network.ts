export type NetworkApiError = { code: string; details?: unknown };
export function createNetworkApiClient(baseUrl = "") {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${baseUrl}/api/network${path}`, { ...init, headers: { ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...init?.headers } });
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) { const error = new Error(payload?.error?.code || `request_failed_${response.status}`) as Error & { status: number; details?: unknown }; error.status = response.status; error.details = payload?.error?.details; throw error; }
    return payload as T;
  }
  return { request };
}
