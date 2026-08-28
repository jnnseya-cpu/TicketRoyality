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

export type PlacementId = 'video-ad' | 'featured' | 'newsletter';

export const PLACEMENTS: Record<PlacementId, PlacementDef> = {
  'video-ad': {
    id: 'video-ad',
    title: 'Homepage spotlight',
    description:
      'Your event in the rotating spotlight strip on the homepage. Upload a short video and it plays there muted and looping; without one, your cover image shows. Links straight to your event.',
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
