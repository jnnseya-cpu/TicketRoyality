import type { Article } from '@/shared/content/articles';

const AUTHOR = 'TicketRoyality';

/** docs/04 M10, M13 · docs/09 API — the layer other systems hang off. */
export const PLATFORM_ARTICLES: Article[] = [
  {
    slug: 'developer-api-and-webhooks',
    status: 'draft',
    title: 'The API door: sandbox, signed webhooks, idempotency',
    kind: 'feature',
    cluster: 'platform',
    tags: ['api', 'webhooks', 'developers', 'integration'],
    excerpt:
      'Build against a sandbox before you touch real money, verify every webhook by signature, and retry safely because every write is idempotent.',
    published: '2026-08-14T14:00:00.000Z',
    updated: '2026-08-14T14:00:00.000Z',
    readMinutes: 6,
    author: AUTHOR,
    blocks: [
      {
        type: 'paragraph',
        text: 'Most ticketing APIs are a read-only feed of events with a sales endpoint bolted on later. That shape works until the first time you need to reconcile a refund, and then it does not work at all.',
      },
      { type: 'heading', text: 'Sandbox first' },
      {
        type: 'paragraph',
        text: 'A full sandbox with its own keys, its own data and its own webhooks. You can create events, sell tickets, trigger refunds and drive edge cases without moving a penny. An integration whose first real test is a live on-sale is an integration that will fail during one.',
      },
      { type: 'heading', text: 'Every webhook is signed' },
      {
        type: 'paragraph',
        text: 'Webhooks carry an HMAC signature computed over the raw request body. Verify it before parsing, compare in constant time, and reject anything that fails.',
      },
      {
        type: 'paragraph',
        text: 'Two details cause most integration bugs here. Sign the raw bytes — re-serialising the JSON first changes them and every signature stops matching. And an unsigned endpoint is an open one: anyone who learns the URL can post you a fake payment confirmation, and the only thing stopping them is the check you skipped.',
      },
      { type: 'heading', text: 'Idempotent by default' },
      {
        type: 'paragraph',
        text: 'Every write takes an idempotency key. Retrying a request that already succeeded returns the original result rather than performing the action again. Networks time out after the server has committed, and a retry loop without idempotency is how one order becomes four.',
      },
      { type: 'heading', text: 'Failure is a retry, not a loss' },
      {
        type: 'paragraph',
        text: 'A webhook we cannot confirm you processed is redelivered with backoff. Respond only when you have durably handled the event — acknowledging on receipt and then failing internally makes the delivery guarantee worthless.',
      },
      { type: 'heading', text: 'Versioned' },
      {
        type: 'paragraph',
        text: 'Breaking changes ship as a new version. The version you built against keeps behaving the way it did, with deprecation announced ahead of removal rather than discovered through an outage.',
      },
      { type: 'heading', text: 'Keys are scoped' },
      {
        type: 'paragraph',
        text: 'API keys carry only the permissions they need. A key for reading the catalogue cannot issue a refund. Compromise then costs you a rotation rather than an incident.',
      },
    ],
    answers: [
      {
        question: 'Does TicketRoyality have an API?',
        answer:
          'Yes — a versioned REST API with a full sandbox, scoped keys, idempotent writes and HMAC-signed webhooks. You can create events, sell tickets and trigger refunds in sandbox without moving real money.',
      },
      {
        question: 'How do I verify a TicketRoyality webhook?',
        answer:
          'Compute an HMAC over the raw request body — not a re-serialised copy — and compare it against the signature header in constant time. Reject anything that does not match before parsing the payload.',
      },
    ],
    linkSlots: [{ heading: 'Live events in the catalogue', query: '', href: '/events' }],
    productLinks: ['developers', 'contact'],
  },
  {
    slug: 'notifications-that-arrive',
    status: 'shipped',
    title: 'The messages that must arrive, and the ones you can turn off',
    kind: 'feature',
    cluster: 'platform',
    tags: ['notifications', 'email', 'comms', 'delivery'],
    excerpt:
      'Over a hundred defined events across email, in-app, push and WhatsApp — with a hard line between a message you can unsubscribe from and one you cannot.',
    published: '2026-08-14T14:05:00.000Z',
    updated: '2026-08-14T14:05:00.000Z',
    readMinutes: 5,
    author: AUTHOR,
    blocks: [
      {
        type: 'paragraph',
        text: 'Communications are usually an afterthought — a confirmation email and a reminder, written once, in a template nobody has read since launch. Then a venue changes at short notice and it turns out there is no message for that.',
      },
      { type: 'heading', text: 'Defined rather than improvised' },
      {
        type: 'paragraph',
        text: 'Over a hundred communication events are specified across thirteen categories, each with its audience, its channels, its severity and its trigger. Ticket issued, payment failed, event postponed, venue changed, payout sent, refund processed, presale opening, door opening — each is a defined event rather than something someone writes in a hurry when it first happens.',
      },
      { type: 'heading', text: 'Channels, chosen per message' },
      {
        type: 'paragraph',
        text: 'Which channels carry a given message is part of its definition, not a global preference. A venue change one hour before doors goes everywhere available; a monthly summary is email only.',
      },
      { type: 'heading', text: 'What actually leaves the building' },
      {
        type: 'paragraph',
        text: 'Two channels deliver today: email, over SMTP, and in-app, which appears in the bell in your header the moment it is written. Push and WhatsApp are defined in the catalogue and are not delivered \u2014 a message routed only to them is recorded as suppressed rather than reported as sent. Saying which is which matters more than the count: a delivery log that claims success is worse than no log at all when a customer is telling you their ticket never arrived.',
      },
      { type: 'heading', text: 'Sixty-one are mandatory' },
      {
        type: 'paragraph',
        text: 'Some messages cannot be switched off, and the boundary is not arbitrary: it is whether the message is part of the transaction. Your ticket. A refund. A cancellation. A change of venue or time. A security event on your account. You did not consent to marketing when you bought a ticket, and you did not opt out of being told the venue moved.',
      },
      { type: 'heading', text: 'Delivery of a ticket is the product' },
      {
        type: 'paragraph',
        text: 'A completed payment with no ticket delivered is indistinguishable from fraud from where the buyer is standing. So ticket delivery is treated as a transactional guarantee with retries and failure alerting, not as an email that usually works.',
      },
      { type: 'heading', text: 'Marketing is genuinely optional' },
      {
        type: 'paragraph',
        text: 'Recommendations, announcements and organiser newsletters are opt-out per category, and turning them off never affects anything transactional. An unsubscribe that quietly stops your tickets arriving is a dark pattern, and reserving the right to do it is why so many people distrust the checkbox.',
      },
    ],
    answers: [
      {
        question: 'Can I stop marketing emails without losing my tickets?',
        answer:
          'Yes. Marketing is opt-out per category and entirely separate from transactional messages. Ticket delivery, refunds, cancellations, venue or time changes and account security alerts are mandatory and unaffected by marketing preferences.',
      },
    ],
    linkSlots: [{ heading: 'Events to follow', query: '', href: '/events' }],
    productLinks: ['registerCustomer', 'policies'],
  },
];
