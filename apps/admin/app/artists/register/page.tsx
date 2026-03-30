"use client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getSession, signIn } from "next-auth/react";
import { FormEvent, Suspense, useEffect, useState } from "react";

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
      <div className="ac-shell">
        <div className="ac-card" style={{ maxWidth: 520, margin: "40px auto" }}>
          Checking session...
        </div>
      </div>
    );
  }

  if (notAllowedMessage) {
    return (
      <div className="ac-shell">
        <div className="ac-card" style={{ maxWidth: 520, margin: "40px auto" }}>
          <h1 className="text-2xl font-semibold text-slate-900">Not allowed</h1>
          <p className="mt-2 text-sm text-slate-600">{notAllowedMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ac-shell">
      <div className="ac-card" style={{ maxWidth: 520, margin: "40px auto" }}>
        <h1 className="text-2xl font-semibold text-slate-900">Artist registration</h1>
        <p className="mt-2 text-sm text-slate-600">Enter your one-time registration key to create your artist account.</p>

        <form className="mt-6 grid gap-3" onSubmit={handleSubmit}>
          <label className="field">
            Registration key
            <input
              required
              value={registrationKey}
              onChange={(event) => setRegistrationKey(event.target.value)}
              placeholder="ARK-XXXXXXXXXXXX"
              disabled={submitting}
            />
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

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />
            Show passwords
          </label>

          {error ? <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

          <button type="submit" className="btnPrimary" disabled={submitting}>
            {submitting ? "Creating account..." : "Register"}
          </button>
        </form>

        <div className="mt-5 text-sm text-slate-600">
          Already registered?{" "}
          <Link href="/artists/login" className="font-semibold text-slate-900">
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ArtistV2RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="ac-shell">
          <div className="ac-card" style={{ maxWidth: 520, margin: "40px auto" }}>
            Loading...
          </div>
        </div>
      }
    >
      <ArtistV2RegisterInner />
    </Suspense>
  );
}
