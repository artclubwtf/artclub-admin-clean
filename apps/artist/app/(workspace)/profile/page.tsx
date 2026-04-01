import { ProfileForm } from "@/components/profile/ProfileForm";
import { requireArtistContext } from "@/lib/server/artist-context";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function ProfilePage() {
  const context = await requireArtistContext();

  return (
    <ProfileForm
      initialProfile={{
        artistKey: context.user.artistKey,
        email: context.user.email,
        displayName: context.canonicalArtist.displayName || context.user.name || "",
        handle: context.canonicalArtist.handle || context.user.artistKey,
        locationCity: context.canonicalArtist.locationCity || "",
        locationCountry: context.canonicalArtist.locationCountry || "",
        bio: context.canonicalArtist.bio || "",
        profileImages: {
          avatarUrl: context.canonicalArtist.profileImages?.avatarUrl || "",
          heroUrl: context.canonicalArtist.profileImages?.heroUrl || "",
          galleryUrls: Array.isArray(context.canonicalArtist.profileImages?.galleryUrls) ? context.canonicalArtist.profileImages.galleryUrls : [],
        },
      }}
    />
  );
}
