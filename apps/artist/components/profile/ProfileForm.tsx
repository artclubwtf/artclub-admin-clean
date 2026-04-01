import { PageTitle } from "@/components/primitives/PageTitle";
import { AnnouncementsPreviewSection } from "@/components/profile/AnnouncementsPreviewSection";
import { EducationSection } from "@/components/profile/EducationSection";
import { ExhibitionsSection } from "@/components/profile/ExhibitionsSection";
import { ExperienceSection } from "@/components/profile/ExperienceSection";
import { FeaturedWorksSection } from "@/components/profile/FeaturedWorksSection";
import { ProfileBasicsSection } from "@/components/profile/ProfileBasicsSection";
import { ProfileLinksSection } from "@/components/profile/ProfileLinksSection";
import type { ArtistAnnouncementItem, ArtistFeaturedWorkItem, ArtistProfileData } from "@/lib/types";

type ProfileFormProps = {
  initialProfile: ArtistProfileData;
  featuredWorks: ArtistFeaturedWorkItem[];
  announcementPreview: ArtistAnnouncementItem[];
};

export function ProfileForm({ initialProfile, featuredWorks, announcementPreview }: ProfileFormProps) {
  return (
    <div className="space-y-8">
      <PageTitle
        title="Profile"
        subtitle="CanonicalArtist is the source for your public identity, profile structure, links, exhibitions and artist background."
      />
      <ProfileBasicsSection initialProfile={initialProfile} />
      <ProfileLinksSection initialItems={initialProfile.profileLinks} />
      <ExperienceSection initialItems={initialProfile.experience} />
      <EducationSection initialItems={initialProfile.education} />
      <ExhibitionsSection initialItems={initialProfile.exhibitions} />
      <FeaturedWorksSection items={featuredWorks} />
      <AnnouncementsPreviewSection items={announcementPreview} />
    </div>
  );
}
