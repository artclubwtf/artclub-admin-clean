"use client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import type { Session } from "next-auth";
import Link from "next/link";
import { getSession, signIn } from "next-auth/react";
import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function resolveDestination(session: Session | null) {
  if (!session?.user) return "/artists/login";
  if (session.user.role === "team") return "/admin";
  if (session.user.role !== "artist") return "/account";

  const onboardingComplete = (session.user as { onboardingComplete?: boolean }).onboardingComplete === true;
  return onboardingComplete ? "/artists" : "/artists/onboarding";
}

export default function ArtistV2LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [checkingSession, setCheckingSession] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callbackUrl = searchParams.get("callbackUrl");

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const session = await getSession();
        if (!active) return;
        if (session?.user) {
          router.replace(resolveDestination(session));
          return;
        }
      } finally {
        if (active) setCheckingSession(false);
      }
    };
    void check();
    return () => {
      active = false;
    };
  }, [router]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await signIn("credentials", {
        redirect: false,
        email,
        password,
        callbackUrl: callbackUrl ?? undefined,
      });
      if (result?.error) {
        setError("Invalid email or password.");
        setSubmitting(false);
        return;
      }

      const session = await getSession();
      router.replace(resolveDestination(session));
    } catch {
      setError("Login failed. Please try again.");
      setSubmitting(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="ac-shell">
        <div className="ac-card" style={{ maxWidth: 520, margin: "40px auto" }}>
          Checking session...
        </div>
      </div>
    );
  }

  return (
    <div className="ac-shell">
      <div className="ac-card" style={{ maxWidth: 520, margin: "40px auto" }}>
        <h1 className="text-2xl font-semibold text-slate-900">Artist login</h1>
        <p className="mt-2 text-sm text-slate-600">Sign in to continue your onboarding or open your artist dashboard.</p>

        <form className="mt-6 grid gap-3" onSubmit={handleSubmit}>
          <label className="field">
            Email
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              disabled={submitting}
            />
          </label>

          <label className="field">
            Password
            <input
              required
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Your password"
              disabled={submitting}
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />
            Show password
          </label>

          {error ? <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

          <button type="submit" className="btnPrimary" disabled={submitting}>
            {submitting ? "Signing in..." : "Log in"}
          </button>
        </form>

        <div className="mt-5 text-sm text-slate-600">
          Need an account?{" "}
          <Link href="/artists/register" className="font-semibold text-slate-900">
            Register
          </Link>
        </div>

        <div className="mt-2 text-sm text-slate-500">Forgot password: coming soon.</div>
      </div>
    </div>
  );
}
