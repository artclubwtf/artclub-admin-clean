import { redirect } from "next/navigation";

import { RegisterForm } from "@/components/auth/RegisterForm";
import { getArtistContext } from "@/lib/server/artist-context";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function RegisterPage() {
  const context = await getArtistContext();
  if (context) {
    redirect(context.user.onboardingComplete ? "/" : "/onboarding");
  }
  return <RegisterForm />;
}
