# 07 — System Architecture

## 7.1 Topology

```
                            ┌──────────────────┐
   Browser · Mobile ───────▶│   CLOUDFLARE     │  WAF · DDoS · bot mgmt · CDN
   Partner API clients      │   edge           │  rate limit · cache
                            └────────┬─────────┘
                                     │
                            ┌────────▼─────────┐
                            │  FIREBASE APP    │  Next.js 15 App Router
                            │    HOSTING       │  SSR · RSC · route handlers
                            └────────┬─────────┘
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        ▼                            ▼                            ▼
┌───────────────┐          ┌──────────────────┐         ┌──────────────────┐
│  API GATEWAY  │          │  AGENT CONTROL   │         │  CLOUD FUNCTIONS │
│ auth · quota  │          │  PLANE           │         │ webhooks · cron  │
│ versioning    │          │ policy · runtime │         │ privileged writes│
└───────┬───────┘          └────────┬─────────┘         └────────┬─────────┘
        │                           │                            │
        └───────────────┬───────────┴────────────────────────────┘
                        ▼
        ┌───────────────────────────────────────────────┐
        │              DATA PLANE                       │
        │  Firestore (OLTP) · BigQuery (OLAP)           │
        │  Redis (cache/session) · Vector (embeddings)  │
        │  Cloud Storage (media) · Pub/Sub (events)     │
        └───────────────────────────────────────────────┘
```

### Why this shape

- **Edge first.** Cloudflare absorbs DDoS, bots and scalper traffic before it costs
  compute. Ticket on-sales are the single most adversarial traffic pattern in
  consumer software; the first line of defence must be free at the margin.
- **App Hosting for the web tier.** SSR plus RSC keeps time-to-first-byte low on
  catalogue pages, which are the SEO surface and therefore the acquisition channel.
- **Cloud Functions for privileged writes.** Anything the client is forbidden from
  doing — minting tickets, writing the ledger, granting credit — runs here with the
  Admin SDK, behind the same policy engine.
- **Separated OLTP and OLAP.** Firestore serves the transaction; BigQuery serves the
  question. Running analytics against the transactional store is how a platform gets
  slow at exactly the moment it gets popular.

## 7.2 Runtime layers

**Target stack.** Where it differs from what this repository runs today, both are
shown — the same discipline `08` §8.1 applies to the datastore.

| Layer | Target | Shipped today | Responsibility |
| --- | --- | --- | --- |
| Edge | Cloudflare | — | WAF, DDoS, bot management, CDN, rate limiting |
| Web | Next.js App Router on Vercel | Next.js 15, Firebase App Hosting | SSR, RSC, route handlers |
| Client state | Zustand + TanStack Query | React state | Client store, server cache |
| Mobile | React Native (Expo) — organiser, gate, fan | — | `04` M16 |
| i18n | `next-intl` — English (UK), French (DRC), Lingala planned | — | Market coverage |
| API | NestJS services behind Kong | Route handlers in `app/api` | Public REST, webhooks, partners |
| Agents | Agent Orchestrator service | Genkit flows | Agent runtime, orchestration, memory |
| **AI** | **AI Gateway** (§7.5a) | Direct Genkit → Gemini | One door to every model provider |
| Jobs | BullMQ on Redis | Cloud Functions v2 | Scheduled agent runs, campaigns, payouts |
| Realtime | Socket.io on Cloud Run | Firestore listeners | Scan broadcast, live dashboards |
| Bus | Pub/Sub | — | The platform event taxonomy from M9 |
| Containers | Docker on GKE | — | Agent plane only (`06` §6.19) |
| OLTP | **PostgreSQL** (Cloud SQL) | Firestore | Authoritative state — `08`, `19` |
| Cache | Redis (Memorystore) | — | QR hash set, sessions, rate limits |
| OLAP | BigQuery | — | Analytics, forecasting, ML features |
| Search | PostgreSQL FTS, Elasticsearch above ~1M events | Client-side filter | `08` §8.7 |
| Vector | pgvector, Pinecone at scale | — | `06` §6.13 |
| Media | Cloudflare R2 + CDN | Firebase Storage | Images, PDFs, recordings |

### Two deliberate departures from the source specification

**Firestore is not retained for user profiles.** Keeping profiles in a document store
while orders, tickets and payments move to Postgres puts a foreign key across a network
boundary — `orders.user_id` could not be enforced, and the access-control functions in
`08` §8.16 join against `users` on every policy check. Profiles go to Postgres with
everything else.

Firestore's genuine strength here is **live fan-out**, which is why realtime moves to
Socket.io rather than being kept as a second database. One authoritative store, one
broadcast channel.

**Search starts as a Postgres index, not Elasticsearch.** `events_search_idx`
(`08` §8.7) is sufficient below roughly a million events and removes an entire
operational dependency. Elasticsearch is specified as the escalation, triggered by
measured p95, not adopted on day one.

## 7.3 The transactional core

**Firestore is authoritative for anything a user can see change in under a second.**
Everything else derives from it.

### Consistency requirements

| Operation | Guarantee | Mechanism |
| --- | --- | --- |
| Ticket issuance | Exactly once | Idempotency key on the provider event id |
| Ticket redemption | Exactly once | `valid → redeemed` transition guarded in security rules |
| Inventory decrement | No oversell | Firestore transaction on the tier counter |
| Wallet debit | No negative balance | Transaction with a pre-read balance check |
| Payout | Exactly once | Idempotency key + state machine |

### The oversell problem

Naive `sold++` allows oversell under concurrency. The correct implementation reserves
inventory inside a transaction, before payment:

```ts
await runTransaction(db, async (tx) => {
  const tierRef = doc(db, 'events', eventId, 'tiers', tierId);
  const snap = await tx.get(tierRef);
  const tier = snap.data() as TicketTier;

  const available = tier.quantity - tier.sold - tier.held;
  if (available < quantity) throw new InsufficientInventoryError(available);

  // Hold, don't sell. Payment may still fail.
  tx.update(tierRef, { held: tier.held + quantity });
  tx.set(doc(db, 'holds', holdId), {
    tierId, quantity, userId,
    expiresAt: Date.now() + 15 * 60 * 1000,   // 15-minute checkout window
  });
});
```

Payment success converts the hold to a sale. Payment failure or expiry releases it via
a scheduled sweeper running every minute. **Never decrement inventory on an unpaid
intent, and never wait for payment before reserving it.**

## 7.4 Event-driven architecture

Every state change publishes to Pub/Sub using the M9 taxonomy. Consumers are
independent and individually replayable.

```
                        ┌─────────────┐
   State change ───────▶│   PUB/SUB   │
                        └──────┬──────┘
        ┌──────────────┬───────┼───────┬──────────────┐
        ▼              ▼       ▼       ▼              ▼
  ┌──────────┐  ┌──────────┐ ┌───┐ ┌────────┐  ┌───────────┐
  │ Analytics│  │  Agent   │ │ N │ │ Audit  │  │ Webhook   │
  │ BigQuery │  │ triggers │ │ o │ │  log   │  │ delivery  │
  └──────────┘  └──────────┘ │ t │ └────────┘  └───────────┘
                             │ i │
                             │ f │
                             └───┘
```

**Delivery semantics:** at-least-once. Every consumer is idempotent on `event.id`.
**Ordering:** guaranteed per `ordering_key` (typically `eventId` or `userId`), not
globally. Global ordering is a scalability trap and is not required by any consumer.
**Replay:** every topic retains 7 days. A consumer bug is fixed by deploying and
replaying, not by manual data repair.

## 7.5 AI plane

```
┌────────────────────────────────────────────────────────────┐
│                    AGENT CONTROL PLANE                     │
│                                                            │
│  ┌────────────┐   ┌────────────┐   ┌──────────────────┐    │
│  │ORCHESTRATOR│──▶│   POLICY   │──▶│  AGENT RUNTIME   │    │
│  │ route·plan │   │deny-default│   │  Genkit flows    │    │
│  └────────────┘   └────────────┘   └────────┬─────────┘    │
│                                             │              │
│  ┌──────────────────────────────────────────▼───────────┐  │
│  │                    MEMORY                            │  │
│  │  Working (Redis) · Episodic (Firestore)              │  │
│  │  Semantic (Vector) · Procedural (Firestore)          │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  TOOLS — every kernel write goes through the policy   │  │
│  │  engine. There is no direct database access.          │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### Tool contract

An agent never touches Firestore. It calls declared tools, and every tool re-checks
authority at execution time — the policy check at plan time is not sufficient, because
state can change between plan and execute.

```ts
interface AgentTool<TInput, TOutput> {
  name: string;
  description: string;             // the model reads this
  inputSchema: JSONSchema;
  requiredScopes: Scope[];
  reversible: boolean;
  costEstimateAcu: number;

  execute(
    input: TInput,
    context: { principalId: string; agentId: string; traceId: string }
  ): Promise<TOutput>;
}
```

**Every `execute` implementation begins with a scope re-check and ends with an audit
write. Both are enforced by a shared wrapper, not left to the tool author.**

### Retrieval-augmented generation

| Store | Contents | Refresh |
| --- | --- | --- |
| Event embeddings | Title + description + category | On event write |
| Knowledge base | Support articles, policies | On publish |
| Agent semantic memory | Learned facts per principal | On decision outcome |
| Market benchmarks | k-anonymised aggregates (k ≥ 5) | Nightly |

**Retrieval is scope-filtered before the vector search, not after.** Filtering after
retrieval leaks: the model has already seen the cross-tenant content. The tenant
predicate is a pre-filter on the index.

## 7.5a The AI Gateway

**One internal door to every model provider.** No service, agent or route handler calls
Anthropic, Google or OpenAI directly.

```
   agents · support · recommendations · ad copy · risk scoring
                            │
                            ▼
        ┌───────────────────────────────────────────┐
        │              AI GATEWAY                   │
        │                                           │
        │  routing · failover · metering · budgets  │
        │  redaction · caching · logging · evals    │
        └───┬──────────────┬──────────────┬─────────┘
            ▼              ▼              ▼
      Anthropic        Google         OpenAI
      Claude       Gemini / Vertex    GPT · embeddings
            │              │              │
            └──────────────┴──────────────┘
                           ▼
                 deterministic fallback
```

### Why a gateway rather than three SDKs

`01` §1.5.1 says no single vendor may sit on a path the platform cannot operate
without. For models that rule is unusually hard to honour without a gateway, because
provider SDKs leak into call sites: prompt formats, tool-calling shapes, streaming
semantics and error taxonomies all differ. Ten services each importing a vendor SDK is
ten places to change when a provider has an outage, a price rise or a policy shift.

One door means switching provider is a routing-table change.

### What it owns

| Concern | Behaviour |
| --- | --- |
| **Routing** | Task class → provider → model. A table, not a model decision |
| **Failover** | Primary unavailable or breaker open → secondary, same request, one retry |
| **Metering** | Every call priced at provider cost × 4 into ACU. **The only place cost is measured** |
| **Budgets** | Per agent, per principal, per chain. Hard ceilings, enforced before dispatch |
| **Redaction** | PII stripped from prompts before egress; identity documents never leave (`06` §6.4) |
| **Caching** | Identical prompt + model + params inside a TTL returns the cached completion |
| **Logging** | Provider, model version, prompt hash, tokens, latency, outcome — to `agent_runs` |
| **Evaluation** | Golden sets run against any model or version change before it takes traffic |
| **Rate limiting** | Per provider quota, shared fairly across services |

### Routing table

```
task ∈ {agent reasoning, planning, support, adversarial review}  → Claude
task ∈ {high-volume classification, extraction, short-gen}       → Gemini Flash
task ∈ {embeddings}                                              → OpenAI / text-embedding
task ∈ {rerank}                                                  → Cohere
data_residency == 'eu-only'                                      → Vertex, europe-west
primary breaker open                                             → secondary
all providers unavailable                                        → deterministic fallback
```

**Routing is deterministic.** A model choosing which model to call is a loop with no
authority boundary and no cost ceiling — the same reasoning that keeps payment routing
out of `payments.v1`'s discretion (`03` §3.5).

### Metering in one place is the point

The ACU system already meters at a single door (`/api/ai` today, `15` §15.5). The
gateway generalises it: as services multiply, cost visibility survives only if there is
exactly one place a token can be spent. Two doors means two cost models, and the second
one is always the one nobody instruments.

### Model version pinning

Every route pins an explicit model version. Providers deprecate and silently reroute
aliases; a pinned version means behaviour changes when we change it, not when a vendor
ships.

> **Model IDs must be current at build time.** The blueprint names
> `claude-sonnet-4-20250514`, which is superseded — the current Claude family is
> **Opus 5, Sonnet 5, Fable 5** and **Haiku 4.5**. Pin the latest appropriate model per
> route and re-check at each version change, because a spec that ships with a stale
> model ID gets copied into code and quietly runs a generation behind.

### Failure semantics

Inherited from `03` §3.2 and unchanged: retry twice with jittered backoff, then
secondary, then the deterministic path. **Fail-open for recommendation and content;
fail-closed for anything gating money or identity.**

## 7.6 Data plane

### Storage selection

| Data | Store | Rationale |
| --- | --- | --- |
| Events, tickets, users, orders | Firestore | Real-time listeners, security rules, sub-100ms reads |
| Analytics, ML features | BigQuery | Columnar, cheap scans, SQL |
| Sessions, hot catalogue | Redis | Sub-ms, TTL semantics |
| Embeddings | Vertex Matching Engine | ANN at scale |
| Images, PDFs, recordings | Cloud Storage / R2 | Object storage with CDN egress |
| Audit log | Firestore + BigQuery export | Real-time write, immutable, queryable |

### Firestore → BigQuery

Streaming export via the Firestore extension. Analytics reads never touch the
transactional store. Latency is 2–5 seconds, which is acceptable for every analytical
use case and unacceptable for none of them.

### Caching

| Layer | TTL | Invalidation |
| --- | --- | --- |
| Cloudflare edge (public catalogue) | 60s | Purge by tag on event write |
| Next.js RSC cache | 300s | `revalidateTag` on write |
| Redis hot events | 30s | Explicit delete on write |
| Client SWR | 10s | Refetch on focus |

**Never cache:** ticket status, inventory counts, wallet balances, scan results. A
stale ticket status admits someone twice; a stale inventory count oversells.

## 7.7 Scalability

### Load profile

Ticketing load is not smooth. It is dominated by on-sale spikes.

| Scenario | Concurrent users | RPS | Duration |
| --- | --- | --- | --- |
| Steady state | 500 | 200 | Continuous |
| Major on-sale | 50,000 | 15,000 | 5–10 minutes |
| Door scanning | 200 operators | 400 | 60 minutes |
| Livestream start | 20,000 | 3,000 | 2 minutes |

**A 75× spike over 30 seconds** is the design point. Autoscaling alone does not solve
it — cold starts arrive after the spike has already failed.

### On-sale strategy

1. **Virtual waiting room** at the edge (Cloudflare). Users are admitted at a
   controlled rate. This is the single most effective control, and it is edge-side, so
   it costs nothing at origin.
2. **Pre-warm** to the projected concurrency 10 minutes before on-sale. Scheduled, not
   reactive.
3. **Inventory in Redis** during the sale, reconciled to Firestore asynchronously.
   Redis handles the contention; Firestore holds the truth.
4. **Queue-based checkout.** A holding token guarantees a 15-minute window, so the user
   is not racing.
5. **Graceful degradation.** Under extreme load, disable recommendations, search
   facets and analytics. **Never** disable checkout or scanning.

### Scaling limits and mitigations

| Limit | Value | Mitigation |
| --- | --- | --- |
| Firestore writes/document | 1/second | Shard hot counters into 10 sub-documents |
| Firestore collection | Unlimited | — |
| Cloud Run instances | 1,000/region | Multi-region |
| Pub/Sub throughput | Effectively unlimited | — |
| Gemini rate limit | Per-project quota | Request queue + deterministic fallback |

**Counter sharding** is required for any tier that will see > 1 sale/second:

```
tiers/{tierId}/shards/{0..9}   each holding a partial count
available = quantity − Σ(shard.sold) − Σ(shard.held)
```

Reads sum 10 documents; writes hit one random shard. Contention drops 10×.

## 7.8 Observability

### The four signals

| Signal | Tool | Retention |
| --- | --- | --- |
| Metrics | Cloud Monitoring | 90 days |
| Logs | Cloud Logging | 30 days hot, 400 days archived |
| Traces | OpenTelemetry → Cloud Trace | 30 days |
| Errors | Sentry | 90 days |

### SLOs

| Service | SLI | Target | Error budget |
| --- | --- | --- | --- |
| Catalogue | p95 latency | < 400ms | 0.1%/28d |
| Checkout | Success rate | > 99.5% | 0.5%/28d |
| **Scan** | **p95 latency** | **< 200ms** | **0.05%/28d** |
| Webhook delivery | Delivered < 5s | > 99.9% | 0.1%/28d |
| Agent invocation | Success rate | > 98% | 2%/28d |
| API | Availability | > 99.95% | 0.05%/28d |

**Scanning has the tightest budget deliberately.** A slow catalogue costs a
conversion. A slow gate creates a physical queue of real people outside a real
building, which is a safety issue before it is a product issue.

### Alerting

| Severity | Trigger | Response |
| --- | --- | --- |
| **Sev-1** | Checkout or scanning down | Page immediately, 24/7 |
| **Sev-2** | Error budget burning > 10×, payment provider down | Page in business hours, ticket otherwise |
| **Sev-3** | Single connector degraded, non-critical | Ticket, next business day |
| **Sev-4** | Anomaly detected, no user impact | Dashboard only |

`reliability.v1` triages every alert, correlates it against recent deploys, forms a
hypothesis, and either executes a matching runbook (L2) or pages with the hypothesis
attached (L1). A page that arrives with a probable cause already stated is worth
several minutes of MTTR.

## 7.9 Deployment

```
feature branch → PR → CI (lint · typecheck · unit · integration · e2e · rules tests)
              → preview deploy (isolated Firebase project)
              → review + agent evaluation gate
              → merge to main
              → staging deploy → smoke tests
              → canary 5% → 25% → 100% (automated rollback on SLO burn)
```

**CI gates — merge is blocked on all six:**
1. `tsc --noEmit` clean.
2. ESLint clean.
3. Unit coverage ≥ 80% on changed files.
4. **Firestore rules tests pass** (`@firebase/rules-unit-testing`) — every role,
   every collection, positive and negative cases.
5. **Agent golden-set evaluation** shows no regression.
6. Build succeeds and bundle size is within budget.

Rule 4 deserves emphasis: security rules are the actual authorisation layer. An
untested rules change is an untested authorisation change.

**Canary rollback** is automatic if, during the canary window, error rate rises above
2× baseline, p95 latency rises above 1.5× baseline, or checkout success falls below
99%. No human decision is required to roll back — only to roll forward.

## 7.10 Disaster recovery

| Metric | Target |
| --- | --- |
| **RPO** (max data loss) | 5 minutes |
| **RTO** (max downtime) | 30 minutes |

### Backups

| Data | Method | Frequency | Retention |
| --- | --- | --- | --- |
| Firestore | Managed export to GCS | Hourly | 30 days |
| Firestore PITR | Point-in-time recovery | Continuous | 7 days |
| BigQuery | Snapshot | Daily | 90 days |
| Cloud Storage | Dual-region + versioning | Continuous | 90 days |
| Secrets | Cloud Secret Manager versions | On change | 10 versions |

### Scenarios

| Scenario | Response | RTO |
| --- | --- | --- |
| Region failure | Fail over to secondary; Firestore multi-region is automatic | 15 min |
| Data corruption | PITR to the last known-good timestamp | 30 min |
| Bad deploy | Automated canary rollback | 5 min |
| Payment provider down | Route to secondary provider | 2 min |
| Total account compromise | Break-glass in an isolated project from backup | 4 hours |

**Restore drills run quarterly, in staging, with the result recorded.** A backup that
has never been restored is a hypothesis, not a backup.

## 7.11 Business continuity

**Degraded modes, in priority order.** When capacity is constrained, this is what
survives:

| Priority | Function | Must survive |
| --- | --- | --- |
| **1** | **Door scanning** | Yes — offline-capable, works with the platform entirely down |
| **2** | **Checkout** | Yes — at reduced feature richness |
| 3 | Catalogue browse | Yes — from cache if necessary |
| 4 | Dashboards | Degraded to cached data |
| 5 | Agents | Suspended |
| 6 | Analytics | Suspended |

**Offline scanning is the backstop for total platform failure.** The manifest is
pre-downloaded to the operator's device; the scanner validates locally against it and
queues admissions for reconciliation. An event can run its entire door with our
platform completely offline. This is the difference between an incident and a
catastrophe, and it is the reason offline scanning is specified as a requirement and
not a nice-to-have.

---

## 7.12 Regions, scale and the availability target

### Regions

| Region | Serves | Holds |
| --- | --- | --- |
| `europe-west2` (London) | UK, EU | UK/EU personal data, primary OLTP |
| `africa-south1` (Johannesburg) | DRC, pan-African | African market data and read replicas |

**Johannesburg serving DRC is a cross-border transfer**, not a local deployment. DRC
personal data leaving the DRC engages whatever transfer rules apply there, and those
rules are not the GDPR's. Marked `OPEN` alongside the KODA position in `20` §20.3 —
same counsel, same gate, because both questions are asked of the same regulator.

Latency from Kinshasa to Johannesburg is acceptable; the question is legal, not
technical.

### Scaling

| Surface | Approach |
| --- | --- |
| Ticket service | GKE horizontal autoscale, 100+ pods at on-sale peak |
| Event pages | Cloudflare Workers, edge-rendered, sub-100ms TTFB target |
| Analytics | 3 PostgreSQL read replicas — zero load on the transactional primary |
| Media | R2 + CDN |

**On-sale is the only load pattern that matters.** Traffic is not diurnal — it is a
step function at a published minute, often 100× baseline for 90 seconds. Autoscaling
reacts in tens of seconds, which is too slow for a spike that is over in ninety.

The mitigation is **pre-warming against a known on-sale time**, which the platform
already knows from `ticket_types.sale_starts_at` (`08` §8.8). Capacity is provisioned
ahead of the minute rather than discovered during it.

### The availability target contradicts the recovery target

| Stated | Value | Implication |
| --- | --- | --- |
| SLA | 99.99% | **52.6 minutes** of downtime per year, total |
| RPO | 15 minutes | Up to 15 minutes of writes lost on failover |
| RTO | 1 hour | **60 minutes** to restore service |

**A single regional failover consumes the entire annual error budget and overruns it.**
One failover event at a 1-hour RTO puts the year at 98.86% for that incident alone —
before any deploy, any dependency outage, any bad release.

These cannot both be targets. Three coherent options:

| Option | SLA | RTO | Cost |
| --- | --- | --- | --- |
| **A** Active-passive, honest SLA | 99.9% (8.8h/yr) | 1 hour | Lowest |
| **B** Active-passive, fast failover | 99.95% (4.4h/yr) | 10 minutes | Moderate — rehearsed, automated |
| **C** Active-active multi-region | 99.99% | < 1 minute | Highest — multi-region writes, conflict resolution |

**Recommendation: B for Phase 3, C only if enterprise contracts require 99.99% in
writing.** Option C's cost is not the infrastructure, it is multi-region write
consistency — and taking that on before the volume justifies it buys an availability
figure nobody has asked for with a correctness risk everyone will feel.

Publishing 99.99% while operating a 1-hour RTO is worse than publishing 99.9% and
meeting it. The first is a number that will be quoted back during an incident.

### Observability

| Layer | Tool |
| --- | --- |
| APM and distributed tracing | Datadog |
| Structured logging | JSON, correlation id propagated across every service |
| Error tracking | Sentry |
| Alerting and on-call | PagerDuty |
| Agent traces | `agent_runs` (`08` §8.15), joined to Datadog by run id |

**Every log line carries the correlation id, and agent runs carry it too.** A trace that
stops at the boundary of the agent plane makes the most complex part of the system the
least debuggable — the point where "the platform did something odd" needs an answer.
