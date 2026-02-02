/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Increase limit for multipart uploads (media endpoints)
    proxyClientMaxBodySize: 50 * 1024 * 1024, // 50MB
  },
};

export default nextConfig;
