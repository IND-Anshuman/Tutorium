/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    // 32MB proxy buffer — sits above the 30MB /api/ingest cap with a small
    // headroom for multipart boundaries. Must match the proxy.ts Content-Length
    // gate (30MB) and the route's file.size cap (30MB) so all three limits
    // agree. Below Cloud Run's 32MB request-body edge limit.
    proxyClientMaxBodySize: "32mb",
  },
  // @napi-rs/canvas ships native bindings that Turbopack can't bundle — keep
  // it external so it's required at runtime from node_modules. Without this,
  // the build fails with "non-ecmascript placeable asset".
  serverExternalPackages: ["@napi-rs/canvas"],
};

module.exports = nextConfig;
