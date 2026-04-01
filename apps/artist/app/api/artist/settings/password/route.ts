import { compare, hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireArtistApiContext } from "@/lib/server/artist-context";
import { UserModel } from "@/lib/server/models";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    nextPassword: z.string().min(8, "New password must be at least 8 characters"),
  })
  .strict();

export async function POST(req: Request) {
  const auth = await requireArtistApiContext();
  if (!auth.ok) return auth.response;
  const { context } = auth;

  const payload = (await req.json().catch(() => null)) as unknown;
  const parsed = schema.safeParse(payload || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
  }

  const user = await UserModel.findById(context.user._id);
  if (!user || !user.isActive) {
    return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });
  }

  const valid = await compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ ok: false, error: "current_password_invalid" }, { status: 400 });
  }

  user.passwordHash = await hash(parsed.data.nextPassword, 12);
  user.mustChangePassword = false;
  await user.save();

  return NextResponse.json({ ok: true }, { status: 200 });
}
