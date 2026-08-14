import type { Article } from '@/shared/content/articles';

const AUTHOR = 'TicketRoyality';

/** docs/04 M3, M8, M16, M17, M21 — the night itself. */
export const OPERATIONS_ARTICLES: Article[] = [
  {
    slug: 'door-check-in-and-scanning',
    title: 'The door: scanning, queues and who can see what',
    kind: 'feature',
    cluster: 'operations',
    tags: ['door', 'check-in', 'operations'],
    excerpt:
      'Any phone becomes a scanner, scoped to one event and nothing else — and a duplicate scan tells staff when and where, rather than just refusing.',
    published: '2026-08-14T11:00:00.000Z',
    updated: '2026-08-14T11:00:00.000Z',
    readMinutes: 6,
    author: AUTHOR,
    blocks: [
      {
        type: 'paragraph',
        text: 'The door is where a ticketing platform is actually judged. Everything before it can be excellent and it will not matter if there is a forty-minute queue in the rain because the scanner cannot reach the internet from a basement in Shoreditch.',
      },
      { type: 'heading', text: 'Any phone, scoped to one event' },
      {
        type: 'paragraph',
        text: 'Door staff sign in and get a scanner scoped to a single event. They can validate tickets and admit people. They cannot see your revenue, your sales figures, your other events or your customer list.',
      },
      {
        type: 'paragraph',
        text: 'That scoping is enforced in the security rules rather than by hiding buttons in the interface. The person on the door is frequently a friend, a volunteer, or agency staff you met an hour ago, and the correct assumption is that they will see exactly what the rules permit and nothing else.',
      },
      { type: 'heading', text: 'It needs a connection today' },
      {
        type: 'paragraph',
        text: 'Validation is checked centrally on every scan, so the scanner needs signal. Offline caching is designed and specified (docs/04 M16) and is not built yet — so if your venue is a basement with no reception, plan for it rather than assume it. This is stated here because discovering it at 20:45 with a queue outside is the worst possible time to learn it.',
      },
      { type: 'heading', text: 'Override is a first-class outcome' },
      {
        type: 'paragraph',
        text: 'Sometimes the system says no and the answer is still to let the person in. The ticket is on a dead phone; the name is on the guest list nobody synced; the reader is being unreliable. Manual override exists, requires a reason, and is logged with the staff member attached.',
      },
      {
        type: 'paragraph',
        text: 'A system with no override does not prevent overrides. It produces a member of staff waving people past the scanner entirely, which loses you the record of who came in.',
      },
      { type: 'heading', text: 'Duplicate scans are shown, not silently rejected' },
      {
        type: 'paragraph',
        text: 'When a ticket has already been scanned, the screen shows when and at which door. That is the information the person on the door needs to make a judgement — a scan ninety seconds ago at the same entrance is a double-tap, and one forty minutes ago at a different door is something else.',
      },
    ],
    answers: [
      {
        question: 'What device do I need to scan tickets?',
        answer:
          'Any phone. Door staff sign in and get a scanner scoped to one event — they can admit people but cannot see revenue, sales or your other events.',
      },
      {
        question: 'Does ticket scanning work without internet?',
        answer:
          'Not yet. Every scan is validated centrally, so the scanner needs a connection. Offline caching is specified but not built — plan for signal at the door.',
      },
    ],
    linkSlots: [{ heading: 'Events happening soon', query: '', href: '/events' }],
    productLinks: ['registerOrganiser', 'howItWorks'],
  },
  {
    slug: 'rotating-qr-and-ticket-forgery',
    status: 'draft',
    title: 'Why a screenshot of your ticket does not get anyone in',
    kind: 'feature',
    cluster: 'trust',
    tags: ['fraud', 'tickets', 'security', 'door'],
    excerpt:
      'Static QR codes are copyable by design. Rotating codes, per-event salts and single-use validation close the resale-scam route that costs fans real money.',
    published: '2026-08-14T11:05:00.000Z',
    updated: '2026-08-14T11:05:00.000Z',
    readMinutes: 5,
    author: AUTHOR,
    blocks: [
      {
        type: 'paragraph',
        text: 'The most common ticket scam is not sophisticated. Someone buys one ticket, screenshots the QR code, and sells that image to six people on a social network. Five of them arrive at a venue holding a picture of a valid ticket and are refused entry, out of pocket, in a queue, in front of their friends.',
      },
      { type: 'heading', text: 'A static code is a bearer token' },
      {
        type: 'paragraph',
        text: 'If the code printed at purchase is the same code presented at the door, then anyone holding a copy of that image holds a valid ticket. That is not a flaw in the implementation — it is what a static code is.',
      },
      { type: 'heading', text: 'Rotation' },
      {
        type: 'paragraph',
        text: 'The code displayed in the app regenerates on a short cycle. A screenshot captures one moment of a sequence and is stale within a minute or two. The buyer of that screenshot is holding a photograph of something that has already expired.',
      },
      { type: 'heading', text: 'Single use, enforced centrally' },
      {
        type: 'paragraph',
        text: 'Beyond rotation, every ticket admits once. The first successful scan marks it used, and every subsequent presentation shows the door staff when and where it was already scanned. Even where a code is somehow reproduced, only the first person through is admitted.',
      },
      { type: 'heading', text: 'The per-event salt matters more than the algorithm' },
      {
        type: 'paragraph',
        text: 'Codes are signed with a key derived per event rather than one platform-wide secret. If material from one event were ever exposed, it would not enable forgery against any other event. Blast radius is a design property, and confining it is worth more than an extra layer of cleverness in the signing itself.',
      },
      { type: 'heading', text: 'Screenshot detection flags, it never refuses' },
      {
        type: 'paragraph',
        text: 'Where a screenshot is detected, it is raised as a signal for staff rather than an automatic rejection. People screenshot their own tickets constantly — because their phone battery is dying, because signal at the venue is poor, because they want it somewhere they can find it fast. Refusing them entry to stop a scam punishes far more legitimate attendees than fraudsters.',
      },
      { type: 'heading', text: 'What this means if you are buying' },
      {
        type: 'paragraph',
        text: 'Buy through the platform and your ticket lives in your account, rotating and valid. A QR image sent to you privately by a stranger is not a ticket. It is a picture, and the person who sold it to you still holds the real one.',
      },
    ],
    answers: [
      {
        question: 'Can someone screenshot my ticket and use it?',
        answer:
          'No. The QR code regenerates on a short cycle, so a screenshot goes stale within minutes. Every ticket also admits only once — the first scan marks it used and later presentations show door staff when and where it was already scanned.',
      },
      {
        question: 'How do I avoid ticket resale scams?',
        answer:
          'Buy through the platform so the ticket lives in your account and rotates. A QR image sent to you privately is a picture, not a ticket — the seller still holds the real one.',
      },
    ],
    linkSlots: [{ heading: 'Buy direct', query: '', href: '/events' }],
    productLinks: ['events', 'registerCustomer'],
  },
  {
    slug: 'venue-zones-and-access-control',
    status: 'draft',
    title: 'Zones: why this is not just gates plus a spreadsheet',
    kind: 'feature',
    cluster: 'operations',
    tags: ['venue', 'access', 'operations', 'capacity'],
    excerpt:
      'VIP areas, backstage, tiered levels and hospitality — each with its own capacity, its own scanners and its own admission rules.',
    published: '2026-08-14T11:10:00.000Z',
    updated: '2026-08-14T11:10:00.000Z',
    readMinutes: 5,
    author: AUTHOR,
    blocks: [
      {
        type: 'paragraph',
        text: 'A venue is rarely one space. There is a main room, a balcony, a VIP area, a backstage corridor, a hospitality suite and a smoking terrace, and the question "is this person allowed in here" has a different answer in each of them.',
      },
      { type: 'heading', text: 'Zones have their own capacity' },
      {
        type: 'paragraph',
        text: 'Each zone carries its own limit, tracked live. A venue licensed for 800 with a balcony licensed for 150 is two constraints, not one, and the balcony is the one that gets breached — because everyone counts the front door and nobody counts the stairs.',
      },
      { type: 'heading', text: 'Ticket types map to zones' },
      {
        type: 'paragraph',
        text: 'A VIP ticket admits to the main room and the VIP area. A general ticket admits to the main room only. Staff and artist passes carry their own mappings. The scanner at each zone knows which types it accepts, so a general ticket presented at the VIP entrance is refused there without being invalidated.',
      },
      { type: 'heading', text: 'Re-entry, decided per zone' },
      {
        type: 'paragraph',
        text: 'The main entrance may allow re-entry while the backstage door does not. Each zone sets its own rule, which is the only way to model a venue where someone can step outside for air but cannot wander back through the artist corridor.',
      },
      { type: 'heading', text: 'Live occupancy, per zone' },
      {
        type: 'paragraph',
        text: 'During the event you see current occupancy against limit for each zone, updating as people scan through. Approaching a limit is a warning before it is a problem, which is the difference between managing a room and discovering a situation.',
      },
    ],
    answers: [
      {
        question: 'Can I restrict VIP areas to specific ticket types?',
        answer:
          'Yes. Each zone has its own capacity, its own scanners, its own accepted ticket types and its own re-entry rule. A general ticket presented at a VIP entrance is refused at that zone without being invalidated.',
      },
    ],
    linkSlots: [{ heading: 'Multi-zone venues', query: '', href: '/events' }],
    productLinks: ['registerOrganiser', 'howItWorks'],
  },
  {
    slug: 'hospitality-operations',
    status: 'draft',
    title: 'Hospitality: tables, packages and the guest who is not the buyer',
    kind: 'feature',
    cluster: 'operations',
    tags: ['hospitality', 'tables', 'vip', 'operations'],
    excerpt:
      'Corporate boxes, table service and dining packages break every assumption ticketing makes — starting with one buyer, one ticket, one attendee.',
    published: '2026-08-14T11:15:00.000Z',
    updated: '2026-08-14T11:15:00.000Z',
    readMinutes: 5,
    author: AUTHOR,
    blocks: [
      {
        type: 'paragraph',
        text: 'Hospitality gets its own module rather than a flag on a ticket because it breaks the core assumption of ticketing. Standard ticketing assumes the buyer is the attendee. Hospitality routinely means one buyer, ten attendees, whose names arrive four days before the event, two of whom change on the morning.',
      },
      { type: 'heading', text: 'The unit is the table, not the seat' },
      {
        type: 'paragraph',
        text: 'A table of ten is sold once, at a table price, with a headcount attached. Splitting it into ten seat tickets loses the thing that was actually bought and produces a confirmation email that makes no sense to a company booking for clients.',
      },
      { type: 'heading', text: 'Guest names arrive late, and change' },
      {
        type: 'paragraph',
        text: 'The buyer allocates named guests up to the headcount, at any point up to the door, and can change them. Each guest gets their own ticket at their own contact details — the client does not want to be sent their invitation by the account manager who booked it, and the account manager does not want to be forwarding QR codes at 18:00.',
      },
      { type: 'heading', text: 'Packages that are not just entry' },
      {
        type: 'list',
        items: [
          'Dining covers with courses and dietary requirements collected per guest',
          'Drinks packages, allocated to the table rather than the individual',
          'Arrival windows separate from general doors, because hospitality usually arrives earlier',
          'A named host or contact attached to the booking',
        ],
      },
      { type: 'heading', text: 'The kitchen needs this before the door does' },
      {
        type: 'paragraph',
        text: 'Dietary requirements and covers are useless if they surface on the night. They are collected against each guest and available as a report ahead of the event, which is what the venue actually needs in order to buy food.',
      },
    ],
    answers: [
      {
        question: 'Can I sell tables rather than individual tickets?',
        answer:
          'Yes. A table is sold once at a table price with a headcount attached. The buyer allocates named guests up to that headcount at any time before the door, and each guest receives their own ticket at their own contact details.',
      },
    ],
    linkSlots: [{ heading: 'Events with hospitality', query: '', href: '/events' }],
    productLinks: ['registerOrganiser', 'contact'],
  },
  {
    slug: 'live-streaming-hybrid-events',
    status: 'draft',
    title: 'Selling a room and a stream at the same time',
    kind: 'feature',
    cluster: 'operations',
    tags: ['streaming', 'hybrid', 'online', 'revenue'],
    excerpt:
      'A stream ticket is a real ticket with a real access window — and the capacity constraint that limits your room does not apply to it.',
    published: '2026-08-14T11:20:00.000Z',
    updated: '2026-08-14T11:20:00.000Z',
    readMinutes: 4,
    author: AUTHOR,
    blocks: [
      {
        type: 'paragraph',
        text: 'The economics of a hybrid event are unusual: the physical room has a hard ceiling set by licensing and fire safety, and the stream does not. Every stream ticket after the first is close to pure margin, and the audience for it is geographically unbounded.',
      },
      { type: 'heading', text: 'A stream ticket is a ticket' },
      {
        type: 'paragraph',
        text: 'It is a tier like any other, with its own price, its own quantity — capped or unlimited — and its own on-sale window. It appears in the buyer\'s wallet next to their physical tickets rather than as a separate class of thing they have to remember to find.',
      },
      { type: 'heading', text: 'Access is bound to the account' },
      {
        type: 'paragraph',
        text: 'The stream opens for the account that holds the ticket, during a defined window around the event, with concurrent-session limits. That is what stops one purchase becoming a link in a group chat serving two hundred people.',
      },
      { type: 'heading', text: 'Replay is a decision, not a default' },
      {
        type: 'paragraph',
        text: 'Whether the recording stays available afterwards, and for how long, is set per event. It affects what you can sell and what you have licensed — a performance rights agreement covering a live transmission frequently does not cover an indefinite archive.',
      },
      { type: 'heading', text: 'Where it genuinely earns its keep' },
      {
        type: 'paragraph',
        text: 'Conferences, talks and showcases, where the value is the content rather than the room. For a club night the stream is a marketing asset rather than a product, and pricing it as a product usually disappoints everyone.',
      },
    ],
    answers: [
      {
        question: 'Can I sell online tickets alongside physical ones?',
        answer:
          'Yes. A stream ticket is a normal tier with its own price, quantity and on-sale window. Access is bound to the buyer\'s account for a defined window around the event, with concurrent-session limits.',
      },
    ],
    linkSlots: [{ heading: 'Online and hybrid events', query: '', href: '/events' }],
    productLinks: ['registerOrganiser', 'events'],
  },
];
