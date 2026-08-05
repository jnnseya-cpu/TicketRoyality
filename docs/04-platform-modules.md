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
