# Go live — step by step

> Read `/STATUS.md` first. It lists what is actually built and what is not.
> This file tells you how to deploy; that file tells you what you are deploying.

---

## The architecture, vendor by vendor

Four vendors. Nothing else is used, and nothing else is needed.

| Vendor | Runs | Why it and not the others |
| --- | --- | --- |
| **Hostinger** | Domain, DNS, and the `info@ticketroyality.com` mailbox that sends every ticket email over SMTP | You already own the domain. The mailbox comes with it, which is what keeps email off a separate email API. |
| **Firebase / Google Cloud** | The Next.js app (App Hosting → Cloud Run), Firestore, Auth, Storage, Cloud Functions, Scheduler, App Check, Maps, Gemini | One project, one region, one bill. Cloud Functions must live here regardless — they are Firestore triggers. |
| **Vercel** | Nothing today. Available as a fallback host for the app. | See below. |
| **AI providers** | Gemini, Claude and OpenAI — all three wired, tried in that order | Called over HTTPS from the app. Nothing is deployed to them. |

**There is no separate frontend and backend deployment.** `src/frontend`, `src/backend`
and `src/shared` are folders inside **one** Next.js application. The separation is a
compile-time boundary enforced by lint rules (`docs/14`), not a runtime one. They build
together and deploy together, as one thing.

So there are exactly **three deployable artefacts**:

| # | Artefact | Goes to | Shipped by |
| --- | --- | --- | --- |
| 1 | The Next.js app — every page, every `/api/*` route, both webhooks, i.e. frontend **and** backend | **Firebase App Hosting** → Cloud Run, `europe-west4` | Git push (automatic) |
| 2 | `functions/` — ticket issuance, refunds, email delivery, reconciliation, audits | **Cloud Functions v2**, `europe-west2` | `firebase deploy --only functions` |
| 3 | `firestore.rules`, `firestore.indexes.json`, `storage.rules` | **Firestore + Storage** | `firebase deploy --only firestore:rules,firestore:indexes,storage` |

```
   ┌── HOSTINGER ──────────────────────────────────────────────┐
   │  ticketroyality.com   DNS  ·  MX  ·  info@ mailbox (SMTP) │
   └──────────┬──────────────────────────────────▲─────────────┘
              │ A / CNAME                        │ ticket emails
              ▼                                  │
   ┌── FIREBASE / GOOGLE CLOUD ──────────────────┼─────────────┐
   │                                             │             │
   │  ┌───────────────────────────────┐          │             │
   │  │ App Hosting → Cloud Run       │  artefact 1            │
   │  │ Next.js: frontend + backend   │──────────┐             │
   │  │ pages · /api/* · webhooks     │          │ HTTPS       │
   │  └──────────────┬────────────────┘          ▼             │
   │                 │ writes           ┌──────────────────┐   │
   │                 ▼  payment_events  │  AI PROVIDERS    │   │
   │  ┌───────────────────────────────┐ │  Gemini  ──┐     │   │
   │  │ Cloud Functions v2            │ │  Claude  ──┤ any │   │
   │  │ issuance · refunds · email ───┼─┤  OpenAI  ──┘ one │   │
   │  │ reconciliation · audits       │ │  fallback chain  │   │
   │  └──────────────┬────────────────┘ └──────────────────┘   │
   │                 ▼                                         │
   │  ┌───────────────────────────────┐                        │
   │  │ Firestore · Storage · Auth    │  artefact 3 = rules    │
   │  └───────────────────────────────┘                        │
   └───────────────────────────────────────────────────────────┘

   VERCEL — on the account, deployed to by nothing. Fallback only.
```

Why `functions/` is a separate artefact: `firebase deploy` uploads **only** that
directory, so it is its own npm package with its own `package.json` and `node_modules`.
It never ships inside the app bundle and the app never imports it at runtime.

Why the app is on App Hosting rather than Firebase Hosting: App Hosting runs a real
Node server on Cloud Run with the `runConfig` in `apphosting.yaml` (CPU, memory,
`minInstances`, concurrency, 300 s timeout for AI calls) and pulls secrets from Secret
Manager. `firebase.json` deliberately has **no** `hosting` block — one would build and
deploy the same app a second way on a plain `firebase deploy`, ignoring
`apphosting.yaml` entirely.

### Vercel and the Hostinger VPS — yours, and deliberately unused

**Vercel** hosts Next.js natively and would work. It is not used because Cloud
Functions are Firestore triggers and cannot leave Firebase: moving the app to Vercel
puts the storefront on one platform and its ticket-issuance logic on another, and every
request from app to database becomes a cross-cloud hop. There is also the reason you
gave earlier — Vercel's function timeouts are the constraint that makes AI calls feel
slow, and `apphosting.yaml` sets 300 s precisely because a full event build runs past
sixty.

Switching later costs about an hour: Vercel auto-detects Next.js, and the environment
variables in `apphosting.yaml` map across one-for-one. The functions stay on Firebase
either way.

**The Hostinger VPS** would mean hand-managing TLS renewal, deploys, autoscaling and OS
patching for what App Hosting already does. Keep it for something that genuinely needs
a persistent box — a long-running worker, say. Nothing here needs one.

---

## Before you start

Run this locally. Everything must pass; all of it passes on this branch today.

```bash
npm ci
npm run typecheck      # app + the functions contract guard
npm run lint
npm run build
npm test               # 30 tests: issuance (emulator) + delivery (SMTP) + AI gateway
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
firebase projects:create ticketroyality     # or create it in the console
firebase use ticketroyality
```

In [console.firebase.google.com](https://console.firebase.google.com):

- **Upgrade to Blaze.** Required for App Hosting and Cloud Functions. Free tiers still
  apply — Blaze is a billing account, not a charge.
- **Set a budget alert at £20.** Do not skip this.
- **Firestore → Create database → Production mode → `europe-west2`.**
  This region is permanent. Changing it later means export and re-import.
- **Authentication → Sign-in method → Email/Password → Enable.**
- **Storage → Get started → same region.**

Keep Firestore, Storage and Functions together in `europe-west2`. A function in a
different region from Firestore pays a cross-region round trip on every transaction
read, which is the slowest part of issuance.

**App Hosting is the exception, and it is already deployed in `europe-west4`.** App
Hosting is not offered in every region, and the running backend is there now. That is
fine: it is a stateless HTTP frontend, so the hop it pays is Cloud Run to Firestore
within the same continent, not inside the ticket-issuance transaction. Do not move it
to "tidy up" — recreating a backend means re-doing the GitHub connection, the domain
and every secret grant.

## Step 2 — Rules and indexes (1 min)

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

**Rules go up before the app, not after.** A query without its index fails at runtime,
for users rather than for you. This deploy also creates the locks on `payment_events`
and `issued_payments` — a forged payment event would mint free tickets, so the app must
never reach a database where those collections are writable.

## Step 3 — Secrets

**The Firebase web config is already in `apphosting.yaml` as plain values.** There is
nothing to do for it, and it should not be moved into Secret Manager: every
`NEXT_PUBLIC_*` variable is inlined into the JavaScript bundle at build time, so all six
are already readable by anyone who opens the site. Storing a published value as a secret
adds six ways to break a deploy and protects nothing. What protects the data is
`firestore.rules`.

Everything else is off by default. Nothing below is required to be live — the app
degrades honestly without any of it, and `/api/health` names exactly which dependency is
missing.

### The three-command pattern

Every secret takes the same three steps, and skipping the middle one is the most common
way to break a rollout:

```bash
# 1. create it (prompts for the value; it is never typed on the command line)
firebase apphosting:secrets:set STRIPE_SECRET_KEY --project ticketroyality

# 2. let the backend's service account read it
firebase apphosting:secrets:grantaccess STRIPE_SECRET_KEY \
  --backend ticketroyality --project ticketroyality

# 3. uncomment that variable's block in apphosting.yaml, commit, push
```

**Create before you uncomment, always.** App Hosting fails the *entire* rollout when
`apphosting.yaml` names a secret that is not in Secret Manager — that takes down the
catalogue, the blog and every page needing no keys at all, not just the one feature.
This is why every secret block in that file ships commented out.

Without step 2 the deploy succeeds and the container fails to start with a permission
error, which is a much more confusing failure than a missing secret.

## Step 4 — Deploy the app (5 min)

```bash
firebase apphosting:backends:create --project ticketroyality
```

Connect the GitHub repo, pick the branch, choose `europe-west4`. It builds in roughly
four minutes and gives you a live URL:

```
https://ticketroyality--ticketroyality.europe-west4.hosted.app
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

Firebase console → **App Hosting → your `ticketroyality` backend → Add custom domain →
`ticketroyality.com`.** Firebase shows the exact records. Add them in **Hostinger →
Domains → `ticketroyality.com` → DNS / Nameservers**:

| Type | Name | Value | Notes |
| --- | --- | --- | --- |
| `TXT` | `@` | the verification token Firebase shows | Proves you own the domain. Add it first. |
| `A` | `@` | the IPv4 address Firebase shows | Usually two `A` records — add **both**. |
| `CNAME` | `www` | the target Firebase shows | So `www.ticketroyality.com` works too. |

Three things go wrong here, in order of how often:

1. **A parked-domain record already exists.** Hostinger points a new domain at its own
   landing page with an `A` record on `@`. Delete that one — do not add a second `A` on
   `@` beside it, or DNS will round-robin between Firebase and a parking page and the
   site will look broken to roughly half of visitors.
2. **`@` written as the full domain.** Hostinger's DNS editor wants `@` for the root.
   Entering `ticketroyality.com` creates `ticketroyality.com.ticketroyality.com`.
3. **Waiting on the wrong thing.** Verification is usually minutes; the TLS certificate
   can take up to 24 hours. A "not secure" warning in that window is normal and needs no
   action.

**Do not touch the `MX` records.** Mail stays with Hostinger — and ticket emails are
sent through that same `info@ticketroyality.com` mailbox, so breaking `MX` breaks ticket
delivery as well as your inbox. The same applies to any `TXT` record holding SPF
(`v=spf1 …`) or DKIM: leave them exactly as they are, and *add* the Firebase
verification `TXT` alongside rather than replacing anything.

Check propagation from outside your own network — your machine may have the old answer
cached for hours:

```bash
dig +short ticketroyality.com @8.8.8.8
dig +short TXT ticketroyality.com @8.8.8.8
```

### After the certificate issues

`NEXT_PUBLIC_SITE_URL` in `apphosting.yaml` is already `https://ticketroyality.com`, so
`sitemap.xml`, `robots.txt` and every canonical URL point at the real domain the moment
DNS resolves. Nothing to change.

But two registrations still carry the old `*.hosted.app` URL if you set them up earlier,
and both fail **silently** rather than loudly:

- **Stripe** → Developers → Webhooks → set the endpoint to
  `https://ticketroyality.com/api/stripe-webhook`.
- **KODA** → the registered endpoint must become
  `https://ticketroyality.com/webhooks/koda`.

A stale webhook URL means the customer pays, the provider posts to an address that
404s, retries for 24 hours, gives up — and the first symptom is somebody saying they
paid and got no ticket.

Also worth doing once the domain is live: restrict the Firebase browser API key to it
(Google Cloud console → APIs & Services → Credentials → HTTP referrers →
`ticketroyality.com/*`), so the key in your bundle cannot be used to bill quota from
someone else's site.

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

### AI features — all three vendors

The gateway (`src/backend/ai/gateway.ts`) tries **Gemini → Claude → OpenAI** and moves
on when one is down, rate-limited, or returns something that fails the task's schema.

```bash
for KEY in GEMINI_API_KEY ANTHROPIC_API_KEY OPENAI_API_KEY; do
  firebase apphosting:secrets:set "$KEY" --project ticketroyality
  firebase apphosting:secrets:grantaccess "$KEY" \
    --backend ticketroyality --project ticketroyality
done
```

Then uncomment those three blocks in `apphosting.yaml` and push.

| Key | Where it comes from |
| --- | --- |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/settings/keys |
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys |

**Any one key runs every AI feature.** Start with Gemini — at the configured models it
is roughly forty times cheaper per output token than Claude, so it should answer the
ordinary request. The other two are not redundancy for its own sake: with one key, a
single vendor incident takes AI Studio, recommendations and similar-events down
together, which is exactly the failure the chain exists to prevent.

Billing follows whichever vendor actually answered — cost is read from that provider's
own reported token counts, not a fixed estimate, so a fallback to Claude charges Claude
prices rather than quietly selling below cost. The `/api/ai` response names the
provider, so a fallback firing on every request is visible long before the invoice.

`/api/health` reports `ai:gemini`, `ai:anthropic` and `ai:openai` separately, so one key
present never reads as healthy while the chain has no depth left.

### Google Maps

Not a new vendor — the same Google Cloud project. Without it, event pages fall back to a
text address panel, which is a deliberate degradation rather than an error.

This one is **not** a Secret Manager secret. It is `NEXT_PUBLIC_`, so it ships inside the
JavaScript bundle whatever you do; paste it as a plain `value:` in the
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` block in `apphosting.yaml`.

Restrict it before you use it, or anyone can lift it from the bundle and bill Maps usage
to this project: **Google Cloud console → APIs & Services → Credentials → the key →
Application restrictions → HTTP referrers**, then add `ticketroyality.com/*` and
`*.hosted.app/*`.

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

## The two email addresses

They are not interchangeable, and swapping them breaks things quietly.

| Address | Inbox? | Used for |
| --- | --- | --- |
| `info@ticketroyality.com` | **Yes — receives everything** | SMTP authentication, the `From` on every ticket email, and therefore where customer replies and bounce notices land |
| `admin@ticketroyality.com` | **No inbox** | Logging in to the platform as an administrator. Nothing is ever sent to it |

Server settings, already in `functions/.env` and `.env.example`:

```
SMTP   smtp.hostinger.com : 465   (implicit TLS)
IMAP   imap.hostinger.com : 993   — not used; the platform sends, it never reads mail
```

The `SMTP_PASSWORD` secret is the mailbox password for **`info@`**, not `admin@`.

**The consequence to know before you rely on it:** `admin@` cannot use "forgot
password". Firebase emails the reset link to an address with no inbox, so it lands
nowhere. Recovery for that account is offline:

```bash
npm run grant:admin -- admin@ticketroyality.com --project <your-project-id> --set-password
```

It prompts for the password without echoing it — never pass one on the command line,
where it enters your shell history and the process list. It also revokes existing
sessions, which is what you want if you are resetting because something leaked.

## Create your admin account

There is **no self-serve admin signup**, deliberately: registration produces a
`customer` or an `organiser` and nothing else, and `firestore.rules` grants every
privileged operation on `userType == 'superuser'`. A public route to that would be a
permanent unauthenticated door into the highest privilege on the platform.

So the first administrator is made from outside the app, by you, holding Google Cloud
credentials:

```bash
# 1. Sign up normally on the live site — for the platform admin use
#    admin@ticketroyality.com. No email is ever sent during signup, so the
#    missing inbox does not matter here.
# 2. Authenticate locally for the project (once):
gcloud auth application-default login

# 3. Promote the account:
npm run grant:admin -- you@example.com --project <your-project-id>
```

Sign out and back in, then open `/dashboard/superuser`.

To remove admin rights from an account, add `--revoke`. The script only ever updates
`userType` — it never overwrites the document, so the wallet balance and profile
survive.

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
