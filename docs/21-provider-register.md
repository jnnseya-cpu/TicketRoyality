# 21 — External Provider Register

Every external dependency required for a fully working OS, with what it costs, what
happens without it, and what replaces it. Nothing here is aspirational: if a row says
`REQUIRED`, the platform does not function without it.

**Status key** — `LIVE` in the code today · `REQUIRED` before launch · `PHASE 2/3/4` ·
`OPTIONAL` never blocking.

---

## 21.1 The minimum viable set

Eleven providers get a working, sellable, legally operable platform. Everything in
§21.3 onward improves it; nothing there is needed to take money and admit people.

| # | Provider | Purpose | Status | Indicative cost |
| --- | --- | --- | --- | --- |
| 1 | **Vercel** or Cloud Run | Application hosting | `REQUIRED` | $20–150/mo |
| 2 | **Neon** or Cloud SQL | PostgreSQL (`08`) | `REQUIRED` | $25–300/mo |
| 3 | **Upstash Redis** | QR invalidation, sessions, rate limits | `REQUIRED` | $10–50/mo |
| 4 | **Firebase Auth** or Clerk | Authentication | `LIVE` | Free → $25/mo |
| 5 | **Stripe** | Card payments, payouts | `LIVE` | 1.4% + 20p |
| 6 | **BitriPay** | African mobile money | `LIVE` | Negotiated |
| 7 | **KODA** | Direct-payment verification (`20`) | `REQUIRED` for DRC | Flat, per verification |
| 8 | **Cloudflare** | DNS, WAF, DDoS, bot management | `REQUIRED` | $0–200/mo |
| 9 | **Cloudflare R2** | Media storage and CDN | `REQUIRED` | ~$15/mo/TB |
| 10 | **Resend** or SendGrid | Transactional email | `REQUIRED` | $20–90/mo |
| 11 | **Anthropic** | AI agents via the gateway (`07` §7.5a) | `LIVE` | Usage, resold at 4× |

**Minimum monthly floor: roughly £150–£250** before transaction volume. That is the
honest number for a platform that can sell a ticket, admit a person, take mobile money
and send a confirmation.

### Why email is in the minimum set

A ticket that cannot be delivered is not a ticket. Email is the only channel every buyer
has, and it is the one dependency where an outage is indistinguishable from fraud from
the customer's point of view — they paid and received nothing.

---

## 21.2 Payments and money movement

| Provider | Role | Status | Cost | Without it |
| --- | --- | --- | --- | --- |
| **Stripe** | Cards, wallets, Connect payouts, Terminal | `LIVE` | 1.4% + 20p (UK) | No card payments in UK/EU |
| **BitriPay** | M-Pesa, Airtel, Orange, Africell; CDF | `LIVE` | Negotiated | No collected mobile money |
| **KODA** | Verification of direct-to-number payments | `REQUIRED` (DRC) | Flat per check | Manual admin queue — slow, not broken |
| **Adyen** | Enterprise cards, local methods | `PHASE 3` | Interchange++ | Enterprise procurement friction |
| **Open Exchange Rates** | CDF/GBP/USD/EUR | `REQUIRED` multi-currency | $12–97/mo | Cannot price multi-currency honestly |
| **Modulr** or Stripe Treasury | UK Faster Payments payouts | `PHASE 3` | ~£0.20/payment | Payouts stay on Stripe Connect |

**Two-provider rule** (`01` §1.5.1): card has Stripe **and** Adyen; mobile money has
BitriPay **and** direct operator APIs. Verification is sole-source on KODA, which is
acceptable only because it fails open to the manual queue (`20` §20.8).

---

## 21.3 Identity, compliance and risk

| Provider | Role | Status | Cost | Without it |
| --- | --- | --- | --- | --- |
| **Sumsub** | KYC + KYB | `REQUIRED` before payouts | £1–3/check | **Cannot pay organisers legally** |
| **ComplyAdvantage** | Sanctions, PEP, adverse media | `REQUIRED` before payouts | £500+/mo | No AML screening — regulatory exposure |
| **Seon** | Device intelligence, bot detection | `PHASE 2` | £0.01–0.05/check | Weaker fraud scoring |
| **Cloudflare Turnstile** | Human verification (`11` §11.13) | `REQUIRED` | Free | Automated signup at scale |
| **Have I Been Pwned** | Breached-password check | `REQUIRED` | Free tier | Credential stuffing succeeds more often |
| **Persona** or Veriff | KYC secondary | `PHASE 3` | Per check | Single-vendor on identity |

**Sumsub and ComplyAdvantage are launch-blocking for payouts, not for sales.** You can
sell tickets on day one; you cannot pay an organiser without KYB, and doing so anyway is
the kind of decision that ends a payments relationship.

---

## 21.4 Communications

| Provider | Channel | Status | Cost | Without it |
| --- | --- | --- | --- | --- |
| **Resend** or SendGrid | Transactional email | `REQUIRED` | $20–90/mo | No tickets delivered |
| **Brevo** | Email failover | `PHASE 2` | $25/mo | Single point of failure on delivery |
| **Twilio** | SMS, OTP | `PHASE 2` | ~£0.04/SMS | No SMS reminders or fallback OTP |
| **Twilio / Meta** | WhatsApp Business | `PHASE 2` | ~£0.03/conversation | Weaker reach in African markets |
| **Firebase FCM** | Push | `PHASE 2` | Free | No mobile alerts |

**Transactional and marketing must use separate subdomains and IP pools** (`06` §6.6).
That is a configuration decision, not a provider one, and it costs nothing to do at
setup and a great deal to retrofit after a reputation hit.

---

## 21.5 Infrastructure

| Provider | Role | Status | Cost | Without it |
| --- | --- | --- | --- | --- |
| **Vercel** | Next.js hosting | `REQUIRED` | $20–150/mo | — |
| **Neon** | Serverless PostgreSQL | `REQUIRED` | $25–300/mo | No datastore |
| **Upstash Redis** | QR set, sessions, limits | `REQUIRED` | $10–50/mo | Duplicate scans possible under load |
| **Cloudflare** | DNS, WAF, DDoS, bots | `REQUIRED` | $0–200/mo | Exposed origin |
| **Cloudflare R2** | Object storage + CDN | `REQUIRED` | ~$15/mo/TB | No media, **no egress-free CDN** |
| **GKE** or Cloud Run Jobs | Agent plane only | `PHASE 3` | $70+/mo | Agents run in-process, coupled to web |
| **pgvector** | Embeddings | `PHASE 3` | Included with Postgres | No semantic search |
| **Pinecone** | Vector at scale | `PHASE 4` | $70+/mo | pgvector suffices below ~1M vectors |

**R2 over S3 specifically for zero egress fees.** A ticketing platform serves the same
event image to every visitor; on S3 that egress becomes the largest line on the bill
long before compute does.

---

## 21.6 AI

| Provider | Role | Status | Cost |
| --- | --- | --- | --- |
| **Anthropic** | Primary — agents, reasoning, support | `LIVE` | Usage, resold at 4× (`10` §10.6) |
| **Google Gemini / Vertex** | Secondary, high-volume classification | `LIVE` | Usage |
| **OpenAI** | Embeddings, tertiary | `PHASE 3` | ~$0.13/M tokens |

All three sit behind the AI Gateway (`07` §7.5a). No service imports a provider SDK, so
switching primary is a routing-table change rather than a refactor.

---

## 21.7 Observability

| Provider | Role | Status | Cost | Without it |
| --- | --- | --- | --- | --- |
| **Sentry** | Errors, session replay | `REQUIRED` | $26–80/mo | Blind to production errors |
| **Better Stack** or Datadog | Uptime, logs, APM | `REQUIRED` | $0–30 / $200+/mo | No alerting |
| **PagerDuty** | On-call rotation | `PHASE 2` | $21/user/mo | Alerts land nowhere at 03:00 |
| **PostHog** | Product analytics, funnels | `PHASE 2` | Free → $50/mo | No conversion visibility |

**Start with Better Stack, not Datadog.** Datadog is the right answer at scale and an
expensive one before it — its pricing punishes exactly the early phase when the budget
matters most. Migrating observability later is annoying; overpaying for two years is
worse.

---

## 21.8 Commerce and growth

| Provider | Role | Status | Cost |
| --- | --- | --- | --- |
| **Google Maps** | Venue maps, geo | `LIVE` | $200/mo free tier |
| **Cookiebot** or Osano | Cookie consent | `REQUIRED` (EU/UK) | £10–50/mo |
| **DocuSign** | Venue and promoter contracts | `PHASE 3` | $25+/user/mo |
| **Xero** | Reconciliation, P&L | `PHASE 2` | £15–50/mo |
| **Avalara** | Tax determination | `PHASE 4` | Usage |
| **HubSpot** | CRM | `OPTIONAL` | Free → $90/mo |
| **Instagram / TikTok / YouTube APIs** | Creator verification (`04` M26) | `PHASE 3` | Free |

---

## 21.9 Complete register

| # | Provider | Category | Status | Two-provider cover |
| --- | --- | --- | --- | --- |
| 1 | Vercel | Hosting | `REQUIRED` | Cloud Run (Docker ships) |
| 2 | Neon | Database | `REQUIRED` | Cloud SQL, Supabase |
| 3 | Upstash Redis | Cache | `REQUIRED` | Memorystore |
| 4 | Firebase Auth | Identity | `LIVE` | Clerk, Auth0 |
| 5 | Stripe | Payments | `LIVE` | Adyen |
| 6 | BitriPay | Mobile money | `LIVE` | Direct operator APIs |
| 7 | **KODA** | **Verification** | `REQUIRED` | **None — fails open** |
| 8 | Cloudflare | Edge | `REQUIRED` | Fastly |
| 9 | Cloudflare R2 | Storage | `REQUIRED` | Cloud Storage |
| 10 | Resend | Email | `REQUIRED` | SendGrid, Brevo |
| 11 | Anthropic | AI | `LIVE` | Gemini, OpenAI |
| 12 | Sumsub | KYC/KYB | `REQUIRED` payouts | Persona, Veriff |
| 13 | ComplyAdvantage | AML | `REQUIRED` payouts | Refinitiv |
| 14 | Turnstile | Bot defence | `REQUIRED` | hCaptcha |
| 15 | Open Exchange Rates | FX | `REQUIRED` multi-ccy | ECB feed |
| 16 | Sentry | Errors | `REQUIRED` | Rollbar |
| 17 | Better Stack | Uptime, logs | `REQUIRED` | Datadog |
| 18 | Cookiebot | Consent | `REQUIRED` EU | Osano |
| 19 | Google Maps | Location | `LIVE` | Mapbox |
| 20 | Twilio | SMS, WhatsApp | `PHASE 2` | Vonage, Brevo |
| 21 | Brevo | Email failover | `PHASE 2` | — |
| 22 | Firebase FCM | Push | `PHASE 2` | OneSignal |
| 23 | Seon | Device intel | `PHASE 2` | Fingerprint.js |
| 24 | PostHog | Analytics | `PHASE 2` | Amplitude |
| 25 | Xero | Accounting | `PHASE 2` | QuickBooks |
| 26 | PagerDuty | On-call | `PHASE 2` | Opsgenie |
| 27 | Adyen | Payments 2 | `PHASE 3` | Checkout.com |
| 28 | GKE | Agent plane | `PHASE 3` | Cloud Run Jobs |
| 29 | DocuSign | E-signature | `PHASE 3` | Dropbox Sign |
| 30 | Social platform APIs | Creator verify | `PHASE 3` | — |
| 31 | Pinecone | Vector at scale | `PHASE 4` | Weaviate, pgvector |
| 32 | Avalara | Tax | `PHASE 4` | Manual per market |

**32 providers at full build. 11 to launch.**

---

## 21.10 Cost model

| Stage | Monthly infrastructure | Notes |
| --- | --- | --- |
| **Launch** (11 providers) | **£150–250** | Before transaction volume |
| **Phase 2** (~26) | £600–1,200 | Comms, observability, fraud |
| **Phase 3** (~30) | £2,500–5,000 | Agent plane, enterprise, compliance |
| **Phase 4** (32) | £8,000–20,000 | Multi-region, scale tiers |

Transaction costs are separate and scale with GMV: Stripe at 1.4% + 20p is the largest
single variable line and is passed through or absorbed per `10` §10.2.

---

## 21.11 What is genuinely blocking, and what is not

### Blocking to take a single payment

Vercel · Neon · Redis · Firebase Auth · Stripe · Resend · Cloudflare · R2.
**Eight.** Everything else can follow.

### Blocking to pay an organiser

The eight above, **plus Sumsub and ComplyAdvantage.** Paying out without KYB is not a
corner worth cutting: it is the fastest route to losing the Stripe account the whole
platform runs on.

### Blocking to operate in the DRC

The eight, **plus BitriPay and KODA.** Without KODA the direct-payment flow still works
through the manual admin queue — slower, not broken (`20` §20.8).

### Not blocking anything, despite appearances

| Provider | Why it can wait |
| --- | --- |
| Datadog | Better Stack covers launch at a fraction of the cost |
| Pinecone | pgvector is sufficient below ~1M vectors |
| GKE | Agents run in-process until the workload justifies isolation |
| DocuSign | Contracts can be signed the ordinary way for the first year |
| HubSpot | A spreadsheet genuinely works at 50 organisers |

### The five accounts to open first

1. **Cloudflare** — DNS has to propagate before anything else is testable.
2. **Neon** — everything depends on the datastore.
3. **Stripe** — activation review takes days, not minutes.
4. **Sumsub** — onboarding and sandbox access take a week.
5. **Anthropic** — needed before any agent work starts.

Stripe and Sumsub are the two with human review in the loop. Starting them last is the
most common way a launch date slips by a fortnight for no engineering reason at all.
