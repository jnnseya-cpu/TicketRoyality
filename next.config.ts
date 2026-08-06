import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'maps.googleapis.com' },
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  // Genkit pulls in optional server-only deps that must not be bundled for the browser.
  serverExternalPackages: ['genkit', '@genkit-ai/google-genai'],

  // Trims the response body and removes a free fingerprint for scanners.
  // Emits .next/standalone so the Docker image carries only what it needs.
  output: 'standalone',
  poweredByHeader: false,
  compress: true,

  /**
   * Security headers, applied to every response.
   *
   * CSP is deliberately absent here: it needs per-route nonces for Next's inline
   * bootstrap scripts, which belongs in middleware rather than a static header.
   * Shipping a broken CSP is worse than shipping none, because the first thing
   * anyone does with a CSP that breaks the app is disable it permanently.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            // Camera stays enabled on same-origin: the door scanner needs it.
            value: 'camera=(self), microphone=(), geolocation=(self), payment=(self)',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
      {
        // Never let an authenticated surface sit in a shared cache.
        source: '/dashboard/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
        ],
      },
      {
        // Webhook endpoints live outside /api because the paths are registered with
        // providers, so they need the same no-store and noindex treatment explicitly.
        source: '/(api|webhooks)/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'X-Robots-Tag', value: 'noindex' },
        ],
      },
    ];
  },
};

export default nextConfig;
