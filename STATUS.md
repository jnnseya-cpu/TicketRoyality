# Status — what is actually built

**Last verified: 27 August 2026, against the code on `claude/optimistic-heisenberg-0n2w42`.**

Operating rules for changing this codebase are in `/CLAUDE.md`.

This file is the single source of truth for what exists. It exists because the project
did not have one, and the cost of that was concrete: thirty blog articles were written
describing platform features in the present tense, and **sixteen of them described
things that were not built.** Several stated the opposite of what the code does — the
ticket QR was described as rotating and per-event signed when it is in fact a static,
unsigned JSON payload — and those claims were attached to FAQ structured data, the
format search engines quote directly to users.

Nothing here is a plan or an intention. If a row says **Built**, the code was opened
and read. If it says **Not built**, it was looked for and is absent.

## Rules for keeping this honest

1. **Update this file in the same commit** that changes what is built. Not afterwards.
2. **A doc is not evidence.** `docs/` specifies the target system. This file records
   the shipped one. Where they disagree, this file is right.
3. **Marketing copy may not run ahead of this table.** Blog articles carry a
   `status: 'draft'` flag; drafts never render, and `npm run check:links` enforces the
   publishing gate. An article describing a **Not built** feature stays a draft.
4. **"Specified in docs/NN" is not "built".** Most of what is missing below is fully
   specified. That was exactly the confusion.

---

## Built and verified

| Area | What works | Evidence |
| --- | --- | --- |
| Catalogue | Events, search, filters, calendar, map | `src/app/events` |
| Organiser directory | Public, server-rendered via an Admin SDK **whitelist projection** — branding fields only, no email/phone/address | `backend/services/public-profiles.ts` |
| Event pages | Server-rendered with `Event` JSON-LD | `src/app/events/[id]` |
| Accounts | Register (customer/organiser), login, forgot password, three role dashboards | `src/app/register`, `/dashboard/*` |
| Password reveal | Eye toggle on every password field, accessible, never submits the form | `ui/password-input.tsx` |
| **Admin sign-in** | `/login/admin`, linked under the normal login panel. Verifies `userType == 'superuser'` after authenticating and sends anyone else to their own dashboard rather than into an admin shell that 403s on every read. A separate door, not a separate lock — one credential store, and the rules are the authority. | `src/app/login/admin` |
| **Admin account** | Creation *and* promotion via Admin SDK script (`--create`) — the platform's most privileged account no longer depends on passing a public bot filter. Promotion via Admin SDK script — no self-serve admin signup exists by design. `--set-password` recovers an account offline, which `admin@ticketroyality.com` needs because it has **no inbox** and can never receive a reset email. | `scripts/grant-admin.ts` |
| Bot gate (sign-up) | Honeypot + fill-timing + interaction, **scored server-side**; refuses before any account is created. **No single signal can refuse** — the honeypot was weighted 70 and named `company_website_url`, which Chrome's address autofill matched, so real people were refused outright. | `/api/signup-gate` — 12 tests |
| Tiered ticketing | Multiple tiers, prices, quantities per event | `src/shared/types`, `CreateEventForm` |
| Seat map | **Preview/display only** — no editor, no generator | `SeatMapPreview.tsx` |
| Checkout | Stripe session creation, 303 redirect, honest failure | `src/app/api/checkout` |
| Mobile money | KODA client, intents, HMAC webhook verification | `src/backend/payments/koda.ts` |
| **Ticket issuance** | **Cloud Function, transactional, idempotent, oversell-proof** | `functions/src/issuance.ts` — 10 emulator tests |
| **Payment loop tested end to end (B1)** | The step between a verified webhook and a ticket in somebody's hand — `processPaymentEvent` — was **not exported**, which is exactly why the loop had never been exercised. Now exported and covered by 10 emulator tests against real documents: a paid checkout produces tickets, a marker and consumed inventory; a replayed delivery issues nothing further; the loser of a race for the last ticket lands in `oversold` **with a reason**, not silently; two *simultaneous* buyers cannot both get it; a deleted event is terminal rather than retried forever; a refund reverses the tickets and returns inventory; a replayed refund does not credit inventory twice; an orphan refund is terminal; and a free ticket runs the same loop and arrives priced at zero. **Stripe's own API is still not covered** — see below. | `functions/src/payment-loop.test.ts` |
| Refunds | Reversal via payment intent, inventory returned, redeemed tickets protected | same |
| **Zero-commission pricing engine** | **Live.** Organiser 0% / £0, keeps 100% of face value; buyer pays 3.99% + 49p per paid ticket, floored at **79p** (69p could not reach the 2× cost multiple on any rail), no cap. One pure function, integer minor units, country-aware and versioned, so the catalogue price and the charge cannot disagree — which is the compliance requirement, not a nicety. The Congolese 2% mobile-money charge is folded into the single service fee and **advertised at the worst rail**, so choosing a card lowers the total rather than raising it. DRC is defined but `active: false` until its economics and tax treatment are settled. Reports **two** cost views per order: attributable cost (the basis for the 2× multiple) and the **full stack** with the rail percentage on the whole charge, face value included — because the first answers "is the fee priced right" and the second answers "does this order make money", and on international cards those diverge. `DEFAULT_COMMISSION_PERCENT` and `DEFAULT_ADMIN_FEE` are both 0, so every organiser dashboard, statement and settlement reports zero without a second code path. | `shared/fees.ts`, `constants/fees.ts` — 36 tests |
| **All-in pricing everywhere** | One `<TicketPrice>` component with **no prop that renders a bare face value**, so a compliant price is structural rather than a review item. Wired into event cards, homepage discovery, article and related-events strips, the ticket box, the cart and the `Event` JSON-LD `offers.price` — the figure Google quotes in a search result. Checkout adds the fee **server-side** and, on the single-event path, re-reads the tier price from Firestore instead of trusting the form, closing a pre-existing hole where a hand-crafted POST could have bought a £250 ticket for a penny. Terms, how-it-works and get-started read the live config rather than restating it. **Verified in Chromium**: a £96 tier renders £96.00 + £4.32 = £100.32 in the ticket box, and the same £100.32 on the catalogue strip that links to it. | `pricing/TicketPrice.tsx`, `api/checkout` |
| **Unit economics console** | GMV, organiser payouts, fee revenue net of VAT, both cost bases, blended cost multiple with health band, per-ticket revenue/cost/profit, and a count of orders that did not cover their full cost. | `/dashboard/superuser/profitability` |
| Settlement | `settle()` and `platformCutForTicket()` still exist and still honour a **negotiated** per-organiser rate, but the default is now 0% + £0 so they return zero for everyone without a bespoke agreement. **Free tickets carry no charge at all** under any rate — the admin fee used to apply per line with no price check, so a 300-place free guest list cost £150. | `src/shared/pricing.ts` — 15 tests |
| **Payment rails offered only when live** | `usePaymentMethods()` reads `/api/health`, so the BitriPay button appears the moment its credentials exist and is hidden until then. It was always shown and always failed. **It also fixed a money bug that had not fired yet:** both checkout call sites sent the pre-fee face value in hardcoded `USD` regardless of the event's currency, so the day BitriPay's keys were added it would have charged the wrong amount in the wrong currency with the service fee skipped entirely. Both now send `buyerTotalMinor` in the event's own currency. | `hooks/use-payment-methods.ts` |
| **Five articles published against built features** | `venue-zones-and-access-control`, `hospitality-operations`, `rotating-qr-and-ticket-forgery`, `notifications-that-arrive` and `your-ticket-wallet` moved from draft to shipped — but **only after the claims in them were corrected against the code**, which is the whole point of the gate. Removed: a per-event signing salt (the seed is per **ticket**, which confines the blast radius further, and that is what it now says), screenshot detection (does not exist), four delivering channels (email and in-app deliver; push and WhatsApp are catalogued and suppressed, and the article says which is which), recommendation regeneration on transfer (does not exist), and Apple/Google Wallet passes (do not exist). 11 drafts still held back. | `shared/content/features/` |
| **Homepage claims corrected** | The feature grid sold venue zones ("VIP zones, restricted infrastructure sections"), hospitality ("VIP lounges, tables, hospitality packages"), promoter access ("operational nodes") and a fraud "verification engine" — all **Not built**. The revenue block advertised "eight ways to earn" when four of the eight had no code behind them. It now shows **4 live · 4 on the roadmap**, with the unbuilt ones dashed and marked "soon" rather than hidden — an organiser choosing a platform is entitled to see the roadmap, but not to mistake it for the product. Verified in Chromium: all eight overclaiming phrases gone. | `src/app/page.tsx` |
| **About page — invented team removed** | The page listed four executives with placeholder avatars. **None of them exist.** Removed rather than replaced, and it returns when there are real people to name. Two other claims went with it: "refused at the gate in under a fifth of a second" (never measured) and "crypto wallet" as a live payment method (BitriPay has no credentials). | `src/app/about-us` |
| **Server-authoritative checkout (B5)** | Every cart line is **re-priced from Firestore**; the browser now posts identifiers and quantities only. It used to post a per-line price with the coupon discount already spread into it, so a hand-crafted POST could buy a £250 ticket for a penny — and the discount itself was whatever the browser said. The coupon code is now looked up, checked for expiry and exhaustion, and applied server-side. A line whose tier no longer exists is refused rather than charged at the price the browser remembered. | `api/checkout` |
| **Error reporting (B7)** | Google Cloud Error Reporting — no new vendor, and it was already in the project. Failures were logged carefully everywhere and grouped as errors nowhere, because a bare `console.error` lands in Cloud Logging as text. `reportError()` emits the `@type` + `stack_trace` shape Error Reporting groups, counts and alerts on, and **redacts any context key matching key/secret/token/password/authorization/cookie/card/cvv/iban** — monitoring entries are retained and widely readable. Wired into the Stripe webhook (a verified payment that was never recorded is the most expensive silence on the platform), redemption, account deletion and the operations actions. | `backend/observability/report-error.ts` |
| **Checkout inventory holds (B3)** | A seat is reserved for 15 minutes when checkout starts, so the second buyer for the last ticket is refused **before** entering card details rather than after paying. `held` is a separate counter — `quantity` is the organiser's statement of how many exist and reserving must not destroy it — and `availableInTier()` already subtracted it. Placing a hold is a transaction, so two simultaneous checkouts cannot both reserve one seat. Issuance **consumes** the hold in the same write that records the sale, so the seat never reads as free in between. Release is idempotent: a sweep and a cancelled checkout landing together cannot credit the tier twice. `/api/cron/release-holds` is now real and returns `implemented: true`. Holds are on the single-event path only; the cart spans several events and needs a multi-event transaction. | `backend/services/holds.ts` — 11 emulator tests |
| **Login throttling (B6, half)** | `/login` was unthrottled — a list of breached credentials could be tried at any rate, and the first sign would be a customer reporting a compromised account. Two counters: per identifier (6 in 15 min) catches one account being hammered, per network (20) catches one password sprayed across many accounts, which no per-account counter ever sees. **The email is never stored** — records are keyed by a salted hash, because a list of addresses that failed to log in is a list of accounts worth attacking. Fails **open** on a datastore outage: locking every customer out during an unrelated incident is a worse harm than a brief unthrottled window. Says nothing about whether an account exists. | `backend/security/login-guard.ts` |
| **Ticket transfer** | Send a ticket to someone by email; they accept from a signed link, creating an account if they need one. **Accepting rotates the ticket's rotation seed inside the same transaction that moves it**, so every code the previous holder's wallet can compute stops matching within 30 seconds. That is the property that makes this real rather than theatre — reassigning `userId` alone leaves two working copies, which is worse than no transfer because two people believe they are getting in and one seat was sold. This is the first feature that depended on rotating codes existing. Refused for a redeemed, refunded or cancelled ticket, for an event that has started, and for a second pending transfer on one ticket. Ticket state is **re-checked inside the transaction**, because days pass between sending and accepting. Tokens are stored hashed. | `backend/services/transfer.ts` — 14 emulator tests |
| **Venue zones** | Doors inside the venue. Each zone names the **tier ids it admits** — so a gate really does admit only the ticket types assigned to it — with its own capacity and its own re-entry rule. **A zone scan does not consume the ticket**, which is the property most easily got wrong: entering the hospitality lounge and coming back out is normal, and reusing `redeemed` for zones would need a ticket to un-redeem itself every time somebody stepped outside, which `firestore.rules` rightly forbids. Zone admissions are recorded separately and `status` is never touched. Occupancy counts who is **inside now**, not cumulative admissions, so a fire limit reports the number that limit is about — and it is decremented on exit, floored at zero. Leaving is always allowed: a door that will not let someone out is a hazard, not a security feature. One transaction covers the tier check, capacity check, occupancy and admission record, so two doors into the same zone cannot both take the last place. **Organiser editor and door picker both shipped**: zones are defined in the event form (name, capacity, re-entry, and tier chips showing exactly which types get in), and the check-in page asks which door the phone is — main gate by default, since that is the one that redeems. | `backend/services/zones.ts` — 15 emulator tests |
| **Hospitality** | Tables sold as inventory, with deposits, balances and named guests. A package references a **tier** rather than carrying its own price, so a table is `covers` seats of that tier: hospitality and ticket inventory are literally the same counter and cannot disagree about how full the room is. The total comes from `computeOrderFees` — priced as `covers` tickets, because the buyer service fee is per paid ticket and pricing a ten-cover table as one line would undercharge it by nine on the most expensive thing on sale. **Tickets are issued on settlement, never on deposit**: a deposit reserves the table, it does not admit anybody, and chasing a balance from someone already seated is not a position to design into a product. Settlement writes one `payment_events` document and the function that has always issued tickets does it — **no second issuance path, no second way to charge**. Payments are additive and idempotent by reference; a replayed webhook cannot settle a half-paid table. The covers are held with the same `placeHold` every checkout uses, but for a window that runs to the balance due date rather than fifteen minutes; when the balance never arrives the sweep returns the table and `expireLapsedBookings` marks the booking to match, in the same cron pass. Guest lists are capped at the covers paid for and editable until the doors. Organiser editor in the event form, buyer booking and guest-list UI at `/dashboard/customer/bookings`, organiser table plan at `/dashboard/organiser/hospitality`. **Not covered by this version**: per-guest ticket delivery (all tickets go to the booker), table-level seat maps, and anything resembling a concierge workflow. | `backend/services/hospitality.ts` — 24 emulator tests |
| **Pay what you want** | A tier can be `choose` rather than `fixed`: the giver names the amount, floored at a minimum the organiser sets — including a floor of zero, which is a real thing a church runs. `resolveLinePrice()` is the single authority and runs **server-side in the checkout route on both the single-event and cart paths**. This is the one place a posted amount is ever accepted, and the rule is stated precisely rather than relaxed: a `fixed` tier ignores the request entirely, so a crafted POST cannot turn a £250 ticket into a donation — the mode is read from the stored event, never from the form. The stored `price` on a `choose` tier is the floor, so the catalogue lead price, seat map and every existing surface keep working without knowing this exists. The minimum renders through `TicketPrice variant="lead"`, so the advertised figure is still all-in. Capped far above any real gift to stop a typo becoming an unexplained card decline. **Not built**: recurring giving, gift aid, and gift registries. | `shared/pricing.ts` — 7 unit tests |
| **Hidden tiers & access codes** | A tier can be `hidden`: off the event page, and — the part that is actually a control — **refused at checkout without the code, server-side, on both the single-event and cart paths**. Codes are never on the event document: published events are readable by anyone, and an access code is short and memorable by design, so a hash sitting in public data is an offline dictionary attack with no throttle in the way. They live in `event_access_codes`, denied to every client, HMAC'd and scoped to event+tier so one leaked hash cannot be replayed elsewhere. Redemption is throttled in **its own namespace** — sharing login's counters would mean twenty wrong codes locking an office out of signing in, which is a denial of service somebody else can trigger for you. The organiser's form never repopulates a stored code; blank means keep it. Hidden tiers are excluded from `leadPrice()`, so a partner rate cheaper than general admission cannot advertise a price nobody can pay. **Stated precisely**: a stranger reading the raw event document can still see that a hidden tier exists and what it costs, because the tier stays in `ticketTiers` where inventory, holds and issuance read it. The code gates the purchase, not the knowledge. | `backend/services/access-codes.ts` |
| **Door blocklist** | People a venue has barred, refused at the scan. This is the case a validity check cannot catch: the person holds a genuine, paid, unredeemed ticket, and nothing about the ticket is wrong. **A block refuses the scan without touching the ticket** — it stays `valid`, stays refundable through the path that exists, and works again the instant the entry is removed. Cancelling at the door would mean an argument at the front of a queue permanently destroying something somebody paid for. Matching is by email (follows the person across the tickets they buy) or by ticket reference (stops one ticket), checked in **one indexed query** because this is on the critical path of every scan. Entries belong to an organiser and optionally to one event; **nothing is ever platform-wide**, so one organiser cannot bar a customer from somebody else's door. Fails **open** on an error: a blocklist that cannot be read must not become a door that admits nobody. A reason is required and is read out to door staff. The scanner shows it as its own outcome, not as "invalid" — the conversation that follows is a different one. **Honest limit**: a new email address defeats an email entry. | `backend/services/blocklist.ts` — 8 of the 29 door tests |
| **Sales windows (presales)** | Every tier carries an optional `salesStart` and `salesEnd`. A presale is not a separate product — it is an early tier that opens sooner and closes when the general one starts — so it sells, counts, issues and reconciles through exactly the same path as everything else, with no parallel inventory to reconcile by hand afterwards. **Enforced server-side at checkout on both paths**: a greyed-out button is on sale to anyone who can post a form. A tier outside its window is disabled in the buy box and states *when* it opens rather than how many are left, and is excluded from `leadPrice()` so a closed early-bird stops advertising its price. An unparseable date never takes a tier off sale — bad data must not close the doors mid-event. The organiser's inputs are `datetime-local` in their own timezone, converted properly rather than by slicing an ISO string, and a window that closes before it opens is refused by the form. | `shared/pricing.ts` — 6 unit tests |
| **Per-seat selection** | A seating section can point at a tier, and buyers then choose their own seats from the map. **The seat is locked inside the checkout hold transaction**, by document id in `seat_locks` — `create` rather than `set`, so two people choosing F12 at the same instant are separated by the database rather than by a read that happened a moment too early. A refused seat takes no inventory with it, which is the failure that would matter most: an event that silently sells out with empty seats in the room. **Availability is derived, never recorded**: a seat is gone if a live ticket carries it or a checkout is holding it. Nothing has to remember to free a seat on refund — the refund runs in `functions/`, which cannot import this module, so a recorded seat would be unsellable forever and nobody would notice until a theatre wondered why row F never fills. Locks left by a consumed hold are cleared by the same cron as the hold sweep. The public map is served by `/api/events/[id]/seats` because ticket reads are restricted to the buyer, organiser and admins — it returns labels and never who is sitting in them, `no-store`, because a cached seat map sends two buyers at one seat. Restricted-view seats are tagged out of sale and accessible seats are held back, both distinct from "sold" on the map. Seated tiers are bought directly rather than through the cart, which spans events and cannot hold seats. **Not built**: best-available allocation, seat swaps after purchase, and irregular rooms — a section is still a grid. | `backend/services/seats.ts` — 10 of the 21 hold tests |
| **Analytics** | Sales over time with the **dead days drawn as dead days** — a chart that skips them turns a stalled fortnight into a straight line between two good weeks, which is the single most misleading thing a sales graph can do. A sell-out projection that **states its own window on the card** and refuses a date it cannot support, reporting instead which kind of nothing it has (sold out / no recent sales / will not clear before the doors). On a young event the window shrinks to the days the event has existed, so twenty sales yesterday reads as twenty a day rather than one and a half. Arrival curve in fifteen-minute buckets **from real door scans** — the number that decides door staffing, and the one thing the platform knows that a venue cannot easily find out. Tier mix by revenue, lead-time bands, no-show rate, and repeat buyers counted by **events attended rather than tickets bought** (four tickets to one show is a group of friends, not loyalty). Refunded tickets are excluded from every sales figure. Every number comes from one pure module, so what is drawn and what is asserted cannot drift. **Not built and said so on the page**: cross-event comparison, checkout drop-off, traffic attribution, live scans-per-minute. | `shared/analytics.ts` — 18 unit tests |
| **PWA launch screens** | Android and desktop already generated a splash from the manifest — name, `background_color` and a 512px icon were all present, verified against the served `manifest.webmanifest`. **iOS ignores the manifest for this entirely**: without an `apple-touch-startup-image` matching the exact device, an installed app opens on a blank white rectangle for as long as it takes to boot, which on a phone in a queue reads as broken rather than loading. 38 images now ship — 19 devices from the iPhone SE to the 16 Pro Max and the 12.9" iPad, portrait and landscape each. Safari matches on **all** of device width, height, pixel ratio and orientation and skips a near miss, so this is a list of exact hardware and a new phone needs a new row. `device-width`/`device-height` stay the portrait figures in both orientations — swapping them for landscape is the usual mistake and produces links that never match. One dark set rather than two, because the app forces dark and a light launch screen would flash white before handing over. Generated by a committed script rather than hand-made binaries, and the script **fails if its device list disagrees** with the one the markup renders from — otherwise a mismatch is invisible until somebody with that phone installs the app. 478 KB total; the links are ~1 KB compressed per response and are not user-agent sniffed, because varying every HTML response by client costs more in cache misses than the markup saves. | `shared/pwa/splash.ts`, `scripts/generate-splash.mjs` |
| **Free attestation (replaces App Check)** | App Check with reCAPTCHA Enterprise needs a console key and bills above its free tier, and — the real point — **it was never configured**, so every surface marked `enforce` was off. A defence one console visit away from existing has the same effect as none while making everyone believe it is covered. Replaced with proof of work: a signed, single-use challenge issued and verified server-side, feeding the existing risk score. A client cannot mint its own challenge (the signature covers nonce, difficulty and expiry), cannot lower the difficulty, and **cannot replay a solution** — the nonce is burned by a `create`, and burned *before* the work is checked so a valid nonce cannot be hammered with guessed counters. Fails **open**: this is a cost, not authentication, and an outage that refused every sign-up would be doing the attacker's work. Unattested is scored as *unproven*, never hostile — it halves the rate-limit budget rather than refusing, because whoever cannot complete a proof is likelier to be on an old phone than to be an attacker. **Calibration is measured, not guessed**: async Web Crypto managed 20,700 hashes/sec, which would have made the first version take 13 seconds per sign-up, so it hashes through a synchronous SHA-256 in `shared` at 1,069,000/sec — verified byte-identical to `node:crypto`. Difficulty 17 measures 103ms median / 411ms worst here, solved in the background while a form is filled. **Honest limit, written in the source**: a browser hashes in JavaScript and an attacker hashes in C, so the asymmetry runs the wrong way; the rate limiter is what bounds bulk abuse and this raises the floor beneath it. App Check remains the upgrade path for enforcement at the data layer. | `shared/security/pow.ts`, `backend/security/attestation.ts` — 15 emulator tests |
| **Attribution — affiliate, influencer, promoter, sponsor, referral** | **One tracked-link model with five intentions.** Building five would mean five click counters and five commission calculations, and the first time they disagreed nobody would know which was right; what actually differs is the label, whether there is an allocation, and whether commission is owed — a sponsor is `commissionPercent: 0`, measured rather than paid. `/r/CODE` counts the click, sets a **first-party** cookie and redirects; no pixel, no fingerprinting, no cross-site identifier. The browser carries a code and **nothing else** — the percentage, the scope and the allocation are read from the stored link when the payment lands, because a commission a browser could name is one it could set to 50%. Idempotent by the Stripe event id, so a redelivery cannot pay a partner twice. A link scoped to one event earns on that event only, and never on another organiser's sale. **A promoter's allocation stops earning without stopping the sale** — refusing the purchase would punish the customer for the promoter's cap — and an order straddling the boundary earns only the part inside it rather than rounding in the partner's favour. Commission is owed on **face value**, not the charged total, since paying a partner a share of our service fee is not what anyone agreed. Partners see their own numbers at `/partners/CODE?k=…` with **no account**: a key derived from the code and a server secret, read-only, showing no buyer names or emails — a commission does not come with a copy of the audience. **Nothing here moves money**: it records what is owed, with an audit row per order, and the organiser pays their partner directly. Said in the UI, on the partner's page and here, along with the fact that the cut comes out of the organiser's payout rather than the platform's zero commission. | `backend/services/partners.ts` — 15 emulator tests |
| **Per-session ticketing & agenda** | Talks, workshops and breakouts as inventory **inside** an event. Not zones — a zone asks whether a ticket may be in a room *now*, a session asks whether somebody has a place on Thursday at 2pm, decided weeks earlier because the workshop holds thirty and the conference sold nine hundred. Not separate events either: that would give each one its own checkout and make an attendee "buy" six free tickets. **Registration never touches ticket `status`** — a conference pass is used at the front door once. Capacity moves inside a transaction, so two people going for the last place get one place, with a test that runs both at once. **Clashes are refused**: two overlapping sessions means a room keeping a chair warm for somebody who cannot be in it, and that is what keeps the number the organiser orders chairs from honest. Touching at the boundary is not a clash, or a full day is unbookable after the first session. An uncapped keynote books nobody and counts nothing rather than incrementing an unbounded number that looks like capacity. Ownership is read from the ticket document — a route taking a `userId` would let anyone fill every workshop with tickets they do not hold. Public agenda grouped by day, attendee booking against their own ticket, organiser attendee list per room. | `backend/services/sessions.ts` — 16 emulator tests |
| **Season passes & loyalty presales** | A pass **issues a real ticket for every covered fixture** rather than admitting on the pass itself. A ticket redeems once — that property stops one ticket admitting two people and is enforced in the rules — and a pass admitting at twenty fixtures would mean weakening it or growing a second door path. Issuing per fixture is also what a season ticket physically is: a book of tickets. Everything downstream (door, zones, sessions, transfer, refunds) works unchanged, and each fixture consumes **real inventory** in the tier the organiser chose, so twenty pass holders are twenty seats gone from every night rather than a number nobody added up. One payment writes N `payment_events`, each with an id derived from the payment **and** the event, so a redelivery issues nothing — guarded twice, by the purchase record and by each issuance's own id. The price is spread across the fixtures so refunding one night reverses a sensible share. Availability is checked across **every** fixture before the card, because a pass that seats somebody at nine of ten nights is a refund and an apology. **Loyalty is computed, never stored**: a points balance would need something to decrement it on refund and there is nothing, so a refunded ticket takes the loyalty back on its own. Counted by *events attended*, not tickets bought — four tickets to one show is a group of friends, and counting them would hand the best presale to whoever books for their mates. Per organiser, never platform-wide. A gated tier is enforced **server-side at checkout**; the ladder is shared so the buy box explains the gate with the same function, and it fails to `none` on an outage because an early window given away cannot be taken back. | `backend/services/season-passes.ts`, `loyalty.ts` — 13 emulator tests |
| **Offline door scanning** | The organiser downloads the event's ticket list before doors; if the network is unreachable, the scanner decides locally and queues. **The rotating code is still checked offline** — the manifest carries each ticket's seed, so a ten-minute-old screenshot fails exactly as it does online. That is the part most offline modes drop, because checking it needs the secret; shipping it is a real exposure, bounded to one event, on a device that is already the organiser's door, behind a verified token and an ownership check. **What it gives up, stated in the source and in the UI**: online, redemption is a transaction and two doors cannot both admit one ticket; offline the guarantee weakens to one door at a time. That is what "no network" means, and the answer is to make it **auditable** — every scan carries the time the person walked in, and the sync reports any ticket admitted twice with **both** timestamps, so the first admission stands and the second is never silently overwritten. Sync applies oldest-first so a ticket ends up stamped with when the first person entered; a door reconnecting at midnight does not stamp an eight o'clock rush as midnight, because the arrival curve is what the next event is staffed from. A redemption is written locally **before** the door says admit, and cleared only once the server confirms it. Auto-drains on reconnect. **A bug caught by the tests**: the first version passed a window index where a timestamp was expected, which refused every genuine ticket while still refusing every forgery — half the tests passed, which is exactly how that failure hides. | `shared/tickets/offline.ts`, `backend/services/offline-sync.ts` — 15 emulator tests |
| **Live streaming & hybrid** | Ticket-gated player at `/events/[id]/watch`. **The embed URL is absent from the response unless the caller holds a valid ticket** — rendering it into the page and hiding the player would be theatre, since anyone can read a source. A refusal is asserted not to contain the URL. Redeemed tickets keep access (somebody who left the room early paid for the whole thing); refunded ones lose it. The player opens a configurable number of minutes before the start rather than days early, and says *when* rather than only *no*. After the event a replay is served instead of the live embed, with an optional expiry that returns nothing rather than falling back to the live link. Live chat is written **only** through the API, which re-checks entitlement and takes the display name **from the ticket** — otherwise anybody posts as the organiser — rate-limited per person, and the organiser hides rather than deletes so moderation stays auditable. Views count distinct tickets and opens per ticket, so one ticket opening from forty places is visible. **The honest limit, stated in the source, on the organiser's form and on the watch page**: a holder can forward the link. Preventing that needs signed short-lived playback URLs from a streaming provider — a sixth vendor, so a decision rather than a task. Access is gated at the door, not at the pixel. The broadcast `streamKey` is never returned to any client, including the organiser's own browser. | `backend/services/streaming.ts` — 19 emulator tests |
| **Wristbands & tags** | Bind a tag UID to a ticket, admit on the band. **No SDK, no contract, no sixth vendor**: nearly every cheap RFID/NFC reader sold for events is a keyboard wedge — present a tag and it types the UID and presses Enter — so the integration is a focused text input, and the hardware stays the organiser's. Typing a UID by hand works identically when a reader fails. UIDs normalise for case, colons and dashes, so the door does not care which reader was bought. Bindings are **one-to-one in both directions**: one tag cannot bind to a second ticket (one band admitting two people), and one ticket cannot wear two live bands (a lost band replaced without releasing the old one). Uniqueness is the document id, so the database refuses the second binding. Admission is one transaction — two readers presenting one band admit exactly one person — and the **blocklist applies exactly as it does to a QR**, refusing without consuming the ticket. **Stated at the desk and in the source**: a band is a bearer token. There is no code to check and nothing to rotate, because the security is that staff put it on a wrist. A cloned UID admits, which is exactly as true of every wristband ever made. The redemption transaction is deliberately **duplicated rather than sharing the QR door behind a `skipSignatureChecks` flag** — a flag like that is one boolean away from turning the signed path into a bearer path. **Not built**: any specific manufacturer's reader API. | `backend/services/wristbands.ts` — 15 emulator tests |
| **Media library** | Upload once, reuse everywhere. **The bytes never pass through Cloud Run** — the browser uploads straight to Storage, where `storage.rules` already enforces the owner, `image/*` and an 8MB ceiling at the service; pushing an 8MB file through a request would spend its whole memory budget to enforce, more weakly, a rule that is already enforced. What the API records is what landed, so it can be listed and reused. Images are **resized in the browser before they upload** — 2000px longest edge, re-encoded to WebP — because a photo straight off a phone is 4–12MB and is displayed at 1200px, and that difference is an event page that loads on venue wifi versus one that does not; a file that is already small and already a sensible format is left alone rather than re-encoded, which only ever loses quality. **Deleting checks first**: an image removed from under a published event leaves a broken hero on a page that is actively selling tickets and nobody finds out until a customer mentions it, so the events are checked and the titles come back — "used by these three events" is an answer somebody can act on, "cannot delete" is not. The Storage object is deleted **before** the row: if the file delete fails the row survives and the organiser retries, whereas the other order orphans a file that nothing lists and that is paid for indefinitely. The owner is always taken from the verified token, never the body, and a path that does not name the caller is refused a second time here. Pasting a URL still works for anyone who hosts elsewhere. | `frontend/lib/media.ts`, `backend/services/media.ts`, `/api/media` |
| **Best available, seat moves, irregular rooms** | Three things one model needed. **Irregular rooms**: `rows × seatsPerRow` is a spreadsheet, not a room — a stalls curves so the back rows are longer, a gangway splits row F, a pillar removes D7, and numbering does not always start at 1. A section may now carry a `rowSpec` with a seat count per row, aisles, missing seats and a stagger; absent, the rectangle generates exactly as before, so **every section built before this is untouched** — including its row letters, because a label that silently shifts turns a sold seat into a free one on the map and an unknown seat at the door. The builder *proposes* skipping I and O for new rooms (read aloud they are 1 and 0) and writes the names down explicitly rather than imposing them. Rows are reordered by dragging, and by arrow buttons because dragging is not available to everyone. **Said plainly: it is a row editor with a live preview, not a canvas where individual seats are dragged around a floor plan.** **Best available**: the request most people want to make, which a grid of two hundred squares does not answer. Sitting a party **together outranks everything** — four excellent seats in four different rows is the wrong answer — then centre, then front, then a penalty for stranding a single seat beside the block, which is the seat that never sells. A gangway **breaks adjacency**, so a party is never told they are together and then separated by a walkway. When no stretch is long enough the party is split into the fewest blocks and **told so on screen**; when there are not enough seats at all that is a different answer and is not dressed up as a split. Accessible seats are never allocated automatically — they are booked by phone precisely so somebody asks. It runs server-side against the current map (a browser's five-minute-old list would recommend a seat that sold four minutes ago) and **reserves nothing**: checkout still takes the seats. **Seat moves**: a move is a second way to sell one seat twice, so it is a transaction that claims the destination by creating the same lock document checkout creates, and releases it in the same transaction — the ticket is what makes the seat taken afterwards, and a lock left standing would be a seat nobody could ever buy. A swap between two holders is one transaction because as two moves a half-failure leaves somebody seatless. Moves are confined to the ticket's **own tier**: moving from a £20 seat to a £200 one is an upgrade, and an upgrade is a payment. Redeemed tickets cannot move — they are already inside. **A defect fixed on the way**: checkout never checked that a chosen seat belonged to the tier being bought, so a £20 buyer could have posted `A1` and sat in the £200 section with every count still balancing. | `shared/seating.ts` — 21 unit tests · `backend/services/seat-swap.ts` — 18 emulator tests |
| **Donations & Gift Aid** | **The rule that shapes the whole build: Gift Aid is claimed on a gift, never on a payment for admission.** A ticket to a gala dinner buys admission and a meal, so no Gift Aid can be claimed on it — not on part of it, not on the "excess over cost". So a donation is a **separate amount** from the moment it is asked for: its own form field, its own Stripe line added **after** the fee is computed so it carries **no platform fee at all** (the card cost on a gift is ours — charging a percentage of a donation is the line that gets quoted back in public), and its own collection when the money lands. No code path can turn a ticket into a claimable gift. The reclaim is **rounded down per donation, never up and never on the total**: claiming a penny more than the entitlement is an incorrect claim, and a total-level rounding produces a penny that reconciles to no gift and cannot be explained to an inspector. HMRC's **relevant-value test** is enforced — 25% of the gift up to £100, then £25 plus 5% of the excess, capped at £2,500 — so a £100 "donation" that came with a £60 meal is refused before the claim is filed rather than queried after. **Declarations are records, not settings**: never edited and never deleted, stored with the exact wording and version the donor agreed to, because in an audit the question is what *this* donor was shown on the day and an edited component cannot answer it. A new address makes a new declaration; a withdrawal is stamped and kept, and is **not retrospective** — gifts made before it stay claimable, and deleting the row would surrender claims that were valid when made. Declarations are resolved to gifts **at claim time**, so a donor who gives three times and then makes an enduring declaration has made three claimable gifts; a link stamped when the money arrived would have missed all of them. Enduring reaches back four years and no further. The claim exports HMRC's schedule as CSV (dates `DD/MM/YY`, which is the schedule's format and deliberately not this codebase's ISO), and the dashboard shows what is **not** claimable and why — "£600 across eleven gifts, no declaration" is a number somebody can act on. The buyer's total includes the donation **above** the total line, never after it. A donation makes the non-card rails unavailable rather than letting BitriPay or mobile money charge the ticket total and silently drop the gift. **Stated where the claim is made**: this is the schedule and the arithmetic, not tax advice, and rates change. | `shared/gift-aid.ts` — 20 unit tests · `backend/services/donations.ts` — 17 emulator tests |
| **Recurring giving** | A standing monthly gift as a Stripe subscription, started by a plain form POST answered with a 303 so the redirect stays inside the click gesture. **Every month's gift — including the first — is recorded from `invoice.paid` and nowhere else.** Recording the first month at checkout as well would double it, and a donor charged once but credited twice is a discrepancy the charity finds at year end and cannot explain. The charity is read from the **subscription's** metadata rather than the session's, because by month eleven the checkout session that carried it no longer exists. Idempotent by Stripe event id like every other money path. Gift Aid applies to each instalment through the same declaration, so one declaration covers a year of giving. **Stopping is the donor's own decision and takes effect immediately** — a standing gift somebody cannot stop themselves is the thing that makes people refuse to start one — and ownership is proved against a donation row we actually hold rather than a query parameter. Subscription-mode sessions return early from the webhook rather than falling through the ticket branch and logging an error for metadata they were never meant to carry. | `backend/payments/stripe.ts`, `/api/giving/recurring` |
| **Auction lots** | Silent-auction lots on an event, bid from the room. **A bid is one transaction**: "read the high bid, add the increment, write it" is the classic lost-update bug, and in an auction it does not merely lose data — it tells two people in the same room they are winning, which is the moment an organiser stops trusting the software in front of their guests. Tested with simultaneous bids: exactly one leader, one bid counted. The loser is told **the real current price** rather than an error, because by the time a bid arrives the lot has usually moved and "the price is now £120" is a next step where "rejected" is a dead end. **Anti-sniping**: a bid inside the final window pushes the close out, so a lot ends when the bidding ends rather than when the clock runs out — a hard cutoff rewards the fastest connection over the highest bidder. Earlier bids leave the time alone, or a lot with steady interest would run all night. **You cannot outbid yourself** — it only raises the price you pay and looks like the auction is milking the room. Lots close **on the cron**, not on somebody remembering: the one evening nobody presses the button is the evening the auction runs until morning. A lot that never met its reserve closes **unsold**, because the reserve is the organiser's floor. The reserve **amount** is never disclosed but whether it has been **met** is, since a room bidding towards a wall it cannot see stops bidding. Every bid is kept, not just the winning one — "who bid what and when" is always asked afterwards. The API returns the price, the bid count and whether *you* are leading, and **never who else is bidding**: an auction is public about money and private about people. **A winning bid buys goods, so no Gift Aid is claimed on it** and it never touches the donation path. **Not built**: proxy/maximum bids, and the live price is a 15-second poll rather than a socket — stated in the source rather than dressed up as live. | `shared/auctions.ts`, `backend/services/auctions.ts` — 16 emulator tests |
| **Gift registry** | A wedding list, a baby shower, a leaving collection: named gifts with a cost, given towards by guests. **The running total is stored on the item and only ever moves inside a transaction that also writes the contribution row.** Summing on every read is correct but slow on a page a hundred guests are refreshing; incrementing outside a transaction loses contributions when two guests give at once — and on a registry that means a couple thanking somebody for a gift the list forgot, which is worse than a wrong number. Tested with simultaneous gifts: both count. Idempotent by Stripe event id, so a redelivery never shows a guest as having given twice. **Fully funded means closed** — a £400 mixer that has been paid for is not something two more guests should be able to buy — and the check is inside the same transaction as the increment, so a race cannot overshoot. More than the remaining balance is **refused rather than trimmed**: taking £80 towards a £30 balance and keeping the difference is not a decision to make on somebody's behalf. Part payments are allowed by default because that is how a large item gets bought at all, and an all-or-nothing gift refuses them. Unfunded gifts sort first, because a list with the finished ones at the top looks done. The contribution carries a message, and the couple get a **who-gave-what list for the thank-you letters** — guests see only the totals, never each other. Contributions ride the **same checkout as everything else** and carry **no platform fee**. **A present is not a charitable donation**: no Gift Aid, and registry money never reaches the donation collection. | `backend/services/registry.ts` — 11 emulator tests |
| **Public API, webhooks & sandbox** | Two read endpoints under `/api/v1` — events and tickets — with keys, scopes, a sandbox and signed outbound webhooks. **The key is never stored**: only an HMAC of it, so a leaked database is useless to whoever reads it, and a lost key is replaced rather than looked up. The secret exists once, in the response that created it, and the dashboard says so on screen rather than letting somebody discover it later. **Live and test are different keys, not a flag** — a `tr_test_` key reads fixtures and touches nothing real, which is what stops a first integration attempt from redeeming live tickets; a request cannot reach live data by omitting a header, because the mode *is* the key. The fixtures deliberately include a **sold-out tier, a redeemed ticket and a refunded one**, which a fresh live account has none of and which is exactly what breaks integrations. Scopes are enforced per endpoint, and **attendee names and emails need their own scope**, so a reporting key can count tickets without being able to export a mailing list. Queries are **scoped to the caller's organiser in the query itself**, never filtered afterwards — a post-filter is one refactor away from being dropped, and the failure is one customer reading another's data. **Webhooks are signed** `t=…,v1=…` over `timestamp.body`, the Stripe construction, because integrators already have code for it and signing the timestamp is what stops a captured delivery being replayed forever; verification is exported and tested against replay, tamper and wrong-secret. Endpoints must be **https and not private addresses** — `localhost`, `169.254.169.254`, RFC1918 and `.internal` are refused, because a URL we POST to on a schedule from inside our own network is otherwise a request-forgery tool aimed at us. Deliveries are **queued, never sent inline**: a ticket is issued whether or not somebody else's server is up. Retries back off across five attempts, then the delivery is marked failed and **stays in the log** — silence is the one outcome that would make this untrustworthy. `ticket.redeemed` is queued **after** the transaction, never inside it, because Firestore retries a transaction and an integrator would see one person admitted three times. **`ticket.issued` is deliberately absent from the catalogue**: issuance runs in `functions/`, so an event fired from the app would be a guess about something that had not happened yet. `/developers` was rewritten in the same commit — it promised a write API, payouts, fraud alerts, KYB events, rate limits and SDKs in four languages, none of which exist. **Not built, and said on the page**: writes, SDKs, an OpenAPI file, published rate limits, cursor pagination. | `backend/services/api-keys.ts`, `backend/services/webhooks.ts` — 21 emulator tests |
| **Homepage spotlight & promotions (P0 fixed)** | The homepage carousel was **three hardcoded demo events** with a poster image standing in for a video that did not exist — and the promotions page **charged £249 for a slot in it**. The form posted an `eventId` with no `tierId`, so checkout skipped the re-pricing guard that only runs when both are present and trusted the posted amount; the webhook then found no `tierId`, logged `missing_metadata` and recorded nothing. **An organiser was charged and received nothing, with no record that they had paid.** Both halves are fixed: the strip is now driven by the real `featured` flag on real events and **renders nothing at all when nothing is featured** — an empty section is honest, an invented one is not — and the placement buttons are **enquiries, not payments**, until fulfilment exists. Control it by featuring an event; the £249 line no longer takes money for a thing that cannot be delivered. **Video is now real (28 Aug):** an organiser uploads a short MP4/WebM in the event editor (`videoAdUrl`, straight to Storage, ≤50MB, size- and type-bounded by `storage.rules`), and the strip **plays it muted + looping while a Spotlight placement is active**, falling back to the cover image when there is no video — a paid video ad that is genuine when supplied and never faked when it is not. | `frontend/components/home/VideoAds.tsx`, `frontend/components/media/VideoAdPicker.tsx`, `/dashboard/organiser/promotions` |
| **Sign-up gate: refused a real applicant (fixed)** | An organiser filling the three-step application was told "we could not verify this sign-up" and could not create an account. Two defects, both in the scoring rather than the form. **An expired proof-of-work challenge was scored as a failed one** — hostile, +30 — when it only means the person took more than ten minutes between the form appearing and pressing the button, which on a three-step application is what a careful human does and what no script does. Slowness now scores as *unproven*, exactly like silence; forgery, insufficient work and a replayed nonce stay failures, because each of those is somebody constructing a token rather than solving one. **And the bar to refuse outright was the generic `severe` band (70)**, which one weak signal — a role address, an unproven attestation, an autofilled honeypot — could reach in combination. It is now **85**: the honeypot plus a second strong signal, or three independent ones. The asymmetry is the one the file already argued for the honeypot and had not applied to the threshold — every account created here lands in a queue a human reviews before an organiser can publish anything, so a doubtful sign-up costs somebody a glance, while a wrong refusal is a real applicant told they are not a person, who does not come back. | `backend/security/attestation.ts`, `/api/signup-gate` — 16 emulator tests |
| **Organiser branding is an upload, not a URL** | The application's Branding step asked for a **Logo URL** and a **Cover image URL** — typed. Asking somebody to paste a URL for their own logo is asking them to go and host it somewhere else first, so most people skip it and every organiser page starts unbranded. Both are now file pickers with drag-and-drop and a live preview. **The file is held until the account exists**, because there is no uid during registration and `storage.rules` requires the uploader to own the folder they write to; the upload runs the moment `register()` returns and the user is signed in. It is deliberately **after** the account and never blocking it — a dropped connection must not cost somebody the application they just filled in, so a failed upload says the account was created and the images can be added from Settings, which is true: `ProfileForm` has mounted the real uploader there all along. Images are resized in the browser before they leave it, and the client's size ceiling now **mirrors each folder's rule** (organisers 4MB, users 5MB, events 8MB) rather than using one 8MB number for all three — a client limit more generous than the service's is worse than none, because the file uploads and the refusal arrives with nothing a person can act on. | `frontend/components/common/ImageDrop.tsx`, `frontend/lib/media.ts` |
| **Six held-back drafts corrected and published** | 20 published → **26**, with four deliberately still held. Every one was checked claim-by-claim against what is built, and every one was wrong somewhere. The API article promised a **write API, idempotency keys and selling tickets in the sandbox** — none exist; it now describes two read endpoints and lists what does not exist as a section of its own. Live streaming claimed **concurrent-session limits that stop link-sharing**; we explicitly cannot, so it now says a holder can forward the link, that we report it rather than prevent it, and why. The bot article described **App Check attestation verified at the database, storage and functions** — the thing that was never configured; it now describes the proof-of-work that actually runs, at our routes, and says which is stronger. The seat-map article promised **generation from a photograph or a description plus a reconciliation report**; it is now about the row builder that exists. Affiliate claimed a **last-touch attribution window and refund reversal** — neither is built, and the article now says so. Loyalty claimed **points on a door scan**; standing is counted live from tickets held. **Four stay drafts because the feature genuinely does not exist**: the anti-fraud agent (`sentinel.ts` is a module nothing calls — no telemetry reaches it and nothing acts on its output), ticket-as-discovery (recommendations are on the homepage, not the ticket), the influencer programme (no follower verification), and sponsor reporting (no aggregate reporting suite). `check:links` enforces the gate. | `shared/content/features/*.ts` |
| Coupons | Organiser coupon management | `/dashboard/organiser/coupons` |
| **Door scanner (B2 closed)** | Redemption moved off the organiser's browser and into `/api/tickets/redeem`. **One Firestore transaction**, so two doors scanning the same ticket at the same instant admit exactly one — the old path read the status and wrote `redeemed` separately, and both reads saw `valid`. The QR is **signed**: an HMAC over ticket id + event id, written at issuance, verified against a freshly recomputed value so a signature pasted onto a ticket document does not help either. Event ownership is proved server-side. The payload no longer carries the buyer's `userId` — nothing read it, and photographing a ticket revealed an account id. A drift between the app's and `functions/`' signing format throws at module load rather than refusing every genuine ticket at a gate. **Correction to this file's own earlier claim:** an unsigned QR was never forgeable into a free entry; redemption always required a real `valid` ticket. The defects were the missing transaction and the browser being the authority. A screenshot still works **once** by design — rotating codes are not built. | `backend/services/redeem.ts` — 14 emulator tests |
| AI studio | Real generation call, through the gateway below | `/dashboard/organiser/ai-studio` |
| **AI gateway** | **Gemini → Claude → OpenAI fallback chain.** One prompt per task shared by all three; output is only accepted once it parses *and* satisfies the task's zod schema, so prose or a wrong shape fails over rather than reaching the user. Billed from the answering provider's own token counts. | `src/backend/ai/gateway.ts` — 10 tests |
| **AI dynamic selling** | Per-event toggle on the organiser's edit page. The AI reads real sell-through against time remaining and proposes a price per tier with its reasoning; **the organiser applies each one**. Automatic repricing was considered and rejected — there are no checkout inventory holds, so a self-moving price can move underneath someone mid-checkout. The task is **not** in `TASKS`, so it cannot be reached through `/api/ai`: `sold` and `quantity` are the entire argument for a price, and a client able to post them could manufacture a sell-out. Apply takes a tier id only; the price comes from the stored suggestion, and a tier edited since the review returns 409. Clamped to ±40%, never below zero, and **a free tier is never made paid**. | `backend/services/dynamic-pricing.ts` — 10 tests |
| Video ad carousel | Homepage component | `VideoAds.tsx` |
| ACU billing | 1 ACU = $0.01. **100 ACU free** on every account; top-ups $5 / $10 / $15. The cost multiplier lives in a **`server-only` module**, so a client component importing it fails the build — it is in no browser bundle, including an administrator's. `publicCharge()` is the only shape that may cross an API boundary. | `backend/billing/margin.ts` — 18 tests |
| **Ticket delivery** | **SMTP email on issuance — one email per purchase, retried, outcome recorded** | `functions/src/email.ts` — 10 tests |
| **Comms dispatch** | **`dispatch()` now really sends email** over the same Hostinger mailbox, for all 104 catalogue events. Output recorded per channel in `comms_deliveries`. Channels with no approved provider record `suppressed` **with the reason**, never `queued`. | `backend/comms/dispatch.ts` — 10 tests, real SMTP |
| **Notifications wired** | Refund processed and issuance-failed/oversold email from the payment function; organiser approved/declined emails from `/api/admin/organiser-decision`. All idempotent — a replayed refund webhook cannot email twice. | `functions/src/index.ts`, `api/admin/organiser-decision` |
| **Weekly newsletter** | Built from `publishedArticles()` + live upcoming events — **a draft article can never reach an inbox**, pinned by test. Sent in throttled batches of 25 with a per-week cursor, so a blast cannot exhaust the Hostinger SMTP cap and take ticket delivery with it. One-click unsubscribe (signed token, no login) plus RFC 8058 `List-Unsubscribe` headers. | `backend/newsletter/` — 15 tests |
| **In-app notifications** | The `inapp` channel now **delivers**. 177 catalogue events declared it and every one recorded "not implemented" — a refund processed, an organiser approved, a payout sent, all landing in a delivery log nobody outside the admin console reads. Notifications are Firestore documents the recipient owns, so the header bell **subscribes live** rather than polling: no request every few seconds from every open tab. The whole rendered message is stored rather than an event key, because re-rendering from the catalogue means a six-month-old notification shows today's wording for yesterday's event. Trimmed to the 200 most recent per user on write. `firestore.rules`: read your own, mark your own read, and **creation is denied to every client** — a forged "your account has been locked" is a screenshot that travels. | `backend/comms/inapp.ts`, `NotificationBell.tsx` — 5 rules tests |
| **Admin comms console** | Catalogue browser, delivery log with status filters, and a template test that is **sandbox by default**. | `/dashboard/superuser/comms` |
| **Admin operations console** | The "watch after deploying" list below, rendered. Live queries for `payment_events` `oversold` / `failed`, events stuck in `pending` or `processing` past ten minutes, and `issued_payments` whose `delivery` failed or was skipped. Each alert states what it means for the customer and what has to be done — a red number with no instruction just relocates the confusion. An unreachable database yields an unavailable console, **never a plausible-looking zero**, because the number in question is "customers owed a refund". | `backend/services/operations.ts`, `/dashboard/superuser/operations` |
| **Operations actions** | **Retry** hands a `failed` or stuck payment event back to the ten-minute reconciliation sweep (status → `pending`, attempts → 0). Safer than invoking issuance from the app: the sweep is the tested path, and issuance is idempotent by document id so a retry racing it cannot issue twice. **Resend** re-sends a buyer's tickets over SMTP and records the outcome. **Refunds are deliberately not a button** — that moves real money and belongs behind its own flow, not one click in a console. The all-clear state distinguishes "nothing needs attention" from "nothing has been sold yet", because zero over an empty platform reads as a broken page. | `backend/services/operations-actions.ts`, `/api/admin/operations/action` |
| **Admin accounts list** | Every account with role, status and marketing state, searchable. Read through a `requireAdmin` route rather than the client SDK: `firestore.rules` permits any signed-in user to list `users`, and those documents carry email, phone, address and date of birth. **No role editing** — `grant:admin` and `firestore.rules` remain the only authority. | `/api/admin/users`, `/dashboard/superuser/users` |
| **Profile photo & cover** | Every account type, **including the administrator**. `logoUrl` / `coverUrl` were organiser-only, typed as URLs at registration and never editable afterwards; they are now uploaded to Firebase Storage under `users/{uid}/` and changeable from every dashboard. Downscaled in the browser before upload (512px avatar, 1600px cover), so the 5 MB storage-rule ceiling is never hit by a phone photo. The old file is deleted **after** the new URL is saved, never before. **`storage.rules` deployed 17 Aug 2026** — the `users/{uid}/` path is live. | `dashboard/ProfileMedia.tsx`, `storage.rules` |
| **`firestore.rules` tested, not just written** | 20 tests against the real emulator. Covers the B4 leak, privilege escalation (self-promotion to superuser, self-approval, bespoke commission, wallet top-up), and ticket abuse (reading a stranger's ticket, un-redeeming a redeemed one, rewriting your own ticket price). A rules file is the last thing that should ship on the strength of being read carefully. | `scripts/rules.test.ts` — `npm run test:rules` |
| **Organiser PII leak closed (B4)** | `allow get` carried `|| resource.data.userType == 'organiser'`, making every approved organiser's **full** user document — email, phone, postal address, date of birth — readable by anyone reaching Firestore, with no account, by uid. Organiser uids are published in the sitemap, so the target list was public too. `allow list` was `isSignedIn()`, so one free registration enumerated every user and read the same fields in bulk. Both are now self-or-administrator. Nothing needed the old rules: `getUserProfile()` is only ever called with the caller's own uid, and the public directory uses the Admin SDK projection. | `firestore.rules` — 20 tests |
| **Privileged API auth** | `requireUser()` verifies the Firebase ID token server-side (`checkRevoked`); `requireAdmin()` builds on it and re-reads `userType` from Firestore, so admin status has one source of truth. Both fail closed. | `backend/auth/require-user.ts`, `require-admin.ts` |
| **Account deletion** | **Real erasure.** The dialog previously showed "scheduled for deletion, our team will confirm within 30 days", signed the user out and did **nothing** — no record, no email, no deletion, while the product claimed a UK GDPR Article 17 request had been accepted. It now deletes the Auth user and the `users` document, and **anonymises tickets rather than destroying them** (Art. 17(3)(b) retains the financial record; name, email and `userId` are stripped so nothing points back to a person). Refuses for a superuser — `grant:admin` runs from the server, so a self-delete leaves no way back in — and for an organiser holding sold tickets on an upcoming event, naming the events. The uid comes only from the verified token; the route accepts no uid in the body. | `backend/services/account-deletion.ts`, `/api/account/delete` |
| **Segments page honesty** | `/industries` described twelve segments in the present tense. Seat-level inventory, gates admitting only assigned ticket types, sub-promoter settlement waterfalls, loyalty-gated presale, wristbands, an emergency blocklist, corporate tables with deposits, invite-only ticket types with access codes and a seat map editor with obstructed-view tagging — **none of those exist**, and five of them are rows in the *Not built* table below. Every card now states what the platform does today plus an explicit **Not yet** line. Corrected in the copy, **not** in the claim about the code. | `src/app/industries/page.tsx` |
| Blog | 14 published articles, 6 topic hubs, generated link graph | `npm run check:links` |
| SEO | `robots.txt`, `sitemap.xml`, Article/FAQ/Breadcrumb schema. Private pages are **crawlable and `noindex`**, not `Disallow`ed — a blocked page that is linked still gets indexed, and blocking it is what stops Google learning it should not be. | `src/app/robots.ts`, `next.config.ts` |
| Security headers | CSP-adjacent headers, HSTS, frame denial | `next.config.ts` |
| **PWA** | Installable, `display: standalone`, `viewport-fit=cover` with `env(safe-area-inset-*)` so the app fills the screen and still clears the notch and home indicator. Service worker: network-first documents, cache-first immutable assets, and **`/api`, `/dashboard`, `/account`, `/cart`, `/checkout`, auth routes are never cached**. Offline fallback page; install prompt suppressed for 90 days after a dismissal. | `app/manifest.ts`, `public/sw.js` |
| **Maps & directions** | Live Google **Embed** API map on every event page with a venue, switching to route mode once a starting point is set. Origin from browser geolocation or a typed postcode; drive/transit/walk; Apple Maps link. A Map tab on `/events` centres on a chosen event. **Directions need no API key** — only the embedded map does. | `events/EventMap.tsx`, `events/EventsMapView.tsx` |
| Styling | Tailwind scans `./src/**`. It previously scanned `./src/pages` and `./src/components`, **neither of which exists** — so every class used only in `src/frontend/**` was never generated and most of the UI rendered unstyled. | `tailwind.config.ts` |
| Health | `/api/health` reports per-dependency status, fails closed | `src/app/api/health` |

## Removed

| What | Why |
| --- | --- |
| `/dev-access` | A public page offering to set the signed-in account's role to platform admin, plus the shared password for three named test accounts. The role change itself was already refused by `firestore.rules` (`noPrivilegedFields()` blocks a self-write to `userType`), so it was not an open escalation — but it published `admin@ticketroyality.com` and a working password on the live site, and told visitors the platform was mid-development. |
| Test-account panel on `/login` | Listed `admin@ticketroyality.com` publicly. That account has **no inbox**, so if it is ever compromised it cannot receive a reset email — naming it on the login page was the worst possible place to advertise it. |
| `localStorage` identity in `use-auth` | The auth hook synthesised a signed-in profile (including `userType: 'superuser'`) from a `localStorage` key when Firebase was unconfigured. Only `/dev-access` could write that key, so it went with it. |

## Not built

Each of these is **specified in `docs/`** and **absent from `src/`**. That combination
is precisely what caused the confusion this file exists to end.

| Gap | Consequence if you launch without it | Spec |
| --- | --- | --- |
| **International cards lose money above ~£166** | Not a bug — an arithmetic consequence of the published rate, found by modelling the full cost stack. Net of VAT the fee earns 3.99 ÷ 1.2 = **3.325%** of face; an international card costs 3.25% of face **plus fee** = **3.38%** of face. The 49p fixed component covers the gap on small tickets and is exhausted around £166, going permanently negative from about £193. It bites exactly where §26 says the percentage is meant to earn — VIP, hospitality, premium. The fee cannot be varied by payment method (that is a surcharge), so the levers are a negotiated international rate, routing, or a higher headline percentage. Pinned by test. | `shared/fees.test.ts` |
| **Per-order pricing snapshot** | **CLOSED 19 Aug (audit).** Both webhooks now persist `feeSnapshot` (pricingVersion, config version, face, fee, buyer total, payout) onto `payment_events` from the provider metadata. Remaining half: `services/profitability.ts` still recomputes PRE-snapshot orders from today's config and should prefer the snapshot where present. | `api/stripe-webhook`, `webhooks/koda` |
| **Ticket delivery email shows face value** | **CLOSED 19 Aug (audit), pending functions deploy.** The issuance email reads the payment's `feeSnapshot` and itemises ticket value + service fee + total paid; pre-snapshot payments keep the face-only rendering. Live after the next `firebase deploy --only functions`. | `functions/src/templates.ts` |
| **Stripe API itself, unexercised** | The loop is proven from "a signed webhook has been verified and recorded" onward. Creating a checkout session, Stripe signing the webhook, and money actually moving all happen on Stripe's side and cannot be simulated here. **One test-mode purchase against the live Stripe API is still required before real money moves**, and only someone with the keys and network access can run it. | `api/checkout`, `api/stripe-webhook` |
| Comms **callers** — the rest | Refunds, issuance failures, organiser decisions AND event cancellations now dispatch (`event.cancelled` is mandatory in `services/cancellation.ts`). Payouts (no payout system exists) and waitlists (not built) remain silent because the features they would announce do not exist. | `docs/04` M10 |
| **Push delivery (FCM)** | Still not wired, and still records `suppressed` with the reason rather than claiming a queue. In-app now delivers, so an FCM outage is no longer total silence. | `docs/04` M10 |




| Ticket recommendations | **CLOSED 18 Aug.** The printed ticket splits the page and fills the second half with three behaviour-based picks; the modal suggests from purchase history. | `TicketModal.tsx` |
| **App Check enforcement (B6, remaining half)** | Still not enforced, and it is the half that matters: login throttling raises the cost of credential stuffing **through our form**, but a script calling Firebase Auth directly never touches it. App Check enforces at the Firebase service itself. **Blocked on a reCAPTCHA Enterprise site key from the Google Cloud console** — same project, no new vendor, but it cannot be created from here. Until it exists, do not describe the platform as protected against automated account attacks. | `shared/security/appcheck.ts` |

| Organiser profile `get` rule | **CLOSED.** `users` get is `isSelf || isSuperuser`, list is superuser-only; the directory and sitemap read through the Admin-SDK projection. The rules file documents the closure. | `firestore.rules` |
| Sentinel telemetry | `sentinel.ts` reads no real signal | `docs/03` §3.6 |
| Atomic ACU ledger (**D2**) | Ledger entry and balance are not written in one transaction | `docs/13` D2 |
| Venue map generation | Only a preview component exists | `docs/04` M23 |
| Waitlist | Defined in the comms catalogue, no implementation | `docs/04` M6 |
| SMS / WhatsApp delivery | **Blocked, not pending.** No approved provider exists inside the vendor list (`CLAUDE.md` §1). The channels are declared in the catalogue; `dispatch()` records and sends nothing. | `docs/04` M10 |
| Error tracking | **CLOSED.** `backend/observability/report-error.ts` emits the structured `ReportedErrorEvent` shape Google Cloud Error Reporting groups and alerts on, with credential scrubbing; wired through the payment webhooks, checkout and services. | `docs/21` |
| Google Maps key | **CLOSED.** `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is declared in `apphosting.yaml` (event map + browse map), `GOOGLE_MAPS_SERVER_KEY` powers geocoding. Keys live in the console, referrer/API-restricted. | `docs/07` |


## 18 August 2026 — first live test day, and what it changed

Everything below was driven by one person actually testing the platform. Each row was
verified the way this file demands: typecheck, lint, production build, and the tests
named beside it.

| Change | State | Evidence |
| --- | --- | --- |
| Errors name themselves | `describeError()` reads what an error actually is — auth, Firestore, Storage, permission — instead of generalising everything to "Something went wrong". Unknown codes print in brackets. | `shared/errors.ts` |
| Registration | Fixed twice over: the browser SDK now sets `ignoreUndefinedProperties` (a blank optional field refused the whole profile write with `invalid-argument`), and the rules suite covers the registration write itself — six cases that did not exist when the deployed rules refused it. 42/42. | `shared/firebase/client.ts`, `scripts/rules.test.ts` |
| Welcome email | `/api/account/welcome` dispatches `account.welcome.*`, which the catalogue declared and nothing ever sent. Idempotent by a transactional claim on the profile; recipient read server-side from the verified token. | `api/account/welcome` |
| Fee copy in email | The approval email said "5% plus 50p" — the abandoned model. Organiser terms now stated as the code implements them: 0%, keep 100% of face. | `api/admin/organiser-decision` |
| Featured placement | Was free to anyone who ticked a checkbox: the form wrote `featured: true` directly and nothing checked. Now request/grant: form writes `featuredRequested`, rules refuse `featured` from non-superusers (tested), superuser dashboard gained the grant/revoke queue. The dashboard's invented "Revenue streams" figures (tickets × £2.45 etc.) are gone. | `firestore.rules`, `dashboard/FeaturedPlacements.tsx` |
| Free tickets obtainable | A wholly free order previously dead-ended in Stripe (zero-amount sessions refused). Checkout now writes the same `payment_events` document a paid webhook writes — provider `free`, one issuance path for both. Direct "Get N free tickets" button on free tiers. **Issuance itself runs in deployed Cloud Functions; `firebase deploy --only functions` is part of go-live.** | `api/checkout` |
| AI event drafting | "Start with AI" on the create form: brief in → title, description, category (clamped to the real taxonomy), tiers out — all editable, nothing saved until submit. Task `event-draft` in the gateway. | `backend/ai/tasks.ts` |
| Venue → coordinates | `/api/geocode` fills lat/lng from the venue name. Needs `GOOGLE_MAPS_SERVER_KEY` (Geocoding API only, server-side — referrer restrictions do not apply to it); says so plainly while unset. | `api/geocode` |
| Currencies | Full ISO 4217 list, CDF included, corridors first. The form warns when cards cannot settle the chosen currency (Stripe has no CDF — that corridor is mobile money). | `shared/constants/currencies.ts` |
| Sponsor logos | Uploaded via the media library, not pasted URLs. | `CreateEventForm` |
| Placement enquiry | Was a `mailto:` link — silently nothing on machines without a mail client. Now posts through `dispatch()` to the platform inbox. | `api/partners/enquiry` |
| Private events | `listing: 'unlisted'` — link-only, off homepage/browse/search/sitemap, `noindex`, still buyable. Default remains public; the toggle is on the publish card. Enforced in `getEvents()`, the one query every public surface uses. | `repositories.ts` |
| Company name | Organisers are identified by company name across header and profile (`accountDisplayName()`), and can finally edit it in settings. | `shared/utils.ts` |
| Seat shapes (docs/23 phase 1) | Sections render straight, curved, arc, angled or vertical from derived coordinates — same labels whatever the shape, so nothing money-side moves. SVG picker with zoom; organiser preview from the same geometry. 28/28. | `shared/seating.ts` |

### Auction: live and by proxy (18 Aug, evening)

The charity card's "Not yet" is closed, both halves:

- **Live.** The 15-second poll blamed the vendor constraint for not streaming; the
  stream was in the stack the whole time (Firestore `onSnapshot`). The actual blocker
  was that the lot document carries the high bidder's name, email and secret maximum,
  and rules cannot hide fields. The server now writes a public **ticker** per lot —
  price, count, close, reserve state, and nobody's identity — in the same transaction as the bid, and
  the room watches that. Rules-tested: ticker readable by anyone, writable by no client,
  lot still closed.
- **Proxy.** Every bid is a maximum. Settlement is a pure function
  (`settleProxy`): higher ceiling leads at one increment past the lower, capped at its
  own; ties to the incumbent. A challenger beaten by a standing maximum is beaten
  *instantly, in the same transaction*, and told so — never shown as leading and then
  displaced. The leader can raise their ceiling without moving the price; lowering is
  refused. Emulator: 19/19, including the ticker-never-carries-a-person check.

### Sellout upgrades (stadiums card)

Opt-in per event: when a tier sells out mid-checkout, the buyer is moved to the
cheapest strictly-dearer public tier with room, at the price they chose — the organiser
opted into giving away the difference rather than refusing the sale. The selection
(`upgradeTierFor`) never uses hidden tiers (someone's negotiated allocation), never
splits a party, respects sales windows and held inventory, and never applies to chosen
seats, whose sections are wired to the sold-out tier. The Stripe line names the upgrade.
Pure-function spec: 43/43 in pricing tests. The stadiums card's "Not yet" is closed for
the checkout path; post-purchase upgrades of already-issued tickets are the theatres
card's paid-move item, still queued.

### Per-session check-in and certificates (conferences card)

Two of the card's three "Not yet"s close; speaker portals remain and the copy now says
only that.

- **Check-in** is the third kind of door: redeem consumes the ticket once, a zone
  admits, a session scan *records* — they turned up — and touches nothing else. Same
  scanner, same parser, a session selector beside the zone one. Capped sessions refuse
  tickets with no reservation (that is what the reservation was for); scanning twice
  reports the first time and counts once, idempotent by document id. Emulator: 22/22.
- **Certificates** are a signed page, deliberately not a PDF pipeline: the owner mints
  a link from their redeemed ticket (organiser can too), the link carries an HMAC over
  the ticket id under `QR_SIGNING_KEY`, and it renders for whoever it is shown to — an
  employer or CPD assessor needs no account. It states attendance from the door scan,
  lists the sessions actually scanned into, and prints to PDF in any browser. An
  invalid or unredeemed link is a plain 404: a verifier probing ids learns nothing, and
  a certificate for someone who never arrived cannot exist.

### Paid seat upgrades (docs/24 §14, theatres card)

A seat on a dearer tier is now a purchase inside the change-seat dialog: the server
quotes the difference over what the ticket was *actually bought for* (plus the buyer
service fee on that difference, same engine as every price), the seat is held while
they pay, and the move lands from the Stripe webhook — idempotent by event id, one
transaction across the ticket, both tiers' counters, the hold and the seat lock.
Downgrades stay refund-and-rebook, deliberately: paying money out through a seat dialog
is where two support queues become one confusing one. A paid seat lost between charge
and webhook fails loudly into the operations queue — never silently. Emulator: 24/24.
docs/24 records the wider Venue OS vision this came from, with its own honest gap map.

### Whole-pass transfer (sports card)

One link moves every remaining fixture of a season pass — gathered by the pass's own
tier per fixture (a separately bought GA ticket for the same night never rides along),
accepted in one transaction: every ticket re-owned, every rotation seed reseeded (the
sender's wallet codes die), every QR re-signed, the loyalty holder record following the
person who now attends while the original buyer stays on the purchase as the money's
history. Fixtures already attended or refunded stay put — that is the sender's history,
not the platform's to move. Sender card on the customer dashboard; claim page mirrors
the single-ticket one (deliberate accept, never a prefetch side effect). Emulator:
16/16. docs/24 part 2 (§30–46) is filed with the same honest four-way sort as part 1.

### Rooms from a sentence (docs/24 §48–49)

"20 curved rows, 30 seats growing by 2, centre aisle" → the AI gateway drafts the
section's row plan and shape into the same editor and live preview hand-typed rows use,
clamped server-side to the exact bounds the form enforces (≤40 rows, ≤80 seats,
sweep 10–180°) whatever the model says. Nothing saves until the event form is
submitted. Same contract as event drafting: the model proposes, the preview shows, the
organiser decides. docs/24 part 3 (§47–56) is filed, including the finding that the
document's own "Phase 1 — Foundation" list was already substantially built here, and
the §51 microservices recommendation is accepted as modules and declined as deployment
topology (docs/22 architecture stands).

### Companion rules (docs/25 §20 — the entitlement engine's first rule)

Attendee types can now require accompaniment: four Child tickets with no Adult are
refused at checkout, server-side, in the organiser's words. Optional ratio caps how
many dependants one companion covers (a school tier can require one Teacher per 15
Pupils via a named companion list; a dependant type never chaperones another). One
implementation — `companionRuleBroken()` — gates the buy button with the reason and
binds inside `resolveMix`, so a crafted POST is refused by the same sentence the page
showed. 48/48 pricing tests. docs/25 files the master spec with a full
concept-by-concept reconciliation and the standing decision: no parallel collections —
new vocabulary lands on the live model or waits for phase 4's designed migration.

### Production kills (docs/25 §43–44, docs/24 §27)

The rig lands where row Q was: the organiser types the seats the way a stage manager
writes them (Q1-Q20, B12-B15 — `expandSeatList`, tested), presses Kill, and the one
rule holds from every angle: unsold seats leave sale instantly on the section's
existing `unavailableSeats` (no second source of truth); sold seats become idempotent
reseat cases — killing the area twice never doubles the queue — each offered a distinct
free same-tier suggestion and moved through the same box-office `moveSeat` everything
else uses; the holder is emailed (`ticket.reseated`, mandatory service message) that
their seat moved and their code did not; redeemed holders are reported for stewards,
not rewritten. **A sold ticket is never silently invalidated.** Panel on the event edit
page for seated events. Emulator: 6/6.

### Layout validator (docs/25 §61) and non-colour seat states (§69)

The deterministic half of the "AI validator" needed no AI: `validateLayout()` is pure
and total — it never throws on a half-typed section because its job is to run while
the organiser types. It catches the four failures that reach a door: one seat label in
two sections (one chair, sold twice, under one name — error), more seats mapped to a
tier than the tier has tickets (the last N seats can never be bought — error) or fewer
(N tickets with no seat — warning), held-back lists naming seats that do not exist (a
typo protects nobody), and shaped rows drawing seats onto each other. Shown live above
the seat-map preview; an empty list is the green light. 37/37. SVG seats now carry
screen-reader state ("B4, sold", aria-pressed) — never colour alone.

### Real-time seat map and three new webhook events (docs/25 §86, §76)

The last open box of the spec's core-seating acceptance list (§89) closes: seat locks
now stream to every open map — read-only by rule (a lock is a label and an opaque hold
id, nothing about a person; rules-tested 47/47) — unioned with the fetched sold list,
so B4 greys out in one buyer's browser seconds after another holds it, and returns the
moment that checkout dies. Sold seats never flicker: the fetched truth still contains
them. Integrators gain `ticket.transferred`, `seat.moved`, `seat.upgraded`, emitted
after their transactions commit; `seat.held` per-hold events are refused on purpose —
a firehose that costs every integrator money and says nothing an inventory read does
not. All nine §89 acceptance boxes now pass.

### P0 from live testing — a priced event sold its tickets for £0

Found by the user buying their own event's ticket and landing on "Payment received …
via free" without ever seeing a card. Root cause: in the attendee-type editor, every
row after the first defaulted to **£0.00**, and a type's price *is* the price for
whoever picks it — so one untouched field silently replaced the tier price with
nothing, the buy box honestly showed "Free", and the free-claim path (correctly, by
its own rules) issued without payment. Four layers fixed, none of them blaming the
buyer: (1) new attendee-type rows now seed from the tier's own price — free types are
made free deliberately; (2) a zero-priced type on a priced tier shows a loud amber
warning in the editor; (3) the form refuses to save a fixed tier priced above zero
whose types are ALL £0 — contradictory data, not configuration; (4) the checkout
route refuses to sell that state on events saved before the fix ("prices are
misconfigured — contact the organiser"), and the buy box says the same before the
round trip. Mixed pricing (free Under-5s beside a paid Adult) is untouched. The
success page also no longer says "Payment received … via free" for a claim — free
claims read "Tickets claimed — nothing to pay". Typecheck, lint, build, 48/48
pricing tests green. **The affected live event still carries £0 types until the
organiser re-saves its prices.**

### P0 from live testing — the door refused real tickets ("QR not validating")

The scanner refused the user's own ticket. Root cause: once the app holds
`QR_SIGNING_KEY`, the door demanded a matching signature on **both** the QR payload
and the ticket document — but tickets issued before signing existed, or by the
functions deploy that has not yet been pushed with the key, carry no stored signature
at all, so every one of them was refused as "altered". Fixed to the rule the rotating
code has always used: a stored signature is always enforced; a ticket without one
validates on its own existence and status, exactly as the platform validated before
signing (a forger still needs a real, unguessable ticket id). New emulator test: "a
ticket issued before signing still admits" — 30/30. **The lasting fix is the pending
functions deploy with `QR_SIGNING_KEY` set, so every new ticket is signed.**

### P0 from live testing — "Invalid ticket: Missing bearer token" at the door

Not a ticket problem at all: `authedFetch` checked `auth.currentUser` directly, which
is null for the first moments after a page loads (and after a phone brings a
backgrounded tab back) while Firebase restores the session — so the scan request went
out with **no Authorization header** and the server's refusal was painted over the
guest's ticket. Fixed at the source: `authedFetch` now awaits `auth.authStateReady()`
before deciding there is no user, which fixes every authed call on the platform, not
just the door. The scanner also now tells the truth on a 401: "This phone is signed
out — the ticket was NOT checked", instead of blaming the ticket.

Second half, systemic: `functions/` reads `QR_SIGNING_KEY` but never declared it as a
secret, so even a fresh deploy issued unsigned tickets while the app's door held the
key. `defineSecret('QR_SIGNING_KEY')` is now bound to `onPaymentEvent` and
`reconcilePayments`. **Requires on the user's side:** `npx firebase-tools
functions:secrets:set QR_SIGNING_KEY` with the SAME value the app holds, then the
functions deploy.

### Scanner: beeps and an always-on status strip (user request, live test day)

Every scan now sounds — two short rising notes for admit, one long low buzz for
refuse — generated with Web Audio (no files, nothing to download at a door; the
AudioContext is created inside the Start tap because phones mute audio no gesture
asked for). A persistent strip under the camera shows what the phone is: Scanning /
Camera off, which door (Main gate / zone + direction / session), Works offline /
Online only, and this phone's running tally ("12 in · 2 refused").

The ticket modal now opens with the event's main picture above the QR (fetched from
the event on open, so every already-issued ticket gets the artwork and an organiser's
artwork swap follows without a migration), a £0 ticket's status reads "Free · Valid"
instead of "Paid · Valid", and the **printed** ticket carries three upcoming platform
events the holder is most likely to attend — ranked by the existing `recommend` AI
task, category-and-date fallback when the model is unavailable, never this event,
never past events. Print-only by CSS: on screen the whole site is one tap away.

Refined on request: the printed page is now split in half — the ticket above the
fold, the three picks below it as three columns with the events' own artwork — and
"likely to attend" is learned from behaviour: the holder's own ticket history feeds
the recommender (their past event titles as interests; the deterministic fallback
scores by categories they have actually bought, then this event's category, then
soonest). Events they already hold tickets for are excluded.

### P0 from live testing — the mobile-money corridor lost money on every order

The owner caught it from the buyer's screen: "Ticket US$30.00 · Service charge (2%)
US$0.60 · Total US$30.60" — while the operators charge ~2% of the amount moved. The
`offlineTotal()` helper was the forbidden second copy of the fee arithmetic: face +
2%, **no platform service fee at all**, so the corridor's whole take was less than its
own transfer costs. Standing rule recorded verbatim: **"we cannot lose money in any
transaction" — the platform fee sits on top of the operator's percentage, on every
rail.**

Fixed by deleting the duplicate: mobile money now prices through `computeOrderFees`
like everything else, on a new `manual_momo` rail (cost modelled at the operators'
2%, distinct from KODA's 0.9% API rate) under the CD country config — standard
service fee (3.99% + 49¢, min 79¢) **plus** the 2% verification charge, one number to
the buyer. The CD config is now `active` on the owner's direction (the corridor was
already live; the inactive flag was only preserving the loss) — VAT treatment remains
the open finance item. The US$30 example now reads: fee US$2.29, buyer sends
US$32.29, full cost US$0.75, net **+US$1.54**. Terms and how-it-works copy updated to
match the code. New fees tests: the corridor's economics at the owner's example
prices, and a rail-by-rail "no order loses money" sweep — 37/37.

Stripe's side of the same rule: the service fee already prices above card cost on
every worked example (the 79p floor exists for exactly this), asserted by the same
sweep. The one residual card risk is Stripe's ~2% FX conversion when charging USD
from a GBP-settled account — that is an account setting (enable a USD balance), not
a pricing change, and it is on the owner's checklist.

### KODA checkout wired — the sending half of a half-live integration

Correcting the record: KODA **was** live — keys set, `/webhooks/koda` verifying
signatures and issuing idempotently — but nothing ever called `createIntent`, so no
buyer had ever reached KODA's interface and mobile money always fell through to the
manual panel. Now wired end-to-end: `/api/koda-checkout` re-prices server-side
(engine, CD config: service fee + 2% on top of the operator's percentage), reserves
the seats, creates the intent with the hold id as the idempotency key, and sends the
buyer to KODA's hosted checkout; the webhook now carries holdId/seats/mix through to
issuance so seated and mixed orders work exactly as they do on Stripe. USD/CDF only —
KODA's corridor. The buy box shows "Pay with Mobile Money" whenever KODA's keys are
live and the event's currency qualifies; the manual pay-to-this-number panel remains
the fallback when they are not. **Not yet tested against the live KODA API from this
environment** — the first real intent needs the owner's test purchase, same as the
standing Stripe one.

### PWA fit + pay-button clarity (live testing)

"Stripe and KODA checkout not active" had a physical cause as well as a data one:
dialogs were capped at `92vh`, and `vh` on a phone is the *largest theoretical*
viewport — it ignores the browser chrome and home indicator — so in the installed PWA
the bottom of every dialog ran off the visible screen, and what fell off was the
action row. New `max-h-viewport` / `min-h-viewport` utilities use `dvh` (real visible
height) behind an `@supports` guard, applied to the dialog primitive and the app
shell, so overlays and pages now end where the screen actually ends. Tables, seat
maps and the scanner strip already scroll in their own containers. Also: the KODA
button now carries the same explanatory labels as the card button when disabled
("Choose 2 more seats", "Choose your tickets above") — a silently disabled button
reads as broken, and that reading was half of the report. The remaining half is data:
a payment button can only exist on the wedding event once its attendee-type prices
are re-saved above zero (the misconfiguration guard from earlier today deliberately
refuses to sell it until then). The basket note is behaviour, not a bug: seated and
mixed-type tiers buy directly so seats can be held while paying — the note under the
button says so.

### Six requests from live testing (18 Aug, evening batch)

1. **Event picture + cover picture.** `coverImageUrl` on Event; the form now has two
   image fields with honest labels (picture → cards/search/ticket; cover → the event
   page banner, falls back to the picture). Existing events unchanged.
2. **Sellout countdown from 90%.** The event page computes remaining tickets from the
   same counters checkout enforces; at ≥90% sold a gold "Only N left" badge sits in
   the hero and a banner sits above the buy box. True scarcity only — no timers, no
   theatre.
3. **SOLD OUT at 100%, everything locked.** A rotated stamp crosses the event
   information (same treatment for CANCELLED), the buy box is replaced by a locked
   card, and the *rule* is server-side: `placeHold` refuses cancelled events (every
   rail reserves through it) and the cart path refuses cancelled line items. Sold-out
   was already unsellable by the counters; now it looks it.
4. **Cancellation with refunds.** `cancelEvent` (service + API + type-the-title UI on
   the edit page): stops the sale transactionally, refunds every settled Stripe order
   through the payments API (idempotency-keyed per payment event; the existing
   `charge.refunded` loop invalidates those tickets and emails holders), cancels free
   and mobile-money tickets directly, returns mobile-money orders as the organiser's
   manual refund work list (reference + amount — those transfers went to a phone
   number and only a phone can send them back), and queues the mandatory
   `event.cancelled` notice per holder. Emulator suite `test:cancel` 5/5: owner-only,
   once-only, pending payments excluded, Stripe tickets left for the webhook, holds
   refused after. The Stripe refund call itself is not exercisable in the emulator —
   first live cancellation should be watched.
5. **Private event share link.** `ShareLink` (native share sheet on phones, clipboard
   on desktop) on the edit page — "Share private link" for unlisted events, "Share
   event" otherwise.
6. **Scanner share link.** The same control on the edit page and in the scanner
   header ("Share scanner") — hands the scoped check-in portal to a steward's phone
   in one tap.

### "Everything is wrong in these pictures" — the four screenshots decoded (18 Aug, night)

1. **Every screen cut off at the right** (header hamburger half-visible on all three
   app screenshots): not layout — **zoom**. Phones auto-zoom the page when a focused
   input's font is under 16px and never zoom back; our inputs were 14px, so one use of
   the search box left the whole PWA magnified and clipped. Inputs, textareas and
   selects are now 16px on mobile (`text-base md:text-sm`), which stops the auto-zoom
   at the source. Accessibility zoom stays available — pinch still works.
2. **Raw `**markdown**` on the event page**: the AI event-draft writes bold markdown
   and the page printed the asterisks. New `RichText` renders paragraphs, bold and
   italics as React nodes (never injected HTML) — the three things a description
   legitimately uses, and nothing more.
3. **KODA asked the buyer for "589 USD" on a US$5.89 order** — a 100× units defect on
   the KODA side, not this repo's: docs/20 §"Amounts are minor units" is the contract
   this platform sends (589 = $5.89), and KODA's hosted page rendered the raw minor
   value as whole dollars. Reported to the owner with the fix KODA needs (divide by
   the currency's minor factor for display AND for SMS amount-matching, or USD
   verifications will mismatch by 100×).
4. **The Théâtre Kin'Ô card showing a travel-ad collage**: the event's own uploaded
   picture — data, not code. The new separate cover/picture fields make the fix a
   two-field edit.

### PWA staleness: the installed app now checks for updates on every resume

Live testing reported the pre-fix bugs again ("no checkout, no screen fit, can't add
tickets" — all three are the auto-zoom overflow pushing right-aligned controls off
screen, fixed days of commits ago). Code review of the stepper and checkout gating
found no new defect; the phone was serving a stale bundle. Root cause worth fixing:
browsers re-check `sw.js` only on navigation or ~daily, and an installed PWA is
exactly the thing that never navigates and never closes — a resumed app can sit on
last week's build while looking current. `ServiceWorker.tsx` now calls
`registration.update()` every time the app returns to the foreground, so the "new
version ready — Reload" prompt appears at the moment the user is actually looking.
Until this ships, the manual fix is: fully close the installed app (swipe away from
recents) and reopen it.

### GA tier upgrades — the last "refund and a rebooking" closed (user request)

An already-issued general-admission ticket now upgrades to a dearer type from the
ticket itself: `quoteTierUpgrade` (owner-only, valid-only, public fixed on-sale target
with capacity; difference priced over what was *actually paid*; downgrades stay
refunds, deliberately) and `applyPaidTierUpgrade` (same `upgrade_events` idempotency
ledger as seat upgrades, one transaction over ticket + both tier counters + the hold;
`ticket.upgraded` webhook after commit). The money goes first: `tier-quote` /
`tier-upgrade` actions on the tickets API place a hold on the target tier and send the
buyer to Stripe for the difference plus the service fee on it; the webhook's missing
`upgradeToSeat` is what routes it to the tier path. UI: `UpgradeTicket` in the ticket
modal — renders only on valid, seatless tickets with a dearer public tier available;
seated tickets keep upgrading by choosing a seat (ChangeSeat, unchanged). Emulator
28/28 incl. quote-over-paid-price, stranger/downgrade/seated refusals, sold-out
refusal before money, land-once + replay no-op. Industries copy updated to match.

### Emptying the "Not yet" column — truth pass + slice 1 (arrivals, NFC)

The industries page's "Not yet" column carried several sentences describing things
that are BUILT (auction proxy settlement, sellout + issued-ticket upgrades, whole-pass
transfer, promoter tracked links, offline both-times reporting) — moved into each
card's `detail`, where built capability belongs; only genuine gaps remain under "Not
yet". Cancelled events also stopped wearing a "Live" badge on the organiser dashboard
(status now outranks the date).

Built in the same pass, both vendor-free:
- **Cross-event arrival prediction** — `predictedArrival()` in shared/analytics:
  each past event normalised to shares before averaging (a 2,000-scan festival and a
  60-scan club night teach the curve equally), events under 5 scans excluded, absent
  buckets pull the average down. Shown on the analytics page for an upcoming event
  with no scans yet, labelled with exactly how many past events it stands on; real
  scans replace it the moment doors open. Tests 21/21.
- **Web NFC wristbands** — the steward's Android phone reads the band directly
  (`NDEFReader`), feeding the same server call the keyboard-wedge path uses; one
  integration, two kinds of reader, no manufacturer API, no new vendor. Browsers
  without Web NFC never see the button.

### Media library: dead events no longer hold pictures hostage (live testing)

"Picture of deleted or previous events cannot be deleted? why" — the in-use guard
counted every event equally, so a cancelled event blocked its image's deletion
forever. Now only a LIVE event (published and not yet over) blocks — that is the page
actively selling tickets that must never lose its hero. Cancelled and past events
release their claim: their picture reference is rewritten to the generated
placeholder (cover falls back to the picture) before the file goes, so their pages
keep rendering. The guard also now covers `coverImageUrl`, which it never checked.
Media tests 12/12.

### P0 from live testing: the placeholder mobile-money panel is retired

The manual "pay to this number" panel carried four HARD-CODED PLACEHOLDER numbers
from `shared/constants/billing` — fictional wallets a real buyer nearly paid. It also
rendered for a GBP event, offering to move pounds through Congolese mobile money.
Retired from the buy box entirely: mobile money is **KODA's hosted page and nothing
else** — real enrolled numbers, verified codes — shown only for USD/CDF events with
KODA configured; otherwise a one-line "temporarily unavailable, pay by card" note or
nothing. A payment surface that cannot be correct must not exist. (The superuser
verification queue for historical manual submissions is untouched.)

### Seat maps: display-only sections now say so (live testing)

"You can't choose seat to book" — the organiser's sections were never linked to a
ticket type, which by design leaves them as a picture, and nothing said so. Now: new
sections default to the first tier (bookable is why anyone draws a map; display-only
remains a deliberate choice in the "Sells from" select), the field shows an amber
warning when unlinked, and `validateLayout` flags every display-only section by name
in the live issues list (38/38 seating tests). Existing events fix in one edit: set
"Sells from" on each section.

### 19 August — P0: a paid basket issued nothing

The cart path priced its lines, charged the card, and sent Stripe metadata with **no
items in it** — so the webhook hit its missing-metadata stop and a paid multi-item
basket produced no tickets at all. Fixed end to end:

- `shared/cart-metadata.ts`: the priced basket rides in one metadata value (dense
  positional encoding, 480-char cap, **refused rather than truncated** when a basket
  cannot fit — a silently dropped line is a paid-for ticket that never exists). Pure
  suite: `npm run test:cart-metadata`, 8/8.
- `/api/checkout` cart branch: encodes the basket **after** the coupon spread, so each
  unit price is the post-discount price actually charged; also now checks tier stock
  before the card (the cart takes no hold), and refuses signed-out ticket purchases
  before Stripe instead of after (a guest could previously pay and hit the
  missing-metadata stop — charged, nothing issued, nowhere to issue to).
- Webhook: a basket issues one `payment_events` document per line, idempotent by
  `${stripeEventId}__{index}`; issuance stays the single existing path in `functions/`.
  `order.completed` queues per line to each line's own organiser. Attribution runs only
  when the whole basket belongs to one organiser — commission on somebody else's
  tickets is money nobody agreed to lose.

### 19 August — the stepper sold stock that does not exist

"Only 5 tickets available but the website sells 10." The buy box's quantity control was
a hard-coded 1–10 that never looked at the tier: it priced ten tickets against five
remaining and sent the buyer to a hold that was always going to refuse. Now the
stepper and the attendee-type party are capped at the tier's remainder (with "Only N
left" said next to it), sold-out disables every pay surface with the word "Sold out",
and switching tiers shrinks an oversized quantity. The one deliberate exception
survives: an organiser who opted into sellout upgrades keeps the overbuy on unseated
orders, because the hold's clean failure is what triggers the upgrade to the next tier.

### 19 August — placements are self-serve: pay by card, live on the webhook (owner order)

"This shouldn't be any enquiries — they pay for these and it can be directly active.
ACTIVATE ALL THESE." Done, all three:

- `shared/placements.ts` is the catalogue and the single pricing authority (£249
  spotlight strip / £149 featured / £99 newsletter, GBP): the page renders from it and
  `/api/promotions/checkout` charges from it, ignoring anything the browser says. Only
  the event's own organiser can buy, only for a published, still-upcoming event.
- The Stripe webhook activates on `promoPlacement` metadata via
  `activatePlacement()` — one transaction writes the placement record
  (`placements/{stripeEventId}`, create-guarded, so a redelivery cannot extend twice)
  and sets the event flags: `spotlight`+`spotlightUntil` (strip), `featured`+
  `featuredUntil` (grid + strip), `newsletterSpotlight` (one weekly send).
- Fulfilment is real on all three surfaces: the homepage strip renders
  `featured || spotlight`; the featured grid is unchanged; the weekly newsletter gained
  an "In the spotlight · sponsored" block — the spotlight list is frozen into the run
  when it starts (every recipient of one send sees the same block), and the completed
  run clears the flags, which is exactly the "single send" that was sold.
- Expiry: `expirePlacements()` runs inside the every-minute cron sweep (and
  `/api/cron/expire-placements` is now real, not a stub). Only paid placements carry an
  `…Until`; a manual superuser grant has none and never lapses on its own. The
  superuser card stays as the free-grant/override switch and says so.
- The enquiry route still exists but nothing links to it; the promotions page's
  "Enquire" buttons are now "Pay £N — go live". The organiser's three unanswered
  enquiries from live testing were emails to info@ticketroyality.com — check that
  inbox; they never reached the dashboard because the dashboard's queue only ever
  listed `featuredRequested` events, which the enquiry flow never set.

Verified: typecheck, lint, production build, `test:newsletter` 15/15,
`test:cart-metadata` 8/8. Not testable here: a real Stripe webhook round-trip — the
placement branch follows the same recordPaymentEvent/idempotency patterns as the
tested paths.

### 19 August — organiser page down in production (digest 337954981): the image crash class

`/organisers/JPO7chOr8iNDW6iVxSyzYYFjql42` rendered "Application error: a server-side
exception has occurred". Root cause class: `next/image` does not render a broken
picture for a bad `src` — it **throws**, and on a server component the throw is the
whole page. Two bad srcs exist in real data: an empty string (an event saved without a
picture; media deletion writes `coverImageUrl: ''`) and a host outside
`next.config.ts`'s allowlist (organiser-controlled URLs can be anything). The homepage
strip had already met this and switched to a plain `img`; that decision is now applied
everywhere organiser-controlled URLs are rendered: EventCard, the event page hero and
sponsor logos, the organiser profile and directory covers/logos, and cart thumbnails —
each with a guaranteed fallback (`eventImageSeed`/placeholders) so an empty string
never reaches the tag. `next/image` remains on platform-controlled assets only.
Not verifiable here against production logs; the fix removes both failure modes of the
only throw-capable component on that page.

### 19 August (evening) — P0: KODA demanded 100× the CDF price

The site quoted CDF 311,970.49; KODA's hosted page demanded 31,197,049 CDF. This
platform keeps every amount in ISO minor units (CDF centimes); KODA and the Congolese
operators deal in **whole francs** — nobody moves a centime. `toKodaAmount` /
`fromKodaAmount` in `backend/payments/koda.ts` are now the single crossing point: CDF
floors to whole francs on the way out (the buyer must never be asked for more than the
page showed; the sub-franc fraction we absorb is under a hundredth of a US cent) and
multiplies back on webhook amounts, whose recording previously divided CDF by 100
unconditionally. USD is cents on both sides and passes through unchanged.

### 19 August (evening) — the basket takes every category: seats and mixes in one payment

"Still impossible to buy more tickets in different categories as you can't add anything
in the basket." Seated and mixed-type tiers were direct-checkout-only, so GA + VIP +
Children could never share one order. Now:

- Cart lines carry `seats` and `mix`. The buy box's Add-to-cart works on seated tiers
  (once the seats are chosen) and typed tiers (once the party is chosen); a re-add of
  the same tier REPLACES the line rather than summing quantities into seats nobody
  picked. Cart page shows the seats and pins the quantity on such lines.
- `/api/checkout`'s cart branch re-prices mixes through `resolveMix` (same authority
  as the single path, same all-free-on-priced-tier guard), then **reserves every line
  with its own hold** — seats locked atomically, "seat taken while you paid" refused
  before the card with the seat named — and writes the priced basket to
  `cart_orders/{id}`; only the id rides in Stripe metadata, because seats and mixes
  cannot fit a 500-char metadata value and truncation is how a paid ticket silently
  never exists. Any later failure releases every hold placed.
- The webhook reads the order document and issues each line with its seats, mix and
  hold (idempotent per line by `${stripeEventId}__{index}`), marks the document
  issued, and still honours the inline `cart` encoding for sessions created before
  this change.

### 19 August (evening) — placements: mobile-money rail + dashboard prices; Gift Aid GBP-only

- `/api/promotions/checkout` takes `rail`: card (Stripe, GBP) or momo (KODA, USD —
  KODA moves USD/CDF only). The KODA webhook activates placements from the same
  metadata pair, idempotent by provider event id. The promotions page offers both
  buttons.
- Placement prices are the superuser's: `config/placements` overrides the code
  defaults, edited from the dashboard's new "Placement prices" card
  (`/api/admin/placement-pricing`, requireAdmin), read by every surface through one
  `placementPricing()` so the advertised and charged figures cannot drift. USD
  defaults mirror the GBP figures until the owner sets real ones.
- Gift Aid is a UK/HMRC scheme: the declaration form no longer renders outside GBP.
  On a CDF page it could only ever fail — and did, live ("Gift Aid not added").

Verified: typecheck, lint, production build, `test:pricing` 48/48, `test:fees` 37/37,
`test:cart-metadata` 8/8. Not testable here: live KODA intents and Stripe webhook
round-trips — the conversions and branches follow the tested unit rules above.

### 19 August (night) — KODA everywhere, and the last basket walls down

Live testing kept finding payments KODA could not make and baskets that refused
legitimate orders. All closed in one pass:

- **The basket pays by mobile money.** The cart page gets "Checkout with Mobile
  Money" on USD/CDF baskets — same `/api/checkout`, same re-pricing, same per-line
  holds and order document; `rail=momo` creates one KODA intent (idempotent by the
  order document) and the KODA webhook issues every line with its seats, mix and hold,
  exactly as the Stripe webhook does. USD/CDF totals everywhere (event page and cart)
  now quote the Congolese config at the mobile-money rail, so the figure shown is the
  WORST any rail charges — a card comes out cheaper, never dearer; before this the
  page showed the card total and KODA asked for 2% more.
- **Hospitality by mobile money.** `/api/hospitality/pay` takes `rail=momo` on
  USD/CDF bookings (booking card shows the button); the KODA webhook records the
  payment against the booking and issuance still waits for the balance to close.
- **Registry gifts by mobile money** on USD/CDF items — `rail=momo` on the same
  checkout, recorded by the KODA webhook through `recordContribution`. Also fixed en
  route: a registry-only order used to fall back to GBP whatever the item's currency.
- **Same-category seats now accumulate in the basket.** The seated-line merge rule
  REPLACED the line, so adding seat B3 after B2 kept overwriting — "only tickets of
  different categories are allowed in the basket", live. Seated lines now merge as a
  seat-set union (quantity = the seats held, re-adding a seat cannot double-count);
  mixed lines merge by summing each type's count.
- **The stranded-seat rule speaks before the click.** Choosing seats that leave one
  stranded (organiser's `preventOrphans`) used to surface only as a refusal on
  whichever pay button was pressed — read live as "mobile money unavailable". The
  picker now reports strandings to the buy box and every buy button disables with
  "Leaves seat A1 stranded — adjust your seats". The server hold remains the
  authority.
- **Donations** stay card-only (stated on the page): a recurring gift is a Stripe
  subscription and KODA has no pull-payment to build it on. Season passes have no
  public purchase surface yet; the moment one exists it takes the same rail pair.

### 19 August (night) — organiser page crash, the REAL root cause (digest 1237730)

The profile page fetched the organiser's events with the CLIENT SDK from the server —
an anonymous read the security rules rightly refuse the moment the organiser has any
draft or cancelled event, and the refusal threw. (The image fix earlier today removed
a genuine crash class, but this was the one killing THIS page.) New
`getPublicOrganiserEvents()` reads with the Admin SDK and filters in code to
published, publicly-listed events — which is all a public page should show — and
never throws.

Also: the superuser can now place ANY event into any of the three slots free of
charge — "Place any event" on the dashboard placements card, server-side via
`/api/admin/placement-grant` (requireAdmin); manual grants carry no expiry and stand
until removed.

Verified: typecheck, lint, production build. Not testable here: live KODA intents and
webhook round-trips — conversions and branches mirror the tested Stripe paths and the
pure unit rules.

### 19 August (late) — the deep audit: ten days re-read, the forgotten list cleared or named

A full pass over 139 commits, every conversation promise, every "Not built" row and
every TODO. What it closed in code, in this commit:

- **One-off donations ride mobile money.** The KODA intent carries the gift (added
  after the quote, no platform fee), the webhook records it separately and subtracts
  it from the per-ticket price so a refund can never return gift money as ticket
  money. Only the monthly gift stays card-only — a subscription needs a pull payment
  mobile money does not have.
- **Season passes finally have a public buy surface.** The selling machinery existed
  end-to-end and nothing linked to it. `SeasonPassOffer` renders on every covered
  fixture's page — card AND mobile money (`rail=momo` fork in checkout; the KODA
  webhook settles through the same `settlePassPurchase`).
- **§16 pricing snapshot persisted** and **the ticket email itemises the all-in
  total** — the two oldest "Not built" money rows (details in the table above).
- **The mobile "everything is cut off" report, root-caused with a browser.** The
  standalone build was served and probed headless at phone width: no page is wider
  than the viewport (scrollWidth 412 at 412 on every route) — the screenshots show
  the page ZOOMED, the same focus-zoom class as before. The one remaining sub-16px
  focusable — the seat-type dropdown in "Who sits where" — is now 16px on mobile.
  If a phone is already stuck zoomed: pinch out once; new focuses will not re-zoom.
- Housekeeping: stale `cart_orders` marked abandoned by the sweep after 24h;
  `test:cart-metadata` joined `npm test`; six stale "Not built" rows corrected above
  (recommendations, error tracking, users-rule, maps, comms callers, plus the two
  money rows).

What remains, honestly, in three buckets:

**Needs the owner, not code** — cannot be done from this repository:
1. Change the exposed test password on info@produbuzz.com (flagged since day one).
2. `firebase deploy --only functions` (picks up the itemised email + fee snapshot
   reads) and `--only firestore:rules` if not yet re-deployed.
3. On the KODA VPS: `cd /root/koda/app && git pull && docker compose up -d --build`
   (the currency migration commit 8e6f671 must be live before CDF/USD volume).
4. Stripe dashboard: enable Bacs Direct Debit (standing orders line) and Stripe
   Connect (real multi-party promoter payouts). Both are dashboard toggles + KYC,
   not code; the code work starts when they exist.
5. reCAPTCHA Enterprise site key from the Google Cloud console (App Check
   enforcement, B6's second half).
6. One test-mode Stripe purchase and one small live KODA purchase after the next
   rollout — the two loops nobody but the key-holder can close.

**Designed, not built — the honest next build queue, in order of asked-for-ness:**
1. Waitlist (M6): join on sold-out tier, sweep offers freed stock through the
   catalogue's existing `waitlist.offer` key. Self-contained; nothing blocks it.
2. Automatic seat renewal between seasons (`renewsPassId` + holder-first window).
3. Speaker portals (profile/schedule self-service — buildable; the single-viewer
   stream gate stays vendor-blocked).
4. Offline cross-door awareness (stream admissions into the offline cache while
   connectivity lasts).
5. Canvas seat builder (docs/23 phase 3) — the largest remaining piece.
6. Profitability console reading `feeSnapshot` for historical orders.

**Vendor-blocked by CLAUDE.md §1 — decisions, not defaults:** SMS/WhatsApp delivery,
streaming provider (single-viewer gate), wristband manufacturer cloud APIs, retailer
registry integration, SSO/IdP directory sync. Each stays specified in `docs/` and
truthfully absent on `/industries`.

Verified: app typecheck, functions build, lint, production build, `test:delivery`
10/10 (exercises the new email), `test:fees` 37/37, headless viewport probe on five
routes.

### 19 August (night) — P0: an abandoned checkout stranded its seats forever

"Click on a ticket but didn't buy — it becomes unavailable." Root cause: holds and
seat locks were only ever given back by the minute-sweep, and the sweep lives behind a
Cloud Scheduler job that go-live has to create BY HAND — in a project where it was
never created, nothing on the platform ever returned abandoned inventory. Correctness
now no longer depends on a scheduler existing:

- **Expiry is honoured at read time.** Seat locks carry `expiresAt` (stamped from
  their hold's window); `takenSeats` and the seat picker's live stream both skip
  lapsed locks, with a creation-time fallback for locks from before the stamp.
- **Hot paths self-heal.** `releaseExpiredHoldsForEvent()` runs at the top of
  `placeHold` and on every seat-map read, so a ghost hold dies at exactly the moment
  the seat next matters. Pinned by test: a fully-held tier accepts the next buyer the
  moment the old hold lapses, with the sweep deliberately not called (holds suite,
  22/22).
- The scheduled sweep remains the tidy path and should still be created (DEPLOY.md's
  `gcloud scheduler jobs create http` command against `/api/cron/release-holds` with
  the CRON_SECRET header) — it also drives webhook delivery, auction closes and
  booking expiry, which have presumably been equally unserved. **That job not
  existing would also explain placements never expiring and outbound webhooks never
  delivering — create it.**

### 20 August — Meta Pixel + Google Tag across the platform (owner order)

The owner directed both tags "in everything in this OS" — which adds **Meta as a
vendor** to CLAUDE.md §1's list, by the owner's own authority (the escalation rule
exists to stop agents adding vendors, not the owner).

- One tracker (`frontend/lib/analytics.ts`): every surface fires ONE semantic event;
  the module translates to Meta standard events (ViewContent, AddToCart,
  InitiateCheckout, Purchase, CompleteRegistration, Search, Share) and GA4
  recommended events (view_item, add_to_cart, begin_checkout, purchase, sign_up …)
  so both vendors' conversion tooling works without custom definitions. No surface
  talks to `fbq`/`gtag` directly.
- Loading is double-gated (`common/Analytics.tsx`): each tag loads only when its ID
  is configured (`NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`,
  declared empty in apphosting.yaml — **the owner sets the real values**) AND the
  visitor accepted the new consent bar. This platform sells into the UK/EU, where a
  pre-consent ad pixel is the textbook PECR violation; a decline is remembered and
  honoured, and page views fire into both tags on every client-side navigation.
- Wired: event page views; add-to-cart; begin-checkout on every rail (Stripe, mobile
  money, free, cart both rails, season passes both rails, placements both rails);
  hospitality reservations; sign-up and login; shares. **Purchases fire on the
  success pages with real value and currency** — the checkout routes append
  `amt`/`cur` (analytics-only, never authority) to their success redirects on every
  rail, deduplicated by payment reference.

Verified: typecheck, lint, production build. Not testable here: the pixels
themselves — they need the owner's IDs set and a live visit; until the IDs exist the
site ships zero tracking bytes.

### 28 August — Held ticket release (owner request)

An organiser can hold when a ticket becomes usable. A buyer still pays now and their
ticket is **issued, counted and guaranteed at purchase** — no scheduler, no
payment-without-ticket risk — but it shows as a **purchase confirmation** rather than a
scannable QR until the release moment, capped at **7 days before the event** so a held
ticket always unlocks with time to spare.

- **Event field `ticketReleaseAt`** (optional ISO instant), set on the event form as a
  "Hold ticket release until" datetime; a `superRefine` refuses anything later than 7 days
  before the event.
- **Display gate** (`TicketModal`): while `event.ticketReleaseAt` is in the future the QR is
  replaced by a "Purchase confirmed — releases on <date>" panel and the print/download-QR
  buttons are hidden. The confirmation email needed no change — it already links to the
  wallet, where this gate lives, so no functions deploy.
- **Door gate** (`redeem.ts`, app-side, no functions deploy): a new `not-released` outcome
  refuses the scan before the release date, whoever scans it — the door is the authority,
  not the screen.
- **Pre-purchase note** (`TicketBox`): the buy box tells a buyer tickets are held and when
  they unlock, before they pay.

Verified: typecheck, lint, production build. Design note: the ticket is issued at purchase
(inventory consumed, idempotent, refundable) and only its *presentation* is gated — the
safe choice over deferring issuance to a scheduler, which is the exact payment-without-
ticket failure the money audits exist to prevent. **Honest limit**: a held ticket viewed
fully offline (no event fetch) would fall back to showing its QR, but the door refuses it
before release regardless, and release is always ≥7 days pre-event.

### 28 August — Box office / door sales (owner request)

Gate staff (or the organiser) sell a ticket at the door — cash, card or mobile money in
person — and the system issues a real, counted, scannable QR immediately, **through the
one issuance path**. A door sale writes exactly the `payment_events` document a webhook
writes (`provider: 'offline'`, `providerType: 'box_office.<tender>'`) and the already-
deployed issuance function mints the ticket, so inventory, the oversell guard, the door
scanner and refunds all work unchanged and **no buyer account is needed** (the ticket is
valid by its signature). No functions redeploy: the `offline` provider path already
existed for the customer offline-payment flow.

- **Same price as online**: priced by the identical `computeOrderFees([{face, qty}])` call
  the checkout uses. The organiser collects the whole amount, so the customer-side service
  fee is recorded as **owed by the organiser** in `box_office_sales`, shown on the
  dashboard and to be deducted at payout; a refund zeroes it.
- **Two entry points**: the organiser dashboard (`/dashboard/organiser/box-office`, their
  own auth) and a **scoped gate-staff link** (`/events/[id]/box-office`) gated by a
  **per-event PIN** the organiser sets — stored only as an HMAC (`event_box_office`),
  verified server-side on every sale, revoked by changing it. A guessable URL alone can
  neither mint a ticket nor owe money.
- **Refund**: reverses through the same `offline` path (mark refunded, return inventory,
  owed → 0). The cash is handed back physically by the organiser; the system squares the
  record and the inventory.

Server-side authority throughout: price re-read from Firestore, quantity 1–50, tender
validated, ownership or PIN checked before any sale. `box_office_sales` and
`event_box_office` are Admin-SDK-only (belt-and-suspenders explicit denies on top of the
default-deny catch-all), so no client can read the PIN hash or forge a sale. Verified:
typecheck, lint, production build.

Follow-up the same day — **QR at the moment of sale** (closing the first recorded limit):
issuance runs a beat behind the sale, so the sell screen now polls the sale's tickets for
a few seconds (`/api/box-office/sale-tickets`, authorised by the sale's event via the owning
organiser or the door PIN) and shows the QR the instant they exist, so a buyer with no email
still leaves with their ticket. Giving up is harmless — the ticket is issued regardless.
Follow-up — **per-ticket refunds** (closing the second recorded limit): the whole-sale
refund was rebuilt as a direct, synchronous transaction that mirrors the issuance
function's refund exactly (mark valid → refunded, group by each ticket's *current* tier,
decrement `sold` clamped at zero, never reverse a redeemed ticket), and a `ticketId`
variant refunds a single ticket of a multi-ticket sale, leaving the rest valid — idempotent
by ticket status, with the owed fee reduced by the per-ticket share and the sale marked
`refunded` only once every ticket is. The organiser opens a sale to a per-ticket refund
dialog (each valid ticket has a Refund button, plus "Refund all valid"); cash is handed back
physically.
Follow-up — **payout accounting** (closing the third recorded limit): the Revenue & payouts
page (`/dashboard/organiser/revenue`) now (a) **excludes box-office tickets from the payout
gross** — a door sale's face value is already in the organiser's hand, so `settle()` runs
over online tickets only (`paymentProvider !== 'offline'`; `offline` is the box-office
issuance path and nothing else issues under it today) instead of double-counting cash the
platform never received; and (b) **nets the owed door-sale service fee off the available
balance**, with a "Box-office service fees owed: −£X netted off" line, reading the same
`owed` figure `/api/box-office/sales` returns (net of refunds). The account statement is
computed over the same online tickets, so it reconciles to the balance. Payouts remain
display-only (no automated payout service exists); this makes the *displayed* balance the
true payable amount.
Copy correction (owner-flagged): the page's header and third summary card still described
the **retired organiser-side commission** ("balance after platform commission of X% plus £Y
per ticket", "Commission withheld"). Under the live model (`DEFAULT_COMMISSION_PERCENT = 0`,
`DEFAULT_ADMIN_FEE = 0`) the organiser keeps **100% of face** and platform revenue is the
**buyer-side service fee** already in the ticket price — so those numbers rendered 0%/£0 and
misframed the model. The header now reads "You keep 100% of face value — the platform's
service fee is charged to the buyer at checkout, not taken from your payout" and the third
card shows **Box-office fees owed** (the only real deduction), reverting to the commission
wording only when a bespoke `commissionTermsFor` override makes it non-zero.
Also (owner direction — platform revenue is internal): under the zero-commission model the
statement's **Fee** column is hidden (it was −£0.00 on every online row), and the
organiser-facing `TierEconomics` breakdown no longer itemises the **platform's service-fee
revenue** ("Fan service fee" line removed) — the organiser still sees they receive 100% of
face and the price the fan will pay; the platform's per-ticket cut is now shown only on the
superuser surfaces.
Drip-pricing leak fixed (UK DMCCA 2024, in force 6 Apr 2025 — mandatory fees must be in the
headline price): the catalogue, SEO structured data, related/article links and homepage
badges all already advertise the **all-in** price via `allInTicketPriceMinor`, matching the
module's stated doctrine ("there is deliberately no export that formats a face value as a
price"). One surface leaked face — the homepage **video spotlight** (`VideoAds.tsx`) showed
`from {leadPrice}` (face) while checkout charges the all-in total. Now routed through
`allInPriceLabelFromMajor`, so every "from £X" on the site includes the fee. Verified:
typecheck, lint, build.

### 29 August — White-label fee structure (owner request, Phase 1 of 3)

Groundwork for a white-label tier where an organiser sells under their own brand. Owner
decisions: **per-ticket platform fee** (not commission or subscription); the **organiser
sets their own fan booking fee** (any % + flat, including zero, absorb or pass); **full
custom domain** eventually. This commit builds **only the fee model** — the part the owner
flagged as needed — as a complete, tested unit. Wiring it into checkout/issuance (Phase 1b),
de-branding the fan surfaces (Phase 2) and per-tenant custom domains + TLS (Phase 3) are
**not built yet** and are not implied by this entry.

- **Data model**: `UserProfile.whiteLabel?: WhiteLabelConfig` — `enabled`, `brandName`,
  `customDomain` (reserved), the organiser's `buyerFeePct` / `buyerFeeFixedMinor` / `feeMode`
  (`absorb` | `pass`), and the superuser-set `platformPerTicketMinor` (platform revenue).
- **Engine**: `computeWhiteLabelOrder(lines, profile, options)` in `shared/fees.ts` — pure,
  integer-only, reusing the same `round`, rail table and per-order platform cost as
  `computeOrderFees` (no second copy of the arithmetic). The **organiser bears the card
  cost** (their brand, their processor economics), which is exactly what stops a flat
  per-ticket fee going underwater on a dear ticket — the trap that a fee *cap* on the
  standard model falls into. The platform's revenue is `platformPerTicketMinor` per paid
  ticket and nothing else, so **the platform can never take a white-label order at a loss**;
  the guard that can trip is the organiser's own `organiserProfitable` flag, false when their
  fee settings wouldn't cover the platform fee + card cost on a cheap ticket.
- **Free tickets** carry no booking fee and no platform fee, matching the standard model.
- Six tests added to `fees.test.ts` pinning pass/absorb, the flat platform cut, organiser-
  borne card cost (£20 passed → fan £21.50, organiser nets £20.48, platform £0.40 clean),
  the free-list case and the below-zero guard. Verified: 43/43 fee tests, typecheck, lint.

### 29 August — Automatic seat renewal between seasons (owner "build now")

Closes the sports card's "Not yet". A season pass can now **renew an earlier one** with a
**holder-first window**: until `holderWindowEnds`, only someone who bought `renewsPassId`
may buy the new pass; after it, general sale. Same shape as the loyalty presale — a real
gate, not a hidden button.

- Types: `SeasonPass.renewsPassId?` + `holderWindowEnds?`.
- `wasPassHolder(passId, userId)` reads the `season_pass_purchases` record (the same record a
  transfer moves) and **fails closed** on error — an early renewal window given to a stranger
  cannot be taken back, the reason the loyalty gate fails closed too.
- `passAvailability(passId, userId?)` gains a `holders-only` outcome and enforces the window;
  **checkout passes the buyer's uid** so the gate is server-authoritative, not UI-deep.
- Create-pass API validates the renewal points at *this organiser's own* earlier pass and the
  window ends in the future; both fields travel together or not at all.
- Organiser form gains an optional "Renews an earlier pass" + window-end picker; the buy
  surface shows the renewal-window note. Verified: typecheck, lint, build.
- Honest residual (kept in the industries copy): the pass takes a *tier*, so seat-for-seat
  carry within a seated map is a further step, not this.

### 29 August — Stripe Connect settlement rail (owner "build big", highest-leverage)

The automated-payout rail the whole platform was missing — payouts were display-only, and
every owed record (promoter commission, box-office fees, organiser face) had no way to
actually *move*. Built on **Stripe Connect** (inside the existing Stripe vendor, not a sixth
one), **gated OFF** behind `STRIPE_CONNECT_ENABLED` so nothing moves until the owner turns it
on in the Stripe dashboard and sets the env — no accidental transfers, no fake success.

- `backend/payments/stripe-connect.ts` — the adapter: `createConnectedAccount` (Express, KYC
  stays with Stripe), `createOnboardingLink`, `getConnectedAccountStatus`, and
  `transferToConnected` **idempotent by key**. Every function refuses cleanly when Connect is
  off.
- `backend/services/settlement.ts` — `settle()` claims the idempotency key as the
  `payouts/{key}` doc id FIRST, then moves money, then records the outcome; a repeat finds the
  key and pays nothing again (the same guard issuance uses inbound). Connect-off or
  onboarding-incomplete records the payout as **`blocked`** — the debt stays owed and visible,
  never a silent no-op. `settleOrganiser()` resolves the account from the profile; `payoutKey()`
  is pure and unit-tested (4 tests: same debt → same key, new period → new key, no
  cross-party collision, always a legal doc id).
- Types: `UserProfile.stripeConnectId` + `stripeConnectPayoutsEnabled`, `PartnerLink.connectedAccountId`,
  and the `Payout` record. `firestore.rules`: `payouts` is Admin-SDK-only.
- `POST/GET /api/connect/onboard` — organiser onboarding + status, mirrored onto the profile.
  Revenue page gains an **"Automatic payouts"** card (Connect a payout account → Stripe hosted
  onboarding → "Payouts connected"), shown only when Connect is enabled.
- Activation is an owner action: enable Connect + `STRIPE_CONNECT_ENABLED=true`. Verified:
  4/4 settlement tests, typecheck, lint, build.

Follow-up — **per-event payout trigger wired**: `settleOrganiserEvent(organiserId, eventId)`
computes the organiser's payable for a *finished* event — the face of its **online** tickets
(box-office tickets excluded, that face is cash already in hand; refunded tickets excluded) —
and settles it keyed by the event, so a second run pays nothing again. `POST /api/connect/payout`
walks the organiser's own past events and settles each; the revenue page's **Withdraw** button
now calls it (real payout when Connect is live, a "connect first" nudge when it isn't). Known,
documented edge: only finished events settle (a pre-event refund would otherwise mean clawing
money back from a bank), and a refund *after* payout is not yet clawed back. Still to wire:
promoter commission settlement (the `settle()` primitive takes a promoter party already) and
promoter onboarding. Verified: 4/4 settlement tests, typecheck, lint, build.

### 29 August — Premium showcase placement (owner request)

A new paid placement above the spotlight: the big screen in the homepage's "Built for serious
events" panel now runs a paid organiser's **moving picture AND video** — the cover image on a
continuous slow Ken Burns drift with the promo video crossfading over it on a loop (image ~5s,
clip up to 15s, back). Priced **30% above the spotlight** (£249 → **£324**), the most prominent
slot on the site. Falls back to the section's static stadium image when none is sold.

- `PLACEMENTS.showcase` (£324, 7 days) — the promotions page already renders `Object.values(PLACEMENTS)`,
  so it's **self-serve** (organiser pays by card, activates on the webhook) with no extra wiring,
  and the `/api/admin/placement-grant` route gains a `showcase` branch so a **superuser can grant
  it manually** too — exactly the pay-or-grant model every other placement uses.
- `Event.showcase` + `showcaseUntil`; `promotions.ts` activates (`video-ad`→spotlight pattern) and
  `expirePlacements` sweeps it hourly like the others.
- `ShowcaseScreen` (client) does the crossfade; `animate-kenburns` keyframe added to globals.css,
  disabled under `prefers-reduced-motion`. YouTube (`&end=15`) or MP4, click falls through to the
  event. Verified: typecheck, lint, build.

### 29 August — Spotlight: two staggered screens, video only (owner request)

The homepage "In the spotlight" strip is now **video only, on two screens**. Each screen
cycles up to **three** promo videos; the two screens run **three seconds out of phase** so
they never cut together; every clip is capped at **15 seconds** on screen. The YouTube cap
needs no API: `youTubeClipEmbed` builds a **no-loop** embed with `end=15`, so the clip plays
0→15s and **stops** rather than restarting; a file is held by the 15s timer. Only featured events that actually carry a video reach the
strip — an event with no video no longer appears, and the whole section renders nothing when
nothing featured has a video (the anti-fake rule this strip already carried). Videos are
interleaved across the two screens (up to 6), and one lone video shows on a single screen
rather than a half. `VideoAds` rebuilt from the carousel into `Screen`/`VideoTile`; YouTube or
MP4 only, click still falls through to the event. Verified: typecheck, lint, build.

### 29 August — Floor-plan seat canvas (owner "build now")

The theatres card's "Not yet" — drag individual seats around a floor plan, alongside the
row builder that already shapes irregular rooms. Built as a **pure geometry layer**, the
same doctrine as `shape`/`rowSpec`: a seat's identity is its label, so nothing about holds,
checkout, issuance or the door changes wherever a seat is placed.

- `SeatingSection.seatCoords?: Record<label, {x, y}>` — floor-plan positions in the same
  venue units the auto-layout uses.
- `seatPositions()` (the one function the buyer's map, the preview and the server allocator
  all call) applies `seatCoords` per label over whatever the shape computes, falling back to
  the auto-layout for any seat not placed — so a part-arranged room still draws. 3 new tests:
  a dragged seat lands exactly where placed, un-placed seats keep auto-layout, and the seat
  **labels are identical** with or without coords (identity untouched). 42/42 seating tests.
- `SeatMapCanvas` — an SVG in venue units; pointer coords mapped back through the SVG's own
  transform so drag lands true at any zoom, mouse or touch; snap-to-grid, arrow-key nudge for
  the selected seat (a drag-only canvas is unusable for precise placement), reset-to-auto,
  and a STAGE marker for orientation.
- Wired into `CreateEventForm` per section as an optional "Arrange seats on a floor plan"
  disclosure; the zod schema and submit carry `seatCoords` only when the organiser actually
  dragged something. `SeatMapPreview` and the buyer's `SeatPicker` honour it automatically —
  they already call `seatPositions()`. Industries copy updated. Verified: typecheck, lint,
  build, 42/42 seating tests.

### 29 August — Real-time cross-door awareness (owner "build now")

The nightclubs card's "Not yet". Each door scanner knew only what it admitted; now every
gate sees the whole venue's admissions live — a running admitted count and the latest
entries across all doors.

- `GET /api/check-in/pulse?eventId=` — server-mediated (Admin SDK after proving the caller
  owns the event), a **single-field `eventId` query filtered in memory** so it needs **no new
  composite index** — nothing extra to deploy. Returns `{ admitted, issued, recent[] }`.
- `LiveAdmissions` polls every 5s (polling, not a socket, survives flaky venue wifi), shows
  the count + recent entries + a Live/Reconnecting indicator, and **fails silently** — a stale
  number beats a blank panel at a door. Added to the scoped check-in portal.
- The genuinely-offline door is unchanged and honestly so: it can't know another door's state
  without a network (physics), and a double-use is still reported with both times on sync.
- Industries copy updated to the truth. Verified: typecheck, lint, build.

### 29 August — landing-page rewrite: punchier, and caught up with what shipped

Owner ask: make the public copy far more persuasive, and reflect everything built since. The
homepage's truth rule holds — a claim goes live only against `STATUS.md`, never `docs/`:

- **Hero** rewritten around the real differentiators: "Sell out the room. Keep every penny of
  face." Sub-copy leads with **0% commission / 100% of face**, one **fair all-in price** (no
  drip pricing), the 30-second rotating code, and **selling at the door** by card or mobile
  money. CTA → "Start selling — free" (true: the organiser is charged nothing).
- **`REVENUE_TOOLS`** corrected to what now has code: VIP tables & hospitality, tracked
  promoter links, **sell at the door**, and **season tickets / presales / renewals** are all
  flipped to live (each has a shipped `STATUS.md` row); merchandise and parking stay marked
  not-live. No claim was moved to live without its row.
- **Core features** gain "You keep 100% of face" and "Sell at the door" up top, each annotated
  with the file that makes it true. Generic AI-tell copy ("distributed infrastructure for
  high-trust orchestration") replaced with plain benefit lines.
- Not marketed as live, correctly: white-label (fee model only) and automatic payouts (rail
  built but gated off) — neither is claimed on the landing page. Verified: typecheck, lint,
  build, check:links (26 published, every route resolves).

### 28 August — cross-screen fit pass: two hardenings, and an honest test limit

Swept the public surfaces for horizontal overflow at 320–768px across two font scales
(100% and Android's ~130%) — 0 overflow everywhere once styles are applied. Two real
hardenings added on top of the existing guarantees (`overflow-x: clip` backstop, safe-area
insets, `dvh` sizing, rem-safe shrinking header, `overflow-x-auto` on every table):

- `ui/tabs.tsx` `TabsList` gains `max-w-full overflow-x-auto` (scrollbar hidden), so a tab
  bar wider than a narrow phone — three tabs, big counts, enlarged text — scrolls inside
  itself instead of clipping the last tab. Identical when it already fits.
- `globals.css` adds `iframe` to the `max-width: 100%` rule, so the new YouTube embed and
  the map embed can never push a page wider than the screen.

Honest limit: the local Playwright probe against the standalone server is unreliable for
this — it intermittently screenshots pages before their CSS applies (an unstyled header,
which then falsely reads as overflow), and there are no real iOS/Android devices here. So
"fits every real device" is verified structurally, not on-device; the deployed site on a
real phone is the authoritative check and remains the owner's to confirm.

### 28 August — security rules now deploy themselves on merge to main

The recurring trap this project keeps hitting: App Hosting deploys the app but **never the
security rules**, so a `firestore.rules`/`storage.rules` change is live in the repo, green
in CI, and yet unenforced in production until someone runs `firebase deploy --only …` by
hand. The old `rules.yml` only *tested* rules; nothing deployed them. New workflow
`.github/workflows/deploy-rules.yml` runs the rules tests then deploys `firestore:rules`
and `storage` on any push to `main` that touches those files — rules only, never the app,
functions, data or indexes. It needs a one-time owner secret `FIREBASE_SERVICE_ACCOUNT`
(a service account with Firebase Rules Admin); without it the job tests and skips cleanly,
so it never blocks a merge. This is what stops the next rule change — like the promo-video
storage path — from silently not taking effect.

### 28 August — organiser "Past events" archive tab

Follow-on to the public past-events hide: the organiser events dashboard
(`dashboard/organiser/events`) now splits its list into **Upcoming / Past / Calendar**
tabs (each label carries its count), so a finished event is filed in a clear archive
rather than mixed into the working list. "Past" uses the identical start-of-today cutoff
as the public `getEvents` filter, so an event is never upcoming in one place and past in
the other. The Past tab keeps View + Edit (records, reports, duplication) but drops the
door Check-in, which a finished event has no use for. The table markup is now one shared
renderer used by both tabs. No data change — it reads the same unfiltered
`getEventsByOrganizer`, only grouped. Verified: typecheck, lint.

### 28 August — past events drop off the public frontend, stay in the organiser's list

Owner request: a finished event should disappear from the public site but remain in the
organiser's own list. Done at the one choke point — `getEvents()` in
`shared/data/repositories.ts`, the single function every public list already flows
through (homepage, browse, search, map, calendar, recommendations, similar events, the
spotlight strip, sitemap). It now filters to events from the start of today onward
(measured from the start of the day, so an event stays listed through its own day rather
than vanishing the minute it starts), via a `where('date','>=', …)` in the query itself
so a `max` page still fills with upcoming events instead of being emptied by finished
ones; the range reuses the existing `(status[, featured], date)` index. An `includePast`
option is available for any surface that wants the archive.

Deliberately untouched: `getEventById()` (direct event URLs still open, so a
ticket-holder's link never dies) and `getEventsByOrganizer()` (the organiser dashboard
keeps its full history, past events included). Verified: typecheck, lint, production
build green.

### 28 August — paid video ads made real (owner request)

"Still no paid video ads section on the landing page." It was a half-built feature: the
promotions engine sold a `video-ad` placement (set `spotlight`), the `Event` type had a
`videoAdUrl` field, and the homepage strip was shaped like a video card — but nothing
read or wrote `videoAdUrl`, and the strip rendered the cover image. The earlier truth-fix
had correctly stripped the FAKE hardcoded video ads; this wires a real one end to end,
upload-to-Storage (owner's choice):

- `lib/media.ts` — `uploadVideo()` sends an MP4/WebM straight to Storage from the browser
  (no re-encode), type- and size-checked (≤50MB) with a human message on refusal.
- `storage.rules` — the `events/{organiserId}` path now accepts a promo video (mp4/webm,
  <50MB) alongside images (<8MB); the ceiling mirrors `VIDEO_MAX_BYTES`.
- `VideoAdPicker.tsx` (new) — upload control with a hover preview, wired into the event
  editor as "Promo video (optional)"; sets `videoAdUrl` on the event.
- `VideoAds.tsx` — plays `<video>` (muted, autoplay, loop, playsInline, cover image as
  poster) when `videoAdUrl` is present, else the image. The strip still only appears for
  `featured`/`spotlight` events, so the video shows exactly when a placement is paid for —
  honest when supplied, never faked when not.

`videoAdUrl` persists through the existing `createEvent`/`updateEvent` (whole-payload
write) and needs no `firestore.rules` change (the events rule guards `featured`, not
arbitrary fields). Verified: typecheck, lint, production build green.

Also wired into the **placement purchase flow** (`dashboard/organiser/promotions`): the
Spotlight card now shows the `VideoAdPicker` for the selected event, so buying the £249
placement and attaching the clip are one step — it saves to the event immediately and
plays only once the payment sets `spotlight`. The catalogue copy that still read "Video
slots are not built" (`shared/placements.ts`) is corrected to describe the real video.

**Paste-a-link, including YouTube (owner request).** A video no longer has to be uploaded:
the picker takes a YouTube link or a direct `.mp4`/`.webm` URL as well as a file, and
`shared/video.ts` (`parseVideoAd`) classifies whatever `videoAdUrl` holds so the homepage
plays it right — a `<video>` for an uploaded/pasted file, a chrome-less muted-autoplay
`youtube-nocookie` `<iframe>` for YouTube (with `pointer-events-none` so the card's link
still works), the cover image when there is neither. YouTube is an embed, not a new vendor
account, and it needs **no Storage rule and no deploy**, so it is the path that works the
moment this ships — the upload route still needs the storage rule live.

### 28 August — THE reason nothing deployed for six days: an invalid apphosting.yaml

App Hosting rejected every rollout from 22 August onward with "Invalid apphosting.yaml
… is not formatted properly", so the live site kept serving the pre-22-August build.
This is why a week of fixes — the signed-in header fit, the money-audit passes, the
Stripe multi-secret change, the whole "Programme" rebrand, and the launch-audit fixes —
were all pushed, all green in CI, and none of them ever appeared. Every "still not fit"
and "nothing changed" report traces to this one line, not to the code in each commit.

Root cause: the 22 August Meta Pixel commit added two env entries with `value: ""`
(`NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`). App Hosting does not
accept an empty-string `value`; it fails the *whole file* at validation, before the
build runs — which is why CI (which never reads apphosting.yaml) stayed green while
every deploy died. The error is a format rejection, not a missing-secret error, which
pointed at structure rather than Secret Manager.

Fix: the two entries are removed, not blanked. An absent variable and an empty one are
identical to the app — `process.env.NEXT_PUBLIC_*` is falsy either way, the tags do not
load, no consent banner shows — and the production build passes with neither set (CI
proves it). To enable tracking later, the entries go back with REAL non-empty values.
No other line in the file is non-standard; runConfig and the remaining 23 env entries
validate. Verified here by YAML parse + schema-shape check; the authoritative proof is
the next rollout, which is the owner's to watch.

### 28 August — the next rollout blocker: Node runtime pinned to a decommissioned version

With the apphosting.yaml format fixed, the rollout got further and hit the next wall:
"Node 24 has been decommissioned and is no longer available." Two causes, one in code
and one in the console:

- Code: the root `package.json` had `engines.node: ">=20"`, an open range App Hosting
  resolved to the highest runtime it offered — Node 24. Now that 24 is gone the range
  can no longer resolve to it. Pinned to `"22"` — current LTS, matching `functions/`
  (already `22`) and the local/emulator runtime the build and test evidence came from.
- Console (owner-only): App Hosting's "Automatic base image updates" runtime selector is
  set to **Node 24**. It must be changed to **Node 22** (or left unspecified to opt out).

Blocking both: the console also returned "Write access to project 'ticketroyality' was
denied: please check billing account associated and retry." App Hosting runs on Cloud
Run and requires an active billing account (Blaze); if billing has lapsed or the card
failed, every write — deploys and settings changes alike — is denied. This is the owner's
to resolve in Google Cloud billing and likely gates everything else.

### 28 August — launch hard-reality audit: two fixes shipped, the rest recorded

A full adversarial launch audit (payments, authz/tenant isolation, API/cron, AI safety,
privacy, build, deps) run against `f4588ef`. The automated suite passed end-to-end —
**674 assertions, 0 failures**, including the 12 real-transaction issuance tests
(replay-idempotency, concurrency non-oversell, double-refund and redeemed-ticket
protection). No P0/P1 was found in code; authz is default-deny with server-side role
checks and a correctly hashed/scoped public API. Two fixes were safe to make and verify
here and were made:

- **AI denial-of-wallet within the daily cap** (`src/backend/ai/schemas.ts`): `ad-copy`,
  `recommend` and `similar` accepted unbounded free-text / arrays, so the 60-call/day cap
  bounded call *count* but not *spend* — a farmed account could send megabyte prompts that
  fail over to the metered vendors during a Gemini outage. Added `.max()` length caps on
  every free-text field and `.max(300)` on the candidate arrays, matching the pattern the
  drafting tasks already used.
- **SSRF in outbound webhook delivery** (`src/backend/services/webhooks.ts`): the scheduled
  delivery `fetch` followed redirects, so a registered public https endpoint could 302 to
  `localhost`/metadata after passing the registration denylist; the denylist also missed
  IPv6 loopback/link-local, IPv4-mapped and integer/hex-encoded hosts. Added
  `redirect: 'manual'` (a redirecting endpoint is now a failed delivery, never chased
  inward) and hardened the denylist. DNS-rebinding remains a residual (needs resolve-time
  pinning) and is recorded, not closed.

Recorded, NOT yet fixed (need live verification or wider tracing than this environment
allows): (1) **the profitability console overstates GMV / double-counts fee revenue** —
single-price ticket records store buyer-total as face (`functions/src/issuance.ts:98`,
`profitability.ts:125`); a reporting-accuracy P2, no customer is mischarged. (2) **checkout
trusts a client `userId` for the members'-presale gate** (`api/checkout/route.ts:372`) — an
early-access escalation P3, price stays server-authoritative; the fix must preserve guest
checkout, so it needs the live client verified first. (3) **`bitripay-checkout` is
unauthenticated and client-priced** — dormant (503, no creds, no webhook) but must be
re-priced + token-gated before BitriPay is ever enabled. (4) **no CSP header**; (5) **12
transitive dependency vulns** (4 high) under `firebase-admin`/`google-cloud`.

Standing above all of it: the App Hosting rollout is **not serving new builds** — the
release/rollback path is the top launch blocker regardless of code quality.

### 27 August — "The Programme": the brand moves off the generated look (owner request)

"Rebrand this OS to be very premium and cinematic … and it must not look like
[the sibling systems] … and need to look less and less like an AI-generated OS." The
diagnosis mattered more than the palette: the *generated* look is a specific set of
tells — a dark-glass surface, gold **gradient** text and buttons, a soft gold **glow**,
frosted panels, a geometric sans, everything rounded and centred. The first proposal
had them all, which is why it read as generated. The fix was to change **register**,
not hue: an editorial print identity — ink on warm paper, one antique **foil** gold and
one curtain **bordeaux**, flat colour, hairline rules, squared corners, a Didone
display face. Nothing in the vendor table changes; fonts are libraries, not accounts.

Built, at the token layer so the whole app turns at once without touching component
files:

- **Palette** (`globals.css`): light **Paper** (`--background` bone `43 43% 90%`,
  `--foreground` ink, `--primary` antique foil `40 60% 38%`, `--accent` bordeaux
  `352 56% 27%`) and dark **Ink** (warm near-black `36 29% 7%`, foil lifted to
  `42 53% 50%`). **No green anywhere** — the family's shared accent is retired, so even
  `--success` reads gold, which is the single rule that most separates this from the
  sibling dashboards. `--radius` drops to `0.2rem` (squared, not rounded-everywhere).
- **Type** (`layout.tsx`, `tailwind.config.ts`): `Bodoni_Moda` display, `Newsreader`
  text serif, `Space_Mono` for the technical marks — all via `next/font`, fetched at
  build time. No geometric sans, which is half the reason it no longer reads as
  generated. Headings carry a touch of weight so small ones hold.
- **The three tells, retired in place** (`globals.css`): `.text-royal` was a moving
  gold gradient → flat foil; `.glass` was frosted `backdrop-blur` → an opaque sheet on
  a hairline rule; `.gold-ring` was a soft glow → one flat foil edge. The class names
  stay, so dozens of components change register untouched. The **`royal` button**
  variant loses its `via-amber-300` gradient sweep and `shadow-lg` glow for a flat
  stamped foil; the homepage's final-CTA gold **radial glow** and the splash's
  `drop-shadow` glow + radial both become the faint ruled ledger grid.
- **Mark** (`Logo.tsx`): the crowned-ticket crest is redrawn as fine **engraved line**
  (all stroke, no fill) — the register of a banknote, valuable without a glow; the
  wordmark sets "Ticket" in ink and "Royality" in bordeaux italic. The favicon
  (`icon.svg`), which needs mass at 32px, keeps a filled crown but moves off the old
  cool-black + amber onto warm ink + foil. `manifest.ts` and the light/dark
  `themeColor` follow the new grounds (`#17130D` ink, `#F0EADB` bone).

Verified: typecheck, lint, production build (fonts fetched, standalone served),
and Playwright captures of `/` and `/events` in both themes — flat foil CTAs, no
gradient text, no glow, bordeaux wordmark, no green. Not changed: any business logic,
route, or copy; this is a skin over the existing token contract. The `amber-*` classes
that remain are semantic **caution** text (seat warnings, form validation, auction
"outbid") — a functional colour, not the brand gold, and deliberately left.

Follow-up the same day: the service worker `CACHE_VERSION` was bumped `v2 → v3`
(`public/sw.js`). The rebrand is CSS and fonts inside the app shell, which the SW
caches; without a version bump a returning visitor — and every **installed** PWA —
keeps serving the old-look shell until the SW happens to update. The bump invalidates
`tr-static-*` / `tr-pages-*` on activation, so the new look reaches cached clients on
their next visit rather than only new ones.

### 25 August — header fit (signed-in) and forcing the fix through the PWA cache

A "still not fit" report with a signed-in header: the earlier shrink/truncate fix was
measured signed-OUT (three icons), but a signed-in phone shows a FOURTH icon — the
notification bell — and that extra ~44px is what pushed the menu button off the edge.
Two changes:

- The **theme toggle moves off the phone top bar into the menu sheet**, so a signed-in
  mobile header is cart + bell + menu, with a wide fit margin. Probed with the bell
  present at 320/360/393px and 120% text: the menu button stays on screen and the
  wordmark no longer even needs to truncate at 360px. Inline theme toggle returns from
  `md` up; the gap tightens to `gap-1` on mobile.
- **Service-worker `CACHE_VERSION` bumped v1 → v2.** The header lives in the client
  bundle, and although documents are network-first, bumping the version guarantees every
  installed app drops its old caches on the next activation — so the fix reaches a phone
  that had the old shell instead of waiting on it. Confirmed the header fix is already on
  `origin/main`; a device still showing the clip is serving the pre-rollout/cached build.

### 25 August — money-side audit, pass 2: refunds, upgrades, transfers, referral, farming

A second, deeper adversarial sweep — four parallel audits over every value-creating path
not covered by pass 1: refunds and paid upgrades, ticket/pass transfer and redemption,
partner self-referral, hospitality balances, auctions, and every user-supplied number.
Each finding was re-verified against the code before any change. Hospitality, the mix
engine, pay-what-you-want, coupons, quantity clamps, negative-amount guards and the
upgrade *pricing* all came back sound. Six genuine issues were fixed; the rest are
recorded below with the reason they are documented rather than patched.

**FIXED — upgrade→refund inventory drift → oversell (functions/issuance.ts).** A ticket
upgraded after issuance (seat-swap) moves the sold counter onto its new tier, but
`refundTickets` decremented the *marker's* original tier — double-subtracting the old
tier (which then under-reads and lets the organiser oversell past capacity) and stranding
a phantom sale on the new one. Refunds now reverse each ticket's *current* tier, read from
the ticket, which also handles a mixed-tier order correctly.

**FIXED — refund of consumed admission on post-doors cancellation (cancellation.ts).**
`cancelEvent` refunded every issued order regardless of whether its tickets were already
scanned in; the ticket side skips redeemed tickets but the money side did not, so an
organiser cancelling after the event began handed full refunds to people who had walked
in. A fully-attended order (every ticket redeemed) is now skipped on the money side too.

**FIXED — partner self-referral commission (partners.ts + stripe-webhook).** Commission
comes out of the organiser's face-value payout, so a partner buying through their own
tracked link manufactured a discount up to the 50% cap on every order. Attribution now
refuses when the buyer's email matches the link's partner email. Residual: a colluding
second account with a different email is outside an email guard's sight — noted, not
solved, because structurally solving it needs identity beyond an email on the link.

**FIXED — self-minted AI wallet at signup (firestore.rules).** `update` forbade touching
`wallet`, but `create` did not, so the very first profile write could set `balanceAcu` to
any figure — spendable platform money the moment the ACU spend path is wired, and a broken
balance==ledger reconciliation before then. The create rule now pins a new wallet to the
welcome default (≤100 ACU, nothing pre-purchased or pre-spent). Pinned by two new
`test:rules` cases (49/49).

**FIXED — pass settlement stranded fixtures on a mid-loop failure (season-passes.ts).**
The pass-level purchase record was written *before* the per-fixture issuance loop, so a
transient failure part-way left a record that short-circuited every redelivery — the
unissued fixtures were never retried and the holder was silently shorted. Fixtures (each
idempotent by its own id) now run first; the record, which gates only the non-idempotent
pass counter, is written last, so a redelivery completes the set. New `test:passes` case
pins the recovery (17/17).

**FIXED — registry contribution non-negative guard (registry.ts).** Defence in depth: a
non-positive amount would have slipped past the over-target check and decreased the raised
total. Both callers already clamp positive; the service now refuses it too.

**Documented, not patched (with reasons):**
- **Rotating-QR fallback (redeem.ts, offline.ts).** A static/`c`-omitted QR skips rotation
  and passes on the signature alone, so a forwarded screenshot does not expire the way
  rotation intends. This is NOT a double-entry or free-entry hole: redemption is
  single-use, so online the worst case is the wrong copy of ONE ticket entering once — a
  dispute, not a platform loss (true offline double-entry is the separately-tracked
  cross-door gap). Making `c` mandatory was tried and reverted: it would strand every
  no-Web-Crypto wallet and printed ticket at the door — a P0 the codebase deliberately
  chose to avoid. The correct fix is re-signing the QR on transfer so an old holder's
  code dies; left as an owner decision rather than shipped as a door-refusal.
- **Auctions have no winner-charge path.** `markLotPaid` is test-only; nothing collects
  the winning bid, so an auction currently settles the lot with payment entirely
  off-platform. This is feature-incompleteness, not a live-path loophole. When built it
  must go through the `payment_events` idempotency discipline, not a raw update.
- **Season-pass availability is a non-atomic check (TOCTOU).** Passes place no
  cross-fixture hold, so under concurrency more can be sold than one fixture can seat →
  the per-fixture oversell guard then forces a refund. Closing it needs a multi-fixture
  hold transaction — a real build, recorded rather than half-done.
- **bitripay-checkout trusts a client amount and is unauthenticated.** No Bitripay webhook
  exists, so nothing issues from it and there is no goods-for-less path today; it should
  re-price server-side and require a token before ever being wired to issuance.

### 25 August — money-side adversarial audit: two real leaks closed

A deep pass over every path that moves money — Stripe and KODA checkout and webhooks,
the fee engine, the ACU top-up/billing model, coupons, season passes, upgrades,
refunds, holds — looking specifically for anything a user could use to make the
platform worse off. Most of the model held up under it; two genuine leaks did not,
and both are now closed with tests.

**LEAK 1 (severe) — `/api/ai` was an open, unmetered proxy to paid inference.** The
route fronts three paid model providers (Anthropic, Google, OpenAI). It verified
nothing about the caller, checked no balance, and debited nothing — the comment said
"cost is measured and billed", and the ACU ledger that would bill it throws
(`post()`, unwired, docs/13 debt D2). So anyone with `curl` could spend the platform's
provider budget without limit, and the similar-events block fired one paid call per
anonymous event-page view **automatically** — meaning ordinary traffic, the exact
traffic a launch campaign buys, was an uncapped bill.

Closed by a floor that must exist with or without the ACU wallet:
- **Auth required.** `/api/ai` now runs `requireUser` first and fails closed. The
  components that fired it for anonymous visitors (`SimilarEvents`,
  `PersonalizedRecommendations`, ticket recommendations) now use `authedFetch` and
  already degrade to their built-in heuristics on a 401 — so signed-out visitors get
  the same page, and the providers are never billed for an anonymous view.
- **Hard per-user daily cap**, counted BEFORE any provider is contacted
  (`ai-usage.ts`, `AI_DAILY_CALL_CAP = 60`), refusing the over-cap call with a 429. A
  datastore fault fails closed, not open.
- **Real spend recorded** per account per day (provider cost + marked-up charge), in a
  collection denied to every client in `firestore.rules` — so "measured and billed" is
  now true (a genuine usage ledger the ACU wallet can reconcile against when D2 lands).
- The AI dynamic-pricing review (`reviewPricing`) is metered through the same allowance
  — ownership was proven, but "your own event" was not a licence to loop paid reviews.
- Pinned by `test:ai-usage` (4/4, emulator): counts advance, the over-cap call is
  refused and not counted, one account's cap does not touch another's, spend sums.

**LEAK 2 (moderate) — coupon usage limits were decorative.** `applyCoupon` refuses a
code once `usageCount >= usageLimit`, but nothing incremented `usageCount` — it was
written 0 at creation, read at checkout, and never moved. A single-use "100% off" code,
or "50% off, first 100", worked an unlimited number of times. Coupons only reach the
basket path, so redemption is now settled off the paid `cart_orders` document
(`settleCartOrderRedemption`): the increment rides the pending → issued transition
inside one transaction, so it counts exactly once per paid order and a redelivered
webhook cannot advance it again. Wired into both the Stripe and KODA cart webhooks.
Pinned by `test:coupons` (4/4, emulator). One residual, noted in code: two genuinely
simultaneous last-use checkouts can both settle, so a limit can be exceeded by the
number of concurrent buyers — bounded and tiny, where it was previously unbounded.

**Checked and found SOUND (no change):** the single-event and cart checkout re-price
every line from Firestore and ignore the posted amount (a £250 ticket cannot be bought
for a penny); pay-what-you-want accepts a buyer amount only above the organiser's floor
and only on a tier actually marked `choose`; the service fee is computed server-side and
never taken from the form; both webhooks verify HMAC/Stripe signatures over the raw body
and are idempotent by document id (a replayed or forged settlement issues nothing); the
KODA minor-units bridge never asks for more than the page showed; the mobile-money 2%
is charged on top, not absorbed; donations and registry gifts are excluded from the fee
base deliberately; the welcome email/route is claim-guarded and cannot be used as an
open relay; the ACU ledger denies all client writes and refuses to go negative.

**Owner-side, unchanged by this pass (recorded for wiring):** the ACU wallet itself
(top-up → balance → per-call debit, docs/13 D2) is still designed-not-wired; the daily
cap above is the interim ceiling. When the wallet is wired it layers on top of this
floor and reads the spend records this pass started writing.

### 22 August — blog view counts and an SEO score in the event editor

Recorded here late — the code shipped in the two commits before this note, which
broke §0's same-commit rule; the record is corrected rather than left missing.

- **View counts** (`article_views/{slug}` + `/api/blog/views` + `ArticleViews`):
  the blog pages are prerendered, so the count is read and bumped from the browser.
  POST only accepts published slugs (no junk documents via curl), increments are
  atomic (`FieldValue.increment`), one count per browser session per article, and
  the index page's thirty cards share ONE bulk fetch. Counts render on the article
  meta row and on every index card.
- **SEO score** (`shared/seo-score.ts`, 6/6 tests): nine weighted checks — title
  length, description depth, image, category, venue, coordinates, future date,
  tiers, public listing — graded live in the event form as the organiser types,
  each failing check naming its fix. Pure shared module; the form only displays.

### 23 August — "not well fit on a phone" — the real culprit was font scaling

Fresh screenshots showed every page ~15% oversized with the right edge cut off —
*after* the earlier focus-zoom suppression (`maximumScale: 1` in the viewport
export, commit 9316a39, also recorded late here). Reproduced in a headless probe by
scaling the root font size the way **Android's "Text size" accessibility setting**
does: every control on this site is sized in rem, so the whole layout widens while
the viewport does not, and the global `overflow-x: clip` guard cuts the excess off
the right edge — the half-visible menu button in the screenshots.

- **Header** (the one row on every page): the brand link is now the shrinkable
  member (`min-w-0 shrink` + truncating wordmark) and the controls cluster is
  `shrink-0` — at large font scales the wordmark truncates and the cart/theme/menu
  buttons stay on screen.
- **Event cards**: `1fr` grid tracks grow to their item's min-content, which pushed
  every card past the viewport at 150%. `min-w-0` on the card's root link keeps the
  track at the available width; the card's `overflow-hidden` absorbs the rest.
- **/events view toggle** (List/Calendar/Map) and the homepage "Browse everything"
  header row now wrap instead of pushing off-screen.

Verified with a Playwright probe at 412px across `/`, `/events`, `/cart`,
`/organisers`, `/giving`, `/promotions` and an event page at 100% / 130% / 150%
root font scale: zero horizontal overflow anywhere. Not testable here: the owner's
actual handset — if the overscale persists after this rollout, the remaining
suspects are a per-site Chrome zoom setting or a stale installed-PWA shell.

### 19 August — mobile money: the telecom 2% is already charged on top (verified, no change)

"On top of our fees the telecom 2% fee to be added too" — checked against
`shared/constants/fees.ts` and the KODA checkout: the CD config carries
`buyerRailSurchargePct: { bitripay_momo: 2, manual_momo: 2 }`, so a mobile-money buyer
pays face + 3.99% + 49¢ (min 79¢) **+ 2% of face**, folded into the one displayed
service fee; `economics.netProfitable` proves the corridor clears cost with it. A $10
ticket by mobile money collects $11.09 — 89¢ platform fee + 20¢ rail surcharge. The
sender-side transfer fee the telecom takes from the buyer's own wallet is between the
buyer and their operator and never touches the platform's take.

## Seat-map engine — docs/23 gap analysis

The full specification is `docs/23-seat-map-engine.md`. Phase 1 (geometry) is built.
The honest state of the rest:

| Spec § | Requirement | State |
| --- | --- | --- |
| §5, §19 | Row shapes from coordinates, SVG rendering, zoom/pan | **Built** (phase 1). Freeform per-seat positioning and circular/radial are not. |
| §10, §15, §25 | Holds with TTL, atomic seat locks, orphan prevention | **Built.** Holds/locks predate the spec; §10 is now also a blocking rule — `preventOrphans` per section, enforced at hold time via `orphansCreated()` (pure, 32/32 in seating tests: gangways end runs, pre-existing singles are never blamed on a new buyer). A policy gate outside the lock transaction, deliberately — double-booking safety stays in the locks. |
| §9 | Find-seats-together | **Built** as best-available (together > centre > front, told when split). Party-mix (2 adults + 3 children) waits on per-seat ticket types. |
| §11, §12 | GA zones, hybrid reserved+standing | **Built** — capacity tiers beside seated sections in one event. |
| §13 | Tables | **Built** as hospitality packages (whole-table, deposit, balance, guests). Per-chair sale of a table is not. |
| §1, §2, §7, §8, §26 | Seat ≠ ticket type ≠ price; Adult/Child side by side; per-seat type choice in the picker | **Built (phase 2 + §8 UX).** "Who sits where": each chosen seat carries its own editable ticket type, the steppers and the assignments count one party one way, and seats post grouped by type so the i-th person's ticket names the seat they chose. `attendeeTypes` on a tier — Adult £10 / Child £5 sharing one tier's capacity; per-type steppers in the buy box; the server re-prices every entry from the stored tier (`resolveMix`, tested); one payment, per-type Stripe lines; issuance flattens the mix onto tickets in seat order so the i-th person gets the i-th seat (emulator-tested, 12/12). Ticket shows "Tier — Child". Free mixed orders issue through the free path. Sections map to tiers as before, which is the seat-category layer. |
| §6 | Per-seat category overrides mid-row | **Not built** — a seat's category is its section's tier. Wheelchair/companion seats are held back but not separately categorised. |
| §3, §4, §20–§23, §27 | Canvas builder, drag/rotate, generators, mirror, undo, object palette | **Not built — phase 3.** Today: row-spec editor with live preview, straight or shaped. |
| §14 | Wheelchair + companion pairing rules | **Partial** — accessible seats are held back from sale; companion linkage and buy-together rules are not. |
| §16, §17, §24 | Venue as reusable entity, event inventory overlay | **Not built — phase 4.** Seating lives on the event; venues are not yet first-class. |

## Ordered by what actually blocks revenue

1. **Checkout holds.** Every oversold race is a charged customer with no ticket and a
   manual refund.
2. **QR signing.** Without it a screenshot is a valid ticket, and the fraud is the
   buyer's loss, not yours.
3. **The remaining `dispatch()` call sites.** Refunds, failed issuance and organiser
   decisions now notify. Payouts, event changes and cancellations still do not.
4. **Ticket transfer.** The most-requested consumer feature in ticketing.
5. **Referral / influencer.** The only acquisition mechanism that works without waiting
   months for SEO — and the one currently sold on `/growth` without existing.

## Watch after deploying

| Signal | Meaning |
| --- | --- |
| `/api/health` not 200 | A dependency is unconfigured; `datastore` false means nothing works |
| `payment_events.status == 'oversold'` | Someone paid, no ticket can be issued, needs a refund |
| `payment_events.status == 'failed'` | Issuance gave up after 5 attempts; a person must look |
| `payment_events` stuck `pending` > 10 min | The reconciliation sweep is not running |
| Function log `inventory drift` | A tier counter disagrees with issued tickets |
| `issued_payments.delivery` starts `failed:` | Tickets issued but the email did not send |
| `issued_payments.delivery == 'skipped'` | SMTP unconfigured, or the buyer has no email address |

## Commands

```bash
npm run build          # app
npm run typecheck      # app + the functions contract guard
npm run lint
npm run check:links    # link graph + publishing gate
npm run report:links   # inline link density
npm test               # pricing + issuance + delivery + AI gateway + comms
npm run test:pricing   # 12 tests, the money rules
npm run test:issuance  # 10 tests, Firestore emulator, real transactions
npm run test:delivery  # 10 tests, real SMTP conversation
npm run test:ai        # 10 tests, real HTTP servers speaking each vendor's shape
npm run test:comms     # 10 tests, real SMTP conversation through dispatch()
npm run test:newsletter # 15 tests, content honesty + unsubscribe
cd functions && npm run build
```
