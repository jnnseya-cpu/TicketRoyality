#!/usr/bin/env bash
#
# Everything that must happen outside the repository, in one run.
#
# The build deploys itself — App Hosting rebuilds on every push to the branch it
# watches. These four are the ones that do not, and each of them is invisible when it
# is missing: the rules look fine until somebody reads a document they should not, the
# scheduler looks fine until a held seat is never released, the secret looks fine until
# an API key is hashed with a fallback nobody chose.
#
# Safe to run repeatedly. Nothing here deletes anything.
#
# Usage:  bash scripts/go-live.sh
#
set -euo pipefail

PROJECT="${FIREBASE_PROJECT:-ticketroyality}"
REGION="${SCHEDULER_REGION:-europe-west1}"
SITE="${SITE_URL:-https://ticketroyality.com}"

say()  { printf '\n\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }

# ---------------------------------------------------------------------------
# 0. Who are you
# ---------------------------------------------------------------------------
say "Checking you are signed in"

if ! npx firebase login:list 2>/dev/null | grep -qi '@'; then
  warn "Not signed in to Firebase. Run: npx firebase login"
  exit 1
fi
ok "Firebase CLI is authenticated"

if ! command -v gcloud >/dev/null 2>&1; then
  warn "gcloud is not installed — step 3 (the scheduler) will be skipped."
  warn "Install it from https://cloud.google.com/sdk, or create the job in the console."
  HAVE_GCLOUD=0
else
  HAVE_GCLOUD=1
  ok "gcloud is available"
fi

# ---------------------------------------------------------------------------
# 1. Rules and indexes
# ---------------------------------------------------------------------------
say "1/4  Firestore rules and indexes"

# The rules file ends in a catch-all deny, so a collection that is not named in it is
# already refused to every client. Deploying makes the intent explicit and adds the
# indexes the newer queries need — without them those queries fail in production
# while passing locally, because the emulator does not require them.
npx firebase deploy --only firestore:rules,firestore:indexes --project "$PROJECT"
ok "Rules and indexes deployed"

# ---------------------------------------------------------------------------
# 2. The API key signing secret
# ---------------------------------------------------------------------------
say "2/4  API_KEY_SECRET"

if npx firebase apphosting:secrets:describe API_KEY_SECRET --project "$PROJECT" >/dev/null 2>&1; then
  ok "API_KEY_SECRET already exists — leaving it alone"
else
  # Generated here rather than typed, because a memorable value is a guessable one.
  # Without this the key store falls back to QR_SIGNING_KEY; with neither, creating an
  # API key is refused outright rather than hashed with an empty string.
  openssl rand -base64 48 | tr -d '\n' | npx firebase apphosting:secrets:set API_KEY_SECRET \
    --project "$PROJECT" --data-file -
  ok "API_KEY_SECRET created"
  warn "Now uncomment the API_KEY_SECRET block in apphosting.yaml and push —"
  warn "it is commented out so a missing secret cannot fail your rollouts."
fi

npx firebase apphosting:secrets:grantaccess API_KEY_SECRET \
  --project "$PROJECT" --backend ticketroyality || \
  warn "Could not grant access automatically — do it in the console if the build complains"

# ---------------------------------------------------------------------------
# 3. The sweep
# ---------------------------------------------------------------------------
say "3/4  Cloud Scheduler"

if [ "$HAVE_GCLOUD" = "1" ]; then
  if [ -z "${CRON_SECRET:-}" ]; then
    warn "CRON_SECRET is not set in this shell. Export it and re-run, or create the job by hand."
    warn "It must match the CRON_SECRET the deployed app holds, or every call is a 401."
  else
    # Every minute: a held seat is unsellable, and a minute of phantom sell-out on a
    # fast-moving on-sale is real money. The same run closes auction lots and delivers
    # webhooks, neither of which happens on its own.
    if gcloud scheduler jobs describe ticketroyality-sweep \
         --project "$PROJECT" --location "$REGION" >/dev/null 2>&1; then
      gcloud scheduler jobs update http ticketroyality-sweep \
        --project "$PROJECT" --location "$REGION" \
        --schedule "* * * * *" \
        --uri "$SITE/api/cron/release-holds" \
        --http-method GET \
        --update-headers "Authorization=Bearer $CRON_SECRET"
      ok "Sweep job updated"
    else
      gcloud scheduler jobs create http ticketroyality-sweep \
        --project "$PROJECT" --location "$REGION" \
        --schedule "* * * * *" \
        --uri "$SITE/api/cron/release-holds" \
        --http-method GET \
        --headers "Authorization=Bearer $CRON_SECRET"
      ok "Sweep job created"
    fi
  fi
else
  warn "Skipped — gcloud not installed"
fi

# ---------------------------------------------------------------------------
# 4. Prove it
# ---------------------------------------------------------------------------
say "4/4  Checking the live site"

HEALTH="$(curl -s -m 20 "$SITE/api/health" || true)"
if printf '%s' "$HEALTH" | grep -q '"status":"healthy"'; then
  ok "Health check passed"
else
  warn "Health check did not report healthy:"
  printf '      %s\n' "${HEALTH:-no response}"
fi

if [ -n "${CRON_SECRET:-}" ]; then
  SWEEP="$(curl -s -m 30 -H "Authorization: Bearer $CRON_SECRET" \
    "$SITE/api/cron/release-holds" || true)"
  if printf '%s' "$SWEEP" | grep -q '"implemented":true'; then
    ok "Sweep responds: $SWEEP"
  else
    warn "Sweep did not respond as expected: ${SWEEP:-no response}"
  fi
fi

say "Done"
cat <<'NOTE'
  Two things this script cannot do for you:

  1. Restrict the Google Maps API key to your domain.
     Console → APIs & Services → Credentials → the browser key → Application
     restrictions → HTTP referrers → https://ticketroyality.com/*
     An unrestricted key can be used by anyone and billed to you.

  2. Run one real Stripe purchase, end to end, in test mode.
     Nothing else proves the money path. Every test in this repository runs
     against an emulator, which is a real database but is not Stripe.
NOTE
