import { NextResponse } from "next/server";

function getErrorMessage(error: unknown) {
  if (!error) return "";
  if (error instanceof Error) return error.message;
  return String(error);
}

export function isDatabaseAvailabilityError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("missing mongodb_uri") ||
    message.includes("querysrv") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("server selection") ||
    message.includes("timed out")
  );
}

export function artistApiErrorResponse(error: unknown, fallbackError: string) {
  console.error(`Artist API failed: ${fallbackError}`, error);
  if (isDatabaseAvailabilityError(error)) {
    return NextResponse.json({ ok: false, error: "database_unavailable" }, { status: 503 });
  }
  return NextResponse.json({ ok: false, error: fallbackError }, { status: 500 });
}
