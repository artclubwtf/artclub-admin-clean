import { mobilePushTokenInputSchema } from "@artclub/models";

import { mobileError, mobileNetworkContext } from "@/lib/mobileNetwork";
import { MobilePushTokenModel } from "@/models/Network";

export async function POST(req: Request) {
  const auth = await mobileNetworkContext(req); if (!auth.ok) return auth.response;
  const parsed = mobilePushTokenInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return mobileError("invalid_push_token", 400, parsed.error.flatten());
  const record = await MobilePushTokenModel.findOneAndUpdate(
    { userId: auth.user._id, deviceId: parsed.data.deviceId },
    { $set: { ...parsed.data, userId: auth.user._id, profileId: auth.profile!._id, enabled: true, lastRegisteredAt: new Date() } },
    { upsert: true, new: true },
  );
  return Response.json({ ok: true, registered: Boolean(record) }, { status: 201 });
}

export async function DELETE(req: Request) {
  const auth = await mobileNetworkContext(req); if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null) as { deviceId?: string } | null;
  if (!body?.deviceId) return mobileError("device_id_required");
  await MobilePushTokenModel.updateMany({ userId: auth.user._id, deviceId: body.deviceId }, { $set: { enabled: false } });
  return Response.json({ ok: true });
}
