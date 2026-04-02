export const canonicalStatusValues = [
  "imported_unlinked",
  "imported_unmapped",
  "suggested",
  "linked",
  "needs_review",
  "approved",
  "published",
  "archived",
] as const;

export type CanonicalStatusValue = (typeof canonicalStatusValues)[number];
