import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained .next/standalone build (minimal server.js +
  // only the node_modules actually used) so the Docker image doesn't need
  // the full node_modules tree copied in. See oracle-nextjs/Dockerfile.
  output: "standalone",

  // Local dev only: `next dev` has no nginx in front, so proxy /api/* to
  // the Django backend. In Docker/production nginx routes /api/ to the
  // backend before it ever reaches Next, so this rewrite is a no-op there.
  async rewrites() {
    const backend = process.env.BACKEND_URL ?? "http://localhost:8000";
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
