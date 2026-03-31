"use client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getSession, signIn } from "next-auth/react";
import { FormEvent, Suspense, useEffect, useState } from "react";
import styles from "@/app/artists/auth.module.css";

function mapRegisterError(code?: string) {
  const normalized = (code || "").toLowerCase();
  if (normalized.includes("at least 8") || normalized === "weak_password") {
    return "Password is too weak. Please use at least 8 characters.";
  }

  switch (normalized) {
    case "invalid_key":
      return "This registration key is invalid.";
    case "key_expired":
      return "This registration key has expired.";
    case "key_already_used":
      return "This registration key was already used.";
    case "email_exists":
    case "email_taken":
      return "This email is already registered.";
    case "register_failed":
      return "Registration failed. Please try again.";
    case "invalid_payload":
      return "Please check your entries.";
    default:
      return "Registration failed. Please try again.";
  }
}

function ArtistV2RegisterInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [checkingSession, setCheckingSession] = useState(true);
  const [notAllowedMessage, setNotAllowedMessage] = useState<string | null>(null);

  const [registrationKey, setRegistrationKey] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const keyFromQuery = searchParams.get("key");
    if (keyFromQuery && !registrationKey) {
      setRegistrationKey(keyFromQuery);
    }
  }, [registrationKey, searchParams]);

  useEffect(() => {
    let active = true;
    const checkAuth = async () => {
      try {
        const session = await getSession();
        if (!active) return;
        if (!session?.user) {
          setCheckingSession(false);
          return;
        }
        if (session.user.role === "artist") {
          router.replace("/artists");
          return;
        }
        if (session.user.role === "team") {
          router.replace("/admin");
          return;
        }
        if (session.user.role === "customer") {
          router.replace("/account");
          return;
        }
        setNotAllowedMessage("You are signed in with a role that cannot register as artist.");
        setCheckingSession(false);
      } catch {
        if (active) setCheckingSession(false);
      }
    };
    void checkAuth();
    return () => {
      active = false;
    };
  }, [router]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!registrationKey.trim()) {
      setError("Registration key is required.");
      return;
    }
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/artists/v3/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: registrationKey.trim(),
          email: email.trim().toLowerCase(),
          password,
        }),
      });
      const payload = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok) {
        setError(mapRegisterError(payload?.error));
        setSubmitting(false);
        return;
      }

      const signInResult = await signIn("credentials", {
        redirect: false,
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInResult?.error) {
        setError("Registration completed, but login failed. Please sign in manually.");
        router.replace("/artists/login");
        return;
      }

      router.replace("/artists/onboarding");
    } catch {
      setError("Registration failed. Please try again.");
    } finally {
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

  if (notAllowedMessage) {
    return (
      <div className={styles.authShell}>
        <div className={styles.authWrap}>
          <div className={styles.card}>
            <h1 className="text-2xl font-semibold text-slate-900">Not allowed</h1>
            <p className="mt-2 text-sm text-slate-600">{notAllowedMessage}</p>
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
        <p className={styles.subtitle}>Create your artist account</p>
        <div className={styles.card}>
          <form className={styles.form} onSubmit={handleSubmit}>
            <label className="field">
              Registration key
              <input
                required
                value={registrationKey}
                onChange={(event) => setRegistrationKey(event.target.value)}
                placeholder="ARK-XXXXXXXXXXXX"
                disabled={submitting}
              />
              <span className={styles.fieldHint}>Received from ARTCLUB team</span>
            </label>

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
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                disabled={submitting}
              />
            </label>

            <label className="field">
              Confirm password
              <input
                required
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Repeat password"
                disabled={submitting}
              />
            </label>

            <label className={styles.row}>
              <span className="text-sm text-slate-700">Show passwords</span>
              <input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />
            </label>

            {error ? <div className={styles.error}>{error}</div> : null}

            <button type="submit" className="btnPrimary" disabled={submitting}>
              {submitting ? "Creating account..." : "Create account"}
            </button>
          </form>

          <div className={styles.footer}>
            Already have an account?{" "}
            <Link href="/artists/login" className="font-semibold text-slate-900">
              Sign in
            </Link>
          </div>
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

export default function ArtistV2RegisterPage() {
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
      <ArtistV2RegisterInner />
    </Suspense>
  );
}
