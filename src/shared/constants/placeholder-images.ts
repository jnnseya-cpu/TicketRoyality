/**
 * Fallback imagery for anything an organiser has not supplied a real photograph for.
 *
 * These were `picsum.photos` seeds — random, unrelated stock photos standing in for
 * "a packed stadium" or "a VIP lounge". A random landscape captioned as your event is
 * the single loudest "unfinished / machine-filled" signal on a premium site, so the
 * fallbacks are now *designed*: engraved-poster SVG from `shared/brand/cover-art`, in
 * the Programme palette, deterministic per seed. A designed house cover reads as a
 * choice; a stock photo of the wrong place reads as a gap.
 *
 * The export names and signatures are unchanged, so every consumer keeps working — a
 * plain <img>, a next/image (data URIs pass through the optimiser untouched) or a CSS
 * background alike.
 */
import { coverArtDataUri, monogramDataUri } from '@/shared/brand/cover-art';

export const PLACEHOLDER_IMAGES = {
  heroCrowd: coverArtDataUri('tr-hero-arena', { label: 'TicketRoyality', aspect: 16 / 9 }),
  stadium: coverArtDataUri('tr-stadium', { label: 'The Stand', aspect: 1280 / 860 }),
  vipLounge: coverArtDataUri('tr-vip-lounge', { label: 'The Box', aspect: 1280 / 860 }),
  scanGate: coverArtDataUri('tr-scan-gate', { label: 'The Gate', aspect: 1280 / 860 }),
  eventFallback: coverArtDataUri('tr-event', { label: 'Live', aspect: 800 / 500 }),
  organiserCover: coverArtDataUri('tr-org-cover', { label: 'Presents', aspect: 1600 / 500 }),
  organiserLogo: monogramDataUri('tr-org-logo'),
  speakerFallback: monogramDataUri('tr-speaker'),
  aboutTeam: coverArtDataUri('tr-team', { label: 'A Full House', aspect: 1200 / 700 }),
} as const;

/** Per-event cover for an event with no uploaded image — stable for the event's life. */
export function eventImageSeed(id: string) {
  return coverArtDataUri(`tr-event-${id}`, { aspect: 800 / 500 });
}

/** Per-person monogram tile for an avatar with no photo. Pass the name for real initials. */
export function avatarSeed(id: string, name?: string) {
  return monogramDataUri(`tr-avatar-${id}`, name);
}
