import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";

import { connectMongo } from "@/lib/mongodb";
import { ConceptModel } from "@/models/Concept";
import { BrandSettingsModel } from "@/models/BrandSettings";

type Target = "proposal" | "email";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function buildLocalProposal(concept: any, brand: any) {
  const lines: string[] = [];
  lines.push(`# ${concept.title || "Concept"}`);
  if (brand?.about) {
    lines.push("", "## About", brand.about);
  }
  if (brand?.defaultOfferBullets?.length) {
    lines.push("", "## Brand Notes", ...(brand.defaultOfferBullets as string[]));
  }

  lines.push("", "## Sections");
  if (concept.sections?.goalContext) lines.push(`- **Goal / Context:** ${concept.sections.goalContext}`);
  if (concept.sections?.targetAudience) lines.push(`- **Target Audience:** ${concept.sections.targetAudience}`);
  if (concept.sections?.narrative) lines.push(`- **Narrative:** ${concept.sections.narrative}`);
  if (concept.sections?.kpis) lines.push(`- **KPIs:** ${concept.sections.kpis}`);
  if (concept.sections?.legal) lines.push(`- **Legal:** ${concept.sections.legal}`);

  lines.push("", "## Included Artists");
  if (concept.references?.artists?.length) {
    for (const a of concept.references.artists) {
      lines.push(`- ${a.label || a.id} (${a.source})`);
    }
  } else {
    lines.push("- None");
  }

  lines.push("", "## Included Artworks");
  if (concept.references?.artworks?.length) {
    for (const a of concept.references.artworks) {
      lines.push(`- ${a.label || a.productId}`);
    }
  } else {
    lines.push("- None");
  }

  lines.push("", "## Assets");
  if (concept.assets?.length) {
    for (const asset of concept.assets) {
      const label = asset.label || asset.url || asset.id || asset.kind;
      lines.push(`- ${label}${asset.url ? ` (${asset.url})` : ""}`);
    }
  } else {
    lines.push("- None");
  }

  return lines.join("\n");
}

function buildLocalEmail(concept: any) {
  const summaryParts = [
    concept.sections?.goalContext ? `Goal: ${concept.sections.goalContext}` : null,
    concept.sections?.targetAudience ? `Audience: ${concept.sections.targetAudience}` : null,
    concept.sections?.kpis ? `KPIs: ${concept.sections.kpis}` : null,
    concept.references?.artists?.length
      ? `Artists: ${concept.references.artists.map((a: any) => a.label || a.id).join(", ")}`
      : null,
  ].filter(Boolean);

  const subject = `${concept.title || "New Concept"} - ${concept.brandKey || ""}`.trim();
  const lines = [
    `Subject: ${subject}`,
    "",
    "Hi team,",
    "",
    `Here's the latest concept draft for ${concept.brandKey || "the brand"}.`,
    "",
    "Summary:",
    summaryParts.length ? summaryParts.map((s) => `- ${s}`).join("\n") : "- Draft in progress",
    "",
    "Preview assets:",
    concept.assets?.length ? concept.assets.map((a: any) => `- ${a.label || a.url || a.id || a.kind}`).join("\n") : "- None yet",
    "",
    "CTA: Can you review and share feedback by EOD?",
    "",
    "Thanks,",
  ];
  return lines.join("\n");
}

async function callOpenAI(prompt: string, target: Target, key: string, model: string) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a concise marketing copywriter. When asked for proposal, respond in markdown. When asked for email, respond as plain text ready to send. Keep it direct and client-ready.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.5,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `OpenAI request failed with ${res.status}`);
  }

  const json = (await res.json().catch(() => null)) as any;
  const text = json?.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") {
    throw new Error("OpenAI response missing content");
  }
  return text.trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { conceptId?: string; target?: Target } | null;
    const conceptId = body?.conceptId;
    const target = body?.target;

    if (!conceptId || typeof conceptId !== "string" || !Types.ObjectId.isValid(conceptId)) {
      return badRequest("Invalid conceptId");
    }
    if (target !== "proposal" && target !== "email") {
      return badRequest("Invalid target");
    }

    await connectMongo();
    const concept = await ConceptModel.findById(conceptId).lean();
    if (!concept) {
      return NextResponse.json({ error: "Concept not found" }, { status: 404 });
    }
    const brand = await BrandSettingsModel.findOne({ key: concept.brandKey }).lean();

    const previousDraft = target === "proposal" ? concept.exports?.proposalMarkdown : concept.exports?.emailDraftText;
    const brandTone = brand?.tone || "";
    const promptParts = [
      `Target: ${target === "proposal" ? "proposal-markdown" : "email-text"}`,
      `Brand key: ${concept.brandKey}`,
      brandTone ? `Brand tone: ${brandTone}` : null,
      brand?.about ? `Brand about: ${brand.about}` : null,
      brand?.defaultOfferBullets?.length ? `Brand bullets: ${brand.defaultOfferBullets.join(" | ")}` : null,
      `Concept title: ${concept.title}`,
      `Type: ${concept.type}`,
      `Granularity: ${concept.granularity}`,
      concept.sections ? `Sections: ${JSON.stringify(concept.sections)}` : null,
      concept.references ? `References: ${JSON.stringify(concept.references)}` : null,
      concept.assets ? `Assets: ${JSON.stringify(concept.assets)}` : null,
      previousDraft ? `Previous draft (baseline): ${previousDraft}` : null,
      "Write a polished, concise output. Keep formatting clean.",
    ]
      .filter(Boolean)
      .join("\n");

    const openaiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    let provider: "local" | "openai" = "local";
    let text: string;

    if (openaiKey) {
      try {
        text = await callOpenAI(promptParts, target, openaiKey, model);
        provider = "openai";
      } catch (err) {
        console.error("OpenAI generation failed, falling back to local", err);
        text = target === "proposal" ? buildLocalProposal(concept, brand) : buildLocalEmail(concept);
        provider = "local";
      }
    } else {
      text = target === "proposal" ? buildLocalProposal(concept, brand) : buildLocalEmail(concept);
      provider = "local";
    }

    const nowIso = new Date().toISOString();
    const update: Record<string, unknown> =
      target === "proposal"
        ? { "exports.proposalMarkdown": text, "exports.provider": provider, "exports.lastGeneratedAt": nowIso }
        : { "exports.emailDraftText": text, "exports.provider": provider, "exports.lastGeneratedAt": nowIso };
    await ConceptModel.updateOne({ _id: conceptId }, { $set: update });

    return NextResponse.json({ ok: true, provider, text }, { status: 200 });
  } catch (err) {
    console.error("Failed to generate export", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
