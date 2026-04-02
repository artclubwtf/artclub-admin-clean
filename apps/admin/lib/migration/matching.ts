import { connectMongo } from "@/lib/mongodb";
import { resolveShopDomain } from "@/lib/shopDomain";
import { CanonicalArtistModel } from "@/models/CanonicalArtist";
import { CanonicalProductModel } from "@/models/CanonicalProduct";
import { UserModel } from "@/models/User";

type UserOption = {
  id: string;
  label: string;
  email: string;
  artistKey: string;
};

type ArtistOption = {
  artistKey: string;
  label: string;
  publicSlug: string;
  shopifyMetaobjectId: string;
};

type ScoredSuggestion<T> = T & {
  score: number;
  reasons: string[];
};

function optionalString(value: string | null | undefined) {
  return value ?? undefined;
}

function normalizeText(value: string | null | undefined) {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}

function uniqueNonEmpty(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => (value || "").trim()).filter(Boolean)));
}

function includesNormalized(haystack: string | null | undefined, needle: string | null | undefined) {
  const left = normalizeText(haystack);
  const right = normalizeText(needle);
  return Boolean(left && right && left.includes(right));
}

function equalsNormalized(left: string | null | undefined, right: string | null | undefined) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  return Boolean(a && b && a === b);
}

function buildArtistUserSuggestion(input: {
  importedArtist: {
    displayName?: string;
    email?: string;
    handle?: string;
    publicSlug?: string;
    vendorHints: string[];
  };
  user: {
    _id: { toString(): string };
    email?: string;
    name?: string;
    artistKey?: string;
  };
}) {
  let score = 0;
  const reasons: string[] = [];

  if (input.importedArtist.email && input.user.email && input.importedArtist.email.trim().toLowerCase() === input.user.email.trim().toLowerCase()) {
    score += 120;
    reasons.push("Exact email match");
  }

  if (equalsNormalized(input.importedArtist.displayName, input.user.name)) {
    score += 70;
    reasons.push("Normalized name match");
  }

  if (
    equalsNormalized(input.importedArtist.publicSlug, input.user.artistKey) ||
    equalsNormalized(input.importedArtist.handle, input.user.artistKey)
  ) {
    score += 60;
    reasons.push("Handle / artist key match");
  }

  if (input.importedArtist.vendorHints.some((vendor) => equalsNormalized(vendor, input.user.name))) {
    score += 35;
    reasons.push("Vendor matches user name");
  }

  if (includesNormalized(input.user.name, input.importedArtist.displayName)) {
    score += 15;
    reasons.push("Partial name overlap");
  }

  if (score <= 0) return null;

  return {
    id: input.user._id.toString(),
    label: input.user.name?.trim() || input.user.email?.trim() || input.user.artistKey?.trim() || "Unnamed user",
    email: input.user.email?.trim() || "",
    artistKey: input.user.artistKey?.trim() || "",
    score,
    reasons,
  };
}

function buildProductArtistSuggestion(input: {
  importedProduct: {
    artistRef?: string;
    vendor?: string;
    artistKey?: string;
    title?: string;
  };
  artist: {
    artistKey: string;
    displayName?: string;
    handle?: string;
    publicSlug?: string;
    shopifyMetaobjectId?: string;
    linkedUserId?: { toString(): string } | string;
  };
}) {
  let score = 0;
  const reasons: string[] = [];

  if (input.importedProduct.artistKey && input.importedProduct.artistKey === input.artist.artistKey) {
    score += 140;
    reasons.push("Existing artist key match");
  }

  if (input.importedProduct.artistRef && input.artist.shopifyMetaobjectId && input.importedProduct.artistRef === input.artist.shopifyMetaobjectId) {
    score += 120;
    reasons.push("Shopify artist reference match");
  }

  if (equalsNormalized(input.importedProduct.vendor, input.artist.displayName)) {
    score += 90;
    reasons.push("Vendor matches artist name");
  }

  if (
    equalsNormalized(input.importedProduct.vendor, input.artist.publicSlug) ||
    equalsNormalized(input.importedProduct.vendor, input.artist.handle)
  ) {
    score += 70;
    reasons.push("Vendor matches public slug / handle");
  }

  if (input.artist.linkedUserId) {
    score += 10;
    reasons.push("Artist already linked to user");
  }

  if (
    includesNormalized(input.importedProduct.title, input.artist.displayName) ||
    includesNormalized(input.importedProduct.title, input.artist.publicSlug)
  ) {
    score += 15;
    reasons.push("Product context overlaps artist");
  }

  if (score <= 0) return null;

  return {
    artistKey: input.artist.artistKey,
    label: input.artist.displayName?.trim() || input.artist.publicSlug?.trim() || input.artist.artistKey,
    publicSlug: input.artist.publicSlug?.trim() || input.artist.handle?.trim() || "",
    shopifyMetaobjectId: input.artist.shopifyMetaobjectId?.trim() || "",
    score,
    reasons,
  };
}

export async function loadArtistMatchingOverview() {
  const shopDomain = resolveShopDomain();
  if (!shopDomain) throw new Error("Missing shop domain");

  await connectMongo();

  const [importedArtists, users, importedProducts] = await Promise.all([
    CanonicalArtistModel.find({
      shopDomain,
      $or: [
        { migrationStatus: "imported_unlinked" },
        { linkStatus: { $in: ["unlinked", "suggested", "needs_review"] } },
      ],
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean(),
    UserModel.find({
      shopDomain,
      role: "artist",
      isActive: true,
    })
      .select({ _id: 1, email: 1, name: 1, artistKey: 1 })
      .lean(),
    CanonicalProductModel.find({
      shopDomain,
      migrationStatus: { $in: ["imported_unmapped", "suggested", "unassigned", "needs_review"] },
    })
      .select({ artistRef: 1, vendor: 1 })
      .lean(),
  ]);

  const vendorsByArtistRef = importedProducts.reduce<Record<string, string[]>>((acc, item) => {
    const key = (item.artistRef || "").trim();
    if (!key || !item.vendor) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item.vendor);
    return acc;
  }, {});

  const userOptions: UserOption[] = users.map((user) => ({
    id: user._id.toString(),
    label: user.name?.trim() || user.email?.trim() || user.artistKey?.trim() || "Unnamed user",
    email: user.email?.trim() || "",
    artistKey: user.artistKey?.trim() || "",
  }));

  const artists = importedArtists.map((artist) => {
    const vendorHints = uniqueNonEmpty(vendorsByArtistRef[artist.shopifyMetaobjectId || artist.artistKey] || []);
    const suggestions = users
      .map((user) =>
        buildArtistUserSuggestion({
          importedArtist: {
            displayName: optionalString(artist.displayName),
            email: optionalString(artist.email),
            handle: optionalString(artist.handle),
            publicSlug: optionalString(artist.publicSlug),
            vendorHints,
          },
          user: {
            _id: user._id,
            email: optionalString(user.email),
            name: optionalString(user.name),
            artistKey: optionalString(user.artistKey),
          },
        }),
      )
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const status = artist.linkedUserId
      ? "linked"
      : suggestions.length
        ? "suggested"
        : artist.linkStatus === "needs_review"
          ? "needs_review"
          : "unlinked";

    return {
      artistKey: artist.artistKey,
      displayName: artist.displayName,
      email: artist.email || "",
      handle: artist.handle || "",
      publicSlug: artist.publicSlug || "",
      shopifyMetaobjectId: artist.shopifyMetaobjectId || artist.shopify?.metaobjectGid || "",
      appUrl: artist.appUrl || "",
      linkedUserId: artist.linkedUserId?.toString() || "",
      vendorHints,
      migrationStatus: artist.migrationStatus || "",
      linkStatus: status,
      suggestions,
    };
  });

  return { artists, userOptions };
}

export async function loadProductMatchingOverview() {
  const shopDomain = resolveShopDomain();
  if (!shopDomain) throw new Error("Missing shop domain");

  await connectMongo();

  const [products, artists] = await Promise.all([
    CanonicalProductModel.find({
      shopDomain,
      migrationStatus: { $in: ["imported_unmapped", "suggested", "unassigned", "needs_review"] },
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean(),
    CanonicalArtistModel.find({ shopDomain })
      .select({
        artistKey: 1,
        displayName: 1,
        handle: 1,
        publicSlug: 1,
        shopifyMetaobjectId: 1,
        linkedUserId: 1,
      })
      .lean(),
  ]);

  const artistOptions: ArtistOption[] = artists.map((artist) => ({
    artistKey: artist.artistKey,
    label: artist.displayName?.trim() || artist.publicSlug?.trim() || artist.artistKey,
    publicSlug: artist.publicSlug?.trim() || artist.handle?.trim() || "",
    shopifyMetaobjectId: artist.shopifyMetaobjectId?.trim() || artist.shopify?.metaobjectGid?.trim() || "",
  }));

  const rows = products.map((product) => {
    const suggestions = artists
      .map((artist) =>
        buildProductArtistSuggestion({
          importedProduct: {
            artistRef: optionalString(product.artistRef),
            vendor: optionalString(product.vendor),
            artistKey: optionalString(product.artistKey),
            title: optionalString(product.title),
          },
          artist: {
            artistKey: artist.artistKey,
            displayName: optionalString(artist.displayName),
            handle: optionalString(artist.handle),
            publicSlug: optionalString(artist.publicSlug),
            shopifyMetaobjectId: optionalString(artist.shopifyMetaobjectId || artist.shopify?.metaobjectGid),
            linkedUserId: artist.linkedUserId ?? undefined,
          },
        }),
      )
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const status = product.artistKey
      ? "assigned"
      : suggestions.length
        ? "suggested"
        : product.migrationStatus === "needs_review"
          ? "needs_review"
          : "unassigned";

    return {
      productKey: product.productKey,
      title: product.title,
      vendor: product.vendor || "",
      handle: product.handle || "",
      artistKey: product.artistKey || "",
      artistRef: product.artistRef || "",
      shopifyProductId: product.shopifyProductId || product.shopify?.productGid || "",
      migrationStatus: status,
      suggestions,
    };
  });

  return { products: rows, artistOptions };
}
