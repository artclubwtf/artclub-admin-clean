import {redirect} from "next/navigation";
import {OnboardingClient} from "@/components/network/OnboardingClient";
import {requireNetworkContext,serializeNetworkProfile} from "@/lib/server/network-context";
export const dynamic="force-dynamic";
export default async function ProfileOnboardingPage(){const context=await requireNetworkContext({allowMissingProfile:true});if(context.user.networkRoleSelectionCompleted!==true||!context.user.networkProfileType)redirect("/onboarding/role");if(context.user.networkOnboardingCompleted===true&&context.profile)redirect("/feed");return <OnboardingClient email={context.user.email} profileType={context.user.networkProfileType} initial={context.profile?serializeNetworkProfile(context.profile):undefined}/>}
