import type { ReactNode } from "react";

import ArtistFrontendDeprecated from "@/components/artist/ArtistFrontendDeprecated";

export const metadata = {
  title: "Artist Area Moved | Artclub",
  description: "Legacy artist frontend is deprecated in admin.",
};

export default function ArtistLayout({ children: _children }: { children: ReactNode }) {
  return <ArtistFrontendDeprecated scope="artist" />;
}
