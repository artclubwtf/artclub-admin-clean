import {notFound} from "next/navigation";
import {UnifiedProfileView} from "@/components/profile/UnifiedProfileView";
import {ProfileEvents} from "@/components/profile/ProfileEvents";
import {requireNetworkContext} from "@/lib/server/network-context";
import {resolveUnifiedProfileBySlug} from "@/lib/server/unified-profile";
import {loadPublicArtistPageBySlug} from "@/lib/server/public-artist-page";
export const dynamic="force-dynamic";
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const{slug}=await params;return{title:`${slug} | ARTCLUB`,description:"ARTCLUB – The network of art"}}
export default async function NetworkProfilePage({params}:{params:Promise<{slug:string}>}){const context=await requireNetworkContext();const{slug}=await params;const profile=await resolveUnifiedProfileBySlug(slug);if(!profile||!profile.isPublic)notFound();const artistProfile=profile.profileType==="artist"?await loadPublicArtistPageBySlug(profile.slug):null;const mine=profile.userId===context.user._id.toString();return <><UnifiedProfileView profile={profile} artistProfile={artistProfile} viewerMode="network" mine={mine}/><ProfileEvents profileId={profile.networkProfileId||profile.id} mine={mine}/></>}
