/**
 * The internal link graph (docs/04 M25).
 *
 * Three kinds of link run through this file, and the distinction matters:
 *
 *   1. **Inline contextual links** — a phrase inside a sentence becomes a link to the
 *      page that explains it. These carry the most SEO weight of anything here,
 *      because the anchor text is a real phrase in a real sentence rather than
 *      "click here" or a nav label, and the surrounding paragraph gives the target
 *      page its topical context.
 *   2. **Product links** — the explicit call to action attached to an article.
 *   3. **Event slots** — resolved against live inventory (see `resolve.ts`).
 *
 * Everything is driven from one registry so that renaming a route updates every
 * article at once. Hand-written `<a href>` scattered through prose is how a site ends
 * up with two hundred internal 404s and no way to find them.
 */

/** Every internal destination an article may point at, defined once. */
export interface Destination {
  /** The canonical path. Must be a route that exists — see the test in `links.test`. */
  href: string;
  /** Short label used when the destination is rendered as a card or button. */
  label: string;
  /** One line explaining what the reader gets. Used on product-link cards. */
  blurb: string;
}

export const DESTINATIONS = {
  events: {
    href: '/events',
    label: 'Browse what is on',
    blurb: 'Every published event, filterable by city, date, category and price.',
  },
  organisers: {
    href: '/organisers',
    label: 'Organiser directory',
    blurb: 'Approved organisers, their events and their track record.',
  },
  getStarted: {
    href: '/get-started',
    label: 'Get started',
    blurb: 'Three routes in: going to events, running them, or promoting them.',
  },
  howItWorks: {
    href: '/how-it-works',
    label: 'How it works',
    blurb: 'The whole flow, from finding an event to scanning at the door.',
  },
  industries: {
    href: '/industries',
    label: 'By industry',
    blurb: 'How the platform is used across music, sport, conferences and nightlife.',
  },
  growth: {
    href: '/growth',
    label: 'Growth & influencers',
    blurb: 'The referral programme and the 1% influencer commission.',
  },
  developers: {
    href: '/developers',
    label: 'Developer platform',
    blurb: 'Sandbox, signed webhooks, idempotency and versioned APIs.',
  },
  registerOrganiser: {
    href: '/register/organiser',
    label: 'Apply as an organiser',
    blurb: 'Submit for approval. Publishing opens once you are verified.',
  },
  registerCustomer: {
    href: '/register/customer',
    label: 'Create an account',
    blurb: 'Buy, store and transfer tickets from one wallet.',
  },
  blog: {
    href: '/blog',
    label: 'All articles',
    blurb: 'City guides, feature explainers and data from the platform.',
  },
  policies: {
    href: '/policies',
    label: 'Our policies',
    blurb: 'Editorial approach, refunds, and how disputes are handled.',
  },
  contact: {
    href: '/contact',
    label: 'Talk to us',
    blurb: 'Questions the documentation does not answer.',
  },
} as const satisfies Record<string, Destination>;

export type DestinationKey = keyof typeof DESTINATIONS;

/**
 * Phrases that become inline links wherever they appear in article prose.
 *
 * `to` is either a destination key or an article slug (prefixed `article:`). Linking
 * articles to each other is what turns a pile of pages into topic clusters, and it is
 * the single cheapest ranking improvement available to a small site: it tells a
 * crawler which pages belong together and which one is the hub.
 *
 * Each target carries **several** phrasings rather than one canonical keyword. This is
 * the difference between a registry that fires and one that does not: writers write
 * "at the door" and "door staff" and "the scanner", not "check-in". A registry holding
 * only the idealised keyword form matches almost nothing, which is exactly what the
 * first version of this file did — mean density was 1.0 links per article and 22 of 42
 * terms never matched any prose at all.
 *
 * Varied anchor text is also better SEO than repeating one exact phrase. Identical
 * anchors pointing at the same page across thirty articles is a recognised
 * manipulation pattern; natural variation is what real editorial linking looks like,
 * because it is what real editorial linking is.
 */
export interface LinkTerm {
  phrases: string[];
  to: DestinationKey | `article:${string}`;
}

export const LINK_TERMS: LinkTerm[] = [
  // Product surfaces. The action phrase goes to the product page; the explanatory
  // phrase goes to the article that explains it. Pointing both at the same place
  // wastes one of them.
  { phrases: ['organiser directory'], to: 'organisers' },
  { phrases: ['developer platform', 'API key', 'API keys'], to: 'developers' },
  { phrases: ['referral programme', 'referral links', 'tracked link'], to: 'growth' },
  { phrases: ['apply as an organiser', 'organiser account'], to: 'registerOrganiser' },
  { phrases: ['editorial approach'], to: 'policies' },

  // Feature articles. Longest phrase across the whole registry is matched first, so
  // "Venue Map Studio" is never shadowed by the "venue map" inside it.
  {
    phrases: ['AI Event Architect', 'full event build', 'event build'],
    to: 'article:ai-event-architect',
  },
  {
    phrases: ['Venue Map Studio', 'venue map', 'floor plan', 'seating chart'],
    to: 'article:venue-map-studio',
  },
  {
    phrases: ['ticket tiers', 'tier ladder', 'tier structure', 'seat map', 'top tier', 'tiers', 'tier'],
    to: 'article:tiered-ticketing-and-seat-maps',
  },
  {
    phrases: ['door staff', 'at the door', 'scanned at the door', 'scanner', 'scanners', 'scanning'],
    to: 'article:door-check-in-and-scanning',
  },
  {
    phrases: ['rotating QR', 'QR codes', 'QR code', 'duplicate scan', 'duplicate-scan', 'forged'],
    to: 'article:rotating-qr-and-ticket-forgery',
  },
  {
    phrases: ['access zones', 'licensed capacity', 'zones', 'zone', 'capacity'],
    to: 'article:venue-zones-and-access-control',
  },
  { phrases: ['mobile money'], to: 'article:mobile-money-payments' },
  {
    phrases: ['commission', 'payout', 'payouts', 'admin fee'],
    to: 'article:commission-and-payouts',
  },
  { phrases: ['ACU', 'credits'], to: 'article:acu-credits-explained' },
  {
    phrases: ['discount code', 'discount codes', 'coupon'],
    to: 'article:coupons-and-promotions',
  },
  {
    phrases: ['affiliate', 'promoter', 'promoters'],
    to: 'article:affiliate-and-promoter-network',
  },
  {
    phrases: ['influencer programme', 'influencer', 'influencers'],
    to: 'article:referral-and-influencer-programme',
  },
  { phrases: ['sponsorship', 'sponsoring', 'sponsors', 'sponsor'], to: 'article:sponsor-activation' },
  { phrases: ['loyalty', 'presale', 'repeat attendance'], to: 'article:loyalty-and-fan-rewards' },
  {
    phrases: ['live streaming', 'stream ticket', 'streaming', 'hybrid event'],
    to: 'article:live-streaming-hybrid-events',
  },
  {
    phrases: ['hospitality', 'table price', 'corporate box'],
    to: 'article:hospitality-operations',
  },
  {
    phrases: ['video advertising', 'homepage carousel', 'paid placement'],
    to: 'article:homepage-video-advertising',
  },
  {
    phrases: ['fan intelligence', 'analytics', 'reporting boundary', 'sales curve'],
    to: 'article:analytics-and-fan-intelligence',
  },
  {
    phrases: ['recommendations', 'recommendation'],
    to: 'article:ticket-as-discovery-surface',
  },
  {
    phrases: ['webhook', 'webhooks', 'idempotency', 'idempotent'],
    to: 'article:developer-api-and-webhooks',
  },
  {
    phrases: ['notifications', 'notification', 'transactional message'],
    to: 'article:notifications-that-arrive',
  },
  {
    phrases: ['disputes', 'dispute', 'refunds', 'refunded', 'chargeback', 'chargebacks'],
    to: 'article:support-and-disputes',
  },
  {
    phrases: ['bots', 'attestation', 'scalping', 'scalpers'],
    to: 'article:only-humans-buy-here',
  },
  {
    phrases: ['ticket wallet', 'wallet', 'transferred', 'transfer'],
    to: 'article:your-ticket-wallet',
  },
  {
    phrases: ['checkout', 'payment provider', 'card processing'],
    to: 'article:payments-and-checkout',
  },
  {
    phrases: ['card testing', 'credential stuffing', 'payout fraud'],
    to: 'article:anti-fraud-agent',
  },
  {
    phrases: ['booking fee', 'booking fees', 'face value', 'resale'],
    to: 'article:what-a-ticket-actually-costs',
  },
  {
    phrases: ['search filters', 'events carousel', 'structured data'],
    to: 'article:search-and-discovery',
  },
  { phrases: ['first event'], to: 'article:organiser-guide-first-event' },
  { phrases: ['going out in London'], to: 'article:going-out-in-london' },
];

/** Resolve a term target to a path. */
export function hrefFor(to: LinkTerm['to']): string {
  return to.startsWith('article:')
    ? `/blog/${to.slice('article:'.length)}`
    : DESTINATIONS[to as DestinationKey].href;
}

/**
 * A run of article prose, split into plain text and links.
 *
 * Returned as data rather than HTML so the renderer stays a React component and no
 * article can ever inject markup. Article prose is trusted (it lives in this
 * repository) but building an HTML-string pipeline for it would mean the next person
 * to add a CMS inherits an injection hole.
 */
export type TextToken = { text: string } | { text: string; href: string };

const MAX_INLINE_LINKS = 10;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Every phrase flattened to its target, longest first.
 *
 * Longest-first across the *whole* registry, not within each term, is the only
 * ordering that produces stable output: with "venue map" ahead of "Venue Map Studio",
 * the studio would be linked as a map plus a stray "Studio". It also stops "tiers"
 * from pre-empting "tier ladder".
 */
const ORDERED_PHRASES: { phrase: string; to: LinkTerm['to'] }[] = LINK_TERMS.flatMap((term) =>
  term.phrases.map((phrase) => ({ phrase, to: term.to }))
).sort((a, b) => b.phrase.length - a.phrase.length);

export interface InlineLinkState {
  /** Hrefs already linked in this article. Each destination is linked once, at most. */
  used: Set<string>;
  /** The page being rendered, so an article never links to itself. */
  currentHref: string;
  count: number;
}

export function newLinkState(currentHref: string): InlineLinkState {
  return { used: new Set(), currentHref, count: 0 };
}

/**
 * Links the first occurrence of each registered phrase in a paragraph.
 *
 * Bounded deliberately. Linking every occurrence of every term produces a page that
 * reads like a 2004 SEO farm, dilutes the value of each link, and is one of the
 * clearer signals of manipulation a crawler can detect. One link per destination per
 * article, ten per article total, and never to the page you are already on.
 */
export function linkify(text: string, state: InlineLinkState): TextToken[] {
  let tokens: TextToken[] = [{ text }];

  for (const term of ORDERED_PHRASES) {
    if (state.count >= MAX_INLINE_LINKS) break;

    const href = hrefFor(term.to);
    if (href === state.currentHref || state.used.has(href)) continue;

    const pattern = new RegExp(`\\b${escapeRegExp(term.phrase)}\\b`, 'i');
    const next: TextToken[] = [];
    let linked = false;

    for (const token of tokens) {
      // Never re-scan a segment that is already a link — that is how nested anchors
      // and duplicated text get produced.
      if (linked || 'href' in token) {
        next.push(token);
        continue;
      }

      const match = pattern.exec(token.text);
      if (!match) {
        next.push(token);
        continue;
      }

      const before = token.text.slice(0, match.index);
      const after = token.text.slice(match.index + match[0].length);
      if (before) next.push({ text: before });
      // The matched casing is preserved, not the registry's: "Mobile money" at the
      // start of a sentence must not become "mobile money".
      next.push({ text: match[0], href });
      if (after) next.push({ text: after });

      linked = true;
      state.used.add(href);
      state.count += 1;
    }

    tokens = next;
  }

  return tokens;
}
