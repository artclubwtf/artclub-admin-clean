"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { StatusMessage } from "@/components/forms/StatusMessage";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { PageTitle } from "@/components/primitives/PageTitle";
import { Section } from "@/components/primitives/Section";

function resolveDestination(callbackUrl: string | null, onboardingComplete: boolean) {
  const safeCallback = callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : null;
  if (!onboardingComplete) return "/onboarding";
  return safeCallback || "/";
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const callbackUrl = searchParams.get("callbackUrl");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await signIn("credentials", {
        redirect: false,
        email,
        password,
      });

      if (result?.error) {
        setError("Invalid email or password.");
        return;
      }

      const sessionRes = await fetch("/api/auth/session");
      const sessionJson = (await sessionRes.json().catch(() => null)) as { user?: { onboardingComplete?: boolean } } | null;
      router.replace(resolveDestination(callbackUrl, sessionJson?.user?.onboardingComplete === true));
      router.refresh();
    });
  }

  return (
    <div className="space-y-8 pb-8">
      <PageTitle title="Login" />

      <Section title="ARTCLUB – The network of art">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <Input
            label="Email"
            type="email"
            placeholder="artist@artclub.com"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isPending}
          />
          <Input
            label="Password"
            type="password"
            placeholder="Your password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={isPending}
          />
          {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Signing in..." : "Continue"}
          </Button>
        </form>
      </Section>

      <p className="text-sm text-[var(--text-muted)]">
        Need an account?{" "}
        <Link href="/register" className="font-medium text-[var(--text)]">
          Create one
        </Link>
      </p>
    </div>
  );
}
