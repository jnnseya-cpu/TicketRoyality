/**
 * The paid placement catalogue — one source of truth for what a placement costs and
 * what it delivers.
 *
 * The prices here are authoritative: the checkout route prices from this table and
 * ignores anything the browser says, the same no-trust rule as ticket pricing. The
 * promotions page renders from the same table, so what is shown and what is charged
 * cannot drift.
 *
 * Placements are self-serve by the owner's direction (19 Aug 2026): the organiser pays
 * by card and the placement activates the moment the payment webhook lands — no enquiry,
 * no manual invoice. Every claim in a description is something that exists: the
 * spotlight strip and featured grid render real flags on real events, and the
 * newsletter block is built into the weekly send.
 */

export interface PlacementDef {
  id: PlacementId;
  title: string;
  description: string;
  /** What the organiser pays by card, GBP major units. Platform revenue. */
  priceMajor: number;
  /** Placements are priced in GBP on the card rail regardless of the event's currency. */
  currency: 'GBP';
  /**
   * The mobile-money price, USD major units — KODA moves USD and CDF only, so a GBP
   * charge cannot go down that rail. Defaults mirror the GBP figure; the superuser
   * sets the real number from the dashboard (`config/placements`), which overrides
   * every default here.
   */
  priceUsdMajor: number;
  /** Days the placement runs; null is a one-shot (the newsletter's single send). */
  days: number | null;
  periodLabel: string;
}

export type PlacementId = 'showcase' | 'video-ad' | 'featured' | 'newsletter';

export const PLACEMENTS: Record<PlacementId, PlacementDef> = {
  showcase: {
    id: 'showcase',
    // The premium slot: the big screen in the homepage's "Built for serious events" panel,
    // where the cover image AND the promo video both move (a slow zoom on the picture, the
    // clip crossfading over it). Priced 30% above the spotlight — the single most prominent
    // placement above the fold.
    title: 'Homepage showcase',
    description:
      'The headline screen high on the homepage: your cover image and your promo video both in motion, crossfading, above the fold. The most prominent placement on the site — 30% more than the spotlight. Add a YouTube link or an uploaded clip (up to 15 seconds); links straight to your event.',
    priceMajor: 324, // £249 × 1.3, rounded to the pound
    currency: 'GBP',
    priceUsdMajor: 324,
    days: 7,
    periodLabel: '7 days',
  },
  'video-ad': {
    id: 'video-ad',
    title: 'Homepage spotlight',
    description:
      'Your event on one of the two spotlight screens on the homepage. Add a short video — a YouTube link or an uploaded clip (up to 15 seconds) — and it plays there muted; the two screens run three seconds apart so there is always motion. Links straight to your event.',
    priceMajor: 249,
    currency: 'GBP',
    priceUsdMajor: 249,
    days: 7,
    periodLabel: '7 days',
  },
  featured: {
    id: 'featured',
    title: 'Featured event placement',
    description:
      'Your event appears in the Featured Events grid on the homepage and in the spotlight strip.',
    priceMajor: 149,
    currency: 'GBP',
    priceUsdMajor: 149,
    days: 7,
    periodLabel: '7 days',
  },
  newsletter: {
    id: 'newsletter',
    title: 'Newsletter spotlight',
    description:
      'A dedicated block in the weekly TicketRoyality email to opted-in attendees in your region.',
    priceMajor: 99,
    currency: 'GBP',
    priceUsdMajor: 99,
    days: null,
    periodLabel: 'single send',
  },
};

export function placementById(id: string): PlacementDef | null {
  return Object.prototype.hasOwnProperty.call(PLACEMENTS, id)
    ? PLACEMENTS[id as PlacementId]
    : null;
}
