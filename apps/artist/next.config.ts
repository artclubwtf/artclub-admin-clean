import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  transpilePackages: ["@artclub/api-client", "@artclub/models"],
  async headers() {
    return [{ source: "/artist/:path*", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self' https://artclub.wtf https://www.artclub.wtf https://*.myshopify.com https://*.shopifypreview.com" }] }];
  },
};

export default nextConfig;
