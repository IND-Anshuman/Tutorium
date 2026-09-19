/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    // 16MB proxy buffer (slightly above route's 15MB cap so multipart uploads
    // up to the cap survive double-buffering in Clerk's middleware). The proxy
    // also enforces a hard 15MB ceiling on Content-Length before reading the
    // body, so Next's built-in warning + truncation never fire.
    proxyClientMaxBodySize: "16mb",
  },
};

module.exports = nextConfig;
