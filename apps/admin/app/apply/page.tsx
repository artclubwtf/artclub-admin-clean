import Link from "next/link";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function ApplyPage() {
  return (
    <main className="ac-shell">
      <section className="ac-card" style={{ maxWidth: 720, margin: "40px auto" }}>
        <h1 className="text-2xl font-semibold text-slate-900">Artist onboarding migrated</h1>
        <p className="mt-2 text-sm text-slate-600">
          Applications now run through the new artist workspace. Use a registration key to create an artist account.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/artists/register" className="btnPrimary">
            Open artist registration
          </Link>
          <Link href="/artists/login" className="btnGhost">
            Artist login
          </Link>
        </div>
      </section>
    </main>
  );
}
