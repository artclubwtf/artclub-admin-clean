import Link from "next/link";

type ArtistFrontendDeprecatedProps = {
  scope: "artist" | "artists";
};

export default function ArtistFrontendDeprecated({ scope }: ArtistFrontendDeprecatedProps) {
  return (
    <div className="min-h-screen bg-white px-6 py-10 text-neutral-950">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-2xl flex-col justify-center">
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-[0.7rem] font-medium uppercase tracking-[0.28em] text-neutral-400">Deprecated</p>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-neutral-950">Artist area moved to new app</h1>
            <p className="max-w-xl text-sm leading-6 text-neutral-600">
              The legacy artist frontend under <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-[0.85em]">/{scope}</code> is no longer maintained inside admin.
              The new ARTCLUB for Artists experience is being rebuilt as a dedicated app.
            </p>
          </div>

          <div className="space-y-3 rounded-[2rem] bg-neutral-50 px-5 py-5 text-sm leading-6 text-neutral-600">
            <p>Admin stays the backend and integration hub.</p>
            <p>Canonical models, sync logic and APIs remain in place.</p>
            <p>The old frontend is intentionally disabled here to avoid further work on the broken UI.</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-neutral-950 px-4 py-2.5 text-sm font-medium text-white"
            >
              Back to admin
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
