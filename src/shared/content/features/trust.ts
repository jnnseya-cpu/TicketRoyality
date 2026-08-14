import type { Article } from '@/shared/content/articles';

const AUTHOR = 'TicketRoyality';

/** docs/11 · docs/03 §3.6 sentinel · docs/04 M11 — fraud, bots, disputes, data. */
export const TRUST_ARTICLES: Article[] = [
  {
    slug: 'only-humans-buy-here',
    status: 'draft',
    title: 'Only humans get in: how we keep bots out of the queue',
    kind: 'feature',
    cluster: 'trust',
    tags: ['bots', 'security', 'fairness', 'scalping'],
    excerpt:
      'Eleven signals, attestation at the data layer rather than the form, and a deliberate decision not to penalise anyone for using a VPN.',
    published: '2026-08-14T13:00:00.000Z',
    updated: '2026-08-14T13:00:00.000Z',
    readMinutes: 6,
    author: AUTHOR,
    blocks: [
      {
        type: 'paragraph',
        text: 'When an event sells out in ninety seconds and reappears on a resale site at four times face value, the tickets did not go to fans who were quick. They went to software, and every genuine person in that queue lost to a script.',
      },
      { type: 'heading', text: 'Attestation guards the data, not the form' },
      {
        type: 'paragraph',
        text: 'A CAPTCHA on a sign-up form protects the form. A script that skips the form and calls the underlying service directly never sees it.',
      },
      {
        type: 'paragraph',
        text: 'Instead, requests carry an attestation token proving they came from our genuine app on a real device, and that token is verified by the backend services themselves — the database, storage and functions. A request that cannot prove its origin cannot read a document, regardless of which door it tried.',
      },
      { type: 'heading', text: 'Eleven signals, weighted' },
      {
        type: 'paragraph',
        text: 'Alongside attestation, sign-up and checkout are scored on behaviour: how the form was filled, whether a hidden field intended for automated form-fillers was completed, timing patterns no human produces, device reuse across accounts, and velocity across the platform.',
      },
      {
        type: 'paragraph',
        text: 'The score sorts into four bands: allow, challenge, verify, refuse. Most people never see anything. A borderline score adds a step rather than a refusal, because a false positive here means a real customer blocked from buying a ticket, and that is a worse failure than admitting a bot.',
      },
      { type: 'heading', text: 'A VPN scores zero' },
      {
        type: 'paragraph',
        text: 'This is a deliberate choice against the industry default. Plenty of platforms treat a VPN as suspicious, which punishes people on a work network, anyone in a country where a VPN is how you reach an ordinary website, and everybody who simply cares about privacy. It also barely inconveniences an actual attacker, who has residential proxies. So it carries no weight at all.',
      },
      { type: 'heading', text: 'What a failed check actually blocks' },
      {
        type: 'paragraph',
        text: 'An unverified session cannot purchase, join a waitlist, enter a presale, generate referral links, register as an organiser or create API keys. It can still browse the catalogue and read event pages — locking the public catalogue to stop a scraper breaks the thing the site is for.',
      },
      { type: 'heading', text: 'Why this is a fairness feature' },
      {
        type: 'paragraph',
        text: 'Every ticket a bot does not get is a ticket available at face value to somebody who wanted to go. That is the entire argument. It is not framed as security because the person it protects is not thinking about security — they are thinking about whether they got in.',
      },
    ],
    answers: [
      {
        question: 'How does TicketRoyality stop bots buying tickets?',
        answer:
          'Requests carry an attestation token verified by the backend services themselves rather than by a form CAPTCHA, plus eleven behavioural signals scored into allow, challenge, verify and refuse bands. Failed checks block purchase, presale and referral links but never browsing.',
      },
      {
        question: 'Will using a VPN stop me buying tickets?',
        answer:
          'No. VPN use carries zero weight in the scoring. It penalises people on work networks and in countries where a VPN is normal, while barely inconveniencing attackers who use residential proxies.',
      },
    ],
    linkSlots: [{ heading: 'On sale at face value', query: '', href: '/events' }],
    productLinks: ['registerCustomer', 'policies'],
  },
  {
    slug: 'anti-fraud-agent',
    status: 'draft',
    title: 'The security agent that is not allowed to ban you',
    kind: 'feature',
    cluster: 'trust',
    tags: ['security', 'fraud', 'ai', 'agents'],
    excerpt:
      'It watches for credential stuffing, card testing and forged tickets — and every action it can take expires on its own. That constraint is the design.',
    published: '2026-08-14T13:05:00.000Z',
    updated: '2026-08-14T13:05:00.000Z',
    readMinutes: 6,
    author: AUTHOR,
    blocks: [
      {
        type: 'paragraph',
        text: 'An always-on agent watches authentication, checkout, door and agent telemetry for attack patterns. The interesting part is not what it detects. It is what it is forbidden from doing about it.',
      },
      { type: 'heading', text: 'What it looks for' },
      {
        type: 'list',
        items: [
          'Credential stuffing — many failures across many accounts, which is different from many failures on one account, and the account count is the distinction',
          'Card testing — a run of declines across a run of different cards',
          'Scalping — high purchase volume from one device across rotating addresses',
          'Forged tickets — the same code presented repeatedly at the door',
          'Privilege probing — repeated invalid webhook signatures',
          'Payout fraud — a destination account changed more than once in a short window',
          'Prompt injection — an agent requesting a permission its contract does not include',
        ],
      },
      { type: 'heading', text: 'What it may do' },
      {
        type: 'paragraph',
        text: 'Slow a request, add a challenge, require additional verification, or freeze a session. Every one of those expires automatically. The most severe action available to it is freezing a session — not an account, not a payout, not a ticket.',
      },
      { type: 'heading', text: 'What it may never do' },
      {
        type: 'list',
        items: [
          'Delete any record',
          'Permanently ban an account',
          'Reverse, hold or release a payment',
          'Invalidate an issued ticket',
          'Change security rules or permissions',
          'Disable another agent',
          'Suppress its own audit trail',
        ],
      },
      { type: 'heading', text: 'Why the limits are the point' },
      {
        type: 'paragraph',
        text: 'A defence agent with unlimited authority is the most dangerous component on a platform. An attacker who learns how to trigger it can aim it at your customers and turn your own security into a denial-of-service tool. And a false positive at three in the morning locks an organiser out of their own account on the day their tickets go on sale.',
      },
      {
        type: 'paragraph',
        text: 'Bounding it means the worst case for a wrongly-flagged person is an extra verification step that expires, rather than a lockout requiring a support ticket and a working day.',
      },
      { type: 'heading', text: 'Rules, not a model' },
      {
        type: 'paragraph',
        text: 'Detection is deterministic and explainable on purpose. A security decision nobody can reconstruct is a security decision nobody can appeal, and "the AI decided" is not an answer to give an organiser locked out of their own event. Every containment is written to the audit log with its evidence attached.',
      },
    ],
    answers: [
      {
        question: 'Can the security system ban my account automatically?',
        answer:
          'No. The anti-intrusion agent can slow requests, add challenges, require extra verification or freeze a session, and every action expires on its own. It is explicitly forbidden from deleting records, banning accounts, touching payments or invalidating tickets.',
      },
    ],
    linkSlots: [{ heading: 'Buy with confidence', query: '', href: '/events' }],
    productLinks: ['policies', 'contact'],
  },
  {
    slug: 'support-and-disputes',
    title: 'Refunds, chargebacks and what happens when it goes wrong',
    kind: 'feature',
    cluster: 'trust',
    tags: ['refunds', 'disputes', 'support', 'cancellation'],
    excerpt:
      'A stated policy before purchase, cancellation handled automatically, and a dispute process that does not depend on who complains loudest.',
    published: '2026-08-14T13:10:00.000Z',
    updated: '2026-08-14T13:10:00.000Z',
    readMinutes: 5,
    author: AUTHOR,
    blocks: [
      {
        type: 'paragraph',
        text: 'Most refund arguments are not about the money. They are about a policy that was never stated, so both sides are arguing from what seems fair to them, and the outcome depends on persistence rather than on any rule.',
      },
      { type: 'heading', text: 'The policy is set before you publish' },
      {
        type: 'paragraph',
        text: 'Each event carries its refund terms, chosen by the organiser and displayed on the event page before purchase. An unstated policy becomes whatever the most persistent customer argues for, which is unfair to everybody who did not argue.',
      },
      { type: 'heading', text: 'Cancellation is handled, not negotiated' },
      {
        type: 'paragraph',
        text: 'If an event is cancelled, ticket holders are refunded and notified — that is not a discretionary decision. Commission on refunded tickets reverses. Postponement is different: holders are notified of the new date and given a stated window to request a refund if it no longer works for them.',
      },
      { type: 'heading', text: 'Partial refunds are per ticket' },
      {
        type: 'paragraph',
        text: 'Refunding two tickets from an order of five refunds exactly those two, and reverses exactly their commission. The remaining three stay valid and scannable. This sounds obvious and is the thing spreadsheet-based reconciliation most reliably gets wrong.',
      },
      { type: 'heading', text: 'Chargebacks' },
      {
        type: 'paragraph',
        text: 'A chargeback is a customer disputing with their bank rather than with you. The associated ticket is flagged so it does not admit someone who has already taken their money back, and the evidence needed to respond — purchase record, delivery confirmation, scan history — is assembled rather than reconstructed from memory weeks later.',
      },
      { type: 'heading', text: 'Where a human is required' },
      {
        type: 'paragraph',
        text: 'No agent can issue a refund, release a payout or resolve a dispute. Support agents can gather context, draft a reply and recommend an outcome; a person approves anything that moves money. This is a fixed boundary, not a current limitation waiting to be relaxed.',
      },
    ],
    answers: [
      {
        question: 'What happens if an event is cancelled?',
        answer:
          'Ticket holders are refunded and notified automatically, and the commission on refunded tickets reverses. If an event is postponed instead, holders are notified of the new date and given a stated window to request a refund.',
      },
      {
        question: 'Can I get a partial refund on a multi-ticket order?',
        answer:
          'Yes. Refunds are calculated per ticket, so refunding two of five reverses exactly those two and their commission. The remaining tickets stay valid and scannable.',
      },
    ],
    linkSlots: [{ heading: 'Events with clear terms', query: '', href: '/events' }],
    productLinks: ['policies', 'contact'],
  },
  {
    slug: 'your-ticket-wallet',
    status: 'draft',
    title: 'Where your tickets live, and how to send one to a friend',
    kind: 'feature',
    cluster: 'buying',
    tags: ['wallet', 'tickets', 'transfer', 'account'],
    excerpt:
      'Every ticket in one place, transferable to someone else properly — which is the difference between giving a friend a ticket and forwarding them a screenshot.',
    published: '2026-08-14T13:15:00.000Z',
    updated: '2026-08-14T13:15:00.000Z',
    readMinutes: 4,
    author: AUTHOR,
    blocks: [
      {
        type: 'paragraph',
        text: 'The normal way people manage tickets is a search through their email at the door, with one bar of signal, while a queue builds behind them. It works until it does not.',
      },
      { type: 'heading', text: 'One place, everything in it' },
      {
        type: 'paragraph',
        text: 'Every ticket you hold sits in your account: upcoming first, past events kept as a record. Each one carries its live QR code, the venue, door times, and the organiser\'s terms for that specific event.',
      },
      { type: 'heading', text: 'Transfer is a real operation' },
      {
        type: 'paragraph',
        text: 'Send a ticket to someone and it moves. It becomes invalid in your account and valid in theirs, with their name against it. Nobody is holding a screenshot hoping it still works, and there is no ambiguity at the door about which of you is coming.',
      },
      {
        type: 'paragraph',
        text: 'Recommendations attached to that ticket are cleared and regenerated for the recipient, because they were derived from your history and it is not theirs to receive.',
      },
      { type: 'heading', text: 'It works without signal' },
      {
        type: 'paragraph',
        text: 'Tickets are available offline and can be added to a phone wallet. A ticket that requires connectivity to display is a ticket that fails in exactly the place it is needed — a basement venue with eight hundred phones competing for one cell.',
      },
      { type: 'heading', text: 'The messages that matter arrive' },
      {
        type: 'paragraph',
        text: 'Confirmation, reminders, changes of time or venue, and cancellations are delivered rather than optional. Marketing you can turn off; a message telling you the venue has changed is not marketing, and it will reach you.',
      },
    ],
    answers: [
      {
        question: 'How do I transfer a ticket to a friend?',
        answer:
          'Send it from your wallet. The ticket becomes invalid in your account and valid in theirs, with their name against it — so there is no ambiguity at the door and nobody is relying on a screenshot.',
      },
      {
        question: 'Can I access my ticket without internet?',
        answer:
          'Yes. Tickets are available offline and can be added to a phone wallet, which matters in venues where hundreds of phones compete for one cell.',
      },
    ],
    linkSlots: [{ heading: 'Something to add to it', query: '', href: '/events' }],
    productLinks: ['registerCustomer', 'events'],
  },
];
