import Link from "next/link";

import ConceptsListClient from "./ConceptsListClient";

export default function ConceptsPage() {
  return (
    <main className="p-6 space-y-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Concepts</h1>
          <p className="text-sm text-slate-600">Manage client proposal concepts.</p>
        </div>
        <Link href="/admin/concepts/new" className="inline-flex items-center rounded bg-black px-4 py-2 text-sm font-medium text-white">
          New Concept
        </Link>
      </header>

      <ConceptsListClient />
    </main>
  );
}
