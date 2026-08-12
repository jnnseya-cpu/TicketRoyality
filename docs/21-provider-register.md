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
| **Firebase App Check** | Attestation (`11` §11.13) | `REQUIRED` | Free | Automated access at scale |
| **Firebase Auth** password policy | Weak-password rejection | `REQUIRED` | Free | Credential stuffing succeeds more often |
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
| 14 | Firebase App Check | Attestation | `REQUIRED` | Cloud Armor (same project) |
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

---

## 21.12 The adopted stack — Hostinger + Firebase

**Five vendors.** Vercel is not among them: cold starts and function timeouts made the
web tier feel slow, and the work that needs a long request — a full event build is 45
seconds of model calls — does not fit a short serverless ceiling. Full reasoning in
`22` §22.3.

| # | Vendor | Provides |
| --- | --- | --- |
| 1 | **Hostinger** | Domain, DNS, mailboxes, SMTP |
| 2 | **Firebase** | App Hosting (Next.js on Cloud Run), Auth, Firestore, Storage, Cloud Functions, Cloud Scheduler, FCM |
| 3 | **Stripe** | Cards, wallets, payouts, Terminal |
| 4 | **BitriPay** | Mobile money, CDF |
| 5 | **Claude · Gemini · OpenAI** | AI behind the gateway — reasoning, volume, embeddings |

**Indicative cost: £70–150/month before transaction volume.** One cloud project, one
region, no cross-provider hop on any request path. The working is in §21.13 — the
figure is dominated by one line, and an earlier draft of this document understated it.

### What each one actually covers

| Need | Served by | Notes |
| --- | --- | --- |
| Domain, DNS | Hostinger | Records in `22` §22.9 |
| Transactional email | Hostinger SMTP | Caveat below |
| Hosting, SSR, API | **Firebase App Hosting** | Cloud Run; `minInstances: 1`, `timeoutSeconds: 300` |
| **Privileged writes** | **Cloud Functions v2** | **Closes D1 and D2** |
| Scheduled jobs | **Cloud Scheduler** | Hold release, placement expiry |
| Cache, rate limits | Firestore counters | No Redis — see `22` §22.7 |
| QR one-time use | **Firestore transaction** | The transaction *is* the guarantee |
| Realtime | Firestore listeners | No websocket service |
| Auth, MFA | Firebase Auth | Already live |
| Database | Firestore + sharded counters | Already live |
| Media | Firebase Storage + `next/image` | |
| Push | Firebase FCM | Phase 2 |

---

### Cloud Functions close two debts without a new vendor

D1 (server-side ticket issuance) and D2 (atomic ledger writes) both needed the Admin
SDK in a trusted runtime. **Firebase Cloud Functions is that runtime**, and it is
already part of the Firebase project.

```
Stripe webhook ──▶ Vercel route ──▶ verify signature
                                          │
                        Cloud Function (Admin SDK, rules bypassed)
                                          │
                        ┌─────────────────┴─────────────────┐
                        ▼                                   ▼
              issue tickets for the buyer          write wallet_ledger
              (rules forbid client writes)         (create/update/delete: false)
```

Both run inside a Firestore transaction, so the ledger entry and the balance land
together or neither does — the exact guarantee `17` §17.5 says is missing today.

**That is the largest single item on the blocking list closed by a decision rather than
a migration.**

---

### The Postgres decision, revisited honestly

`08` §8.1 argued for PostgreSQL on three defects. Under this constraint Firestore
stays, so each has to be re-examined rather than restated.

| Defect | Verdict now |
| --- | --- |
| Ledger atomicity | **Solved.** Firestore transactions plus a Cloud Function |
| Money as float | **Solvable in the app.** Store integer minor units; `numeric` was convenience, not necessity |
| Oversell race | **Partly solved — and my earlier claim was too strong** |

**Correction on overselling.** I wrote in `08` §8.1 that the oversell race is
structural to a document store. That overstated it. `runTransaction` reads and writes
atomically with optimistic concurrency, so two buyers competing for the last seat
resolve correctly — one commits, one retries and fails.

The real limit is **contention, not correctness**. A single tier counter is one
document, and a hot document sustains roughly one write per second. An on-sale spike of
100× baseline queues behind that, so it becomes a *throughput* problem: slow checkouts
and timeouts, not phantom tickets.

Mitigation without Postgres: **sharded counters** — split each tier's count across N
sub-documents, write to a random shard, sum on read. Standard Firestore practice, lifts
the ceiling to roughly N writes per second, and is a day of work.

| | Firestore + shards | PostgreSQL |
| --- | --- | --- |
| Correctness under contention | ✅ | ✅ |
| Throughput at on-sale peak | ~N writes/sec, tunable | Thousands/sec |
| Complexity | Sharding logic in the app | A `CHECK` constraint |
| Migration cost now | Zero | 17 weeks (`19`) |

**Recommendation: ship on Firestore with sharded counters.** `19` stays written and
unscheduled — the trigger to run it is a measured contention ceiling under real on-sale
load, not a preference. That is a better reason to migrate than the one I gave.

---

### Three honest caveats

**Hostinger SMTP is not a transactional email platform.** It sends mail; it does not
give you delivery webhooks, bounce handling, suppression lists or reputation
monitoring — and shared-hosting IP reputation is outside your control.

Acceptable at launch volume. The trigger to revisit is the first delivery complaint or
roughly 5,000 emails a month, whichever comes first. Resend at $20 is the smallest
possible upgrade and can be deferred until then. **A ticket that does not arrive is
indistinguishable from fraud to the buyer**, so this is the caveat to watch hardest.

**There is no edge WAF.** Google Cloud Armor is the in-project option if it becomes
necessary; until then, attestation runs at the data layer via App Check and scalping
defence lives in the application — server-side per-person ticket limits, velocity checks across device and
payment instrument, and the layered controls in `11` §11.13, most of which never
depended on the edge anyway.

**Firebase Storage is not a CDN.** It serves files with egress billed per GB and no
edge caching by default. `next/image` caches optimised variants at the App Hosting
layer, which keeps the exposure small. Watch it: bandwidth is the line that
surprises people on a viral event.

---

### What is deferred, not lost

| Provider | Deferred until |
| --- | --- |
| Cloudflare / Cloud Armor | Bot attacks the application layer cannot hold |
| Resend / SendGrid | First delivery complaint, or ~5,000 emails/month |
| Neon / Cloud SQL | Measured Firestore contention at on-sale peak |
| Memorystore | Firestore counter limits become binding |
| R2 | Firebase Storage egress becomes material |
| Sumsub, ComplyAdvantage | **Before the first organiser payout — not deferrable** |

The last row is the one that is not a technical choice. Paying out without KYB risks
the Stripe account the whole platform runs on.


---

## 21.13 Cost model, with the arithmetic shown

An earlier version of this document said £30–90/month. **That was wrong**, and wrong in
a specific way worth recording: it did not price the always-on instance that
`apphosting.yaml` had just been configured to run. A cost estimate that contradicts the
config in the same commit is worse than no estimate.

### The line that dominates everything

`minInstances: 1` keeps one Cloud Run instance provisioned around the clock. That is
what removes cold starts, and it is billed for all 730 hours whether anyone visits or
not.

| Instance size | Always-on, idle-billed | If fully active |
| --- | --- | --- |
| 1 vCPU / 1 GiB | **~$26/mo** | ~$70/mo |
| 2 vCPU / 2 GiB | ~$53/mo | ~$139/mo |
| minInstances: 0 | $0 | — but cold starts return |

**`apphosting.yaml` is now 1 vCPU / 1 GiB**, down from 2/2. At `concurrency: 80` one
instance serves 80 simultaneous requests, and Next.js SSR is I/O-bound — most of a
request is waiting on Firestore — so the smaller size is right for launch. Scale the
floor when a measurement says to.

### Four stages, because "the cost" depends entirely on which one you are in

The £70–150 figure below is **operating cost at real traffic**, not what it costs to
get started. Those are different by an order of magnitude and conflating them is
misleading.

| Stage | What is running | Monthly |
| --- | --- | --- |
| **1. Build & test** | `minInstances: 0`, no users, everything inside free tiers | **£3–15** |
| **2. Live, quiet** | `minInstances: 1`, a few hundred visitors, first events | **£33–55** |
| **3. Operating** | ~50k views, ~500 tickets/month | **£70–150** |
| **4. Paying organisers** | Stage 3 + mandatory KYB and AML | **£600+** |

**Stage 1 is almost free**, and it is where you will be for the first weeks:

| Line | Cost | Why |
| --- | --- | --- |
| Firebase (Blaze plan) | **£0** | Blaze is pay-as-you-go; free tiers cover development entirely |
| Firestore | £0 | 50k reads, 20k writes, 1 GiB free **per day** |
| Auth | £0 | Free below 50k monthly active users |
| Storage | £0 | 5 GB free |
| Cloud Functions | £0 | 2M invocations free |
| Cloud Run | **£0** | With `minInstances: 0`. Cold starts do not matter with no users |
| Hostinger domain | ~£1 | ~£12/year for `.com` |
| Hostinger mailbox | £1–3 | |
| AI while testing | £2–10 | Only what you actually call |
| Stripe, BitriPay | £0 | Per-transaction only — nothing until a real sale |

**Blaze requires a card on file but bills nothing while you stay inside the free
tiers.** Set a budget alert at £20 on day one anyway; the failure mode of pay-as-you-go
is a loop you did not notice, not a price you agreed to.

New Google Cloud accounts also get **$300 of credit valid for 90 days**, which covers
stage 1 and most of stage 2 outright.

**The single switch between stage 1 and stage 2 is `minInstances`.** Leave it at `0`
until you have real users; the ~£25/month it costs buys the absence of cold starts,
which is worth nothing when nobody is waiting.

### Full monthly estimate at stage 3

Assuming ~50,000 page views, ~500 tickets, ~2,000 AI calls a month.

| Line | Estimate | Driver |
| --- | --- | --- |
| Cloud Run — 1 always-on instance | **£22–30** | The floor. 24/7 regardless of traffic |
| Cloud Run — request-time overage | £5–15 | Scales with traffic above the warm instance |
| Firestore reads/writes | £5–20 | 50k reads + 20k writes/day are free; this is above that |
| Firestore storage | £1–3 | £0.14/GiB/month |
| Cloud Functions | £0–5 | 2M invocations free |
| Storage + egress | £5–25 | **Egress is the variable to watch** — a viral event moves this |
| Secret Manager, Scheduler, Cloud Build | £3–8 | ~15 secrets, 2 jobs, build minutes |
| Firebase Auth | £0 | Free below 50k monthly active users |
| Hostinger — domain + mailboxes | £3–5 | |
| AI providers (float before resale) | £10–40 | Recovered at 4× via ACU (`10` §10.6) |
| Stripe, BitriPay | £0 | Per-transaction only, no monthly floor |
| **Total** | **£54–151** | Call it **£70–150** as a planning figure |

### What moves it

| Change | Effect |
| --- | --- |
| `minInstances: 0` | −£25, cold starts return. **Not recommended** |
| 2 vCPU / 2 GiB floor | +£26 |
| A viral event | Storage egress and Firestore reads both spike |
| 10× traffic | Roughly +£40–80, mostly request-time compute |
| Adding Sumsub + ComplyAdvantage | **+£500** — required before the first payout (§21.3) |

### The number nobody plans for

**ComplyAdvantage at roughly £500/month is larger than the entire infrastructure bill.**
It is not optional before payouts, and it is the line most likely to be missed when
budgeting from an infrastructure estimate alone. §21.11 lists it as blocking for a
reason.

Once it is on, the monthly floor is roughly **£600, not £100.** Infrastructure is the
small part of running a regulated payments-adjacent platform, which is the honest shape
of this business.

### Caveat

Cloud pricing changes and varies by region. These figures are indicative and derived
from published europe-west2 rates at the time of writing — **verify against the Google
Cloud pricing calculator before committing to a budget.** Treat the arithmetic as the
useful part, not the constants.
