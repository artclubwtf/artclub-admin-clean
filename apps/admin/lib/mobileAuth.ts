import { createHash, randomBytes } from "crypto";

import { connectMongo } from "@/lib/mongodb";
import { MobileSessionModel } from "@/models/MobileSession";
import { UserModel } from "@/models/User";

export type MobileUserPayload = {
  id: string;
  email: string;
  name?: string;
};

export const MOBILE_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!header) return null;
  const [scheme, value] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer") return null;
  if (!value) return null;
  return value.trim();
}

export async function createMobileSession(userId: string) {
  await connectMongo();
  const expiresAt = new Date(Date.now() + MOBILE_SESSION_TTL_MS);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    try {
      await MobileSessionModel.create({ userId, tokenHash, expiresAt });
      return { token, expiresAt };
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && (err as { code?: number }).code === 11000) {
        continue;
      }
      throw err;
    }
  }

  throw new Error("Failed to create mobile session");
}

export async function getMobileUserByToken(token: string): Promise<MobileUserPayload | null> {
  if (!token) return null;
  await connectMongo();

  const tokenHash = hashToken(token);
  const session = await MobileSessionModel.findOne({ tokenHash }).lean();
  if (!session) return null;
  if (session.expiresAt && session.expiresAt.getTime() <= Date.now()) {
    await MobileSessionModel.deleteOne({ _id: session._id });
    return null;
  }

  const user = await UserModel.findById(session.userId).lean();
  if (!user || !user.isActive || user.role !== "customer") return null;

  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name ?? undefined,
  };
}

export async function getMobileUserFromRequest(req: Request): Promise<MobileUserPayload | null> {
  const token = extractBearerToken(req);
  if (!token) return null;
  return getMobileUserByToken(token);
}
