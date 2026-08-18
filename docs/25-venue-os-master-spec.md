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

## Standing decisions

1. No parallel collections. New vocabulary lands as fields and modules on the live
   model, or waits for phase 4's venue/event split where a real migration is designed.
2. Every adopted piece ships with emulator tests and a STATUS row, same as everything
   else today.
