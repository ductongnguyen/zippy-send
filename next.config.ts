import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    async rewrites() {
      return [
        {
          source: '/api/:path*',
          destination: 'http://localhost:9999/:path*', // Proxy to Backend
        },
      ]
    },
  };

export default nextConfig;
