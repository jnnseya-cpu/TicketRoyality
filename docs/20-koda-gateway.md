# 20 — KODA Gateway API Door

## 20.1 What this is

**KODA is a verification door, not a collection gateway.** It answers one question, in
real time, for money that never passes through us:

> *Did this payment land in the merchant's own account, for this amount, with this
> reference?*

It does not collect. It does not settle. It does not hold, move, convert or touch
funds. That is not a limitation being managed — it is the product, and §20.3 explains
why it is also the regulatory position.

### Where it sits

```
      ┌──────────────────────────────────────────────────────┐
      │  COLLECTION  (funds move)                            │
      │  BitriPay · Stripe · Adyen                           │
      │  cards · STK push · wallets · cross-border           │
      └──────────────────────────────────────────────────────┘
                              │
                      the gateway sees this
                              │
      ═══════════════════════════════════════════════════════
                              │
                      nobody sees this
                              │
      ┌──────────────────────────────────────────────────────┐
      │  DIRECT-TO-NUMBER  (funds already landed)            │
      │  customer → merchant's own mobile money number       │
      │                                                      │
      │  KODA  ── observes · matches · confirms ──▶          │
      └──────────────────────────────────────────────────────┘
```

Most African merchants already receive mobile money directly to their own number. For
them **collection was never the problem — knowing was.** A gateway cannot verify those
transactions, not through any deficiency, but because the money never entered its path.

### What it replaces in this platform

The `offline_payments` flow shipped in this repository (`15` §15.6 F3, `17` §17.6 F3)
is the manual version of exactly this: a customer pays direct, types a reference, and a
human admin compares it against a provider statement. KODA is that comparison, done in
seconds, by machine, at scale.

---

## 20.2 Commercial model

| Dimension | KODA | A collecting gateway |
| --- | --- | --- |
| Charges on | Per verification | Percentage of transaction value |
| Typical unit | Flat, sub-cent to low-cent | 1.5–3.5% + fixed |
| Revenue scales with | Transaction **count** | Transaction **value** |
| Holds funds | Never | Always, briefly |
| Settlement risk | None | Full |
| Float | None | Material |

### The pricing moat

A flat per-verification fee is not a discount strategy. It is a structural defence:

**A percentage-taking competitor cannot match it without cannibalising the transactions
it does collect.** Following KODA down means abandoning the model that funds them; not
following means conceding the verification layer entirely. The moat is their P&L, not
our technology — which is the only kind of moat that holds when the competitor is
larger.

### Positioning discipline

Every comparative figure used in commercial material must carry:

1. A **source URL** per claim.
2. The date the figure was published.
3. A note where **FX conversion is approximate**.
4. An explicit statement that these are **complementary services**, not substitutes.

KODA does not beat gateways at their own job and must never be sold as if it does. The
claim that survives scrutiny is narrow and true: *for the direct-payment share, there
is currently no alternative at all.*

---

## 20.3 Regulatory position

**Intended position: KODA is a data and verification service, not a payment
institution.**

| Test | KODA | Consequence |
| --- | --- | --- |
| Holds client funds | No | Outside safeguarding requirements |
| Executes payment transactions | No | Not payment initiation |
| Issues payment instruments | No | Not e-money |
| Provides account information | **Yes** | This is the regulated activity, where regulated |
| Acts as agent for a PSP | No | No principal relationship |

The activity that most resembles a regulated one is **account information**: reading a
merchant's own transaction data with their consent. In some jurisdictions that is
licensable; in others it is not. The DRC, Kenya, Nigeria and Ghana each treat it
differently.

> **`OPEN` — blocking before commercial launch in any market.** Local counsel must
> confirm the position per jurisdiction before KODA processes a live merchant there.
> This is a Phase 3 exit gate in `13`, and it is not a formality: launching on an
> assumed position is how a service gets ordered to stop mid-contract.

**What is not in doubt:** never touching funds removes safeguarding, capital adequacy
and settlement-risk obligations entirely. That is the largest single reason the flat
fee in §20.2 is sustainable.

### Consent is the whole basis

KODA reads a merchant's account data **because the merchant asked it to**, per
`06` §6.4 data-handling rules:

- Consent is explicit, scoped to the accounts named, and revocable in one action.
- Revocation stops access immediately and is confirmed to the merchant.
- We store the **verification result**, never the underlying account statement.
- No consumer data is retained beyond the payer reference needed to match an order.

---

## 20.4 Merchant onboarding

```
1. Organiser or merchant registers on TicketRoyality
2. KYB via Sumsub (06 §6.4)                       ── shared with the BitriPay path
3. Merchant names the accounts KODA may observe   ── explicit, per account
4. Consent captured, scoped, timestamped, stored
5. Sandbox credentials issued immediately
6. Live credentials on KYB approval               ── typically 24–48h
7. Merchant configures a webhook endpoint
8. Test verification in sandbox
9. Go-live confirmation
```

Steps 3 and 4 are the ones a collection gateway has no equivalent of, and they are the
ones that must not be streamlined away. A merchant who does not clearly understand
which accounts are being observed has not consented, whatever the checkbox recorded.

`organisations.koda_account_ref` (`08` §8.5) holds the resulting reference.

---

## 20.5 API surface

Base: `https://api.ticketroyality.com/koda/v1`
Auth: `Authorization: Bearer <key>` · sandbox and live keys are separate and
visually distinct (`koda_sk_test_…` / `koda_sk_live_…`).

### `POST /expectations`

Register a payment you are expecting, so KODA can match it when it lands.

```json
{
  "reference": "TR-8F3K2M",
  "merchant_account_ref": "acct_9x2...",
  "amount": { "value": 4500, "currency": "CDF" },
  "payer_msisdn_hint": "+243810000001",
  "expires_at": "2026-08-05T18:00:00Z",
  "metadata": { "order_id": "b3f1..." }
}
```

```json
{
  "id": "exp_7Hk2...",
  "status": "awaiting",
  "created_at": "2026-08-05T17:04:11Z"
}
```

**Amounts are integer minor units.** `08` §8.3 — no floats cross this boundary.

### `GET /expectations/{id}`

```json
{
  "id": "exp_7Hk2...",
  "status": "verified",
  "verification": {
    "matched_at": "2026-08-05T17:06:52Z",
    "amount": { "value": 4500, "currency": "CDF" },
    "payer_msisdn": "+243810000001",
    "provider": "vodacom",
    "provider_reference": "QGH7X2K91",
    "confidence": 1.0,
    "match_basis": ["reference_exact", "amount_exact"]
  }
}
```

| `status` | Meaning |
| --- | --- |
| `awaiting` | Registered, nothing matched yet |
| `verified` | Exact match on reference **and** amount |
| `partial` | Matched, but the amount differs — **never auto-approved** |
| `ambiguous` | More than one candidate matched |
| `expired` | Window closed with no match |

### `POST /verifications/search`

Match a payment observed without a prior expectation — the walk-up case, and how a
merchant reconciles history.

### `GET /accounts`, `POST /accounts/{id}/consent`, `DELETE /accounts/{id}/consent`

Consent lifecycle. `DELETE` takes effect immediately and is irreversible without a
fresh grant.

### Idempotency

Every mutating request accepts `Idempotency-Key`. Replaying a key returns the original
response and never creates a second expectation — the same discipline as
`payments.idempotency_key` in `08` §8.11.

---

## 20.6 Webhooks

| Event | Fires when |
| --- | --- |
| `verification.matched` | An expectation is satisfied exactly |
| `verification.partial` | Matched with an amount discrepancy |
| `verification.ambiguous` | Multiple candidates |
| `verification.expired` | Window closed unmatched |
| `payment.observed` | An inbound payment with no expectation registered |
| `consent.revoked` | Merchant withdrew access to an account |

```
POST <merchant endpoint>
KODA-Signature: t=1754413612,v1=<hmac-sha256>
```

Signed with the merchant's webhook secret over `t.body`. **Reject any request whose
timestamp is more than 5 minutes old**, or a captured payload can be replayed
indefinitely.

Delivery retries on exponential backoff for 24 hours. **The webhook is a
notification, not the source of truth** — a merchant that missed one reconciles with
`GET /expectations/{id}`, exactly as `15` §15.5 treats Stripe's webhook versus its
redirect.

---

## 20.7 Matching, and where it refuses to decide

```
inbound payment observed
   ▼
candidate expectations = open ∧ same account ∧ within window
   ▼
┌──────────────────────────┬───────────────────────────────────────┐
│ reference exact          │ amount exact  → verified, confidence 1 │
│ reference exact          │ amount differs → partial               │
│ reference fuzzy (≤2 edit)│ amount exact  → partial                │
│ no reference             │ amount + msisdn + window → ambiguous   │
│ >1 candidate             │              → ambiguous               │
└──────────────────────────┴───────────────────────────────────────┘
```

**Only `verified` auto-approves.** Everything else routes to the human queue that
exists today.

This is the design decision the whole product rests on. A verification service that
guesses is worse than the manual process it replaces, because the manual process knows
it is uncertain and a confident wrong answer does not. `partial` and `ambiguous` are
**successful outcomes** — the system correctly identifying that a human is needed.

Fuzzy reference matching never auto-approves on its own. A customer mistyping one
character of a reference is common; so is two different customers paying similar
amounts within the same window.

---

## 20.8 Failure mode: fail-open, always

| KODA state | Platform behaviour |
| --- | --- |
| Healthy | Direct payments verified in seconds, tickets issue automatically |
| Degraded | Verification queues; the admin queue absorbs the overflow |
| Down | **Full fallback to manual verification** — the shipped flow, unchanged |

KODA outage costs **speed and admin hours. It never costs a sale and never costs a
ticket.** That is what keeps a sole-source dependency (`06` §6.21) acceptable: the
thing it replaced still works.

The inverse arrangement — where losing the verification layer stops payments being
accepted — would convert a convenience into an availability risk, which is precisely
the inversion the severance test in `01` §1.5.1 exists to catch.

---

## 20.9 Merchant Command Centre

| Panel | Contents |
| --- | --- |
| Situation | Verified today, awaiting, partial, ambiguous; median time-to-verify |
| Attention | Every `partial` and `ambiguous`, ranked by value |
| Forecast | Expected inbound against historical pattern |
| Actions | Approve, reject, or request more information — one click, always attributed |
| Transcript | Every verification, its basis, and who resolved the exceptions |

`match_basis` is shown verbatim on every record. A merchant approving a `partial`
should see *why* it was flagged — "reference matched, amount 200 CDF short" — not a
score with no explanation behind it.

---

## 20.10 Developer Centre

Hosted at `developers.ticketroyality.com/koda`.

| Asset | Detail |
| --- | --- |
| Specification | OpenAPI 3.0, with Postman collection export |
| SDKs | Node.js, Python, PHP, React Native |
| Sandbox | Mirrors production, including every failure mode |
| Webhook tester | Replay historical events, inspect payloads, verify signatures |
| Samples | Every flow end to end, in each SDK language |

### The sandbox must be able to fail

A sandbox that only produces `verified` teaches integrators to write code that handles
the happy path and crashes on everything else. KODA's sandbox exposes deterministic
triggers for each outcome:

| Test reference | Produces |
| --- | --- |
| `TEST-VERIFIED` | Exact match |
| `TEST-PARTIAL` | Amount discrepancy |
| `TEST-AMBIGUOUS` | Multiple candidates |
| `TEST-EXPIRED` | Window closes unmatched |
| `TEST-TIMEOUT` | No response, to exercise retries |

`partial` and `ambiguous` are the two an integrator is most likely to get wrong and
most likely to meet in production.

---

## 20.11 Acceptance criteria

Nothing ships until all of these hold:

| # | Criterion |
| --- | --- |
| 1 | p95 time from payment landing to `verification.matched` under **10 seconds** |
| 2 | Zero false `verified` results across the full test corpus — a wrong auto-approve is a released ticket that was never paid for |
| 3 | Every non-exact match routes to a human; no confidence threshold auto-approves |
| 4 | Webhook signatures verified, replay window ≤ 5 minutes, tested |
| 5 | Idempotency proven under concurrent replay |
| 6 | Consent revocation stops access within 60 seconds, confirmed to the merchant |
| 7 | Full manual fallback exercised with KODA disabled — sales and issuance unaffected |
| 8 | No account statement data persisted; only verification results |
| 9 | Legal position confirmed per launch market (§20.3) |
| 10 | Sandbox reproduces all five outcomes deterministically |

Criterion 2 is the one that decides whether this product is trustworthy. Criterion 9 is
the one that decides whether it is legal. Neither is negotiable for a launch date.
