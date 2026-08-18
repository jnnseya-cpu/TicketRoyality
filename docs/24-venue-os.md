# 24 · Venue OS — strategy layer over the seat-map engine

> Supplied by the founder on 2026-08-18 (an AI-assisted market analysis against
> Ticketmaster, Eventbrite, Seats.io, vivenu, Tixly, accesso). **A target vision, not a
> description of what exists** — `/STATUS.md` is the truth. docs/23 remains the
> engineering spec this vision extends; where the two overlap, docs/23 governs.

## The thesis

Not "a seat map" but a venue, inventory & access operating system:
Venue → Space → Experience → Inventory → Person → Entitlement → Price → Seat → Access →
Movement → Revenue → Intelligence.

## The 29 proposals, and their honest state at time of filing

**Already built here** (the analysis did not know):
- §14 Self-service seat swap with paid upgrade difference — built the day this arrived
  (`quoteMove`/`applyPaidMove`, webhook-applied, idempotent).
- §19 Offline-first gates — offline manifests, local validation, rotating codes checked
  offline, sync with double-use reporting (`scripts/offline.test.ts`).
- §20 Rotating QR — built (`shared/tickets/rotating`, per-ticket seeds, windows,
  signed static fallback for print).
- §22 Anti-passback — zones with re-entry rules, transactional occupancy, in/out scans.
- §23 Nested access rights — zones name the tiers they admit; a VIP ticket opens the
  doors its tier is assigned to and nothing else.
- §10/§15/§25 concurrency — holds with TTL, atomic seat locks, HELD state, orphan rule.
- Party mixing (§1 of docs/23) — Adult+Child adjacent in one payment, per-seat types.

**Near-term buildable, no new vendor, queued by value:**
- §15 Typed rules on attendee types (child requires adult companion; max children per
  adult) — extends `attendeeTypes` with rules, enforced in `resolveMix`.
- §12 Intelligent hold release — the sweep already runs; add ageing reports on partner
  allocations and a release action. Reporting first, auto-release later.
- §11 Revenue heatmap — the seat map coloured by real sales data the platform already
  holds. Display work over existing numbers.
- §26/§27 Seat equivalence + production kills — `unavailableSeats` exists; add a bulk
  block flow that lists affected sold tickets into the reseat workflow (seat-swap
  service already moves people).
- §28/§29 Map versioning + safety lock — labels are already stable by design
  (`generatedRowNames` doc); formalise as versions with sold-seat guards.
- §17 Access graph lite — per-zone gate recommendation printed on the ticket.

**Needs data that does not exist yet** (build the recorders first, the feature after):
- §9 View scores, §10 Seat DNA, §11's AI recommendations, §12's demand models, §18
  crowd routing — all need per-seat history and telemetry this platform has only
  started collecting. Claiming them before the data exists would repeat the 16-articles
  mistake.

**Vendor-gated or later:**
- §7 AI venue import from PDF/CAD — feasible through the existing AI gateway (vision
  models), a large slice; queued after the phase-3 canvas exists to edit the result.
- §9 360° view-from-seat — needs capture/imagery; no vendor for it in the allowed list.
- §18 push crowd routing — FCM delivery is still unwired (STATUS).
- §16 privacy-preserving entitlement proofs — architecture note accepted; long-term.

## Rule carried over

Every claim about these features on the public site follows STATUS.md discipline: not
described in the present tense until built, tested and verified.
