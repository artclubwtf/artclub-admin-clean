"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const MIN_PASSWORD_LENGTH = 8;

export default function SetupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const checkSetup = async () => {
      try {
        const res = await fetch("/api/setup", { cache: "no-store" });
        if (res.status === 403) {
          router.replace("/login");
        }
      } catch (err) {
        console.error("Failed to check setup status", err);
        setError("Unable to check setup status. Please try again.");
      } finally {
        setChecking(false);
      }
    };

    checkSetup();
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
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "Unable to create initial user");
        setLoading(false);
        return;
      }

      setSuccess("Team user created. Redirecting to login...");
      setTimeout(() => router.replace("/login"), 800);
    } catch (err) {
      console.error("Failed to create initial user", err);
      setError("Unable to create initial user");
      setLoading(false);
    }
  };

  return (
    <div className="ac-shell">
      <div className="ac-card" style={{ maxWidth: 520, margin: "40px auto" }}>
        <h1 style={{ marginBottom: 6, fontSize: 24, fontWeight: 700 }}>Artclub setup</h1>
        <p style={{ color: "var(--muted)", marginBottom: 16 }}>
          Create the first team account to finish initialization. This page is disabled after the first user is
          created.
        </p>

        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <label className="field">
            Team email
            <input
              required
              type="email"
              autoComplete="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="founder@artclub.com"
              disabled={loading || checking}
            />
          </label>

          <label className="field">
            Password
            <input
              required
              type="password"
              autoComplete="new-password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading || checking}
            />
          </label>

          <label className="field">
            Confirm password
            <input
              required
              type="password"
              autoComplete="new-password"
              name="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading || checking}
            />
          </label>

          {error ? (
            <div style={{ color: "var(--danger)", fontWeight: 600, fontSize: 14 }}>{error}</div>
          ) : null}
          {success ? (
            <div style={{ color: "green", fontWeight: 600, fontSize: 14 }}>{success}</div>
          ) : null}

          <button className="btnPrimary" type="submit" disabled={loading || checking}>
            {loading ? "Creating user..." : "Create team user"}
          </button>
        </form>
      </div>
    </div>
  );
}
