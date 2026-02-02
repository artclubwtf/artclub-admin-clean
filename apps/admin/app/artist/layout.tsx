import type { ReactNode } from "react";

import ArtistShell from "@/components/artist/ArtistShell";
import "./artist.css";

export const metadata = {
  title: "Artist Portal | Artclub",
  description: "Artist tools and updates",
};

export default function ArtistLayout({ children }: { children: ReactNode }) {
  return (
    <div className="artist-app">
      <ArtistShell>{children}</ArtistShell>
    </div>
  );
}
