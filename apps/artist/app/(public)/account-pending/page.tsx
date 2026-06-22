import Link from "next/link";

export default function AccountPendingPage() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center px-6 py-16">
      <div className="space-y-4">
        <p className="text-sm font-medium uppercase tracking-wide text-neutral-400">Account pending</p>
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-neutral-950">Artist account not linked</h1>
        <p className="text-sm leading-6 text-neutral-600">
          This login does not have a linked artist profile yet. An ARTCLUB admin needs to connect the account before the
          workspace can be opened.
        </p>
        <Link href="/login" className="inline-flex rounded-full bg-neutral-950 px-5 py-3 text-sm font-medium text-white">
          Back to login
        </Link>
      </div>
    </div>
  );
}
