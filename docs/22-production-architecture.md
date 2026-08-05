# 22 — Production Architecture & Deployment

**Adopted: five vendors.** Hostinger for the domain, Firebase for everything the
platform runs on, Stripe and BitriPay for money, three model providers behind one
gateway.

Vercel is not in the stack. §22.3 explains why, because the reason is technical rather
than preferential and it drives several other decisions.

---

## 22.1 The stack

| Layer | Provider | Component |
| --- | --- | --- |
| Domain, DNS, mail | **Hostinger** | `ticketroyality.com`, MX, SMTP |
| Web + SSR + API | **Firebase App Hosting** | Next.js on Cloud Run, `europe-west2` |
| Privileged writes | **Cloud Functions v2** | Admin SDK — issuance, ledger, grants |
| Scheduled work | **Cloud Scheduler** | Hold release, placement expiry, digests |
| Auth | **Firebase Auth** | Email, Google, Apple, MFA |
| Data | **Firestore** | Authoritative state, rules-enforced |
| Media | **Firebase Storage** | Event and organiser images |
| Push | **Firebase FCM** | Phase 2 |
| Payments | **Stripe · BitriPay** | Cards and payouts · mobile money |
| AI | **Claude · Gemini · OpenAI** | Behind the gateway (`07` §7.5a) |

**Five accounts.** Cost depends entirely on stage, and the four are an order of
magnitude apart (`21` §21.13):

| Stage | Monthly |
| --- | --- |
| Build and test — `minInstances: 0`, free tiers | **£3–15** |
| Live but quiet — `minInstances: 1`, first events | **£33–55** |
| Operating — ~50k views, ~500 tickets | **£70–150** |
| Paying organisers — plus mandatory KYB and AML | **£600+** |

Starting costs almost nothing. The step to £600 is compliance, not infrastructure.

---

## 22.2 The shape

```
                         HOSTINGER
                 domain · DNS · MX · SMTP
                             │
                             ▼
   ┌─────────────────────────────────────────────────────┐
   │        FIREBASE APP HOSTING  (Cloud Run, lhr)       │
   │                                                     │
   │   app/       routing shell + route handlers         │
   │   frontend/  browser only                           │
   │   backend/   server only                            │
   │   shared/    isomorphic                             │
   │                                                     │
   │   minInstances: 1   →  no cold start                │
   │   timeoutSeconds: 300 →  AI work fits               │
   │   concurrency: 80   →  one instance, many requests  │
   └───────┬─────────────────────────────────┬───────────┘
           │                                 │
           ▼                                 ▼
   ┌────────────────────┐        ┌──────────────────────────┐
   │    AI GATEWAY      │        │   CLOUD FUNCTIONS v2     │
   │  route · meter ·   │        │   ── Admin SDK ──        │
   │  redact · failover │        │                          │
   └─────────┬──────────┘        │  issueTickets()          │
             │                   │  postLedgerEntry()       │
   ┌─────────┼──────────┐        │  grantCredit()           │
   ▼         ▼          ▼        │  onPaymentWebhook()      │
 Claude   Gemini    OpenAI       │  scheduled jobs          │
(reason) (volume)  (embeds)      └────────────┬─────────────┘
                                              │
   ┌──────────────────────────────────────────▼───────────┐
   │  FIRESTORE  ·  AUTH  ·  STORAGE  ·  FCM              │
   │  rules-enforced authorisation on every read & write  │
   └──────────────────────────────────────────────────────┘
                             │
          Stripe ────────────┴──────────── BitriPay
        cards · payouts            mobile money · CDF
```

Everything runs in **one Google Cloud project, one region**. There is no cross-provider
network hop on any request path.

---

## 22.3 Why not Vercel

Not preference — three concrete costs, and the third is the one that matters.

### Cold starts on the request a buyer is waiting for

A scale-to-zero serverless backend boots Node and initialises the Next.js server on the
first request after any idle period. Several seconds, paid by whoever arrives first.

App Hosting runs on Cloud Run, where **`minInstances: 1` removes this entirely** for
roughly a coffee a month. That single line is most of the "the backend feels slow"
complaint.

### Function timeouts that AI work does not fit inside

| Work | Typical duration |
| --- | --- |
| Full event build (`04` M22) | 35–45 ACU of model calls, **45s+** |
| Seat map from a floor plan (`04` M23) | Vision extraction, **60s+** |
| Evidence pack assembly (`03` §3.6) | Multiple retrievals, 20s+ |

Short serverless ceilings turn those into timeouts, and the workaround — queue, poll,
reassemble — is real engineering added to work around a platform limit. Cloud Run
allows up to 3600s; **`timeoutSeconds: 300`** is set in `apphosting.yaml` and nothing
here needs a queue.

### Two vendors where one will do

Firebase already holds auth, data, storage and the Admin SDK runtime. Putting the web
tier on a second platform adds a second deploy, a second secret store, a second set of
environment scopes and a network boundary between the app and its own database.

Removing it takes the stack from six vendors to five and removes an entire class of
"which environment has that key" problem.

**What is genuinely lost:** Vercel's preview deployments and edge network are better.
App Hosting gives per-branch previews and a single region — acceptable for a UK/EU
primary market, and revisited when African latency justifies a second region.

---

## 22.4 Frontend

| Concern | Choice | Reason |
| --- | --- | --- |
| Rendering | RSC by default, `'use client'` at the leaves | Event pages must be indexable (`04` M25) |
| Server cache | TanStack Query | Deduping, background refetch, retry |
| Client store | Zustand | Cart and UI state; ~1KB, no provider tree |
| Forms | React Hook Form + Zod | One schema validates client and server |
| Styling | Tailwind + the 28 shipped primitives | Already built |
| Realtime | Firestore listeners | Live scan counts, live sales — no second channel |
| Mobile | React Native (Expo) — organiser, gate | The door needs camera and offline storage |

**Do not put server data in Zustand.** Server data has staleness, refetch and error
semantics a client store does not model; hand-rolling them is where most frontend
complexity comes from.

**Firestore listeners replace a websocket layer.** Live dashboards and scan counts come
from the database the data is already in — no Socket.io service, no second scaling
concern, no state to reconcile between two channels.

### The door app must be native

Offline-tolerant scanning (`04` M16) needs a signed local valid-set, background sync and
reliable camera access. A PWA gets close and fails exactly where it matters: a venue
basement, no signal, 19:00, queue forming.

---

## 22.5 Backend

Two runtimes, split by **authority**, not by domain.

```
┌─── App Hosting ────────────────────────────────────────┐
│  app/api/*/route.ts   parse · authorise · delegate     │
│  backend/services/*   business logic                   │
│  backend/payments/*   provider adapters                │
│  backend/ai/*         behind the gateway               │
│                                                        │
│  Runs as the CALLER. Firestore rules apply.            │
└────────────────────────────────────────────────────────┘
                          │ invokes
                          ▼
┌─── Cloud Functions v2 ─────────────────────────────────┐
│  issueTickets()     a ticket for another user          │
│  postLedgerEntry()  ledger + balance, one transaction  │
│  grantCredit()      admin ACU grant                    │
│  onStripeWebhook()  verified, then issues              │
│                                                        │
│  Runs as ADMIN. Rules bypassed. Nothing else lives here│
└────────────────────────────────────────────────────────┘
```

### The split rule

**A function exists here only if `firestore.rules` correctly forbids the caller from
doing it.** Three operations qualify (`14` §14.5):

| Operation | Forbidden by |
| --- | --- |
| Issue a ticket for another user | `tickets` create requires `userId == request.auth.uid` |
| Write `wallet_ledger` | `create/update/delete: if false` for every client |
| Grant credit as an admin | Same |

Everything else stays in App Hosting and runs under the caller's own identity, where the
rules still apply. **A privileged runtime that accumulates convenience functions stops
being a boundary** — the whole value is that the list is short enough to audit.

### D1 and D2, closed

```js
// functions/src/ledger.ts — the shape, not the whole file
export const postLedgerEntry = onCall(async (request) => {
  assertAdmin(request.auth);
  return db.runTransaction(async (tx) => {
    const userRef = db.doc(`users/${uid}`);
    const before = (await tx.get(userRef)).data()?.wallet?.balanceAcu ?? 0;
    const after = before + delta;
    if (after < 0) throw new HttpsError('failed-precondition', 'insufficient');

    tx.create(db.collection('wallet_ledger').doc(), {
      uid, type, deltaAcu: delta,
      balanceBeforeAcu: before, balanceAfterAcu: after,
      reason, createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(userRef, { 'wallet.balanceAcu': after });
  });
});
```

One transaction. The entry and the balance land together or neither does — the guarantee
`17` §17.5 records as missing. Same shape closes ticket issuance.

### Four rules, already lint-enforced

1. Route handlers hold no business logic — `/api/checkout` is parsing plus one adapter call.
2. Services own transactions.
3. `import 'server-only'` on every backend module.
4. Providers behind an interface; swapping one is a single adapter.

---

## 22.6 Shared

| Contains | Never contains |
| --- | --- |
| Domain types | DOM or Node APIs |
| Constants — billing, categories, countries | Secrets |
| Pure logic — `settle`, `applyCoupon`, `availableInTier` | Network calls |
| Repository interface | A concrete database driver |

`shared/pricing.ts` is the argument for the layer: the organiser dashboard, the payout
path and the admin audit all call `settle()`, so they cannot disagree about what the
platform is owed. Before it existed, that formula was written out by hand in four files.

**`shared` is what makes the Cloud Functions split cheap.** A function and a route
handler import the same `buildTickets` and the same `buildEntry`; only the persistence
differs.

---

## 22.7 Data, cache and scheduling without extra vendors

| Need | Solution | Why not a separate service |
| --- | --- | --- |
| One-time QR invalidation | Firestore transaction on the ticket | The transaction *is* the guarantee. Redis would be a second source of truth about whether a ticket was used |
| Rate limiting | Firestore counter doc with TTL, per key | Adequate below thousands/minute; Memorystore if measured |
| Inventory counters | **Sharded counters** — N sub-docs per tier | Lifts the ~1 write/sec hot-document ceiling |
| Scheduled jobs | Cloud Scheduler → Functions | Native, in-project, retries built in |
| Search | Firestore composite indexes | Sufficient below ~100k events; then Algolia or Postgres FTS |
| Realtime | Firestore listeners | Already the database |

**The QR row is the one to understand.** A redeem is a transactional read-then-write on
one ticket document: two simultaneous scans of the same ticket, one commits, the other
retries and finds `status: 'redeemed'`. Introducing Redis would put the "has this been
used" answer in two places, and the interesting failures are the ones where they
disagree.

### Sharded counters, concretely

A tier's `sold` count is one document, and a hot document sustains roughly one write per
second. An on-sale spike is 100× baseline.

```
events/{id}/tiers/{tierId}/shards/{0..9}   each holding a partial count
write → pick a random shard, increment in a transaction
read  → sum the ten shards
```

Ten shards, ten writes per second, one day of work. The correctness was never in doubt —
`runTransaction` handles that — this raises the **throughput** ceiling, which is the
actual constraint (`21` §21.12).

---

## 22.8 Deployment

### Environments

| Environment | Firebase project | Data |
| --- | --- | --- |
| `preview` | Shared dev project | Seeded, disposable |
| `staging` | `ticketroyality-staging` | Anonymised copy |
| `production` | `ticketroyality-prod` | Live |

**Separate projects, not separate collections.** One project with a `staging_` prefix is
one typo away from a test run deleting production tickets.

### Pipeline

```
push ──▶ typecheck ──▶ lint (layer boundaries) ──▶ build ──▶ secret scan
                                                        │
                                        rules tests (on rules change)
                                                        │
                                          App Hosting preview per branch
                                                        │
                              merge ──▶ staging ──▶ smoke ──▶ production
```

Ordered cheapest-first: a type error fails in seconds, not after a four-minute build.

### Commands

```bash
firebase use production
firebase deploy --only firestore:rules,firestore:indexes,storage
firebase deploy --only functions
firebase deploy --only apphosting          # or push to the tracked branch
```

**Rules and indexes deploy before the code that depends on them.** A query without its
composite index fails at runtime, not at build, and it fails for users rather than for
you.

### Rollback

App Hosting keeps previous rollouts; rollback is selecting one. Functions are versioned
per deploy. **Rules are not** — keep them in git and redeploy the previous commit, which
is the only reason that works.

---

## 22.9 Runbook — first deployment

### Hostinger

| Type | Name | Value | Purpose |
| --- | --- | --- | --- |
| `A` | `@` | Firebase Hosting IP (given at domain setup) | Apex |
| `TXT` | `@` | Firebase verification token | Ownership |
| `CNAME` | `www` | Firebase target | www |
| `MX` | `@` | Hostinger MX, priority 10 | **Mail stays here** |
| `TXT` | `@` | `v=spf1 include:_spf.hostinger.com ~all` | SPF |
| `TXT` | `default._domainkey` | Hostinger DKIM | DKIM |
| `TXT` | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:info@ticketroyality.com` | DMARC |

**MX first, before the apex points anywhere.** Get this wrong and
`info@ticketroyality.com` — printed across the whole site — starts bouncing.

**DMARC at `p=quarantine`, not `p=reject`.** Reject on day one bounces your own mail the
first time a record is slightly off, and you learn about it when a customer says their
ticket never arrived. Move to reject after two clean weeks of aggregate reports.

### Firebase

```
1. Create ticketroyality-prod
2. Firestore → Production mode → europe-west2      ← cannot be changed later
3. Auth → email/password, Google, Apple
4. Auth → authorised domains: ticketroyality.com, www, preview
5. Storage → same region → deploy storage.rules
6. App Hosting → connect this repo → track main
7. Secret Manager → every secret named in apphosting.yaml
8. Functions → deploy the privileged codebase
9. Cloud Scheduler → hold release (1m), placement expiry (1h)
10. Custom domain → ticketroyality.com → certificate issues automatically
```

**Firestore region is permanent.** Moving later means exporting and re-importing
everything.

### Payments

Stripe activation has **human review — start it first.** Webhook to
`https://ticketroyality.com/api/stripe-webhook`, events
`checkout.session.completed`, `charge.refunded`, `payment_intent.payment_failed`.
BitriPay production credentials and callback URL.

### Verify before announcing

```
□ ticketroyality.com resolves, valid cert, www redirects
□ /api/health → 200, status "healthy"
□ Mail from info@ arrives, not spam; SPF/DKIM/DMARC all pass
□ Register → verify → login on a clean device
□ Buy a ticket with a real card; confirmation arrives
□ Scan it — accepted.  Scan again — refused as duplicate
□ Refund; money returns; ticket shows refunded
□ robots.txt and sitemap.xml serve; sitemap lists real events
□ Rich Results Test passes on an event page
□ Lighthouse mobile: performance > 85, accessibility > 95
□ curl as an unauthenticated client cannot read another user's ticket
□ Second request after 10 minutes idle is fast (minInstances working)
```

**Test the last two with `curl`, not by clicking.** The UI will not let you attempt the
first, and an attacker will not use the UI. The second is the whole reason for
`minInstances: 1`.

---

## 22.10 Environment and secrets

| Secret | Where | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_*` | Secret Manager, `BUILD` + `RUNTIME` | Public by design, protected by rules |
| `STRIPE_SECRET_KEY` | Secret Manager, `RUNTIME` | Production project only |
| `STRIPE_WEBHOOK_SECRET` | Secret Manager, `RUNTIME` | Per endpoint |
| `BITRIPAY_*` | Secret Manager, `RUNTIME` | |
| `ANTHROPIC_API_KEY` · `GEMINI_API_KEY` · `OPENAI_API_KEY` | Secret Manager, `RUNTIME` | Behind the gateway |
| `CRON_SECRET` | Secret Manager, `RUNTIME` | Without it the cron routes 401 by default |
| `QR_SIGNING_KEY` | Secret Manager, `RUNTIME` | **Per environment.** Staging must never sign production tickets |
| Admin credentials | **Nowhere** | Functions use the runtime service account — no key file exists to leak |

That last row is a real benefit of this arrangement: on a split stack you export a
service-account JSON and paste it into another platform's env. Here the Admin SDK picks
up the ambient identity and **the credential never exists as a file**.

---

## 22.11 What blocks production

| # | Item | Effort |
| --- | --- | --- |
| 1 | Provision the five vendors | 1 week (Stripe review) |
| 2 | **Cloud Functions: issuance + ledger** — D1, D2 | 1 week |
| 3 | Rules test suite, every policy with a deny test | 1 week |
| 4 | Sharded counters on tier inventory | 2 days |
| 5 | Idempotency keys on orders and payments | 3 days |
| 6 | Rate limiting on auth and checkout | 2 days |
| 7 | Error tracking wired up | 1 day |
| 8 | Cookie consent before any non-essential cookie | 2 days |
| 9 | Terms and Privacy reviewed by counsel | External |

**Roughly four weeks.** The catalogue, checkout and door paths already work; what is
missing is the operational layer around them, which is the normal shape and worth naming
rather than discovering.

Not blocking, but before scale: load test at 3× peak, restore rehearsal, runbooks for
the five likeliest incidents, on-call rotation, CSP with per-route nonces.

---

## 22.12 What this stack does not give you

| Gap | Consequence | Mitigation now | Fix later |
| --- | --- | --- | --- |
| No Cloudflare bot management | Weaker scalping defence | Server-side ticket limits, velocity checks (`11` §11.13) | Cloudflare in front |
| Hostinger SMTP is not a delivery platform | No bounce webhooks, no suppression, shared IP | Monitor manually at low volume | Resend, $20 |
| Firestore contention at on-sale peak | Slow checkout on a hot tier | **Sharded counters** | Postgres (`19`) |
| Storage is not a CDN | Egress on a viral event | `next/image` caching | R2 |
| Single region | UK/EU fast, DRC ~200ms | Acceptable at launch | `africa-south1` replica |
| No APM | Slow endpoints found by complaint | Cloud Monitoring + Sentry | Better Stack |

**None of these blocks launch**, and each has a named trigger — the difference between a
constraint you chose and one you have not noticed.

Watch email first. A ticket that does not arrive is indistinguishable from fraud to the
person who paid for it.
