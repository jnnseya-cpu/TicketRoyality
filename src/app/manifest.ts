import type { MetadataRoute } from 'next';

import { SITE_NAME, SITE_TAGLINE } from '@/shared/site';

/**
 * The web app manifest.
 *
 * `display: 'standalone'` is the whole point on a ticketing platform: an installed app
 * with no browser chrome gives the full screen to the QR code at the door, which is the
 * one moment where a cropped or dim screen costs someone their entry. It also means the
 * wallet is one tap from the home screen rather than four taps through a browser.
 *
 * Shortcuts go to the two things a person opens the app *for* — their tickets and
 * what's on. Neither is the marketing homepage.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — ${SITE_TAGLINE}`,
    short_name: SITE_NAME,
    description:
      'Buy tickets, keep them in your wallet and get through the door. Organisers can publish events, scan entry and track revenue.',
    start_url: '/?source=pwa',
    // scope covers the whole origin so an installed app never drops back into a browser
    // tab part-way through checkout.
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    // "The Programme" dark ground — warm ink (hsl 36 29% 7%), not the old cool black.
    background_color: '#17130D',
    theme_color: '#17130D',
    categories: ['events', 'entertainment', 'lifestyle'],
    lang: 'en-GB',
    dir: 'ltr',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Separate maskable entries with a padded safe zone. Android crops icons to a
      // circle on some launchers, and the crown's points are the first thing lost.
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      {
        name: 'My tickets',
        short_name: 'Tickets',
        description: 'Your wallet and QR codes',
        url: '/dashboard/customer?source=pwa-shortcut',
      },
      {
        name: 'Browse events',
        short_name: 'Events',
        description: "What's on near you",
        url: '/events?source=pwa-shortcut',
      },
    ],
  };
}
