import type { Article } from '@/shared/content/articles';

const AUTHOR = 'TicketRoyality';

/** docs/04 M4, M5 · docs/05 BitriPay · docs/20 KODA — how money moves. */
export const MONEY_ARTICLES: Article[] = [
  {
    slug: 'payments-and-checkout',
    title: 'Paying for a ticket, in whatever way you actually pay for things',
    kind: 'feature',
    cluster: 'money',
    tags: ['payments', 'checkout', 'cards', 'mobile money'],
    excerpt:
      'Cards, mobile money and offline settlement — and why the total is shown before you enter card details rather than after.',
    published: '2026-08-14T12:00:00.000Z',
    updated: '2026-08-14T12:00:00.000Z',
    readMinutes: 5,
    author: AUTHOR,
    blocks: [
      {
        type: 'paragraph',
        text: 'A checkout that only takes cards works in London and fails in Kinshasa. A platform serving both has to treat "how do you pay" as a question with several correct answers rather than one default and a list of excuses.',
      },
      { type: 'heading', text: 'What is accepted' },
      {
        type: 'list',
        items: [
          'Cards, through Stripe, including the wallet payment methods people actually use on a phone',
          'Mobile money, which in much of the world is the primary rather than the alternative rail',
          'Offline settlement, recorded against the order for cases where money genuinely moves outside the platform',
        ],
      },
      { type: 'heading', text: 'The total appears before the card details' },
      {
        type: 'paragraph',
        text: 'Every fee is itemised on the page where you decide, not on the page where you confirm. This costs conversion — a visible fee is a fee someone can object to — and it is worth it, because the alternative trains people to distrust the number on the event page.',
      },
      { type: 'heading', text: 'Inventory is held while you pay' },
      {
        type: 'paragraph',
        text: 'Entering checkout places a hold on the tickets for a bounded window. They are yours to complete or they return to inventory automatically. This is why the availability count on an event page is honest rather than optimistic: it already accounts for people mid-purchase.',
      },
      { type: 'heading', text: 'Failure is explicit' },
      {
        type: 'paragraph',
        text: 'If the payment provider is unreachable, checkout stops and says so. It does not take a payment it cannot confirm, and it does not issue a ticket against a payment that has not settled. A ticket that exists without a confirmed payment behind it is worse than a failed checkout, because the buyer believes they are going.',
      },
      { type: 'heading', text: 'The confirmation is part of the product' },
      {
        type: 'paragraph',
        text: 'The ticket reaching you is not a nice-to-have on top of the transaction. A completed payment with no delivered ticket is indistinguishable from fraud from where the buyer is standing, so delivery is treated with the same seriousness as the payment itself.',
      },
    ],
    answers: [
      {
        question: 'What payment methods can I use to buy tickets?',
        answer:
          'Cards through Stripe including phone wallets, mobile money in markets where that is the primary rail, and recorded offline settlement where money moves outside the platform.',
      },
      {
        question: 'Are booking fees shown before I pay?',
        answer:
          'Yes. Every fee is itemised on the page where you decide, before you enter card details, rather than appearing at the confirmation step.',
      },
    ],
    linkSlots: [{ heading: 'Buy tickets now', query: '', href: '/events' }],
    productLinks: ['events', 'registerCustomer'],
  },
  {
    slug: 'commission-and-payouts',
    title: 'What we take, and when you get paid',
    kind: 'feature',
    cluster: 'money',
    tags: ['fees', 'payouts', 'commission', 'revenue'],
    excerpt:
      '0% organiser commission. You keep 100% of every ticket value; our revenue is a service fee the buyer pays, published rather than summarised.',
    published: '2026-08-14T12:05:00.000Z',
    updated: '2026-08-14T12:05:00.000Z',
    readMinutes: 5,
    author: AUTHOR,
    blocks: [
      {
        type: 'paragraph',
        text: 'Platform pricing in this industry is usually a range with an asterisk. Ours is a sentence: organisers pay nothing. You set the ticket value and you keep all of it. Buyers pay one TicketRoyality Service Fee — 3.99% plus 49p per paid ticket, minimum 79p, VAT included — and it is inside every price we advertise, never added at checkout. Card processing is ours to pay, not yours.',
      },
      { type: 'heading', text: 'On a £50 ticket' },
      {
        type: 'list',
        items: [
          'Ticket price: £50.00',
          'Platform commission: £0.00 — you keep the whole £50',
          'Card processing: about £0.90 — 1.4% plus 20p, to the payment provider',
          'Organiser receives: £47.00',
        ],
      },
      {
        type: 'paragraph',
        text: 'You choose whether to absorb the £3.00 or pass it on. Absorb it and the buyer pays £50.00 flat while you net £47.00. Pass it on and the buyer pays £53.00 as an itemised line. Both are shown clearly at checkout.',
      },
      { type: 'heading', text: 'Calculated per ticket, not on a total' },
      {
        type: 'paragraph',
        text: 'Commission is computed on each ticket, which matters as soon as an order is partially refunded. Refunding one ticket from an order of four reverses exactly that ticket\'s commission. Percentage-of-order arithmetic gets this wrong in a way that is tedious to find and awkward to explain.',
      },
      { type: 'heading', text: 'The ledger is append-only' },
      {
        type: 'paragraph',
        text: 'Every movement is written as an immutable entry. Nothing edits a past line — a correction is a new entry that references the one it corrects. This is enforced in the security rules rather than by convention, and it applies to administrators as well, which is the only version of that guarantee worth anything.',
      },
      { type: 'heading', text: 'Free events are free' },
      {
        type: 'paragraph',
        text: 'No commission on a zero-price ticket. A charge on a free event is a charge for using the software, which is a different product with a different name.',
      },
      { type: 'heading', text: 'When money arrives' },
      {
        type: 'paragraph',
        text: 'Payouts are calculated on completed, non-refunded sales and settle on a defined schedule to your nominated destination, including mobile money where card payouts are impractical. The figure you see in your dashboard before payout is the figure that arrives.',
      },
    ],
    answers: [
      {
        question: 'What commission does TicketRoyality charge organisers?',
        answer:
          'Nothing. Organisers pay 0% commission and no fixed fee, and receive 100% of face value. Our revenue is the buyer-side service fee, and we absorb card processing. Free events cost everybody nothing.',
      },
      {
        question: 'When do organisers get paid?',
        answer:
          'Payouts are calculated on completed, non-refunded sales and settle on a defined schedule to your nominated destination, including mobile money where card payouts are impractical.',
      },
    ],
    linkSlots: [{ heading: 'Organisers selling now', query: '', href: '/organisers' }],
    productLinks: ['registerOrganiser', 'howItWorks'],
  },
  {
    slug: 'mobile-money-payments',
    title: 'Mobile money, and why verification is harder than collection',
    kind: 'feature',
    cluster: 'money',
    tags: ['mobile money', 'africa', 'payments', 'drc'],
    excerpt:
      'In much of the world mobile money is the primary rail. The hard part is not accepting it — it is confirming that the payment you were told about is the payment that arrived.',
    published: '2026-08-14T12:10:00.000Z',
    updated: '2026-08-14T12:10:00.000Z',
    readMinutes: 6,
    author: AUTHOR,
    blocks: [
      {
        type: 'paragraph',
        text: 'Building card-only checkout and calling everything else an alternative payment method gets the world backwards. Across much of sub-Saharan Africa, mobile money is not the alternative — it is how people pay for things, and a card is the exotic instrument.',
      },
      { type: 'heading', text: 'The genuinely hard part' },
      {
        type: 'paragraph',
        text: 'Accepting a mobile money payment is straightforward. Knowing that a specific payment corresponds to a specific order is not, because the confirmation arrives as an SMS to a phone, out of band from the checkout the customer is sitting in.',
      },
      {
        type: 'paragraph',
        text: 'The failure mode this creates is expensive in both directions: a customer who paid and did not get a ticket, and a ticket issued against a payment that never arrived.',
      },
      { type: 'heading', text: 'Intents and a code the customer supplies' },
      {
        type: 'paragraph',
        text: 'Checkout registers an intent — this amount, this order, this number, expiring shortly. The customer pays from their phone and receives the provider\'s confirmation SMS. They enter the code from that message, and it is matched against the open intent.',
      },
      {
        type: 'paragraph',
        text: 'The customer holds the proof and hands it over deliberately. That is a materially better privacy position than a system reading their messages, and it is also more robust — it does not depend on an app retaining permission to read SMS across an operating system update.',
      },
      { type: 'heading', text: 'Verification, not collection' },
      {
        type: 'paragraph',
        text: 'The gateway confirms that a payment happened. It does not hold the money. That distinction keeps the platform out of the regulatory perimeter that holding customer funds creates, and it means an outage in verification delays ticket issuance rather than stranding anyone\'s money.',
      },
      { type: 'heading', text: 'Issuance waits for confirmation' },
      {
        type: 'paragraph',
        text: 'A ticket is issued when the payment is confirmed and not before. Where confirmation is pending, the order shows as pending — honestly, with what happens next stated — rather than optimistically issuing a ticket that might have to be revoked at the door.',
      },
    ],
    answers: [
      {
        question: 'Can I buy tickets with mobile money?',
        answer:
          'Yes. Checkout registers a payment intent, you pay from your phone, then enter the code from the provider\'s confirmation SMS. It is matched against the open intent and your ticket is issued once the payment is confirmed.',
      },
    ],
    linkSlots: [{ heading: 'Events near you', query: '', href: '/events' }],
    productLinks: ['events', 'howItWorks'],
  },
  {
    slug: 'acu-credits-explained',
    title: 'ACU: paying for AI without a surprise bill',
    kind: 'feature',
    cluster: 'money',
    tags: ['ai', 'billing', 'acu', 'pricing'],
    excerpt:
      'One credit, one price, quoted before the work runs and stopped hard at zero — because the failure mode of usage-based AI billing is a five-figure invoice nobody authorised.',
    published: '2026-08-14T12:15:00.000Z',
    updated: '2026-08-14T12:15:00.000Z',
    readMinutes: 5,
    author: AUTHOR,
    blocks: [
      {
        type: 'paragraph',
        text: 'The standard way to bill for AI features is to meter tokens and invoice monthly. It is also the way customers end up with a bill several times what they expected, from a process they did not realise was still running.',
      },
      { type: 'heading', text: 'One unit, one price' },
      {
        type: 'paragraph',
        text: 'An ACU is one credit at a fixed price. Every AI action carries a stated cost in ACU: a full event build is 35–45, regenerating one section is a fraction of that. You buy credits and spend them, and the price of a credit does not move because a model provider changed their rate card.',
      },
      { type: 'heading', text: 'Quoted before it runs' },
      {
        type: 'paragraph',
        text: 'The cost appears before you start, not after. A quote that arrives afterwards is a bill, and a bill you could not have declined is not a price.',
      },
      { type: 'heading', text: 'Zero is a hard stop' },
      {
        type: 'paragraph',
        text: 'When the balance reaches zero, AI actions stop. There is no overdraft, no auto-top-up you did not ask for, and no negative balance to settle later. Everything that is not AI keeps working — selling tickets, scanning at the door, taking payment — because those are the product and AI is an accelerant on top of it.',
      },
      { type: 'heading', text: 'Why a credit rather than a token count' },
      {
        type: 'paragraph',
        text: 'Tokens are a supplier\'s unit, not a customer\'s. They vary by model, they are impossible to estimate in advance, and pricing in them means every model change is a price change you have to explain. A credit is stable and comparable across features, which is what makes a budget possible.',
      },
      { type: 'heading', text: 'The ledger shows every spend' },
      {
        type: 'paragraph',
        text: 'Each deduction is a line: what ran, when, what it cost, and against which event. If a number looks wrong you can find the specific action that produced it rather than arguing with a monthly total.',
      },
    ],
    answers: [
      {
        question: 'How does AI billing work on TicketRoyality?',
        answer:
          'AI features are paid for in ACU credits at a fixed price per credit. Each action states its cost before it runs — a full event build is 35–45 ACU. At zero the AI features stop; there is no overdraft or auto-top-up, and ticketing continues to work.',
      },
    ],
    linkSlots: [{ heading: 'Events built with AI', query: '', href: '/events' }],
    productLinks: ['registerOrganiser', 'howItWorks'],
  },
];
