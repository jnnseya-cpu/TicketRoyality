# Deploy — publish today

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

---

## Cost today

With `minInstances: 0` in `apphosting.yaml` — which is what you want until real users
arrive — everything sits inside the free tiers. **Roughly £0–5 for the first month**,
plus the domain.

Set `minInstances: 1` on the day you have buyers; it removes cold starts and costs
about £25/month. Full model in `docs/21` §21.13.

---

## What works the moment it is live

- Full event catalogue, search, filters, calendar, map
- Event pages with `Event` JSON-LD — eligible for Google's events carousel
- Organiser directory and profiles
- Registration, login, all three dashboards
- Blog with dynamically linked articles
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

## What still blocks taking real money

Server-side ticket issuance runs through Cloud Functions and is not wired yet
(`docs/22` §22.11, item 2). Until it is, a Stripe payment completes but the ticket is
not minted server-side.

**Publish today, sell when that lands.** They are separate milestones and it is worth
being clear which one you are at.
