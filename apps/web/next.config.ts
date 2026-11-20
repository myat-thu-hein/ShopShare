import type { NextConfig } from 'next';
import path from 'node:path';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';

const nextConfig: NextConfig = {
  // Standalone output is only needed for the Docker image; Vercel builds its own way.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  outputFileTracingRoot: path.join(__dirname, '../../'),
  transpilePackages: ['@shopsense/shared'],
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true }, // linted from the repo root in CI
  images: {
    dangerouslyAllowSVG: true,
    remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com' }],
  },
  /**
   * The browser only ever talks to this Next.js app. /api/* is proxied to the NestJS API,
   * so auth cookies are first-party (no third-party cookie problems between Vercel and Render).
   */
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
