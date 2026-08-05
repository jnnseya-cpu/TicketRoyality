# 05 — BitriPay Integration Gateway

## 5.1 What this is

Two distinct things share the BitriPay name in this platform, and conflating them
causes architectural mistakes:

1. **BitriPay as a checkout option** — `LIVE` today. TicketRoyality is the merchant;
   attendees pay for tickets through BitriPay. Implemented in
   `src/app/api/bitripay-checkout/route.ts`.
2. **BitriPay as a gateway TicketRoyality resells** — `NEW`. Third-party merchants
   integrate *through* TicketRoyality's gateway. TicketRoyality becomes a payment
   facilitator and earns on volume it does not originate.

This document specifies (2). It is the highest-margin, lowest-marginal-cost revenue
line in the platform, because the infrastructure already exists to serve (1).

## 5.2 Commercial model

| Party | Role | Economics |
| --- | --- | --- |
| Merchant | Accepts payments | Pays the published rate |
| **TicketRoyality** | Payment facilitator | Retains the spread + platform fee |
| BitriPay | Underlying processor | Takes its wholesale rate |

```
Merchant pays        2.4% + £0.20
BitriPay wholesale   1.6% + £0.10
────────────────────────────────────
TicketRoyality       0.8% + £0.10   ← gross spread
```

At £10m annual processed volume: **£80,000 spread + £100,000 in fixed fees** on a
million transactions, against near-zero marginal infrastructure cost.

`OPEN` — the wholesale rate must be confirmed with BitriPay commercially before
publishing the merchant rate card. Owner: Commercial. Due: before Phase 3.

## 5.3 Regulatory position

**This is the single most important section in the document.**

Acting as a payment facilitator is a regulated activity in every jurisdiction that
matters. Before a single external merchant is onboarded:

| Requirement | Detail |
| --- | --- |
| **Licensing** | Payment Institution or Agent status. In the UK: FCA authorisation, or operate as an **agent of an authorised PI** (materially faster and the recommended Phase-3 route) |
| **KYB** | Every merchant verified before processing: incorporation, UBO ≥ 25%, sanctions screening, adverse media |
| **AML** | Transaction monitoring, SAR filing, a named MLRO |
| **PCI-DSS** | SAQ-A only. **Card data never touches our infrastructure** — hosted fields exclusively |
| **Segregation** | Merchant funds in a segregated safeguarding account, never commingled with operating funds |
| **Settlement** | Documented T+N terms, reserve policy, and hold triggers |

**Gate:** no external merchant is onboarded until legal sign-off is recorded, with the
signatory named and dated. This gate is non-negotiable and cannot be waived by
engineering.

## 5.4 Merchant onboarding

```
1. Register          Company details, contact, expected volume, use case
2. KYB               Sumsub/Persona — automated, 80% clear in < 5 min
3. Risk assessment   compliance.v1 + fraud.v3 → risk tier
4. Approval          Auto (low risk) | Manual (medium/high) | Reject
5. Sandbox           Immediate on registration — merchants integrate while KYB runs
6. Go live           Production keys issued on approval
7. Monitoring        Continuous; re-screen on volume threshold breach
```

**Sandbox access is granted at step 1, before approval.** A merchant who cannot start
integrating for three days integrates with a competitor instead.

### Risk tiers

| Tier | Criteria | Settlement | Reserve | Limit |
| --- | --- | --- | --- | --- |
| **A — Low** | Established, clean, < £50k/mo | T+2 | 0% | £250k/mo |
| **B — Medium** | New, or 1–3% chargebacks | T+7 | 5% rolling 90d | £50k/mo |
| **C — High** | > 3% chargebacks, or high-risk MCC | T+14 | 10% rolling 180d | £10k/mo |
| **D — Prohibited** | Sanctioned, illegal, or restricted MCC | — | — | Rejected |

## 5.5 API surface

Base URLs:
```
Sandbox     https://api.ticketroyality.com/gateway/sandbox/v1
Production  https://api.ticketroyality.com/gateway/v1
```

### Authentication

OAuth 2.0 client credentials. Access tokens live 600 seconds.

```http
POST /authentication/token
Content-Type: application/json

{ "client_id": "...", "secret_id": "..." }
```

```json
{
  "message": { "code": 200, "success": ["SUCCESS"] },
  "data": { "access_token": "eyJ...", "expire_time": 600, "scopes": ["payments:create"] },
  "type": "success"
}
```

The envelope deliberately mirrors BitriPay's own response shape, so merchants already
integrated with BitriPay migrate with a base-URL change and nothing else. That is a
meaningful acquisition advantage and worth the small aesthetic cost.

### Create a payment

```http
POST /payment/create
Authorization: Bearer {access_token}
Idempotency-Key: {uuid}

{
  "amount": "100.00",
  "currency": "USD",
  "reference": "ORDER-12345",
  "description": "Order #12345",
  "customer": { "email": "buyer@example.com", "name": "A Buyer" },
  "methods": ["qr", "wallet", "card", "bank_transfer", "mobile_money"],
  "return_url": "https://merchant.example.com/success",
  "cancel_url": "https://merchant.example.com/cancel",
  "notify_url": "https://merchant.example.com/webhooks/bitripay",
  "expires_in": 3600,
  "metadata": { "any": "merchant data" }
}
```

```json
{
  "message": { "code": 200, "success": ["CREATED"] },
  "data": {
    "token": "2zMRmT3KeYT2BWMAyGhqEfuw4tOYOfGX",
    "payment_url": "https://pay.ticketroyality.com/p/2zMRmT3K",
    "qr_code_url": "https://pay.ticketroyality.com/qr/2zMRmT3K.png",
    "expires_at": "2026-08-05T15:30:00Z",
    "status": "pending"
  },
  "type": "success"
}
```

**`Idempotency-Key` is mandatory on every mutating call.** A retried create must never
produce a second charge. Keys are retained 24 hours; a replay returns the original
response with `Idempotency-Replayed: true`.

### Remaining endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/payment/status/{token}` | Poll a payment |
| `POST` | `/payment/{token}/refund` | Full or partial refund |
| `POST` | `/payment/{token}/capture` | Capture a prior authorisation |
| `POST` | `/payment/{token}/void` | Void before capture |
| `GET` | `/payments` | List with filters and cursor pagination |
| `GET` | `/settlements` | Settlement batches |
| `GET` | `/settlements/{id}/transactions` | Line items in a batch |
| `POST` | `/disputes/{id}/evidence` | Submit chargeback evidence |
| `GET` | `/balance` | Available, pending, reserved |
| `POST` | `/payouts` | Request an early payout |

### Error codes

| HTTP | Code | Meaning | Retry? |
| --- | --- | --- | --- |
| 400 | `INVALID_REQUEST` | Malformed or missing field | No |
| 401 | `INVALID_TOKEN` | Expired or bad token | Yes, after re-auth |
| 402 | `PAYMENT_DECLINED` | Issuer declined | No — try another method |
| 403 | `INSUFFICIENT_SCOPE` | Key lacks the scope | No |
| 409 | `IDEMPOTENCY_CONFLICT` | Same key, different body | No |
| 422 | `LIMIT_EXCEEDED` | Over the merchant's volume limit | No |
| 429 | `RATE_LIMITED` | Too many requests | Yes, honour `Retry-After` |
| 500 | `INTERNAL_ERROR` | Our fault | Yes, with backoff |
| 503 | `PROCESSOR_UNAVAILABLE` | Upstream down | Yes, with backoff |

**Every error response names the offending field.** `"INVALID_REQUEST"` alone costs a
merchant an hour; `"amount must be a positive decimal string, received: '-5'"` costs
them ten seconds.

## 5.6 Webhooks

```json
{
  "id": "evt_1a2b3c",
  "type": "payment.succeeded",
  "created": 1754400000,
  "data": {
    "token": "2zMRmT3K",
    "reference": "ORDER-12345",
    "amount": "100.00",
    "currency": "USD",
    "trx_id": "BP2c7sAvw75MTlrP",
    "payer": { "username": "buyer", "email": "buyer@example.com" },
    "metadata": { "any": "merchant data" }
  }
}
```

**Events:** `payment.created` · `payment.succeeded` · `payment.failed` ·
`payment.expired` · `payment.refunded` · `payment.disputed` ·
`settlement.created` · `settlement.paid` · `merchant.limit_warning`

**Signature** — HMAC-SHA256 over `{timestamp}.{raw_body}`:
```
X-TR-Signature: t=1754400000,v1=5257a869e7bcfd...
```

Merchants must (a) verify the signature, (b) reject timestamps older than 5 minutes to
block replay, and (c) compare using a constant-time function. All three are stated in
the docs with copy-pasteable code in every SDK language.

**Retry schedule:** immediate, 5s, 30s, 2m, 10m, 1h, 6h, 24h — then dead-letter. A
`2xx` within 5 seconds acknowledges; anything else retries. After 24 hours of
failure the endpoint is marked unhealthy and the merchant is alerted in their Command
Centre.

## 5.7 Payment methods

| Method | Coverage | Flow | Settlement |
| --- | --- | --- | --- |
| QR | Global | Display QR → scan in the BitriPay app → confirm | Instant |
| Wallet | BitriPay users | Redirect → authenticate → confirm | Instant |
| Card | Global | Hosted fields → 3DS → capture | T+2 |
| Bank transfer | UK/EU | Open Banking redirect | T+1 |
| Mobile money | Africa | Push to handset → PIN | T+1 |

**Card data never touches our servers.** Hosted fields are iframed from the processor,
which keeps us in PCI-DSS SAQ-A scope. Any proposal that would move us to SAQ-D is
rejected on sight — the compliance cost is disproportionate to any benefit.

## 5.8 Merchant Command Centre

Extends the pattern from [02](./02-user-ecosystem-and-command-centres.md).

| Panel | Content |
| --- | --- |
| Situation | Volume today, success rate, settlement balance, next settlement date |
| Attention | "Success rate 91.2%, down from 97.8% — decline spike on one BIN range" · "340 undelivered webhooks" · "84% of monthly limit" |
| Forecast | Settlement amount and date, chargeback exposure, projected month-end volume |
| Actions | Retry webhooks · rotate keys · request early settlement · submit dispute evidence · request a limit increase |
| Transcript | Every API call, every webhook attempt, every settlement |

### Developer centre

- **API keys** — separate sandbox and production, scoped, rotatable with a 24-hour
  overlap so rotation never causes downtime.
- **Event log** — every request and response for 30 days, searchable, with the ability
  to replay any webhook.
- **Test data** — deterministic cards and wallets that produce specific outcomes:
  `4000000000000002` always declines, `4000000000003220` always triggers 3DS.
- **SDKs** — TypeScript, Python, PHP. PHP matters: BitriPay's own documentation is
  PHP/Guzzle, so that is the ecosystem the merchants come from.
- **Plugins** — WooCommerce, Shopify, Magento. Most merchants will never write code.

## 5.9 Settlement engine

```
Payment captured
  → merchant_balance.pending += net
  → platform_revenue.accrued += spread + fee

Settlement run (daily 02:00 UTC)
  → for each merchant where pending_age ≥ settlement_terms:
      available = pending − reserve_requirement − open_dispute_exposure
      if available ≥ minimum_payout:
        create settlement batch
        initiate bank transfer
        emit settlement.created
        on bank confirmation: emit settlement.paid
```

**Reserve calculation:**
```
reserve = max(
  tier_minimum_percent × rolling_volume(reserve_window),
  2 × rolling_chargeback_volume(90d)
)
```

The second term is the one that matters: a merchant whose chargebacks are rising has
their reserve rise automatically, before a human notices.

## 5.10 Acceptance criteria

- Payment create p95 < 400ms.
- Webhook delivered within 2s of the state change at p95.
- Idempotency: 1,000 concurrent identical creates produce exactly one payment.
- Signature verification examples in the docs are runnable and correct in all three SDK
  languages.
- Sandbox is available within 60 seconds of merchant registration.
- A settlement run reconciles to the penny against the processor's report; any
  discrepancy halts the run and pages finance.
