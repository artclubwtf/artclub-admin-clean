"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";

const navItems = [
  { label: "Sales", href: "/admin/pos" },
  { label: "Transactions", href: "/admin/pos/transactions" },
  { label: "Settings", href: "/admin/pos/settings" },
];

function PosSidebar() {
  const pathname = usePathname() || "";

  return (
    <aside className="w-full rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm backdrop-blur md:sticky md:top-5 md:h-fit md:w-[220px]">
      <div className="mb-3 flex items-center gap-2 px-2 py-1">
        <span className="h-2.5 w-2.5 rounded-full bg-slate-900" aria-hidden />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Artclub</p>
          <p className="text-sm font-semibold text-slate-900">POS</p>
        </div>
      </div>

      <nav className="flex flex-row gap-2 overflow-x-auto md:flex-col md:overflow-visible">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                isActive
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export default function PosLayout({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.body.classList.add("ac-pos-route");
    return () => {
      document.body.classList.remove("ac-pos-route");
    };
  }, []);

  return (
    <>
      <div className="ac-pos-layout mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-3 py-3 md:px-4 md:py-4">
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">ARTCLUB POS</p>
            <p className="text-sm text-slate-700">Cashier workspace</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
            POS mode
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)] md:items-start">
          <PosSidebar />
          <div className="min-w-0">{children}</div>
        </div>
      </div>

      <style jsx global>{`
        body.ac-pos-route .admin-sidebar {
          display: none !important;
        }
        body.ac-pos-route .admin-main {
          margin-left: 0 !important;
          padding: 0 !important;
        }
        body.ac-pos-route .admin-content {
          max-width: none !important;
          margin: 0 !important;
        }
      `}</style>
    </>
  );
}
