import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePosAgent } from "@/lib/pos/agentAuth";
import { PosAgentModel } from "@/models/PosAgent";
import { PosCommandModel } from "@/models/PosCommand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const waitQuerySchema = z.object({
  wait: z.coerce.number().int().min(0).max(25).default(25),
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(req: Request) {
  const { error, agent } = await requirePosAgent(req);
  if (error || !agent) return error;

  const url = new URL(req.url);
  const parsed = waitQuerySchema.safeParse({ wait: url.searchParams.get("wait") ?? "25" });
  if (!parsed.success) {
    const first = parsed.error.issues?.[0];
    return NextResponse.json({ ok: false, error: first?.message || "invalid_wait" }, { status: 400 });
  }

  const waitSeconds = parsed.data.wait;
  const deadline = Date.now() + waitSeconds * 1000;

  while (Date.now() <= deadline) {
    const command = await PosCommandModel.findOneAndUpdate(
      { agentId: agent._id, status: "queued" },
      { $set: { status: "sent" } },
      { sort: { createdAt: 1, _id: 1 }, new: true },
    ).lean();

    if (command) {
      await PosAgentModel.updateOne({ _id: agent._id }, { $set: { lastSeenAt: new Date() } });
      return NextResponse.json(
        {
          ok: true,
          command: {
            id: command._id.toString(),
            type: command.type,
            payload: command.payload ?? {},
            createdAt: command.createdAt,
          },
        },
        { status: 200 },
      );
    }

    if (waitSeconds === 0) break;
    await sleep(1000);
  }

  return new NextResponse(null, { status: 204 });
}
