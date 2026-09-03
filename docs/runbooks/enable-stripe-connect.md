# Runbook — switch Stripe Connect live (organiser payouts)

Execute top to bottom. Each step is copy-paste. Placeholders are in `<ANGLE_BRACKETS>`.

**What this turns on:** payouts to organisers' own bank accounts, and white-label
settlement. The code is already deployed and `STRIPE_CONNECT_ENABLED="true"` is in
`apphosting.yaml`, so this runbook is the *account + infrastructure* half. It fails **safe**
at every step — nothing moves money until all of steps 1–4 are true, and no transfer can
ever pay twice (each carries the per-event payout key as its Stripe idempotency key).

Project and backend are both named `ticketroyality`. Scheduler region: `europe-west1`.

---

## 0. Prerequisites (one-time, on your machine)

```bash
# Firebase CLI + gcloud, authenticated to the ticketroyality project.
firebase login
gcloud auth login
gcloud config set project ticketroyality

# Confirm you can see the App Hosting backend (its id is 'ticketroyality').
firebase apphosting:backends:list --project ticketroyality
```

---

## 1. Enable Connect on the Stripe account (Dashboard — ~3 min)

This is the switch nothing else can substitute for. Card charges already use this account;
Connect is an added capability on it.

1. Stripe Dashboard → **Connect** → **Get started**.
2. Platform type: choose **Platform or marketplace**.
3. Account type to create for organisers: **Express** (the code calls
   `createConnectedAccount` for Express accounts).
4. Under **Connect → Settings**:
   - Set your **platform business name**, support email (`info@ticketroyality.com`) and
     branding — organisers see these on the Stripe-hosted onboarding.
   - Confirm **Transfers** capability is available (it is, by default, once Connect is on).
5. Stay in the **same mode** (Test or Live) as your `STRIPE_SECRET_KEY` in step 2. A live
   key with a test-mode Connect setup, or vice-versa, fails every transfer.

> No new webhook is required for payouts: the app initiates transfers itself (the
> `settle-events` sweep), and reads each connected account's status on demand. Optional:
> add an `account.updated` endpoint later if you want payout-enabled status to refresh
> without the organiser reopening their revenue page.

---

## 2. Confirm the Stripe secret key is set and granted

Card payments already need `STRIPE_SECRET_KEY`, so it is very likely already present. Verify;
set + grant only if missing. Use the **same account's** key whose Connect you enabled in
step 1.

```bash
# Check whether the secret exists in Secret Manager (any output = it exists):
gcloud secrets list --project ticketroyality --filter="name:STRIPE_SECRET_KEY"

# Only if missing: set it (paste the sk_live_... or sk_test_... key when prompted).
firebase apphosting:secrets:set STRIPE_SECRET_KEY --project ticketroyality

# Grant the backend's service account read access. Safe to re-run even if already granted —
# and the grant is NOT optional: a declared-but-ungranted secret fails every rollout at
# container start with a permission error rather than at deploy time.
firebase apphosting:secrets:grantaccess STRIPE_SECRET_KEY \
  --backend ticketroyality --project ticketroyality
```

`STRIPE_CONNECT_ENABLED` is a plain value (`"true"`) already in `apphosting.yaml`, **not** a
secret — there is nothing to set for it. It takes effect on the next rollout (step 3).

---

## 3. Roll out so the flag takes effect

`STRIPE_CONNECT_ENABLED="true"` is already committed on `main`. If your latest `main` is
already deployed, trigger a fresh rollout so the runtime picks up the flag (and the new
`/api/cron/settle-events` route):

- **Option A (simplest):** push any commit to `main` — App Hosting auto-deploys from `main`.
- **Option B:** trigger a rollout of the current `main` from the **Firebase console →
  App Hosting → your backend → Create rollout** (or `firebase apphosting:rollouts:create`
  if your CLI version supports it — check `firebase apphosting:rollouts --help`).

Wait for the rollout to reach **live** (~10 min), then verify the flag is on:

```bash
# connectOff should be ABSENT/false once the key exists and the flag is live.
curl -s -H "Authorization: Bearer <CRON_SECRET>" \
  https://ticketroyality.com/api/cron/settle-events | jq
```

- `{"connectOff": true, ...}` → the flag or the key has not taken effect yet (recheck 2–3).
- `{"scanned": N, "paid": 0, "blocked": M, ...}` → Connect is live; `blocked` just means no
  organiser has finished onboarding yet (step 5).

---

## 4. Schedule the automatic payout sweep

Without a scheduler, payouts only fire when an organiser presses **Withdraw**. This settles
every finished event on its own. Hourly is plenty — it is idempotent per event.

```bash
gcloud scheduler jobs create http ticketroyality-settle \
  --project ticketroyality \
  --location europe-west1 \
  --schedule "0 * * * *" \
  --uri "https://ticketroyality.com/api/cron/settle-events" \
  --http-method GET \
  --headers "Authorization=Bearer <CRON_SECRET>"
```

If you have not already created the every-minute inventory sweep, do that too (it is
unrelated to Connect but is the other half of "nothing sweeps without a scheduler"):

```bash
gcloud scheduler jobs create http ticketroyality-sweep \
  --project ticketroyality \
  --location europe-west1 \
  --schedule "* * * * *" \
  --uri "https://ticketroyality.com/api/cron/release-holds" \
  --http-method GET \
  --headers "Authorization=Bearer <CRON_SECRET>"
```

Force one run now and read the result:

```bash
gcloud scheduler jobs run ticketroyality-settle --location europe-west1 --project ticketroyality
curl -s -H "Authorization: Bearer <CRON_SECRET>" \
  https://ticketroyality.com/api/cron/settle-events | jq
```

---

## 5. Onboard an organiser (each organiser, once)

Payouts to an organiser stay `blocked` until they finish Stripe Express onboarding — and
then settle automatically on the next sweep (the payout key is retried, not sealed).

1. Sign in as the organiser → **Dashboard → Revenue & payouts**.
2. The **Automatic payouts** card shows "Connect a payout account" → click it, complete
   Stripe's hosted onboarding, return.
3. The card flips to **Payouts connected**. Their finished events settle on the next hourly
   sweep; a `blocked` from before onboarding clears itself then.

---

## 6. Verify end to end

```bash
# Platform health — datastore must be true or nothing works.
curl -s https://ticketroyality.com/api/health | jq

# The sweep, after at least one organiser has onboarded and one event has finished:
curl -s -H "Authorization: Bearer <CRON_SECRET>" \
  https://ticketroyality.com/api/cron/settle-events | jq
#   paid   > 0  → a real transfer went out (check Stripe Dashboard → Connect → Transfers)
#   blocked> 0  → those organisers have not finished onboarding
#   failed > 0  → read the Stripe error; usually Connect not fully enabled or wrong mode
```

Cross-check in Stripe: **Dashboard → Connect → Transfers** shows one transfer per settled
event; the organiser's connected account shows the incoming balance.

---

## 7. Rollback (if needed)

Turning the flag off stops all payouts cleanly; nothing half-settles.

```bash
# Pause the sweep (fastest):
gcloud scheduler jobs pause ticketroyality-settle --location europe-west1 --project ticketroyality

# Or turn the rail off in code: set STRIPE_CONNECT_ENABLED back to "false" in
# apphosting.yaml, commit, and roll out. isConnectConfigured() goes false and every
# payout path refuses cleanly — the manual button and the sweep both no-op.
```

No transfer already sent can be un-sent from here (that is a Stripe-side reversal), but
nothing new fires the moment either step above is done.
