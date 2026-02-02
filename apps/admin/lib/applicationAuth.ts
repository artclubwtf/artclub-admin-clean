import { createHash, randomBytes, timingSafeEqual } from "crypto";

const APPLICATION_TOKEN_BYTES = 32;

function hashApplicationToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createApplicationToken() {
  const token = randomBytes(APPLICATION_TOKEN_BYTES).toString("hex");
  return { token, hash: hashApplicationToken(token) };
}

export function verifyApplicationToken(token: string, expectedHash: string) {
  if (!token || !expectedHash) return false;
  const digest = hashApplicationToken(token);
  if (digest.length !== expectedHash.length) return false;
  return timingSafeEqual(Buffer.from(digest, "utf8"), Buffer.from(expectedHash, "utf8"));
}

export function getApplicationTokenFromRequest(req: Request) {
  const headerToken = req.headers.get("x-application-token");
  if (headerToken && headerToken.trim()) return headerToken.trim();
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    return token && token.trim() ? token.trim() : null;
  } catch {
    return null;
  }
}
