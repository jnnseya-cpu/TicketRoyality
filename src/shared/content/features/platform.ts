import type { Article } from '@/shared/content/articles';

const AUTHOR = 'TicketRoyality';

/** docs/04 M10, M13 · docs/09 API — the layer other systems hang off. */
export const PLATFORM_ARTICLES: Article[] = [
  {
    slug: 'developer-api-and-webhooks',
    status: 'shipped',
    title: 'The API door: scoped keys, a sandbox, signed webhooks',
    kind: 'feature',
    cluster: 'platform',
    tags: ['api', 'webhooks', 'developers', 'integration'],
    excerpt:
      'Read your events and tickets from your own systems, build against a sandbox that touches nothing real, and verify every webhook by signature. Read-only today, and we say so.',
    published: '2026-08-14T14:00:00.000Z',
    updated: '2026-08-18T12:00:00.000Z',
    readMinutes: 5,
    author: AUTHOR,
    blocks: [
      {
        type: 'paragraph',
        text: 'Most ticketing APIs are announced long before they exist. This one is small and finished rather than large and promised: two read endpoints, keys that carry only the permissions you give them, a sandbox that cannot touch real data, and webhooks you can prove came from us.',
      },
      { type: 'heading', text: 'What it does today, exactly' },
      {
        type: 'paragraph',
        text: 'Two endpoints under /api/v1. GET /events returns your own events with tier prices and how many have sold. GET /tickets returns tickets for them, filterable by event. Both are GETs. There is no write API — you cannot create an event, place an order or scan a ticket through it — and there are no SDKs. When those exist they will be on the developers page and not before.',
      },
      { type: 'heading', text: 'The sandbox is a different key, not a setting' },
      {
        type: 'paragraph',
        text: 'A tr_test_ key reads fixtures and touches nothing real. A tr_live_ key reads your account. They are separate credentials rather than a mode on one, because a request must not be able to reach live data by leaving something out — which is exactly how a first integration attempt ends up scanning tickets at a real door.',
      },
      {
        type: 'paragraph',
        text: 'The fixtures are deliberately awkward: a sold-out tier, a ticket already redeemed, a ticket refunded. A fresh live account has none of those, so an integration built against one breaks on the first real evening. Sandbox addresses sit on the reserved .invalid domain, so nothing sent to them can leave your own machine.',
      },
      { type: 'heading', text: 'Keys are scoped, and attendee data has its own scope' },
      {
        type: 'paragraph',
        text: 'A key carries only what you grant it. Names and email addresses sit behind attendees:read, separate from tickets:read — so a key pasted into a reporting dashboard can count ticket sales without ever being able to export a mailing list. That distinction is what makes handing a key to somebody else a small decision rather than a large one.',
      },
      {
        type: 'paragraph',
        text: 'We store only a hash of your key, never the key. It is shown once, when you create it, and after that we genuinely cannot show it again — a lost key is replaced rather than recovered. That is not inconvenience for its own sake: a database of plaintext API keys is a database of everybody\u2019s ticket data, and the owners could not tell it had leaked, because the keys keep working.',
      },
      { type: 'heading', text: 'Every webhook is signed' },
      {
        type: 'paragraph',
        text: 'Each delivery carries a TicketRoyality-Signature header: an HMAC-SHA256 over the timestamp and the raw body, using your endpoint\u2019s own secret. Verify it before parsing, compare in constant time, and reject anything where the timestamp is more than five minutes old.',
      },
      {
        type: 'paragraph',
        text: 'Two details cause most integration bugs here. Sign the raw bytes — re-serialising the JSON first changes them and every signature stops matching. And check the timestamp, not only the signature: a genuine delivery somebody captured stays valid forever unless the time it was sent is part of what was signed.',
      },
      { type: 'heading', text: 'Failure is a retry, not a loss' },
      {
        type: 'paragraph',
        text: 'A delivery your server does not accept is retried with an increasing delay across five attempts. After the last one it is marked failed and stays in your delivery log with the status code and the error. Nothing disappears quietly — silence is the one outcome that would make a webhook system untrustworthy.',
      },
      {
        type: 'paragraph',
        text: 'Deliveries are queued rather than sent inline, so a ticket is issued whether or not your server is up. Nothing in the path that takes somebody\u2019s money waits on somebody else\u2019s infrastructure.',
      },
      { type: 'heading', text: 'What we do not send' },
      {
        type: 'paragraph',
        text: 'There is no ticket.issued event, deliberately. Issuance runs in a separate deployable from the app, so an event fired from here would be a guess about something that had not happened yet — and a webhook arriving before the tickets exist is worse than no webhook. order.completed is the honest one: the money arrived, and the tickets follow. We also send ticket.redeemed, ticket.refunded and donation.received.',
      },
      { type: 'heading', text: 'Your endpoint must be public' },
      {
        type: 'paragraph',
        text: 'Endpoints must be https, and private addresses are refused — localhost, 10.x, 192.168.x, and the cloud metadata address. A URL we POST to on a schedule from inside our own network is otherwise a request-forgery tool aimed at us, and you would be the one paying for it.',
      },
    ],
    answers: [
      {
        question: 'Does TicketRoyality have an API?',
        answer:
          'Yes, a read API: GET /api/v1/events and GET /api/v1/tickets, with scoped keys, a sandbox and HMAC-signed webhooks. There is no write API yet — you cannot create events, place orders or scan tickets through it.',
      },
      {
        question: 'How do I verify a TicketRoyality webhook?',
        answer:
          'Compute an HMAC-SHA256 over the timestamp and the raw request body — not a re-serialised copy — with your endpoint secret, and compare it to the v1 value in the signature header in constant time. Reject anything where the timestamp is more than five minutes old.',
      },
      {
        question: 'Can I test without touching real data?',
        answer:
          'Yes. A tr_test_ key reads fixture data and cannot reach your live account at all, because live and test are different keys rather than a mode on one key.',
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
