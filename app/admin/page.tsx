const stats = [
  { label: "Orders today", value: "\u2014" },
  { label: "Open artist payouts", value: "\u2014" },
  { label: "Artists missing contract/payout", value: "\u2014" },
];

export default function AdminDashboardPage() {
  return (
    <main className="admin-dashboard">
      <header className="space-y-1">
        <p className="text-sm text-slate-500">Overview</p>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-slate-600">Quick status cards for the admin workspace.</p>
      </header>

      <div className="admin-cards-grid">
        {stats.map((stat) => (
          <div key={stat.label} className="admin-stat-card">
            <small>{stat.label}</small>
            <strong>{stat.value}</strong>
          </div>
        ))}
      </div>

      <p className="text-sm text-slate-500">Live data wiring will follow once APIs are ready.</p>
    </main>
  );
}
