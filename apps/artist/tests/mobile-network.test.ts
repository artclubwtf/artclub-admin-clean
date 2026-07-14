import { afterEach, describe, expect, it, vi } from "vitest";

import { createNetworkApiClient } from "@artclub/api-client";
import { mobilePushTokenInputSchema, networkAnalyticsInputSchema } from "@artclub/models";

describe("mobile network contracts", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("accepts an Expo device token and rejects arbitrary values", () => {
    expect(mobilePushTokenInputSchema.safeParse({ token: "ExponentPushToken[device-token]", deviceId: "device-1", platform: "ios" }).success).toBe(true);
    expect(mobilePushTokenInputSchema.safeParse({ token: "not-a-token", deviceId: "device-1", platform: "ios" }).success).toBe(false);
  });

  it("records native platform and app version without message contents", () => {
    const result = networkAnalyticsInputSchema.parse({ eventType: "message_sent", platform: "android", appVersion: "1.0.0", source: "native_network" });
    expect(result).toEqual({ eventType: "message_sent", platform: "android", appVersion: "1.0.0", source: "native_network" });
    expect(result).not.toHaveProperty("text");
  });

  it("uses the mobile prefix and secure bearer token", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createNetworkApiClient({ baseUrl: "https://api.example", prefix: "/api/mobile/v1/network", getAccessToken: () => "secure-token" });
    await client.request("/home");
    expect(fetchMock).toHaveBeenCalledWith("https://api.example/api/mobile/v1/network/home", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer secure-token" }) }));
  });
});
