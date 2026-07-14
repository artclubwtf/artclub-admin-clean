import Link from "next/link";

export function ArtclubLogo({ href = "/home", className = "h-6 w-auto" }: { href?: string; className?: string }) {
  return <Link href={href} aria-label="ARTCLUB home" className="inline-flex text-[var(--text)]"><img src="/artclub-logo.svg" alt="ARTCLUB" data-artclub-logo className={className} /></Link>;
}
