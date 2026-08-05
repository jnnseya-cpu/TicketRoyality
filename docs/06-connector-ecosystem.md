# 06 — Third-Party Connector Ecosystem

## 6.1 Connector architecture

Every external integration implements one interface. No integration is written
bespoke against a vendor SDK in application code — that is how a platform ends up
unable to change providers.

```ts
interface Connector<TConfig, TCredentials> {
  id: string;                       // "stripe", "sendgrid"
  category: ConnectorCategory;
  capabilities: Capability[];       // what it can do, declared

  configure(config: TConfig): Promise<void>;
  authenticate(creds: TCredentials): Promise<AuthResult>;
  healthCheck(): Promise<HealthStatus>;

  // Every connector is failure-aware by construction
  readonly circuitBreaker: CircuitBreakerConfig;
  readonly rateLimit: RateLimitConfig;
  readonly retryPolicy: RetryPolicy;
}
```

**Rules, enforced at code review:**
1. Application code depends on the **capability interface**, never the vendor SDK.
   Swapping SendGrid for Brevo is a config change plus one adapter, not a refactor.
2. Every connector has a circuit breaker. A degraded vendor must not degrade the
   platform.
3. Every connector declares its failure mode: **fail-open** (recommendations) or
   **fail-closed** (payments, identity, AML). Stated in the spec, tested in CI.
4. Credentials live in Cloud Secret Manager, never in the database, never in config.
5. Every call is traced with the vendor, the latency, and the outcome.

### Circuit breaker defaults

| Setting | Value |
| --- | --- |
| Failure threshold | 5 failures in 30s |
| Open duration | 60s |
| Half-open probes | 3 |
| Timeout | Per connector; default 10s |

---

## 6.2 Payments

**Why:** money in and money out. The most critical category; every connector here is
**fail-closed**.

| Provider | Use | Connects to | Data out | Data in |
| --- | --- | --- | --- | --- |
| **Stripe** ✅ live | Cards, wallets, Connect payouts | Checkout, payouts | Amount, currency, line items, metadata | Session, payment intent, events |
| **BitriPay** ✅ live | Wallet, QR, mobile money | Checkout, gateway | Amount, currency, return URLs, reference | Payment URL, token, status |
| **Adyen** | Enterprise cards, local methods | Checkout | Payment request | Auth result |
| **Checkout.com** | High-volume cards | Checkout | Payment request | Auth result |
| **PayPal** | Consumer trust in NA/EU | Checkout | Order | Capture |
| **Klarna / Clearpay** | BNPL on tickets > £100 | Checkout | Order, customer | Auth, settlement |

**Selection logic** — routing is deterministic, never model-driven:

```
if amount > 100 and market in [UK, SE, DE] and bnpl_enabled → Klarna
elif method == 'mobile_money'                              → BitriPay
elif market in ['CD','NG','KE','GH']                       → BitriPay
elif volume_tier == 'enterprise'                           → Adyen
else                                                       → Stripe
```

**Failover:** if the primary returns `503` or the breaker is open, retry once on the
secondary within the same checkout session. The user sees one attempt.

---

## 6.3 Banking & Open Banking

**Why:** payouts, reconciliation and account verification.

| Provider | Use | Data out | Data in |
| --- | --- | --- | --- |
| **Stripe Treasury / Connect** | Payout rails, balance | Transfer instruction | Transfer status, balance |
| **TrueLayer** | Open Banking payments (UK/EU) | Payment initiation | Payment status |
| **Plaid** | Account verification, balance check | Public token | Account, routing, owner name |
| **Modulr** | UK Faster Payments, virtual accounts | Payment instruction | Settlement confirmation |

**Where it connects:** the payout engine in M5, and three-way reconciliation
(gateway ↔ ledger ↔ bank).

**Why account verification matters:** verifying an organiser's payout account belongs
to the verified legal entity blocks the most common payout-fraud vector — a
compromised account changing the destination before an event's payout runs.

---

## 6.4 Identity, KYC & KYB

**Why:** legally required for payouts and for operating as a payment facilitator.
**Fail-closed** without exception.

| Provider | Use | Data out | Data in |
| --- | --- | --- | --- |
| **Sumsub** | KYC + KYB, global | ID doc, selfie, company docs | Verification result, extracted fields, risk score |
| **Persona** | KYC, strong US coverage | ID doc, selfie | Verification result |
| **Veriff** | Liveness, document authenticity | Video, doc | Authenticity score |
| **ComplyAdvantage** | Sanctions, PEP, adverse media | Name, DOB, country | Match list, risk rating |

**KYC triggers:**

| Trigger | Level |
| --- | --- |
| Organiser requests first payout | Full KYC |
| Cumulative payouts > £1,000 | Full KYC |
| Any BitriPay merchant | Full KYB before processing |
| Sanctions-list match | **Immediate freeze, human review, no agent discretion** |
| Volume increases > 5× month-on-month | Re-screen |

**Data handling:** identity documents are **never stored on our infrastructure.** We
store the verification result, the provider's reference id, and the extracted
non-sensitive fields. This keeps the highest-risk PII class entirely off our systems.

---

## 6.5 Fraud & risk

**Why:** chargebacks and fake tickets are direct P&L losses.

| Provider | Use | Data out | Data in |
| --- | --- | --- | --- |
| **Stripe Radar** | Card fraud scoring | Payment + device context | Risk score, outcome |
| **Sift** | Behavioural fraud, ATO | Event stream | Score, decision |
| **Seon** | Digital footprint, email/phone intel | Email, phone, IP | Enrichment, risk |
| **MaxMind** | IP geolocation, proxy/VPN detection | IP | Geo, risk flags |
| **Cloudflare Bot Management** | Bot detection, scalping defence | Request context | Bot score |

**Where it connects:** `fraud.v3` synchronously at checkout, at scan, and at payout
request.

**Scalping defence** is a specific requirement, not a general fraud case:
- Rate limit per IP, per device, per payment instrument.
- Ticket limits per event, per person — enforced server-side, never client-side.
- Bot scoring on the checkout path.
- Velocity detection across accounts sharing a device fingerprint or payment method.

---

## 6.6 Communications

**Why:** every ticket, reminder, change and campaign.

| Provider | Channel | Use | Data out |
| --- | --- | --- | --- |
| **SendGrid** | Email | Transactional + marketing | Recipient, template id, variables |
| **Twilio** | SMS | Door-day reminders, urgent changes | Number, body |
| **Twilio / Meta** | WhatsApp | High-engagement markets | Number, template |
| **Firebase Cloud Messaging** | Push | Real-time alerts | Token, payload |
| **Brevo** | Email fallback | Failover for SendGrid | Same contract |

**Deliverability requirements** — a ticketing platform whose emails land in spam does
not function:
- SPF, DKIM and DMARC configured, with DMARC at `p=reject`.
- Transactional and marketing sent from **separate subdomains and separate IP pools**.
  A marketing complaint must never damage ticket-delivery reputation.
- Bounce and complaint webhooks processed within 60 seconds; hard bounces suppressed
  immediately.
- Reputation monitored; the Reliability Agent alerts on a complaint rate > 0.1%.

---

## 6.7 AI model providers

**Why:** the agent layer. Every provider here is **fail-open** to a deterministic
fallback — the pattern already implemented in `PersonalizedRecommendations.tsx`.

| Provider | Use | Notes |
| --- | --- | --- |
| **Anthropic Claude** | **Primary (target)** — agents, reasoning, structured output, support | Strongest on long-context analysis and adversarial verification |
| **Google Vertex AI / Gemini** ✅ live | **Secondary (target) · primary in the shipped code** | `gemini-2.5-flash` for volume; Vertex for private endpoints and residency |
| **OpenAI** | Fallback, embeddings | `text-embedding-3-large` for semantic search |
| **Vertex AI** | Managed hosting, private endpoints | Enterprise deployments needing data residency |
| **Cohere** | Reranking | Cheap, effective for search |
| **Mistral** | Cost-optimised classification | High-volume, low-complexity tasks |

**Routing:**

```
task ∈ {agents, reasoning, support, adversarial-review}   → claude
task ∈ {high-volume classification, extraction}           → gemini-2.5-flash
task ∈ {embedding}                                        → openai text-embedding-3-large
task ∈ {rerank}                                           → cohere
primary unavailable                                        → secondary, then deterministic
data_residency == 'eu-only'                                → Vertex, europe-west
```

### Primary provider — target versus shipped

The target primary is **Anthropic Claude**; the code in this repository currently runs
**Gemini via Genkit**. Both are recorded because the switch is a real piece of work, not
a config line: model-specific prompts, structured-output schemas and the ACU cost table
all need revalidating, and `03` §3.11 requires a golden-set evaluation before any
primary model changes.

The two-provider minimum (`01` §1.5.1) holds either way — whichever is primary, the
other is a live secondary, and both fail open to the deterministic path.

**Cost control:** every call is metered in ACU at provider cost × 4
(`src/shared/constants/billing.ts`). Per-agent, per-principal and per-chain budgets are
hard ceilings, not warnings.

---

## 6.8 Maps, location & logistics

| Provider | Use | Data out | Data in |
| --- | --- | --- | --- |
| **Google Maps** ✅ live | Static venue maps, geocoding, directions | Coordinates or address | Map image, geocode |
| **Mapbox** | Interactive maps, heatmaps | Coordinates | Vector tiles |
| **what3words** | Precise entrance location for festivals | Coordinates | 3-word address |
| **TfL / National Rail** | Transport disruption affecting arrivals | Route, time | Status, delays |
| **OpenWeather** | Weather → attendance and queue modelling | Coordinates, datetime | Forecast |

**Where it connects:** `EventMap`, geolocation search, and `operations.v1` — weather
and transport are two of the strongest predictors of the arrival curve and therefore
of door queue length.

---

## 6.9 CRM & marketing

| Provider | Use | Data out | Data in |
| --- | --- | --- | --- |
| **HubSpot** | Organiser CRM, sales pipeline | Contact, deal, activity | Contact id, lifecycle stage |
| **Salesforce** | Enterprise CRM | Account, opportunity | Record ids |
| **Mailchimp** | Organisers' own audience sync | Contact, tags | List membership |
| **Meta Marketing** | Campaign creation, lookalikes | Campaign spec, hashed audience | Campaign id, metrics |
| **Google Ads** | Search and display | Campaign spec | Campaign id, metrics |
| **TikTok Ads** | Younger demographics | Campaign spec | Campaign id, metrics |

**Consent boundary — the rule that keeps this lawful:** attendee data is exported to
an organiser's CRM **only** for attendees of that organiser's events, and only where
the attendee consented to that organiser contacting them beyond the transaction.
Audiences pushed to ad platforms are **hashed** (SHA-256, normalised) and never
raw. There is no platform-wide list, and no organiser may ever obtain one.

---

## 6.10 Accounting, tax & documents

| Provider | Use | Data out | Data in |
| --- | --- | --- | --- |
| **Xero / QuickBooks** | Organiser bookkeeping sync | Invoices, payouts | Sync status |
| **Avalara / TaxJar** | VAT/GST/sales tax by jurisdiction | Transaction, addresses | Tax amount, rate |
| **DocuSign / Dropbox Sign** | Venue contracts, partner agreements | Document, signers | Signature status |
| **PDFMonkey** | Invoices, tickets, certificates | Template + data | PDF |

**Tax is genuinely hard and must not be hand-rolled.** Ticket VAT treatment varies by
country, by event type (cultural exemptions), and by whether the platform is
principal or agent. Use a specialist provider and store the determination alongside
each transaction for audit.

---

## 6.11 Cloud, storage & CDN

| Provider | Use |
| --- | --- |
| **Google Cloud / Firebase** ✅ live | Auth, Firestore, App Hosting, Functions, Pub/Sub |
| **Cloudflare** | CDN, WAF, DDoS, bot management, R2 |
| **Cloudflare R2 / GCS** | Event images, ticket PDFs, stream recordings |
| **Mux / Cloudflare Stream** | Live ingest, transcode, adaptive delivery |
| **BigQuery** | Analytics warehouse |
| **Vertex Matching Engine** | Vector store for semantic search and agent memory |

---

## 6.12 Observability & support

| Provider | Use |
| --- | --- |
| **Sentry** | Error tracking, release health, source maps |
| **Google Cloud Monitoring** | Metrics, SLOs, alerting |
| **OpenTelemetry** | Distributed tracing across every service and connector |
| **PagerDuty** | On-call, escalation |
| **Zendesk / Intercom** | Support ticketing, live chat |
| **Statuspage** | Public status, incident communication |

---

## 6.13 Vector database & semantic retrieval

| Provider | Role | Notes |
| --- | --- | --- |
| **Pinecone** | Primary | Managed, low operational burden, sub-100ms p95 at our scale |
| **Weaviate** | Secondary | Self-hostable — the escape hatch if Pinecone pricing or terms move |
| **pgvector** | Fallback | Good enough below ~1M vectors; removes the category entirely if needed |

**Connects to:** fan preference embeddings, semantic event search, the recommendation
engine, and agent memory retrieval (`08` §8.10 `agent_memory`).

Embeddings are written on event publish and on each completed order. The index is
**derived state** — it can be rebuilt from Firestore at any time, which is what keeps a
vector provider replaceable rather than load-bearing (`01` §1.5.1).

---

## 6.14 Currency & exchange rates

| Provider | Role |
| --- | --- |
| **Open Exchange Rates** | Primary — CDF / GBP / USD / EUR |
| **ECB reference rates** | Secondary, free, sufficient for daily settlement |

**Connects to:** multi-currency event pricing, BitriPay settlement, organiser payout
statements, the three-year model in `10` §10.15.

**Rate discipline:** the rate used for a transaction is **frozen onto that
transaction**, never re-derived at read time. A payout statement that changes value
because a rate moved is a reconciliation dispute waiting to happen. Same principle as
the frozen event details on a ticket (`16` §16.6 F3).

---

## 6.15 E-signature & contracts

| Provider | Role |
| --- | --- |
| **DocuSign** | Primary — enterprise procurement expects it by name |
| **Dropbox Sign** | Secondary, materially cheaper below enterprise volume |

**Connects to:** venue contracts, promoter agreements, hospitality terms, white-label
master services agreements, sponsor activation contracts.

Signature status is a webhook, not a poll. A countersigned venue contract unblocks
event publication for that venue, so the latency is user-visible.

---

## 6.16 Device intelligence & bot defence

| Provider | Role |
| --- | --- |
| **Seon** | Primary — device fingerprint, velocity, bot detection at checkout |
| **Fingerprint.js** | Secondary — narrower scope, but independent signal |

**Connects to:** checkout risk scoring, `fraud.v3` (`03` §3.6), gate scan anomaly
detection, account-creation abuse.

**Fail-open, deliberately.** If Seon is unreachable, checkout proceeds with the
transaction flagged for review rather than blocked. A fraud vendor outage that stops
every sale converts a risk-management tool into an availability risk — the exact
inversion the severance test in `01` §1.5.1 exists to catch.

---

## 6.17 Accounting & tax

| Provider | Role |
| --- | --- |
| **Xero** | Primary (UK) — payout reconciliation, platform P&L |
| **QuickBooks** | Secondary (US/international) |
| **Avalara** | Tax determination across jurisdictions |
| **Custom export (DRC)** | No viable SaaS provider — CSV + a documented schema |

The DRC row is honest rather than aspirational. Naming a provider that does not
adequately serve the market would make this table look complete while leaving the
finance team to discover the gap during close.

---

## 6.18 CRM & enterprise sales

| Provider | Role |
| --- | --- |
| **HubSpot** | Primary — organiser CRM sync, enterprise pipeline |
| **Salesforce** | Enterprise procurement requirement |

Optional by design. Per `01` §1.7 we integrate CRMs, we do not rebuild them — and an
organiser must never need one to run an event.

---

## 6.19 Container orchestration & edge

| Provider | Role |
| --- | --- |
| **Google Kubernetes Engine** | Agent workloads, long-running jobs, scheduled flows |
| **Cloudflare** | Edge cache, DDoS, WAF, R2 object storage |
| **Vercel** | Next.js application tier (current, `07` §7.9) |

The transactional core runs on the application tier; **GKE hosts the agent plane
only**. Keeping them separate means an agent workload that goes into a crash-loop
cannot take ticket sales down with it.

---

## 6.20 Payment verification — KODA

**The category everyone else skipped.** Gateways solve *collection*: they take money
from a payer and settle it to a merchant, handling cards, cross-border and STK push.
KODA does none of that, and does not try to.

The observation it is built on: **most African merchants already receive mobile money
directly to their own number.** For them collection was never the problem. Knowing was
— knowing that the payment landed, that the reference matches the order, that the
amount is right, and that the person claiming to have paid actually did.

That layer sits *beneath* the gateways, and it is where this platform already bleeds.

### The problem it closes in this codebase, today

The shipped `offline_payments` flow (`15` §15.6 F3, `17` §17.6 F3) is exactly the
manual process KODA automates:

```
customer pays Vodacom / Airtel / Orange / Africell direct to the displayed number
   ▼
submits a reference by hand ──▶ status: 'pending'
   ▼
════════ a human admin compares it against the provider statement ════════
   ▼
approve → tickets issued        deny → nothing issued
```

Everything between the double lines is a person reading a bank statement. It is slow,
it does not scale, it is the platform's single largest operational cost per
transaction, and every minute it takes is a paying customer holding nothing.

With KODA:

```
customer pays direct to the merchant number
   ▼
KODA observes the inbound payment on the merchant's own account
   ▼
webhook: { reference, amount, currency, msisdn, timestamp, confidence }
   ▼
match against the pending order ──▶ auto-approve ──▶ tickets issued
   ▼
no match, or ambiguous ──▶ the human queue, now carrying only the hard cases
```

| | Today | With KODA |
| --- | --- | --- |
| Time to ticket | Minutes to hours, business hours only | Seconds, always |
| Cost per verification | Admin attention | Near-zero, flat |
| Scales with volume | No | Yes |
| Human queue | Every payment | Exceptions only |

### Contract

| Field | Value |
| --- | --- |
| **Category** | Payment verification — distinct from acceptance, settlement and reconciliation |
| **Role** | Primary, and the only provider in its category |
| **Direction** | Read-only. KODA observes; it never holds, moves or touches funds |
| **Connects to** | `offline_payments` verification, order matching, organiser direct-payment reconciliation, `fraud.v3` signal |
| **Data out** | Merchant account identifier, expected reference, expected amount |
| **Data in** | `{ reference, amount, currency, msisdn, timestamp, confidence }` |
| **Failure mode** | **Fail-open to the existing human queue.** KODA down means slow, never broken |
| **Autonomy** | Auto-approve only on exact reference **and** exact amount match. Anything else escalates |

### Why it is complementary, not competitive

Stated plainly, because overclaiming here would be easy and would not survive
diligence:

- **KODA does not beat gateways at their own job.** It does not collect, settle, do
  cards, do cross-border, or do STK push. Those are gateway functions and KODA has
  none of them.
- **It addresses the share the gateway never sees.** Direct-to-number payments do not
  pass through an aggregator, so no gateway can verify them — not because gateways are
  deficient, but because those transactions are outside their path entirely.
- **It runs alongside a gateway, not instead of one.** BitriPay handles collected
  mobile money; KODA verifies the direct share. A merchant can and usually should have
  both.

### The pricing moat

KODA charges a flat, very low fee rather than a percentage of the transaction.

That is not a discount, it is a structural defence. A percentage-taking competitor
cannot match it without cannibalising its own primary revenue on the transactions it
*does* collect. Following KODA down means abandoning the model that funds them; not
following means conceding the verification layer. The moat is their P&L, not our
technology.

**Comparative figures used in commercial material must carry a source URL per claim**,
and must state that these are complementary services with approximate FX conversion.
An unfootnoted comparison table is the fastest way to lose a room that would otherwise
have agreed with you.

### Effect on independence

This materially improves the one genuine single-vendor exposure in §6.21:

| Path | Before | After |
| --- | --- | --- |
| Collected mobile money | BitriPay | BitriPay |
| **Direct-to-number mobile money** | **Manual admin verification** | **KODA-verified, automatic** |
| Both providers down | Manual queue | Manual queue |

Direct-to-number plus KODA is a mobile-money path that **needs no aggregator at all**.
The severance test in `01` §1.5.1 improves from "degraded to a manual queue" to "a
second independent rail continues automatically."

---

## 6.21 Connector inventory

Twenty-one categories, and the independence rule from `01` §1.5.1 applied to each:

| # | Category | § | Providers | Single-vendor risk |
| --- | --- | --- | --- | --- |
| 1 | Payments — card | 6.2 | Stripe, Adyen | No |
| 2 | Payments — Africa / mobile money | 6.2 | BitriPay, direct operator APIs | **Yes** — see below |
| 3 | Banking & open banking | 6.3 | Plaid, Modulr, TrueLayer | No |
| 4 | Identity, KYC & KYB | 6.4 | Sumsub, Veriff, Persona | No |
| 5 | AML & sanctions screening | 6.4 | ComplyAdvantage, Refinitiv | No |
| 6 | Fraud & risk scoring | 6.5 | Stripe Radar, Seon | No |
| 7 | Email | 6.6 | SendGrid, Brevo | No |
| 8 | SMS & OTP | 6.6 | Twilio, Vonage | No |
| 9 | WhatsApp Business | 6.6 | Twilio, Brevo | No |
| 10 | Push notification | 6.6 | Firebase FCM, OneSignal | No |
| 11 | AI model providers | 6.7 | Anthropic Claude, Google Vertex/Gemini, OpenAI | No |
| 12 | Maps & location | 6.8 | Google Maps, Mapbox | No |
| 13 | CRM & marketing | 6.9, 6.18 | HubSpot, Salesforce | No |
| 14 | Accounting & tax | 6.10, 6.17 | Xero, QuickBooks, Avalara | Partial — DRC |
| 15 | Cloud, storage & CDN | 6.11 | Cloudflare R2, Google Cloud Storage | No |
| 16 | Observability & APM | 6.12 | Datadog, Sentry, Google Cloud Monitoring | No |
| 17 | Vector database | 6.13 | Pinecone, Weaviate, pgvector | No |
| 18 | Currency & FX rates | 6.14 | Open Exchange Rates, ECB | No |
| 19 | E-signature | 6.15 | DocuSign, Dropbox Sign | No |
| 20 | Device intelligence | 6.16 | Seon, Fingerprint.js | No |
| 21 | **Payment verification** | 6.20 | **KODA** | Yes — see below |

### The two categories with genuine single-vendor exposure

**Payment verification is sole-source on KODA**, and unlike the row below there is no
second provider to name because the category barely exists — that is precisely why it
is worth occupying. The exposure is bounded by the failure mode rather than by a
competitor: KODA is read-only and fails open to the manual queue that runs the platform
today. Losing it costs speed and admin hours, never a sale and never a ticket.



**Mobile money is concentrated on BitriPay**, and pretending otherwise would defeat the
purpose of this table. The mitigation is not a second aggregator — there is no
equivalent with the same DRC operator coverage — it is that the platform holds direct
operator relationships as the fallback path:

| Layer | Status |
| --- | --- |
| BitriPay aggregation | Primary |
| Direct Vodacom / Airtel / Orange / Africell APIs | Fallback, contracts `OPEN` |
| Manual verification workflow | **Already live** — `offline_payments`, `17` §17.6 F3 |

The third row is why this is exposure rather than a defect: the manual workflow in the
shipped code accepts a payment reference, holds it `pending`, and issues on admin
approval. It is slower, it is human, and it means a total BitriPay outage degrades
mobile money to a queue instead of taking it to zero.

---

## 6.22 Connector priority

| Phase | Connectors | Rationale |
| --- | --- | --- |
| **MVP** ✅ | Firebase, Stripe, BitriPay, Google Maps, Gemini | Already live |
| **Beta** | SendGrid, Twilio, FCM, Sentry, Cloud Monitoring, Cloudflare | Communication and reliability are table stakes |
| **Commercial** | Sumsub, ComplyAdvantage, Stripe Radar, Avalara, Mux, BigQuery | Compliance and revenue enablement |
| **Enterprise** | Adyen, Salesforce, DocuSign, Vertex, Plaid, Modulr | Enterprise procurement requirements |
| **Global** | Regional payment rails, regional KYC, regional tax | Per-market expansion |

---

## 6.23 Connector health

Every connector exposes the same health contract, surfaced in the Admin Command Centre
and consumed by `reliability.v1`:

```ts
interface HealthStatus {
  connector: string;
  status: 'healthy' | 'degraded' | 'down';
  latencyP95Ms: number;
  errorRate: number;
  circuitState: 'closed' | 'open' | 'half-open';
  lastSuccess: string;   // ISO 8601
  lastFailure?: string;
  quotaRemaining?: number;
}
```

**Degradation policy:**

| Connector down | Platform behaviour |
| --- | --- |
| Stripe | Route to BitriPay; banner explaining card payments are temporarily unavailable |
| BitriPay | Route to Stripe; mobile money queued for manual processing |
| Gemini | Deterministic fallbacks everywhere; AI features labelled "temporarily limited" |
| SendGrid | Failover to Brevo; if both fail, queue and retry — **never drop a transactional email** |
| Sumsub | Queue verifications; block payouts (fail-closed) but keep ticket sales running |
| Google Maps | Fall back to the text address panel (already implemented in `EventMap.tsx`) |
| Cloudflare | Direct-to-origin with rate limiting; accept degraded DDoS posture |

**The principle:** ticket sales and door entry must survive the failure of every
non-payment connector. Those two paths are the business.
