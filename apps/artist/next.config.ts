import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  transpilePackages: ["@artclub/api-client", "@artclub/models"],
};

export default nextConfig;
