import { createHash } from "crypto";

import { TermsDocumentModel, TermsVersionModel } from "@/lib/server/models";

export type ActiveTermsModule = {
  document: {
    id: string;
    slug: string;
    key: string;
    title: string;
    isActive: boolean;
  };
  version: {
    id: string;
    documentSlug: string;
    version: number;
    bodyMarkdown: string;
    effectiveAt: Date | null | undefined;
    createdAt: Date | null | undefined;
    status: "draft" | "published" | "archived";
  };
};

const defaultTermsTitles: Record<string, string> = {
  artist_registration_terms: "Artist registration terms",
};

const defaultTermsContent: Record<
  string,
  {
    summaryMarkdown: string;
    fullMarkdown: string;
  }
> = {
  artist_registration_terms: {
    summaryMarkdown: [
      "**Summary**",
      "- Choose how you want to participate: exhibit at events, sell originals, sell prints (license rights), rent originals, or present only.",
      "- Fees: ARTCLUB platform fee 30% on originals sold via the platform; Artist license fee 30% on sold prints for usage/rights.",
      "- You keep ownership of your works; we use your content to market ARTCLUB and your profile.",
      "- Payouts are processed after buyer payment clears.",
      "- Re-registration after rejection: 6 months.",
    ].join("\n"),
    fullMarkdown: [
      "# Artist Registration Terms",
      "",
      "## 1. Intent & participation options",
      "When you apply, you can select how you want to work with ARTCLUB. These preferences guide our collaboration:",
      "- **Exhibit at events**: You want to show your work at ARTCLUB events or pop-ups.",
      "- **Sell originals**: You want to sell original works through the platform.",
      "- **Sell prints (license rights)**: You allow ARTCLUB to sell prints and use your work for print production under a license.",
      "- **Rent originals**: You want to rent original works for short-term display.",
      "- **Present only**: You want visibility and presentation without sales or rentals.",
      "",
      "## 2. Fees & commissions",
      "- **ARTCLUB platform fee: 30% on originals sold via the platform.**",
      "- **Artist license fee: 30% on sold prints for usage/rights.**",
      "",
      "## 3. How payouts work",
      "Payouts are processed after buyer payment clears and any applicable return window has ended. Fees are deducted before payout.",
      "",
      "## 4. Rights & usage",
      "You keep ownership of your works. You grant ARTCLUB a non-exclusive license to display and market your works and profile on the platform and in promotional materials. If you opt into print licensing, you grant ARTCLUB rights necessary to produce and sell prints under your selected terms.",
      "",
      "## 5. Termination / removal",
      "Either party may end participation at any time. ARTCLUB may remove content that violates policies or legal requirements. Active orders and obligations will be honored before removal is finalized.",
      "",
      "## 6. Re-registration after rejection",
      "If your application is rejected, you may re-register after 6 months.",
      "",
      "## 7. Updates",
      "We may update these terms from time to time. New versions apply only after you accept them.",
    ].join("\n"),
  },
};

export function defaultTermsTitleForKey(key: string) {
  return defaultTermsTitles[key] || key.replace(/_/g, " ").trim();
}

export function normalizeTermsSlug(value: string) {
  return value.trim().toLowerCase();
}

export async function ensureTermsDocument(keyOrSlug: string) {
  const slug = normalizeTermsSlug(keyOrSlug);
  const title = defaultTermsTitleForKey(slug);
  let document = await TermsDocumentModel.findOne({ $or: [{ slug }, { key: slug }] });
  if (!document) {
    document = await TermsDocumentModel.create({ slug, key: slug, title, isActive: true });
  } else if (!document.slug || document.slug !== slug || document.key !== slug) {
    document.slug = slug;
    document.key = slug;
    if (!document.title) document.title = title;
    await document.save();
  }

  const defaultContent = defaultTermsContent[slug];
  if (defaultContent) {
    const existingVersion = await TermsVersionModel.findOne({ documentId: document._id }).lean();
    if (!existingVersion) {
      const now = new Date();
      const created = await TermsVersionModel.create({
        documentId: document._id,
        documentSlug: slug,
        version: 1,
        status: "published",
        effectiveAt: now,
        bodyMarkdown: defaultContent.fullMarkdown,
        content: {
          summaryMarkdown: defaultContent.summaryMarkdown,
          fullMarkdown: defaultContent.fullMarkdown,
          blocks: [],
        },
        changelog: "Initial version",
      });
      document.activeVersionId = created._id;
      await document.save();
    }
  }

  if (!document.activeVersionId) {
    const latestPublished = await TermsVersionModel.findOne({ documentId: document._id, status: "published" })
      .sort({ version: -1 })
      .lean();
    if (latestPublished) {
      document.activeVersionId = latestPublished._id;
      await document.save();
    }
  }

  return document;
}

export async function loadActiveTermsModules(): Promise<ActiveTermsModule[]> {
  const documents = await TermsDocumentModel.find({ isActive: true }).sort({ slug: 1 }).lean();
  if (!documents.length) return [];

  const activeVersionIds = documents.map((doc) => doc.activeVersionId).filter(Boolean);
  const versions = activeVersionIds.length ? await TermsVersionModel.find({ _id: { $in: activeVersionIds } }).lean() : [];
  const versionMap = new Map(versions.map((version) => [version._id.toString(), version]));

  const mapped = documents
    .map((document) => {
      const activeVersion = document.activeVersionId ? versionMap.get(document.activeVersionId.toString()) : null;
      if (!activeVersion) return null;
      return {
        document: {
          id: document._id.toString(),
          slug: document.slug || document.key,
          key: document.key,
          title: document.title,
          isActive: document.isActive !== false,
        },
        version: {
          id: activeVersion._id.toString(),
          documentSlug: activeVersion.documentSlug || document.slug || document.key,
          version: activeVersion.version,
          bodyMarkdown: activeVersion.bodyMarkdown || activeVersion.content?.fullMarkdown || "",
          effectiveAt: activeVersion.effectiveAt,
          createdAt: activeVersion.createdAt,
          status: activeVersion.status,
        },
      };
    })
    .filter((item) => item !== null);

  return mapped as ActiveTermsModule[];
}

export function buildTermsSnapshotHash(bodyMarkdown: string) {
  return createHash("sha256").update(bodyMarkdown || "").digest("hex");
}
