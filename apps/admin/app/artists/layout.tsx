import type { ReactNode } from "react";

import ArtistFrontendDeprecated from "@/components/artist/ArtistFrontendDeprecated";

export default function ArtistsRootLayout({ children: _children }: { children: ReactNode }) {
  return <ArtistFrontendDeprecated scope="artists" />;
}
