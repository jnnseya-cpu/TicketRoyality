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
| **Google Gemini** ✅ live | Primary — flows, agents, structured output | `gemini-2.5-flash` for volume, `2.5-pro` for hard reasoning |
| **Anthropic Claude** | Long-context analysis, adversarial verification | Strong at "find the flaw in this plan" |
| **OpenAI** | Fallback, embeddings | `text-embedding-3-large` for semantic search |
| **Vertex AI** | Managed hosting, private endpoints | Enterprise deployments needing data residency |
| **Cohere** | Reranking | Cheap, effective for search |
| **Mistral** | Cost-optimised classification | High-volume, low-complexity tasks |

**Routing:**

```
task ∈ {classification, extraction, short-generation}     → gemini-2.5-flash
task ∈ {long-analysis, adversarial-review, planning}      → claude
task ∈ {embedding}                                        → openai text-embedding-3-large
task ∈ {rerank}                                           → cohere
primary unavailable                                        → secondary, then deterministic
data_residency == 'eu-only'                                → Vertex, europe-west
```

**Cost control:** every call is metered in ACU at provider cost × 3
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

## 6.13 Connector priority

| Phase | Connectors | Rationale |
| --- | --- | --- |
| **MVP** ✅ | Firebase, Stripe, BitriPay, Google Maps, Gemini | Already live |
| **Beta** | SendGrid, Twilio, FCM, Sentry, Cloud Monitoring, Cloudflare | Communication and reliability are table stakes |
| **Commercial** | Sumsub, ComplyAdvantage, Stripe Radar, Avalara, Mux, BigQuery | Compliance and revenue enablement |
| **Enterprise** | Adyen, Salesforce, DocuSign, Vertex, Plaid, Modulr | Enterprise procurement requirements |
| **Global** | Regional payment rails, regional KYC, regional tax | Per-market expansion |

---

## 6.14 Connector health

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
