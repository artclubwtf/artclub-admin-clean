"use client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const LAST_APPLICATION_KEY = "ac_application_last_id";

function ApplySuccessContent() {
  const searchParams = useSearchParams();
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const queryApplicationId = searchParams.get("applicationId");
    const queryToken = searchParams.get("token");

    let resolvedId = queryApplicationId;
    let resolvedToken = queryToken;

    if (!resolvedId) {
      resolvedId = localStorage.getItem(LAST_APPLICATION_KEY);
    }
    if (!resolvedToken && resolvedId) {
      resolvedToken = localStorage.getItem(resolvedId);
    }

    if (queryApplicationId && queryToken) {
      try {
        localStorage.setItem(queryApplicationId, queryToken);
        localStorage.setItem(LAST_APPLICATION_KEY, queryApplicationId);
      } catch (err) {
        console.warn("Failed to persist application token", err);
      }
    }

    setApplicationId(resolvedId);
    setToken(resolvedToken);
    setLoading(false);
  }, [searchParams]);

  const dashboardUrl =
    applicationId && token
      ? `/apply/dashboard?applicationId=${encodeURIComponent(applicationId)}&token=${encodeURIComponent(token)}`
      : null;

  return (
    <div className="ac-shell">
      <div className="ac-card" style={{ maxWidth: 640, margin: "40px auto" }}>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Application</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Application submitted</h1>
        <p className="mt-2 text-sm text-slate-600">
          Thank you for applying. Save your dashboard link so you can return without creating an account.
        </p>

        {loading ? (
          <p className="mt-6 text-sm text-slate-600">Loading your link...</p>
        ) : dashboardUrl ? (
          <div className="mt-6 space-y-3">
            <Link href={dashboardUrl} className="btnPrimary">
              Open light dashboard
            </Link>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <div className="font-semibold text-slate-700">Save this link</div>
              <div className="mt-1 break-all">{dashboardUrl}</div>
            </div>
          </div>
        ) : (
          <p className="mt-6 text-sm text-slate-600">We could not find your dashboard link. Please contact support.</p>
        )}
      </div>
    </div>
  );
}

export default function ApplySuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="ac-shell">
          <div className="ac-card" style={{ maxWidth: 640, margin: "40px auto" }}>
            <p className="text-sm text-slate-600">Loading your link...</p>
          </div>
        </div>
      }
    >
      <ApplySuccessContent />
    </Suspense>
  );
}
