import { mobileError, mobileNetworkContext } from "@/lib/mobileNetwork";
import { createDraftArtworkProduct } from "@/lib/shopifyArtworks";
import { CanonicalArtistModel } from "@/models/CanonicalArtist";

export async function POST(req: Request) {
  const auth = await mobileNetworkContext(req); if (!auth.ok) return auth.response;
  if (auth.profile!.profileType !== "artist" || !auth.profile!.canonicalArtistId) return mobileError("artist_profile_required", 403);
  const artist = await CanonicalArtistModel.findOne({ _id: auth.profile!.canonicalArtistId, linkedUserId: auth.user._id }).lean(); const metaobject = artist?.shopify?.metaobjectGid || artist?.shopifyMetaobjectId; if (!metaobject) return mobileError("shopify_artist_setup_required", 503);
  const data = await req.formData().catch(() => null); const title = String(data?.get("title") || "").trim(); if (!title) return mobileError("title_required"); const files = (data?.getAll("images") || []).filter((item): item is File => item instanceof File && item.size > 0).slice(0, 10); if (!files.length) return mobileError("artwork_image_required");
  try { const result = await createDraftArtworkProduct({ artistShopifyMetaobjectGid: metaobject, title, shortDescription: String(data?.get("description") || ""), widthCm: Number(data?.get("widthCm")) || null, heightCm: Number(data?.get("heightCm")) || null, offering: data?.get("offering") === "original_plus_prints" ? "original_plus_prints" : "print_only", originalPriceEur: Number(data?.get("originalPriceEur")) || null, images: await Promise.all(files.map(async (file) => ({ buffer: Buffer.from(await file.arrayBuffer()), mimeType: file.type, filename: file.name }))) }); return Response.json({ ok: true, artwork: { shopifyProductId: result.productId, handle: result.productHandle, imageUrl: result.imageUrl, status: "draft" } }, { status: 201 }); }
  catch (error) { const code = error instanceof Error && /disabled|Missing env var|write/i.test(error.message) ? "shopify_artwork_upload_setup_required" : "artwork_upload_failed"; return mobileError(code, code.includes("setup") ? 503 : 500); }
}
