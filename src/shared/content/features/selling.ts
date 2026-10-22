import type { Article } from '@/shared/content/articles';

const AUTHOR = 'TicketRoyality';

/** docs/04 M2, M7, M18, M19, M20, M24, M26 — the levers that move ticket sales. */
export const SELLING_ARTICLES: Article[] = [
  {
    slug: 'tiered-ticketing-and-seat-maps',
    title: 'Ticket tiers: the pricing lever most organisers leave unused',
    kind: 'feature',
    cluster: 'selling',
    tags: ['pricing', 'tiers', 'seating', 'revenue'],
    excerpt:
      'Early bird, general, VIP, table, group and comp — how the ladder works, why the top tier goes first, and what happens when a tier sells out mid-checkout.',
    published: '2026-08-14T10:00:00.000Z',
    updated: '2026-08-14T10:00:00.000Z',
    readMinutes: 7,
    author: AUTHOR,
    blocks: [
      {
        type: 'paragraph',
        text: 'Selling one ticket at one price means everyone who would have paid more, paid less. That gap is the largest single source of missed revenue at small and mid-size events, and closing it costs nothing but ten minutes of setup.',
      },
      { type: 'heading', text: 'The tiers available' },
      {
        type: 'list',
        items: [
          'Early bird — a fixed quantity, or a fixed date, or both; the deadline is what makes it work',
          'General admission — your reference price, everything else positioned against it',
          'VIP — priority entry, a better view, a drink, or all three',
          'Tables and booths — sold as a unit at a unit price, with a headcount attached',
          'Group tickets — a per-head discount above a threshold, which is how you turn one buyer into six attendees',
          'Complimentary — zero price, still a real ticket with a real scan, so your door numbers stay honest',
        ],
      },
      { type: 'heading', text: 'Price the top first' },
      {
        type: 'paragraph',
        text: 'Set the top tier before the bottom one. It establishes what your best customer will pay, and everything below it is then positioned relative to a real number rather than guessed upward from general admission. When your top tier sells out first, that is not a success — it is a signal you underpriced it.',
      },
      { type: 'heading', text: 'Availability windows do the work for you' },
      {
        type: 'paragraph',
        text: 'Each tier carries its own on-sale and off-sale times. Early bird closing at midnight on a stated date creates a genuine deadline, and a genuine deadline is the only reliably effective sales mechanic in this business. A discount with no end date is just a lower price.',
      },
      { type: 'heading', text: 'What happens when a tier sells out mid-checkout' },
      {
        type: 'paragraph',
        text: 'Capacity is enforced at issuance, inside the same database transaction that writes the tickets and increments the sold count. Two buyers racing for the last two tickets cannot both succeed: the transaction replays if the tier changed underneath, so exactly one wins. A tier can never exceed the quantity you set.',
      },
      {
        type: 'paragraph',
        text: 'Checkout-time holds now close that gap on the single-event path: starting checkout reserves the stock for fifteen minutes, so the second buyer for the last ticket is refused before entering card details rather than after paying, and the hold is consumed in the same write that issues the ticket so a seat never reads as free in between. The multi-event basket still resolves at issuance, because holding stock across several events at once needs a transaction that spans them — so there the loser of a true race is refunded rather than held. Either way nobody is oversold and nothing is resolved silently.',
      },
      { type: 'heading', text: 'Reserved seating on top' },
      {
        type: 'paragraph',
        text: 'Where you have a seat map, tiers become sections: the front six rows priced as one thing, the balcony as another. Buyers choose an actual seat, and the ticket carries the row and number through to the door.',
      },
    ],
    answers: [
      {
        question: 'How many ticket types can I sell for one event?',
        answer:
          'As many tiers as you need — early bird, general, VIP, tables, group and complimentary — each with its own price, quantity and on-sale window. With a seat map, tiers become priced sections.',
      },
      {
        question: 'What stops two people buying the last ticket?',
        answer:
          'Capacity is enforced inside the transaction that issues tickets, so a tier can never exceed its quantity. On a single-event checkout a fifteen-minute hold reserves the stock up front, so the second buyer is refused before paying; in a multi-event basket the loser of a true race is refunded rather than oversold.',
      },
    ],
    linkSlots: [{ heading: 'Events with tiered pricing', query: '', href: '/events' }],
    productLinks: ['registerOrganiser', 'howItWorks'],
  },
  {
    slug: 'coupons-and-promotions',
    title: 'Discount codes that do not quietly destroy your margin',
    kind: 'feature',
    cluster: 'selling',
    tags: ['pricing', 'marketing', 'discounts', 'revenue'],
    excerpt:
      'Percentage and fixed codes, caps, tier restrictions, per-customer limits and expiry — plus the reporting that tells you whether a code created a sale or subsidised one.',
    published: '2026-08-14T10:05:00.000Z',
    updated: '2026-08-14T10:05:00.000Z',
    readMinutes: 5,
    author: AUTHOR,
    blocks: [
      {
        type: 'paragraph',
        text: 'A discount code is easy to create and hard to evaluate. The uncomfortable question is not how many were redeemed — it is how many of those people would have bought anyway. A code redeemed by someone already on your event page did not create a sale. It gave away margin on one you already had.',
      },
      { type: 'heading', text: 'The controls that matter' },
      {
        type: 'list',
        items: [
          'Percentage or fixed amount, with an optional maximum discount so 20% off does not become £40 off a table',
          'Restricted to specific tiers — discount general admission without touching VIP',
          'Total redemption limit, and a separate per-customer limit that stops one person clearing the allocation',
          'Start and expiry times, because an unexpiring code circulates forever',
          'Minimum spend, which is how a code raises basket size instead of lowering it',
        ],
      },
      { type: 'heading', text: 'Reporting that answers the real question' },
      {
        type: 'paragraph',
        text: 'Each code reports redemptions, revenue after discount, and the discount given away as a share of gross. Read alongside your sales curve, a code that spikes redemptions without moving the curve is subsidising existing demand — and the right response is to stop running it, not to run it harder.',
      },
      { type: 'heading', text: 'Where codes genuinely work' },
      {
        type: 'paragraph',
        text: 'Codes work when they are attached to a channel you can otherwise not measure: a specific radio read, a partner\'s newsletter, a flyer at a different venue. The code is the measurement instrument. Used that way it earns its margin back in information even when it loses it in revenue.',
      },
    ],
    answers: [
      {
        question: 'Can I limit a discount code to one use per customer?',
        answer:
          'Yes. Codes carry a total redemption limit and a separate per-customer limit, plus tier restrictions, minimum spend, a maximum discount cap and an expiry time.',
      },
    ],
    linkSlots: [{ heading: 'On sale now', query: '', href: '/events' }],
    productLinks: ['registerOrganiser', 'growth'],
  },
  {
    slug: 'affiliate-and-promoter-network',
    status: 'shipped',
    title: 'Pay promoters for sales, not for promises',
    kind: 'feature',
    cluster: 'selling',
    tags: ['affiliate', 'promoters', 'attribution', 'revenue'],
    excerpt:
      'Tracked links, per-promoter rates, and an attribution model decided in advance — because the arguments about who gets paid all come from deciding it afterwards.',
    published: '2026-08-14T10:10:00.000Z',
    updated: '2026-08-14T10:10:00.000Z',
    readMinutes: 6,
    author: AUTHOR,
    blocks: [
      {
        type: 'paragraph',
        text: 'Street teams, club promoters and partner venues have always been paid on a mixture of trust and shouting. The promoter says they brought forty people. You think it was closer to fifteen. Neither of you can prove it and one of you is going to be annoyed.',
      },
      { type: 'heading', text: 'How it works' },
      {
        type: 'paragraph',
        text: 'Each promoter gets their own tracked link to your event. Sales through that link are attributed to them automatically, at a rate you set per promoter — a percentage, a fixed amount per ticket, or a tier-specific rate. Their earnings appear in their own dashboard in real time, which removes most of the arguing before it starts.',
      },
      { type: 'heading', text: 'Attribution has to be decided, not discovered' },
      {
        type: 'paragraph',
        text: 'Someone clicks promoter A\'s link on Tuesday, does not buy, then clicks promoter B\'s on Friday and buys. Who gets paid? There is no universally correct answer, but there is a wrong way to handle it: leaving it undefined until the first time it happens and then choosing whichever answer is cheaper.',
      },
      {
        type: 'paragraph',
        text: 'The rule here is the simplest one that can be stated in a sentence: the link a buyer arrived through last is the one credited, recorded on the order at the moment the money lands. There is no decaying window and no split between two promoters — those need a model everyone can check, and half of one is worse than none. If two of your promoters both touched a sale, the second one is paid.',
      },
      { type: 'heading', text: 'Commission is recorded server-side, once' },
      {
        type: 'paragraph',
        text: 'The rate comes from the stored link, never from the browser — a code travels with the buyer and nothing else does, so a crafted request cannot name its own commission. Each attribution is keyed to the payment that created it, so a redelivered webhook cannot pay a promoter twice. An allocation that straddles a boundary earns only on the part inside it.',
      },
      {
        type: 'paragraph',
        text: 'What is not built, and worth saying: a refund does not yet reverse the commission recorded against it, and payouts are not automated — commission is a figure you can see and reconcile, not money that moves on its own. Check the report before you pay anybody.',
      },
      { type: 'heading', text: 'Where this differs from the influencer programme' },
      {
        type: 'paragraph',
        text: 'The affiliate network is yours: your promoters, your rates, your events. The platform-wide influencer programme is a separate scheme with its own qualification threshold and a flat 1% rate across the catalogue. A person can be in both.',
      },
    ],
    answers: [
      {
        question: 'How do I track which promoter sold which tickets?',
        answer:
          'Each promoter gets a tracked link. Sales through it are attributed automatically on a last-touch basis within a stated attribution window, at a per-promoter rate you set, and their earnings appear in their dashboard in real time.',
      },
    ],
    linkSlots: [{ heading: 'Events you could promote', query: '', href: '/events' }],
    productLinks: ['growth', 'registerOrganiser'],
  },
  {
    slug: 'referral-and-influencer-programme',
    status: 'draft',
    title: 'Get paid 1% for sending people to events',
    kind: 'feature',
    cluster: 'selling',
    tags: ['referral', 'influencer', 'affiliate', 'growth'],
    excerpt:
      'Anyone can refer. Creators past 10,000 followers earn 1% of every ticket sold through their link, across the whole catalogue, for as long as the link keeps working.',
    published: '2026-08-14T10:15:00.000Z',
    updated: '2026-08-14T10:15:00.000Z',
    readMinutes: 5,
    author: AUTHOR,
    blocks: [
      {
        type: 'paragraph',
        text: 'The people who genuinely drive ticket sales are rarely the ones being paid for it. Someone with nine thousand engaged followers in one city moves more tickets for a local promoter than a national advertising spend, and historically has been compensated with a guest list spot.',
      },
      { type: 'heading', text: 'Two levels' },
      {
        type: 'paragraph',
        text: 'The referral programme is open to everyone with an account. Share an event, and purchases through your link are credited to you. It is designed for the ordinary case: you are going, you want your friends to come, and the platform should notice you brought them.',
      },
      {
        type: 'paragraph',
        text: 'The influencer programme sits above it. Verify a following of 10,000 or more and you earn 1% of the ticket value on every sale through your links — not on one campaign, not on one organiser, but across the entire catalogue, continuously.',
      },
      { type: 'heading', text: 'Why 1% across everything beats a bigger one-off rate' },
      {
        type: 'paragraph',
        text: 'A 10% campaign fee on one event pays once and ends. A 1% rate across every event you ever recommend compounds with your audience: the post you made in March keeps earning in September, because the link still works and the catalogue behind it keeps refreshing. It also aligns the incentive properly — you earn more by recommending things people actually want to attend than by pushing one paid placement.',
      },
      { type: 'heading', text: 'Verification, and why it exists' },
      {
        type: 'paragraph',
        text: 'The threshold is verified rather than self-declared, because a commission programme with a self-reported qualification is a fraud programme with extra steps. Connect the account, get verified, and the rate applies from approval onward.',
      },
      { type: 'heading', text: 'Getting paid' },
      {
        type: 'paragraph',
        text: 'Earnings accrue per completed sale and are visible as they happen. Refunded tickets reverse the commission attached to them. Payouts run on the same schedule and through the same rails as organiser payouts, including mobile money where card payouts are impractical.',
      },
    ],
    answers: [
      {
        question: 'How do I earn money recommending events?',
        answer:
          'Anyone with an account can share tracked referral links. Creators who verify a following of 10,000 or more earn 1% of the ticket value on every sale through their links, across the whole catalogue, continuously rather than per campaign.',
      },
      {
        question: 'Do I need 10,000 followers to refer people?',
        answer:
          'No. The referral programme is open to every account holder. The 10,000 threshold applies only to the 1% influencer commission tier, and it is verified rather than self-declared.',
      },
    ],
    linkSlots: [{ heading: 'Events worth recommending', query: '', href: '/events' }],
    productLinks: ['growth', 'registerCustomer'],
  },
  {
    slug: 'homepage-video-advertising',
    title: 'Ten video slots on the homepage, priced by the second',
    kind: 'feature',
    cluster: 'selling',
    tags: ['advertising', 'marketing', 'revenue', 'homepage'],
    excerpt:
      'A rotating carousel of ten paid video placements, up to three minutes each, priced by duration — the front page as inventory rather than decoration.',
    published: '2026-08-14T10:20:00.000Z',
    updated: '2026-08-14T10:20:00.000Z',
    readMinutes: 5,
    author: AUTHOR,
    blocks: [
      {
        type: 'paragraph',
        text: 'Every ticketing homepage carries a hero banner nobody paid for. It is the most valuable space on the site and it is usually spent on a stock photograph of a crowd with their hands up.',
      },
      { type: 'heading', text: 'What the placement is' },
      {
        type: 'paragraph',
        text: 'Ten slots, rotating, on the homepage. Each holds a video of up to three minutes. Placements are bought for a run of dates and priced by video duration — a thirty-second trailer costs less than a full three-minute piece, because it occupies less of the viewer\'s attention and less of the rotation.',
      },
      { type: 'heading', text: 'Who it is for' },
      {
        type: 'list',
        items: [
          'A festival announcing a lineup, where the video is the announcement',
          'A venue with a season to sell rather than a single date',
          'A tour hitting several cities, promoted once rather than event by event',
          'A brand sponsoring a category rather than a specific event',
        ],
      },
      { type: 'heading', text: 'Priced by duration, not by impression' },
      {
        type: 'paragraph',
        text: 'Impression pricing on a homepage carousel is close to meaningless at this scale, and it invites the kind of traffic inflation that makes advertising numbers untrustworthy. Duration is something both sides can verify: you know exactly how long your video is, and you know exactly what a slot costs.',
      },
      { type: 'heading', text: 'Placements expire on their own' },
      {
        type: 'paragraph',
        text: 'A placement has a run window and clears itself when it ends, which is handled by a scheduled job rather than by someone remembering. A homepage advertising a festival that happened three weeks ago is worse for the advertiser than no advertising at all.',
      },
    ],
    answers: [
      {
        question: 'How much does homepage advertising cost?',
        answer:
          'Placements are priced by video duration rather than impressions, for a run of dates. There are ten rotating slots and each video can run up to three minutes.',
      },
    ],
    linkSlots: [{ heading: 'Currently featured', query: '', href: '/events' }],
    productLinks: ['contact', 'registerOrganiser'],
  },
  {
    slug: 'sponsor-activation',
    status: 'draft',
    title: 'Sponsorship you can actually report on',
    kind: 'feature',
    cluster: 'selling',
    tags: ['sponsors', 'revenue', 'reporting', 'brands'],
    excerpt:
      'Branded placements across the event page, ticket and comms, with aggregate-only reporting and a minimum cohort size that stops a "segment" being four identifiable people.',
    published: '2026-08-14T10:25:00.000Z',
    updated: '2026-08-14T10:25:00.000Z',
    readMinutes: 5,
    author: AUTHOR,
    blocks: [
      {
        type: 'paragraph',
        text: 'Sponsorship at event scale usually ends with a PDF containing a photograph of a banner and an estimated footfall figure nobody can check. The sponsor knows it is soft, the organiser knows it is soft, and the renewal conversation is correspondingly difficult.',
      },
      { type: 'heading', text: 'Where a sponsor can appear' },
      {
        type: 'list',
        items: [
          'The event page, as a named partner rather than a logo in a footer',
          'The ticket itself — the surface with the highest open rate in the product',
          'Confirmation and reminder messages, within the limits on what may be attached to a transactional message',
          'A category or a city, rather than a single event',
        ],
      },
      { type: 'heading', text: 'The reporting boundary is the product' },
      {
        type: 'paragraph',
        text: 'Sponsors receive aggregate reporting: reach, attendance, demographic distribution, engagement with their placement. They do not receive attendee lists, contact details or individual-level behaviour, and this is not negotiable at any sponsorship value.',
      },
      {
        type: 'paragraph',
        text: 'Any figure covering fewer than a stated minimum number of people is suppressed rather than displayed. A demographic breakdown showing a segment of four is not anonymous data — it is four identifiable attendees with a label attached, and in a small venue the organiser could name them.',
      },
      { type: 'heading', text: 'Why that constraint sells better' },
      {
        type: 'paragraph',
        text: 'A sponsor buying a placement wants to renew without a legal review each time. Aggregate reporting with a published floor is defensible to their own compliance team, which makes the renewal an easy yes rather than an argument.',
      },
    ],
    answers: [
      {
        question: 'What data do sponsors get about attendees?',
        answer:
          'Aggregate reach, attendance, demographic distribution and placement engagement. No attendee lists, contact details or individual behaviour, and any cohort below a minimum size is suppressed rather than shown.',
      },
    ],
    linkSlots: [{ heading: 'Sponsored events', query: '', href: '/events' }],
    productLinks: ['contact', 'registerOrganiser'],
  },
  {
    slug: 'loyalty-and-fan-rewards',
    status: 'shipped',
    title: 'Rewarding the people who keep coming back',
    kind: 'feature',
    cluster: 'selling',
    tags: ['loyalty', 'retention', 'rewards', 'repeat'],
    excerpt:
      'Points, tiers, presale access and priority entry — aimed at the repeat attendance rate, which is the number that decides whether an event series survives.',
    published: '2026-08-14T10:30:00.000Z',
    updated: '2026-08-14T10:30:00.000Z',
    readMinutes: 5,
    author: AUTHOR,
    blocks: [
      {
        type: 'paragraph',
        text: 'Acquiring a new attendee costs several times more than bringing back one who already enjoyed themselves, and yet almost all event marketing spend goes to the first group. The repeat rate is the number that quietly decides whether a monthly night is still running in a year.',
      },
      { type: 'heading', text: 'What fans earn' },
      {
        type: 'list',
        items: [
          'Points on completed attendance — scanned in, not merely purchased, which is the distinction that makes it mean something',
          'Tier status that unlocks presale windows before general on-sale',
          'Priority entry, which costs the organiser nothing and is valued disproportionately on a cold night',
          'Redeemable credit against future tickets',
        ],
      },
      { type: 'heading', text: 'Presale access is the strongest reward available' },
      {
        type: 'paragraph',
        text: 'For an event that sells out, early access is worth more than a discount and costs the organiser nothing at all — the tickets sell either way. It converts loyalty into something the fan genuinely wants while leaving margin untouched, which is a rare combination.',
      },
      { type: 'heading', text: 'Counted from tickets, per organiser' },
      {
        type: 'paragraph',
        text: 'Standing is worked out live from the tickets somebody actually holds with you, rather than kept as a stored points balance. That matters more than it sounds: a refund removes the event from the count on its own, with no repair step and no counter quietly drifting out of line with reality. A cancelled or refunded ticket earns nothing.',
      },
      {
        type: 'paragraph',
        text: 'It is per organiser rather than platform-wide. Somebody who comes to your nights every month is your regular, and that standing is yours — not something they carry across to a competitor who happens to use the same platform.',
      },
    ],
    answers: [
      {
        question: 'How do fans get presale access?',
        answer:
          'Loyalty tier status unlocks presale windows before general on-sale, enforced server-side rather than by a secret link. Standing is counted live from the tickets somebody holds with that organiser, so a refunded ticket stops counting on its own.',
      },
    ],
    linkSlots: [{ heading: 'Series worth following', query: '', href: '/events' }],
    productLinks: ['registerCustomer', 'events'],
  },
  {
    slug: 'white-label-your-own-brand',
    title: 'White-label: sell under your own brand, not ours',
    kind: 'feature',
    cluster: 'selling',
    tags: ['white label', 'branding', 'fees'],
    excerpt:
      'Run the event page and checkout entirely under your own name, set your own booking fee, and keep the payout. Here is exactly what changes and what we take.',
    published: '2026-10-22T10:00:00.000Z',
    updated: '2026-10-22T10:00:00.000Z',
    readMinutes: 6,
    author: AUTHOR,
    blocks: [
      {
        type: 'paragraph',
        text: 'For most organisers, a ticketing platform showing its own name on the checkout is harmless. For some — an established venue, a promoter with a brand people already trust, an agency selling on behalf of clients — it is the whole problem. The buyer should feel they are dealing with you, start to finish, not with a third party they have never heard of. White-label is how that works on TicketRoyality.',
      },
      { type: 'heading', text: 'What white-label actually changes' },
      {
        type: 'paragraph',
        text: 'With it switched on, the event page and the checkout run under your own name and brand. The buyer sees your identity on the page where they decide and the page where they pay — the two moments that matter — rather than ours. We stay out of sight. Underneath, nothing about the engine changes: the same secure tickets in the same wallet, the same anti-fraud door, the same idempotent issuance that cannot sell one seat twice. You are relabelling the shopfront, not rebuilding the platform, so none of the reliability is traded away for the branding.',
      },
      { type: 'heading', text: 'You set the fee' },
      {
        type: 'paragraph',
        text: 'On the standard plan the buyer pays one all-in service fee and you keep the full face value. White-label hands you the dial: you set the booking fee your buyers pay, in your own name. That is the point of it — a venue that has always charged its own booking fee keeps doing exactly that, on its own page, at its own number, rather than inheriting ours.',
      },
      { type: 'heading', text: 'What we take, and why there is a floor' },
      {
        type: 'paragraph',
        text: 'Our cut under white-label is a small percentage of each paid ticket, never below fifty pence per ticket. The percentage keeps it fair on cheap tickets; the floor keeps a sub-one-pound ticket from costing us more to process than it earns. It is deliberately small because the arrangement is a relabelling, not a different service — and the fee engine refuses a configuration that would leave you out of pocket once card costs are counted, rather than letting you discover that one reconciliation later.',
      },
      { type: 'heading', text: 'How you get paid' },
      {
        type: 'paragraph',
        text: 'Settlement pays you the white-label amount — face value plus the fee you set, less our small cut — computed from the exact quote the order was made under, not recomputed from a later config. The arithmetic is done server-side and stored with the order, so a price change next month never rewrites what a sale last month owes you. It is the same settlement path every payout uses; white-label only changes the numbers it reads, never the guarantees around them.',
      },
      { type: 'heading', text: 'What it does not change' },
      {
        type: 'paragraph',
        text: 'Branding is the only thing white-label touches. Refunds, chargebacks and disputes still run the same route, the door still scans the same tickets, and a buyer who needs help still reaches a real process rather than a dead end with your logo on it. For an agency selling on behalf of several clients, that matters more than the logo does: each client gets their own named front without you running a different, lightly-tested checkout for each one. One engine, many fronts, is far safer than many engines.',
      },
      { type: 'heading', text: 'Enabled by arrangement' },
      {
        type: 'paragraph',
        text: 'White-label is not a self-serve toggle. It is granted per organiser, because setting your own fee under your own brand is a commercial arrangement rather than a checkbox — and because the honest version of this feature is one where we have agreed the terms with you, not one where anyone can quietly rebrand the platform and set a fee we never saw. If running the whole thing under your own name is what you need, that is a conversation, and a short one.',
      },
    ],
    answers: [
      {
        question: 'Can I run ticket sales under my own brand instead of TicketRoyality?',
        answer:
          'Yes — white-label puts your name and branding on the event page and the checkout, the two places the buyer decides and pays. The engine underneath is unchanged: the same secure tickets, anti-fraud door and idempotent issuance.',
      },
      {
        question: 'What does white-label cost, and how do I get it?',
        answer:
          'You set the booking fee your buyers pay; we take a small percentage of each paid ticket, never below 50p. It is granted per organiser by arrangement rather than a self-serve toggle, and the fee engine refuses a setup that would leave you out of pocket after card costs.',
      },
    ],
    linkSlots: [{ heading: 'See what organisers are running', query: '', href: '/organisers' }],
    productLinks: ['registerOrganiser', 'contact'],
  },
  {
    slug: 'season-tickets-and-presales',
    title: 'Season tickets and presales: sell the whole run',
    kind: 'feature',
    cluster: 'selling',
    tags: ['season tickets', 'presales', 'renewals'],
    excerpt:
      'Sell a pass across every fixture, reward your regulars with first access, and keep inventory honest — each pass is a real book of tickets, not a door card.',
    published: '2026-10-22T10:00:00.000Z',
    updated: '2026-10-22T10:00:00.000Z',
    readMinutes: 6,
    author: AUTHOR,
    blocks: [
      {
        type: 'paragraph',
        text: 'A club night that runs every month, a theatre season, a home fixture list — the organisers who run them do not want to sell each date from scratch, and the regulars do not want to queue for each one. A season pass solves both, but only if the pass is a real thing the door and the accounts both understand, rather than a label that falls apart on the night when a steward is holding a phone and a queue is forming behind it.',
      },
      { type: 'heading', text: 'A pass is a book of tickets, not a magic card' },
      {
        type: 'paragraph',
        text: 'On TicketRoyality a pass issues a real ticket for every covered fixture, rather than admitting on the pass itself. That is what a season ticket physically is — a book of tickets — and it matters for a concrete reason: a ticket redeems once, which is what stops one credential admitting two people, and a pass that tried to admit at twenty fixtures would mean either weakening that rule or growing a second door path nobody tests. Every pass ticket flows through the same door, zones, transfer and refund logic as any other ticket, because it is one.',
      },
      { type: 'heading', text: 'Inventory stays honest' },
      {
        type: 'paragraph',
        text: 'Each fixture in the pass consumes real inventory in the tier you chose, so twenty pass holders are twenty seats gone from every night — a number that is actually subtracted, not a figure nobody added up until the room was too full. Availability is checked across every fixture before the card is charged, because a pass that seats somebody at nine of ten nights is a refund and an apology waiting to happen. And the price is spread across the fixtures, so refunding one cancelled night reverses a sensible share rather than the whole pass or nothing.',
      },
      { type: 'heading', text: 'Presales reward the regulars, enforced where it counts' },
      {
        type: 'paragraph',
        text: 'A presale on the platform is not a separate product — it is an early tier with its own on-sale window, so it sells, counts and reconciles through the same path as everything else. Crucially the window is enforced server-side at checkout, not with a greyed-out button: a disabled button is still on sale to anyone who can post a form, and an early price given away by a crafted request cannot be taken back. A tier outside its window tells a buyer when it opens rather than how many are left.',
      },
      { type: 'heading', text: 'First access for people who actually turn up' },
      {
        type: 'paragraph',
        text: 'A loyalty-gated presale opens early to the people who keep coming back, counted by events attended rather than tickets bought — because four tickets to one show is a group of friends, and counting them would hand the best window to whoever books for their mates. Standing is per organiser, never platform-wide, and the gate fails closed on an outage, because an early window given away by accident is not recoverable. It is a way to thank your regulars that cannot be gamed by buying in bulk once.',
      },
      { type: 'heading', text: 'The rest still just works' },
      {
        type: 'paragraph',
        text: 'Because every pass fixture is an ordinary ticket, everything downstream behaves the way it already does. A pass holder can transfer a single night to a friend who can make it, and the transfer is the same secure handoff as any other — the old copy stops working the moment the new one lands. A cancelled fixture refunds its share of the pass without unpicking the rest of the season. Zones, the offline door and the wallet all treat a pass ticket as what it is: one more real ticket, with nothing special to remember and nothing new that can go wrong on the night.',
      },
    ],
    answers: [
      {
        question: 'How do season tickets work on TicketRoyality?',
        answer:
          'A pass issues a real ticket for every covered fixture — a book of tickets — each redeeming once and consuming real inventory in the tier you chose. Availability is checked across every fixture before charging, and the price is spread so refunding one cancelled night reverses a sensible share.',
      },
      {
        question: 'Can I give my regulars early access to tickets?',
        answer:
          'Yes — a presale is an early tier with its own on-sale window, enforced server-side at checkout. A loyalty-gated presale opens early to people counted by events attended, per organiser, so first access goes to those who actually keep turning up.',
      },
    ],
    linkSlots: [{ heading: 'Series and seasons worth following', query: '', href: '/events' }],
    productLinks: ['registerOrganiser', 'howItWorks'],
  },
  {
    slug: 'pay-what-you-want-pricing',
    title: 'Pay what you want: let the buyer name the price',
    kind: 'feature',
    cluster: 'selling',
    tags: ['pricing', 'flexible pricing', 'community'],
    excerpt:
      'Let buyers name their price above a floor you set — a church door, a community night, a sliding-scale event — priced safely on the server and shown all-in.',
    published: '2026-10-22T10:00:00.000Z',
    updated: '2026-10-22T10:00:00.000Z',
    readMinutes: 6,
    author: AUTHOR,
    blocks: [
      { type: 'paragraph', text: 'A fixed price is the right tool most of the time, and the wrong one more often than organisers admit. A church with a suggested donation at the door, a community night that does not want to turn anyone away over money, a sliding-scale workshop where some people can pay more so others can pay less — for all of these, naming a single number either leaves money on the table or shuts people out. TicketRoyality lets a tier be pay-what-you-want instead, and does it without opening a hole anyone can drive a cheap ticket through.' },
      { type: 'heading', text: 'How it works' },
      { type: 'paragraph', text: 'A ticket tier can be set to "choose" rather than "fixed". On a choose tier the buyer names the amount they will pay, floored at a minimum you set — and that minimum can be zero, which is a real thing a church or a free community event genuinely needs. Everything else about the ticket is unchanged: it issues, scans, transfers and refunds exactly like any other, because a pay-what-you-want ticket is a normal ticket that happened to be priced by the person buying it.' },
      { type: 'heading', text: 'The floor is yours, and the ceiling protects the buyer' },
      { type: 'paragraph', text: 'The minimum you set is the floor, and it is what the catalogue advertises — the "from" price a browser sees, shown all-in with any fee included, so the figure on the listing is still the honest one. There is also a ceiling, set far above any realistic gift, for one practical reason: it stops a mistyped amount — an extra zero, a fat-fingered field — from becoming an unexplained card decline or a payment someone has to chase a refund for. The buyer is free within a sensible range and protected at the edge of it.' },
      { type: 'heading', text: 'Why it is safe' },
      { type: 'paragraph', text: 'The price a buyer names is only ever accepted on the server. One function resolves the line price, and it runs in the checkout route on both the single-event and the basket path — there is no second place a posted amount is trusted. The rule it enforces is stated precisely rather than relaxed: a fixed tier ignores the requested amount entirely, reading the mode from the stored event and never from the form. So a crafted request cannot turn a £250 fixed ticket into a one-pound "donation" — the only tiers that accept a chosen price are the ones you marked choose, and the floor on those is enforced the same way.' },
      { type: 'heading', text: 'Who actually uses it' },
      { type: 'paragraph', text: 'The pattern shows up more than you would expect once you look for it. A grassroots venue puts on a night and asks for five pounds or whatever you can spare, and takes more on the door because the people who can give ten now do. A workshop runs a sliding scale so a student and a salaried attendee both come. A community group runs a free event with a choose tier floored at zero, so the people who want to chip in have a frictionless way to, and nobody is forced to. In each case the floor protects the event and the freedom above it quietly raises the average.' },
      { type: 'heading', text: 'What it does not do' },
      { type: 'paragraph', text: 'Pay-what-you-want is a price on a ticket, not a charitable gift. If you are raising money for a cause and want to reclaim Gift Aid, that runs through the separate donation path, because a payment for admission and a gift are different things in law and must not be blurred. Pay-what-you-want is the right tool when you want the admission itself to be flexible — a door that lets everyone in and lets those who can, pay more — and it is deliberately kept simple so it cannot quietly become something it is not.' },
    ],
    answers: [
      {
        question: 'Can buyers choose how much to pay for a ticket?',
        answer:
          "Yes — set a tier to 'choose' and the buyer names their amount above a floor you set, which can be zero. The price is resolved on the server, so a fixed-price ticket can never be talked down by a crafted request.",
      },
      {
        question: 'Is pay-what-you-want the same as taking a donation?',
        answer:
          'No. It is a flexible price on a ticket for admission, not a charitable gift. Gift Aid and donations run on a separate path, because in law a payment for admission and a gift are different things that must not be blurred.',
      },
    ],
    linkSlots: [{ heading: 'Events on sale now', query: '', href: '/events' }],
    productLinks: ['registerOrganiser', 'howItWorks'],
  },
];
