import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import { PosAgentModel } from "@/models/PosAgent";

const registerSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  locationLabel: z.string().trim().optional(),
  pairedTerminalId: z.string().trim().optional(),
});

function createAgentKey() {
  return `pa_${randomBytes(24).toString("hex")}`;
}

export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues?.[0];
    return NextResponse.json({ ok: false, error: first?.message || "invalid_payload" }, { status: 400 });
  }

  let pairedTerminalId: Types.ObjectId | undefined;
  if (parsed.data.pairedTerminalId) {
    if (!Types.ObjectId.isValid(parsed.data.pairedTerminalId)) {
      return NextResponse.json({ ok: false, error: "invalid_pairedTerminalId" }, { status: 400 });
    }
    pairedTerminalId = new Types.ObjectId(parsed.data.pairedTerminalId);
  }

  try {
    await connectMongo();

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const agentKey = createAgentKey();
      try {
        const created = await PosAgentModel.create({
          name: parsed.data.name,
          agentKey,
          locationLabel: parsed.data.locationLabel?.trim() || undefined,
          pairedTerminalId,
          isActive: true,
        });
        return NextResponse.json(
          {
            ok: true,
            agentId: created._id.toString(),
            agentKey: created.agentKey,
          },
          { status: 200 },
        );
      } catch (error) {
        const maybeDup = error as { code?: number };
        if (maybeDup?.code === 11000) {
          continue;
        }
        throw error;
      }
    }

    return NextResponse.json({ ok: false, error: "failed_to_generate_unique_agent_key" }, { status: 500 });
  } catch (error) {
    console.error("Failed to register POS agent", error);
    const message = error instanceof Error ? error.message : "agent_register_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
