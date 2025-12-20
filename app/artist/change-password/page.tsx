"use client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { getSession, signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

const MIN_PASSWORD_LENGTH = 8;

function ChangePasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const session = await getSession();
        if (!session?.user) {
          router.replace("/login");
          return;
        }

        setEmail(session.user.email ?? null);
      } catch (err) {
        console.error("Failed to load session", err);
      }
    };

    loadSession();
  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "Unable to change password");
        setLoading(false);
        return;
      }

      if (!email) {
        setSuccess("Password updated, please sign in again.");
        setLoading(false);
        router.replace("/login");
        return;
      }

      const signInResult = await signIn("credentials", {
        redirect: false,
        email,
        password,
        callbackUrl: searchParams.get("callbackUrl") ?? undefined,
      });

      if (signInResult?.error) {
        setError("Password updated, please sign in again.");
        setLoading(false);
        router.replace("/login");
        return;
      }

      setSuccess("Password updated");
      const callbackUrl = searchParams.get("callbackUrl");
      const destination = callbackUrl && callbackUrl.startsWith("/artist") ? callbackUrl : "/artist";
      router.replace(destination);
    } catch (err) {
      console.error("Failed to change password", err);
      setError("Unable to change password");
      setLoading(false);
    }
  };

  return (
    <div className="ac-shell">
      <div className="ac-card" style={{ maxWidth: 520, margin: "40px auto" }}>
        <h1 style={{ marginBottom: 6, fontSize: 24, fontWeight: 700 }}>Set a new password</h1>
        <p style={{ color: "var(--muted)", marginBottom: 16 }}>
          Create a new password to access your artist dashboard.
        </p>

        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <label className="field">
            New password
            <input
              required
              type="password"
              name="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
            />
          </label>

          <label className="field">
            Confirm new password
            <input
              required
              type="password"
              name="confirmPassword"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
            />
          </label>

          {error ? (
            <div style={{ color: "var(--danger)", fontWeight: 600, fontSize: 14 }}>{error}</div>
          ) : null}
          {success ? (
            <div style={{ color: "green", fontWeight: 600, fontSize: 14 }}>{success}</div>
          ) : null}

          <button className="btnPrimary" type="submit" disabled={loading}>
            {loading ? "Updating..." : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ArtistChangePasswordPage() {
  return (
    <Suspense fallback={<div className="ac-shell">Loading...</div>}>
      <ChangePasswordForm />
    </Suspense>
  );
}
