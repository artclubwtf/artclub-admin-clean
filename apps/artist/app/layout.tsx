import type { ReactNode } from "react";
import type { Metadata } from "next";

import { ChunkLoadRecovery } from "@/components/system/ChunkLoadRecovery";

import "./globals.css";

export const metadata: Metadata = {
  title: "ARTCLUB for Artists",
  description: "A dedicated artist workspace for onboarding, profile, artworks and media.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-white text-neutral-950 antialiased">
        <ChunkLoadRecovery />
        {children}
      </body>
    </html>
  );
}
