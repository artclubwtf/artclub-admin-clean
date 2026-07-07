import type { ExploreArtPage, ExploreArtwork } from "@artclub/models";

import { requireNetworkApiContext } from "@/lib/server/network-context";
import { CanonicalProductModel, CanonicalVariantModel, UserReactionModel, UserSavedModel } from "@/lib/server/models";
import { resolveUnifiedArtistsByIds } from "@/lib/server/unified-profile";

const categories = ["Painting", "Photography", "Digital", "Sculpture", "Mixed Media", "Other"] as const;
function escaped(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function categoryFor(tags: string[]) { const text=tags.join(" ").toLowerCase(); return categories.find(item=>text.includes(item.toLowerCase()))||"Other"; }
function price(variants:any[]){const cents=variants.filter(item=>item.priceCents>0).map(item=>item.priceCents);return cents.length?new Intl.NumberFormat("en",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(Math.min(...cents)/100):""}

export async function GET(req:Request){
  const auth=await requireNetworkApiContext();if(!auth.ok)return auth.response;
  const params=new URL(req.url).searchParams;const offset=Math.max(0,Number(params.get("cursor")||0)||0);const q=(params.get("q")||"").trim();const category=params.get("category")||"All";const sort=params.get("sort")==="popular"?"popular":"recent";
  const filter:any={type:"artwork",status:{$in:["active","shopify_synced"]},canonicalArtistId:{$exists:true},$or:[{"images.mediumUrl":{$nin:[null,""]}},{"images.originalUrl":{$nin:[null,""]}}]};
  if(q){const regex=new RegExp(escaped(q),"i");filter.$and=[{$or:[{title:regex},{vendor:regex},{tags:regex},{seriesName:regex}]}]}
  if(category!=="All"&&categories.includes(category as any)){filter.tags=new RegExp(escaped(category),"i")}
  const candidates=await CanonicalProductModel.find(filter).sort({createdAt:-1,_id:-1}).skip(sort==="popular"?0:offset).limit(sort==="popular"?120:31).lean();
  const tokens=candidates.map(item=>item.shopify?.productGid||`canonical:${item._id}`);const [reactions,saves,variants,artists,facetProducts]=await Promise.all([UserReactionModel.find({productGid:{$in:tokens}}).lean(),UserSavedModel.find({productGid:{$in:tokens},userId:auth.context.user._id}).lean(),CanonicalVariantModel.find({productKey:{$in:candidates.map(item=>item.productKey)}}).lean(),resolveUnifiedArtistsByIds(candidates.map(item=>item.canonicalArtistId!).filter(Boolean)),CanonicalProductModel.find({type:"artwork",status:{$in:["active","shopify_synced"]}}).select({tags:1}).limit(1000).lean()]);
  const reactionCount=new Map<string,number>();for(const item of reactions)reactionCount.set(item.productGid,(reactionCount.get(item.productGid)||0)+1);const saved=new Set(saves.map(item=>item.productGid));const variantsByKey=new Map<string,any[]>();for(const item of variants)variantsByKey.set(item.productKey,[...(variantsByKey.get(item.productKey)||[]),item]);
  const ordered=sort==="popular"?[...candidates].sort((a,b)=>(reactionCount.get(b.shopify?.productGid||`canonical:${b._id}`)||0)-(reactionCount.get(a.shopify?.productGid||`canonical:${a._id}`)||0)).slice(offset,offset+31):candidates;
  const page=ordered.slice(0,30);const items:ExploreArtwork[]=page.flatMap(item=>{const artist=artists.get(String(item.canonicalArtistId));if(!artist)return[];const token=item.shopify?.productGid||`canonical:${item._id}`;const width=item.dimensions?.widthCm||undefined;const height=item.dimensions?.heightCm||undefined;return[{id:String(item._id),productKey:item.productKey,title:item.title,imageUrl:item.images?.mediumUrl||item.images?.originalUrl||item.images?.thumbUrl||"",width,height,category:categoryFor(item.tags||[]),offering:item.offerings,priceLabel:price(variantsByKey.get(item.productKey)||[]),shopUrl:item.handle?`https://${item.shopDomain}/products/${item.handle}`:"",liked:(reactionCount.get(token)||0)>0&&reactions.some(reaction=>reaction.productGid===token&&String(reaction.userId)===String(auth.context.user._id)),saved:saved.has(token),likeCount:reactionCount.get(token)||0,artist:{slug:artist.slug,displayName:artist.displayName}}]});
  const facets=categories.filter(category=>facetProducts.some(item=>categoryFor(item.tags||[])===category));const result:ExploreArtPage={items,nextCursor:ordered.length>30?String(offset+30):null,facets};return Response.json(result);
}
