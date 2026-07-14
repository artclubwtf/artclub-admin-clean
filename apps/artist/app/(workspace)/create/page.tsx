import { FeedClient } from "@/components/network/FeedClient";
import Link from "next/link";

import { requireNetworkContext } from "@/lib/server/network-context";

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const [{ type }, context] = await Promise.all([searchParams, requireNetworkContext()]);
  if (type === "post" || type === "process") return <FeedClient createOnly />;
  const role = context.profile!.profileType;
  const actions = [
    ...(role === "artist" ? [{ label: "Add artwork", detail: "Add work to your canonical artist portfolio.", href: "/artworks/new" }] : []),
    { label: "Publish update", detail: "Share professional news with your network.", href: "/create?type=post" },
    ...(role === "artist" ? [{ label: "Share process", detail: "Publish an image or video from your practice.", href: "/create?type=process" }] : []),
    ...(["artist", "event_series", "gallery"].includes(role) ? [{ label: "Create event", detail: "Publish a real-world or online art event.", href: "/events/new" }] : []),
    ...(["collector", "art_enthusiast"].includes(role) ? [{ label: "Add to collection", detail: "Document an artwork in your collection.", href: "/collection?create=1" }] : []),
  ];
  return <main className="app-page max-w-2xl"><header><p className="eyebrow">Create</p><h1 className="page-heading mt-1">What would you like to share?</h1></header><div className="mt-8 border-t border-[var(--divider)]">{actions.map((action) => <Link key={action.href} href={action.href} className="list-row group"><div className="min-w-0 flex-1"><p className="font-medium">{action.label}</p><p className="meta-text mt-1">{action.detail}</p></div><span className="text-[var(--text-muted)] transition-transform group-hover:translate-x-1" aria-hidden>→</span></Link>)}</div></main>;
}
