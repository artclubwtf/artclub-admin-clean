import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Increase limit for multipart uploads (media endpoints)
    proxyClientMaxBodySize: 500 * 1024 * 1024, // 500MB
  },
};

export default nextConfig;
