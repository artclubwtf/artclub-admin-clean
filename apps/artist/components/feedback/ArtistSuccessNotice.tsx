"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { StatusMessage } from "@/components/forms/StatusMessage";
import {
  ARTIST_SUCCESS_NOTICE_EVENT,
  ARTIST_SUCCESS_NOTICE_STORAGE_KEY,
  buildArtistSuccessNotice,
  type ArtistSuccessNoticePayload,
  type ArtistSuccessNoticeVariant,
} from "@/lib/artist-success-notice";

type ArtistSuccessNoticeEventDetail = {
  detail?: ArtistSuccessNoticePayload;
};

function readStoredNotice() {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(ARTIST_SUCCESS_NOTICE_STORAGE_KEY);
  if (!raw) return null;
  window.sessionStorage.removeItem(ARTIST_SUCCESS_NOTICE_STORAGE_KEY);
  try {
    return JSON.parse(raw) as ArtistSuccessNoticePayload;
  } catch {
    return null;
  }
}

export function useArtistSuccessNotice() {
  return {
    showSuccessNotice(variant: ArtistSuccessNoticeVariant = "default", options?: { persist?: boolean }) {
      if (typeof window === "undefined") return;
      const payload = buildArtistSuccessNotice(variant);
      if (options?.persist) {
        window.sessionStorage.setItem(ARTIST_SUCCESS_NOTICE_STORAGE_KEY, JSON.stringify(payload));
      } else {
        window.sessionStorage.removeItem(ARTIST_SUCCESS_NOTICE_STORAGE_KEY);
      }
      window.dispatchEvent(new CustomEvent(ARTIST_SUCCESS_NOTICE_EVENT, { detail: payload }));
    },
  };
}

export function ArtistSuccessNotice() {
  const pathname = usePathname();
  const [notice, setNotice] = useState<ArtistSuccessNoticePayload | null>(null);

  useEffect(() => {
    const stored = readStoredNotice();
    if (stored) setNotice(stored);

    function handleNotice(event: Event) {
      const payload = (event as ArtistSuccessNoticeEventDetail).detail;
      if (payload) setNotice(payload);
    }

    window.addEventListener(ARTIST_SUCCESS_NOTICE_EVENT, handleNotice);
    return () => window.removeEventListener(ARTIST_SUCCESS_NOTICE_EVENT, handleNotice);
  }, [pathname]);

  useEffect(() => {
    if (!notice) return;
    const timeoutId = window.setTimeout(() => setNotice(null), 8000);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  if (!notice) return null;

  return (
    <div className="px-5 pt-5 sm:px-8">
      <StatusMessage tone="success">{`${notice.title} ${notice.message}`}</StatusMessage>
    </div>
  );
}
