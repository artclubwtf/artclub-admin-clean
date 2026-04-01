"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

type ArtistTopbarClientProps = {
  avatarUrl: string;
  displayName: string;
  handle: string;
  hasUnreadMessages: boolean;
};

function getInitials(input: string) {
  const words = input
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!words.length) return "A";
  return words.map((word) => word[0]?.toUpperCase() || "").join("");
}

export function ArtistTopbarClient({ avatarUrl, displayName, handle, hasUnreadMessages }: ArtistTopbarClientProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");
  const menuRef = useRef<HTMLDivElement | null>(null);
  const publicPath = `/artist/${encodeURIComponent(handle)}`;

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  async function handleShare() {
    const absoluteUrl = typeof window !== "undefined" ? `${window.location.origin}${publicPath}` : publicPath;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(absoluteUrl);
        setShareState("copied");
        setMenuOpen(false);
        window.setTimeout(() => setShareState("idle"), 1800);
        return;
      }
    } catch {}

    window.open(absoluteUrl, "_blank", "noopener,noreferrer");
    setMenuOpen(false);
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => router.push("/messages")}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-transparent text-neutral-500 transition-colors hover:text-neutral-950"
        aria-label="Messages"
      >
        <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" fill="none" aria-hidden>
          <path
            d="M5 7.75A2.75 2.75 0 0 1 7.75 5h8.5A2.75 2.75 0 0 1 19 7.75v5.5A2.75 2.75 0 0 1 16.25 16H10l-4 3v-3H7.75A2.75 2.75 0 0 1 5 13.25v-5.5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="M8.5 9.75h7M8.5 12.75h5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        {hasUnreadMessages ? <span className="absolute right-[7px] top-[7px] h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden /> : null}
      </button>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((current) => !current)}
          className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-xs font-semibold tracking-[0.02em] text-neutral-700"
          aria-label="Open profile menu"
          aria-expanded={menuOpen}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
          ) : (
            <span>{getInitials(displayName)}</span>
          )}
        </button>

        {menuOpen ? (
          <div className="absolute right-0 top-[calc(100%+0.6rem)] z-50 w-56 rounded-[1.2rem] bg-neutral-50 p-3">
            <div className="space-y-1">
              <Link
                href="/profile"
                onClick={() => setMenuOpen(false)}
                className="block rounded-[0.9rem] px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-700"
              >
                View / Edit Profile
              </Link>
              <div className="h-px bg-neutral-300" />
              <button
                type="button"
                onClick={() => void handleShare()}
                className="block w-full rounded-[0.9rem] px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-700"
              >
                {shareState === "copied" ? "Copied Public URL" : "Share Profile"}
              </button>
              <div className="h-px bg-neutral-300" />
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="block rounded-[0.9rem] px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-700"
              >
                Settings
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
