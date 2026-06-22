import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Types } from "mongoose";

import ArtistsWorkspaceShell from "@/app/artists/_components/ArtistsWorkspaceShell";
import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { CanonicalArtistModel } from "@/models/CanonicalArtist";
import { UserModel } from "@/models/User";

export default async function ArtistsWorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/artists/login");
  }

  if (session.user.role === "admin" || session.user.role === "team") {
    redirect("/admin");
  }
  if (session.user.role === "customer") {
    redirect("/account");
  }

  if (!Types.ObjectId.isValid(session.user.id)) {
    redirect("/artists/login");
  }

  await connectMongo();
  const user = await UserModel.findById(session.user.id)
    .select({ _id: 1, role: 1, isActive: 1, email: 1, artistKey: 1, shopDomain: 1, onboardingComplete: 1, mustChangePassword: 1, name: 1 })
    .lean();

  if (!user || user.role !== "artist" || !user.isActive) {
    redirect("/artists/login");
  }

  if (!user.artistKey || !user.shopDomain) {
    redirect("/artists/register");
  }

  if (user.mustChangePassword) {
    redirect(`/artist/change-password?callbackUrl=${encodeURIComponent("/artists")}`);
  }

  if (!user.onboardingComplete) {
    redirect("/artists/onboarding");
  }

  const canonicalArtist = await CanonicalArtistModel.findOne({ shopDomain: user.shopDomain, artistKey: user.artistKey })
    .select({ displayName: 1 })
    .lean();

  return (
    <ArtistsWorkspaceShell
      artist={{
        displayName: canonicalArtist?.displayName || user.name || user.email,
        artistKey: user.artistKey,
        onboardingComplete: user.onboardingComplete === true,
        email: user.email,
      }}
    >
      {children}
    </ArtistsWorkspaceShell>
  );
}
