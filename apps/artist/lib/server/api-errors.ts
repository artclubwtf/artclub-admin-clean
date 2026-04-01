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

function isDatabaseWritePermissionError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("not authorized") || message.includes("unauthorized") || message.includes("permission");
}

function isDuplicateKeyError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: number }).code === 11000);
}

export function artistApiErrorResponse(error: unknown, fallbackError: string) {
  console.error(`Artist API failed: ${fallbackError}`, error);
  if (isDatabaseAvailabilityError(error)) {
    return NextResponse.json({ ok: false, error: "database_unavailable" }, { status: 503 });
  }
  if (isDatabaseWritePermissionError(error)) {
    return NextResponse.json({ ok: false, error: "database_write_forbidden" }, { status: 503 });
  }
  if (isDuplicateKeyError(error)) {
    return NextResponse.json({ ok: false, error: "duplicate_key_conflict" }, { status: 409 });
  }
  return NextResponse.json({ ok: false, error: fallbackError }, { status: 500 });
}
