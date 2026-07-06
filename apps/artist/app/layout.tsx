import type { ReactNode } from "react";
import type { Metadata } from "next";

import { ChunkLoadRecovery } from "@/components/system/ChunkLoadRecovery";

import "./globals.css";

export const metadata: Metadata = {
  title: "ARTCLUB Network – Das Netzwerk der Kunst",
  description: "Build your identity, connect and participate in the international art world.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('artclub-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme:dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'}catch(e){}})()` }} /></head>
      <body className="bg-white text-neutral-950 antialiased">
        <ChunkLoadRecovery />
        {children}
      </body>
    </html>
  );
}
