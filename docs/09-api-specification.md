# 09 — API Specification

## 9.1 Principles

| Principle | Implementation |
| --- | --- |
| Versioned in the path | `/v1/...`. A breaking change means `/v2`, never a silent mutation |
| Predictable | Plural nouns, HTTP verbs, consistent envelopes |
| Paginated by cursor | Offset pagination breaks under concurrent writes |
| Idempotent mutations | `Idempotency-Key` mandatory on every `POST`/`PATCH`/`DELETE` |
| Explicit errors | Every error names the field and states the fix |
| Scoped keys | A key holds the narrowest scope set that works |
| Documented by contract | OpenAPI 3.1 is the source of truth; SDKs and docs are generated |

**Deprecation policy:** 12 months' notice, `Sunset` and `Deprecation` headers on every
response from a deprecated endpoint, and a migration guide published on day one of the
notice period. Partners build businesses on this API; breaking them silently ends the
partner ecosystem permanently.

## 9.2 Base URLs

```
Production   https://api.ticketroyality.com/v1
Sandbox      https://api.sandbox.ticketroyality.com/v1
```

Sandbox is full fidelity: the same code, isolated data, deterministic test fixtures.
A sandbox that behaves differently from production is worse than no sandbox.

## 9.3 Authentication

### API keys (server-to-server)

```http
Authorization: Bearer tr_live_sk_a1b2c3...
```

| Prefix | Environment | Exposure |
| --- | --- | --- |
| `tr_live_sk_` | Production secret | Server only — never ship to a browser |
| `tr_live_pk_` | Production publishable | Safe client-side; read-only public data |
| `tr_test_sk_` | Sandbox secret | Server only |
| `tr_test_pk_` | Sandbox publishable | Safe client-side |

Keys are shown **once** at creation and stored as an Argon2id hash. Rotation issues a
new key with a 24-hour overlap so rotation never causes downtime. Keys are
automatically revoked if detected in a public repository (GitHub secret scanning
partner programme).

### OAuth 2.0 (acting for a user)

Authorization Code + PKCE for third-party apps acting on a user's behalf.

```
GET /oauth/authorize?client_id=...&redirect_uri=...&scope=events:read+tickets:read
                    &state=...&code_challenge=...&code_challenge_method=S256
POST /oauth/token
```

Access tokens live 1 hour; refresh tokens 90 days with rotation. A reused refresh
token revokes the entire chain — the standard detection for a stolen token.

### Scopes

| Scope | Grants |
| --- | --- |
| `events:read` | Read published events |
| `events:write` | Create and update own events |
| `tickets:read` | Read own tickets |
| `tickets:write` | Issue tickets |
| `tickets:redeem` | Scan and redeem |
| `orders:read` | Read own orders |
| `payments:create` | Initiate payments |
| `payments:refund` | Issue refunds |
| `payouts:read` | Read balance and settlements |
| `payouts:write` | Request payouts |
| `analytics:read` | Read own analytics |
| `agents:invoke` | Invoke agents |
| `webhooks:manage` | Manage endpoints |

**Least privilege is enforced at key creation:** the UI defaults to the narrowest set
and requires an explicit action to widen. Every scope beyond `*:read` shows a plain
warning describing what an attacker could do with it.

## 9.4 Conventions

### Response envelope

Success:
```json
{
  "data": { },
  "meta": { "requestId": "req_1a2b3c", "timestamp": "2026-08-05T12:00:00Z" }
}
```

Collection:
```json
{
  "data": [ ],
  "meta": {
    "requestId": "req_1a2b3c",
    "cursor": { "next": "eyJpZCI6...", "hasMore": true },
    "count": 25
  }
}
```

Error:
```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The request could not be processed.",
    "details": [
      { "field": "amount", "issue": "must be a positive integer in minor units", "received": "-500" },
      { "field": "currency", "issue": "must be a 3-letter ISO 4217 code", "received": "pounds" }
    ],
    "docsUrl": "https://docs.ticketroyality.com/errors/VALIDATION_FAILED",
    "requestId": "req_1a2b3c"
  }
}
```

**Every error names the field, the rule and the received value.** This single decision
removes more support load than any documentation page.

### Standard headers

| Header | Direction | Purpose |
| --- | --- | --- |
| `Idempotency-Key` | Request | Required on all mutations; UUIDv4; 24h retention |
| `X-Request-Id` | Both | Tracing; echoed in every response |
| `X-RateLimit-Limit` / `-Remaining` / `-Reset` | Response | Quota state on every response |
| `Retry-After` | Response | On `429` and `503` |
| `Deprecation` / `Sunset` | Response | On deprecated endpoints |

### Pagination

```
GET /v1/events?limit=25&cursor=eyJpZCI6ImV2dF8xMjMifQ
```

Cursor-based, opaque, stable under concurrent writes. `limit` max 100, default 25.

## 9.5 Rate limits

| Tier | Requests/min | Burst | Concurrent |
| --- | --- | --- | --- |
| Sandbox | 60 | 100 | 5 |
| Free | 120 | 200 | 10 |
| Growth | 600 | 1,000 | 50 |
| Scale | 3,000 | 5,000 | 200 |
| Enterprise | Negotiated | — | — |

Per-endpoint overrides where a call is expensive:

| Endpoint | Limit | Why |
| --- | --- | --- |
| `POST /v1/agents/{id}/invoke` | 10/min | Model cost |
| `POST /v1/payments` | 100/min | Fraud surface |
| `POST /v1/tickets/{id}/redeem` | 600/min | Door throughput must not be throttled |
| `GET /v1/analytics/*` | 30/min | Query cost |

Ticket redemption is deliberately the most permissive: rate-limiting the gate creates
a physical queue.

## 9.6 Core endpoints

### Events

| Method | Path | Scope | Notes |
| --- | --- | --- | --- |
| `GET` | `/v1/events` | `events:read` | Filters: `category`, `country`, `near`, `radius`, `from`, `to`, `type`, `free`, `q` |
| `GET` | `/v1/events/{id}` | `events:read` | Includes tiers and availability |
| `POST` | `/v1/events` | `events:write` | Requires an approved organiser |
| `PATCH` | `/v1/events/{id}` | `events:write` | Owner only |
| `DELETE` | `/v1/events/{id}` | `events:write` | Soft delete; blocked if tickets are sold |
| `GET` | `/v1/events/{id}/availability` | `events:read` | Real-time, uncached |
| `POST` | `/v1/events/{id}/publish` | `events:write` | Draft → published |

```http
POST /v1/events
Authorization: Bearer tr_live_sk_...
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000

{
  "title": "Royal Night Live",
  "description": "A stadium spectacular with full VIP hospitality.",
  "category": "Music::Concerts",
  "date": "2026-06-12T19:30:00Z",
  "eventType": "physical",
  "location": "Wembley Stadium, London",
  "country": "United Kingdom",
  "coordinates": { "lat": 51.556, "lng": -0.2796 },
  "currency": "GBP",
  "tiers": [
    { "name": "General Admission", "price": 8900, "quantity": 800, "maxPerOrder": 6 },
    { "name": "VIP & Hospitality", "price": 22500, "quantity": 120, "maxPerOrder": 2 }
  ],
  "status": "draft"
}
```

Note `price` in minor units and `category` group-scoped. Both are validated, and both
produce a named error if wrong.

### Tickets

| Method | Path | Scope | Notes |
| --- | --- | --- | --- |
| `GET` | `/v1/tickets` | `tickets:read` | Filters: `eventId`, `userId`, `status` |
| `GET` | `/v1/tickets/{id}` | `tickets:read` | |
| `POST` | `/v1/tickets` | `tickets:write` | Direct issuance (comps, guest list) |
| `POST` | `/v1/tickets/{id}/redeem` | `tickets:redeem` | **The door endpoint** |
| `POST` | `/v1/tickets/{id}/transfer` | `tickets:write` | Re-issues, voids the original |
| `POST` | `/v1/tickets/{id}/refund` | `payments:refund` | Full or partial |

```http
POST /v1/tickets/tkt_abc123/redeem
{ "eventId": "evt_xyz789", "operatorId": "op_456", "scannedAt": "2026-06-12T19:12:33Z" }
```

```json
{
  "data": {
    "result": "valid",
    "ticket": { "id": "tkt_abc123", "reference": "TR-4KJ9-2QD7",
                "attendeeName": "Jordan Miles", "tierName": "VIP & Hospitality",
                "seat": "B12", "status": "redeemed",
                "redeemedAt": "2026-06-12T19:12:33Z" },
    "zones": ["general", "vip"]
  }
}
```

`result` ∈ `valid` | `already_used` | `wrong_event` | `invalid` | `cancelled`.

**This endpoint always returns `200` with a `result`, never a `4xx` for a bad ticket.**
A door scanner on flaky venue wifi must distinguish "the network failed" from "this
ticket is invalid", and HTTP status codes conflate the two. Reserve non-`2xx` for
genuine transport and auth failures.

### Orders & payments

| Method | Path | Scope |
| --- | --- | --- |
| `POST` | `/v1/orders` | `payments:create` |
| `GET` | `/v1/orders/{id}` | `orders:read` |
| `POST` | `/v1/orders/{id}/pay` | `payments:create` |
| `POST` | `/v1/payments/{id}/refund` | `payments:refund` |
| `GET` | `/v1/payments/{id}` | `orders:read` |

### Analytics

| Method | Path | Scope |
| --- | --- | --- |
| `GET` | `/v1/analytics/sales` | `analytics:read` |
| `GET` | `/v1/analytics/attendance` | `analytics:read` |
| `GET` | `/v1/analytics/funnel` | `analytics:read` |
| `POST` | `/v1/analytics/query` | `analytics:read` |

`POST /v1/analytics/query` is the natural-language endpoint backed by `analyst.v2`.
It **returns the generated SQL alongside the result**, so the caller can verify what
was actually asked. An analytics answer you cannot audit is not an answer.

### Agents

| Method | Path | Scope |
| --- | --- | --- |
| `GET` | `/v1/agents` | `agents:invoke` |
| `POST` | `/v1/agents/{id}/invoke` | `agents:invoke` |
| `GET` | `/v1/agents/runs/{runId}` | `agents:invoke` |
| `POST` | `/v1/agents/runs/{runId}/approve` | `agents:invoke` |
| `POST` | `/v1/agents/runs/{runId}/reverse` | `agents:invoke` |

```http
POST /v1/agents/growth.v4/invoke
{ "input": { "eventId": "evt_xyz789", "budgetMinor": 28000, "channel": "meta" },
  "autonomy": "L1" }
```

```json
{
  "data": {
    "runId": "run_9f8e7d",
    "decision": "proposed",
    "output": {
      "campaign": { "name": "Cardiff Half — lookalike", "budgetMinor": 28000 },
      "projection": { "liftTickets": 112, "netMinor": 351000,
                      "confidence": 0.72, "sampleSize": 3 }
    },
    "approvalUrl": "https://app.ticketroyality.com/approvals/run_9f8e7d",
    "costAcu": 30
  }
}
```

The response carries the projection **and its confidence and sample size**. A number
without a confidence interval invites misplaced trust.

## 9.7 Webhooks

### Events

| Event | Fires when |
| --- | --- |
| `event.published` | An event goes live |
| `event.cancelled` | An event is cancelled |
| `order.paid` | Payment captured |
| `ticket.issued` | A ticket is created |
| `ticket.redeemed` | Scanned at the door |
| `ticket.refunded` | Refund completed |
| `payment.failed` | Payment failed |
| `payout.paid` | Settlement completed |
| `agent.escalated` | An agent needs a human |
| `agent.acted` | An agent acted autonomously |

### Payload & signature

```json
{
  "id": "evt_1a2b3c",
  "type": "ticket.redeemed",
  "apiVersion": "v1",
  "created": 1754400000,
  "data": { "ticketId": "tkt_abc123", "eventId": "evt_xyz789", "result": "valid" }
}
```

```
X-TR-Signature: t=1754400000,v1=5257a869e7bcfd...
```

Signed with HMAC-SHA256 over `{timestamp}.{raw_body}`. Consumers must verify the
signature, reject timestamps older than 5 minutes, and compare in constant time. Every
SDK ships a one-line helper that does all three correctly.

**Retries:** immediate, 5s, 30s, 2m, 10m, 1h, 6h, 24h → dead-letter. Any `2xx` within
5 seconds acknowledges. After 24h of failure the endpoint is disabled and the owner is
alerted in their Command Centre.

**Replay:** `POST /v1/webhooks/{endpointId}/replay` with an event id or a time range.
Consumers are expected to be idempotent on `event.id`; the documentation says so in
the first paragraph, not a footnote.

## 9.8 Error codes

| HTTP | Code | Retry |
| --- | --- | --- |
| 400 | `VALIDATION_FAILED` | No |
| 400 | `MALFORMED_REQUEST` | No |
| 401 | `INVALID_API_KEY` | No |
| 401 | `TOKEN_EXPIRED` | Yes, after refresh |
| 403 | `INSUFFICIENT_SCOPE` | No |
| 403 | `ACCOUNT_SUSPENDED` | No |
| 404 | `RESOURCE_NOT_FOUND` | No |
| 409 | `IDEMPOTENCY_CONFLICT` | No |
| 409 | `INSUFFICIENT_INVENTORY` | No |
| 422 | `BUSINESS_RULE_VIOLATION` | No |
| 422 | `INSUFFICIENT_ACU` | No — top up first |
| 429 | `RATE_LIMITED` | Yes, honour `Retry-After` |
| 500 | `INTERNAL_ERROR` | Yes, with backoff |
| 503 | `SERVICE_UNAVAILABLE` | Yes, with backoff |
| 503 | `DEPENDENCY_UNAVAILABLE` | Yes, with backoff |

**Retryability is documented per code**, so an SDK can implement retry correctly
without the integrator guessing. Guessing produces either duplicate charges or
abandoned orders.

## 9.9 SDKs

| Language | Package | Notes |
| --- | --- | --- |
| TypeScript | `@ticketroyality/sdk` | Fully typed from OpenAPI; works in Node and browser (publishable key only) |
| Python | `ticketroyality` | Sync and async |
| PHP | `ticketroyality/sdk` | Guzzle-based — matches the BitriPay merchant ecosystem |

Every SDK provides: automatic retry with backoff on retryable codes, idempotency key
generation, webhook signature verification, cursor auto-pagination, and typed errors.

## 9.10 Testing

### Deterministic fixtures

| Input | Outcome |
| --- | --- |
| `4242424242424242` | Success |
| `4000000000000002` | Declined |
| `4000000000009995` | Insufficient funds |
| `4000000000003220` | 3DS required |
| `tkt_test_valid` | Redeem → `valid` |
| `tkt_test_used` | Redeem → `already_used` |
| `tkt_test_wrong` | Redeem → `wrong_event` |

### Sandbox behaviour

- Real code paths, isolated data, no real money, no real email or SMS.
- Time travel: `X-TR-Test-Clock` advances the sandbox clock so integrators can test
  event-day flows without waiting for the event day.
- Webhooks delivered to a configurable endpoint, with a full inspector UI.

## 9.11 Acceptance criteria

- OpenAPI 3.1 spec validates and generates all three SDKs without manual patching.
- Every endpoint documented with a runnable example.
- Idempotency: 1,000 concurrent identical `POST`s produce exactly one resource.
- Rate-limit headers present on **every** response, including errors.
- Webhook signature examples verify correctly in all three SDK languages.
- p95 latency < 300ms for reads, < 500ms for writes.
- Sandbox provisioned within 60 seconds of signup.

---

## 9.12 Endpoint reconciliation, and four corrections

The endpoint set below is the specified surface. Four entries differ from the source
outline, each for a reason worth stating.

### Events

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `POST` | `/events` | Organiser | Creates a **draft**. Never publishes |
| `GET` | `/events/:id` | Public | Published only, unless owner or admin |
| `PATCH` | `/events/:id` | Organiser | Partial. Rejected on frozen fields after first sale |
| `GET` | `/events` | Public | Cursor-paginated — see below |
| `POST` | `/events/:id/publish` | Organiser | Runs the pre-publish checklist (`04` M22) |
| `POST` | `/events/:id/cancel` | Organiser | **Replaces `DELETE`** — see below |

### Orders and tickets

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `POST` | `/orders` | Customer | `Idempotency-Key` **required** |
| `POST` | `/orders/:id/pay` | Customer | `Idempotency-Key` **required** |
| `GET` | `/orders/:id` | Customer / Organiser | Organiser view redacts payment instrument |
| `POST` | `/orders/:id/refund` | Organiser | Line-item scoped; policy-checked |
| `POST` | `/tickets/:id/transfer` | Customer | Refused if `transferable = false` |
| `POST` | `/scans` | Gate staff | **Replaces `/tickets/:id/scan`** — see below |

---

### Correction 1 — cancellation is not `DELETE`

The outline has `DELETE /events/:id` triggering an automated refund of every order.
That is the most destructive operation on the platform behind a verb that reads as
routine, is fired by accident in every API client ever built, and carries no body in
which to record a reason.

```
POST /events/:id/cancel
{
  "reason": "Venue withdrew the licence",
  "refund_policy": "full",
  "notify": true,
  "confirm_totals": { "orders": 412, "refund_amount": 1846000, "currency": "GBP" }
}
```

**`confirm_totals` must match what the server computes**, or the request is rejected
with `409 totals_mismatch` and the current figures. The caller has to have looked at
the numbers before the money moves — the same idea as typing a repository name to
delete it, applied to £18,460.

Cancellation returns `202` and a job id. Refunding 412 orders is not a request-scoped
operation, and a mass refund is money movement, so per `01` §1.7 it requires human
confirmation: the endpoint accepts the instruction, an admin releases the batch.

`GET /events/:id/cancel-preview` returns the totals with no side effects, so the
confirmation figures can be fetched honestly.

---

### Correction 2 — scanning is not keyed on a ticket id

`POST /tickets/:id/scan` requires the gate to already know the ticket id, which means
resolving the QR client-side and trusting whatever the device sends. The signature then
verifies nothing.

```
POST /scans
Idempotency-Key: <device-uuid>:<scan-seq>
{
  "qr_payload": "<signed blob>",
  "gate_id": "east-3",
  "device_id": "dev_88a1",
  "scanned_at": "2026-08-05T18:42:11Z",
  "offline": false
}
```

The server verifies the HMAC, extracts the reference, and only then looks anything up.
An unsigned or tampered payload never reaches the database.

**`Idempotency-Key` is mandatory** because offline sync replays scans (`04` M16). A
device reconnecting after a partition resends its queue; without idempotency every
ticket it admitted becomes a duplicate-scan alert.

`scanned_at` is the **device's** time, kept alongside the server's. During a partition
the device clock is the only record of ordering, and the two disagreeing is itself
diagnostic.

Response distinguishes all seven outcomes from `scan_result` (`08` §8.3) — a steward
needs `wrong_gate` and `invalid` to look completely different.

---

### Correction 3 — cursor pagination, not `page` and `limit`

`GET /events?page=3&limit=20` is wrong for a catalogue that gains rows continuously: a
new event published between requests shifts every subsequent page, so a client paging
through sees duplicates and misses others.

```
GET /events?limit=20&cursor=eyJzdGFydHNfYXQiOi4uLn0
→ { "data": [...], "next_cursor": "eyJ...", "has_more": true }
```

The cursor encodes `(starts_at, id)` — stable under insertion, and it maps directly
onto `events_discovery_idx` (`08` §8.7) so deep pages cost the same as shallow ones.
`OFFSET 10000` reads and discards ten thousand rows.

---

### Correction 4 — refunds are line-scoped and policy-checked

`{amount, reason}` cannot express "refund one of the three tickets on this order", which
is the common case. It also lets a caller name any amount.

```
POST /orders/:id/refund
{
  "items": [{ "order_item_id": "...", "quantity": 1 }],
  "reason": "customer_request",
  "override_policy": false
}
```

The server computes the amount from the items and the order's frozen terms
(`08` §8.9). `override_policy: true` is admin-only and always audited — an organiser
refunding outside their own published policy is a decision someone should be able to
find later.

---

### Applies to every mutating endpoint

| Rule | Detail |
| --- | --- |
| `Idempotency-Key` | Required on order creation, payment and scans; accepted everywhere else |
| Replay | Returns the original response. Never creates a second resource |
| Rate limits | Per key and per principal, at the gateway |
| Errors | `{ error: { code, message, details? } }` — codes are stable, messages are not |
| Versioning | `/api/v1`; breaking changes get `/v2`, with both live through a deprecation window |
| Webhooks | HMAC-SHA256 over `timestamp.body`, **reject beyond 5 minutes** (`20` §20.6) |
