# Status — what is actually built

**Last verified: 14 August 2026, against the code on `claude/optimistic-heisenberg-0n2w42`.**

Operating rules for changing this codebase are in `/CLAUDE.md`.

This file is the single source of truth for what exists. It exists because the project
did not have one, and the cost of that was concrete: thirty blog articles were written
describing platform features in the present tense, and **sixteen of them described
things that were not built.** Several stated the opposite of what the code does — the
ticket QR was described as rotating and per-event signed when it is in fact a static,
unsigned JSON payload — and those claims were attached to FAQ structured data, the
format search engines quote directly to users.

Nothing here is a plan or an intention. If a row says **Built**, the code was opened
and read. If it says **Not built**, it was looked for and is absent.

## Rules for keeping this honest

1. **Update this file in the same commit** that changes what is built. Not afterwards.
2. **A doc is not evidence.** `docs/` specifies the target system. This file records
   the shipped one. Where they disagree, this file is right.
3. **Marketing copy may not run ahead of this table.** Blog articles carry a
   `status: 'draft'` flag; drafts never render, and `npm run check:links` enforces the
   publishing gate. An article describing a **Not built** feature stays a draft.
4. **"Specified in docs/NN" is not "built".** Most of what is missing below is fully
   specified. That was exactly the confusion.

---

## Built and verified

| Area | What works | Evidence |
| --- | --- | --- |
| Catalogue | Events, search, filters, calendar, map | `src/app/events` |
| Organiser directory | Public, server-rendered via an Admin SDK **whitelist projection** — branding fields only, no email/phone/address | `backend/services/public-profiles.ts` |
| Event pages | Server-rendered with `Event` JSON-LD | `src/app/events/[id]` |
| Accounts | Register (customer/organiser), login, forgot password, three role dashboards | `src/app/register`, `/dashboard/*` |
| Password reveal | Eye toggle on every password field, accessible, never submits the form | `ui/password-input.tsx` |
| **Admin sign-in** | `/login/admin`, linked under the normal login panel. Verifies `userType == 'superuser'` after authenticating and sends anyone else to their own dashboard rather than into an admin shell that 403s on every read. A separate door, not a separate lock — one credential store, and the rules are the authority. | `src/app/login/admin` |
| **Admin account** | Promotion via Admin SDK script — no self-serve admin signup exists by design. `--set-password` recovers an account offline, which `admin@ticketroyality.com` needs because it has **no inbox** and can never receive a reset email. | `scripts/grant-admin.ts` |
| Bot gate (sign-up) | Honeypot + fill-timing + interaction, **scored server-side**; refuses before any account is created | `/api/signup-gate` |
| Tiered ticketing | Multiple tiers, prices, quantities per event | `src/shared/types`, `CreateEventForm` |
| Seat map | **Preview/display only** — no editor, no generator | `SeatMapPreview.tsx` |
| Checkout | Stripe session creation, 303 redirect, honest failure | `src/app/api/checkout` |
| Mobile money | KODA client, intents, HMAC webhook verification | `src/backend/payments/koda.ts` |
| **Ticket issuance** | **Cloud Function, transactional, idempotent, oversell-proof** | `functions/src/issuance.ts` — 10 emulator tests |
| Refunds | Reversal via payment intent, inventory returned, redeemed tickets protected | same |
| Commission | 5% + 50p per **paid** ticket. **Free tickets carry no charge at all** — the admin fee used to apply per line with no price check, so a 300-place free guest list cost £150. | `src/shared/pricing.ts` — 12 tests |
| Coupons | Organiser coupon management | `/dashboard/organiser/coupons` |
| Door scanner | Per-event scan page, QR read, redeem | `/events/[id]/check-in` |
| AI studio | Real generation call, through the gateway below | `/dashboard/organiser/ai-studio` |
| **AI gateway** | **Gemini → Claude → OpenAI fallback chain.** One prompt per task shared by all three; output is only accepted once it parses *and* satisfies the task's zod schema, so prose or a wrong shape fails over rather than reaching the user. Billed from the answering provider's own token counts. | `src/backend/ai/gateway.ts` — 10 tests |
| Video ad carousel | Homepage component | `VideoAds.tsx` |
| ACU billing | 1 ACU = $0.01. **100 ACU free** on every account; top-ups $5 / $10 / $15. The cost multiplier lives in a **`server-only` module**, so a client component importing it fails the build — it is in no browser bundle, including an administrator's. `publicCharge()` is the only shape that may cross an API boundary. | `backend/billing/margin.ts` — 18 tests |
| **Ticket delivery** | **SMTP email on issuance — one email per purchase, retried, outcome recorded** | `functions/src/email.ts` — 10 tests |
| **Comms dispatch** | **`dispatch()` now really sends email** over the same Hostinger mailbox, for all 104 catalogue events. Output recorded per channel in `comms_deliveries`. Channels with no approved provider record `suppressed` **with the reason**, never `queued`. | `backend/comms/dispatch.ts` — 10 tests, real SMTP |
| **Notifications wired** | Refund processed and issuance-failed/oversold email from the payment function; organiser approved/declined emails from `/api/admin/organiser-decision`. All idempotent — a replayed refund webhook cannot email twice. | `functions/src/index.ts`, `api/admin/organiser-decision` |
| **Admin comms console** | Catalogue browser, delivery log with status filters, and a template test that is **sandbox by default**. | `/dashboard/superuser/comms` |
| **Privileged API auth** | `requireAdmin()` verifies the Firebase ID token server-side (`checkRevoked`) *and* re-reads `userType` from Firestore, so admin status has one source of truth. Fails closed. | `backend/auth/require-admin.ts` |
| Blog | 14 published articles, 6 topic hubs, generated link graph | `npm run check:links` |
| SEO | `robots.txt`, `sitemap.xml`, Article/FAQ/Breadcrumb schema. Private pages are **crawlable and `noindex`**, not `Disallow`ed — a blocked page that is linked still gets indexed, and blocking it is what stops Google learning it should not be. | `src/app/robots.ts`, `next.config.ts` |
| Security headers | CSP-adjacent headers, HSTS, frame denial | `next.config.ts` |
| **PWA** | Installable, `display: standalone`, `viewport-fit=cover` with `env(safe-area-inset-*)` so the app fills the screen and still clears the notch and home indicator. Service worker: network-first documents, cache-first immutable assets, and **`/api`, `/dashboard`, `/account`, `/cart`, `/checkout`, auth routes are never cached**. Offline fallback page; install prompt suppressed for 90 days after a dismissal. | `app/manifest.ts`, `public/sw.js` |
| **Maps & directions** | Live Google **Embed** API map on every event page with a venue, switching to route mode once a starting point is set. Origin from browser geolocation or a typed postcode; drive/transit/walk; Apple Maps link. A Map tab on `/events` centres on a chosen event. **Directions need no API key** — only the embedded map does. | `events/EventMap.tsx`, `events/EventsMapView.tsx` |
| Styling | Tailwind scans `./src/**`. It previously scanned `./src/pages` and `./src/components`, **neither of which exists** — so every class used only in `src/frontend/**` was never generated and most of the UI rendered unstyled. | `tailwind.config.ts` |
| Health | `/api/health` reports per-dependency status, fails closed | `src/app/api/health` |

## Removed

| What | Why |
| --- | --- |
| `/dev-access` | A public page offering to set the signed-in account's role to platform admin, plus the shared password for three named test accounts. The role change itself was already refused by `firestore.rules` (`noPrivilegedFields()` blocks a self-write to `userType`), so it was not an open escalation — but it published `admin@ticketroyality.com` and a working password on the live site, and told visitors the platform was mid-development. |
| Test-account panel on `/login` | Listed `admin@ticketroyality.com` publicly. That account has **no inbox**, so if it is ever compromised it cannot receive a reset email — naming it on the login page was the worst possible place to advertise it. |
| `localStorage` identity in `use-auth` | The auth hook synthesised a signed-in profile (including `userType: 'superuser'`) from a `localStorage` key when Firebase was unconfigured. Only `/dev-access` could write that key, so it went with it. |

## Not built

Each of these is **specified in `docs/`** and **absent from `src/`**. That combination
is precisely what caused the confusion this file exists to end.

| Gap | Consequence if you launch without it | Spec |
| --- | --- | --- |
| Comms **callers** — the rest | The revenue-critical three are wired (refund processed, issuance failed/oversold, organiser approved/declined). Payouts, event changes, cancellations and waitlists still complete without telling anyone. | `docs/04` M10 |
| In-app and push delivery | `inapp` and `push` are declared on many catalogue events and neither is implemented. Both record `suppressed` with the reason rather than claiming a queue. | `docs/04` M10 |
| **Checkout inventory holds** | Two buyers can both reach checkout for the last ticket. Issuance stops the oversell, but the loser is charged and flagged for refund. `release-holds` returns `implemented: false`. | `docs/08` §8.8 |
| Ticket transfer | The wallet cannot send a ticket to someone else | `docs/04` M3 |
| QR rotation + signing | QR is static, unsigned JSON. `QR_SIGNING_KEY` is configured but read nowhere. A screenshot is a working ticket. | `docs/04` M3 |
| Offline door scanning | Scanner needs signal. No cache, no 15-minute ceiling. | `docs/04` M16 |
| Venue zones | No per-zone capacity, scanners or re-entry rules | `docs/04` M17 |
| Hospitality | No tables, packages or guest allocation | `docs/04` M21 |
| Loyalty | No points, tiers or presale access | `docs/04` M20 |
| Referral / 1% influencer | `/growth` is a marketing page. No tracked links, no attribution, no commission. | `docs/04` M26 |
| Affiliate / promoter | No tracked links or attribution | `docs/04` M18 |
| Sponsor activation | No sponsor model | `docs/04` M19 |
| Analytics | Reports page has no charts, velocity or forecasting | `docs/04` M9 |
| Ticket recommendations | Nothing renders on the ticket | `docs/04` M3a |
| Public API + sandbox | No developer API. `/developers` is a marketing page. | `docs/04` M13 |
| App Check enforcement | `appcheck.ts` exists and is wired into no route. The sign-up gate stops naive automation, but a script can call Firebase Auth directly and never touch it — App Check is the layer that closes that, and it needs a reCAPTCHA Enterprise site key from the console. | `docs/11` |
| Bot gate on **login** | Only sign-up is gated. Credential-stuffing against `/login` is unthrottled. | `docs/11` |
| Organiser profile `get` rule | `firestore.rules` allows **anyone** to read a full organiser `users` document by uid — including email, phone, address and date of birth. The public pages no longer expose it, but the rule still permits a direct SDK read. Should be narrowed to a public projection or a separate collection. | `firestore.rules` |
| Sentinel telemetry | `sentinel.ts` reads no real signal | `docs/03` §3.6 |
| Atomic ACU ledger (**D2**) | Ledger entry and balance are not written in one transaction | `docs/13` D2 |
| Venue map generation | Only a preview component exists | `docs/04` M23 |
| Waitlist | Defined in the comms catalogue, no implementation | `docs/04` M6 |
| SMS / WhatsApp delivery | **Blocked, not pending.** No approved provider exists inside the vendor list (`CLAUDE.md` §1). The channels are declared in the catalogue; `dispatch()` records and sends nothing. | `docs/04` M10 |
| Error tracking | Not wired. Google Cloud Error Reporting is available in-project; Sentry would be a new vendor. | `docs/21` |
| Google Maps key | No key is set, so event pages fall back to a text address panel instead of a map. Not a new vendor — the same Google Cloud project. Needs an HTTP-referrer restriction before it goes in, or the key can be lifted and billed to this project. | `docs/07` |
| **Free tickets are charged the 50p admin fee** | `settle()` computes `adminFee * lines.length` with no price check, so a £0 ticket still costs the organiser 50p. Percentage commission on £0 is correctly £0. The industries page promised "free tickets carry no commission" — that copy has been corrected to match the code, **not** the other way round, because which one is right is a commercial decision. It matters most for places of worship, charity and weddings, where a 300-guest free list currently costs £150. | `src/shared/pricing.ts` |

## Ordered by what actually blocks revenue

1. **Checkout holds.** Every oversold race is a charged customer with no ticket and a
   manual refund.
2. **QR signing.** Without it a screenshot is a valid ticket, and the fraud is the
   buyer's loss, not yours.
3. **The remaining `dispatch()` call sites.** Refunds, failed issuance and organiser
   decisions now notify. Payouts, event changes and cancellations still do not.
4. **Ticket transfer.** The most-requested consumer feature in ticketing.
5. **Referral / influencer.** The only acquisition mechanism that works without waiting
   months for SEO — and the one currently sold on `/growth` without existing.

## Watch after deploying

| Signal | Meaning |
| --- | --- |
| `/api/health` not 200 | A dependency is unconfigured; `datastore` false means nothing works |
| `payment_events.status == 'oversold'` | Someone paid, no ticket can be issued, needs a refund |
| `payment_events.status == 'failed'` | Issuance gave up after 5 attempts; a person must look |
| `payment_events` stuck `pending` > 10 min | The reconciliation sweep is not running |
| Function log `inventory drift` | A tier counter disagrees with issued tickets |
| `issued_payments.delivery` starts `failed:` | Tickets issued but the email did not send |
| `issued_payments.delivery == 'skipped'` | SMTP unconfigured, or the buyer has no email address |

## Commands

```bash
npm run build          # app
npm run typecheck      # app + the functions contract guard
npm run lint
npm run check:links    # link graph + publishing gate
npm run report:links   # inline link density
npm test               # pricing + issuance + delivery + AI gateway + comms
npm run test:pricing   # 12 tests, the money rules
npm run test:issuance  # 10 tests, Firestore emulator, real transactions
npm run test:delivery  # 10 tests, real SMTP conversation
npm run test:ai        # 10 tests, real HTTP servers speaking each vendor's shape
npm run test:comms     # 10 tests, real SMTP conversation through dispatch()
cd functions && npm run build
```
