import { ProfileSettingsClient } from "@/components/network/ProfileSettingsClient";
import { requireNetworkContext, serializeNetworkProfile } from "@/lib/server/network-context";
import { resolveUnifiedProfileBySlug } from "@/lib/server/unified-profile";
export default async function SettingsProfilePage(){const context=await requireNetworkContext();const value=await resolveUnifiedProfileBySlug(context.profile!.slug)||serializeNetworkProfile(context.profile!);return <ProfileSettingsClient initial={{...value,disciplines:value.disciplines.join(", "),interests:value.interests.join(", ")}}/>}
