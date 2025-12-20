import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { PayoutDetailsModel } from "@/models/PayoutDetails";
import { RequestModel, requestStatuses } from "@/models/Request";

type ActionPayload = {
  action?: "approve" | "reject";
  note?: string;
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "team") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid request id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as ActionPayload | null;
  const action = body?.action;
  const note = body?.note?.toString();

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  await connectMongo();
  const request = await RequestModel.findById(id);
  if (!request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  let nextStatus: (typeof requestStatuses)[number] = action === "approve" ? "approved" : "rejected";

  if (action === "approve" && request.type === "payout_update") {
    const payoutPayload = (request.payload as { payout?: Record<string, unknown> } | null)?.payout || {};
    await PayoutDetailsModel.findOneAndUpdate(
      { kunstlerId: request.artistId?.toString() },
      {
        $set: {
          kunstlerId: request.artistId?.toString(),
          accountHolder: payoutPayload.accountHolder ?? null,
          iban: payoutPayload.iban ?? null,
          bic: payoutPayload.bic ?? null,
          bankName: payoutPayload.bankName ?? null,
          address: payoutPayload.address ?? null,
          taxId: payoutPayload.taxId ?? null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    nextStatus = "applied";
    request.appliedAt = new Date();
  }

  request.status = nextStatus;
  request.reviewerUserId = new Types.ObjectId(session.user.id);
  request.reviewerNote = note;
  await request.save();

  return NextResponse.json(
    {
      request: {
        id: request._id.toString(),
        status: request.status,
        appliedAt: request.appliedAt,
        reviewerNote: request.reviewerNote,
      },
    },
    { status: 200 },
  );
}
