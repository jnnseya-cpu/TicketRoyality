# Deploy — publish today

> **Read `/STATUS.md` first.** It lists what is actually built and what is not.
> This file tells you how to deploy; that file tells you what you are deploying.

`frontend/`, `backend/` and `shared/` are **folders in one Next.js application**, not
three deployable services. They ship together in a single build. The layer separation
is a compile-time boundary enforced by lint (`docs/14`), not a runtime one.

**One command deploys all three.**

---

## The 20-minute path

### 1 — Firebase project (5 min)

```bash
npm i -g firebase-tools
firebase login
firebase projects:create ticketroyality-prod    # or use the console
firebase use ticketroyality-prod
```

In the console (console.firebase.google.com):

- **Upgrade to Blaze.** Required for App Hosting. Bills nothing inside the free tiers.
- **Set a budget alert at £20** while you are there. Do not skip this.
- **Firestore → Create database → Production mode → `europe-west2`.**
  This region is permanent — changing it later means export and re-import.
- **Authentication → Sign-in method → Email/Password → Enable.**
- **Storage → Get started → same region.**

### 2 — Rules and indexes (1 min)

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

Rules go up **before** the app. A query without its index fails at runtime, for users
rather than for you.

### 3 — Secrets (5 min)

Only these are needed to publish. Everything else has a working fallback.

```bash
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_API_KEY
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_PROJECT_ID
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_APP_ID
```

Values come from **Project settings → Your apps → Web app → SDK setup**.

Payments and AI can wait — the app runs without them and degrades honestly:
`/api/health` reports `degraded`, AI features say so, checkout says Stripe is not
configured.

### 4 — Deploy (5 min)

```bash
firebase apphosting:backends:create --project ticketroyality-prod
```

Connect the GitHub repo, pick the branch, and it builds. Roughly four minutes. You get
a live URL immediately:

```
https://ticketroyality-prod--<backend>.europe-west2.hosted.app
```

**You are published at this point.** The domain is step 5 and is not required to be
live.

Every later push to that branch redeploys automatically.

### 5 — Your domain (10 min + DNS propagation)

Firebase console → **App Hosting → Add custom domain → `ticketroyality.com`.**
It gives you records. Add them in Hostinger → Domains → DNS:

| Type | Name | Value |
| --- | --- | --- |
| `A` | `@` | (the IP Firebase shows) |
| `TXT` | `@` | (the verification token Firebase shows) |
| `CNAME` | `www` | (the target Firebase shows) |

**Do not touch the `MX` records.** Mail stays with Hostinger; only web traffic moves.

Certificates issue automatically once verification passes — minutes to a few hours.

---

## Before you push the button

```bash
npm run build          # must pass
npx tsc --noEmit       # must pass
npx eslint src --max-warnings=0
```

All three pass on the current branch.

### Then run it, and look at it

A green build is not a working app. Serve the real production artefact locally and
walk the pages a buyer will walk:

```bash
npm run start          # serves .next/standalone on :3000
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/
```

`npm run start` runs `node .next/standalone/server.js`, **not** `next start`. This is
not a stylistic choice: `next start` refuses to serve a `output: 'standalone'` build
and exits after printing "Ready", so it looks like it worked and then nothing is
listening on the port. The standalone server is also exactly what Cloud Run executes,
so this is the deployed runtime rather than an approximation of it.

`npm run build` triggers `postbuild`, which copies `.next/static` (and `public/` if it
exists) into the standalone tree. Next leaves these out because the canonical
deployment puts a CDN in front. There is no CDN here — the Node process serves
everything — so without the copy every page returns HTML whose stylesheets and scripts
all 404, and the site renders unstyled and inert.

Verified on the current branch, against the standalone server:

| Check | Result |
| --- | --- |
| Every page route (46 + 37 blog) | 200 |
| Every internal `href` (23) | 200 — no broken links |
| `/_next/static` CSS and JS | 200 — assets served |
| `/webhooks/koda` unsigned + bad signature | 401 |
| `/api/cron/*` without `CRON_SECRET` | 401 |
| `/api/checkout` unconfigured | 303 → `/checkout/cancel`, no session created |
| `/api/ai`, `/api/stripe-webhook` unconfigured | 503 — fails closed |
| `/api/health` with no env | 503, `datastore: configured=false` |

The two 503s and the health failure are correct behaviour for a machine with no
secrets, not defects. They are the signal to check after deploying: once Secret
Manager is populated, `/api/health` must return 200.

---

## Cost today

`apphosting.yaml` currently sets **`minInstances: 1`**, which keeps one instance warm
at all times: no cold starts, and **about £25/month from the day you deploy**, before a
single visitor.

If you want the free-tier bill while you are still testing, change it to `0` before
deploying. Everything then sits inside the free tiers at **roughly £0–5 for the first
month** plus the domain, at the cost of a few seconds of cold start on the first
request after an idle period.

Set it back to `1` on the day you have buyers waiting. Full model in `docs/21` §21.13.

---

## What works the moment it is live

- Full event catalogue, search, filters, calendar, map
- Event pages with `Event` JSON-LD — eligible for Google's events carousel
- Organiser directory and profiles
- Registration, login, all three dashboards
- Blog: 14 published articles across 6 topic hubs, with contextual inline links
  generated from a registry (16 further articles are held as drafts because they
  describe features that are not built — see `/STATUS.md`)
- `robots.txt`, `sitemap.xml`, security headers
- `/api/health`

## What needs a key you have not added yet

| Feature | Needs | Behaviour without it |
| --- | --- | --- |
| Card checkout | `STRIPE_SECRET_KEY` | Cancel page says Stripe is not configured |
| Mobile money | `BITRIPAY_*` | Option hidden |
| AI features | `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` | Deterministic fallbacks, labelled |
| Maps | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Text address panel |

None of these block publishing. Add them and redeploy when you have them.

## Taking real money

Server-side ticket issuance is wired. A confirmed payment now mints tickets through a
Cloud Function using the Admin SDK, inside a transaction that also consumes inventory.

The flow:

```
provider ──webhook──▶ signature verified ──▶ payment_events/{providerEventId}
                                                      │  Firestore trigger
                                                      ▼
                                        transaction: write tickets
                                                     consume tier inventory
                                                     write issued_payments marker
```

Deploy the functions alongside the app — they are a **separate deploy** and the app
does not carry them:

```bash
cd functions && npm install && npm run build && cd ..
firebase deploy --only functions
firebase deploy --only firestore:rules      # payment_events + issued_payments are new
```

Cloud Scheduler is used by the reconciliation and audit jobs. The first
`firebase deploy --only functions` will prompt to enable the Cloud Scheduler API if it
is not already on; accept it, or the scheduled functions deploy but never fire.

### Verify it before you trust it

```bash
npm run test:issuance
```

Ten tests against the Firestore emulator — real transactions, not mocks, because every
failure worth catching here is an atomicity or concurrency failure and a mock has
neither property. They cover: issuance and inventory consumption, replayed webhooks
issuing nothing further, two concurrent buyers racing for the last two tickets with
exactly one winning, oversell refusal, missing event and missing tier as terminal
rather than retried, refunds returning inventory, double refunds not double-returning
it, and a redeemed ticket never being silently reversed.

All ten pass on the current branch.

### What is deliberately not automatic

A payment that confirms after its tier has sold out records `status: 'oversold'` and
issues nothing. Money has moved and no ticket can legally be issued, so it needs a
refund and a person — the function logs it as an error rather than resolving it
quietly. Watch for `oversold` and `failed` in `payment_events`; both mean somebody paid
and is holding nothing.
