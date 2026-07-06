import { redirect } from "next/navigation";

import { RegisterForm } from "@/components/auth/RegisterForm";
import { getArtistContext } from "@/lib/server/artist-context";
import { NetworkRegisterForm } from "@/components/auth/NetworkRegisterForm";
import { isNetworkMvpEnabled } from "@/lib/server/network-flags";
import { loadNetworkContext } from "@/lib/server/network-context";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function RegisterPage() {
  if (isNetworkMvpEnabled()) {
    const network = await loadNetworkContext();
    if (network?.profile) redirect("/feed");
    if (network) redirect("/network-onboarding");
    return <NetworkRegisterForm />;
  }
  const context = await getArtistContext();
  if (context) {
    redirect(context.user.onboardingComplete ? "/" : "/onboarding");
  }
  return <RegisterForm />;
}
