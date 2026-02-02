import { TermsDocumentModel } from "@/models/TermsDocument";

const defaultTermsTitles: Record<string, string> = {
  artist_registration_terms: "Artist registration terms",
};

export function defaultTermsTitleForKey(key: string) {
  return defaultTermsTitles[key] || key.replace(/_/g, " ").trim();
}

export async function ensureTermsDocument(key: string) {
  const title = defaultTermsTitleForKey(key);
  return TermsDocumentModel.findOneAndUpdate(
    { key },
    { $setOnInsert: { key, title } },
    { new: true, upsert: true },
  );
}
