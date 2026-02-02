"use client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { useEffect, useMemo, useState } from "react";
import { getSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type CustomerUser = {
  id: string;
  email: string;
  name?: string;
  shopDomain?: string;
  shopifyCustomerGid?: string | null;
};

type MePayload = { user?: CustomerUser; error?: string };

export default function AccountHomePage() {
  const router = useRouter();
  const [user, setUser] = useState<CustomerUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const session = await getSession();
        if (session?.user?.role === "team") {
          router.replace("/admin");
          return;
        }
        if (session?.user?.role === "artist") {
          router.replace("/artist");
          return;
        }

        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const payload = (await res.json().catch(() => null)) as MePayload | null;
        if (!res.ok) {
          router.replace("/account/login");
          return;
        }
        if (!payload?.user) {
          router.replace("/account/login");
          return;
        }
        if (active) {
          setUser(payload.user);
        }
      } catch (err: any) {
        console.error("Failed to load account", err);
        if (active) setError(err?.message ?? "Failed to load account");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [router]);

  const initials = useMemo(() => {
    if (!user?.name) return "A";
    return user.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("");
  }, [user?.name]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (err) {
      console.error("Failed to logout", err);
    } finally {
      router.replace("/account/login");
    }
  };

  if (loading) {
    return (
      <div className="ac-shell">
        <div className="ac-card" style={{ maxWidth: 520, margin: "40px auto" }}>
          <div className="text-sm text-slate-500">Loading your account...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ac-shell">
        <div className="ac-card" style={{ maxWidth: 520, margin: "40px auto" }}>
          <div className="text-sm text-red-600">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page space-y-4">
      <div className="ac-card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold uppercase text-white">
            {initials}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Account</p>
            <h1 className="mt-1 text-xl font-semibold text-slate-900">Welcome{user?.name ? `, ${user.name}` : ""}</h1>
            <p className="text-sm text-slate-600">{user?.email}</p>
          </div>
        </div>
        <button className="btnGhost" onClick={handleLogout} disabled={loggingOut}>
          {loggingOut ? "Signing out..." : "Sign out"}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="ac-card space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Wishlist</p>
          <h2 className="text-lg font-semibold text-slate-900">Favorites</h2>
          <p className="text-sm text-slate-600">Coming soon. Save artworks and view them here anytime.</p>
        </div>
        <div className="ac-card space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Preferences</p>
          <h2 className="text-lg font-semibold text-slate-900">Personal details</h2>
          <p className="text-sm text-slate-600">Update delivery and notification preferences in a future release.</p>
        </div>
        <div className="ac-card space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Orders</p>
          <h2 className="text-lg font-semibold text-slate-900">Order history</h2>
          <p className="text-sm text-slate-600">Your purchases will appear here once checkout launches.</p>
        </div>
      </div>
    </div>
  );
}
