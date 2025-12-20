"use client";

import type { Session } from "next-auth";
import { getSession, signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

function resolveDestination(session: Session | null, callbackUrl?: string | null) {
  if (!session?.user) return "/login";

  const safeCallback = callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : null;
  const defaultArtistTarget = session.user.mustChangePassword ? "/artist/change-password" : "/artist";

  if (session.user.role === "team") {
    if (safeCallback?.startsWith("/admin")) return safeCallback;
    return "/admin";
  }

  if (safeCallback?.startsWith("/artist")) {
    if (session.user.mustChangePassword && !safeCallback.startsWith("/artist/change-password")) {
      return `/artist/change-password?callbackUrl=${encodeURIComponent(safeCallback)}`;
    }
    return safeCallback;
  }

  return defaultArtistTarget;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const callbackUrl = searchParams.get("callbackUrl");

  useEffect(() => {
    const checkSession = async () => {
      try {
        const session = await getSession();
        if (session?.user) {
          const target = resolveDestination(session, callbackUrl);
          router.replace(target);
        } else {
          setCheckingSession(false);
        }
      } catch (err) {
        console.error("Failed to check session", err);
        setCheckingSession(false);
      }
    };

    checkSession();
  }, [router, callbackUrl]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        redirect: false,
        email,
        password,
        callbackUrl: callbackUrl ?? undefined,
      });

      if (result?.error) {
        setError("Invalid email or password");
        setLoading(false);
        return;
      }

      const session = await getSession();
      if (!session?.user) {
        setError("Unable to sign in. Please try again.");
        setLoading(false);
        return;
      }

      const destination = resolveDestination(session, callbackUrl);
      router.replace(destination);
    } catch (err) {
      console.error("Failed to sign in", err);
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="ac-shell">
      <div className="ac-card" style={{ maxWidth: 480, margin: "40px auto" }}>
        <h1 style={{ marginBottom: 6, fontSize: 24, fontWeight: 700 }}>Welcome back</h1>
        <p style={{ color: "var(--muted)", marginBottom: 16 }}>
          Sign in with your Artclub admin or artist credentials.
        </p>

        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
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
              disabled={loading || checkingSession}
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
              placeholder="••••••••"
              disabled={loading || checkingSession}
            />
          </label>

          {error ? (
            <div style={{ color: "var(--danger)", fontWeight: 600, fontSize: 14 }}>{error}</div>
          ) : null}

          <button className="btnPrimary" type="submit" disabled={loading || checkingSession}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
