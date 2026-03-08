import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
];

const nextConfig: NextConfig = {
  // ─── Security ────────────────────────────────────────
  poweredByHeader: false,
  reactStrictMode: true,

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },

  // ─── Build Optimization ──────────────────────────────
  output: 'standalone',
  compress: true,

  // ─── Experimental ────────────────────────────────────
  serverExternalPackages: ['uuid'],
};

export default nextConfig;
