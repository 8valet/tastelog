import type { NextConfig } from 'next';
import { posterImageHosts } from './lib/image-policy';
const development = process.env.NODE_ENV === 'development';
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https:",
  "font-src 'self' data:", `connect-src 'self'${development ? ' ws: wss:' : ''}`,
  "object-src 'none'", "frame-src 'none'", "frame-ancestors 'none'",
  "base-uri 'self'", "form-action 'self'",
].join('; ');
const config: NextConfig = {
  distDir: process.env.LIBRARY_TEST_DIST_DIR || '.next',
  poweredByHeader: false,
  images: { remotePatterns: posterImageHosts.map(hostname => ({ protocol: 'https' as const, hostname, pathname: '/**' })) },
  turbopack: { root: process.cwd() },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'Content-Security-Policy', value: csp },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }];
  },
};
export default config;
