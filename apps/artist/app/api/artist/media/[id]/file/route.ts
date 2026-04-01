import { resolveArtistMediaFileResponse } from "@/lib/server/artist-media-response";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return resolveArtistMediaFileResponse(id);
}
