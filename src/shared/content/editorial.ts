import type { Article } from '@/shared/content/articles';

/**
 * The editorial strands: city guides, data pieces and organiser guides.
 *
 * These are not about the product. They exist because a blog that only sells the
 * platform earns no links and answers no question anyone is actually searching for —
 * and the feature articles need something to link *from* that is not another feature
 * article.
 */
export const EDITORIAL_ARTICLES: Article[] = [
  {
    slug: 'what-a-ticket-actually-costs',
    title: 'What a ticket actually costs, and who takes what',
    kind: 'data',
    cluster: 'money',
    tags: ['fees', 'pricing', 'transparency'],
    excerpt:
      'Booking fees, service charges, and the gap between the price you saw and the price you paid — line by line.',
    published: '2026-07-14T09:00:00.000Z',
    updated: '2026-07-14T09:00:00.000Z',
    readMinutes: 6,
    author: 'TicketRoyality',
    blocks: [
      {
        type: 'paragraph',
        text: 'The most common complaint about buying tickets is not the price. It is discovering the price was not the price. A £30 ticket that reaches £38.50 at the last step feels like a trick, and it usually is one — not because the fees are unjustified, but because they arrived after the decision was made.',
      },
      { type: 'heading', text: 'Where the money goes on a £50 ticket' },
      {
        type: 'paragraph',
        text: 'Card processing is roughly £0.90 — 1.4% plus 20p — and it goes to the payment provider, not the platform. Our commission is 5% plus a 50p admin fee: £3.00. Of that, about £1.05 covers processing, infrastructure and support, leaving under £2 as actual margin.',
      },
      {
        type: 'paragraph',
        text: 'The organiser receives £47.00. If they absorbed the fee, you paid £50.00 flat. If they passed it on, you paid £53.00 and the £3.00 appears as a clearly labelled line.',
      },
      { type: 'heading', text: 'Both are fine. Hiding it is not.' },
      {
        type: 'paragraph',
        text: 'Organisers choose which model they use, and the fee is itemised at checkout either way. You can disagree with a fee you can see. A fee you find at the last step is a different thing entirely.',
      },
      { type: 'heading', text: 'What to look for anywhere you buy' },
      {
        type: 'list',
        items: [
          'Is the total shown before you enter card details, or after?',
          'Are there separate "service" and "booking" fees doing the same job twice?',
          'Does the refund policy appear before purchase or only in the confirmation email?',
          'On a resale site, is face value shown alongside the asking price?',
        ],
      },
    ],
    answers: [
      {
        question: 'How much does TicketRoyality charge per ticket?',
        answer:
          '5% of the ticket price plus a 50p admin fee. On a £50 ticket that is £3.00. Card processing of roughly 1.4% + 20p is charged separately by the payment provider.',
      },
      {
        question: 'Who pays the booking fee, the buyer or the organiser?',
        answer:
          'The organiser chooses. They can absorb the fee, in which case you pay the advertised price flat, or pass it on, in which case it appears as an itemised line at checkout. It is shown either way before you enter card details.',
      },
    ],
    linkSlots: [{ heading: 'Events with no booking fee at all', query: 'free', href: '/events' }],
    productLinks: ['events'],
  },
  {
    slug: 'going-out-in-london',
    title: 'Going out in London: what is actually on',
    kind: 'city_guide',
    cluster: 'buying',
    tags: ['london', 'discovery', 'city guide'],
    excerpt:
      'A guide that updates itself. Live listings, real prices, and what is worth the trip across the city.',
    published: '2026-07-28T09:00:00.000Z',
    updated: '2026-08-04T09:00:00.000Z',
    readMinutes: 4,
    author: 'TicketRoyality',
    blocks: [
      {
        type: 'paragraph',
        text: 'Most city guides are written once and left. This one is written once and the listings underneath refresh against what is genuinely on sale, so the recommendations do not quietly rot into a list of events that already happened.',
      },
      { type: 'heading', text: 'How to use it' },
      {
        type: 'paragraph',
        text: 'The blocks below pull live inventory. Sold out disappears; a new date appears without anyone editing this page. Prices shown are what you pay, itemised at checkout.',
      },
      { type: 'heading', text: 'A note on timing' },
      {
        type: 'paragraph',
        text: 'Weeknight events in London are consistently cheaper and easier to get into than the same act on a Saturday. If you are flexible, Tuesday to Thursday is where the value is.',
      },
    ],
    linkSlots: [
      { heading: 'On in London', query: 'london', href: '/events?q=London' },
      { heading: 'Live music', query: 'music', href: '/events' },
    ],
    productLinks: ['events', 'registerCustomer'],
  },
  {
    slug: 'organiser-guide-first-event',
    title: 'Running your first event: six things people get wrong',
    kind: 'guide',
    cluster: 'operations',
    tags: ['pricing', 'capacity', 'door', 'first event'],
    excerpt:
      'Pricing, timing, capacity and the door — written from what actually goes wrong rather than what sounds sensible.',
    published: '2026-08-01T09:00:00.000Z',
    updated: '2026-08-01T09:00:00.000Z',
    readMinutes: 8,
    author: 'TicketRoyality',
    blocks: [
      { type: 'heading', text: '1. Pricing the top tier last' },
      {
        type: 'paragraph',
        text: 'Most first-time organisers set a general admission price and add VIP as an afterthought. Do it the other way round. The top tier tells you what your best customer will pay, and everything below is positioned against that number.',
      },
      { type: 'heading', text: '2. Opening sales too early' },
      {
        type: 'paragraph',
        text: 'A four-month on-sale window does not sell more tickets. It spreads the same sales over longer and gives you four months of anxiety. Six to eight weeks is enough for almost everything below arena scale.',
      },
      { type: 'heading', text: '3. Guessing capacity' },
      {
        type: 'paragraph',
        text: 'Your venue has a licensed capacity and it is not the same as how many people fit. Publishing above it is a licensing breach and a fire safety problem, and finding out on the night means turning away people holding valid tickets.',
      },
      { type: 'heading', text: '4. One person on the door' },
      {
        type: 'paragraph',
        text: 'Scanning is fast; queueing is not. Two devices halve the queue and the second costs nothing — it is a phone someone already owns. Work out your arrival curve and staff the first thirty minutes properly.',
      },
      { type: 'heading', text: '5. No refund policy until someone asks' },
      {
        type: 'paragraph',
        text: 'Decide before you publish, state it on the event page, and stick to it. An unstated policy becomes whatever the angriest customer argues for.',
      },
      { type: 'heading', text: '6. Forgetting the follow-up' },
      {
        type: 'paragraph',
        text: 'The best time to sell your second event is the week after your first, to the people who came — not to a bought list, but to your own attendees, who already know whether they enjoyed it.',
      },
    ],
    linkSlots: [{ heading: 'Organisers doing this well', query: '', href: '/organisers' }],
    productLinks: ['registerOrganiser', 'howItWorks'],
  },
];
