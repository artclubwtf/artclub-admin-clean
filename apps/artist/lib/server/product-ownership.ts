import type { Types } from "mongoose";

type ProductOwnershipContext = {
  user: {
    shopDomain: string;
  };
  canonicalArtist: {
    _id: Types.ObjectId;
  };
};

export function artistProductOwnershipFilter(context: ProductOwnershipContext): Record<string, unknown> {
  return {
    shopDomain: context.user.shopDomain,
    canonicalArtistId: context.canonicalArtist._id,
  };
}

export function artistProductWriteOwnershipFilter(context: ProductOwnershipContext): Record<string, unknown> {
  return artistProductOwnershipFilter(context);
}
