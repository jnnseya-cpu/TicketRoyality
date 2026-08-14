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
        text: 'Checkout-time holds — reserving stock while you enter card details — are specified but not yet built. Until they are, the buyer who loses that race has their payment confirmed and no ticket issued; it is flagged for refund rather than resolved silently. That is an honest description of a real gap, and it is why the tier count on an event page is availability rather than a promise.',
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
          'Capacity is enforced inside the transaction that issues tickets, so a tier can never exceed its quantity. If two payments race for the last ticket, one is issued and the other is flagged for refund rather than overselling the room.',
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
    status: 'draft',
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
        text: 'The model is last-touch within a stated attribution window, published to promoters before they start. Everyone is working to the same rule, and it is written down.',
      },
      { type: 'heading', text: 'Payouts run through the same ledger as everything else' },
      {
        type: 'paragraph',
        text: 'Promoter commission is calculated against completed, non-refunded sales and settles alongside your own payout. A refunded ticket reverses the commission on it, which is the behaviour you want and the behaviour that spreadsheets always get wrong.',
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
    status: 'draft',
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
      { type: 'heading', text: 'Earned on attendance, not on spend' },
      {
        type: 'paragraph',
        text: 'Points accrue when a ticket is scanned at the door rather than when it is bought. A scheme rewarding purchase rewards the person who buys ten tickets and attends alone; a scheme rewarding attendance rewards the person who actually shows up, which is the behaviour worth reinforcing.',
      },
    ],
    answers: [
      {
        question: 'How do fans get presale access?',
        answer:
          'Loyalty tier status, earned through attendance at previous events, unlocks presale windows before general on-sale. Points accrue when a ticket is scanned at the door rather than when it is purchased.',
      },
    ],
    linkSlots: [{ heading: 'Series worth following', query: '', href: '/events' }],
    productLinks: ['registerCustomer', 'events'],
  },
];
