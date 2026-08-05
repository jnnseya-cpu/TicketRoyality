# 22 — Production Architecture & Deployment

The recommended shape for frontend, backend and shared, the reasoning behind each
choice, and what stands between the current repository and a production deployment.

---

## 22.1 The recommendation, in one table

| Layer | Recommendation | Instead of | Why |
| --- | --- | --- | --- |
| **Frontend** | Next.js App Router, RSC-first | SPA + separate API | Event pages must be server-rendered for SEO (`04` M25) |
| Client state | **Zustand + TanStack Query** | Redux, Context sprawl | Server cache and client store are different problems |
| **Backend** | **Route handlers + service modules**, in the same deployment | NestJS microservices | See §22.3 |
| **Shared** | Isomorphic contracts, zero dependencies | Duplicated types | Already shipped and lint-enforced (`14`) |
| Cache | **Vercel KV** | In-memory | QR invalidation must be shared across instances |
| Agent plane | **Separate deployment** from Phase 3 | In-process forever | A crash-looping agent must not take checkout down |
| AI access | **One gateway** (`07` §7.5a) | Direct SDK calls | Metering, failover, redaction in one place |
| Hosting | Vercel, with a Docker escape hatch | Platform lock-in | `Dockerfile` ships; Cloud Run is a config change |
| Domain & mail | **Hostinger** | Cloudflare + Resend | Adopted — `21` §21.12 |
| Datastore (launch) | **Firestore + sharded counters** | Neon Postgres | Adopted; `19` stays written and unscheduled |
| Privileged writes | **Firebase Cloud Functions** | A separate service | Closes D1 and D2 without a new vendor |

---

## 22.2 The shape

**Adopted stack** — Hostinger, Vercel, Firebase, Stripe, BitriPay, and three AI
providers. Six vendors, no new ones (`21` §21.12).

```
                    HOSTINGER
              domain · DNS · mail · SMTP
                         │
                         ▼
   ┌──────────────────────────────────────────────┐
   │                 VERCEL  (lhr1)               │
   │                                              │
   │   app/       routing shell                   │
   │   frontend/  browser only                    │
   │   backend/   server only                     │
   │   shared/    isomorphic                      │
   │                                              │
   │   + KV (QR set · rate limits)                │
   │   + Cron (hold release · placement expiry)   │
   │   + Firewall (challenge · rate rules)        │
   └───────┬──────────────────────────┬───────────┘
           │                          │
           ▼                          ▼
   ┌────────────────────┐   ┌────────────────────────┐
   │   AI GATEWAY       │   │   FIREBASE             │
   │  route · meter ·   │   │                        │
   │  redact · failover │   │  Auth   · Firestore    │
   └─────────┬──────────┘   │  Storage · FCM         │
             │              │                        │
   ┌─────────┼──────────┐   │  CLOUD FUNCTIONS       │
   ▼         ▼          ▼   │  ── Admin SDK ──       │
 Claude   Gemini     OpenAI │  ticket issuance       │
 (reason) (volume) (embeds) │  wallet ledger         │
                            │  admin credit grants   │
                            └────────────────────────┘
                                       │
                    Stripe ────────────┴──────────── BitriPay
                   cards · payouts          mobile money · CDF
```

**The four layers are already in the repository and enforced by lint** (`14`). Nothing
in this document changes them; it changes what sits underneath.

### The three AI providers, and what each is for

All behind one gateway (`07` §7.5a). No service imports a provider SDK, so the split
below is a routing table rather than an architectural commitment.

| Provider | Routed work | Why this one |
| --- | --- | --- |
| **Claude** | Agent reasoning, planning, support, adversarial review | Strongest on long-context analysis and following a constraint |
| **Gemini** | High-volume classification, extraction, short generation | Cheapest per token at volume; already wired via Genkit |
| **OpenAI** | Embeddings, semantic search, tertiary fallback | `text-embedding-3-large` is the best-value embedding model |

Three providers is the two-provider minimum (`01` §1.5.1) with margin. Any one of them
going down routes to the next; all three down falls through to the deterministic path,
which is already the shipped behaviour in `PersonalizedRecommendations.tsx`.

**Embeddings deliberately sit with a different provider from reasoning.** An embedding
model change silently invalidates every stored vector — they are not comparable across
models — so the provider that owns embeddings should be the one you change least
often.

---

## 22.3 The one recommendation that differs from the blueprint

The blueprint specifies **NestJS microservices behind Kong**: eight services, Pub/Sub
between them, GKE throughout.

**Recommendation: do not start there.** Start with route handlers plus service modules
in one deployment, and extract services when a specific pressure appears.

### Why

| Microservices from day one | What actually happens |
| --- | --- |
| Independent scaling | Everything scales together anyway at launch volume |
| Independent deploys | One team, so deploys are coordinated regardless |
| Fault isolation | Achieved — but so is a distributed transaction across ticket, payment and inventory |
| Technology freedom | Nobody wants a different language for the ticket service |

The costs are immediate and the benefits arrive later: a network hop and a partial
failure mode for every call that was a function call, distributed tracing before there
is anything to trace, and **the oversell race in `08` §8.8 becoming genuinely hard**.
`SELECT … FOR UPDATE` plus `CONSTRAINT no_oversell` is a five-line solution inside one
transaction and a saga across three services.

### What to extract, and when

| Extract | Trigger |
| --- | --- |
| **Agent plane** | Phase 3, or the first time an agent job affects web latency |
| **Scan service** | When door traffic needs independent scaling for on-sale-day events |
| **Webhook receiver** | When provider retries start competing with user traffic |
| Everything else | When a measurement says so, not before |

The agent plane is first because its failure mode is genuinely different: a
crash-looping agent, a runaway token spend or a stuck job must not touch checkout
(`06` §6.19).

**Kong is not needed at this scale.** Rate limiting, auth and routing are already in
Vercel Firewall plus middleware. Kong earns its place when there are many services and many
partner integrations — Phase 3 at the earliest.

---

## 22.4 Frontend

| Concern | Choice | Reason |
| --- | --- | --- |
| Rendering | RSC by default, `'use client'` at the leaves | Event pages need to be indexable |
| Server cache | TanStack Query | Deduping, background refetch, retry — do not rebuild it |
| Client store | Zustand | Cart and UI state; ~1KB, no provider tree |
| Forms | React Hook Form + Zod | Same schema validates client and server |
| Styling | Tailwind + the existing 28 primitives | Already shipped |
| Mobile | React Native (Expo) for organiser and gate | The door needs the camera and offline storage |

**Do not put server data in Zustand.** Server data has staleness, refetch and error
semantics that a client store does not model, and hand-rolling them is where most
frontend complexity comes from.

### The door app is the one that must be native

Offline-tolerant scanning (`04` M16) needs a signed local valid-set, background sync and
reliable camera access. A PWA gets close and fails in the specific place it matters: a
venue basement with no signal, at 19:00, with a queue.

---

## 22.5 Backend

```
app/api/*/route.ts     parse · authorise · delegate · format     ← thin
backend/services/*     business logic, transactional             ← testable
backend/payments/*     provider adapters                         ← swappable
backend/ai/*           behind the gateway                        ← metered
shared/*               types, pricing, contracts                 ← isomorphic
```

Four rules, already lint-enforced:

1. **Route handlers hold no business logic.** `/api/checkout` is 70 lines of parsing and
   one adapter call.
2. **Services own transactions.** Anything touching two tables opens one.
3. **`import 'server-only'` on every backend module.** Build error rather than a leaked
   secret.
4. **Providers behind an interface.** Swapping SendGrid for Brevo is one adapter.

### The three privileged operations

Ticket issuance, ledger writes and admin credit grants cannot run with client
credentials (`14` §14.5). In Postgres they become `SECURITY DEFINER` functions owned by
a role the application cannot assume — `post_ledger_entry()` in `08` §8.14 is the
worked example.

---

## 22.6 Shared

Already correct, and worth stating why so it stays that way.

| Contains | Never contains |
| --- | --- |
| Domain types | DOM or Node APIs |
| Constants — billing, categories, countries | Secrets |
| Pure logic — `settle`, `applyCoupon`, `availableInTier` | Network calls |
| Repository interface | A concrete database driver |

`shared/pricing.ts` is the argument for the layer: the organiser dashboard, the payout
service and the admin audit all call `settle()`, so they cannot disagree about what the
platform is owed. Before it existed the same formula was written out by hand in four
files.

---

## 22.7 Deployment

### Environments

| Environment | Purpose | Data |
| --- | --- | --- |
| `preview` | Every PR, automatic | Seeded, disposable |
| `staging` | Pre-release, provider sandboxes | Anonymised copy |
| `production` | Live | Live |

**The build succeeds with no credentials.** That property is what makes previews and CI
possible, and it is already true — `isFirebaseConfigured` returns inert handles rather
than throwing (`14`).

### Pipeline

```
push ──▶ typecheck ──▶ lint (layer boundaries) ──▶ build ──▶ secret scan
                                                        │
                                        rules tests (on rules change)
                                                        │
                                              preview deploy
                                                        │
                                    merge ──▶ staging ──▶ smoke ──▶ production
```

Ordered cheapest-first: a type error fails in seconds rather than after a four-minute
build.

### Release

Blue/green with progressive traffic — 5% → 25% → 50% → **human approval for 100%** —
and automatic rollback on error-rate breach. `release_management.v1` (`03` §3.7) holds
L3 for rollback only.

### Runtime

| Setting | Value |
| --- | --- |
| Health | `/api/health` — 503 only if the datastore is missing |
| Regions | `lhr1` (London) primary; `cpt1` for African traffic at Phase 3 |
| Pooling | PgBouncer, sized against p99 |
| Pre-warm | Against `ticket_types.sale_starts_at` (`07` §7.12) |

**Pre-warming is the one non-obvious operational requirement.** On-sale is a step
function — 100× baseline for ninety seconds — and autoscaling reacts in tens of seconds.
The platform already knows the on-sale minute, so capacity is provisioned before it
rather than discovered during it.

---

## 22.8 What stands between here and production

Honest, ordered, and none of it is speculative.

### Blocking

| # | Item | Effort | Why |
| --- | --- | --- | --- |
| 1 | **Provision the 11 providers** (`21` §21.1) | 1 week | Stripe and Sumsub have human review |
| 2 | **PostgreSQL migration** (`19`) | 17 weeks | Or launch on Firestore and accept D1/D2 |
| 3 | **Admin SDK wiring** — issuance, ledger | 1 week | D1 and D2; tickets cannot be issued server-side today |
| 4 | **Rules or RLS test suite** | 1 week | `13` §13.4 marks it blocking. Every policy needs a deny test |
| 5 | **Redis QR invalidation** | 3 days | Duplicate scans are possible under concurrent load |
| 6 | **Idempotency keys** on orders and payments | 3 days | Double-charge defence |
| 7 | **Rate limiting** on auth and checkout | 2 days | `11` §11.13 |
| 8 | **Error tracking** wired to Sentry | 1 day | Currently blind in production |
| 9 | **Cookie consent** before any non-essential cookie | 2 days | EU/UK legal requirement |
| 10 | **Real Terms and Privacy**, reviewed by counsel | External | The drafts are placeholders |

### Not blocking, but do it before scale

Load test at 3× projected peak · backup restore rehearsal · runbooks for the five most
likely incidents · on-call rotation · CSP with per-route nonces.

### The honest assessment

**The catalogue, checkout and door paths work.** What is missing is the operational
layer around them: server-side issuance, tested authorisation, idempotency, rate
limiting, and someone watching.

That is roughly **four weeks of focused work** on Firestore, or four weeks plus the
migration on Postgres. The features are further along than the operations, which is the
normal shape and the one worth naming rather than discovering.

---

## 22.9 The launch decision

Two viable paths. The difference is when the migration happens, not whether.

| | **A — Launch on Firestore** | **B — Migrate first** |
| --- | --- | --- |
| To launch | ~4 weeks | ~20 weeks |
| Oversell risk | Real, mitigated by holds | Eliminated by constraint |
| Money as float | Yes | No |
| Ledger atomicity | Admin SDK batch, best effort | Transactional |
| Migration | Later, with live data and real users | Now, with seed data |
| Best when | Getting to first revenue matters most | Enterprise or stadium contracts are already in sight |

**Recommendation: A, with two conditions.**

Launch on Firestore, but do it with the migration path in `19` already written — it is —
and with **the repository interface in place from day one** (`19` §22.3). That interface
is what makes the migration touch one module instead of forty-three routes, and it costs
nothing to build now.

The second condition: **cap the oversell exposure explicitly.** Hold inventory during
checkout with a short TTL and accept a small oversell rate on the last few tickets of
high-demand tiers, rather than pretending the race does not exist. An event that
oversells by two seats is a refund and an apology; an event that oversells by two hundred
is a news story.

Migrating with real users is harder than migrating with seed data. It is also the only
version where you know what the load actually looks like — and `19` is designed so every
phase is a stable resting state precisely because that migration will get deprioritised
at least once.

---

## 22.10 Deployment runbook — Hostinger · Vercel · Firebase

The adopted stack (`21` §21.12). Six vendors, no new ones, in the order they must be
done.

### Step 1 — Hostinger

| Task | Detail |
| --- | --- |
| Domain | `ticketroyality.com` |
| Nameservers | **Keep Hostinger's.** DNS is managed here |
| Mailboxes | `info@` (published contact), `noreply@`, `security@` |
| SMTP | Note host, port 465 (SSL) or 587 (STARTTLS), and the credentials |

### Step 2 — DNS records

Add after Vercel gives you the target values. Vercel will show the exact CNAME.

| Type | Name | Value | Purpose |
| --- | --- | --- | --- |
| `A` | `@` | `76.76.21.21` | Apex → Vercel |
| `CNAME` | `www` | `cname.vercel-dns.com` | www → Vercel |
| `MX` | `@` | Hostinger's MX, priority 10 | Mail stays with Hostinger |
| `TXT` | `@` | `v=spf1 include:_spf.hostinger.com ~all` | SPF |
| `TXT` | `default._domainkey` | Hostinger's DKIM value | DKIM |
| `TXT` | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:info@ticketroyality.com` | DMARC |
| `CNAME` | `mail` | Hostinger webmail | Webmail |

**Start DMARC at `p=quarantine`, not `p=reject`.** Reject on day one bounces your own
mail the first time a record is slightly wrong, and the failure is silent — you find out
when a customer says their ticket never arrived. Move to `p=reject` after two weeks of
clean aggregate reports.

**The MX records are the ones to get right first.** Point the apex at Vercel before mail
is configured and `info@ticketroyality.com` starts bouncing, on the address printed
across the whole site.

### Step 3 — Firebase

| Task | Detail |
| --- | --- |
| Project | Production project, separate from any dev project |
| Auth | Email/password; add Google and Apple sign-in |
| Authorised domains | `ticketroyality.com`, `www.`, and the Vercel preview domain |
| Firestore | **Production mode**, `europe-west2` |
| Rules | `firebase deploy --only firestore:rules` |
| Indexes | Deploy composite indexes before first query, not after the error |
| Storage | Bucket in the same region, rules deployed |
| Cloud Functions | Node 20, `europe-west2` — the privileged runtime (`21` §21.12) |
| Service account | Generate for Functions; **never** commit or place in Vercel env |

**Region matters and cannot be changed.** Firestore location is fixed at creation. Pick
`europe-west2` for UK/EU proximity and GDPR posture; moving later means exporting and
re-importing everything.

### Step 4 — Vercel

| Task | Detail |
| --- | --- |
| Import | This repository, `claude/optimistic-heisenberg-0n2w42` → main |
| Region | `lhr1` (London) — set in `vercel.json` |
| Domain | Add `ticketroyality.com`; Vercel issues the certificate |
| KV | Create a store — QR one-time set, rate limits |
| Cron | Picked up from `vercel.json` automatically |
| Firewall | Enable Attack Challenge Mode; rate-limit `/login`, `/register`, `/api/checkout` |
| Env | Per §22.11, scoped Production and Preview separately |

### Step 5 — Payments

| Task | Detail |
| --- | --- |
| Stripe | Activate the account — **this has human review, start it first** |
| Webhook | `https://ticketroyality.com/api/stripe-webhook`; store the signing secret |
| Events | `checkout.session.completed`, `charge.refunded`, `payment_intent.payment_failed` |
| BitriPay | Production credentials; register the callback URL |
| Test | One real card payment end to end **before** announcing anything |

### Step 6 — Verify before announcing

```
□ https://ticketroyality.com resolves, valid certificate, www redirects
□ /api/health returns 200 and status "healthy"
□ Mail from info@ arrives and does not land in spam (check SPF/DKIM/DMARC pass)
□ Register → verify → login works on a clean device
□ Buy a ticket with a real card; confirmation email arrives
□ Scan that ticket at /events/[id]/check-in — accepted
□ Scan it again — refused as duplicate
□ Refund it; money returns; ticket shows refunded
□ robots.txt and sitemap.xml serve, and the sitemap lists real events
□ Rich Results Test passes on an event page
□ Lighthouse: performance > 85, accessibility > 95 on mobile
□ Firestore rules: an unauthenticated client cannot read another user's ticket
```

**The last line is the one to test by hand, with `curl`, not by clicking around.** The
UI will not let you attempt it; an attacker will not use the UI.

---

## 22.11 Environment variables

| Variable | Where | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Vercel | `https://ticketroyality.com`. **Set explicitly** — see `shared/site.ts` |
| `NEXT_PUBLIC_FIREBASE_*` | Vercel | Public by design, protected by rules |
| `STRIPE_SECRET_KEY` | Vercel, Production only | Never in Preview |
| `STRIPE_WEBHOOK_SECRET` | Vercel | Per endpoint |
| `BITRIPAY_CLIENT_ID` / `_SECRET` | Vercel | |
| `ANTHROPIC_API_KEY` | Vercel | Behind the AI Gateway |
| `KV_REST_API_URL` / `_TOKEN` | Vercel | Injected when KV is linked |
| `CRON_SECRET` | Vercel | Without it the cron routes 401 by default |
| `QR_SIGNING_KEY` | Vercel + Functions | **Per environment.** Staging must not sign production tickets |
| `FIREBASE_SERVICE_ACCOUNT` | **Functions only** | Never in Vercel, never in the repo |

**Preview deployments get sandbox keys or nothing.** A preview with a live Stripe key is
a branch away from taking real money for an event that does not exist.

---

## 22.12 What this stack does not give you

Stated plainly, so nobody discovers it during an incident.

| Gap | Consequence | Mitigation now | Fix later |
| --- | --- | --- | --- |
| No Cloudflare bot management | Weaker scalping defence | Server-side ticket limits, velocity checks (`11` §11.13) | Cloudflare in front of Vercel |
| Hostinger SMTP, not a delivery platform | No bounce webhooks, no suppression, shared IP reputation | Monitor manually; keep volume low | Resend, $20 |
| Firestore contention at on-sale peak | Checkout slows under a hot tier counter | **Sharded counters** (`21` §21.12) | Postgres (`19`) |
| Firebase Storage is not a CDN | Egress cost on a viral event | Vercel image optimisation caches at the edge | R2 |
| No APM | Slow endpoints found by complaint | Vercel Analytics + Sentry | Better Stack |
| Single region | UK/EU fast, DRC ~200ms | Acceptable | `africa-south1` replica |

**None of these blocks launch.** Every one has a named trigger and a named fix, which is
the difference between a constraint you have chosen and one you have not noticed.

The row to watch first is email. A ticket that does not arrive is indistinguishable from
fraud to the person who paid for it.
