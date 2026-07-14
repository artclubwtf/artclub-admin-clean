import type { networkAnalyticsEventTypes } from "@artclub/models";

export type NetworkAnalyticsEvent = (typeof networkAnalyticsEventTypes)[number];
export type NetworkPlatform = "web" | "ios" | "android";
export type NetworkAnalyticsPayload = {
  platform: NetworkPlatform;
  appVersion?: string;
  targetProfileId?: string;
  canonicalArtistId?: string;
  canonicalProductId?: string;
  postId?: string;
  eventId?: string;
  source?: string;
  path?: string;
  [key: string]: unknown;
};
export interface NetworkAnalyticsTracker { track(event: NetworkAnalyticsEvent, payload?: NetworkAnalyticsPayload): void | Promise<void>; }
export function createNetworkAnalyticsTracker(send: (event: NetworkAnalyticsEvent, payload: NetworkAnalyticsPayload) => void | Promise<void>, defaults: Pick<NetworkAnalyticsPayload, "platform" | "appVersion">): NetworkAnalyticsTracker {
  return { track(event, payload = { platform: defaults.platform }) { return send(event, { ...defaults, ...payload }); } };
}
