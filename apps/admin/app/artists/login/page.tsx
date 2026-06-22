"use client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import type { Session } from "next-auth";
import Link from "next/link";
import { getSession, signIn } from "next-auth/react";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "@/app/artists/auth.module.css";

function resolveDestination(session: Session | null) {
  if (!session?.user) return "/artists/login";
  if (session.user.role === "admin" || session.user.role === "team") return "/admin";
  if (session.user.role !== "artist") return "/account";

  const onboardingComplete = (session.user as { onboardingComplete?: boolean }).onboardingComplete === true;
  return onboardingComplete ? "/artists" : "/artists/onboarding";
}

function ArtistV2LoginInner() {
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
      <div className={styles.authShell}>
        <div className={styles.authWrap}>
          <div className={styles.card}>
            <div className={styles.loading}>Checking session...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.authShell}>
      <button className={styles.topIcon} type="button" aria-label="Theme toggle">
        <MoonIcon />
      </button>
      <div className={styles.authWrap}>
        <div className={styles.brand}>ARTCLUB</div>
        <p className={styles.subtitle}>Sign in to your artist workspace</p>
        <div className={styles.card}>
          <form className={styles.form} onSubmit={handleSubmit}>
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

            <label className={styles.row}>
              <span className="text-sm text-slate-700">Show password</span>
              <input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />
            </label>

            {error ? <div className={styles.error}>{error}</div> : null}

            <button type="submit" className="btnPrimary" disabled={submitting}>
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className={styles.footer}>
            Need an account?{" "}
            <Link href="/artists/register" className="font-semibold text-slate-900">
              Register
            </Link>
          </div>

          <div className={styles.footer}>Forgot password: coming soon.</div>
        </div>
        <div className={styles.legal}>© {new Date().getFullYear()} ARTCLUB</div>
      </div>
    </div>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3c-.07.33-.11.67-.11 1.02a8 8 0 0 0 8 8c.65 0 1.27-.08 1.9-.23Z" />
    </svg>
  );
}

export default function ArtistV2LoginPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.authShell}>
          <div className={styles.authWrap}>
            <div className={styles.card}>
              <div className={styles.loading}>Loading...</div>
            </div>
          </div>
        </div>
      }
    >
      <ArtistV2LoginInner />
    </Suspense>
  );
}
