import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

await build({
  entryPoints: [resolve(rootDir, "embed/artist-embed-entry.tsx")],
  outfile: resolve(rootDir, "public/artist-embed.js"),
  bundle: true,
  format: "iife",
  globalName: "ArtclubArtistEmbed",
  platform: "browser",
  target: ["es2020"],
  jsx: "automatic",
  tsconfig: resolve(rootDir, "tsconfig.json"),
  legalComments: "none",
  sourcemap: false,
  minify: false,
});
