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
  {
    slug: 'donations-and-gift-aid',
    title: 'Fundraising events: donations and Gift Aid done right',
    kind: 'feature',
    cluster: 'money',
    tags: ['fundraising', 'gift aid', 'charity'],
    excerpt:
      'Add a real donation to any ticket, pay no platform fee on the gift, and reclaim 25% from HMRC — declarations and the relevant-value test handled correctly.',
    published: '2026-10-22T10:00:00.000Z',
    updated: '2026-10-22T10:00:00.000Z',
    readMinutes: 6,
    author: AUTHOR,
    blocks: [
      {
        type: 'paragraph',
        text: 'If your event raises money for a cause, the difference between a ticket and a gift is not a detail — it is the whole of whether you can claim Gift Aid, and getting it wrong is the kind of mistake HMRC queries after the claim rather than before. TicketRoyality is built around the one rule that governs all of it: Gift Aid is claimed on a gift, never on a payment for admission.',
      },
      { type: 'heading', text: 'A donation is a separate amount from the start' },
      {
        type: 'paragraph',
        text: 'A ticket to a gala dinner buys admission and a meal, so no Gift Aid can be claimed on it — not on part of it, not on the "excess over cost". So on our checkout a donation is its own field and its own line, added after the ticket fee is computed, and it carries no platform fee at all. The card cost on a gift is ours to absorb; charging a percentage of a donation is the line that gets quoted back at you in public. No path on the platform can turn a ticket into a claimable gift, which is exactly the property an auditor is looking for.',
      },
      { type: 'heading', text: 'The reclaim is computed to the rule' },
      {
        type: 'paragraph',
        text: 'We enforce HMRC’s relevant-value test — 25% of the gift up to £100, then £25 plus 5% of the excess, capped at £2,500 — so a "donation" that came bundled with a meal worth too much is refused before the claim is filed, not queried after it. The reclaim is rounded down per donation, never up and never on the total, because claiming a penny more than the entitlement is an incorrect claim, and a penny that reconciles to no single gift is one you cannot explain to an inspector. The arithmetic runs the same way on one gift and on ten thousand, so a busy campaign night does not quietly drift out of compliance as the volume climbs.',
      },
      { type: 'heading', text: 'Declarations are records, not settings' },
      {
        type: 'paragraph',
        text: 'A Gift Aid declaration is stored with the exact wording and version the donor agreed to, and it is never edited and never deleted — because in an audit the question is what this donor was shown on the day, and an edited form cannot answer it. A withdrawal is stamped and kept rather than erased, and it is not retrospective: gifts made before it stay claimable. An enduring declaration reaches back four years, and declarations are matched to gifts at claim time, so a donor who gave three times and then signed one enduring declaration has made three claimable gifts, not none.',
      },
      { type: 'heading', text: 'The buyer always sees the gift clearly' },
      {
        type: 'paragraph',
        text: 'On the checkout the donation shows above the total line, never slipped in after it, so nobody gives by accident and nobody feels tricked into giving — the fastest way to lose a donor is to make them feel the amount was nudged. And because a gift has to reach you intact, adding one makes the non-card rails unavailable rather than letting a mobile-money or alternative charge quietly collect the ticket total and drop the donation. A gift that silently vanishes is worse than one that was never offered.',
      },
      { type: 'heading', text: 'The claim comes out ready to file' },
      {
        type: 'paragraph',
        text: 'The platform exports HMRC’s schedule as a CSV in the schedule’s own date format, and the dashboard shows you what is not claimable and why — "£600 across eleven gifts, no declaration" is a number you can act on by asking eleven people for an address. This is the schedule and the arithmetic, done the way the rules require; it is not tax advice, and the rates change, so the final claim is still yours to file.',
      },
    ],
    answers: [
      {
        question: 'Can I claim Gift Aid on ticket sales for my charity event?',
        answer:
          'Not on the ticket itself — Gift Aid is claimed on a gift, never on payment for admission. On TicketRoyality a donation is a separate amount with its own line, carrying no platform fee, and only that gift is claimable. It exports as HMRC’s schedule, ready to file.',
      },
      {
        question: 'How much Gift Aid can I reclaim on a donation?',
        answer:
          '25% of the gift up to £100, then £25 plus 5% of the excess, capped at £2,500 — HMRC’s relevant-value test, enforced before the claim is filed and rounded down per donation so you never claim more than the entitlement.',
      },
    ],
    linkSlots: [{ heading: 'Fundraisers and galas on now', query: '', href: '/events' }],
    productLinks: ['registerOrganiser', 'howItWorks'],
  },
  {
    slug: 'silent-auction-lots',
    title: 'Silent auction lots: bid from the room, fairly',
    kind: 'feature',
    cluster: 'money',
    tags: ['auctions', 'fundraising', 'bidding'],
    excerpt:
      'Run silent-auction lots your guests bid on from their phones — one bid is one transaction, anti-sniping extends the close, and nobody can outbid themselves.',
    published: '2026-10-22T10:00:00.000Z',
    updated: '2026-10-22T10:00:00.000Z',
    readMinutes: 6,
    author: AUTHOR,
    blocks: [
      { type: 'paragraph', text: 'A silent auction is the part of a fundraising evening where the software most often embarrasses the organiser in front of a room full of guests. Two people are told they are winning the same lot; a bid vanishes; the whole thing runs until someone remembers to close it. TicketRoyality runs auction lots guests bid on from their phones, and the design starts from the failures, not the happy path.' },
      { type: 'heading', text: 'One bid is one transaction' },
      { type: 'paragraph', text: '"Read the high bid, add the increment, write it back" is the classic lost-update bug, and in an auction it does not merely lose data — it tells two people in the same room that they are winning, which is the exact moment an organiser stops trusting the screen in front of their guests. So a bid is a single transaction. Tested with simultaneous bids, it produces exactly one leader and counts exactly one bid. The person who lost the race is told the real current price — "it is £120 now" — rather than a bare error, because by the time a bid lands the lot has usually moved, and a next step beats a dead end.' },
      { type: 'heading', text: 'Anti-sniping: a lot ends when bidding ends' },
      { type: 'paragraph', text: 'A hard cut-off rewards the fastest connection over the highest bidder, so a bid placed inside the final window pushes the close out a little. A lot therefore ends when the bidding ends, not when the clock happens to run out. Earlier bids leave the time alone, or a lot with steady interest would run all night. And the lots close on a schedule, not on someone remembering to press a button — the one evening nobody presses it is the evening the auction runs until morning.' },
      { type: 'heading', text: 'What a bidder can and cannot see' },
      { type: 'paragraph', text: 'An auction is public about money and private about people. The screen shows the current price, how many bids a lot has had, and whether you are the one leading — never who else is bidding. You cannot outbid yourself, because raising your own winning bid only lifts the price you will pay and makes it look like the room is being milked. Whether a reserve has been met is shown, because a room bidding towards a wall it cannot see simply stops; the reserve amount itself is not, because that is your floor, not theirs.' },
      { type: 'heading', text: 'Setting one up, and why it stays calm' },
      { type: 'paragraph', text: 'A lot is attached to an event, given a starting price, a bid increment and an optional reserve, and it is live for guests to bid on from their own phones — no app to install, no queue at a clipboard. Because the price only ever moves up by the increment inside a transaction, and because you cannot raise your own leading bid, the number on the screen is always the real one, and the room can trust it. That trust is the whole point: a silent auction works when guests believe the display, and stops the instant they do not.' },
      { type: 'heading', text: 'A bid buys goods, not a gift' },
      { type: 'paragraph', text: 'A winning bid buys the lot, so it is a purchase and never touches the Gift Aid path — no reclaim is attempted on it, because an auction win is goods changing hands, not a donation. A lot that never meets its reserve closes unsold, because the reserve is your floor and selling under it was never the deal. Every bid is kept, not only the winning one, because "who bid what, and when" is always the question afterwards. Two honest limits, stated rather than hidden: there are no automatic maximum bids yet, and the live price updates on a short poll rather than a live socket.' },
    ],
    answers: [
      {
        question: 'Can my guests bid on auction lots from their phones?',
        answer:
          'Yes — lots are bid on from a phone, no app needed. Each bid is a single transaction, so simultaneous bids produce exactly one leader; the loser is shown the real current price, and you cannot outbid yourself.',
      },
      {
        question: 'How does the auction stop last-second sniping?',
        answer:
          'A bid inside the final window pushes the close out, so a lot ends when bidding ends rather than when the clock runs out. Lots close on a schedule, not on someone remembering, and a lot that misses its reserve closes unsold.',
      },
    ],
    linkSlots: [{ heading: 'Fundraising events on now', query: '', href: '/events' }],
    productLinks: ['registerOrganiser', 'howItWorks'],
  },
  {
    slug: 'gift-registry',
    title: 'Gift registries: a list people give towards together',
    kind: 'feature',
    cluster: 'money',
    tags: ['gift registry', 'weddings', 'group gifts'],
    excerpt:
      'A wedding list, baby shower or leaving collection — named gifts guests give towards, with the running total kept correct even when two give at the same moment.',
    published: '2026-10-22T10:00:00.000Z',
    updated: '2026-10-22T10:00:00.000Z',
    readMinutes: 6,
    author: AUTHOR,
    blocks: [
      { type: 'paragraph', text: 'A wedding list, a baby shower, a leaving collection for someone retiring: a set of named gifts, each with a cost, that a group of people give towards. It sounds like the simplest feature on the platform, and it is the one where a lazy implementation does the most damage — because the damage is a couple thanking someone for a gift the list forgot to record, or two guests paying for a mixer that was already bought. Those are the mistakes people remember, and they are precisely the ones a careless total or a double-counted payment creates.' },
      { type: 'heading', text: 'The running total cannot drift' },
      { type: 'paragraph', text: 'Each gift carries a running total, and that total only ever moves inside the same transaction that writes the contribution itself. Summing every contribution on each page load is correct but slow on a page a hundred guests are refreshing; incrementing the total outside a transaction is fast but loses contributions when two guests give at the same instant. Tested with simultaneous gifts, both count. And because the increment is idempotent by the payment event id, a redelivered payment never shows a guest as having given twice.' },
      { type: 'heading', text: 'Fully funded means closed' },
      { type: 'paragraph', text: 'A £400 mixer that has been paid for is not something two more guests should be able to buy, so a fully funded gift closes — and the check sits inside the same transaction as the increment, so a race cannot push it past its cost. More than the remaining balance is refused rather than quietly trimmed: taking £80 towards a £30 balance and keeping the difference is not a decision to make on a guest’s behalf. Part payments are allowed by default, because that is how a large item gets bought at all, and the unfunded gifts sort to the top so the list never looks finished when it is not.' },
      { type: 'heading', text: 'How a guest gives' },
      { type: 'paragraph', text: 'A guest opens the list, picks a gift and gives towards it — the whole amount if it is small, or a part of a larger one — through the same checkout the platform uses for everything else, with the same card handling and the same confirmation. There is nothing new for a guest to learn and nothing new for you to reconcile afterwards: a contribution is just a payment against a named item, recorded the moment it clears. Because part payments are on by default, a £300 item is reachable by six people giving £50 rather than waiting for one person willing to cover the lot.' },
      { type: 'heading', text: 'What guests see, and what you get' },
      { type: 'paragraph', text: 'Each contribution can carry a message, and the people the list is for get a who-gave-what list for the thank-you letters — the one piece of admin that actually matters afterwards. Guests, meanwhile, see only the totals, never each other’s names or amounts: a registry is shared about progress and private about people, which is the same principle the rest of the platform follows everywhere else it holds names and amounts.' },
      { type: 'heading', text: 'No platform fee, and not a donation' },
      { type: 'paragraph', text: 'Contributions ride the same checkout as everything else and carry no platform fee at all — a present should arrive whole, and skimming a percentage off a wedding gift is not a line anyone wants to defend. And a present is not a charitable donation: no Gift Aid is claimed, and registry money never reaches the donation path. It is a genuinely separate thing from fundraising, kept separate on purpose, so neither one quietly behaves like the other — a registry collects for a person, a donation gives to a cause, and the arithmetic and the rules behind each are different for good reason.' },
    ],
    answers: [
      {
        question: 'Can guests give towards a shared gift on a registry?',
        answer:
          'Yes — each named gift has a cost and guests give towards it, part-payments allowed by default. The running total only moves inside the transaction that records the contribution, so two guests giving at once both count and a gift cannot be overfunded.',
      },
      {
        question: 'Is there a fee on gift-registry contributions?',
        answer:
          'No platform fee at all — a present should arrive whole. A registry contribution is also not a charitable donation: no Gift Aid is claimed, and the money never touches the donation path.',
      },
    ],
    linkSlots: [{ heading: 'Celebrations and events', query: '', href: '/events' }],
    productLinks: ['registerCustomer', 'events'],
  },
];
