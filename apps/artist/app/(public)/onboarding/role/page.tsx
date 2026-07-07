import {redirect} from "next/navigation";
import {RoleSelectionClient} from "@/components/network/RoleSelectionClient";
import {requireNetworkContext} from "@/lib/server/network-context";
export const dynamic="force-dynamic";
export default async function RoleOnboardingPage(){const context=await requireNetworkContext({allowMissingProfile:true});if(context.user.networkOnboardingCompleted===true&&context.profile?.profileTypeSource&&context.profile.profileTypeSource!=="automatic_legacy")redirect("/feed");return <RoleSelectionClient/>}
