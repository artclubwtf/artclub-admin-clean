"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
export function NetworkSettings({ artist }: { artist: boolean }) {
  const [theme, setTheme] = useState("system");
  useEffect(() => setTheme(localStorage.getItem("artclub-theme") || "system"), []);
  function select(value: string) { setTheme(value); localStorage.setItem("artclub-theme", value); const dark = value === "dark" || (value === "system" && matchMedia("(prefers-color-scheme: dark)").matches); document.documentElement.dataset.theme = dark ? "dark" : "light"; }
  const links = [{ href: "/settings/profile", label: "Network profile" }, ...(artist ? [{ href: "/settings/public-profile", label: "Public artist profile" }, { href: "/settings/artworks", label: "Artworks & Shopify sync" }, { href: "/settings/earnings", label: "Earnings" }, { href: "/settings/donations", label: "Donations & Stripe Connect" }] : []), { href: "/settings/analytics", label: "Analytics" }, { href: "/events", label: "Events" }, { href: "/network?view=blocked", label: "Blocked users" }];
  return <div className="mx-auto max-w-2xl py-7"><h1 className="text-3xl font-semibold">Settings</h1><div className="mt-7 divide-y divide-neutral-200 border-y border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">{links.map(item => <Link key={item.href} href={item.href} className="flex justify-between py-4"><span>{item.label}</span><span className="text-neutral-400">→</span></Link>)}</div><section className="py-7"><h2 className="font-medium">Theme</h2><div className="mt-3 flex gap-2">{["light", "dark", "system"].map(value => <button key={value} onClick={() => select(value)} className={`rounded-full border px-4 py-2 text-sm capitalize ${theme === value ? "border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-black" : "border-neutral-300 dark:border-neutral-700"}`}>{value}</button>)}</div></section><button onClick={() => signOut({ callbackUrl: "/login" })} className="text-sm text-red-600">Sign out</button></div>;
}
