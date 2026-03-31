import Link from "next/link";

import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { PageTitle } from "@/components/primitives/PageTitle";
import { Section } from "@/components/primitives/Section";

export default function RegisterPage() {
  return (
    <div className="space-y-8 pb-8">
      <PageTitle
        title="Register"
        subtitle="Clean registration surface for invited artists. The actual workflow will later connect to admin-managed registration and onboarding APIs."
      />

      <Section title="Create account" subtitle="Prepared as a public route, separated from protected workspace pages.">
        <form className="space-y-4">
          <Input label="Invitation code" placeholder="ARTCLUB-KEY" />
          <Input label="Email" type="email" placeholder="artist@artclub.com" autoComplete="email" />
          <Input label="Password" type="password" placeholder="Create a password" autoComplete="new-password" />
          <Button type="button" className="w-full">
            Create account
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
