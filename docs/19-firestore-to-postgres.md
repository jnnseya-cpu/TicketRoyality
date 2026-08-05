# 19 — Migration: Firestore → PostgreSQL

## 19.1 What this document is for

`08` specifies the target schema. This one specifies how to get there **without a
maintenance window, without losing a ticket, and with a working rollback at every
step.**

The platform sells tickets and admits people at doors. Both paths must stay up
throughout. A migration that requires "we'll be down Sunday 02:00–06:00" is a migration
that runs during someone's event.

---

## 19.2 The invariant that governs every phase

> At no point may the system be unable to answer, authoritatively:
> **who owns this ticket, and has it been used?**

Every decision below follows from that. It is why writes go to both stores before reads
move, why the door is the last thing to migrate and the first thing to roll back, and
why the cutover is per-table rather than big-bang.

---

## 19.3 Phase 0 — Prepare (2 weeks, no production change)

| Task | Done when |
| --- | --- |
| Provision Postgres 16 with `pgcrypto`, `pgvector`, `citext` | Instance up, PITR configured, restore rehearsed |
| Apply the `08` schema | All 20 tables, constraints, indexes present |
| Write the RLS policy suite | Every policy has a permit test **and** a deny test |
| Build the repository interface | `shared/data/repositories.ts` split behind one interface, two impls |
| Backfill harness | Idempotent, resumable, checksum-verified |

### The repository interface is the whole enabler

The shipped `shared/data/repositories.ts` already concentrates every read and write in
one module — `getEvents`, `createTicket`, `redeemTicket` and the rest. That was worth
doing for testability and now pays a second time: the migration touches **one file's
implementation**, not 43 routes.

```ts
export interface DataStore {
  getEventById(id: string): Promise<Event | null>;
  createTicket(input: NewTicket): Promise<Ticket>;
  redeemTicket(id: string, by: string): Promise<RedeemResult>;
  // …the existing 24 functions, unchanged in signature
}
```

Three implementations: `FirestoreStore`, `PostgresStore`, and `DualWriteStore` that
wraps both. Selected per-collection by feature flag, so a rollback is a flag flip
rather than a deploy.

**Signatures do not change.** If this migration requires touching a dashboard page, the
abstraction was wrong and the fix is the abstraction, not the page.

---

## 19.4 Phase 1 — Backfill (2 weeks, read-only against production)

```
Firestore ──export──▶ GCS ──transform──▶ Postgres (shadow)
                                │
                                ▼
                        checksum comparison
```

### The transform is not a copy

| Firestore | Postgres | Transform |
| --- | --- | --- |
| `users.uid` | `users.id` | Direct; uid becomes the uuid |
| `users` where `userType='organiser'` | `organisations` + `organisation_members` | **Split.** One org per organiser, owner as sole member |
| `events.organizerId` | `events.organisation_id` | Remap via the org table |
| `events.ticketTiers[]` (array) | `ticket_types` rows | **Explode.** Array → rows |
| `events.featured` (bool) | `events.featured_until` | `true` → `now() + 7 days`, else NULL |
| — | `orders`, `order_items` | **Synthesise** from tickets grouped by buyer + timestamp |
| `tickets` | `tickets` | Direct; `qr_hash = HMAC(reference)` computed at backfill |
| `wallet_ledger` | `wallet_ledger` | Direct, ordered by `createdAt`, recomputing running balances |
| `price: number` (float) | `numeric(14,2)` | **Round once, explicitly**, and record any row where rounding moved the value |

Two rows deserve attention.

**Order synthesis.** The shipped model has no order. Tickets bought together are
reconstructed by grouping on `(userId, eventId, purchasedAt` within 5 seconds`)`.
Imperfect by construction — a buyer who bought twice in five seconds gets one order.
The alternative is one order per ticket, which is wrong more often. The grouping
window and its assumption are recorded in the backfill log.

**Float → numeric.** Every value that changes under rounding is written to a
reconciliation report, and the sum of all deltas must be under £1 across the entire
dataset or the backfill is rejected and the rounding rule revisited.

### Verification gates

The backfill is not "done" when it finishes. It is done when all four pass:

| Gate | Assertion |
| --- | --- |
| Row counts | Per collection, exact match |
| Financial | `Σ postgres.tickets.price = Σ firestore.tickets.price` |
| Ledger | Per user, `balance_acu = Σ delta_acu`, and equal to the Firestore balance |
| Referential | Zero orphans — every ticket has an order, event and organisation |

---

## 19.5 Phase 2 — Dual write (4 weeks)

```
              ┌──────────────────┐
  write ─────▶│ DualWriteStore   │
              └────┬────────┬────┘
                   │        │
       primary ────▼        ▼──── secondary
              Firestore   Postgres
                   │        │
                   │        └──▶ divergence log
  read  ◀──────────┘
```

**Firestore stays authoritative.** Postgres receives every write and serves no reads.

| Rule | Reason |
| --- | --- |
| Primary write fails → whole operation fails | Unchanged behaviour |
| Secondary write fails → **log, alert, do not fail the request** | A Postgres problem must not stop ticket sales |
| Continuous reconciliation, hourly | Divergence found in an hour, not at cutover |

### Exit gate

Four consecutive weeks with:
- Divergence rate < 0.01%, and **zero** divergences on `tickets` or `wallet_ledger`
- p95 Postgres write latency < 50ms
- Every RLS policy test green in CI
- One rehearsed restore from PITR into a scratch instance

---

## 19.6 Phase 3 — Read cutover (6 weeks, per-table)

Reads move one table at a time, in ascending order of blast radius. Each step holds for
a week before the next begins.

| Week | Table | If it breaks |
| --- | --- | --- |
| 1 | `venues`, `seat_maps` | Cosmetic; nobody is blocked |
| 2 | `events`, `ticket_types` | Catalogue degraded; sales continue from cache |
| 3 | `coupons`, `hospitality_packages` | Discounts unavailable; sales continue |
| 4 | `orders`, `payments` | **Money path.** Flag flip back, investigate |
| 5 | `tickets` | **Entitlement.** Flag flip back immediately |
| 6 | `wallet_ledger`, `audit_log` | Reporting only by this point |

### The door goes last, and comes back first

`tickets` reads move in week 5, after the money path has been stable for a full week
under real load. The scanner is the least forgiving surface on the platform: it runs on
someone else's phone, in a field, with a queue forming, and a wrong answer either lets a
duplicate in or turns away a paying customer.

Rollback for `tickets` is a single flag with no data migration, because dual-write is
still running underneath.

### Shadow reads before real reads

For each table, one week **before** its cutover, read from both and compare
asynchronously. Serve the Firestore answer; log any mismatch. A table only cuts over
after seven days of zero mismatches.

This is what turns "we think the data is right" into "we have measured that the data is
right, on production traffic, for a week."

---

## 19.7 Phase 4 — Reverse and retire (3 weeks)

| Step | Action |
| --- | --- |
| 1 | Flip primary: Postgres primary, Firestore secondary. Dual-write continues, reversed |
| 2 | Hold 2 weeks. Rollback is still one flag |
| 3 | Stop writing Firestore. Keep it readable, frozen |
| 4 | Final export to cold storage, retained 7 years for the audit trail |
| 5 | Delete `firestore.rules`, the client SDK dependency, and `DualWriteStore` |

Step 5 is a real deliverable, not tidying. Two authorisation models in one codebase is
a security liability: the next developer will not know which one is enforcing, and one
of them will silently stop being maintained.

---

## 19.8 Effect on the shipped code

| Layer | Change | Size |
| --- | --- | --- |
| `shared/types` | Field renames to snake_case at the boundary; add `Order`, `OrderItem` | Moderate |
| `shared/data/repositories.ts` | New implementation behind the same interface | **This is the migration** |
| `shared/pricing.ts` | Move to integer minor units; `settle()` reads frozen order terms | Small |
| `shared/firebase/client.ts` | Deleted at Phase 4 | — |
| `backend/services/*` | `issueTickets` and `post` finally work — D1 and D2 close | Small, high value |
| `frontend/**` | **None.** Components call repositories, which keep their signatures | Zero |
| `app/api/**` | None beyond the connection pool | Zero |
| `firestore.rules` | Replaced by RLS policies (`08` §8.16) | Deleted at Phase 4 |

The `frontend` row is the return on the layer separation in `14`. A database migration
that does not touch a single component is what that boundary was for.

---

## 19.9 What this closes

| Debt | Where | How |
| --- | --- | --- |
| **D1** Ticket issuance needs Admin SDK | `17` §17.8 | A transaction plus `SECURITY DEFINER` |
| **D2** Ledger entry + balance not atomic | `17` §17.8 | `post_ledger_entry()` — `08` §8.14 |
| **D3** Admin revenue modelled, not measured | `17` §17.8 | `SUM` over `orders` and `payments` |
| **D4** No audit log of admin actions | `17` §17.8 | `audit_log`, hash-chained |
| **D5** Admin self-propagating | `17` §17.8 | `super_admin` split — `02` §2.1 |
| Oversell race | `08` §8.8 | `CONSTRAINT no_oversell` + `FOR UPDATE` |
| Coupon over-redemption | `08` §8.13 | `CONSTRAINT within_usage_limit` |
| Float money | `08` §8.3 | `numeric(14,2)` |
| No partial refunds | `08` §8.9 | `orders` / `order_items` / `refunds` |
| Commission restates history | `08` §8.9 | Terms frozen onto the order |
| Duplicate scans discarded | `08` §8.12 | `scan_logs` records refusals |

Eleven items, of which five are named debt and six were never written down because a
document store gave no obvious place to fix them.

---

## 19.10 Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Backfill drops or duplicates rows | Medium | Checksums per collection; four gates in §19.4 |
| Order synthesis groups wrongly | **High** | Documented assumption; report reviewed before Phase 2 |
| RLS policy weaker than the rule it replaces | Medium | Deny tests per policy, blocking in CI |
| Postgres write latency degrades checkout | Low | Secondary-write failures never fail the request |
| Connection exhaustion under spike | Medium | PgBouncer, pool sized against p99, load-tested at 3× peak |
| Team unfamiliar with Postgres operations | Medium | Rehearsed restore in Phase 0, runbooks before Phase 3 |
| Migration stalls half-done | **High** | Each phase has an exit gate and a rollback; a stalled migration is stable, not broken |

The last row is the one that actually happens. Long migrations get deprioritised when
something urgent arrives. The design tolerates that: every phase is a stable resting
state, and dual-write can run for months without harm.

---

## 19.11 Timeline

```
Phase 0  Prepare        ██                       2 weeks
Phase 1  Backfill         ██                     2 weeks
Phase 2  Dual write         ████                 4 weeks
Phase 3  Read cutover           ██████           6 weeks
Phase 4  Reverse & retire             ███        3 weeks
                                                 ───────
                                                17 weeks
```

Slots into Phase 2 (Beta) of the roadmap in `13`, before the volume that would make it
harder and after the transactional model has stopped changing weekly.

**Do not start it during an on-sale.**
