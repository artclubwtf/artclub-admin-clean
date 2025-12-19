"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Dashboard", href: "/admin" },
  { label: "Artists", href: "/admin/artists" },
  { label: "Orders", href: "/admin/orders" },
  { label: "Products", href: "/admin/products" },
];

export default function AdminSidebar() {
  const pathname = usePathname() || "";

  return (
    <aside className="admin-sidebar">
      <div className="admin-logo">
        <span className="admin-logo-dot" aria-hidden />
        <span>Artclub Admin</span>
      </div>

      <nav className="admin-nav">
        {navItems.map((item) => {
          const matchesExact = pathname === item.href;
          const matchesNested = pathname.startsWith(`${item.href}/`);
          const isActive = matchesExact || (item.href !== "/admin" && matchesNested);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`admin-nav-link${isActive ? " active" : ""}`}
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
