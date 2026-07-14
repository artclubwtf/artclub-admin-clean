import { collectionItemInputSchema } from "@artclub/models";

import { mobileError, mobileNetworkContext } from "@/lib/mobileNetwork";
import { CanonicalProductModel } from "@/models/CanonicalProduct";
import { CollectionItemModel } from "@/models/Network";

function serialize(item: any) { return { id: String(item._id), canonicalProductId: item.canonicalProductId ? String(item.canonicalProductId) : undefined, artistName: item.customArtistName || "", artworkTitle: item.customArtworkTitle || "", imageUrl: item.customImageUrl || "", note: item.note || "", visibility: item.visibility, createdAt: item.createdAt }; }
export async function GET(req: Request) { const auth = await mobileNetworkContext(req); if (!auth.ok) return auth.response; const rows = await CollectionItemModel.find({ ownerProfileId: auth.profile!._id }).sort({ createdAt: -1 }).limit(50).lean(); return Response.json({ ok: true, items: rows.map(serialize) }); }
export async function POST(req: Request) { const auth = await mobileNetworkContext(req); if (!auth.ok) return auth.response; const parsed = collectionItemInputSchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return mobileError("invalid_collection_item", 400, parsed.error.flatten()); if (parsed.data.canonicalProductId && !(await CanonicalProductModel.exists({ _id: parsed.data.canonicalProductId }))) return mobileError("artwork_not_found", 404); const item = await CollectionItemModel.create({ ...parsed.data, ownerProfileId: auth.profile!._id }); return Response.json({ ok: true, item: serialize(item) }, { status: 201 }); }
