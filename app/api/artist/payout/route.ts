import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { PayoutDetailsModel } from "@/models/PayoutDetails";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "artist" || !session.user.artistId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectMongo();
  const payout = await PayoutDetailsModel.findOne({ kunstlerId: session.user.artistId }).lean();

  if (!payout) {
    return NextResponse.json({ payout: null }, { status: 200 });
  }

  return NextResponse.json(
    {
      payout: {
        accountHolder: payout.accountHolder,
        iban: payout.iban,
        bic: payout.bic,
        bankName: payout.bankName,
        address: payout.address,
        taxId: payout.taxId,
        createdAt: payout.createdAt,
        updatedAt: payout.updatedAt,
      },
    },
    { status: 200 },
  );
}
