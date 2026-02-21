import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import { PosLocationModel } from "@/models/PosLocation";
import { PosTerminalModel } from "@/models/PosTerminal";

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  await connectMongo();
  const [locations, terminals] = await Promise.all([
    PosLocationModel.find({}).sort({ name: 1 }).lean(),
    PosTerminalModel.find({}).sort({ label: 1 }).lean(),
  ]);

  return NextResponse.json(
    {
      ok: true,
      settings: {
        terminals: terminals.map((terminal) => ({
          id: terminal._id.toString(),
          locationId: terminal.locationId.toString(),
          provider: terminal.provider,
          terminalRef: terminal.terminalRef,
          name: terminal.name ?? terminal.label,
          label: terminal.label,
          host: terminal.host ?? null,
          port: typeof terminal.port === "number" ? terminal.port : 22000,
          mode: terminal.mode ?? "bridge",
          agentId: terminal.agentId ? terminal.agentId.toString() : null,
          isActive: terminal.isActive ?? true,
          status: terminal.status,
          lastSeenAt: terminal.lastSeenAt ?? null,
        })),
        locations: locations.map((location) => ({
          id: location._id.toString(),
          name: location.name,
          address: location.address,
        })),
        tax: {
          defaultRate: null,
        },
        invoiceThresholds: {
          receiptOnlyMax: null,
          invoiceRequiredFrom: null,
        },
      },
    },
    { status: 200 },
  );
}
