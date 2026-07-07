import { NetworkTopbarClient } from "@/components/layout/NetworkTopbarClient";
import { serializeNetworkProfile } from "@/lib/server/network-context";

export function NetworkTopbar({ profile }: { profile: any }) {
  return <NetworkTopbarClient profile={serializeNetworkProfile(profile)} />;
}
