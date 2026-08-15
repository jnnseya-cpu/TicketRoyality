# Go live — step by step

> Read `/STATUS.md` first. It lists what is actually built and what is not.
> This file tells you how to deploy; that file tells you what you are deploying.

---

## Where everything goes

This is the question that keeps coming back, so it is answered first.

**There is no separate frontend and backend deployment.** `src/frontend`,
`src/backend` and `src/shared` are folders inside **one** Next.js application. The
separation is a compile-time boundary enforced by lint rules (`docs/14`), not a runtime
one. They build together and deploy together, as one thing.

There are exactly **three deployable artefacts**:

| # | Artefact | Goes to | Deployed by | Contains |
| --- | --- | --- | --- | --- |
| 1 | The Next.js app | **Firebase App Hosting** → Cloud Run, `europe-west2` | Git push (auto) | Every page, every `/api/*` route, both webhooks — i.e. frontend **and** backend |
| 2 | `functions/` | **Cloud Functions v2**, `europe-west2` | `firebase deploy --only functions` | Ticket issuance, refunds, email delivery, reconciliation, audits |
| 3 | Rules & indexes | **Firestore + Storage** | `firebase deploy --only firestore:rules,firestore:indexes,storage` | `firestore.rules`, `firestore.indexes.json`, `storage.rules` |

Plus **Hostinger**, which keeps the domain and the mailbox. Nothing moves off it —
you point DNS at Firebase and leave `MX` alone.

Why `functions/` is separate: `firebase deploy` uploads **only** that directory, so it
is its own npm package with its own `package.json` and `node_modules`. It never ships
inside the app bundle and the app never imports it at runtime.

Why the app is on App Hosting rather than Firebase Hosting: App Hosting runs a real
Node server on Cloud Run with the `runConfig` in `apphosting.yaml` (CPU, memory,
`minInstances`, concurrency, 300 s timeout for AI calls) and pulls secrets from Secret
Manager. `firebase.json` deliberately has **no** `hosting` block — having one would
build and deploy the same app a second way on a plain `firebase deploy`, ignoring
`apphosting.yaml` entirely.

```
                    ticketroyality.com  (Hostinger DNS, Hostinger MX)
                              │
                              ▼
              ┌─────────────────────────────────┐
              │  Firebase App Hosting           │  ← artefact 1
              │  Cloud Run · europe-west2       │
              │  Next.js: frontend + backend    │
              └───────────────┬─────────────────┘
                              │ writes payment_events
                              ▼
              ┌─────────────────────────────────┐
              │  Cloud Functions v2             │  ← artefact 2
              │  issuance · refunds · email     │
              └───────────────┬─────────────────┘
                              ▼
              ┌─────────────────────────────────┐
              │  Firestore + Storage            │  ← artefact 3 (rules)
              └─────────────────────────────────┘
```

---

## Before you start

Run this locally. Everything must pass; all of it passes on this branch today.

```bash
npm ci
npm run typecheck      # app + the functions contract guard
npm run lint
npm run build
npm test               # 20 tests: issuance (emulator) + delivery (real SMTP)
npm run check:links
cd functions && npm ci && npm run build && cd ..
```

Then serve the real production artefact and walk the pages a buyer walks:

```bash
npm run start          # node .next/standalone/server.js — what Cloud Run executes
```

`npm run start` is **not** `next start`. `next start` refuses to serve an
`output: 'standalone'` build: it prints "Ready" and exits, so nothing listens on the
port and it looks like a slow boot.

---

## Step 1 — Firebase project (5 min)

```bash
npm i -g firebase-tools
firebase login
firebase projects:create ticketroyality-prod     # or create it in the console
firebase use ticketroyality-prod
```

In [console.firebase.google.com](https://console.firebase.google.com):

- **Upgrade to Blaze.** Required for App Hosting and Cloud Functions. Free tiers still
  apply — Blaze is a billing account, not a charge.
- **Set a budget alert at £20.** Do not skip this.
- **Firestore → Create database → Production mode → `europe-west2`.**
  This region is permanent. Changing it later means export and re-import.
- **Authentication → Sign-in method → Email/Password → Enable.**
- **Storage → Get started → same region.**

Everything must be `europe-west2`: Firestore, Storage, App Hosting and Functions. A
function in a different region from Firestore pays a cross-region round trip on every
transaction read, which is the slowest part of issuance.

## Step 2 — Rules and indexes (1 min)

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

**Rules go up before the app, not after.** A query without its index fails at runtime,
for users rather than for you. This deploy also creates the locks on `payment_events`
and `issued_payments` — a forged payment event would mint free tickets, so the app must
never reach a database where those collections are writable.

## Step 3 — Secrets (5 min)

```bash
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_API_KEY
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_PROJECT_ID
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_APP_ID
```

Values come from **Project settings → Your apps → Web app → SDK setup**.

That is enough to publish. Payments, AI and email can follow — the app degrades
honestly without them (`/api/health` reports which dependency is missing, checkout says
Stripe is not configured, AI features say so).

## Step 4 — Deploy the app (5 min)

```bash
firebase apphosting:backends:create --project ticketroyality-prod
```

Connect the GitHub repo, pick the branch, choose `europe-west2`. It builds in roughly
four minutes and gives you a live URL:

```
https://ticketroyality-prod--<backend>.europe-west2.hosted.app
```

**The site is live at this point.** Frontend and backend both — they are the same
deployment. Every later push to that branch redeploys automatically.

## Step 5 — Deploy the functions (5 min)

Separate artefact, separate command. The app does not carry them.

```bash
cd functions && npm ci && npm run build && cd ..
firebase deploy --only functions
```

The first run prompts to enable the **Cloud Scheduler API** — accept it, or
`reconcilePayments`, `auditInventory` and `expireStalePayments` deploy but never fire.

Five functions should appear:

| Function | Trigger | Job |
| --- | --- | --- |
| `onPaymentEvent` | `payment_events` created | Issue tickets, or reverse a refund |
| `onTicketsIssued` | `issued_payments` created | Email the buyer their tickets |
| `reconcilePayments` | every 10 min | Catch dropped triggers |
| `auditInventory` | daily 03:00 | Report tier counter drift |
| `expireStalePayments` | daily 04:00 | Archive failed payment events |

## Step 6 — Your domain (10 min + DNS propagation)

Firebase console → **App Hosting → Add custom domain → `ticketroyality.com`.**
It gives you records. Add them in **Hostinger → Domains → DNS**:

| Type | Name | Value |
| --- | --- | --- |
| `A` | `@` | (the IP Firebase shows) |
| `TXT` | `@` | (the verification token Firebase shows) |
| `CNAME` | `www` | (the target Firebase shows) |

**Do not touch the `MX` records.** Mail stays with Hostinger — and the ticket emails
are sent through that same Hostinger mailbox, so breaking `MX` breaks ticket delivery
as well as your inbox.

Certificates issue automatically once verification passes: minutes to a few hours.

---

## Turning on the money

Everything above publishes the site. This makes it sell.

### Stripe

```bash
firebase apphosting:secrets:set STRIPE_SECRET_KEY
firebase apphosting:secrets:set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
firebase apphosting:secrets:set STRIPE_WEBHOOK_SECRET
```

In the Stripe dashboard, add the webhook endpoint:

```
https://ticketroyality.com/api/stripe-webhook
```

Subscribe it to `checkout.session.completed` and `charge.refunded`. Take the signing
secret it shows and set it as `STRIPE_WEBHOOK_SECRET` above.

### KODA / mobile money

```bash
firebase apphosting:secrets:set KODA_SECRET_KEY
firebase apphosting:secrets:set KODA_WEBHOOK_SECRET
```

The registered endpoint is `https://ticketroyality.com/webhooks/koda` and **must not
change** without re-registering with KODA first. A moved webhook URL fails silently:
KODA keeps posting to the old path, gets a 404, retries for 24 hours, and the first
symptom is a customer saying they paid and got nothing.

### Ticket delivery email

The functions read non-secret mail settings from `functions/.env` (committed —
host, port, user, from address). Only the password is a secret, and it belongs to
Cloud Functions, **not** App Hosting:

```bash
firebase functions:secrets:set SMTP_PASSWORD          # for the functions
firebase apphosting:secrets:set SMTP_PASSWORD          # for the app
firebase deploy --only functions                       # re-deploy to bind it
```

Both are needed and they are separate stores: `apphosting:secrets` reaches the Next.js
app, `functions:secrets` reaches the functions. The password is the mailbox password
for `info@ticketroyality.com` in Hostinger.

If `functions/.env` says `smtp.hostinger.com` and your mailbox lives elsewhere, change
it there and redeploy the functions.

---

## Verify it actually works

Do these in order. Each one catches a different failure.

**1. The app is up and healthy.**

```bash
curl -s https://ticketroyality.com/api/health | jq
```

Must be `200` with `"status": "healthy"`. A `503` with `datastore: configured=false`
means the Firebase secrets did not reach the runtime.

**2. Pages render with styling.** Open the homepage. If it renders as unstyled text,
`.next/static` did not ship — `npm run build` runs `postbuild` to copy it into the
standalone tree, because Cloud Run has no CDN in front of it.

**3. A real purchase, end to end.** Use a Stripe test card (`4242 4242 4242 4242`) on a
cheap live event. Then check, in order:

| Check | Where | Expected |
| --- | --- | --- |
| Webhook arrived | Stripe dashboard → webhook → recent deliveries | `200` |
| Event recorded | Firestore → `payment_events` | one doc, `status: issued` |
| Tickets minted | Firestore → `tickets` | one doc per ticket, `status: valid` |
| Inventory consumed | Firestore → `events/{id}` | `ticketTiers[].sold` incremented |
| Email sent | Firestore → `issued_payments/{id}` | `delivery: "sent"` |
| Email received | the buyer's inbox | subject "Your ticket for …" |
| Ticket visible | `/dashboard/customer/wallet` | the ticket with its QR |

If `delivery` is `skipped`, SMTP is unconfigured — the password did not reach the
functions. If it starts `failed:`, the reason is on the document.

**4. Refund it.** Refund the payment in Stripe. The ticket should become `refunded` and
the tier's `sold` count should go back down.

---

## Watch these after launch

| Signal | Meaning | Action |
| --- | --- | --- |
| `/api/health` ≠ 200 | A dependency is unconfigured | Check which; `datastore` false means nothing works |
| `payment_events.status == 'oversold'` | Someone paid, no ticket can be issued | **Refund them.** Not automatic |
| `payment_events.status == 'failed'` | Issuance gave up after 5 attempts | A person must look |
| `payment_events` stuck `pending` > 10 min | The reconciliation sweep is not running | Check Cloud Scheduler is enabled |
| `issued_payments.delivery` starts `failed:` | Tickets issued, email did not send | Check SMTP credentials |
| Function log `inventory drift` | A tier counter disagrees with issued tickets | Investigate before trusting capacity |

---

## Cost

`apphosting.yaml` sets **`minInstances: 1`** — one instance warm at all times, no cold
starts, **about £25/month from the day you deploy**, before a single visitor.

Change it to `0` while testing and everything sits in the free tiers at roughly
**£0–5 for the first month** plus the domain, at the cost of a few seconds of cold
start after an idle period. Set it back to `1` on the day you have buyers waiting.

Cloud Functions and Firestore stay inside the free tier at launch volume. Full model in
`docs/21` §21.13.

---

## Rollback

App Hosting keeps every build. Console → **App Hosting → Rollouts → the previous
build → Rollback.** Takes about a minute.

Functions do not roll back through the console — redeploy from a known-good commit:

```bash
git checkout <good-sha> -- functions/
cd functions && npm run build && cd .. && firebase deploy --only functions
```

**Never roll back `firestore.rules` to a version that predates `payment_events`.**
Those rules are what stop a client forging a payment event and minting free tickets.
