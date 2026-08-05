/**
 * Canonical origin for the deployed site.
 *
 * Resolution order matters: an explicit NEXT_PUBLIC_SITE_URL always wins, because a
 * preview deployment inheriting the production canonical would have every preview page
 * claiming to be the production one — which is how a staging environment ends up in the
 * search index outranking the site it was copied from.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, '');

  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  return 'http://localhost:3000';
}

export const SITE_NAME = 'TicketRoyality';
export const SITE_TAGLINE = 'Where Every Ticket Feels Royal.';
export const CONTACT_EMAIL = 'info@ticketroyality.com';
