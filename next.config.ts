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

  /**
   * One canonical host. `www.ticketroyality.com` and the apex both resolving with a 200
   * splits ranking signals and trips duplicate-content SEO checks; this 308s every www
   * request to the bare apex, which is the host every canonical tag and og:url already
   * points at. It fires only once `www` is attached as a domain in App Hosting — until
   * then no request ever arrives with that host, so the rule is inert rather than wrong.
   */
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.ticketroyality.com' }],
        destination: 'https://ticketroyality.com/:path*',
        permanent: true,
      },
    ];
  },

  // Trims the response body and removes a free fingerprint for scanners.
  // Emits .next/standalone so the Docker image carries only what it needs.
  output: 'standalone',
  poweredByHeader: false,
  compress: true,

  /**
   * Security headers, applied to every response.
   *
   * A FULL CSP — one that restricts `script-src` and `connect-src` — still belongs in
   * middleware: Next injects inline bootstrap scripts that need per-request nonces, and a
   * `connect-src` tight enough to matter would have to enumerate every Firestore, Auth,
   * Storage, FCM, Maps and analytics origin, which is exactly the list that white-screens
   * the app the day one is missed. Shipping that blind is worse than shipping none.
   *
   * What ships here is the safe half of a CSP: the directives that carry real value AND
   * need no origin allowlist, so they cannot break script, network or image loading.
   * `default-src` is deliberately omitted — with it absent, `script-src`/`connect-src`/
   * `img-src`/`style-src` stay unrestricted (load as before), and only these four enforce:
   *   frame-ancestors 'none'  — clickjacking (the modern twin of X-Frame-Options: DENY)
   *   base-uri 'self'         — a `<base>` injection cannot repoint every relative URL
   *   object-src 'none'       — no Flash/plugin embeds
   *   form-action 'self'      — an injected form cannot POST credentials off-site
   *                             (every real form here posts to a same-origin /api route)
   * The `script-src`/`connect-src` nonce work is the documented follow-up, to be verified
   * against the live app rather than guessed.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Content-Security-Policy',
            value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
          },
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
      {
        /*
         * Keep-out pages, told to search engines the only way that actually works.
         *
         * These were listed as `Disallow` in robots.txt, which was the wrong tool and
         * produced Search Console's "Indexed, though blocked by robots.txt". robots.txt
         * governs *crawling*, not *indexing*: `/login`, `/register` and `/cart` are
         * linked from the header on every page, so Google found the URLs, indexed them
         * on the strength of those links — and was then forbidden from fetching them, so
         * it could never see a reason to drop them. The block is what kept them stuck.
         *
         * A page has to be crawlable to be de-indexed. `noindex` is the instruction;
         * robots.txt now permits the crawl that delivers it.
         *
         * Sent as a header rather than `robots` metadata because most of these are
         * client components, which cannot export `metadata` at all — and one rule here
         * cannot drift from the page it protects.
         *
         * `follow` is deliberately left on: several of these link onward to pages that
         * should rank, and orphaning those to save a crawl nobody was short of would be
         * a poor trade.
         */
        source: '/(login|register|forgot-password|account|cart|unsubscribe)',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, follow' }],
      },
      {
        // Sub-paths of the same. `/register/organiser` and `/register/customer` are
        // excluded on purpose — they are the organiser and buyer acquisition landing
        // pages, linked from the homepage CTAs, and they should rank.
        source: '/(login|dashboard|checkout)/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, follow' }],
      },
    ];
  },
};

export default nextConfig;
