import { Types } from "mongoose";

import { KUENSTLER_FIELD_KEYS } from "@/lib/shopify";
import { CanonicalArtistModel } from "@/models/CanonicalArtist";
import { previewValue } from "@/lib/sync/syncLogger";

export type ShopifyFieldReferenceNode = {
  __typename?: string | null;
  id?: string | null;
  alt?: string | null;
  url?: string | null;
  handle?: string | null;
  displayName?: string | null;
  image?: {
    url?: string | null;
    altText?: string | null;
    width?: number | null;
    height?: number | null;
  } | null;
};

export type ShopifyFieldReferencesConnection = {
  nodes?: ShopifyFieldReferenceNode[] | null;
} | null;

export type ShopifyMetaobjectField = {
  key?: string | null;
  type?: string | null;
  value?: string | null;
  reference?: ShopifyFieldReferenceNode | null;
  references?: ShopifyFieldReferencesConnection;
};

export type ShopifyArtistMetaobjectNode = {
  id?: string | null;
  handle?: string | null;
  type?: string | null;
  displayName?: string | null;
  fields?: ShopifyMetaobjectField[] | null;
};

export type ShopifyArtistFieldReason =
  | "ok"
  | "missing_field"
  | "empty_value"
  | "reference_missing"
  | "reference_without_image_url"
  | "generic_file_without_url"
  | "field_value_gid_without_reference"
  | "unsupported_reference_type";

export type ShopifyArtistFieldMappingCheck = {
  fieldKey: string;
  exists: boolean;
  rawType: string | null;
  rawValuePreview: string | null;
  hasReference: boolean;
  referenceTypename: string | null;
  resolvedUrl: string | null;
  mappedTo: string;
  mappedValuePreview: string | null;
  success: boolean;
  reason: ShopifyArtistFieldReason;
};

export type ShopifyResolvedFileField = {
  fieldKey: string;
  rawType: string | null;
  rawValuePreview: string | null;
  hasReference: boolean;
  referenceTypename: string | null;
  resolvedUrl: string | null;
  referenceImageUrl: string | null;
  referenceGenericFileUrl: string | null;
  referencesCount: number;
  reason: ShopifyArtistFieldReason;
  altText?: string;
  shopifyFileGid?: string;
  mediaGid?: string;
  width?: number;
  height?: number;
};

export type ShopifyArtistRawFieldSummary = {
  key: string;
  type: string | null;
  hasValue: boolean;
  valuePreview: string | null;
  hasReference: boolean;
  referenceTypename: string | null;
  referenceImageUrl: string | null;
  referenceGenericFileUrl: string | null;
  referencesCount: number;
};

export type ExtractedShopifyArtistMetaobjectMapping = {
  metaobjectId: string | null;
  handle: string;
  type: string;
  displayName: string;
  appUrl?: string;
  instagram?: string;
  quote?: string;
  introduction?: string;
  bio?: string;
  longText?: string;
  categoryRef?: string;
  coverImageUrl?: string;
  galleryImages: string[];
  profileImages: {
    avatarUrl?: string;
    heroUrl?: string;
    galleryUrls: string[];
    media: Array<{
      fieldKey: string;
      url: string;
      altText?: string;
      shopifyFileGid?: string;
      mediaGid?: string;
      width?: number;
      height?: number;
    }>;
  };
  rawFieldSummary: ShopifyArtistRawFieldSummary[];
  fieldMappings: ShopifyArtistFieldMappingCheck[];
};

export type CanonicalArtistProductMatch = {
  selectedArtist:
    | {
        _id: Types.ObjectId | string;
        artistKey: string;
        publicSlug?: string | null;
        handle?: string | null;
        displayName?: string | null;
        shopifyMetaobjectId?: string | null;
        shopify?: { metaobjectGid?: string | null } | null;
      }
    | null;
  selectedArtistId?: string;
  selectedArtistName?: string;
  reason: string;
  lookupCandidates: {
    publicSlug: string[];
    handle: string[];
    artistKey: string[];
    shopifyMetaobject: string[];
  };
  selectedInputValue?: string;
};

const ARTIST_FIELD_ORDER = [
  KUENSTLER_FIELD_KEYS.name,
  KUENSTLER_FIELD_KEYS.app_url,
  KUENSTLER_FIELD_KEYS.bilder,
  KUENSTLER_FIELD_KEYS.bild_1,
  KUENSTLER_FIELD_KEYS.bild_2,
  KUENSTLER_FIELD_KEYS.bild_3,
  KUENSTLER_FIELD_KEYS.instagram,
  KUENSTLER_FIELD_KEYS.quote,
  KUENSTLER_FIELD_KEYS.einleitung_1,
  KUENSTLER_FIELD_KEYS.text_1,
  KUENSTLER_FIELD_KEYS.kategorie,
] as const;

function firstTruthy(values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function uniq(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function fieldValue(field?: ShopifyMetaobjectField | null) {
  const value = field?.value?.trim();
  return value || undefined;
}

function fieldByKey(fields: ShopifyMetaobjectField[] | null | undefined) {
  const map = new Map<string, ShopifyMetaobjectField>();
  for (const field of fields || []) {
    const key = field?.key?.trim();
    if (!key) continue;
    map.set(key, field);
  }
  return map;
}

function slugifyLoose(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractSlugFromAppUrl(value?: string | null) {
  const raw = value?.trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    const parts = url.pathname.split("/").filter(Boolean);
    return parts.at(-1) || undefined;
  } catch {
    return undefined;
  }
}

function normalizeGidValue(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.startsWith("gid://") ? trimmed : undefined;
}

function pickReference(field?: ShopifyMetaobjectField | null) {
  const references = (field?.references?.nodes || []).filter(Boolean);
  return field?.reference || references[0] || null;
}

export function resolveShopifyFileField(field?: ShopifyMetaobjectField | null): ShopifyResolvedFileField {
  const fieldKey = field?.key?.trim() || "";
  const rawValue = fieldValue(field);
  const reference = pickReference(field);
  const referenceImageUrl = reference?.image?.url?.trim() || null;
  const referenceGenericFileUrl = reference?.url?.trim() || null;
  const referencesCount = (field?.references?.nodes || []).filter(Boolean).length;
  const resolvedDirectUrl = rawValue && /^https?:\/\//i.test(rawValue) ? rawValue : null;
  const resolvedUrl = firstTruthy([referenceImageUrl, referenceGenericFileUrl, resolvedDirectUrl]) || null;
  const typename = reference?.__typename?.trim() || null;

  let reason: ShopifyArtistFieldReason = "ok";
  if (!field) {
    reason = "missing_field";
  } else if (!rawValue && !reference && referencesCount === 0) {
    reason = "empty_value";
  } else if (!reference && referencesCount === 0 && normalizeGidValue(rawValue)) {
    reason = "field_value_gid_without_reference";
  } else if (!reference && referencesCount === 0 && !resolvedDirectUrl) {
    reason = "reference_missing";
  } else if (typename === "MediaImage" && !referenceImageUrl && !resolvedDirectUrl) {
    reason = "reference_without_image_url";
  } else if (typename === "GenericFile" && !referenceGenericFileUrl && !resolvedDirectUrl) {
    reason = "generic_file_without_url";
  } else if (reference && typename !== "MediaImage" && typename !== "GenericFile" && !resolvedDirectUrl) {
    reason = "unsupported_reference_type";
  }

  return {
    fieldKey,
    rawType: field?.type?.trim() || null,
    rawValuePreview: previewValue(rawValue, 120) || null,
    hasReference: Boolean(field?.reference),
    referenceTypename: typename,
    resolvedUrl,
    referenceImageUrl,
    referenceGenericFileUrl,
    referencesCount,
    reason,
    altText: reference?.image?.altText || reference?.alt || undefined,
    shopifyFileGid: reference?.id?.trim() || rawValue,
    mediaGid: reference?.id?.trim() || undefined,
    width: typeof reference?.image?.width === "number" ? reference.image.width : undefined,
    height: typeof reference?.image?.height === "number" ? reference.image.height : undefined,
  };
}

function mapTextField(field: ShopifyMetaobjectField | undefined, mappedTo: string): ShopifyArtistFieldMappingCheck {
  const rawValue = fieldValue(field);
  if (!field) {
    return {
      fieldKey: mappedTo === "displayName" ? KUENSTLER_FIELD_KEYS.name : mappedTo,
      exists: false,
      rawType: null,
      rawValuePreview: null,
      hasReference: false,
      referenceTypename: null,
      resolvedUrl: null,
      mappedTo,
      mappedValuePreview: null,
      success: false,
      reason: "missing_field",
    };
  }

  return {
    fieldKey: field.key?.trim() || mappedTo,
    exists: true,
    rawType: field.type?.trim() || null,
    rawValuePreview: previewValue(rawValue, 120) || null,
    hasReference: Boolean(field.reference),
    referenceTypename: pickReference(field)?.__typename?.trim() || null,
    resolvedUrl: null,
    mappedTo,
    mappedValuePreview: previewValue(rawValue, 120) || null,
    success: Boolean(rawValue),
    reason: rawValue ? "ok" : "empty_value",
  };
}

function mapFileField(field: ShopifyMetaobjectField | undefined, mappedTo: string): ShopifyArtistFieldMappingCheck {
  if (!field) {
    return {
      fieldKey: mappedTo,
      exists: false,
      rawType: null,
      rawValuePreview: null,
      hasReference: false,
      referenceTypename: null,
      resolvedUrl: null,
      mappedTo,
      mappedValuePreview: null,
      success: false,
      reason: "missing_field",
    };
  }
  const resolved = resolveShopifyFileField(field);
  return {
    fieldKey: field.key?.trim() || mappedTo,
    exists: true,
    rawType: resolved.rawType,
    rawValuePreview: resolved.rawValuePreview,
    hasReference: resolved.hasReference,
    referenceTypename: resolved.referenceTypename,
    resolvedUrl: resolved.resolvedUrl,
    mappedTo,
    mappedValuePreview: previewValue(resolved.resolvedUrl, 120) || null,
    success: Boolean(resolved.resolvedUrl),
    reason: resolved.resolvedUrl ? "ok" : resolved.reason,
  };
}

export function summarizeShopifyArtistRawFields(metaobject: ShopifyArtistMetaobjectNode): ShopifyArtistRawFieldSummary[] {
  return (metaobject.fields || [])
    .map((field) => {
      const resolved = resolveShopifyFileField(field);
      return {
        key: field?.key?.trim() || "",
        type: field?.type?.trim() || null,
        hasValue: Boolean(fieldValue(field)),
        valuePreview: previewValue(field?.value, 120) || null,
        hasReference: Boolean(field?.reference),
        referenceTypename: resolved.referenceTypename,
        referenceImageUrl: resolved.referenceImageUrl,
        referenceGenericFileUrl: resolved.referenceGenericFileUrl,
        referencesCount: resolved.referencesCount,
      };
    })
    .filter((field) => field.key);
}

export function extractShopifyArtistMetaobjectMapping(metaobject: ShopifyArtistMetaobjectNode): ExtractedShopifyArtistMetaobjectMapping {
  const fields = metaobject.fields || [];
  const fieldsMap = fieldByKey(fields);
  const handle = firstTruthy([metaobject.handle || undefined]) || `artist-${metaobject.id?.split("/").pop() || "unknown"}`;
  const nameField = fieldsMap.get(KUENSTLER_FIELD_KEYS.name);
  const appUrlField = fieldsMap.get(KUENSTLER_FIELD_KEYS.app_url);
  const bilderField = fieldsMap.get(KUENSTLER_FIELD_KEYS.bilder);
  const bild1Field = fieldsMap.get(KUENSTLER_FIELD_KEYS.bild_1);
  const bild2Field = fieldsMap.get(KUENSTLER_FIELD_KEYS.bild_2);
  const bild3Field = fieldsMap.get(KUENSTLER_FIELD_KEYS.bild_3);
  const introField = fieldsMap.get(KUENSTLER_FIELD_KEYS.einleitung_1);
  const textField = fieldsMap.get(KUENSTLER_FIELD_KEYS.text_1);
  const instagramField = fieldsMap.get(KUENSTLER_FIELD_KEYS.instagram);
  const quoteField = fieldsMap.get(KUENSTLER_FIELD_KEYS.quote);
  const categoryField = fieldsMap.get(KUENSTLER_FIELD_KEYS.kategorie);

  const displayName = firstTruthy([fieldValue(nameField), metaobject.displayName || undefined, handle]) || handle;
  const appUrl = fieldValue(appUrlField);
  const coverImage = resolveShopifyFileField(bilderField);
  const image1 = resolveShopifyFileField(bild1Field);
  const image2 = resolveShopifyFileField(bild2Field);
  const image3 = resolveShopifyFileField(bild3Field);
  const galleryImages = uniq([image1.resolvedUrl || "", image2.resolvedUrl || "", image3.resolvedUrl || ""]);
  const introduction = fieldValue(introField);
  const longText = fieldValue(textField);
  const bio = firstTruthy([introduction, longText]);
  const categoryReference = pickReference(categoryField)?.id?.trim();
  const categoryRef = firstTruthy([categoryReference, fieldValue(categoryField)]);

  const media = [coverImage, image1, image2, image3]
    .filter((item) => item.resolvedUrl)
    .map((item) => ({
      fieldKey: item.fieldKey,
      url: item.resolvedUrl!,
      altText: item.altText,
      shopifyFileGid: item.shopifyFileGid,
      mediaGid: item.mediaGid,
      width: item.width,
      height: item.height,
    }));

  const fieldMappings: ShopifyArtistFieldMappingCheck[] = [
    {
      ...mapTextField(nameField, "displayName/name"),
      fieldKey: KUENSTLER_FIELD_KEYS.name,
      mappedValuePreview: previewValue(displayName, 120) || null,
      success: Boolean(displayName),
      reason: displayName ? "ok" : "empty_value",
    },
    {
      ...mapTextField(appUrlField, "appUrl"),
      fieldKey: KUENSTLER_FIELD_KEYS.app_url,
    },
    {
      ...mapFileField(bilderField, "coverImageUrl"),
      fieldKey: KUENSTLER_FIELD_KEYS.bilder,
    },
    {
      ...mapFileField(bild1Field, "galleryImages[0]"),
      fieldKey: KUENSTLER_FIELD_KEYS.bild_1,
    },
    {
      ...mapFileField(bild2Field, "galleryImages[1]"),
      fieldKey: KUENSTLER_FIELD_KEYS.bild_2,
    },
    {
      ...mapFileField(bild3Field, "galleryImages[2]"),
      fieldKey: KUENSTLER_FIELD_KEYS.bild_3,
    },
    {
      ...mapTextField(instagramField, "instagram/socialLinks.instagram"),
      fieldKey: KUENSTLER_FIELD_KEYS.instagram,
    },
    {
      ...mapTextField(quoteField, "quote"),
      fieldKey: KUENSTLER_FIELD_KEYS.quote,
    },
    {
      ...mapTextField(introField, "intro/shortBio"),
      fieldKey: KUENSTLER_FIELD_KEYS.einleitung_1,
    },
    {
      ...mapTextField(textField, "longText/aboutText"),
      fieldKey: KUENSTLER_FIELD_KEYS.text_1,
    },
    {
      ...mapTextField(categoryField, "categoryRef"),
      fieldKey: KUENSTLER_FIELD_KEYS.kategorie,
      mappedValuePreview: previewValue(categoryRef, 120) || null,
      success: Boolean(categoryRef),
      reason: categoryField ? (categoryRef ? "ok" : "empty_value") : "missing_field",
    },
  ];

  return {
    metaobjectId: metaobject.id?.trim() || null,
    handle,
    type: metaobject.type?.trim() || "kunstler",
    displayName,
    appUrl,
    instagram: fieldValue(instagramField),
    quote: fieldValue(quoteField),
    introduction,
    bio,
    longText,
    categoryRef,
    coverImageUrl: coverImage.resolvedUrl || undefined,
    galleryImages,
    profileImages: {
      avatarUrl: image1.resolvedUrl || undefined,
      heroUrl: coverImage.resolvedUrl || undefined,
      galleryUrls: galleryImages,
      media,
    },
    rawFieldSummary: summarizeShopifyArtistRawFields(metaobject),
    fieldMappings,
  };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function mapShopifyProductToCanonicalArtist(input: {
  shopDomain: string;
  customKunstlerValue?: string | null;
  customKuenstlerValue?: string | null;
  customKunstlerHandle?: string | null;
  customKunstlerDisplayName?: string | null;
}): Promise<CanonicalArtistProductMatch> {
  const customKunstlerValue = input.customKunstlerValue?.trim();
  const customKuenstlerValue = input.customKuenstlerValue?.trim();
  const customKunstlerHandle = input.customKunstlerHandle?.trim();
  const customKunstlerDisplayName = input.customKunstlerDisplayName?.trim();
  const lookupTextCandidates = uniq(
    [
      customKunstlerValue,
      customKuenstlerValue,
      customKunstlerHandle,
      customKunstlerDisplayName ? slugifyLoose(customKunstlerDisplayName) : undefined,
    ].filter(Boolean) as string[],
  );
  const value = customKunstlerValue || customKuenstlerValue || customKunstlerHandle || customKunstlerDisplayName;
  if (!value) {
    return {
      selectedArtist: null,
      reason: customKuenstlerValue === "" ? "custom_kuenstler_empty" : "no_custom_kunstler",
      lookupCandidates: { publicSlug: [], handle: [], artistKey: [], shopifyMetaobject: [] },
    };
  }

  const exact = new RegExp(`^${escapeRegex(value)}$`, "i");
  const textCandidateRegexes = lookupTextCandidates.map((candidate) => new RegExp(`^${escapeRegex(candidate)}$`, "i"));
  const regexOrFilters = textCandidateRegexes.flatMap((regex) => [{ publicSlug: regex }, { handle: regex }, { artistKey: regex }]);
  const matches = await CanonicalArtistModel.find({
    shopDomain: input.shopDomain,
    $or: [
      ...regexOrFilters,
      { shopifyMetaobjectId: value },
      { "shopify.metaobjectGid": value },
    ],
  })
    .select({ _id: 1, artistKey: 1, publicSlug: 1, handle: 1, displayName: 1, shopifyMetaobjectId: 1, shopify: 1 })
    .limit(20)
    .lean();

  const publicSlugMatches = matches
    .filter(
      (artist) => artist.publicSlug && (exact.test(artist.publicSlug) || textCandidateRegexes.some((regex) => regex.test(artist.publicSlug!))),
    )
    .map((artist) => artist.publicSlug!.trim());
  const handleMatches = matches
    .filter((artist) => artist.handle && (exact.test(artist.handle) || textCandidateRegexes.some((regex) => regex.test(artist.handle!))))
    .map((artist) => artist.handle!.trim());
  const artistKeyMatches = matches
    .filter((artist) => artist.artistKey && (exact.test(artist.artistKey) || textCandidateRegexes.some((regex) => regex.test(artist.artistKey))))
    .map((artist) => artist.artistKey.trim());
  const metaobjectMatches = matches
    .filter((artist) => artist.shopifyMetaobjectId === value || artist.shopify?.metaobjectGid === value)
    .map((artist) => artist.shopifyMetaobjectId || artist.shopify?.metaobjectGid || "")
    .filter(Boolean);

  if (matches.length === 0) {
    return {
      selectedArtist: null,
      reason: "no_matching_artist",
      lookupCandidates: {
        publicSlug: publicSlugMatches,
        handle: handleMatches,
        artistKey: artistKeyMatches,
        shopifyMetaobject: metaobjectMatches,
      },
      selectedInputValue: value,
    };
  }

  if (matches.length > 1) {
    return {
      selectedArtist: null,
      reason: "ambiguous_match",
      lookupCandidates: {
        publicSlug: publicSlugMatches,
        handle: handleMatches,
        artistKey: artistKeyMatches,
        shopifyMetaobject: metaobjectMatches,
      },
      selectedInputValue: value,
    };
  }

  const selectedArtist = matches[0];
  let reason = "matched_custom_kunstler_handle";
  if (
    selectedArtist.publicSlug &&
    (exact.test(selectedArtist.publicSlug) || textCandidateRegexes.some((regex) => regex.test(selectedArtist.publicSlug!)))
  ) {
    reason = "matched_custom_kunstler_publicSlug";
  } else if (
    selectedArtist.artistKey &&
    (exact.test(selectedArtist.artistKey) || textCandidateRegexes.some((regex) => regex.test(selectedArtist.artistKey)))
  ) {
    reason = "matched_custom_kunstler_artistKey";
  } else if (selectedArtist.shopifyMetaobjectId === value || selectedArtist.shopify?.metaobjectGid === value) {
    reason = "matched_custom_kunstler_shopify_metaobject";
  }

  return {
    selectedArtist,
    selectedArtistId: String(selectedArtist._id),
    selectedArtistName: selectedArtist.displayName || selectedArtist.artistKey,
    reason,
    lookupCandidates: {
      publicSlug: publicSlugMatches,
      handle: handleMatches,
      artistKey: artistKeyMatches,
      shopifyMetaobject: metaobjectMatches,
    },
    selectedInputValue: value,
  };
}

export function matchesArtistSlug(metaobject: ShopifyArtistMetaobjectNode, slug: string) {
  const normalizedSlug = slug.trim().toLowerCase();
  if (!normalizedSlug) return false;
  if (metaobject.handle?.trim().toLowerCase() === normalizedSlug) return true;

  const mapping = extractShopifyArtistMetaobjectMapping(metaobject);
  if (mapping.displayName && slugifyLoose(mapping.displayName) === normalizedSlug) return true;
  if (mapping.appUrl && extractSlugFromAppUrl(mapping.appUrl)?.toLowerCase() === normalizedSlug) return true;
  return false;
}

export function artistMetaobjectRelevantFieldKeys() {
  return [...ARTIST_FIELD_ORDER];
}
