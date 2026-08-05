# 08 — Database Schema (PostgreSQL)

## 8.1 Decision record

**Target: PostgreSQL 16 with Row-Level Security.** Supersedes the Firestore model.

| | Firestore (live today) | PostgreSQL (target) |
| --- | --- | --- |
| Authorisation | `firestore.rules` | Row-Level Security policies |
| Money | Client-side floats | `numeric`, in the database |
| Multi-row atomicity | Batched writes, limited | Real transactions |
| Reporting | Export to BigQuery | Direct SQL |
| Referential integrity | None — convention only | Foreign keys |
| Aggregate correctness | Denormalised counters, drift-prone | Constraints |

### Why the move is correct rather than merely preferred

Three defects in the shipped system are **structural to a document store**, not
implementation mistakes:

1. **The ledger and the balance cannot be written atomically.** `17` §17.5 records this
   as debt D2: an ACU grant must append to `wallet_ledger` and update `users.wallet`
   together or neither. Firestore can batch, but the invariant
   `balance = Σ ledger.delta` is not enforceable by the database. In Postgres it is a
   transaction plus a constraint.

2. **Inventory oversell is a race.** `availableInTier()` reads `quantity - sold - held`
   and decides. Two simultaneous buyers of the last seat read the same value and both
   proceed. Postgres has `SELECT … FOR UPDATE` and `CHECK (sold + held <= quantity)`; a
   document store has optimistic retries and hope.

3. **Money is floating point.** `price: number` in `src/shared/types` is an IEEE 754
   double. `0.1 + 0.2 !== 0.3` is not an acceptable property of a system that settles
   payouts.

### What does not change

The **security model is preserved exactly.** Every predicate in `firestore.rules` that
docs `15`–`17` quote has an RLS equivalent in §8.16, and the invariants hold
identically: no privilege escalation, tickets redeem in one direction only, clients
never write the ledger.

**Firestore remains authoritative until cutover completes.** The path is `19`. Until
its Phase 3 lands, this file describes the target and `14`–`17` describe the running
system. That divergence is deliberate, dated and tracked — not drift.

---

## 8.2 Entity relationship diagram

```
                    ┌──────────────┐
                    │    users     │
                    └──┬────┬────┬─┘
        owns           │    │    │           holds
     ┌─────────────────┘    │    └───────────────────┐
     ▼                      │                        ▼
┌─────────────┐             │ places        ┌────────────────┐
│organisations│             │               │  wallet_ledger │
└──┬───┬───┬──┘             ▼               │  (append-only) │
   │   │   │          ┌──────────┐          └────────────────┘
   │   │   └─────────▶│  orders  │
   │   │              └────┬─────┘
   │   ▼                   ▼
   │ ┌────────┐      ┌───────────┐
   │ │ events │─────▶│order_items│
   │ └─┬────┬─┘      └─────┬─────┘
   │   │    │              │
   │   │    ▼              ▼
   │   │ ┌──────────────┐ ┌─────────┐     ┌──────────┐
   │   │ │ ticket_types │▶│ tickets │────▶│scan_logs │
   │   │ └──────────────┘ └─────────┘     └──────────┘
   │   ▼
   │ ┌──────────────────────┐        ┌──────────┐
   │ │ hospitality_packages │        │ payments │──▶ refunds
   │ └──────────────────────┘        └──────────┘
   │
   ├──▶ payouts          ┌────────┐
   └──▶ coupons          │ venues │──▶ seat_maps
                         └────────┘

   offline_payments ──▶ orders                    (KODA-verified, 06 §6.20)
   agent_runs · agent_memory · audit_log          (cross-cutting, append-only)
```

Twenty tables. The count is higher than the blueprint's fourteen because `orders`,
`order_items`, `refunds`, `organisation_members`, `offline_payments` and
`wallet_ledger` are separated rather than folded into their parents — each is a thing
with its own lifecycle, and merging them is what makes partial refunds and team
accounts unrepresentable.

---

## 8.3 Conventions

| Concern | Rule |
| --- | --- |
| Primary keys | `uuid`, `gen_random_uuid()`. Never sequential — an integer id leaks volume |
| Timestamps | `timestamptz`, always UTC. Never `timestamp` |
| Money | `numeric(14,2)` stored; **integer minor units** across API boundaries |
| Currency | `char(3)`, ISO 4217, on every monetary row. Never inferred |
| Email | `citext` — case-insensitive uniqueness without `lower()` on every query |
| Soft delete | `deleted_at` where history matters. Hard delete for GDPR erasure only |
| Enums | Postgres `enum`. A `text` column with a check is a migration hazard |
| JSONB | Only for genuinely schemaless data — seat geometry, agent payloads. Never for queried fields |
| Audit columns | `created_at`, `updated_at` everywhere; `updated_at` by trigger |

### Enum types

```sql
CREATE TYPE user_role       AS ENUM ('attendee','organiser','venue_manager','promoter',
                                     'hospitality_host','sponsor','developer','merchant',
                                     'support','platform_admin','super_admin','regulator',
                                     'gate_staff');
CREATE TYPE account_status  AS ENUM ('pending','approved','suspended','closed');
CREATE TYPE event_status    AS ENUM ('draft','published','cancelled','completed');
CREATE TYPE event_type      AS ENUM ('physical','online','livestream','hybrid');
CREATE TYPE order_status    AS ENUM ('pending','paid','partially_refunded','refunded','cancelled');
CREATE TYPE ticket_status   AS ENUM ('valid','redeemed','refunded','cancelled','transferred');
CREATE TYPE payment_status  AS ENUM ('pending','authorised','captured','failed','refunded');
CREATE TYPE payment_provider AS ENUM ('stripe','bitripay','mobile_money','offline','free','terminal');
CREATE TYPE ledger_type     AS ENUM ('WELCOME_BONUS','TOPUP_STRIPE','ADMIN_GRANT','AI_SPEND','REVERSAL');
CREATE TYPE scan_result     AS ENUM ('valid','duplicate','invalid','wrong_event','blocked');
CREATE TYPE verification_source AS ENUM ('manual','koda','gateway_webhook');
```

`user_role` carries all thirteen actors from `02` §2.1. Roles are a column, not a
table, because they are a closed set that changes only with a deploy.

---

## 8.4 `users`

```sql
CREATE TABLE users (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 citext NOT NULL UNIQUE,
  phone                 text,
  full_name             text NOT NULL,
  role                  user_role NOT NULL DEFAULT 'attendee',
  status                account_status NOT NULL DEFAULT 'approved',

  date_of_birth         date,
  country               char(2),
  address               jsonb,

  kyc_status            text NOT NULL DEFAULT 'not_started',
  kyc_reference         text,
  loyalty_tier          text NOT NULL DEFAULT 'standard',

  -- Derived from wallet_ledger. See the assertion in 8.14.
  balance_acu           integer NOT NULL DEFAULT 0 CHECK (balance_acu >= 0),
  welcome_bonus_granted boolean NOT NULL DEFAULT false,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);

CREATE INDEX users_role_status_idx ON users (role, status) WHERE deleted_at IS NULL;
CREATE INDEX users_kyc_idx         ON users (kyc_status) WHERE kyc_status <> 'verified';
```

`balance_acu` is `NOT NULL CHECK (>= 0)` at the storage layer. The application cannot
drive it negative even with a bug — the guarantee `buildEntry` asserts in TypeScript,
which therefore holds only where that function is called.

---

## 8.5 `organisations`

```sql
CREATE TABLE organisations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  slug                 citext NOT NULL UNIQUE,
  owner_id             uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  kyb_status           text NOT NULL DEFAULT 'not_started',
  bitripay_merchant_id text,
  koda_account_ref     text,               -- 06 §6.20, direct-payment verification
  subscription_tier    text NOT NULL DEFAULT 'free',

  commission_percent   numeric(5,2),       -- NULL = platform default
  admin_fee            numeric(8,2),       -- NULL = platform default

  website              text,
  bio                  text,
  logo_url             text,
  cover_url            text,
  socials              jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organisation_members (
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_role     text NOT NULL,           -- owner · admin · finance · door · marketing
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, user_id)
);
```

**This table is genuinely new.** The shipped model conflates the organiser with their
company — an event belongs to a `uid`. That makes a two-person promoter impossible and
ownership transfer a data-surgery job. `organisation_members` is the fix, and it is why
`ON DELETE RESTRICT` guards `owner_id`: deleting a user must never orphan events,
tickets and payout history.

`commission_percent` and `admin_fee` are nullable on purpose — NULL means "platform
default", exactly what `commissionTermsFor()` implements today.

---

## 8.6 `venues` and `seat_maps`

```sql
CREATE TABLE venues (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  address     jsonb NOT NULL,
  city        text NOT NULL,
  country     char(2) NOT NULL,
  coordinates point,
  capacity    integer CHECK (capacity > 0),
  owner_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE seat_maps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id    uuid REFERENCES venues(id) ON DELETE CASCADE,
  event_id    uuid,
  version     integer NOT NULL DEFAULT 1,
  sections    jsonb NOT NULL,     -- [{ id, name, color, rows, seatsPerRow }]
  seats       jsonb NOT NULL,     -- flattened, for allocation lookup
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (venue_id IS NOT NULL OR event_id IS NOT NULL)
);

CREATE INDEX venues_geo_idx ON venues USING gist (coordinates);
```

Seat geometry is JSONB because it is genuinely schemaless and always read whole.
**Seat allocation is not** — that lives in `tickets.seat_label` with a unique index, so
double-allocation is a constraint violation rather than a support ticket.

---

## 8.7 `events`

```sql
CREATE TABLE events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  venue_id        uuid REFERENCES venues(id) ON DELETE SET NULL,
  seat_map_id     uuid REFERENCES seat_maps(id) ON DELETE SET NULL,

  title           text NOT NULL,
  slug            citext NOT NULL UNIQUE,
  description     text NOT NULL,
  category_group  text NOT NULL,
  category        text NOT NULL,
  image_url       text,

  event_type      event_type NOT NULL,
  status          event_status NOT NULL DEFAULT 'draft',

  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz,
  timezone        text NOT NULL DEFAULT 'UTC',

  location        text,
  country         char(2),
  coordinates     point,
  online_link     text,
  stream_details  jsonb,

  currency        char(3) NOT NULL,
  capacity        integer CHECK (capacity > 0),

  speakers        jsonb NOT NULL DEFAULT '[]'::jsonb,
  recurrence      jsonb,

  featured_until  timestamptz,
  video_ad_url    text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK (event_type <> 'physical' OR venue_id IS NOT NULL OR location IS NOT NULL)
);

CREATE INDEX events_discovery_idx ON events (status, starts_at) WHERE status = 'published';
CREATE INDEX events_org_idx       ON events (organisation_id, starts_at DESC);
CREATE INDEX events_category_idx  ON events (category_group, category, starts_at)
  WHERE status = 'published';
CREATE INDEX events_geo_idx       ON events USING gist (coordinates);
CREATE INDEX events_search_idx    ON events
  USING gin (to_tsvector('english', title || ' ' || description));
```

Two things the document model could not express:

**`featured_until` replaces `featured boolean`.** A boolean must be unset by a cron job
that might not run; a timestamp expires itself. Promotion sells in 7-day windows
(`16` §16.2), so the expiry *is* the data.

**Full-text search is an index, not a service.** `events_search_idx` removes a connector
dependency entirely below roughly a million events (`01` §1.5.1).

The partial indexes matter: `WHERE status = 'published'` keeps the discovery index
small and hot, because drafts never appear in a catalogue query.

---

## 8.8 `ticket_types`

```sql
CREATE TABLE ticket_types (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name           text NOT NULL,
  description    text,

  price          numeric(14,2) NOT NULL CHECK (price >= 0),
  currency       char(3) NOT NULL,

  quantity       integer NOT NULL CHECK (quantity >= 0),
  sold           integer NOT NULL DEFAULT 0 CHECK (sold >= 0),
  held           integer NOT NULL DEFAULT 0 CHECK (held >= 0),

  min_per_order  integer NOT NULL DEFAULT 1 CHECK (min_per_order >= 1),
  max_per_order  integer NOT NULL DEFAULT 10,
  sale_starts_at timestamptz,
  sale_ends_at   timestamptz,

  is_hospitality boolean NOT NULL DEFAULT false,
  position       integer NOT NULL DEFAULT 0,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT no_oversell CHECK (sold + held <= quantity),
  CHECK (max_per_order >= min_per_order),
  CHECK (sale_ends_at IS NULL OR sale_starts_at IS NULL OR sale_ends_at > sale_starts_at)
);

CREATE INDEX ticket_types_event_idx ON ticket_types (event_id, position);
```

### `CONSTRAINT no_oversell` is the single most valuable line in this file

`availableInTier()` computes `quantity - sold - held` and the application decides. Under
concurrency two buyers read the same number and both proceed. The document store cannot
stop them.

Here, overselling is a **constraint violation**. The transaction that would push
`sold + held` past `quantity` aborts. Not "usually", not "if the retry logic is right"
— the database refuses.

Purchase takes the row lock:

```sql
BEGIN;
  SELECT quantity, sold, held FROM ticket_types WHERE id = $1 FOR UPDATE;
  UPDATE ticket_types SET held = held + $2 WHERE id = $1;   -- aborts on oversell
  INSERT INTO orders (...) VALUES (...);
COMMIT;
```

`held` is released by a scheduled job when the checkout window expires, or converted to
`sold` on payment capture.

---

## 8.9 `orders` and `order_items`

```sql
CREATE TABLE orders (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference          text NOT NULL UNIQUE,
  user_id            uuid REFERENCES users(id) ON DELETE SET NULL,
  event_id           uuid NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  organisation_id    uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,

  status             order_status NOT NULL DEFAULT 'pending',

  subtotal           numeric(14,2) NOT NULL CHECK (subtotal >= 0),
  discount           numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  service_fee        numeric(14,2) NOT NULL DEFAULT 0 CHECK (service_fee >= 0),
  total              numeric(14,2) NOT NULL CHECK (total >= 0),
  currency           char(3) NOT NULL,

  coupon_id          uuid,
  buyer_email        citext NOT NULL,
  buyer_name         text NOT NULL,

  -- Commission frozen at purchase. Renegotiating terms must not restate history.
  commission_percent numeric(5,2) NOT NULL,
  admin_fee          numeric(8,2) NOT NULL,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CHECK (total = subtotal - discount + service_fee)
);

CREATE TABLE order_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  ticket_type_id uuid NOT NULL REFERENCES ticket_types(id) ON DELETE RESTRICT,
  quantity       integer NOT NULL CHECK (quantity > 0),
  unit_price     numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  line_total     numeric(14,2) NOT NULL,
  CHECK (line_total = unit_price * quantity)
);

CREATE INDEX orders_user_idx  ON orders (user_id, created_at DESC);
CREATE INDEX orders_event_idx ON orders (event_id, created_at DESC);
CREATE INDEX orders_org_idx   ON orders (organisation_id, created_at DESC);
```

**`orders` does not exist in the shipped model** — the ticket is currently both the
entitlement and the purchase record. That conflation makes a partial refund
unrepresentable and a multi-item basket a set of unrelated documents.

**Commission is frozen onto the order.** When an admin renegotiates a rate
(`17` §17.6 F2), yesterday's settled orders must not silently restate. The shipped
`settle()` reads current terms and recomputes history — correct while terms never
change, wrong the first time they do.

`CHECK (total = subtotal - discount + service_fee)` makes arithmetic drift impossible
to persist.

---

## 8.10 `tickets`

```sql
CREATE TABLE tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference       text NOT NULL UNIQUE,
  qr_hash         text NOT NULL UNIQUE,     -- HMAC-SHA256, never the raw reference

  order_id        uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  ticket_type_id  uuid NOT NULL REFERENCES ticket_types(id) ON DELETE RESTRICT,
  event_id        uuid NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  user_id         uuid REFERENCES users(id) ON DELETE SET NULL,

  holder_name     text NOT NULL,
  holder_email    citext NOT NULL,

  seat_label      text,
  price           numeric(14,2) NOT NULL,
  currency        char(3) NOT NULL,

  status          ticket_status NOT NULL DEFAULT 'valid',
  redeemed_at     timestamptz,
  redeemed_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  gate_id         text,
  transferred_to  uuid REFERENCES users(id) ON DELETE SET NULL,

  -- Frozen event details. Denormalised deliberately: a ticket is a legal record of
  -- what was sold, not a live view of what the event is now. See 8.18.
  event_title     text NOT NULL,
  event_starts_at timestamptz NOT NULL,
  event_location  text,
  organiser_name  text NOT NULL,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CHECK ((status = 'redeemed') = (redeemed_at IS NOT NULL))
);

CREATE UNIQUE INDEX tickets_seat_unique_idx
  ON tickets (event_id, seat_label)
  WHERE seat_label IS NOT NULL AND status IN ('valid','redeemed');

CREATE INDEX tickets_user_idx  ON tickets (user_id, event_starts_at DESC);
CREATE INDEX tickets_event_idx ON tickets (event_id, status);
CREATE INDEX tickets_qr_idx    ON tickets (qr_hash);
```

Three guarantees that were application logic before:

| Guarantee | Mechanism |
| --- | --- |
| A seat is sold once | `tickets_seat_unique_idx`, a partial unique index |
| `redeemed` implies a timestamp | `CHECK ((status='redeemed') = (redeemed_at IS NOT NULL))` |
| A ticket never outlives its order | `ON DELETE RESTRICT` |

`qr_hash` is stored and the raw reference is not encoded in the QR. An HMAC means a
reference read off a printed ticket cannot be turned into a valid scan without the
signing key.

### The redeem operation

The four-condition rule from `16` §16.3 becomes one statement whose `WHERE` clause is
the authorisation:

```sql
UPDATE tickets
   SET status = 'redeemed', redeemed_at = now(), redeemed_by = $staff, gate_id = $gate
 WHERE id = $ticket
   AND status = 'valid'      -- never re-redeem, never revive a refund
   AND event_id = $event     -- scoped to the door being worked
 RETURNING id;
```

Zero rows means refused, and the caller reads the row to distinguish *why* — the four
outcomes in `16` §16.5. Only `status`, `redeemed_at`, `redeemed_by` and `gate_id` are
written; RLS in §8.16 enforces that against a hostile client.

---

## 8.11 `payments`, `refunds`, `payouts`

```sql
CREATE TABLE payments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  provider            payment_provider NOT NULL,
  provider_ref        text,
  idempotency_key     text NOT NULL UNIQUE,

  amount              numeric(14,2) NOT NULL CHECK (amount > 0),
  currency            char(3) NOT NULL,
  fx_rate             numeric(18,8),          -- frozen; 06 §6.14
  status              payment_status NOT NULL DEFAULT 'pending',

  fraud_score         numeric(5,2),
  device_id           text,

  -- Direct-to-number verification. 06 §6.20
  verification_source verification_source,
  verified_at         timestamptz,
  verification_ref    text,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refunds (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id   uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  ticket_id    uuid REFERENCES tickets(id) ON DELETE SET NULL,
  amount       numeric(14,2) NOT NULL CHECK (amount > 0),
  currency     char(3) NOT NULL,
  reason       text NOT NULL,
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  provider_ref text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payouts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  amount          numeric(14,2) NOT NULL CHECK (amount > 0),
  currency        char(3) NOT NULL,
  status          text NOT NULL DEFAULT 'requested',
  provider        text NOT NULL,
  provider_ref    text,
  period_start    timestamptz NOT NULL,
  period_end      timestamptz NOT NULL,
  scheduled_at    timestamptz,
  paid_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end > period_start)
);

CREATE UNIQUE INDEX payments_provider_ref_idx
  ON payments (provider, provider_ref) WHERE provider_ref IS NOT NULL;
```

**`idempotency_key UNIQUE` is the double-charge defence.** A retried webhook, a
double-clicked button and a network retry all carry the same key; the second insert
fails. In the shipped system this is prevented by the webhook handler being careful.

`verification_source` records **how** we know a payment landed: `gateway_webhook` for
collected payments, `koda` for direct-to-number verification (`06` §6.20), `manual` for
the admin queue. The three are operationally different and get confused the moment they
share a column value.

---

## 8.12 `scan_logs`

```sql
CREATE TABLE scan_logs (
  id           bigserial PRIMARY KEY,
  ticket_id    uuid REFERENCES tickets(id) ON DELETE SET NULL,
  event_id     uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  scanned_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  gate_id      text,
  device_id    text,
  result       scan_result NOT NULL,
  scanned_at   timestamptz NOT NULL DEFAULT now(),
  offline_sync boolean NOT NULL DEFAULT false
);

CREATE INDEX scan_logs_event_time_idx ON scan_logs (event_id, scanned_at DESC);
CREATE INDEX scan_logs_ticket_idx     ON scan_logs (ticket_id);
```

**Every scan is logged, including the refusals.** A duplicate-scan attempt is the
highest-value fraud signal the platform generates, and the shipped system discards it —
it refuses the scan and moves on.

`offline_sync` marks entries reconciled after an offline door session (`04` M16). Two
`valid` scans for one ticket where one is `offline_sync` is a partition artefact; two
online ones is an incident.

`bigserial` rather than `uuid`: highest-volume table, append-only, always queried by
event and time.

---

## 8.13 `coupons`, `offline_payments`, `hospitality_packages`

```sql
CREATE TABLE coupons (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            citext NOT NULL,
  organisation_id uuid REFERENCES organisations(id) ON DELETE CASCADE,
  event_id        uuid REFERENCES events(id) ON DELETE CASCADE,
  discount_type   text NOT NULL CHECK (discount_type IN ('percentage','fixed')),
  amount          numeric(14,2) NOT NULL CHECK (amount > 0),
  usage_limit     integer NOT NULL CHECK (usage_limit > 0),
  usage_count     integer NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  starts_at       timestamptz,
  expires_at      timestamptz NOT NULL,
  scope           text NOT NULL DEFAULT 'organiser',
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT within_usage_limit CHECK (usage_count <= usage_limit),
  CHECK (discount_type <> 'percentage' OR amount <= 100)
);

CREATE UNIQUE INDEX coupons_code_org_idx ON coupons (organisation_id, code);

CREATE TABLE offline_payments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid REFERENCES orders(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  provider            text NOT NULL,
  payment_number      text NOT NULL,
  reference           text NOT NULL,
  base_amount         numeric(14,2) NOT NULL CHECK (base_amount > 0),
  service_fee         numeric(14,2) NOT NULL CHECK (service_fee >= 0),
  total_amount        numeric(14,2) NOT NULL,
  currency            char(3) NOT NULL,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','denied')),
  verification_source verification_source NOT NULL DEFAULT 'manual',
  reviewed_at         timestamptz,
  reviewed_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (total_amount = base_amount + service_fee),
  CHECK (status = 'pending' OR reviewed_at IS NOT NULL)
);

CREATE TABLE hospitality_packages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  ticket_type_id uuid REFERENCES ticket_types(id) ON DELETE SET NULL,
  host_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  name           text NOT NULL,
  inclusions     jsonb NOT NULL DEFAULT '[]'::jsonb,
  price          numeric(14,2) NOT NULL CHECK (price >= 0),
  currency       char(3) NOT NULL,
  capacity       integer NOT NULL CHECK (capacity > 0),
  deposit_amount numeric(14,2) CHECK (deposit_amount IS NULL OR deposit_amount <= price),
  status         text NOT NULL DEFAULT 'draft',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
```

`CONSTRAINT within_usage_limit` closes a real race: two buyers redeeming the last use
of a coupon simultaneously. `applyCoupon()` checks `usageCount >= usageLimit` in
TypeScript — a read, then a decision, then a write.

`CHECK (status = 'pending' OR reviewed_at IS NOT NULL)` means an approved payment
without a review timestamp cannot exist. The audit trail becomes structural rather than
procedural.

`hospitality_packages` gives the VIP host (`02` §2.1, actor 8) a table of their own,
which is what makes hospitality a first-class inventory type rather than a naming
convention on a tier.

---

## 8.14 `wallet_ledger` — append-only, and provably consistent

```sql
CREATE TABLE wallet_ledger (
  id                 bigserial PRIMARY KEY,
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type               ledger_type NOT NULL,

  delta_acu          integer NOT NULL CHECK (delta_acu <> 0),
  balance_before_acu integer NOT NULL CHECK (balance_before_acu >= 0),
  balance_after_acu  integer NOT NULL CHECK (balance_after_acu  >= 0),

  amount_usd         numeric(14,4),
  provider_cost_usd  numeric(14,6),
  markup_multiplier  numeric(6,2),
  user_charge_usd    numeric(14,4),

  reason             text,
  agent_run_id       uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ledger_balances
    CHECK (balance_after_acu = balance_before_acu + delta_acu),

  CONSTRAINT reason_required_for_manual
    CHECK (type NOT IN ('ADMIN_GRANT','REVERSAL')
           OR (reason IS NOT NULL AND length(reason) > 0))
);

CREATE INDEX wallet_ledger_user_idx ON wallet_ledger (user_id, created_at DESC);

-- Append-only, enforced by the database rather than by convention.
CREATE RULE wallet_ledger_no_update AS ON UPDATE TO wallet_ledger DO INSTEAD NOTHING;
CREATE RULE wallet_ledger_no_delete AS ON DELETE TO wallet_ledger DO INSTEAD NOTHING;
```

Every assertion `buildEntry()` makes in TypeScript becomes a constraint:

| `acu-ledger.ts` assertion | Constraint |
| --- | --- |
| `balanceAfter === balanceBefore + delta` | `ledger_balances` |
| `balanceAfter >= 0` | `CHECK (balance_after_acu >= 0)` |
| `ADMIN_GRANT` / `REVERSAL` need a reason | `reason_required_for_manual` |
| Append-only | `RULE … DO INSTEAD NOTHING` |

The difference is reach. The TypeScript assertion holds where `buildEntry` is called;
the constraint holds against every path including `psql`, a migration script, and a
future service written by someone who never read this file.

### Debt D2, closed

```sql
CREATE OR REPLACE FUNCTION post_ledger_entry(
  p_user_id uuid, p_type ledger_type, p_delta integer, p_reason text
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_before integer; v_id bigint;
BEGIN
  SELECT balance_acu INTO v_before FROM users WHERE id = p_user_id FOR UPDATE;
  IF v_before IS NULL THEN RAISE EXCEPTION 'no such user %', p_user_id; END IF;

  INSERT INTO wallet_ledger (user_id, type, delta_acu, balance_before_acu,
                             balance_after_acu, reason)
  VALUES (p_user_id, p_type, p_delta, v_before, v_before + p_delta, p_reason)
  RETURNING id INTO v_id;

  UPDATE users SET balance_acu = v_before + p_delta WHERE id = p_user_id;
  RETURN v_id;
END $$;
```

One transaction, one row lock, both writes or neither. Insufficient balance raises from
the `CHECK`, so it fails atomically rather than half-applying — which is precisely what
`17` §17.5 says the current stub cannot guarantee.

**Nightly assertion.** The balance must equal the ledger sum; if it does not, something
wrote around the function:

```sql
SELECT u.id, u.balance_acu, COALESCE(SUM(l.delta_acu), 0) AS ledger_sum
  FROM users u LEFT JOIN wallet_ledger l ON l.user_id = u.id
 GROUP BY u.id, u.balance_acu
HAVING u.balance_acu <> COALESCE(SUM(l.delta_acu), 0);
```

Any row returned pages a human.

---

## 8.15 `agent_runs`, `agent_memory`, `audit_log`

```sql
CREATE TABLE agent_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        text NOT NULL,
  agent_version   text NOT NULL,
  principal_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  organisation_id uuid REFERENCES organisations(id) ON DELETE CASCADE,
  trigger         text NOT NULL,
  autonomy_level  text NOT NULL,
  input_hash      text NOT NULL,
  output_summary  text,
  acu_consumed    integer NOT NULL DEFAULT 0 CHECK (acu_consumed >= 0),
  duration_ms     integer,
  outcome         text NOT NULL,
  escalated_to    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agent_memory (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope     text NOT NULL,
  scope_id  uuid NOT NULL,
  layer     text NOT NULL,
  content   text NOT NULL,
  embedding vector(1536),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id            bigserial PRIMARY KEY,
  actor_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_role    user_role,
  action        text NOT NULL,
  resource_type text NOT NULL,
  resource_id   uuid,
  old_value     jsonb,
  new_value     jsonb,
  ip            inet,
  user_agent    text,
  prev_hash     text,
  entry_hash    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agent_runs_agent_idx   ON agent_runs (agent_id, created_at DESC);
CREATE INDEX agent_memory_vec_idx   ON agent_memory USING hnsw (embedding vector_cosine_ops);
CREATE INDEX audit_log_resource_idx ON audit_log (resource_type, resource_id, created_at DESC);

CREATE RULE audit_log_no_update AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
CREATE RULE audit_log_no_delete AS ON DELETE TO audit_log DO INSTEAD NOTHING;
```

`agent_memory.embedding` uses **pgvector**, which is why `06` §6.13 lists it as the
fallback that removes the vector-database category entirely below roughly a million
vectors. One less vendor on the critical path (`01` §1.5.1).

`audit_log` is hash-chained per `12` §12.10: `entry_hash = H(prev_hash ‖ payload)`.
Altering an entry breaks every subsequent link. Combined with the
`DO INSTEAD NOTHING` rules, tampering requires database superuser access and remains
detectable afterwards.

**This closes debt D4** from `17` §17.8 — admin role grants and ACU grants were
previously unattributed.

---

## 8.16 Row-Level Security — `firestore.rules`, translated

Every rule that `15`–`17` quote, preserved. RLS is enabled on every table and the
application connects as a **non-superuser role**, so a bug in application code cannot
bypass a policy.

```sql
ALTER TABLE users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_ledger    ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons          ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_payments ENABLE ROW LEVEL SECURITY;

-- The session principal, set per request from the verified JWT.
CREATE FUNCTION current_uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

CREATE FUNCTION is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM users
                  WHERE id = current_uid()
                    AND role IN ('platform_admin','super_admin')) $$;

CREATE FUNCTION is_org_member(p_org uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM organisation_members
                  WHERE organisation_id = p_org AND user_id = current_uid()) $$;
```

### `users` — `noPrivilegedFields()`

```sql
CREATE POLICY users_select ON users FOR SELECT
  USING (id = current_uid() OR is_admin() OR role = 'organiser');

CREATE POLICY users_update_self ON users FOR UPDATE
  USING (id = current_uid())
  WITH CHECK (
    id = current_uid()
    AND role                  = (SELECT u.role FROM users u WHERE u.id = current_uid())
    AND status                = (SELECT u.status FROM users u WHERE u.id = current_uid())
    AND balance_acu           = (SELECT u.balance_acu FROM users u WHERE u.id = current_uid())
    AND welcome_bonus_granted = (SELECT u.welcome_bonus_granted FROM users u WHERE u.id = current_uid())
  );

CREATE POLICY users_admin_all ON users FOR ALL USING (is_admin());
```

The `WITH CHECK` clause is `noPrivilegedFields()`: a user may update themselves, and any
update that would change their role, status or balance is rejected.

### `events`

```sql
CREATE POLICY events_public_read ON events FOR SELECT
  USING (status = 'published' OR is_admin() OR is_org_member(organisation_id));

CREATE POLICY events_org_write ON events FOR ALL
  USING       (is_org_member(organisation_id) OR is_admin())
  WITH CHECK  (is_org_member(organisation_id) OR is_admin());
```

`is_org_member()` replaces `organizerId == request.auth.uid`. The both-sides ownership
check from `16` §16.1 is `USING` (the row as it is) plus `WITH CHECK` (the row as it
would be) — an event cannot be reassigned to an organisation you do not belong to.

### `tickets` — the four-condition redeem rule

```sql
CREATE POLICY tickets_select ON tickets FOR SELECT
  USING (user_id = current_uid() OR is_org_member(organisation_id) OR is_admin());

CREATE POLICY tickets_redeem ON tickets FOR UPDATE
  USING (
    is_org_member(organisation_id)      -- the door is yours
    AND status = 'valid'                -- never re-redeem, never revive a refund
  )
  WITH CHECK (
    status = 'redeemed'                 -- only this transition
    AND price          = (SELECT t.price          FROM tickets t WHERE t.id = tickets.id)
    AND ticket_type_id = (SELECT t.ticket_type_id FROM tickets t WHERE t.id = tickets.id)
    AND event_id       = (SELECT t.event_id       FROM tickets t WHERE t.id = tickets.id)
    AND user_id        IS NOT DISTINCT FROM
                         (SELECT t.user_id        FROM tickets t WHERE t.id = tickets.id)
  );
```

The `WITH CHECK` clause is the `hasOnly(['status','redeemedAt'])` guarantee: an
organiser scanning a ticket cannot rewrite its price, its owner, its tier or its event
on the way through. `16` §16.3 explains why that is not hypothetical.

### `wallet_ledger` — `if false`, translated

```sql
CREATE POLICY ledger_select ON wallet_ledger FOR SELECT
  USING (user_id = current_uid() OR is_admin());

-- No INSERT, UPDATE or DELETE policy exists. RLS denies by default, so no application
-- role can write this table at all. Writes go through post_ledger_entry(), which is
-- SECURITY DEFINER and owned by a role the application cannot assume.
```

**The absence of a policy is the policy.** This is the exact analogue of
`allow create, update, delete: if false`, and note it applies to admins too — matching
`17` §17.3, where the superuser is the only principal with unrestricted write access
everywhere else and still cannot touch the ledger from a session.

### `offline_payments`

```sql
CREATE POLICY offline_select ON offline_payments FOR SELECT
  USING (user_id = current_uid() OR is_admin());

CREATE POLICY offline_insert_own ON offline_payments FOR INSERT
  WITH CHECK (user_id = current_uid() AND status = 'pending');

CREATE POLICY offline_admin_review ON offline_payments FOR UPDATE
  USING (is_admin());
```

A customer submits a claim pinned to `pending` and can never approve it — `15` §15.6
F3, preserved exactly.

### Testing the policies

RLS policies get the same treatment `firestore.rules` gets in `13` §13.4: a test suite
that asserts both the permit and the deny for every policy, **blocking in CI**. A
security rule with no negative test is an assumption.

---

## 8.17 Access control matrix

| Table | Attendee | Organiser | Gate staff | Platform admin | Super admin | Server |
| --- | --- | --- | --- | --- | --- | --- |
| `users` | R own, W own (non-privileged) | R own + public organisers | — | RW all | RW all | RW |
| `organisations` | R public | RW own | — | RW all | RW all | RW |
| `events` | R published | RW own | R one (scoped) | RW all | RW all | RW |
| `ticket_types` | R published | RW own | — | RW all | RW all | RW |
| `orders` | R own | R own events | — | RW all | RW all | RW |
| `order_items` | R own | R own events | — | R all | R all | RW |
| `tickets` | R own | R own, W `valid→redeemed` | W `valid→redeemed` (one event) | RW all | RW all | RW |
| `payments` | R own | R own events (redacted) | — | R all | R all | RW |
| `refunds` | R own | R own events | — | RW all | RW all | RW |
| `payouts` | — | R own | — | RW all | RW all | RW |
| `scan_logs` | — | R own events | C own gate | R all | R all | RW |
| `coupons` | R (auth) | RW own | — | RW all | RW all | RW |
| `offline_payments` | R own, C own (`pending`) | — | — | RW all | RW all | RW |
| `hospitality_packages` | R published | RW own | — | RW all | RW all | RW |
| `wallet_ledger` | **R own** | **R own** | — | **R all** | **R all** | **W via function only** |
| `agent_runs` | R own | R own | — | R all | R all | W |
| `agent_memory` | — | — | — | — | R all | RW |
| `audit_log` | — | — | — | R all | R all | **W only, append-only** |

`R` read · `W` write · `C` create · `—` no access.

**The two rows that matter most** are unchanged from the Firestore model:
`wallet_ledger` and `audit_log` are server-write-only for every principal including
super admins. An administrator who can silently edit the audit log is not an
administrator, and a platform where credit can be minted from a client is not a
platform.

---

## 8.18 Denormalisation register

| Column | Lives in | Source of truth | Reconciliation |
| --- | --- | --- | --- |
| `tickets.event_title`, `event_starts_at`, `event_location` | tickets | events | **Never** — frozen legal record |
| `tickets.organiser_name` | tickets | organisations | **Never** — frozen at issuance |
| `orders.commission_percent`, `admin_fee` | orders | organisations | **Never** — frozen at purchase |
| `payments.fx_rate` | payments | FX provider | **Never** — frozen at capture |
| `ticket_types.sold` | ticket_types | `count(tickets)` | Hourly assert; `no_oversell` bounds drift |
| `ticket_types.held` | ticket_types | active checkout sessions | Expiry job every 60s |
| `users.balance_acu` | users | `Σ wallet_ledger.delta_acu` | Nightly assert (§8.14); page on mismatch |
| `coupons.usage_count` | coupons | `count(orders)` | Bounded by `within_usage_limit` |

Four of these are marked **Never**, and that is the point: they are not caches, they are
records of what was true at a moment that must not be rewritten when the world moves on.

---

## 8.19 Migration policy

1. **Additive first.** New columns are nullable or defaulted, deployed and backfilled
   before any reader depends on them.
2. **Dual-write during transition.** Write both shapes; read the new; verify; then stop
   writing the old.
3. **Never destructive in a single release.** Dropping a column is always a later
   deploy than removing its last reader.
4. **Versioned JSONB** where the shape changes materially (`seat_maps.version`), with
   lazy up-conversion on read.
5. **Every migration is reversible** or it does not ship.
6. **Constraints are added `NOT VALID` first**, then validated in a separate
   transaction, so a long table scan does not hold an exclusive lock during a deploy.
7. **Indexes are built `CONCURRENTLY`** in production, always.

Rules 6 and 7 have no Firestore analogue and are the two most common ways a Postgres
migration takes production down.

The Firestore → PostgreSQL cutover itself is [`19`](./19-firestore-to-postgres.md).
