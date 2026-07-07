import Link from "next/link";

export default function AccountPendingPage() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center px-6 py-16">
      <div className="space-y-4">
        <p className="text-sm font-medium uppercase tracking-wide text-neutral-400">Account pending</p>
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-[var(--text)]">Artist account not linked</h1>
        <p className="text-sm leading-6 text-[var(--text-muted)]">
          An ARTCLUB admin needs to connect this account to its existing artist profile.
        </p>
        <Link href="/login" className="primary-action">
          Back to login
        </Link>
      </div>
    </div>
  );
}
