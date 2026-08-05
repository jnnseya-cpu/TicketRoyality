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
| Datastore | **PostgreSQL** + RLS | Firestore | `08` §8.1 |
| Cache | Redis | In-memory | QR invalidation must be shared across instances |
| Agent plane | **Separate deployment** from Phase 3 | In-process forever | A crash-looping agent must not take checkout down |
| AI access | **One gateway** (`07` §7.5a) | Direct SDK calls | Metering, failover, redaction in one place |
| Hosting | Vercel, with a Docker escape hatch | Platform lock-in | `Dockerfile` ships; Cloud Run is a config change |

---

## 22.2 The shape

```
                          Cloudflare
                    WAF · DDoS · bots · CDN
                              │
              ┌───────────────┴────────────────┐
              ▼                                ▼
   ┌────────────────────┐          ┌────────────────────────┐
   │   WEB (Vercel)     │          │   AGENT PLANE (Cloud   │
   │                    │          │   Run / GKE, Phase 3)  │
   │  app/     routing  │          │                        │
   │  frontend/ browser │          │  scheduled agent runs  │
   │  backend/  server  │──────────│  long jobs · webhooks  │
   │  shared/   both    │          │                        │
   └─────────┬──────────┘          └───────────┬────────────┘
             │                                 │
             └──────────────┬──────────────────┘
                            ▼
          ┌─────────────────────────────────────┐
          │  PostgreSQL (Neon) · RLS enforced   │
          │  Redis (Upstash) · QR set, limits   │
          │  R2 · media                         │
          └─────────────────────────────────────┘
                            │
                  AI Gateway ──▶ Claude · Gemini · OpenAI
```

**The four layers are already in the repository and enforced by lint** (`14`). Nothing
in this document changes them; it changes what sits underneath.

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
Cloudflare plus middleware. Kong earns its place when there are many services and many
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
