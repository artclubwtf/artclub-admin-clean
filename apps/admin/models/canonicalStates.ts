export const canonicalStatusValues = [
  "unlinked",
  "suggested",
  "unassigned",
  "assigned",
  "imported_unlinked",
  "imported_unmapped",
  "linked",
  "needs_review",
  "approved",
  "published",
  "archived",
] as const;

export type CanonicalStatusValue = (typeof canonicalStatusValues)[number];
