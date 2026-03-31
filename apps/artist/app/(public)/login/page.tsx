import Link from "next/link";

import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { PageTitle } from "@/components/primitives/PageTitle";
import { Section } from "@/components/primitives/Section";

export default function LoginPage() {
  return (
    <div className="space-y-8 pb-8">
      <PageTitle
        title="Login"
        subtitle="Public entry point for the new artist app. Authentication will plug into this shell without mixing public screens into the workspace layout."
      />

      <Section title="Artist access" subtitle="Minimal structure first. No auth logic is wired yet.">
        <form className="space-y-4">
          <Input label="Email" type="email" placeholder="artist@artclub.com" autoComplete="email" />
          <Input label="Password" type="password" placeholder="Your password" autoComplete="current-password" />
          <Button type="button" className="w-full">
            Continue
          </Button>
        </form>
      </Section>

      <p className="text-sm text-neutral-500">
        Need an account?{" "}
        <Link href="/register" className="font-medium text-neutral-950">
          Create one
        </Link>
      </p>
    </div>
  );
}
