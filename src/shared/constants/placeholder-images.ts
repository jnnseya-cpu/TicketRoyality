/**
 * Deterministic placeholder imagery. Never inline random image URLs in components —
 * non-deterministic seeds cause layout flicker and broken images in production.
 */
export const PLACEHOLDER_IMAGES = {
  heroCrowd: 'https://picsum.photos/seed/tr-hero-arena/1920/1080',
  stadium: 'https://picsum.photos/seed/tr-stadium/1280/860',
  vipLounge: 'https://picsum.photos/seed/tr-vip-lounge/1280/860',
  scanGate: 'https://picsum.photos/seed/tr-scan-gate/1280/860',
  eventFallback: 'https://picsum.photos/seed/tr-event/800/500',
  organiserCover: 'https://picsum.photos/seed/tr-org-cover/1600/500',
  organiserLogo: 'https://picsum.photos/seed/tr-org-logo/200/200',
  speakerFallback: 'https://picsum.photos/seed/tr-speaker/200/200',
  aboutTeam: 'https://picsum.photos/seed/tr-team/1200/700',
} as const;

export function eventImageSeed(id: string) {
  return `https://picsum.photos/seed/tr-event-${encodeURIComponent(id)}/800/500`;
}

export function avatarSeed(id: string) {
  return `https://picsum.photos/seed/tr-avatar-${encodeURIComponent(id)}/200/200`;
}
