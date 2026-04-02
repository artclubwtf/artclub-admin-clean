import MigrationMatchingClient from "./MigrationMatchingClient";

export default function MigrationMatchingPage() {
  return (
    <main className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Migration Matching</h1>
        <p className="text-sm text-slate-600">Review imported Shopify artists and products, then confirm manual links into the canonical system.</p>
      </header>

      <MigrationMatchingClient />
    </main>
  );
}
