# 08 — Database Schema

## 8.1 Entity relationship diagram

```
                          ┌──────────┐
                          │  users   │
                          └────┬─────┘
       ┌───────────────────────┼───────────────────────┐
       │ organizerId           │ userId                │ uid
       ▼                       ▼                       ▼
  ┌─────────┐            ┌──────────┐           ┌──────────────┐
  │ events  │            │ tickets  │           │wallet_ledger │
  └────┬────┘            └────┬─────┘           └──────────────┘
       │                      │
       │ eventId              │ orderId
       ├──────────────┐       ▼
       ▼              ▼   ┌────────┐
  ┌─────────┐   ┌────────┐│ orders │
  │  tiers  │   │seat_map│└───┬────┘
  └────┬────┘   └────────┘    │
       │                      │ paymentId
       │ tierId               ▼
       │                 ┌──────────┐
       └────────────────▶│ payments │
                         └────┬─────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
              ┌──────────┐       ┌───────────┐
              │ refunds  │       │ disputes  │
              └──────────┘       └───────────┘

  ┌──────────┐   ┌───────────┐   ┌──────────────────┐
  │ coupons  │   │  holds    │   │ offline_payments │
  └──────────┘   └───────────┘   └──────────────────┘

  ── AI-OS additions ──
  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐
  │ agent_runs   │  │ agent_memory  │  │ escalations  │
  └──────────────┘  └───────────────┘  └──────────────┘
  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐
  │  audit_log   │  │  merchants    │  │ settlements  │
  └──────────────┘  └───────────────┘  └──────────────┘
```

## 8.2 Conventions

| Convention | Rule |
| --- | --- |
| Ids | Firestore auto-id, except where a natural key exists (`events/{slug}`) |
| Money | **Always minor units, always integer.** `2500` = £25.00. Never floats |
| Currency | ISO 4217, stored alongside every amount, never assumed |
| Timestamps | ISO 8601 UTC strings for portability; `serverTimestamp()` for ordering |
| Soft delete | `deletedAt` on user-facing records; hard delete only on legal erasure |
| Denormalisation | Deliberate, and every duplicated field is listed in §8.13 |
| Audit fields | `createdAt`, `updatedAt`, `createdBy`, `updatedBy` on every mutable collection |

**The money rule is not stylistic.** Floating-point currency arithmetic produces
reconciliation failures that are found weeks later by an accountant, not by a test.

## 8.3 `users`

| Field | Type | Index | Notes |
| --- | --- | --- | --- |
| `uid` | string (doc id) | PK | Firebase Auth uid |
| `email` | string | ✅ | Unique, lowercased |
| `fullName` | string | | |
| `userType` | enum | ✅ | `customer` \| `organiser` \| `superuser` |
| `status` | enum | ✅ | `pending` \| `approved` \| `suspended` |
| `dateOfBirth` | string | | ISO date; age gate ≥ 13 |
| `phone` | string | | E.164 |
| `address` | map | | line1, line2, city, postcode, country |
| `createdAt` | string | ✅ | |
| `companyName` | string | | Organiser only |
| `website` | string | | Organiser only |
| `bio` | string | | Organiser only |
| `logoUrl` / `coverUrl` | string | | Organiser branding |
| `socials` | map | | facebook, instagram, twitter |
| `commissionPercent` | number | | **Admin-writable only** — override |
| `adminFee` | number | | **Admin-writable only** — minor units |
| `wallet` | map | | **Admin/server-writable only** |
| `welcomeBonusGranted` | boolean | | Idempotency flag for the $1 grant |
| `kycStatus` | enum | ✅ | `none` \| `pending` \| `verified` \| `failed` |
| `riskTier` | enum | ✅ | `A` \| `B` \| `C` \| `D` |
| `mfaEnabled` | boolean | | Required for `superuser` |
| `deletedAt` | string | | Soft delete |

**Composite indexes:** `(userType, status)` · `(userType, createdAt DESC)`

**Security:** self-read; organisers publicly readable; superuser reads all.
`userType`, `status`, `commissionPercent`, `adminFee`, `wallet` and
`welcomeBonusGranted` are unwritable by the subject. *(Implemented as
`noPrivilegedFields()` in `firestore.rules`.)*

## 8.4 `events`

| Field | Type | Index | Notes |
| --- | --- | --- | --- |
| `id` | string (doc id) | PK | |
| `title` | string | ✅ | |
| `description` | string | | |
| `category` / `categoryGroup` | string | ✅ | Group-scoped — names repeat across groups |
| `imageUrl` | string | | |
| `date` | string | ✅ | ISO 8601, event start |
| `endDate` | string | | |
| `eventType` | enum | ✅ | `physical` \| `online` \| `livestream` |
| `location` | string | ✅ | |
| `country` | string | ✅ | |
| `coordinates` | geopoint | ✅ | Geohash-indexed for radius search |
| `onlineLink` | string | | Online events |
| `streamDetails` | map | | streamUrl, streamKey (**never client-readable**), chatEnabled |
| `price` | number | ✅ | Minor units, cheapest tier — denormalised for sorting |
| `currency` | string | | ISO 4217 |
| `capacity` | number | | |
| `organizerId` | string | ✅ | → `users.uid` |
| `organizerName` | string | | Denormalised |
| `speakers` | array | | |
| `recurrence` | map | | frequency, endDate |
| `featured` | boolean | ✅ | Paid placement |
| `status` | enum | ✅ | `draft` \| `published` \| `cancelled` |
| `venueId` | string | ✅ | → `venues.id` |
| `embedding` | vector(768) | ✅ | Semantic search |
| `createdAt` / `updatedAt` | string | ✅ | |

**Composite indexes:**
`(status, date ASC)` · `(status, featured, date ASC)` · `(organizerId, date ASC)` ·
`(status, categoryGroup, category, date ASC)` · `(status, eventType, date ASC)`

**`streamKey` must never be exposed to the client.** It is a broadcast credential —
anyone holding it can hijack the stream. It lives in a subcollection
`events/{id}/private/stream` readable only by the owning organiser and the server.

### `events/{eventId}/tiers/{tierId}`

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | |
| `description` | string | |
| `price` | number | Minor units |
| `quantity` | number | Total inventory |
| `sold` | number | Confirmed sales |
| `held` | number | In-checkout reservations |
| `salesStart` / `salesEnd` | string | Optional window |
| `minPerOrder` / `maxPerOrder` | number | Anti-scalping |
| `visibility` | enum | `public` \| `hidden` \| `code_required` |

**`available = quantity − sold − held`.** All three counters are written only inside a
transaction. See §7.3 and the counter-sharding note in §7.7.

### `events/{eventId}/seatmap/current`

Document shape as specified in [04 §M2](./04-platform-modules.md#m2--event-catalogue--inventory).
Versioned; the previous version is retained in `seatmap/history/{version}`.

## 8.5 `tickets`

| Field | Type | Index | Notes |
| --- | --- | --- | --- |
| `id` | string (doc id) | PK | |
| `reference` | string | ✅ | Human-readable, `TR-XXXX-XXXX` |
| `eventId` | string | ✅ | |
| `eventTitle` / `eventDate` / `eventLocation` | — | | Denormalised — a ticket must render if the event is deleted |
| `organizerId` | string | ✅ | |
| `organizerName` | string | | Denormalised |
| `userId` | string | ✅ | |
| `attendeeName` / `attendeeEmail` | string | | Transferable |
| `tierId` / `tierName` | string | | |
| `seat` | string | | e.g. `A12` |
| `price` | number | | Minor units, paid |
| `currency` | string | | |
| `status` | enum | ✅ | `valid` \| `redeemed` \| `refunded` \| `cancelled` \| `transferred` |
| `redeemedAt` | string | | |
| `redeemedBy` | string | | Operator id |
| `purchasedAt` | string | ✅ | |
| `orderId` | string | ✅ | |
| `paymentProvider` | enum | | `stripe` \| `bitripay` \| `offline` \| `free` |
| `qrSecret` | string | | **Server-only.** Rotating-QR HMAC secret |
| `transferredFrom` | string | | Provenance chain |

**Composite indexes:**
`(userId, purchasedAt DESC)` · `(organizerId, purchasedAt DESC)` ·
`(eventId, status)` · `(eventId, seat)`

**Security:** readable by the buyer, the event's organiser, and superusers. The only
permitted client update is `valid → redeemed`, by the owning organiser, touching
`status` and `redeemedAt` only. *(Implemented in `firestore.rules`.)*

**Denormalisation is deliberate here.** A ticket must render correctly at the door
even if the event document is unavailable, and must remain a valid legal record after
the event is deleted.

## 8.6 `orders`

| Field | Type | Index | Notes |
| --- | --- | --- | --- |
| `id` | string (doc id) | PK | |
| `userId` | string | ✅ | |
| `items` | array | | `{ eventId, tierId, quantity, unitPrice, seat? }` |
| `subtotal` / `discount` / `fees` / `total` | number | | Minor units |
| `currency` | string | | |
| `couponCode` | string | | |
| `status` | enum | ✅ | `pending` \| `paid` \| `failed` \| `refunded` \| `partially_refunded` |
| `paymentId` | string | ✅ | |
| `ticketIds` | array | | Issued on payment success |
| `createdAt` / `paidAt` | string | ✅ | |

## 8.7 `payments`

| Field | Type | Index | Notes |
| --- | --- | --- | --- |
| `id` | string (doc id) | PK | |
| `orderId` | string | ✅ | |
| `provider` | enum | ✅ | `stripe` \| `bitripay` \| `offline` |
| `providerRef` | string | ✅ | Session / intent / token |
| `amount` / `currency` | | | Minor units |
| `status` | enum | ✅ | See the state machine in [04 §M4](./04-platform-modules.md#m4--payments--checkout) |
| `idempotencyKey` | string | ✅ **unique** | Prevents double-charge |
| `riskScore` | number | | From `fraud.v3` |
| `providerEvents` | array | | Raw webhook payloads, for dispute evidence |
| `createdAt` / `capturedAt` / `settledAt` | string | ✅ | |

**`idempotencyKey` carries a unique constraint.** It is the single most important index
in the schema: without it, a retried webhook charges a customer twice.

## 8.8 `wallet_ledger`

Append-only. **No client may write to it — `create/update/delete: if false`.**

| Field | Type | Index | Notes |
| --- | --- | --- | --- |
| `id` | string (doc id) | PK | |
| `uid` | string | ✅ | |
| `type` | enum | ✅ | `WELCOME_BONUS` \| `TOPUP_STRIPE` \| `ADMIN_GRANT` \| `AI_SPEND` \| `REVERSAL` |
| `deltaAcu` | number | | Signed |
| `balanceBeforeAcu` / `balanceAfterAcu` | number | | Full trail |
| `amountUsd` | number | | Purchases |
| `providerCostUsd` | number | | `AI_SPEND` |
| `markupMultiplier` | number | | `AI_SPEND` — 3 |
| `userChargeUsd` | number | | `AI_SPEND` |
| `reference` | map | | stripeSessionId, adminUid, agentRunId |
| `reason` | string | | Required for `ADMIN_GRANT` |
| `idempotencyKey` | string | ✅ **unique** | |
| `createdAt` | string | ✅ | |

**Invariant, asserted in the transaction:** `balanceAfterAcu = balanceBeforeAcu +
deltaAcu`, and `balanceAfterAcu ≥ 0`. A wallet can never go negative. The ledger is
the truth; `users.wallet.balanceAcu` is a denormalised cache that must reconcile
exactly. A nightly job asserts this and pages on mismatch.

## 8.9 `agent_runs`

| Field | Type | Index | Notes |
| --- | --- | --- | --- |
| `id` | string (doc id) | PK | |
| `agentId` | string | ✅ | `growth.v4` |
| `principalId` | string | ✅ | Who it acted for |
| `triggerId` / `triggerType` | string | ✅ | |
| `parentRunId` | string | ✅ | Chain lineage |
| `chainDepth` | number | | Max 5 |
| `modelId` / `promptHash` | string | ✅ | Reproducibility |
| `inputs` / `outputs` | map | | PII-redacted |
| `toolCalls` | array | | `{ tool, input, output, scopeCheck, durationMs }` |
| `decision` | enum | | `acted` \| `proposed` \| `escalated` \| `denied` \| `failed` |
| `autonomyLevel` | enum | | L0–L3 |
| `approvedBy` | string | | For L1 |
| `costAcu` | number | ✅ | |
| `durationMs` | number | | |
| `reversible` | boolean | | |
| `reversedAt` / `reversedBy` | string | | |
| `createdAt` | string | ✅ | |

**Composite indexes:** `(agentId, createdAt DESC)` · `(principalId, createdAt DESC)` ·
`(decision, createdAt DESC)`

This collection is what makes the agent layer auditable and therefore trustable. Every
row answers: which agent, on whose behalf, with which model and prompt, calling which
tools, producing what, approved by whom, at what cost, and can it be undone.

## 8.10 `agent_memory`

| Field | Type | Index | Notes |
| --- | --- | --- | --- |
| `id` | string (doc id) | PK | |
| `principalId` | string | ✅ | **Partition key — enforced on every read** |
| `layer` | enum | ✅ | `episodic` \| `semantic` \| `procedural` |
| `content` | string | | |
| `embedding` | vector(768) | ✅ | Semantic layer |
| `sourceRunId` | string | ✅ | Provenance |
| `confidence` | number | | |
| `projectedOutcome` / `actualOutcome` | map | | Calibration data |
| `supersededBy` | string | | Revision chain |
| `createdAt` / `expiresAt` | string | ✅ | |

**Isolation:** every read is pre-filtered on `principalId`. Procedural memory is the
only layer that crosses tenants, and only in k-anonymised form (k ≥ 5). This is
enforced at the retrieval layer, never by prompt instruction — a model cannot be
trusted to respect a tenancy boundary it can see.

Storing both `projectedOutcome` and `actualOutcome` is what lets `governance.v1`
measure calibration. An agent that is consistently over-optimistic is detectable and
correctable; one that never records its projections is not.

## 8.11 `escalations`

| Field | Type | Index | Notes |
| --- | --- | --- | --- |
| `id` | string (doc id) | PK | |
| `agentRunId` | string | ✅ | |
| `principalId` | string | ✅ | |
| `reason` | enum | ✅ | `low_confidence` \| `scope_denied` \| `budget` \| `policy` \| `sensitive_intent` \| `threshold` |
| `severity` | enum | ✅ | |
| `costOfInactionMinor` | number | ✅ | Drives Command Centre ranking |
| `proposedAction` | map | | |
| `status` | enum | ✅ | `open` \| `approved` \| `rejected` \| `expired` |
| `slaDeadline` | string | ✅ | |
| `resolvedBy` / `resolvedAt` | string | | |
| `createdAt` | string | ✅ | |

## 8.12 `audit_log`

Immutable. Written by the server only. Exported to BigQuery, retained 7 years.

| Field | Type | Index | Notes |
| --- | --- | --- | --- |
| `id` | string (doc id) | PK | |
| `actorId` | string | ✅ | User or agent |
| `actorType` | enum | ✅ | `user` \| `agent` \| `system` |
| `actingAs` | string | ✅ | Impersonation |
| `action` | string | ✅ | `ticket.refund`, `user.suspend` |
| `resourceType` / `resourceId` | string | ✅ | |
| `before` / `after` | map | | Change delta |
| `ip` / `userAgent` | string | | |
| `traceId` | string | ✅ | Ties to distributed traces |
| `createdAt` | string | ✅ | |

**Reads of PII are logged, not only writes.** "Who viewed this customer's record" is a
question a regulator will ask, and the only acceptable answer is a precise one.

## 8.13 Denormalisation register

Every duplicated field, with its source of truth and reconciliation strategy. A
register that is not maintained becomes a source of silent drift.

| Field | Lives in | Source of truth | Reconciliation |
| --- | --- | --- | --- |
| `events.organizerName` | events | `users.companyName` | On organiser rename, batch update |
| `events.price` | events | `min(tiers.price)` | On tier write |
| `tickets.event*` | tickets | events | **Never** — a frozen legal record |
| `tickets.organizerName` | tickets | users | **Never** — frozen at issuance |
| `users.wallet.balanceAcu` | users | `Σ wallet_ledger.deltaAcu` | Nightly assert; page on mismatch |
| `tiers.sold` | tiers | `count(tickets where tierId)` | Hourly assert |

## 8.14 Access control matrix

| Collection | Customer | Organiser | Door operator | Superuser | Server |
| --- | --- | --- | --- | --- | --- |
| `users` | R own, W own (non-privileged) | R own + public organisers | — | RW all | RW |
| `events` | R published | RW own | R one (scoped) | RW all | RW |
| `tiers` | R published | RW own | — | RW all | RW |
| `tickets` | R own | R own events, W `valid→redeemed` | W `valid→redeemed` (one event) | RW all | RW |
| `orders` | R own | R own events | — | RW all | RW |
| `payments` | R own | R own events (redacted) | — | R all | RW |
| `wallet_ledger` | **R own** | **R own** | — | **R all** | **W only** |
| `coupons` | R (auth required) | RW own | — | RW all | RW |
| `offline_payments` | R own, C own (`pending`) | — | — | RW all | RW |
| `agent_runs` | R own | R own | — | R all | W |
| `agent_memory` | — | — | — | R all | RW |
| `audit_log` | — | — | — | R all | W only |

`R` read · `W` write · `C` create · `—` no access.

**The two rows that matter most:** `wallet_ledger` and `audit_log` are
**server-write-only** for every principal including superusers. An administrator who
can silently edit the audit log is not an administrator, and a platform where credit
can be minted from a client is not a platform.

## 8.15 Migration policy

1. **Additive first.** New optional fields, deployed and backfilled before any reader
   depends on them.
2. **Dual-write during transition.** Write both shapes; read the new; verify; then stop
   writing the old.
3. **Never destructive in a single release.** Removing a field is always a separate,
   later deploy than removing its last reader.
4. **Versioned documents** where the shape changes materially (the seat map is
   `version: 2`), with lazy up-conversion on read.
5. **Every migration is reversible** or it does not ship.
