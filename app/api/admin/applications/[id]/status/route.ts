import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { ArtistApplicationModel } from "@/models/ArtistApplication";

const allowedStatuses = ["in_review", "accepted", "rejected"] as const;

type StatusPayload = {
  status?: (typeof allowedStatuses)[number];
  note?: string;
};

function isValidTransition(current: string, next: StatusPayload["status"]) {
  if (!next) return false;
  if (current === "submitted" && next === "in_review") return true;
  if (current === "in_review" && (next === "accepted" || next === "rejected")) return true;
  return false;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "team") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid application id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as StatusPayload | null;
  const status = body?.status;
  const note = body?.note?.trim() || "";

  if (!status || !allowedStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  await connectMongo();
  const application = await ArtistApplicationModel.findById(id);
  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  if (!isValidTransition(application.status, status)) {
    return NextResponse.json({ error: "Invalid status transition" }, { status: 400 });
  }

  const now = new Date();
  application.status = status;

  if (status === "in_review") {
    application.reviewedAt = application.reviewedAt || now;
    if (note) {
      application.admin = { ...application.admin, reviewerNote: note };
    }
  }

  if (status === "accepted") {
    application.acceptedAt = now;
    application.reviewedAt = application.reviewedAt || now;
    if (note) {
      application.admin = { ...application.admin, decisionNote: note };
    }
  }

  if (status === "rejected") {
    application.reviewedAt = application.reviewedAt || now;
    if (note) {
      application.admin = { ...application.admin, decisionNote: note };
    }
  }

  await application.save();

  return NextResponse.json(
    {
      application: {
        id: application._id.toString(),
        status: application.status,
        reviewedAt: application.reviewedAt,
        acceptedAt: application.acceptedAt,
        admin: application.admin || {},
      },
    },
    { status: 200 },
  );
}
