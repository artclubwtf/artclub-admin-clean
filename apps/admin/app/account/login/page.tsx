"use client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { FormEvent, useEffect, useState } from "react";
import { getSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function CustomerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    const checkExisting = async () => {
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
        if (res.ok) {
          router.replace("/account");
          return;
        }
      } catch (err) {
        console.error("Failed to check customer session", err);
      } finally {
        if (active) setChecking(false);
      }
    };

    checkExisting();
    return () => {
      active = false;
    };
  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(payload?.error || "Unable to sign in");
        setLoading(false);
        return;
      }

      router.replace("/account");
    } catch (err) {
      console.error("Failed to sign in", err);
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="ac-shell">
      <div className="ac-card" style={{ maxWidth: 480, margin: "40px auto" }}>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Account</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Welcome back</h1>
        <p className="mt-2 text-sm text-slate-600">Sign in to manage your account details and future orders.</p>

        <form className="mt-6 flex flex-col gap-3" onSubmit={handleSubmit}>
          <label className="field">
            Email
            <input
              required
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={loading || checking}
            />
          </label>

          <label className="field">
            Password
            <input
              required
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
              disabled={loading || checking}
            />
          </label>

          {error ? <div style={{ color: "var(--danger)", fontWeight: 600, fontSize: 14 }}>{error}</div> : null}

          <button className="btnPrimary" type="submit" disabled={loading || checking}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="mt-6 text-sm text-slate-600">
          New here?{" "}
          <Link href="/account/register" className="font-semibold text-slate-900">
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
}
