import BrandDetailClient from "./BrandDetailClient";

type PageProps = {
  params: Promise<{ key: string }> | { key: string };
};

export default async function BrandDetailPage({ params }: PageProps) {
  const resolved = await params;
  const key = resolved.key as "artclub" | "alea";
  return <BrandDetailClient brandKey={key} />;
}
