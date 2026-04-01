import { NextResponse } from "next/server";
import { z } from "zod";

import { buildArtistSyncPatch } from "@/lib/server/artist-sync";
import { requireArtistApiContext } from "@/lib/server/artist-context";
import { CanonicalArtistModel } from "@/lib/server/models";

const schema = z
  .object({
    allowOriginalSales: z.boolean(),
    allowPrintSales: z.boolean(),
    allowRental: z.boolean(),
    allowExhibitions: z.boolean(),
  })
  .strict();

export async function PATCH(req: Request) {
  const auth = await requireArtistApiContext();
  if (!auth.ok) return auth.response;
  const { context } = auth;

  const payload = (await req.json().catch(() => null)) as unknown;
  const parsed = schema.safeParse(payload || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
  }

  const changedFields: string[] = [];
  if ((context.canonicalArtist.consents?.allowOriginalSales === true) !== parsed.data.allowOriginalSales) {
    changedFields.push("consents.allowOriginalSales");
  }
  if ((context.canonicalArtist.consents?.allowPrintSales === true) !== parsed.data.allowPrintSales) {
    changedFields.push("consents.allowPrintSales");
  }
  if ((context.canonicalArtist.consents?.allowRental === true) !== parsed.data.allowRental) {
    changedFields.push("consents.allowRental");
  }
  if ((context.canonicalArtist.consents?.allowExhibitions === true) !== parsed.data.allowExhibitions) {
    changedFields.push("consents.allowExhibitions");
  }

  const syncPatch = buildArtistSyncPatch({
    currentDirtyFields: context.canonicalArtist.sync?.dirtyFields,
    changedFields,
  });

  await CanonicalArtistModel.updateOne(
    { _id: context.canonicalArtist._id },
    {
      $set: {
        consents: {
          allowOriginalSales: parsed.data.allowOriginalSales,
          allowPrintSales: parsed.data.allowPrintSales,
          allowRental: parsed.data.allowRental,
          allowExhibitions: parsed.data.allowExhibitions,
          presentationOnly: false,
        },
        ...syncPatch,
      },
    },
  );

  return NextResponse.json({ ok: true }, { status: 200 });
}
