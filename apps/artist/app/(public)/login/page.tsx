import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/LoginForm";
import { getArtistContext } from "@/lib/server/artist-context";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function LoginPage() {
  const context = await getArtistContext();
  if (context) {
    redirect(context.user.onboardingComplete ? "/" : "/onboarding");
  }
  return <LoginForm />;
}
