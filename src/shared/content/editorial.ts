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
        text: 'The organiser receives all £50. We take no commission, and card processing — roughly £0.90 on a £50 ticket — is ours to absorb, not theirs. Our revenue is the £2.49 service fee the buyer pays, of which about 41p is VAT and roughly £1.09 covers processing, infrastructure and support.',
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
          'Nothing. On a £50 ticket the organiser receives £50.00. The buyer pays a £2.49 TicketRoyality Service Fee, shown inside the £52.49 advertised price, and we absorb card processing out of it.',
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
  {
    slug: 'how-to-avoid-fake-tickets',
    title: 'How to avoid fake tickets when buying resale',
    kind: 'guide',
    cluster: 'buying',
    tags: ['resale', 'fraud', 'buying safely'],
    excerpt:
      'Most ticket fraud happens in a private message, not on a ticketing site. How to tell a real ticket from a screenshot, and the one step that removes the risk.',
    published: '2026-09-10T09:00:00.000Z',
    updated: '2026-09-10T09:00:00.000Z',
    readMinutes: 5,
    author: 'TicketRoyality',
    blocks: [
      {
        type: 'paragraph',
        text: 'Most ticket fraud does not happen on a ticketing site. It happens in a private message: a stranger with a ticket to a sold-out event, a screenshot of a QR code, and a request to pay by bank transfer before they send it over. By the time the night arrives the seller has gone quiet, and the code at the door either never existed or was already scanned by the three other people who paid for the same screenshot.',
      },
      { type: 'heading', text: 'Why a screenshot proves nothing' },
      {
        type: 'paragraph',
        text: 'A ticket QR code is just a string of characters drawn as a square, and the barcode on a PDF is no different. A screenshot of one can be copied, forwarded and sold to as many people as will pay for it, and every copy looks identical to the original. When a tout sends you an image you are not buying a ticket, you are buying a picture of one, with no way to tell whether you are the first person to receive it or the tenth. The scanner at the door admits whoever presents the code first. Everyone after that is turned away holding an identical image and a payment they cannot get back.',
      },
      { type: 'heading', text: 'The questions a real seller can answer' },
      {
        type: 'list',
        items: [
          'Can they transfer the ticket to you inside the platform it was bought on, instead of sending an image? A genuine ticket can be reassigned to your account. A screenshot cannot.',
          'Will they take a payment that can be disputed, or only an irreversible bank transfer or cash-out? Insisting on the irreversible one is the single clearest warning sign.',
          'Does the face value match what they are asking? A ticket priced far above its printed value is often either a scam or a resale you could beat by buying direct.',
          'Is the event genuinely sold out, or is it still on sale from the organiser at the original price, with a working refund policy and no markup at all?',
        ],
      },
      { type: 'heading', text: 'The one step that removes the risk' },
      {
        type: 'paragraph',
        text: 'Buy from the organiser, or from a platform that transfers the ticket into your own account rather than emailing you an image. On TicketRoyality a ticket lives in the buyer’s wallet, and passing it to someone else is a transfer, not a forward: the sender starts it, the recipient accepts it into their own account, and ownership moves with the record. Once a ticket has been transferred to you the previous holder’s copy stops working, so there is no second valid version left to sell. A screenshot can exist in a hundred inboxes at once; a transferred ticket exists in exactly one account, and the door checks the account, not the image. That is the whole difference, and it is why a forwarded picture should never be the thing you pay for.',
      },
      { type: 'heading', text: 'If you have already paid' },
      {
        type: 'paragraph',
        text: 'If a private seller has gone quiet after an irreversible payment, treat the money as gone and report the account to the platform the real tickets were sold through, so the organiser can watch for duplicate codes at the door. Keep the messages and the payment reference: a report with evidence is one the platform can act on, and a vague one rarely goes anywhere. If you paid by card, your bank’s chargeback process is the one route that sometimes recovers the money, which is exactly why touts push so hard for transfers that cannot be charged back. Next time, buy direct: the original price is almost always lower than the resale asking price, and a ticket sitting in your own wallet is a ticket nobody else can sell out from under you.',
      },
    ],
    answers: [
      {
        question: 'How can I tell if a resale ticket is real before I pay?',
        answer:
          'You cannot tell from a screenshot — an image of a QR code can be copied and sold to many people at once. The only reliable check is whether the seller can transfer the ticket into your own account on the platform it was bought from. A genuine ticket can be reassigned; a forwarded picture cannot.',
      },
      {
        question: 'Are forwarded ticket screenshots or PDFs safe to buy?',
        answer:
          'No. A screenshot or PDF can be sent to unlimited buyers, and the door admits whoever scans first and turns everyone else away with no refund. Buy direct from the organiser, or receive the ticket as an in-account transfer so the previous holder’s copy stops working.',
      },
      {
        question: 'What can I do if I have already paid a tout who disappeared?',
        answer:
          'If you paid by card, your bank’s chargeback process is the one route that sometimes recovers the money. Report the seller’s account to the platform the real tickets were sold through so the organiser can watch for duplicate codes at the door, and keep the messages and payment reference as evidence.',
      },
    ],
    linkSlots: [{ heading: 'On sale now, direct from the organiser', query: '', href: '/events' }],
    productLinks: ['events', 'registerCustomer'],
  },
  {
    slug: 'selling-tickets-in-kinshasa',
    title: 'Selling tickets in Kinshasa: mobile money and the door',
    kind: 'guide',
    cluster: 'money',
    tags: ['kinshasa', 'mobile money', 'drc'],
    excerpt:
      'A card-only checkout loses most of a Kinshasa audience before the first sale. What actually works in the DRC: mobile money, cash at the door, and local pricing.',
    published: '2026-09-10T09:00:00.000Z',
    updated: '2026-09-10T09:00:00.000Z',
    readMinutes: 5,
    author: 'TicketRoyality',
    blocks: [
      {
        type: 'paragraph',
        text: 'Selling tickets in Kinshasa is not the same problem as selling them in London, and a platform built for one rarely handles the other well. The audience is real and growing, but a card-only checkout will lose most of it before the first sale, because most buyers are not paying with a card. Here is what actually works in the Democratic Republic of the Congo, and what the platform already supports today.',
      },
      { type: 'heading', text: 'Mobile money is the default, not the fallback' },
      {
        type: 'paragraph',
        text: 'Across the DRC a phone wallet is how people hold and move money day to day. A checkout that only accepts international cards is asking a Kinshasa audience to use the one payment method most of them do not have. TicketRoyality settles mobile-money payments in the DRC corridor now — it is live, not a roadmap item — so a buyer can pay from the balance they already carry on their phone, and the sale completes without a card ever entering the picture. If you are selling to a local crowd, make mobile money the obvious first option on the page, not something buried behind a card form that most of your buyers will abandon.',
      },
      { type: 'heading', text: 'Cash at the door still matters — plan for it' },
      {
        type: 'paragraph',
        text: 'Not everyone will pay in advance, and an event that refuses cash at the door leaves money out on the pavement. The answer is not to abandon online sales; it is to run both and keep the two counts in one place. Sell online for the buyers who commit early — they are the ones who tell you whether the event is working while there is still time to act on it — and keep a clean record of who holds a valid ticket so the entrance is not sorting paper by torchlight. Treat the online sales as your forecast and the door as your overflow, never the other way round.',
      },
      { type: 'heading', text: 'Price in the currency people think in' },
      {
        type: 'paragraph',
        text: 'A price that only appears in pounds or dollars makes a local buyer do mental arithmetic at the exact moment you want the decision to be easy. Quote the number your audience thinks in, state it plainly, and never hide a conversion fee that appears only at the last step — the fastest way to lose trust in any market is a total that changes after the buyer has already decided. A fee a buyer can see before they pay is a fee they can accept. A fee they discover at the end is the reason they close the tab, and they rarely come back to a page that surprised them once.',
      },
      { type: 'heading', text: 'Reconcile the two counts in one place' },
      {
        type: 'paragraph',
        text: 'The quiet failure in a mixed cash-and-online event is two sets of numbers that never meet: a spreadsheet of advance sales and a cash box nobody counted against capacity. Decide before the night how a cash buyer becomes a valid ticket — issued on the spot against the same record the online sales live in — so that one figure tells you how full the room is. An event that cannot answer "how many are in right now" is an event that oversells by accident, and the people it turns away are the ones who paid and showed up.',
      },
      { type: 'heading', text: 'What to get right before you publish' },
      {
        type: 'list',
        items: [
          'Turn on mobile money and put one real payment through end to end before you announce the event, not on the night.',
          'Decide your cash-at-the-door policy in advance and print it on the event page, so nobody argues it with your staff at nine in the evening.',
          'Staff the entrance for the arrival curve — two scanning devices halve the queue, and the second one is a phone someone on your team already owns.',
          'Quote the price in the currency your audience uses, with the full total shown before checkout rather than revealed after it.',
        ],
      },
    ],
    answers: [
      {
        question: 'Can I accept mobile money payments for events in the DRC?',
        answer:
          'Yes. TicketRoyality settles mobile-money payments in the DRC corridor today, so buyers in Kinshasa can pay from their phone balance without a card. Make it the first payment option on the page rather than hiding it behind a card form.',
      },
      {
        question: 'Should I still take cash at the door in Kinshasa?',
        answer:
          'Usually yes, but plan for it. Sell online to the buyers who commit early, issue any cash sales against the same record, and keep one running count of who holds a valid ticket so you always know how full the room is and never oversell by accident.',
      },
    ],
    linkSlots: [{ heading: 'On in Kinshasa', query: 'kinshasa', href: '/events?q=Kinshasa' }],
    productLinks: ['registerOrganiser', 'howItWorks'],
  },
  {
    slug: 'promote-your-event-without-ads',
    title: 'How to promote your event without paying for ads',
    kind: 'guide',
    cluster: 'selling',
    tags: ['promotion', 'referrals', 'marketing'],
    excerpt:
      'Paid ads are the most expensive way to sell a ticket. How tracked promoter links turn ordinary word of mouth into something you can count and reward fairly.',
    published: '2026-09-10T09:00:00.000Z',
    updated: '2026-09-10T09:00:00.000Z',
    readMinutes: 5,
    author: 'TicketRoyality',
    blocks: [
      {
        type: 'paragraph',
        text: 'Paid advertising is the most expensive way to sell a ticket and usually the least accountable: the spend leaves today and the proof it worked arrives, if at all, weeks later. For most events below arena scale the cheaper and more reliable channel is the people who were always going to tell their friends anyway. You just have to make their word of mouth countable, and worth their while.',
      },
      { type: 'heading', text: 'Give your promoters a link that counts' },
      {
        type: 'paragraph',
        text: 'A tracked link is a normal link to your event with a code on the end — on TicketRoyality it looks like /r/ followed by the promoter’s own code. When someone clicks it the platform counts the click, drops a first-party cookie that remembers which promoter sent them, and sends them straight to the event. The cookie lasts thirty days, so a click today that becomes a purchase next week still credits the right person. There is no third-party pixel and no fingerprinting: the cookie records which promoter sent the visitor and nothing else, which is why it needs no consent banner and cannot follow anyone around the rest of the web.',
      },
      { type: 'heading', text: 'Set the commission yourself, server-side' },
      {
        type: 'paragraph',
        text: 'You decide what each promoter earns as a percentage of face value, anywhere from nothing up to half. A venue host might earn nothing and simply be measured; a serious promoter might take a real cut of every ticket they bring through the door. The commission is calculated on the server against the actual face value of the tickets sold, never from anything the browser could tamper with — a commission a browser could name is a commission a browser could quietly set to fifty percent. The platform takes no cut of this itself: what you set is exactly what your promoter earns, and you pay them directly.',
      },
      { type: 'heading', text: 'Why this beats buying attention' },
      {
        type: 'paragraph',
        text: 'An advert persuades a stranger who has never heard of your event. A promoter’s link arrives from someone the buyer already trusts, attached to a recommendation that was going to happen regardless. You are not paying to create interest out of nothing; you are paying only for interest that converted, and only after it converted. That is a fundamentally better trade: the cost scales with sales instead of running ahead of them, and a promoter who earns per ticket has every reason to keep selling long after an ad budget would have burned out.',
      },
      { type: 'heading', text: 'Who your promoters actually are' },
      {
        type: 'paragraph',
        text: 'The word "promoter" suggests someone with a large following, but the people who sell the most tickets are usually closer in. They are the friend who is bringing a table of ten, the DJ on the bill telling their own crowd, the venue that wants the room full, the society committee that knows exactly who to message. None of them needs a contract or a media kit — they need a link that remembers they sent the sale and a number they can trust they will be paid. Hand a tracked link to five people who genuinely know your audience and you will usually outperform the same budget spent shouting at strangers, because each of those five is vouching for you to people who already listen to them.',
      },
      { type: 'heading', text: 'How to run it without it becoming a mess' },
      {
        type: 'list',
        items: [
          'Give each promoter their own code, so you can see who actually sells and who just shares the link once and forgets about it.',
          'Agree the commission before you hand over the link and keep it in writing — the page shows you exactly what is owed to whom.',
          'Pay promptly after the event; the fastest way to lose your best sellers is to be slow with the money they have earned.',
          'Do not over-promise the window — a tracked click credits the sender for thirty days, long enough for a considered purchase and short enough to stay honest.',
        ],
      },
    ],
    answers: [
      {
        question: 'How do tracked promoter links work on TicketRoyality?',
        answer:
          'Each promoter gets a link ending in /r/ plus their code. A click is counted, a first-party cookie remembers who sent the visitor for thirty days, and any purchase in that window credits the right promoter. There is no third-party tracking, so it needs no consent banner.',
      },
      {
        question: 'How much commission do promoters earn, and who pays it?',
        answer:
          'You set the commission as a percentage of face value, from nothing up to half, and it is calculated server-side on the real tickets sold. The platform takes no cut of it — what you set is what your promoter earns, and you pay them directly.',
      },
    ],
    linkSlots: [{ heading: 'Events taking bookings now', query: '', href: '/events' }],
    productLinks: ['growth', 'registerOrganiser'],
  },
];
