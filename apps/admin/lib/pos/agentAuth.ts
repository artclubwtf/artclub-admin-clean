import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { PosAgentModel } from "@/models/PosAgent";

export async function requirePosAgent(req: Request) {
  const agentKey = req.headers.get("x-pos-agent-key")?.trim();
  if (!agentKey) {
    return {
      error: NextResponse.json({ ok: false, error: "missing_agent_key" }, { status: 401 }),
      agent: null,
    };
  }

  await connectMongo();
  const agent = await PosAgentModel.findOne({ agentKey, isActive: true });
  if (!agent) {
    return {
      error: NextResponse.json({ ok: false, error: "invalid_agent_key" }, { status: 401 }),
      agent: null,
    };
  }

  return {
    error: null,
    agent,
  };
}
