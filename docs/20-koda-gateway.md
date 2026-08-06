# 20 — KODA Gateway API Door

> **This document was corrected.** An earlier draft speculated an `/expectations` API
> where our server pre-registered an expected payment. The real contract is
> **intents plus a customer-submitted SMS code**, matched against the Sentinel SIM
> ledger. §20.5 onward is the actual API; the commercial and regulatory reasoning in
> §20.1–20.4 was unaffected.

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

## 20.5 API surface — the real contract

Base URL `https://kodajnn.com/v1` · machine-readable at `/v1/openapi.json`.

```
Authorization: Bearer sk_live_xxx     (or)  X-API-Key: sk_live_xxx
```

### Key types, and why three

| Prefix | Scope | Where it may live |
| --- | --- | --- |
| `sk_` | `*` — full account | **Server only.** Never in a bundle, never in a repo |
| `pk_` | `write:intents` only | **Safe in the browser** — can start a payment, never read data |
| `rk_` | Read-only by default | A reconciliation key for an accountant |

`pk_` is the one worth understanding. It is safe in a page precisely because its scope
is so narrow that a leaked key buys an attacker nothing but the ability to create
intents nobody will pay.

### Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/ping` | Verify a key, see the merchant it unlocks |
| `POST` | `/intents` | Create a payment intent |
| `GET` | `/intents/{id}` | Poll status |
| `POST` | `/intents/{id}/verify` | Submit the customer's SMS code |
| `POST` | `/intents/{id}/cancel` | Cancel an awaiting intent |
| `GET` | `/checkout/{id}?cs=` | Customer-facing read, authorised by `client_secret` — **no API key** |
| `POST` | `/checkout/{id}/verify` | Customer submits their code; returns the redirect |
| `GET` | `/receipts` | Filterable ledger of verified payments with audit traces |
| `POST` | `/sandbox/sms` | Inject an operator-formatted SMS and watch ParserAgent structure it |
| `GET` | `/billing/balance` | Prepaid ACU balance |
| `GET` | `/agents` | Agent catalogue and ACU cost |
| `POST` | `/agents/{type}/run` | Run ReconcilerAgent, trust lookup, dispute evidence, Vision |
| `GET` | `/usage` | Monthly quota, usage, ACU |

### Scopes

| Scope | Grants |
| --- | --- |
| `write:intents` | Create payment intents |
| `read:receipts` | Read the verified-payments ledger |
| `read:agents` | List the agent catalogue |
| `run:agents` | Run agents — consumes ACU |
| `read:usage` | API usage and ACU balance |
| `*` | Full account |

### Creating an intent

```json
POST /v1/intents
{
  "amount": 25000,
  "currency": "CDF",
  "operators": ["orange_cd", "mpesa_cd"],
  "metadata": { "order_id": "CMD-1042" },
  "success_url": "https://ticketroyality.com/checkout/success"
}
→ {
  "intent_id": "int_…",
  "client_secret": "cs_…",
  "checkout_url": "https://kodajnn.com/pay/int_…?cs=cs_…"
}
```

**Amounts are minor units.** No float crosses this boundary — `08` §8.3.

**Send our order reference as `Idempotency-Key`.** A retried request must never create
a second intent, or the buyer sees two payment panels for one order.

---

## 20.6 Drop-in checkout

Two integration paths. We use the first.

### Hosted checkout — server creates the intent

Our server holds the `sk_` key, creates the intent, and hands the browser a
`checkout_url`. The overlay is a script tag:

```html
<script src="https://kodajnn.com/js/koda.js"></script>
<script>
  Koda.checkout({
    checkoutUrl: '<from your server>',
    onVerified: function (r) { window.location = '/checkout/success'; }
  });
</script>
```

### Publishable key — front-end only

A `pk_` key creates the intent in the page, no backend call:

```html
<button
  data-koda-key="pk_live_…"
  data-koda-amount="25000"
  data-koda-currency="CDF"
  data-koda-operators="orange_cd,mpesa_cd"
  data-koda-order="CMD-1042">
  Payer par mobile money
</button>
```

**We use the hosted path.** The publishable route is genuinely safe and is the right
answer for a shop with no backend — but we have one, and creating the intent
server-side means the amount is set by us rather than by whatever the page says.

### The browser hand-off is never the source of truth

```
customer pays operator directly
   ▼
receives operator SMS with a code
   ▼
pastes it into the KODA panel
   ▼
matched against the Sentinel SIM ledger
   ▼
fraud-scored · replay-checked
   ▼
signed payment.verified webhook ──▶ our server ──▶ tickets issued
                                    │
              onVerified in the browser advances the UI — convenience only
```

`15` §15.5 makes the same argument about Stripe's redirect. A customer whose signal
drops the instant their code is accepted still gets their ticket.

### Webhooks

```
x-koda-signature: <HMAC-SHA256 of the RAW body>
```

| Event | Meaning |
| --- | --- |
| `payment.verified` | Matched and accepted |
| `payment.verified.late` | Matched after the intent window |
| `payment.rejected` | Match failed |
| `payment.expired` | Window closed unmatched |

**Verify against the raw body string.** Parsing and re-serialising JSON changes key
order and whitespace, the hash stops matching, and every webhook is rejected — a
failure that looks like KODA being broken and is entirely ours.

Compare in constant time. A fast-exit comparison leaks the signature byte by byte.

---

## 20.6a Limits, ACU and failure codes

| Plan | Rate limit |
| --- | --- |
| Free | 2 rps |
| Boutique | 10 rps |
| Commerce | 25 rps |
| Plateforme | 100 rps |

| Status | Meaning | Our handling |
| --- | --- | --- |
| `429` | Rate limited | Honour `Retry-After`; never retry blind |
| `402` | Prepaid ACU exhausted, after a 72h grace buffer | Fall back to the manual queue — the merchant is out of credit, not in arrears |

Monthly verification quota is included at no per-use cost. **Failed matches, rejections
and expired intents are always free** — which is the right incentive: a verification
layer that charged for failures would be paid most when it worked least.

ACU is drawn only by AI features and by verifications beyond quota.

### Sandbox references

| Reference | Produces |
| --- | --- |
| `TEST-OK-25000` | Instant `payment.verified` |
| `TEST-LATE-90` | Verifies after 90s — `payment.verified.late` |
| `TEST-REPLAY` | `code_already_used` |
| `TEST-SUFFIX` | `msisdn_suffix_mismatch` → challenge flow |

A sandbox that only produces success teaches integrators to write code that crashes on
everything else. Late verification and replay are exactly what they meet in production.

---

## 20.7 Matching, and where it refuses to decide

```
customer pays the merchant number directly
   ▼
operator SMS lands on the customer's handset
   ▼
customer pastes the code into the KODA panel
   ▼
matched against the Sentinel SIM ledger
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

Hosted by KODA. Machine-readable contract at `/v1/openapi.json` — import into Postman
or generate an SDK.

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

See §20.6a for the real sandbox references. `POST /v1/sandbox/sms` additionally injects
an operator-formatted SMS so an integrator can watch ParserAgent structure it — which
is the part of the pipeline hardest to reason about from documentation alone.

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
