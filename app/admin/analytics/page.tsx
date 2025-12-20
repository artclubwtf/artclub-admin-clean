import { Suspense } from "react";
import AnalyticsPageClient from "./AnalyticsPageClient";

export default function AnalyticsPage() {
  return (
    <main className="admin-dashboard">
      <Suspense fallback={<p className="text-sm text-slate-500">Loading analytics…</p>}>
        <AnalyticsPageClient />
      </Suspense>
    </main>
  );
}
