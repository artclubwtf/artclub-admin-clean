import ConceptDetailClient from "./ConceptDetailClient";

type PageProps = {
  params: Promise<{ id: string }> | { id: string };
};

export default async function ConceptDetailPage({ params }: PageProps) {
  const resolved = await params;
  return <ConceptDetailClient conceptId={resolved.id} />;
}
