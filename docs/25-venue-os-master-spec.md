# 25 · VENUE OS™ master developer specification — filed with reconciliation

> Third document of 18 Aug (§1–42 received; continuation expected). Implementation-ready
> in form, but **it specifies collections and schemas parallel to ones already live and
> carrying money**. CLAUDE.md §3 (never rebuild what works) and §7 (no destructive
> migrations) govern: concepts are adopted incrementally onto the running system, never
> as a big-bang re-model. STATUS.md remains the truth of what exists.

## The reconciliation table (spec concept → this codebase)

| Spec | Here, today |
| --- | --- |
| §1 six-way never-merge (seat ≠ category ≠ type ≠ price ≠ inventory ≠ access) | Held: label / section→tier / attendeeType / resolveMix+fees / holds+locks+counters / zones |
| §2 core example (A10 Adult + A11 Child, one order) | Built (phase 2 + §8 UX) |
| §3/§51 module map | Exists as server modules behind one deployable; microservice topology declined (docs/24 part 3) |
| §4 tech principles | Already the stack; "critical ops server-side" is already the law here |
| §5 tenancy | organizerId scoping + rules; enforced in firestore.rules, tested |
| §6/§10/§16 venueSeats + per-seat eventInventory docs | **Not adopted as stored docs.** Seats are derived from sectionRows/seatPositions (geometry is computed, not stored); per-seat status is locks + tickets + counters. A stored per-seat inventory row per event is the phase-4 venue split's decision to make, not before |
| §8 layout versioning, safety lock | Queued (docs/24 near-term; spec §28–29 of doc 2) |
| §13 TicketType | `AttendeeType` on tiers (+ sales windows already on tiers) |
| §18–19 pricing rules pipeline | tier × attendeeType × coupons × fees engine; N-dimensional rule table deferred until a real pricing need exceeds it |
| §20 EntitlementRule | **Built today** — companion rules on attendee types, enforced in resolveMix (see STATUS) |
| §21–23 holds | Built (checkout_holds, TTL, sweep, ownership-checked release) |
| §24–27 allocation/orphans | Built (bestAvailable, orphansCreated, preventOrphans) |
| §28 Seat AI generates constraints, never reserves | Agreed — matches the AI-proposes/engine-decides contract used everywhere here |
| §29 group bookings, split pay | Queued behind a deliberate money design (docs/24 §31) |
| §30 tables | Hospitality packages; per-chair sale open |
| §31 accessibility relationships | Partial (held-back seats); companion linkage open |
| §32–36 canvas builder, generators, renderer split | Phase 3, next after the near-term queue |
| §37–39 selector flows A and B | Built |
| §40–41 orders/orderItems | Stripe sessions + payment_events + per-ticket records serve this; a first-class orders collection is a reporting refactor, not a prerequisite |
| §42 allocations with auto-release | Queued (docs/24 §35) |

## Part 2 of the spec (§43–59) — reconciliation

| Spec | Here |
| --- | --- |
| §43 production kill | **Built the day it arrived** — kill list (stage-manager ranges), unsold block instantly on the section, sold become idempotent reseat cases with distinct same-tier suggestions, resolved through the box-office move, holder emailed (`ticket.reseated`, mandatory). Emulator 6/6. Polygon selection waits for the phase-3 canvas; the seat list is the workflow either way |
| §44 reseat records | Cases + `seatMovedAt`/`upgradedAt` on tickets; a first-class seat_moves ledger is a reporting refactor |
| §45 upgrade engine flow | Built previously — exactly this sequence |
| §46 resale | Policy before code (unchanged) |
| §47–48 zone hierarchy, per-ticket entitlements | Zones are flat and tier-driven; hierarchy + per-ticket overrides open |
| §49 gate routing | Queued ("access graph lite") |
| §50 scanner device registry | Open — today any organiser-authenticated phone scans; device trust is a real hardening item, queued |
| §51 scan ledger | Partial (redemptions, offline sync reports); a unified scan_events ledger open |
| §52 anti-passback | Built for zones (in/out, occupancy); ticket-level INSIDE/OUTSIDE at the main gate open |
| §53–55 credentials, rotating QR, offline | Built — this section describes the existing system |
| §56 fraud engine | The known `sentinel.ts` gap: detection logic exists, nothing feeds it. Wiring it to scan/login telemetry is the queued fix; the blog draft stays held until then |
| §57 command centre | Queued (display over data already recorded) |
| §58–59 heatmaps, Seat DNA | Wait for telemetry, as before |

## Part 3 of the spec (§60–75) — reconciliation

| Spec | Here |
| --- | --- |
| §60 AI venue import | Queued phase-2/3 (vision models via the existing gateway; needs the canvas to edit the result). Human review + never-auto-publish accepted as the contract |
| §61 AI venue validator | **Built the day it arrived** as a pure function, no AI needed for the deterministic half: duplicate labels across sections (one chair sold twice under one name), tier capacity vs mapped seats (over = error, under = warning), phantom held-back seats, overlapping shaped geometry. Runs live in the organiser's preview while they type; empty list = green light. 37/37 seating tests |
| §62–65 agent prompts | The contracts they specify — draft-only, AI-proposes-engine-decides, advisory-only, never touching money — are already the working rules of room-draft, event-draft and the platform generally. Filed as prompt references for when those agents are built |
| §66–68 routes/components | Exist under this codebase's own routes and names (builder = section editor + shapes; command centre queued). The spec's naming is not adopted retroactively |
| §69 non-colour seat states | Titles + dashed held-back existed; screen-reader labels now carry state ("B4, sold") with aria-pressed on selection |
| §70–75 API surface | The public v1 API exists for events; the full venue/inventory/booking API surface is the phase-4 SDK business, unchanged |

## Part 4 of the spec (§76–90) — reconciliation

| Spec | Here |
| --- | --- |
| §76 webhook events | **Extended the day it arrived**: `ticket.transferred`, `seat.moved`, `seat.upgraded` join the delivered set, emitted after their transactions commit — a webhook is a consequence, and a slow endpoint must not hold a transaction open. `seat.held`/`hold_expired` deliberately refused: a webhook per hold on a busy on-sale is a firehose that tells integrators nothing an inventory read does not |
| §77–79, §81 state machines | Describe the built systems (holds, payments, tickets, kills). §79's ENTERED→EXITED at the main gate remains the queued anti-passback item |
| §80 layout versioning | Queued (with §28–29 of doc 2) |
| §82–83 role matrix | Platform roles are customer/organiser/superuser; fine-grained org roles (box office, scanner, finance) belong to phase 4's multi-seat organisations |
| §84 audit | Partial by domain (bid trail, upgrade_events, reseat cases, comms log); a unified audit_log queued |
| §85 performance tiers | The SVG path serves small/medium; Canvas/WebGL waits for a venue that needs it |
| §86 real-time inventory | **Built the day it arrived**: seat locks stream read-only (they carry a label and an opaque hold id, nothing about a person — rules-tested), unioned with the fetched sold list so a held seat greys out across every open map in seconds and sold seats never flicker |
| §87 idempotency | Already the platform's signature move (document-id create-once everywhere money or attendance lands) |
| §88 error codes | Reasons exist per service; a cross-service code registry is a docs task, low priority |
| §89 core-seating acceptance | **All nine boxes now pass**, the last (real-time map) closed by §86 above |
| §90 builder acceptance | Straight/curved/arc, generators-by-spec, draft flow: pass. Manual placement, rotate, tables-on-canvas, multi-select, mirror, undo/redo, publish/version: the phase-3 canvas, next |

## Part 5 of the spec (§91–115) — reconciliation

The closing part: five acceptance lists, the fifteen-module build order, and the agent
instruction. Scored honestly against the repo, box by box.

### §91 event inventory

| Box | State |
| --- | --- |
| Venue layout reused across events | **Phase 4** — the venue/event split. Today a layout lives on its event |
| One event blocks seats without touching a venue master | Satisfied trivially today (the event owns its seating); becomes a real requirement only after the split, where it is the split's central design rule |
| Inventory statuses event-specific | Pass — locks, tickets and counters are all keyed by eventId |
| GA capacity counters | Pass — unseated tiers sell by `sold`/`heldBack` counters |
| Reserved + GA coexist | Pass — seated and unseated tiers on one event |
| Tables + seats coexist | Hospitality packages sell tables alongside seated tiers; tables as canvas objects = phase 3 |
| Sponsor/promoter allocations | Partial — `unavailableSeats` holds seats back; *named* allocations with auto-release are the next build item (§104) |
| Production kill | **Pass** — built, tested 6/6 |

### §92 family/group

Pass: party request (2 adults + 2 children), adjacent search, per-seat type
assignment ("who sits where"), companion rules, configurable orphan prevention.
Open: wheelchair-companion linkage (§31, unchanged), cross-row fallback when one row
cannot fit the party, and a human-readable "why these seats" explanation.

### §93 transactions

**Pass, and already proven in the emulator** — the A10 race is literally a test:
concurrent holds leave exactly one winner, the loser gets `seat-taken` as a 409
(retryable, nothing wrong with the request), and two paid orders for one seat are
impossible twice over — the lock document id *is* the seat, and issuance is idempotent
by provider event id.

### §94 reseating

Pass throughout, with one box satisfied differently by design: quotes and eligible
alternatives, new seat held before anything moves, price difference collected before
the move lands, old seat back on sale, `upgrade_events` as the audit trail. "Old
credential invalidated / new issued" — the credential here never encoded the seat, so
the ticket and its rotating code survive the move untouched. That is stronger, not
weaker: a reseated holder's phone keeps working without a re-download.

### §95 access

Pass: signature check, duplicate rejection, wrong-event rejection, zone rules, revoked
tickets, offline validation and later sync, zone-level re-entry. Open, both already
queued: ticket-level INSIDE/OUTSIDE at the main gate (§52/§79), and the scanner device
registry so the audit record names a trusted device (§50).

### §96 security

Pass on all boxes but one: QR carries no personal data, credentials are HMAC-signed
and verified, ticket status/inventory/issuance/refunds are server-only, tenants are
isolated in rules (tested), admin actions role-gated. The partial: "critical
modifications audited" is true per domain (bids, upgrades, reseats, comms) — the
*unified* audit_log is queued (§84).

### §97–111 module order → this codebase

| Module | State |
| --- | --- |
| 01 Foundation | Built (types, org scoping, rules, shared utilities) |
| 02 Venue Engine | **Phase 4** — the venue/event split with version management |
| 03 Venue Builder | **Phase 3** — canvas: manual placement, rotate, multi-select, undo/redo |
| 04 Event Layout Engine | Follows 02; today event-owns-layout covers it |
| 05 Ticket Types & Pricing | Built — the mandatory A10-Adult/A11-Child test passes in `pricing.test.ts` |
| 06 Hold Engine | Built, concurrency-tested |
| 07 Customer Seat Selector | Built (desktop + mobile, live map) |
| 08 Allocation Engine | **Next** — reserve/release exist as held-back seats; named allocations + auto-release now |
| 09 Family / Best Available | Built (scoring explanation open) |
| 10 Accessibility | Partial — held-back accessible seats; companion linkage open |
| 11 Reseating & Upgrade | Built |
| 12 Access Engine | Built minus device trust + main-gate anti-passback (queued) |
| 13 Command Centre | Queued — a display over data already recorded |
| 14 AI Venue Engine | Its own precondition ("only after deterministic services are stable; AI calls existing services, no parallel AI logic") is already this platform's standing contract |
| 15 Revenue Intelligence | Waits for telemetry — models before data is the 16-articles mistake |

### §112–113 the agent instruction and the non-negotiables

Filed as confirmation, not as new law: §112 is CLAUDE.md restated (inspect before
writing, reuse, server decides, idempotency, audit, never rebuild what works), and
§113's three forbidden fields already cannot exist here — there is no `seat.price`
(price = tier × attendee type × fee engine), no permanent `seat.ticketType` (the type
sits on the ticket sold, not the chair), and no `seat.sold` flag anywhere (sold =
counters + locks + ticket documents, per event).

### §114–115 product model and success

The Royal-branded module map is filed as vocabulary; code keeps its own names
(docs/24 decision). Of §115's seventeen success steps, thirteen work today; the four
open are the known queue: canvas geometry (phase 3), venue reuse (phase 4),
promoter/sponsor allocations (next), command centre (queued).

## Standing decisions

1. No parallel collections. New vocabulary lands as fields and modules on the live
   model, or waits for phase 4's venue/event split where a real migration is designed.
2. Every adopted piece ships with emulator tests and a STATUS row, same as everything
   else today.
3. §112/§113 are adopted as *confirmation* of existing law (CLAUDE.md), not a second
   rulebook. Where the two texts differ in wording, CLAUDE.md remains the one that
   binds.
