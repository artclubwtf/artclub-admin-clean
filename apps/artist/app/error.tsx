"use client";

import { useEffect } from "react";

import { Button } from "@/components/primitives/Button";

const RECOVERY_KEY = "artist_chunk_recovery_attempted";

function isChunkLoadLikeError(error: Error & { digest?: string }) {
  const combined = `${error?.name || ""} ${error?.message || ""} ${error?.digest || ""}`.toLowerCase();
  return (
    combined.includes("chunkloaderror") ||
    combined.includes("loading chunk") ||
    combined.includes("failed to fetch dynamically imported module") ||
    combined.includes("/_next/static/chunks/")
  );
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const chunkLoadError = isChunkLoadLikeError(error);

  useEffect(() => {
    if (typeof window === "undefined" || !chunkLoadError) return;

    const alreadyTried = window.sessionStorage.getItem(RECOVERY_KEY) === "1";
    if (alreadyTried) return;

    window.sessionStorage.setItem(RECOVERY_KEY, "1");
    window.setTimeout(() => {
      window.location.reload();
    }, 120);
  }, [chunkLoadError]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="max-w-md space-y-4 text-center">
        <div className="text-[11px] uppercase tracking-[0.22em] text-neutral-400">ARTCLUB for Artists</div>
        <h1 className="text-2xl font-semibold tracking-[-0.04em] text-neutral-950">
          {chunkLoadError ? "Refreshing to load the latest version" : "Something went wrong"}
        </h1>
        <p className="text-sm leading-6 text-neutral-500">
          {chunkLoadError
            ? "A new deployment is likely available. Reloading usually resolves this immediately."
            : "Please try again or reload the page."}
        </p>
        <div className="flex justify-center gap-3">
          <Button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.sessionStorage.removeItem(RECOVERY_KEY);
                window.location.reload();
              }
            }}
          >
            Reload
          </Button>
          {!chunkLoadError ? (
            <Button type="button" tone="ghost" onClick={reset}>
              Try again
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
