"use client";

import { useEffect } from "react";

const RECOVERY_KEY = "artist_chunk_recovery_attempted";

function isChunkLoadLikeError(input: unknown) {
  if (!input) return false;

  const message =
    typeof input === "string"
      ? input
      : input instanceof Error
        ? input.message
        : typeof input === "object" && "message" in input
          ? String((input as { message?: unknown }).message || "")
          : "";

  const stackish =
    typeof input === "object" && input && "reason" in input
      ? String((input as { reason?: { message?: string } }).reason?.message || "")
      : "";

  const combined = `${message} ${stackish}`.toLowerCase();

  return (
    combined.includes("chunkloaderror") ||
    combined.includes("loading chunk") ||
    combined.includes("failed to fetch dynamically imported module") ||
    combined.includes("/_next/static/chunks/")
  );
}

function attemptRecovery() {
  if (typeof window === "undefined") return;

  const alreadyTried = window.sessionStorage.getItem(RECOVERY_KEY) === "1";
  if (alreadyTried) return;

  window.sessionStorage.setItem(RECOVERY_KEY, "1");
  window.location.reload();
}

export function ChunkLoadRecovery() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const clearAttempt = () => {
      window.setTimeout(() => {
        window.sessionStorage.removeItem(RECOVERY_KEY);
      }, 1500);
    };

    clearAttempt();

    function handleError(event: ErrorEvent) {
      if (isChunkLoadLikeError(event.error || event.message)) {
        attemptRecovery();
      }
    }

    function handleRejection(event: PromiseRejectionEvent) {
      if (isChunkLoadLikeError(event.reason)) {
        attemptRecovery();
      }
    }

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null;
}
