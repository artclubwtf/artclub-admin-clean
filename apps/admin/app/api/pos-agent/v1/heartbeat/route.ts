import { NextResponse } from "next/server";

import { requirePosAgent } from "@/lib/pos/agentAuth";
import { PosAgentModel } from "@/models/PosAgent";

export async function POST(req: Request) {
  const { error, agent } = await requirePosAgent(req);
  if (error || !agent) return error;

  await PosAgentModel.updateOne({ _id: agent._id }, { $set: { lastSeenAt: new Date() } });
  return NextResponse.json({ ok: true, agentId: agent._id.toString() }, { status: 200 });
}
