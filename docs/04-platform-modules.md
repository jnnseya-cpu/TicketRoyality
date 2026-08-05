# 04 — Platform Modules

Module-by-module specification. **Status** is against this repository:
`LIVE` = shipped and building · `EXTEND` = exists, needs the described additions ·
`NEW` = not yet built.

---

## M1 — Identity & Access

**Status:** `EXTEND`

| Capability | Status | Specification |
| --- | --- | --- |
| Email/password auth | LIVE | Firebase Auth; `src/hooks/use-auth.tsx` |
| Role model | LIVE | `customer` / `organiser` / `superuser`; organisers created `pending` |
| Route guards | LIVE | `RequireRole` — a UX affordance; authority lives in `firestore.rules` |
| Password reset | LIVE | `/forgot-password` |
| Social sign-in | NEW | Google, Apple. Apple is mandatory for iOS App Store if Google is offered |
| MFA | NEW | TOTP mandatory for `superuser` and any organiser with payout access |
| Device fingerprinting | NEW | Feeds `fraud.v3` and `security.v1` |
| Step-up auth | NEW | Re-authenticate before payout changes, bulk email, or role changes |
| Session policy | NEW | 30 days attendee · 12 hours organiser · 1 hour superuser, sliding |
| Impersonation | NEW | Consented, 30-minute hard expiry, banner, `acting_as` in every audit row |
| API keys | NEW | Scoped, rotatable, per-environment — see [09](./09-api-specification.md) |

**Acceptance criteria**
- A `customer` cannot write `userType`, `status`, `commissionPercent`, `adminFee` or
  `wallet` on their own document. *(Already enforced by `noPrivilegedFields()` in
  `firestore.rules`.)*
- A new organiser is `pending` and cannot create an event until approved.
- Every `superuser` session requires MFA within the last 12 hours.

---

## M2 — Event Catalogue & Inventory

**Status:** `EXTEND`

| Capability | Status | Specification |
| --- | --- | --- |
| Create/edit event | LIVE | `CreateEventForm` — 6 sections, full Zod validation |
| Categories | LIVE | 10 groups, 47 subcategories, group-scoped keys |
| Physical/online/livestream | LIVE | One inventory model across all three |
| Tiered pricing | LIVE | Unlimited tiers with per-tier inventory |
| Seat maps | LIVE | Colour-coded sections, lettered rows, auto seat labels |
| Speakers | LIVE | Name, title, photo |
| Recurring series | LIVE | Weekly/monthly with an end date |
| Draft/publish | LIVE | Organiser self-approves publication |
| **Drag-and-drop seat editor** | NEW | Canvas editor: shapes, copy/paste, free placement, per-seat colour and status |
| **Holds & allocations** | NEW | Reserve blocks for promoters, press, artist guest list |
| **Timed entry** | NEW | Capacity per time slot for exhibitions and museums |
| **Waitlist** | NEW | Auto-offer on refund, 30-minute claim window |
| **Bundles** | NEW | Multi-event passes, festival wristbands |
| **Merchandise & add-ons** | NEW | Non-ticket line items: parking, drinks vouchers, merch |

### Seat editor specification (`NEW`)

The current `SeatMapPreview` renders sections as generated grids. The editor upgrades
this to direct manipulation, without breaking the existing data model.

```ts
interface SeatMapDocument {
  version: 2;
  canvas: { width: number; height: number; backgroundUrl?: string };
  shapes: Shape[];        // stage, bar, entrance, pillar, arbitrary polygon
  sections: SectionV2[];
}

interface SectionV2 {
  id: string;
  name: string;
  color: string;
  transform: { x: number; y: number; rotation: number; scale: number };
  layout:
    | { kind: 'grid'; rows: number; seatsPerRow: number; startRow: string; curve?: number }
    | { kind: 'freeform'; seats: Seat[] };
  pricing: { tierId: string };
}

interface Seat {
  id: string;            // "A12" — unique within the section
  x: number; y: number;
  status: 'available' | 'held' | 'sold' | 'blocked' | 'accessible';
  colorOverride?: string;
}
```

**Interactions:** select · multi-select (marquee) · copy/paste with offset · drag ·
rotate · align/distribute · snap-to-grid · undo/redo (50 levels) · zoom/pan.
**Rendering:** `react-konva` on canvas. > 5,000 seats switches to WebGL instancing.
**Migration:** v1 section documents are read and up-converted to v2 `grid` layouts on
first open. No data loss, no forced migration.

**Acceptance criteria**
- A 20,000-seat map renders at ≥ 30fps and saves in < 2s.
- Seat ids are unique within a section; a duplicate is rejected at save with the
  conflicting ids named.
- A sold seat cannot be deleted or moved to another section.

---

## M3 — Ticketing & Entry

**Status:** `EXTEND`

| Capability | Status | Specification |
| --- | --- | --- |
| Single-use QR | LIVE | Payload `{v,t,e,u,r}` — identifiers only, no PII |
| Event binding | LIVE | A ticket for another event is refused |
| One-scan enforcement | LIVE | `valid → redeemed` only, enforced in rules |
| Scoped check-in portal | LIVE | Per-event link; no dashboard, no customer data, no finances |
| Colour-coded results | LIVE | Green valid · red already-used · red wrong-event |
| Ticket modal | LIVE | Attendee, tier, seat, price, venue; download and print |
| **Rotating QR** | NEW | TOTP-derived, 30s rotation — defeats screenshot resale |
| **Offline scanning** | NEW | Pre-download the manifest; queue and reconcile on reconnect |
| **Transfer** | NEW | Named transfer, re-issues the code, voids the original |
| **Access control zones** | NEW | A VIP ticket opens the VIP gate; general does not |
| **Re-entry policy** | NEW | Per-event: none / unlimited / N times |
| **Wallet passes** | NEW | Apple Wallet and Google Wallet |

### Rotating QR (`NEW`)

Static QR codes are screenshot-able and therefore resale-able. Rotation removes the
attack.

```
code = base64url( ticketId ‖ HMAC-SHA256(secret, ticketId ‖ floor(now/30)) [0:8] )
```

- The secret is per-ticket, generated at issuance, stored server-side only.
- The scanner accepts the current window ±1 (90s total) for clock skew.
- Offline scanners hold the secret in the pre-downloaded manifest, encrypted at rest
  on the device, wiped at event end.
- **Fallback:** a static code remains valid for attendees without a working device.
  Accessibility beats anti-fraud; the static path is flagged for the door operator to
  eyeball.

**Acceptance criteria**
- Scan decision p95 < 200ms online, < 50ms offline.
- A replayed code from a screenshot older than 90s is refused.
- An offline scanner reconciles without creating a duplicate admission.

---

## M4 — Payments & Checkout

**Status:** `EXTEND`

| Capability | Status | Specification |
| --- | --- | --- |
| Stripe | LIVE | Form-POST + 303 redirect (keeps the click gesture); idempotent webhook |
| Bitripay | LIVE | Server-to-server token then payment link |
| Mobile money | LIVE | Vodacom/Airtel/Orange/Africell, 2% fee, admin verification |
| Cart + promo codes | LIVE | `useCart` with localStorage persistence |
| **BitriPay gateway** | NEW | Full merchant gateway — see [05](./05-bitripay-gateway.md) |
| **Apple/Google Pay** | NEW | Materially lifts mobile conversion |
| **Buy now, pay later** | NEW | Klarna, Clearpay for tickets > £100 |
| **Multi-currency** | NEW | Present in local currency, settle in the organiser's |
| **Partial refunds** | NEW | Per-line, not whole-order only |
| **Chargeback workflow** | NEW | Auto-assemble evidence and submit |
| **Split payments** | NEW | Group bookings split across payers |

**Payment state machine** — the authority is the webhook, never the redirect:

```
initiated → authorised → captured → settled
    │           │            │
    │           │            └─→ refunded (full | partial)
    │           └─→ failed → (retry ≤ 3)
    └─→ abandoned (30 min TTL)

captured → disputed → { won → captured | lost → charged_back }
```

**Non-negotiable rules**
1. **A ticket is issued by the webhook, not by the redirect.** A user closing the tab
   after paying still receives their ticket.
2. **Every write is idempotent on the provider event id.** *(Already implemented in
   `src/app/api/stripe-webhook/route.ts`.)*
3. **Money movement is never an agent decision.** Agents may propose refunds; a human
   or a deterministic rule executes.
4. **Mobile-money submission is not a purchase.** Only admin approval issues the
   ticket. *(Already enforced in the offline-payments flow.)*

---

## M5 — Revenue, Commission & Payouts

**Status:** `EXTEND`

| Capability | Status | Specification |
| --- | --- | --- |
| Commission model | LIVE | Global % + fixed fee; per-organiser override |
| Statement | LIVE | Running balance per transaction |
| Withdrawal | LIVE | Minimum threshold, method selection |
| Reports + CSV | LIVE | By event, by category, by revenue line |
| **Automated payouts** | NEW | Stripe Connect scheduled transfers |
| **Payout holds** | NEW | Risk-based; released after the event completes |
| **Reserve** | NEW | Rolling % held against chargeback exposure |
| **Tax** | NEW | VAT/GST calculation and invoicing per jurisdiction |
| **Revenue share** | NEW | Multi-party split: organiser, venue, promoter, artist |
| **Reconciliation** | NEW | Three-way: gateway ↔ ledger ↔ bank |

**Payout risk policy**

| Signal | Hold |
| --- | --- |
| New organiser, first 3 events | 100% until event + 7 days |
| Refund rate > 15% | 50% until refund rate normalises |
| Chargeback rate > 1% | 100% + reserve, manual review |
| Event > 90 days out | 50% until event − 14 days |
| Established, clean, > 10 events | None; T+2 automatic |

Rationale: the platform is exposed between sale and delivery. If an organiser is paid
out and then fails to deliver, the platform funds the refunds.

---

## M6 — Discovery & Search

**Status:** `EXTEND`

| Capability | Status | Specification |
| --- | --- | --- |
| Search | LIVE | Title, venue, category, organiser |
| Filters | LIVE | Category, free, online, livestream |
| Geolocation | LIVE | Opt-in, expanding 10/20/30 miles |
| Calendar view | LIVE | Date selection with event highlighting |
| AI recommendations | LIVE | With deterministic fallback |
| **Semantic search** | NEW | Vector embeddings: "something to do Friday with my dad" |
| **Personalised ranking** | NEW | Learned per user, with an explicit "why this" control |
| **Saved searches + alerts** | NEW | Notify on new matching events |
| **Follow organiser** | NEW | Notify on new events from a followed organiser |
| **SEO** | NEW | Per-event `Event` structured data, sitemap, canonical URLs |

**Ranking function** (weights are tunable and A/B tested):

```
score = 0.30·semantic_relevance
      + 0.20·proximity_decay(distance)
      + 0.20·temporal_urgency(days_to_event)
      + 0.15·personal_affinity(user, category)
      + 0.10·quality_signal(organiser_rating, sell_through)
      + 0.05·paid_boost                  ← capped, always labelled "Promoted"
```

**Paid placement is capped at 5% of the ranking weight and always labelled.**
Selling ranking degrades the product; selling *visibility* does not. The two are
different and the distinction is worth protecting.

---

## M7 — Marketing & Promotion

**Status:** `EXTEND`

| Capability | Status | Specification |
| --- | --- | --- |
| Video ad carousel | LIVE | 3 slots, 20s, autoplay, purchased from the dashboard |
| Featured placement | LIVE | Homepage grid |
| AI ad copy | LIVE | 4 channels, structured output |
| Promotions purchase | LIVE | Stripe checkout from the dashboard |
| Coupons | LIVE | Percentage/fixed, usage limits, expiry |
| **Email campaigns** | NEW | Segment builder, templates, scheduling, A/B |
| **Meta/Google/TikTok** | NEW | Direct API campaign creation by `growth.v4` |
| **Tracking links** | NEW | UTM + first-party attribution per promoter |
| **Embeddable widget** | NEW | `<script>` checkout on the organiser's own site |
| **Affiliate programme** | NEW | Commission-per-sale for influencers |
| **Referral** | NEW | Attendee-to-attendee with a two-sided reward |

**Email governance** — a marketing platform that spams destroys its own deliverability:
- Double opt-in for marketing. Transactional is separate and always delivered.
- One-click unsubscribe honoured within 60 seconds, globally.
- Frequency cap: 3 marketing emails per user per week, across all organisers.
- Organisers email **their own** attendees only. There is no shared list. Ever.

---

## M8 — Live Streaming

**Status:** `EXTEND`

| Capability | Status | Specification |
| --- | --- | --- |
| Livestream event type | LIVE | Stream URL + key, filterable |
| Player placeholder | LIVE | Renders on the event page |
| **RTMP ingest** | NEW | Mux or Cloudflare Stream |
| **Adaptive HLS** | NEW | Multi-bitrate, global CDN |
| **DRM / token auth** | NEW | Signed playback URLs, ticket-bound, device-limited |
| **Live chat** | NEW | Firestore-backed, moderated |
| **Q&A + polls** | NEW | Upvoting, host-controlled |
| **Simulcast** | NEW | Restream to YouTube/Twitch/Facebook |
| **VOD replay** | NEW | Ticket-holder access for N days |
| **Viewership analytics** | NEW | Concurrent, retention curve, geography |

**Access control:** a playback token is issued per ticket, bound to `ticketId`, capped
at 2 concurrent devices, expiring 4 hours after the event ends. Exceeding the device
cap invalidates the oldest session — the same anti-sharing model as any streaming
service.

---

## M9 — Analytics & Intelligence

**Status:** `EXTEND`

| Capability | Status | Specification |
| --- | --- | --- |
| Sales charts | LIVE | Daily/weekly, real ticket data |
| Performance metrics | LIVE | Gross, net, commission, orders |
| Reports + CSV | LIVE | Event, category, revenue |
| **Real-time dashboard** | NEW | Sub-second, WebSocket |
| **Cohort analysis** | NEW | Retention by acquisition cohort |
| **Funnel** | NEW | View → detail → cart → checkout → paid, with drop-off |
| **Attribution** | NEW | Multi-touch across channels |
| **Forecasting** | NEW | Sell-through with confidence intervals |
| **Benchmarks** | NEW | k-anonymised (k ≥ 5) peer comparison |
| **Natural-language queries** | NEW | `analyst.v2` |

**Event taxonomy** — every user action emits a typed event to the bus:

```ts
type PlatformEvent =
  | { type: 'event.viewed';        eventId; userId?; source; timestamp }
  | { type: 'checkout.started';    cartId; userId; valueMinor }
  | { type: 'checkout.completed';  orderId; userId; valueMinor; provider }
  | { type: 'ticket.issued';       ticketId; eventId; userId }
  | { type: 'ticket.scanned';      ticketId; eventId; operatorId; result }
  | { type: 'refund.requested';    ticketId; reason }
  | { type: 'agent.acted';         agentId; principalId; action; reversible }
```

One taxonomy feeds analytics, the agent layer and the audit log. Three separate
pipelines would drift within a quarter.

---

## M10 — Notifications

**Status:** `NEW`

| Channel | Use | Provider |
| --- | --- | --- |
| Email | Confirmations, reminders, marketing | SendGrid |
| SMS | Door-day reminders, urgent changes | Twilio |
| WhatsApp | High-engagement markets (Africa, LatAm) | Twilio/Meta |
| Push (web + mobile) | Real-time alerts | Firebase Cloud Messaging |
| In-app | Command Centre attention items | Internal |

**Preference model:** per user, per channel, per category, honoured everywhere.
Transactional messages (ticket issued, event cancelled) are **not** suppressible —
they are contractually required. Marketing always is.

**Delivery guarantees:** at-least-once with idempotency keys. A duplicate ticket email
is embarrassing; a missing one is a support ticket and a refused entry.

---

## M11 — Support & Disputes

**Status:** `NEW`

| Capability | Specification |
| --- | --- |
| Ticketing system | Zendesk integration, or built-in |
| AI first response | `support.v2` at L2 |
| Escalation | Confidence, sentiment, sensitive intent, or 3 unresolved turns |
| Refund workflow | Organiser policy → auto-approve within limits → human above |
| Dispute centre | Attendee ↔ organiser, platform arbitrates |
| Chargeback | Auto-assemble evidence: scan record, T&Cs accepted, delivery proof |
| Knowledge base | Versioned, agent-retrievable, human-editable |

**Refund authority ladder:**

| Amount | Authority |
| --- | --- |
| < £50, within policy | `support.v2` at L2, auto |
| £50–£500, within policy | Organiser approval |
| Any amount, outside policy | Platform admin |
| Event cancelled | Automatic full refund, no approval, funded from held balance |

---

## M12 — Marketplace & Partners

**Status:** `NEW`

| Capability | Specification |
| --- | --- |
| Venue directory | Claimable profiles, capacity, facilities, availability |
| Promoter network | Allocation, tracking links, commission |
| Sponsor marketplace | Inventory listing, buying, measurement |
| Service marketplace | Photographers, security, catering, AV |
| Partner API | Third parties list and sell inventory |
| White label | Full-brand instance on a custom domain |

---

## M13 — Developer Platform

**Status:** `NEW`

Full specification in [09](./09-api-specification.md). Summary:

| Capability | Specification |
| --- | --- |
| REST API | Versioned `/v1`, OpenAPI 3.1 |
| Webhooks | Signed, retried with exponential backoff, replayable |
| SDKs | TypeScript, Python, PHP |
| Sandbox | Full-fidelity, isolated, seeded test data |
| API keys | Scoped, rotatable, per-environment |
| Rate limits | Per key, per endpoint, published in headers |
| Docs | Generated from OpenAPI, with runnable examples |

---

## M14 — Admin Super Control Centre

**Status:** `EXTEND` — full specification in [12](./12-admin-control-centre.md).

---

## M15 — Agent Control Plane

**Status:** `NEW` — full specification in [03](./03-agent-architecture.md).

| Capability | Specification |
| --- | --- |
| Agent registry | Version, autonomy, budget, SLO, owner |
| Policy engine | Deny by default; every kernel write passes through it |
| Escalation queue | Human-in-the-loop, SLA-tracked, ranked by cost of inaction |
| Memory store | 4 layers, tenant-partitioned |
| Transcript | Every action, reversible where physics allows |
| Budget | ACU per agent, per principal, per chain |
| Evaluation | Golden sets, CI gates, drift detection |

---

## M16 — Organiser Mobile App

**Status:** `NEW`. The door is the one place where the product is used under time
pressure, in poor light, on bad connectivity, by staff who were briefed ten minutes
ago. It earns a native surface.

| Capability | Specification |
| --- | --- |
| Live sales counter | Tickets sold, revenue, sell-through rate, updating in real time |
| Multi-gate scanning | Device camera; **many devices, many gates, simultaneously** |
| Door sales | Sell at the gate via Stripe Terminal or BitriPay POS |
| Guest list | Search by name, email or QR lookup |
| Staff roles per gate | `scan_only` · `sell` · `manage` — assigned per gate, not per person |
| Emergency blocklist | Instant ban by email or ticket ID, effective across every device |
| Refunds | Requested from the app, released on organiser approval |
| Attendance | Scanned / capacity / no-shows, live |
| Push alerts | Sold out, suspicious scan, gate congestion, revenue milestone |

### Requirements that are not negotiable

**Offline-tolerant scanning.** Venues have bad signal; that is a fact about buildings,
not a bug. The scanner holds a signed local copy of the valid-reference set for its own
event, admits against it, and reconciles when connectivity returns. Conflicts —
the same ticket admitted at two gates during a partition — surface as incidents rather
than being silently resolved.

**Roles are per gate.** A steward on the east gate at 19:00 is not the same principal
as the same person on the VIP entrance at 21:00. Binding the role to the assignment
rather than the human is what makes `scan_only` meaningful.

**The blocklist propagates in seconds, not on next launch.** Its entire purpose is the
case where someone must not get in *now*.

**Door sales use the same inventory model as online.** A ticket sold at the gate is the
same object, in the same tier, decrementing the same count. Anything else produces two
sources of truth about capacity on the night it matters most.

---

## M17 — Venue Operations

**Status:** `NEW`. The venue manager (`02` §2.1, actor 6) currently has authority and no
tooling.

| Capability | Specification |
| --- | --- |
| Seat map builder | Sections, rows, seats, pricing bands; versioned (`08` §8.6) |
| Gate configuration | Named gates, capacity per gate, open/close windows, staff assignment |
| Security zones | Zones with access rules; a ticket grants entry to zones, not to a building |
| Vendor management | Traders, contracts, pitch allocation, revenue share |
| Blackout dates | Dates the venue cannot host, enforced against event creation |
| Licensing constraints | Capacity limits, curfew, age restrictions — checked at publish |

### Zones are the reason this is not just "gates plus a spreadsheet"

A stadium ticket admits its holder to a turnstile, a concourse, a stand and possibly a
lounge — and *not* to the pitch, the hospitality suite or the backstage area. Modelling
entry as one boolean per venue makes VIP hospitality unenforceable at the door, which
is the point at which a £400 package becomes a £40 one.

A zone is checked at scan: the ticket's tier grants a zone set, the gate belongs to a
zone, and admission is set membership.

**Licensing constraints are checked at publish, not at sale.** An event published above
its venue's licensed capacity is a legal problem for the venue and a refund problem for
the organiser. Catching it when the tier quantities are set costs nothing; catching it
when tickets are sold costs a cancellation.

---

## M18 — Promoter & Affiliate Network

**Status:** `NEW`. Distribution that the organiser does not have to run themselves.

| Capability | Specification |
| --- | --- |
| Commission links | Trackable per-promoter URL; attribution on the order (`08` §8.9) |
| Allocation | A promoter sells against a reserved quantity, not the open pool |
| Affiliate tracking | First-touch and last-touch, with the window stated per campaign |
| Promotional codes | Existing `coupons`, scoped to a promoter |
| Sub-promoters | A promoter may allocate to their own network, with their own split |
| Settlement | Commission accrues per ticket, settles with the organiser payout |

### Attribution has to be decided, not discovered

Two promoters both touch a sale. Who is paid? The platform picks **last-touch within a
7-day window** as the default and makes it configurable per campaign, because the
alternative — leaving it implicit — means the answer is whatever the query happens to
return, and promoters will find that out before the finance team does.

Sub-promoter splits are bounded: a sub-promoter's commission comes out of their
parent's share, never out of the organiser's. A network that can dilute the organiser's
net without the organiser agreeing is a network the organiser will disable.

---

## M19 — Sponsor Activation

**Status:** `NEW`.

| Capability | Specification |
| --- | --- |
| Sponsor passes | Issued as tickets with a sponsor tier; scannable, countable |
| Logo placement | Event page, ticket, confirmation email, wallet pass |
| Exposure reporting | Impressions, scans, click-through on sponsored placements |
| Attendee reports | **Aggregate only.** See below |
| Activation contracts | E-signature via `06` §6.15 |

### Attendee data reporting — the constraint that defines this module

A sponsor wants to know who attended. **They do not get to.**

| Sponsor receives | Sponsor never receives |
| --- | --- |
| Counts, segments, aggregate demographics | Names, emails, phone numbers |
| Impression and scan totals | Individual attendance records |
| Opt-in leads, where the fan explicitly consented | Any record a fan did not consent to share |

The organiser owns the fan relationship (`01` §1.3, Fever) and the fan owns their
personal data. A sponsorship product that quietly sells attendee lists breaks both, and
under GDPR it breaks the law — the lawful basis for processing a ticket purchase does
not extend to handing that person to a third party.

Aggregates are **k-anonymised**: no segment is reported below 25 attendees, or a
sponsor at a small event reconstructs individuals by intersecting reports.

---

## M20 — Loyalty & Fan Rewards

**Status:** `NEW`.

| Capability | Specification |
| --- | --- |
| Tiers | `users.loyalty_tier` (`08` §8.4) — standard, silver, gold, royal |
| Earning | Attendance, spend, referral, early purchase |
| Benefits | Presale access, fee reduction, seat upgrades, hospitality upsell offers |
| Presale windows | Tier-gated `sale_starts_at` on a `ticket_type` |
| Referral | Attributed via M18's tracking, credited on the referred order |

**Loyalty is platform-wide, benefits are organiser-funded.** The tier travels with the
fan across every organiser; what a tier unlocks is set per event by the organiser who
pays for it. The alternative — platform-funded benefits — means the platform subsidises
attendance at events it takes 5% of, which does not survive contact with a spreadsheet.

Earning is capped per event so a single high-value purchase cannot vault a fan to the
top tier, and tiers decay after 12 months of inactivity. Both exist because a loyalty
programme with no decay is a permanent liability accruing against future revenue.

---

## M21 — Hospitality Operations

**Status:** `NEW`. The data model exists (`08` §8.13); the operational surface does not.

| Capability | Specification |
| --- | --- |
| Package builder | Inclusions, capacity, price, deposit terms |
| Guest list | Named guests per package, editable up to a cut-off |
| Concierge workflow | Requests, dietary needs, accessibility, arrival times |
| Hospitality CRM | Account history, repeat bookings, spend, preferences |
| Upsell automation | Offer upgrades to existing ticket holders (`10` §10.10) |
| Deposit and balance | Deposit at booking, balance due before a stated date |

### Why hospitality gets its own module rather than a flag on ticketing

Three differences make it a distinct operation:

1. **Named guests, not anonymous holders.** A hospitality booking carries individuals
   with dietary requirements and accessibility needs. That is personal data of a
   category ordinary ticketing never touches, and it needs its own retention rule.
2. **Deposits and balances.** A £4,000 table is booked with a deposit and settled later.
   The single-payment model in `08` §8.11 handles one payment per order; hospitality
   needs two against the same booking.
3. **The relationship is the product.** Repeat hospitality buyers are a small,
   high-value cohort who expect to be recognised. A CRM is not a nice-to-have here; it
   is the reason the margin exists.

**The cut-off is a hard date.** Guest names lock before the caterer's headcount
deadline, because a name added after that point is a person with no seat and no meal.


---

## Access control — the full contract (extends M3)

| Control | Mechanism | Where |
| --- | --- | --- |
| Unforgeable ticket | HMAC-SHA256 over the reference **with a per-event salt** | `08` §8.10 `qr_hash` |
| One-time use | `status = 'valid'` precondition on the redeem statement | `08` §8.10 |
| Duplicate rejection at speed | Redis set of redeemed hashes, checked before the write | `07` §7.3 |
| Offline tolerance | Signed local valid-set; **15-minute sync ceiling** | M16 |
| Gate scoping | `gates.allowed_kinds` — set membership | `08` §8.12a |
| Transferability | `ticket_types.transferable` | `08` §8.8 |
| Identity linking | `ticket_types.identity_linked` + `gates.identity_check` | `08` §8.8 · §8.12a |
| Wallet passes | PKPass and Google Wallet, `delivery_formats` | `06` §6.11 |
| NFC wristbands | `tickets.nfc_tag_id`, unique | `08` §8.10 |
| Screenshot suspicion | Brightness and screen-ratio heuristic → `screenshot_suspected` | `08` §8.12 |
| Admin override | `scan_result = 'override'`, always attributed | `08` §8.12 |
| Full history | Every scan, every outcome, per ticket and per gate | `08` §8.12 |

### The per-event salt matters more than the algorithm

HMAC-SHA256 with one platform-wide key means a single key compromise forges every
ticket ever issued. Salting per event bounds the blast radius to one event, and lets a
compromised event be re-issued without invalidating the platform.

### Screenshot detection is a flag, never a refusal

The heuristic — screen brightness, aspect ratio, moiré — produces false positives on
cracked screens, high-brightness displays and screen protectors. A steward sees
**"check this one"**, not a rejection. The scan still resolves on the authoritative
signal, which is whether the reference has already been redeemed.

A ticket presented from a screenshot is only fraud if the original has *also* been
used, and that is exactly what one-time redemption already catches. The heuristic
buys earlier warning, not a second source of truth.

### The 15-minute offline ceiling

Beyond 15 minutes of partition, a device's local valid-set is stale enough that
duplicate risk exceeds the benefit of admitting from cache. The device switches to
**record-and-flag**: it admits, marks the scan `offline_sync`, and every such entry is
reconciled afterwards.

Admitting a possible duplicate is the right trade at a door with a queue behind it.
Refusing a valid ticket-holder because the wifi dropped is not.

### Override is a first-class outcome, not a workaround

`scan_result = 'override'` records an admin-cleared entry with the actor attached. The
alternative — stewards waving people through when the system says no — produces the
same admissions with no record at all. A door that cannot record an exception is a
door whose log stops matching reality the first time something unusual happens.


---

## M3a — The Ticket as a Discovery Surface

**Status:** `NEW`. Every ticket carries **three recommended events**, chosen from the
holder's learned behaviour.

### Why the ticket and not an email

A ticket is opened repeatedly: at purchase, the night before, in the queue, and again
when someone asks what time doors are. It is one of very few surfaces a fan
*chooses* to look at, arrives at already engaged, and keeps. Marketing email competes
for attention; a ticket already has it.

| Surface | Open rate | Attention state |
| --- | --- | --- |
| Marketing email | ~20% | Interrupted, often hostile |
| Push notification | ~5% acted on | Interrupted |
| **The ticket** | ~100%, several times | Already thinking about going out |

### Selection

`concierge.v1` (`03` §3.8) picks three, ranked by fit:

```
candidates = published events
             ∩ within travel radius of the holder
             ∩ after this event's date
           − events the holder already holds a ticket for
           − events clashing with anything they hold
           − the event this ticket is for
rank by:   category affinity · organiser affinity · price band · lead time
take 3, at most 2 from any one organiser
```

**Clash exclusion is not optional.** Recommending an event that starts while the holder
is already at another one is an advert that proves the platform is not paying
attention. The data to avoid it is already in `tickets`.

**At most two from one organiser** stops the ticket becoming an advert for whoever sold
it. The fan's surface serves the fan (`03` §3.8, `agent(X) ⊂ X`).

### Frozen or live, by format

| Format | Behaviour | Why |
| --- | --- | --- |
| **PDF / printed** | Frozen at issuance | Ink does not update |
| **Wallet pass** (PKPass, Google) | Refreshed up to 48h before the event | The pass API supports it |
| **In-app ticket** | Live on each open | No reason not to be |

`recommendations_at` records when they were generated, so a stale set on a
long-lead ticket is detectable rather than silently wrong.

### On transfer, recommendations are cleared and regenerated

A transferred ticket carries the **original buyer's** inferred taste. Leaving it in
place shows the new holder somebody else's profile — a small privacy leak and a
useless recommendation. `recommended_event_ids` resets to `{}` on transfer, and
regenerates against the new holder if they have a profile.

### Attribution and the constraint on it

A `ticket_rec` UTM plus the source ticket id makes the conversion measurable end to
end: recommendation shown → tapped → order. That is the number that decides whether
this feature stays.

**It must never compete with the ticket's actual job.** Hard rules:

1. The QR occupies the top half of any layout. Recommendations sit below the fold on
   the pass, and below the barcode in print.
2. Event name, time, gate and seat are never displaced or shrunk to make room.
3. On a printed ticket the block is monochrome and small — a ticket that scans badly
   because of a decorative panel is a queue.
4. One line per event: name, date, lead price. No images in the print layout.

A ticket that fails at the door has cost more than any recommendation could earn.

### Metering

The selection runs once per ticket at issuance, batched per order. At `concierge.v1`
rates this is a fraction of an ACU per ticket and is **platform-funded, not charged to
the fan or the organiser** — it is our own distribution channel, and metering it to
the organiser would give them a reason to switch it off.

---

## Notification matrix (extends M10)

| Class | Trigger | Channels | Consent basis |
| --- | --- | --- | --- |
| **Transactional** | Booking confirmed · QR delivered · payout completed · refund issued | Email always, plus SMS/push if opted in | Contract — no opt-out |
| **Event-critical** | Cancelled · date changed · venue moved · gate changed | **Every channel on file, immediately** | Contract — no opt-out |
| **Pre-event** | T-7d · T-24h · T-2h, configurable per event | Per fan preference | Contract, narrowly |
| **Post-event** | Review request · loyalty awarded · next-event recommendation | Per fan preference | Consent |
| **Marketing** | Campaigns, announcements, presales | Only where `follows.notify` is true | **Consent, revocable** |
| **Organiser ops** | Sales milestone · suspicious activity · payout · refund request | Push and email | Contract |

### The line that must not move

**Transactional and event-critical messages have no opt-out and carry no marketing.**
A cancellation notice with a "you might also like" block underneath is a marketing
email wearing a service message's exemption, and it is the single fastest way to lose
the right to send either.

`06` §6.6 already separates the sending infrastructure — different subdomains, different
IP pools — so a marketing complaint cannot damage ticket-delivery reputation. This table
is the policy that infrastructure exists to enforce.

**Event-critical goes to every channel at once** and ignores quiet hours. A venue change
at 17:00 for a 19:00 door is worth waking someone for; nothing else on this table is.

---

## Fan Intelligence — the reporting boundary (extends M9)

| Audience | Receives | Never receives |
| --- | --- | --- |
| **Organiser** | Their own attendees: profile, history, preferences, contact | Attendees of events they did not sell |
| **Venue** | Aggregate throughput, dwell, zone utilisation | Named individuals |
| **Sponsor** | k-anonymised aggregates (≥25), consented leads only | Names, emails, individual records (M19) |
| **Promoter** | Their attributed sales only | The organiser's wider audience |
| **Platform** | Cross-event models on de-identified data | — |

**Cross-event intelligence is built on de-identified data.** The platform learns that
"attendees of jazz events in Manchester also attend blues events" without any organiser
gaining access to another's attendee list. The model is shared; the rows are not.

That constraint is what makes the data flywheel in `01` §1.5 defensible rather than a
liability: every organiser benefits from aggregate learning, and none of them can
extract a competitor's customers from it.

### Live event dashboard

Scan rate, gate throughput, revenue per minute, no-show rate against forecast — sourced
from `scan_logs` (`08` §8.12) and refreshed every 10 seconds during the event window.

This is the one surface where **latency matters more than completeness**. A gate steward
needs to know the queue is building now, not an exact figure a minute late.

---

## M22 — AI Event Architect

**Status:** `NEW`. An organiser describes an event in a sentence; the platform builds
the whole thing as a reviewable draft.

### Input — whatever the organiser already has

| Input | Handling |
| --- | --- |
| Free text | *"Afrobeats night, Kinshasa, 14 March, about 800 people, mid-price"* |
| A poster or flyer image | OCR + vision extraction of title, date, venue, line-up |
| A previous event | Clone and adapt — `events.cloned_from_id` (`08` §8.7) |
| A URL | Fetch and extract, where the source permits it |
| A voice note | Transcribed, then treated as free text |
| Nothing but a category and date | Generates from category norms, flagged low-confidence |

### Output — a complete draft

| Produced | Grounded in |
| --- | --- |
| Title and slug | The brief, checked for collision |
| Description, agenda, line-up | The brief, expanded to house style |
| Category and group | The 47-subcategory taxonomy already shipped |
| Date, time, duration | The brief; duration from category norms |
| Venue and capacity | Named venue if known, else a capacity assumption stated |
| **Ticket tiers** | Comparable events — see below |
| **Prices per tier** | Comparable events + market + capacity — see below |
| Quantities per tier | Capacity split by category-typical mix |
| Add-ons | Parking, F&B, merch where the category supports it (`08` §8.13a) |
| Seat map | Suggested sections if the venue is seated |
| Refund policy, age limit, accessibility | Category defaults, always shown as chosen |
| Cover image | See §Imagery |
| Marketing copy | Email subject, social variants, ad headline |
| Publish checklist | What the organiser must confirm before it can go live |

### It creates a draft. It never publishes.

```
brief ──▶ event_architect.v1 ──▶ status: 'draft'
                                      │
                            organiser reviews every field
                                      │
                                 status: 'in_review'
                                      │
                            organiser publishes explicitly
                                      ▼
                                 status: 'published'
```

Publishing is a commercial and legal commitment: a price becomes an offer, a date
becomes a promise, and a capacity becomes a licensing position. An agent that publishes
unattended can be wrong about a price by a factor of ten and take real money at that
price before anyone looks.

`event_status` carries `in_review` for exactly this step (`08` §8.3).

### Pricing is a proposal with its working shown

A number with no reasoning is unusable — the organiser cannot tell whether to trust it.
Every proposed price arrives with:

```json
{
  "tier": "General Admission",
  "proposed": { "value": 2500, "currency": "CDF" },
  "range": { "low": 2000, "high": 3500 },
  "confidence": 0.72,
  "basis": [
    "11 comparable Afrobeats events, Kinshasa, last 18 months",
    "median GA 2400 CDF, IQR 2000–3200",
    "capacity 800 sits at the 60th percentile of the comparable set",
    "Saturday, +8% vs weekday in this category"
  ],
  "sensitivity": "at 2000 CDF projected sell-through 92%; at 3500 CDF, 61%"
}
```

**Comparables are k-anonymised** and drawn across organisers, never attributed —
the same boundary `04` M9 draws for fan intelligence. An organiser benefits from the
aggregate without seeing a competitor's numbers.

**Confidence below 0.5 means the tier arrives blank** with the reason stated, rather
than carrying a fabricated price. A new category in a new market has no comparable set,
and inventing one is worse than admitting it.

### Imagery — the part with real risk

Generated event imagery can create genuine harm, so the rules are narrow:

| Rule | Why |
| --- | --- |
| **No photorealistic depictions of real people** | A generated image of a named artist implies they are performing |
| **No real venue exteriors or interiors** | Implies a specific place, which may not be the venue |
| **No third-party logos, marks or brand styling** | Trademark, and it implies sponsorship that does not exist |
| **No crowd photos presented as this event** | It depicts something that has not happened |
| Generated images carry C2PA provenance metadata | The origin travels with the file |
| Licensed stock is offered first | A correctly licensed photograph beats a generated one |
| Abstract, typographic and pattern styles are the default | Safe, on-brand, and genuinely what most listings need |

If the organiser uploads a photograph of their own event or artist, that is used
unchanged. **The generator fills a gap; it does not replace a real asset.**

An organiser may override the first four rules only by confirming they hold the rights,
and that confirmation is recorded against the event with their user id.

### Provenance on every field

Each generated field is stored with its origin, so the organiser always knows what they
accepted versus what they wrote:

| State | Meaning |
| --- | --- |
| `ai_proposed` | Generated, untouched |
| `ai_edited` | Generated, then changed by a human |
| `human` | Written by a human |

The publish checklist requires explicit confirmation of every field still in
`ai_proposed` that carries commercial or legal weight: price, capacity, date, venue,
refund policy, age restriction.

**Everything else can ship untouched.** Requiring a human to retype a description they
agree with is the kind of ceremony that makes people stop reading the checklist, which
defeats the checklist.

### ACU cost, quoted before it runs

| Stage | Typical | Charged |
| --- | --- | --- |
| Brief parsing | 3 ACU | On run |
| Comparables and pricing | 12 ACU | On run |
| Copy: description, agenda, marketing set | 10 ACU | On run |
| Image generation, per image | 8 ACU | Per image, opt-in |
| Seat map suggestion | 6 ACU | Only if seated |
| **Typical full build** | **~35–45 ACU** (£0.35–0.45) | Quoted first |

The organiser sees the estimate and confirms before anything runs. Below
`MIN_BALANCE_ACU_TO_RUN_AI` it refuses and links to top-up (`15` §15.6 F5) — the same
hard stop as everywhere else, no overdraft.

**A failed or rejected generation is not charged.** If the agent cannot produce a
complete draft, the organiser has received nothing and should pay nothing. Charging for
output somebody threw away is how a metered feature acquires a reputation for being a
tax.

### Regeneration is cheap and scoped

Regenerating one tier's price costs the pricing stage, not the whole build. Field-level
regeneration is what makes the feature usable — an organiser who likes everything
except the title should not pay 40 ACU to change six words.

---

## M23 — Venue Map Studio

**Status:** `NEW`. Extends M17. Two ways to build the same object: draw it, or describe
it and have it drawn.

### Manual editor

| Capability | Detail |
| --- | --- |
| Primitives | Section → block → row → seat, nested |
| Shapes | Rectangle, arc, curve, polygon, freeform; rotation and skew |
| Layout tools | Snap-to-grid, mirror, radial array, bulk duplicate |
| Numbering | Per-row schemes — numeric, alpha, odd/even, left-to-right or centre-out |
| Colour | Per section, or driven by price band |
| Seat attributes | Accessible, companion, obstructed view, restricted legroom, removable |
| Zones | Assign sections to security zones and gates (M17, `08` §8.12a) |
| Non-seating | Stage, bar, entrance, toilets, camera position, exclusion zones |
| Overlay | Live status: available · sold · held · blocked |
| Export | PDF for venue operations, SVG for print, CSV manifest |
| Reuse | Duplicate across recurring events and across dates |

### AI generation

`seatmap_architect.v1` builds the same structure from whatever exists:

| Input | Extraction |
| --- | --- |
| Text description | *"1,200-seat theatre: stalls, dress circle, balcony"* → three sections with typical proportions |
| Floor plan (PDF or image) | Vision extraction of section boundaries, rows and counts |
| Photograph of the auditorium | Section shapes and approximate rows; counts flagged low-confidence |
| A previous map | Clone and adapt to a new capacity or configuration |
| Venue name | Match against the venue library, if the venue is known |
| Capacity + category only | Generate a category-typical layout, explicitly labelled as a starting point |

Output is a full draft: geometry, rows, seat labels, price bands with colours,
accessible allocation, suggested holds, and a **reconciliation report**.

### The reconciliation report is the point

A generated map is worthless unless its numbers agree with reality:

```
Generated:        1,204 seats across 3 sections
Licensed capacity:  1,200          ⚠ OVER BY 4
Accessible seats:      12 (1.0%)   ⚠ BELOW the 1.5% guideline for this size
Companion seats:       12          ✓ paired
Obstructed flagged:     0          ⚠ UNVERIFIED — cannot be inferred from a plan
Price bands:            4          ✓ every seat assigned
Unassigned seats:       0          ✓
```

**Every warning blocks publication until resolved or explicitly overridden**, and an
override is recorded against the user who made it.

### Three things the agent must not do

**It must not exceed licensed capacity.** A map that sells 1,204 seats in a
1,200-capacity room is a licensing breach, a fire-safety problem, and four people with
valid tickets and nowhere to sit. Capacity is a hard ceiling checked at generation and
again at publish.

**It must not reduce accessible provision.** Same rule as `capacity.v1` (`03` §3.5b) —
hard-coded, un-proposable. Generated maps must meet the accessible allocation for the
venue size, with companion seats paired adjacent, and cannot silently drop below it to
recover sellable inventory.

**It must not claim to know sightlines.** Obstructed view cannot be inferred from a
floor plan — it depends on pillars, rigging, the set and the production. Every
generated map reports obstruction as `UNVERIFIED` and requires a venue manager to mark
it. An unmarked obstructed seat sold at full price is a refund and a complaint, and the
platform having "generated" the map is not a defence.

### Colour coding, done accessibly

Colour communicates price band at a glance and **must never be the only thing that
does**:

| Requirement | Rule |
| --- | --- |
| Contrast | Every band against the background meets WCAG AA (4.5:1) |
| Adjacent bands | Distinguishable in both protanopia and deuteranopia simulation |
| Never colour alone | Each band also carries a label and a distinct fill pattern |
| Sold and held states | Pattern plus opacity, not a hue shift |
| Print | Legible in monochrome — a printed map is often photocopied |

Roughly 1 in 12 men has a colour-vision deficiency. A seat map that only encodes price
in hue is unusable for them at exactly the moment they are spending money.

### Freezing: a map with tickets sold against it cannot be renumbered

```
draft ──▶ published ──▶ first ticket sold
                              │
                         GEOMETRY FROZEN
                              │
        ┌─────────────────────┴──────────────────────┐
   allowed:                                     forbidden:
   · price band changes on unsold seats         · renumbering seats
   · adding holds on unsold seats               · moving or deleting sold seats
   · marking obstruction                        · changing section names
   · adding a new section                       · reshaping occupied sections
```

`seat_maps.version` (`08` §8.6) increments on any structural change, and **tickets
reference the version they were sold under**. A ticket that says "Row F, Seat 12" must
still mean the same physical seat on the night, whatever the map has become since.

A venue that genuinely must re-plan after selling — a stage moves, a section closes —
issues a new version and **re-seats affected holders explicitly**, with notification.
That is a deliberate, visible operation, not a side effect of an edit.

### ACU cost

| Stage | Typical |
| --- | --- |
| Text description → layout | 10 ACU |
| Floor plan extraction (vision) | 20 ACU |
| Photograph extraction | 25 ACU |
| Clone and adapt | 4 ACU |
| Price band assignment | 6 ACU |
| **Typical full generation** | **~25–40 ACU** |

Quoted before it runs. Manual editing is **free** and always available — an organiser
who prefers to draw it themselves is never metered, and every generated map is fully
editable afterwards. The agent produces a starting point, not a locked artefact.

---

## M24 — Homepage Video Ad Carousel

**Status:** `NEW`. Extends the promotion line in `10` §10.4. Ten paid video slots on the
landing page, sold to organisers, **priced by video length**.

### Inventory

| Property | Value |
| --- | --- |
| Slots | **10**, rotating |
| Maximum duration | **180 seconds** — hard, enforced on ingest |
| Sources | YouTube URL, or direct upload (MP4/WebM) |
| Placement term | 7 days, renewable |
| Rotation | Deterministic, equal share of impressions across live slots |

### Pricing is a function of duration

A longer ad occupies more attention and more bandwidth, so it costs more. Charged per
15-second band, per 7-day term:

| Duration | Bands | Price (7 days) |
| --- | --- | --- |
| 0–15s | 1 | £60 |
| 16–30s | 2 | £110 |
| 31–60s | 4 | £200 |
| 61–90s | 6 | £280 |
| 91–120s | 8 | £350 |
| 121–180s | 12 | £480 |

Band 1 is £60 and each additional band adds ~£35, tapering — a 3-minute ad costs 8×
a 15-second one, not 12×, because attention does not scale linearly with length and
pricing it as if it does simply pushes everyone to 15 seconds.

**Duration is measured, never declared.** The platform probes the actual media —
`ffprobe` on an upload, the Data API on a YouTube id — and prices from that. An
organiser who selects the 15-second band and supplies a 90-second file is repriced
before approval, not after the ad has run.

### Ingest and verification

```
organiser submits URL or file
   ▼
probe: duration · resolution · codec · audio present
   ▼
duration > 180s ? ──▶ reject with the measured length
   ▼
price from the measured band, quoted, organiser confirms
   ▼
moderation queue  ◀── never skipped, never agent-only
   ▼
approved → slot allocated, starts at the next rotation boundary
```

### Moderation cannot be fully automated

A paid video on the platform's own homepage is the platform speaking. The risks are
concrete: an ad for an event that will not happen, unlicensed music on the soundtrack,
a performer's likeness used without permission, or content unsuitable for a general
audience.

An agent pre-screens and **ranks the queue**; a human approves. `03` §3.1 gives the
pattern — the agent removes the labour of review, not the decision.

| Check | By |
| --- | --- |
| Duration, codec, resolution, audio present | Automated, blocking |
| Organiser is approved and the event is published | Automated, blocking |
| Content classification, text overlay extraction | Agent, advisory |
| Music rights, likeness, suitability | **Human, blocking** |

### The YouTube swap problem

A YouTube link is not a fixed asset. Its owner can replace the video **after approval**
— same URL, different content — which is a bait-and-switch straight onto the homepage.

| Mitigation | Detail |
| --- | --- |
| Snapshot at approval | Title, duration, thumbnail hash and channel id are stored |
| Re-check every 6 hours | Any change to duration or thumbnail hash **pulls the slot immediately** and re-queues it |
| Channel binding | The video must belong to a channel the organiser has verified |
| Upload is preferred | Direct upload carries no swap risk; the price is identical either way |

The 6-hour window is a compromise. It is not zero, and the honest position is that
**upload is the safer product** — so the UI presents it first and the pricing gives
YouTube no advantage.

### Consent, because an embed is a third party

A YouTube embed sets third-party cookies and reports to Google before any interaction.
Under GDPR that needs consent, and a homepage that fires it on load is non-compliant.

**Embeds load in `youtube-nocookie` mode behind a poster image, and the player is only
instantiated on click.** Uploaded video is served from our own CDN and has no such
problem — another reason to prefer it.

### Performance: ten videos must not cost the landing page

Ten eagerly-loaded videos would destroy Largest Contentful Paint on the platform's most
important page.

| Rule | Detail |
| --- | --- |
| Poster images only on first paint | WebP, sized, `fetchpriority` on the first slot alone |
| No player instantiated until viewport + interaction | Zero video bytes above the fold |
| One preload maximum | The visible slot; never the whole carousel |
| Carousel is CSS-driven | Scroll-snap, no JS layout thrash |
| Reduced motion | `prefers-reduced-motion` disables auto-advance entirely |

**The section is below the hero, never in it.** The hero is what the platform is for; a
paid carousel above it sells the top of the page and buys a worse first impression.

### Playback

| Rule | Why |
| --- | --- |
| Muted by default | Unrequested audio is the fastest way to lose a visitor |
| Captions required on upload | Accessibility, and most viewing is muted anyway |
| Manual advance, or 8-second auto-advance on poster | Never auto-advance a playing video |
| Clear "Ad" label on every slot | It is a paid placement and must say so |

The label is not optional and not subtle. An advertising carousel that looks like
editorial recommendation is a dark pattern, and it also converts worse — visitors who
feel misled do not buy tickets.

### Reporting

Impressions, plays, 25/50/75/100% completion, click-through, and attributed orders via
`campaign_attribution` with `source = 'homepage_video'` (`08` §8.15a). The advertiser
sees exactly what they bought.

**Impressions are counted on 50% visibility for 1 second**, the IAB standard — not on
render. Counting an impression for a slot that never entered the viewport is charging
for something that did not happen.

---

## M25 — Content, SEO & Organic Growth Engine

**Status:** `NEW`. Ranking is won with inventory nobody else has, not with volume.

### The opportunity is programmatic, not editorial

TicketRoyality holds something most content sites do not: **real, structured, changing
inventory**. Every event, venue, organiser, city and category is a page that is
genuinely unique, genuinely useful, and updates itself.

| Page type | Scale | Uniqueness |
| --- | --- | --- |
| `/events/[slug]` | One per event | Real data — date, price, venue, availability |
| `/[city]/[category]` | ~2,000 | Live listings, live prices |
| `/[city]/this-weekend` | ~200 | Regenerates daily |
| `/venues/[slug]` | One per venue | Capacity, seat map, upcoming, past |
| `/organisers/[slug]` | One per organiser | Verified profile, history |
| `/[category]/near-me` | ~500 | Geo-resolved |

**This is where the traffic is**, and none of it requires generating an article. A page
listing eleven real events in Manchester this Saturday, with prices and availability,
beats any essay about Manchester nightlife — because it answers the query the person
actually typed.

### Editorial content is small, reviewed, and genuinely useful

| Type | Cadence | Review |
| --- | --- | --- |
| City guides | ~1 per city per quarter | Human edit, always |
| Organiser interviews | Weekly | Human, plus subject approval |
| Data pieces — "what the UK paid for gigs in 2026" | Monthly | Human, from our own data |
| Event previews | On demand, organiser-requested | Human |

`seo.v1` drafts, researches and updates. **A human publishes.** Nothing reaches the
index unreviewed.

### Two things this module will not do

**It will not mass-publish AI articles.** Google's scaled content abuse policy targets
exactly that pattern — large volumes of generated pages made primarily to rank rather
than to help. The penalty is site-wide, not page-level, and it would take the
programmatic pages above down with it. Those pages are the actual asset.

Ten reviewed articles that earn links beat a thousand that trigger a manual action.

**It will not buy, exchange or farm backlinks.** Paid links, private blog networks and
reciprocal-link schemes are link spam under Google's policies. The realistic outcome is
a manual action against the domain — the same domain the ticket checkout runs on.

Links are **earned**, and the platform has unusually good material to earn them with:

| Asset | Who links to it naturally |
| --- | --- |
| Free public event listings for venues and councils | Venues, tourist boards, local press |
| Annual ticket-pricing data report from our own data | Journalists, trade press |
| Embeddable "what's on" widget for venue sites | Every venue that uses it |
| Organiser profile pages | Organisers, from their own sites |
| Free tools — capacity calculator, seat-map preview | Industry blogs, forums |

The widget is the highest-yield of these: a venue embedding a live listings block links
back from every page it appears on, and it does so because the widget is useful to
them.

### Internal linking is automated, and this part is entirely legitimate

Dynamic internal links between related events, same-city listings, same-organiser
events, same-category and same-venue pages. This is site architecture, not link
building — it distributes authority, helps crawlers, and helps humans.

| Rule | Detail |
| --- | --- |
| Relevance-scored | Semantic similarity via pgvector (`06` §6.13), not random |
| Bounded | Maximum 8 contextual internal links per page |
| Anchor variation | Natural phrasing, never repeated exact-match |
| No links to expired events | 410 or redirect to the category, never a dead page |
| Refreshed | Nightly, as inventory changes |

### Technical SEO, which is where most of the win actually is

| Control | Implementation |
| --- | --- |
| Structured data | `Event`, `Offer`, `Place`, `Organization` JSON-LD on every event page |
| Rich results | Price, availability, date, and venue eligible for the events carousel |
| Core Web Vitals | LCP < 2.0s, INP < 200ms, CLS < 0.1 — and M24 exists to protect this |
| Sitemaps | Segmented by type, `lastmod` accurate, auto-submitted |
| Canonicals | One canonical per event; city and category pages self-canonical |
| Expired events | 410 after 30 days, with a link to the category — never soft-404 |
| International | `hreflang` for en-GB and fr-CD |
| Render | Server-rendered. Content never depends on client JS |

**The events rich result is the single highest-leverage item on this list.** Correct
`Event` JSON-LD puts date, price and availability directly into the search result, and
Google surfaces it in a dedicated events carousel above ordinary results.

### Social

| Surface | Approach |
| --- | --- |
| Open Graph and Twitter cards | Auto-generated per event, with the real cover image |
| Share images | Rendered server-side: title, date, venue, price — legible at thumbnail size |
| Short-form video | The organiser's M24 ad, re-cut vertically for Reels and TikTok |
| Organiser toolkit | Pre-sized assets and copy the organiser posts from **their own** accounts |

**The organiser's audience is the distribution channel.** They have the followers and
the credibility; the platform's job is to make posting trivial, not to compete for the
same attention.

### `seo.v1` — the agent

Full contract in `03` §3.4. Scopes are `read:catalogue`, `write:draft_content`,
`write:internal_links`, `write:metadata`. **It cannot publish**, and it holds no scope
that touches an external site — because there is no legitimate automated action to take
on somebody else's domain.

---

## M26 — Referral & Influencer Programme

**Status:** `NEW`.

### Fan referral

| Property | Value |
| --- | --- |
| Reward | Both sides — referrer and referred |
| Referrer gets | Credit toward their next ticket, released **after the friend attends** |
| Referred gets | A discount on their first order |
| Attribution | Unique link or code, `campaign_attribution` (`08` §8.15a) |
| Cap | 10 successful referrals per person per 30 days |

**Reward on attendance, not purchase.** Rewarding at checkout pays out on orders that
get refunded, and it is the obvious self-referral loop. Scanned at the door means the
event happened and a real person went.

### Influencer programme — 1% for 10,000+ followers

| Tier | Followers | Commission | Terms |
| --- | --- | --- | --- |
| **Creator** | 10,000+ | **1% of attributed GMV** | Self-serve, automatic approval on verification |
| **Partner** | 100,000+ | 2%, negotiable | Manual review, contract |
| **Ambassador** | Invitation | Negotiated + fee | Contract, exclusivity optional |

Commission is on **attributed gross ticket value**, paid monthly in arrears, minimum
payout £25, and it comes out of the platform's commission — not the organiser's net.
An organiser whose margin is reduced by a promotion they did not agree to will disable
it, which is the same rule sub-promoters follow in `04` M18.

### Follower count is verified, not declared, and it is the weaker signal

Follower counts are trivially bought. A 10,000-follower threshold with no verification
is an invitation to a market in cheap accounts.

| Check | Purpose |
| --- | --- |
| OAuth to the platform account | Proves ownership, not just a screenshot |
| Follower count via platform API | Read directly, never typed in |
| **Engagement rate** | The real signal — under 1% on a 10k account indicates purchased followers |
| Audience geography | Must overlap markets we actually sell in |
| Account age and posting history | New accounts with high counts are re-checked |
| Periodic re-verification | Monthly; tier can fall as well as rise |

**Engagement rate gates the tier, not follower count alone.** 10,000 followers at 4%
engagement is worth more than 100,000 at 0.2%, and the second is usually purchased.

### Disclosure is a legal requirement, not a courtesy

In the UK the ASA requires paid partnerships to be clearly identifiable; the US FTC
requires the same. A commission arrangement is a material connection.

| Rule | Enforcement |
| --- | --- |
| `#ad` or the platform's paid-partnership label on every post | Term of the programme |
| Non-disclosure detected | First: warning and education. Second: removal and forfeit |
| Platform-generated copy ships **with** the disclosure | We never supply undisclosed copy |
| Influencer terms state it plainly | Accepted at signup, versioned |

We hold the commission relationship, so an undisclosed post is a problem for the
platform as well as the creator. Making disclosure the default in every asset we hand
over is cheaper than policing it afterwards.

### Fraud controls

| Vector | Control |
| --- | --- |
| Self-referral | Payment instrument, device fingerprint and address matching |
| Cookie stuffing | Attribution requires a genuine click with a referrer, not an impression |
| Refund farming | Commission accrues on attendance, claws back on refund |
| Bot traffic | Seon device intelligence (`06` §6.16) on referred sessions |
| Attribution hijack | Last-touch within 7 days, and a creator cannot overwrite a promoter's earlier touch inside 24h |

Commission is **held for 14 days after the event** before payout, which is the window in
which chargebacks and refunds surface. Paying out before that window closes means
clawing money back from someone who has already spent it.

### Gen-Z product design, stated concretely

Not a tone of voice — a set of measurable properties.

| Property | Requirement |
| --- | --- |
| Mobile-first | Every flow designed at 390px first; desktop is the adaptation |
| Checkout speed | Ticket bought in **under 30 seconds** from event page, Apple/Google Pay first |
| No forced account | Guest checkout; the account is offered after, not demanded before |
| Video-first discovery | Vertical, muted, swipeable — M24 assets re-cut |
| Wallet-native | Apple and Google Wallet by default, not as an afterthought |
| Social proof | "14 friends going", where the fan has opted into social graph |
| Dark mode | Default on mobile, not an option buried in settings |
| Share is one tap | Pre-rendered share image, no app switching |
| Price honesty | Total shown up front, fees itemised, never revealed at the last step |
| Reduced friction over persuasion | No countdown pressure, no fake scarcity |

**The last two are the ones that matter most with this audience.** Fake urgency and
surprise fees are the most-mocked patterns in ticketing, and the demographic least
willing to tolerate them is the one being targeted here. Being visibly straight about
price is a differentiator against every incumbent named in `01` §1.3.
