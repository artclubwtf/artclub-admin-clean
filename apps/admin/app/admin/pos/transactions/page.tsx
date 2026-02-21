export default function AdminPosTransactionsPage() {
  return (
    <main className="admin-dashboard">
      <header className="space-y-1">
        <p className="text-sm text-slate-500">POS</p>
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <p className="text-sm text-slate-600">Review POS transaction history.</p>
      </header>

      <section className="card">
        <div className="cardHeader">
          <strong>History</strong>
        </div>
        <p className="text-sm text-slate-600">Transaction records will appear here.</p>
      </section>
    </main>
  );
}
