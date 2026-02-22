import { POS_SETTINGS_SCOPE, PosSettingsModel, currentSettingsEnvironment } from "@/models/PosSettings";

export type PosSettingsSnapshot = {
  brandName: string;
  logoUrl: string | null;
  seller: {
    companyName: string;
    addressLine1: string;
    addressLine2: string;
    email: string;
    phone: string;
  };
  tax: {
    steuernummer: string | null;
    ustId: string | null;
    finanzamt: string | null;
  };
  receiptFooterLines: string[];
  locale: string;
  currency: "EUR" | string;
};

function toOptional(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function mapPosSettingsDocToSnapshot(doc: {
  brandName?: string | null;
  logoUrl?: string | null;
  seller?: {
    companyName?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  tax?: {
    steuernummer?: string | null;
    ustId?: string | null;
    finanzamt?: string | null;
  } | null;
  receiptFooterLines?: Array<string | null | undefined> | null;
  locale?: string | null;
  currency?: string | null;
} | null | undefined): PosSettingsSnapshot {
  return {
    brandName: doc?.brandName?.trim() || "ARTCLUB",
    logoUrl: toOptional(doc?.logoUrl),
    seller: {
      companyName: doc?.seller?.companyName?.trim() || "Artclub Mixed Media GmbH",
      addressLine1: doc?.seller?.addressLine1?.trim() || "Friedrichsruher Straße 37",
      addressLine2: doc?.seller?.addressLine2?.trim() || "14193 Berlin",
      email: doc?.seller?.email?.trim() || "support@artclub.wtf",
      phone: doc?.seller?.phone?.trim() || "+49 176 41534464",
    },
    tax: {
      steuernummer: toOptional(doc?.tax?.steuernummer),
      ustId: toOptional(doc?.tax?.ustId),
      finanzamt: toOptional(doc?.tax?.finanzamt),
    },
    receiptFooterLines: (doc?.receiptFooterLines || [])
      .map((line) => (typeof line === "string" ? line.trim() : ""))
      .filter(Boolean),
    locale: doc?.locale?.trim() || "de-DE",
    currency: (doc?.currency?.trim()?.toUpperCase() as "EUR" | undefined) || "EUR",
  };
}

export async function getOrCreatePosSettings() {
  const environment = currentSettingsEnvironment();
  const doc = await PosSettingsModel.findOneAndUpdate(
    { scope: POS_SETTINGS_SCOPE, environment },
    { $setOnInsert: { scope: POS_SETTINGS_SCOPE, environment } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  return mapPosSettingsDocToSnapshot(doc);
}
