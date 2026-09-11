import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained .next/standalone build (minimal server.js +
  // only the node_modules actually used) so the Docker image doesn't need
  // the full node_modules tree copied in. See oracle-nextjs/Dockerfile.
  output: "standalone",

  // Local dev only: `next dev` has no nginx in front, so proxy Django's
  // routes to the backend directly. In Docker/production nginx handles this
  // routing (see nginx/app.wuapp.app.conf) before it ever reaches Next, so
  // these rewrites are a no-op there. Mirrors that nginx config 1:1.
  async rewrites() {
    const backend = process.env.BACKEND_URL ?? "http://localhost:8000";
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      { source: "/api-auth/:path*", destination: `${backend}/api-auth/:path*` },
      { source: "/static/:path*", destination: `${backend}/static/:path*` },
      // No trailing slash -> Django's own APPEND_SLASH redirect handles it,
      // same as it does behind nginx in production.
      { source: "/admin", destination: `${backend}/admin` },
      { source: "/admin/:path*", destination: `${backend}/admin/:path*` },
    ];
  },
};

export default nextConfig;
