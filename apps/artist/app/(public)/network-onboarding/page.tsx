import {redirect} from "next/navigation";
import {requireNetworkContext} from "@/lib/server/network-context";
export const dynamic="force-dynamic";
export default async function LegacyNetworkOnboardingPage(){const context=await requireNetworkContext({allowMissingProfile:true});if(context.user.networkRoleSelectionCompleted!==true)redirect("/onboarding/role");redirect("/onboarding/profile")}
