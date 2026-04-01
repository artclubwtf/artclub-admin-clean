import { Button } from "@/components/primitives/Button";
import { Section } from "@/components/primitives/Section";
import type { ArtistAnnouncementItem } from "@/lib/types";

type AnnouncementsPreviewSectionProps = {
  items: ArtistAnnouncementItem[];
};

export function AnnouncementsPreviewSection({ items }: AnnouncementsPreviewSectionProps) {
  return (
    <Section
      title="Announcements"
      subtitle="Preview of artist announcements for future profile pages."
      action={
        <Button href="/announcements" tone="secondary">
          Manage
        </Button>
      }
    >
      <div className="space-y-3">
        {items.length ? (
          items.map((item) => (
            <div key={item.id} className="space-y-1 rounded-[2rem] bg-neutral-50 px-4 py-4">
              <div className="text-sm font-semibold tracking-[-0.01em] text-neutral-950">{item.title}</div>
              <div className="text-sm leading-6 text-neutral-600">{item.body}</div>
              <div className="text-xs uppercase tracking-[0.18em] text-neutral-400">
                {item.isPublished ? "published" : "draft"}
                {item.isPinned ? " · pinned" : ""}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm text-neutral-500">No announcements yet.</div>
        )}
      </div>
    </Section>
  );
}
