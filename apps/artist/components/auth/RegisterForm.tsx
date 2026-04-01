"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { StatusMessage } from "@/components/forms/StatusMessage";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { PageTitle } from "@/components/primitives/PageTitle";
import { Section } from "@/components/primitives/Section";

function mapError(code: string | undefined) {
  switch (code) {
    case "invalid_key":
      return "This registration key is invalid.";
    case "key_already_used":
      return "This registration key has already been used.";
    case "key_expired":
      return "This registration key has expired.";
    case "email_exists":
      return "An account with this email already exists.";
    case "email_in_use_other_account":
      return "This email is already linked to another ARTCLUB account.";
    case "register_conflict":
      return "Registration could not be completed because the invitation key or registration state is inconsistent.";
    default:
      return "Registration failed.";
  }
}

export function RegisterForm() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    startTransition(async () => {
      const res = await fetch("/api/artist/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, email, password }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

      if (!res.ok || !json?.ok) {
        setError(mapError(json?.error));
        return;
      }

      const signInResult = await signIn("credentials", {
        redirect: false,
        email,
        password,
      });
      if (signInResult?.error) {
        setError("Registration succeeded, but automatic sign-in failed.");
        return;
      }

      router.replace("/onboarding");
      router.refresh();
    });
  }

  return (
    <div className="space-y-8 pb-8">
      <PageTitle
        title="Register"
        subtitle="Create an artist account with your invitation key. This writes directly to the real artist user and canonical artist records."
      />

      <Section title="Create account" subtitle="Registration uses the existing artist key flow.">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <Input label="Invitation code" placeholder="ARK-..." value={key} onChange={(event) => setKey(event.target.value)} disabled={isPending} />
          <Input label="Email" type="email" placeholder="artist@artclub.com" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={isPending} />
          <Input label="Password" type="password" placeholder="Create a password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={isPending} />
          <Input label="Confirm password" type="password" placeholder="Repeat password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} disabled={isPending} />
          {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Creating..." : "Create account"}
          </Button>
        </form>
      </Section>

      <p className="text-sm text-neutral-500">
        Already registered?{" "}
        <Link href="/login" className="font-medium text-neutral-950">
          Go to login
        </Link>
      </p>
    </div>
  );
}
