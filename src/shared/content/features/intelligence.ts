import type { Article } from '@/shared/content/articles';

const AUTHOR = 'TicketRoyality';

/** docs/04 M22, M23, M3a, M6, M9 — what the AI builds, and what it refuses to do alone. */
export const INTELLIGENCE_ARTICLES: Article[] = [
  {
    slug: 'ai-event-architect',
    title: 'Give it a poster, get a complete event',
    kind: 'feature',
    cluster: 'intelligence',
    tags: ['ai', 'event setup', 'pricing', 'automation'],
    excerpt:
      'Upload what you already have — a flyer, a paragraph, a venue name — and get a full draft event with tiers, pricing and copy. It never publishes on its own.',
    published: '2026-08-14T09:00:00.000Z',
    updated: '2026-08-14T09:00:00.000Z',
    readMinutes: 7,
    author: AUTHOR,
    blocks: [
      {
        type: 'paragraph',
        text: 'Setting up an event is about forty fields. Title, description, category, venue, capacity, door times, ticket tiers, prices, availability windows, refund terms, images, tags. Most of that information already exists — it is on the poster, in the email thread, in the venue booking confirmation — and retyping it into a form is the single most tedious hour in this job.',
      },
      {
        type: 'paragraph',
        text: 'The AI Event Architect takes whatever you already have and produces a complete draft. A photograph of a flyer is enough. So is a paragraph typed badly into a box at midnight.',
      },
      { type: 'heading', text: 'What comes back' },
      {
        type: 'list',
        items: [
          'Title, long description and short summary, written in the voice of the event rather than in press-release English',
          'Category and sub-category, matched against the taxonomy the search filters actually use',
          'A tier structure with prices, quantities and on-sale windows',
          'Door times, age policy and accessibility notes where the source material implies them',
          'Suggested tags, which is what most organisers skip and then wonder why discovery is poor',
        ],
      },
      { type: 'heading', text: 'Pricing arrives with its working shown' },
      {
        type: 'paragraph',
        text: 'A number with no reasoning behind it is worse than no number, because you cannot tell whether to argue with it. Every price the architect proposes comes with the comparison set it used: similar events, in a similar city, at a similar capacity, in a similar month, and what they charged. If you disagree, you can see exactly which assumption to change.',
      },
      {
        type: 'paragraph',
        text: 'It also proposes the tier ladder rather than a single price, because the ladder is where the revenue is. Setting general admission first and adding VIP as an afterthought is the most common pricing mistake in the business.',
      },
      { type: 'heading', text: 'It creates a draft. It never publishes.' },
      {
        type: 'paragraph',
        text: 'This is a hard boundary, not a setting. No agent on this platform can put an event on sale, take money, or change a price on a live event. The architect writes a draft into your dashboard and stops. You review it, change what is wrong, and press publish yourself.',
      },
      {
        type: 'paragraph',
        text: 'The reason is simple: a model that misreads a flyer and publishes a £5 ticket for a £50 event has sold real tickets at the wrong price to real people, and those sales are binding. There is no version of that failure that is recoverable, so the capability does not exist.',
      },
      { type: 'heading', text: 'Every field says where it came from' },
      {
        type: 'paragraph',
        text: 'Each generated field carries its provenance: extracted from your source material, inferred from comparable events, or invented as a placeholder. Placeholders are visually flagged and block publishing until you deal with them. You should never discover after the fact that the model guessed a door time.',
      },
      { type: 'heading', text: 'What it costs before you run it' },
      {
        type: 'paragraph',
        text: 'A full build is 35–45 ACU and the quote appears before the run starts, not after. Regeneration is scoped — redoing just the pricing costs a fraction of redoing everything, so iterating on one section is cheap.',
      },
      { type: 'heading', text: 'The images are the part with real risk' },
      {
        type: 'paragraph',
        text: 'Generated imagery is offered, watermarked as generated, and never applied to an artist likeness. If your source material contains a photograph of a performer, it is used as supplied or not at all. Synthesising a picture of a real person who will be on that stage is a legal problem and an ethical one, and no amount of convenience justifies it.',
      },
    ],
    answers: [
      {
        question: 'Can AI create my whole event automatically?',
        answer:
          'It creates a complete draft — title, description, categories, ticket tiers, prices and door details — from a flyer, photo or paragraph. It cannot publish it. A human reviews and presses publish, because a mispriced live event sells real tickets at the wrong price.',
      },
      {
        question: 'How does the AI decide ticket prices?',
        answer:
          'It compares similar events by city, capacity, category and month, and shows you the comparison set alongside the proposal so you can see which assumption to challenge.',
      },
    ],
    linkSlots: [{ heading: 'Events built on the platform', query: '', href: '/events' }],
    productLinks: ['registerOrganiser', 'howItWorks'],
  },
  {
    slug: 'venue-map-studio',
    status: 'draft',
    title: 'Venue maps without drawing a single seat',
    kind: 'feature',
    cluster: 'intelligence',
    tags: ['ai', 'venue', 'seating', 'automation'],
    excerpt:
      'Describe the room or upload a plan and get a numbered, sectioned, priceable seat map — with a reconciliation report telling you what it got wrong.',
    published: '2026-08-14T09:05:00.000Z',
    updated: '2026-08-14T09:05:00.000Z',
    readMinutes: 6,
    author: AUTHOR,
    blocks: [
      {
        type: 'paragraph',
        text: 'Building a seating chart by hand is the reason a lot of events sell general admission when they should be selling reserved seats. Four hundred seats, drawn one at a time, numbered correctly, grouped into sections, each section priced. Nobody does this twice by choice.',
      },
      { type: 'heading', text: 'Two ways in' },
      {
        type: 'paragraph',
        text: 'The manual editor is a normal drag-and-place seat editor: rows, curves, tables, standing areas, aisles, and section boundaries you can price independently. It is there because sometimes you have the plan in your head and drawing it is faster than describing it.',
      },
      {
        type: 'paragraph',
        text: 'The generator is the other way. Upload a floor plan, a photograph of the room, or a description — "cabaret layout, twelve round tables of eight, stage at the north end, standing bar area at the back" — and it produces the map.',
      },
      { type: 'heading', text: 'The reconciliation report is the actual product' },
      {
        type: 'paragraph',
        text: 'Any tool can generate a plausible-looking map. The problem is that a plausible-looking map with 397 seats in a 400-capacity room is a licensing breach you will not notice until someone counts.',
      },
      {
        type: 'paragraph',
        text: 'So every generation returns a reconciliation: seats generated versus capacity you declared, seats per section versus your stated section sizes, and an explicit list of every place the generator made a judgement call. Discrepancies are surfaced, not silently resolved. You approve the map against that report.',
      },
      { type: 'heading', text: 'Three things it will not do' },
      {
        type: 'list',
        items: [
          'Exceed your declared capacity, ever — it will produce a short map and tell you it is short rather than a full one that is illegal',
          'Place seats in an area you marked as an aisle, an exit route or a sightline obstruction',
          'Renumber a map that has tickets sold against it',
        ],
      },
      { type: 'heading', text: 'Why freezing matters' },
      {
        type: 'paragraph',
        text: 'Once a single ticket is sold against a seat map, the numbering freezes. Someone is holding a ticket that says Row F, Seat 12, and that ticket has to mean the same seat on the night as it did at purchase. You can still add sections and adjust prices on unsold inventory; you cannot renumber what is already out there.',
      },
      { type: 'heading', text: 'Colour coding people can actually use' },
      {
        type: 'paragraph',
        text: 'Sections are distinguished by pattern and label as well as colour. Roughly one in twelve men has some form of colour vision deficiency, and a map that encodes price tiers in red and green alone is unreadable to them — on the page where they are choosing how much to spend.',
      },
    ],
    answers: [
      {
        question: 'Can I generate a seating chart automatically?',
        answer:
          'Yes. Upload a floor plan, a photo of the room, or describe the layout in a sentence, and the Venue Map Studio produces a numbered, sectioned map. It returns a reconciliation report showing seats generated against your declared capacity so you can check it before approving.',
      },
      {
        question: 'Can I change a seat map after tickets are sold?',
        answer:
          'You can add sections and change prices on unsold inventory. You cannot renumber seats that have tickets against them — a ticket reading Row F Seat 12 has to mean the same seat on the night as it did at purchase.',
      },
    ],
    linkSlots: [{ heading: 'Seated events on sale now', query: '', href: '/events' }],
    productLinks: ['registerOrganiser', 'howItWorks'],
  },
  {
    slug: 'ticket-as-discovery-surface',
    status: 'draft',
    title: 'Your ticket recommends the next event',
    kind: 'feature',
    cluster: 'intelligence',
    tags: ['discovery', 'recommendations', 'retention', 'ai'],
    excerpt:
      'The most-opened page in ticketing is the ticket itself. We put recommendations on it — and cleared them when the ticket is transferred.',
    published: '2026-08-14T09:10:00.000Z',
    updated: '2026-08-14T09:10:00.000Z',
    readMinutes: 5,
    author: AUTHOR,
    blocks: [
      {
        type: 'paragraph',
        text: 'A marketing email gets opened maybe a fifth of the time. A ticket gets opened on the way to the venue, in the queue, and again at the door — by someone who is, at that exact moment, actively enjoying going out. It is the highest-intent surface in the entire product and almost every platform leaves it blank.',
      },
      { type: 'heading', text: 'What appears there' },
      {
        type: 'paragraph',
        text: 'Below the QR code, a small set of events selected against what this person is doing tonight: the same organiser, the same category, the same city, within a sensible window afterwards. Bounded to a handful — the ticket is a ticket first, and burying the scan code under an advertising unit would be a straightforwardly bad trade.',
      },
      { type: 'heading', text: 'Frozen or live, depending on the format' },
      {
        type: 'paragraph',
        text: 'A ticket added to a phone wallet cannot re-render, so its recommendations are frozen at issue. A ticket viewed in the app refreshes them. Both are correct; the distinction matters because a frozen ticket must never show an event that has already happened, so the frozen set is chosen with a longer horizon.',
      },
      { type: 'heading', text: 'Transfer clears everything' },
      {
        type: 'paragraph',
        text: 'When you send a ticket to a friend, the recommendations are wiped and regenerated for whoever receives it. They are not your recommendations any more, and they were derived from your history. Passing that history along with the ticket would leak your behaviour to someone you only meant to give a ticket to.',
      },
      { type: 'heading', text: 'The organiser gets the credit' },
      {
        type: 'paragraph',
        text: 'A sale that starts from a ticket is attributed to the event that ticket belongs to. If your event sends someone to another event on the platform, that shows in your reporting — because the alternative is a system that quietly monetises your audience and tells you nothing about it.',
      },
    ],
    answers: [
      {
        question: 'Why do recommendations appear on my ticket?',
        answer:
          'The ticket is the page people actually open — on the way to the venue and again at the door. A small set of related events appears below the QR code, chosen by organiser, category, city and date. The QR code always stays the primary element.',
      },
    ],
    linkSlots: [{ heading: 'What is on next', query: '', href: '/events' }],
    productLinks: ['events', 'registerCustomer'],
  },
  {
    slug: 'analytics-and-fan-intelligence',
    status: 'draft',
    title: 'What you learn about your audience, and where the line is',
    kind: 'feature',
    cluster: 'intelligence',
    tags: ['analytics', 'data', 'reporting', 'gdpr'],
    excerpt:
      'Sales curves, demand forecasts, drop-off points and repeat-attendance cohorts — plus the reporting boundary that stops it becoming surveillance.',
    published: '2026-08-14T09:15:00.000Z',
    updated: '2026-08-14T09:15:00.000Z',
    readMinutes: 6,
    author: AUTHOR,
    blocks: [
      {
        type: 'paragraph',
        text: 'Most ticketing dashboards show you tickets sold and revenue. That is a receipt, not analytics. It tells you what happened and nothing about what to do.',
      },
      { type: 'heading', text: 'The numbers that change a decision' },
      {
        type: 'list',
        items: [
          'Sales velocity against comparable events at the same point in their on-sale window — the difference between "slow" and "slow for week three, which is normal"',
          'Forecast final sales, with a confidence range, updated as the curve develops',
          'Checkout drop-off by step, which is where a broken payment method or an unexpected fee shows up as a number',
          'Tier mix — whether your top tier is underpriced, which shows as it selling out first',
          'Repeat attendance: how many of tonight came to your last one',
          'Where the traffic came from, including which affiliate or influencer link produced it',
        ],
      },
      { type: 'heading', text: 'Live, on the night' },
      {
        type: 'paragraph',
        text: 'During the event the dashboard switches to operations: scans per minute, arrival curve against your forecast, which door is backing up, capacity by zone, and any duplicate-scan attempts as they happen. This is the view you actually want on a phone at 20:45.',
      },
      { type: 'heading', text: 'The reporting boundary' },
      {
        type: 'paragraph',
        text: 'Organisers see aggregate audience data. They see the attendee list for their own event, because they need it to run the door and handle problems. They do not get an exportable behavioural profile of an individual across the platform — what else that person attends, what they browsed, what they nearly bought.',
      },
      {
        type: 'paragraph',
        text: 'This is a deliberate limit and it costs us a product we could otherwise sell. Cross-organiser behavioural data is the most commercially valuable thing a ticketing platform holds, and it is also the thing customers least expect to be handing over when they buy a ticket. Aggregate insight, yes. A dossier, no.',
      },
      { type: 'heading', text: 'Sponsors get less again' },
      {
        type: 'paragraph',
        text: 'Sponsor reporting is aggregate only, with a minimum cohort size below which a figure is suppressed rather than shown. A "segment" of four people is not anonymised data; it is four identifiable people with a label on them.',
      },
    ],
    answers: [
      {
        question: 'What data do event organisers see about attendees?',
        answer:
          'Aggregate audience analytics, plus the attendee list for their own event so they can run the door. They do not receive cross-platform behavioural profiles of individuals — what else someone attends or browses stays outside organiser reporting.',
      },
    ],
    linkSlots: [{ heading: 'Organisers on the platform', query: '', href: '/organisers' }],
    productLinks: ['registerOrganiser', 'policies'],
  },
  {
    slug: 'search-and-discovery',
    title: 'Finding something worth going to',
    kind: 'feature',
    cluster: 'buying',
    tags: ['discovery', 'search', 'recommendations'],
    excerpt:
      'Filters that match how people actually decide — by night free, by budget, by how far you will travel — rather than by database column.',
    published: '2026-08-14T09:20:00.000Z',
    updated: '2026-08-14T09:20:00.000Z',
    readMinutes: 4,
    author: AUTHOR,
    blocks: [
      {
        type: 'paragraph',
        text: 'Nobody wakes up wanting to filter by category. They want something on Friday, near enough to get home from, under about forty pounds, that is not the same thing they did last month.',
      },
      { type: 'heading', text: 'What you can actually filter by' },
      {
        type: 'list',
        items: [
          'Date and date range, including "this weekend" as a single tap',
          'City, and distance from where you are',
          'Price ceiling, applied to the cheapest available tier rather than the headline price',
          'Category and sub-category',
          'Free events, as a filter rather than a price of zero you have to notice',
          'Availability — hiding what is sold out, which sounds obvious and frequently is not the default elsewhere',
        ],
      },
      { type: 'heading', text: 'Three views of the same results' },
      {
        type: 'paragraph',
        text: 'List for scanning, calendar for "what is on when I am free", and map for "what is near me". They are the same query rendered three ways, so switching never loses your filters.',
      },
      { type: 'heading', text: 'Every event page is a real page' },
      {
        type: 'paragraph',
        text: 'Event pages are server-rendered with structured data attached, which means they are eligible for Google\'s events carousel — the block of dates and venues that appears above the normal results. That is where most organic ticket discovery now starts, and a page rendered only in the browser is invisible to it.',
      },
    ],
    answers: [
      {
        question: 'How do I find events near me this weekend?',
        answer:
          'Filter by city or distance and select the weekend date range, then switch to map view to see what is closest. Filters persist across list, calendar and map views.',
      },
    ],
    linkSlots: [
      { heading: 'On this week', query: '', href: '/events' },
      { heading: 'Free events', query: 'free', href: '/events' },
    ],
    productLinks: ['events', 'registerCustomer'],
  },
];
