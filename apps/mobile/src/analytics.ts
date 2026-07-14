import Constants from "expo-constants";
import { Platform } from "react-native";

export async function track(api: any, eventType: string, metadata: Record<string, unknown> = {}) {
  const profileId = typeof metadata.profileId === "string" ? metadata.profileId : undefined;
  const eventId = typeof metadata.eventId === "string" ? metadata.eventId : undefined;
  await api.request("/analytics", { method: "POST", body: JSON.stringify({ eventType, platform: Platform.OS, appVersion: Constants.expoConfig?.version || "1.0.0", ...(profileId ? { targetProfileId: profileId } : {}), ...(eventId ? { eventId } : {}), source: "native_network" }) }).catch(() => undefined);
}
