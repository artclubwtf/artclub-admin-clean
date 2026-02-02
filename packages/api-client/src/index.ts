export type ApiClientOptions = { baseUrl: string; token?: string };

export function createApiClient(opts: ApiClientOptions) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${opts.baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {})
      }
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }
  return { request };
}
