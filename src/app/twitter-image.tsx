// The Twitter/X card image reuses the same generated 1200×630 brand card as Open Graph, so
// a shared link previews the same way everywhere. Config declared here directly (rather than
// re-exported) so Next can read it statically.
export const runtime = 'nodejs';
export const alt = 'TicketRoyality — Premium Event Access. Verified Tickets.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export { default } from './opengraph-image';
