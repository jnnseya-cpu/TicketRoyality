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
| Catalogue | Events, search, filters, calendar, map, organiser directory | `src/app/events`, `/organisers` |
| Event pages | Server-rendered with `Event` JSON-LD | `src/app/events/[id]` |
| Accounts | Register, login, three role dashboards | `src/app/register`, `/dashboard/*` |
| Tiered ticketing | Multiple tiers, prices, quantities per event | `src/shared/types`, `CreateEventForm` |
| Seat map | **Preview/display only** — no editor, no generator | `SeatMapPreview.tsx` |
| Checkout | Stripe session creation, 303 redirect, honest failure | `src/app/api/checkout` |
| Mobile money | KODA client, intents, HMAC webhook verification | `src/backend/payments/koda.ts` |
| **Ticket issuance** | **Cloud Function, transactional, idempotent, oversell-proof** | `functions/src/issuance.ts` — 10 emulator tests |
| Refunds | Reversal via payment intent, inventory returned, redeemed tickets protected | same |
| Commission | 5% + 50p, per ticket, wired into 6 surfaces | `src/shared/pricing.ts` |
| Coupons | Organiser coupon management | `/dashboard/organiser/coupons` |
| Door scanner | Per-event scan page, QR read, redeem | `/events/[id]/check-in` |
| AI studio | Real generation call against the AI gateway | `/dashboard/organiser/ai-studio` |
| Video ad carousel | Homepage component | `VideoAds.tsx` |
| ACU billing | Credit constants, ledger entry builder, balance guard | `src/backend/services/acu-ledger.ts` |
| **Ticket delivery** | **SMTP email on issuance — one email per purchase, retried, outcome recorded** | `functions/src/email.ts` — 10 tests |
| Blog | 14 published articles, 6 topic hubs, generated link graph | `npm run check:links` |
| SEO | `robots.txt`, `sitemap.xml`, Article/FAQ/Breadcrumb schema | `src/app/sitemap.ts` |
| Security headers | CSP-adjacent headers, HSTS, frame denial | `next.config.ts` |
| Health | `/api/health` reports per-dependency status, fails closed | `src/app/api/health` |

## Not built

Each of these is **specified in `docs/`** and **absent from `src/`**. That combination
is precisely what caused the confusion this file exists to end.

| Gap | Consequence if you launch without it | Spec |
| --- | --- | --- |
| Message delivery **beyond the ticket** | Ticket emails send. Every *other* catalogue event — payment failed, event postponed, venue changed, payout sent, refund processed — still records `queued` and calls no provider. `dispatch()` in the app is not yet wired to the SMTP sender. | `docs/04` M10 |
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
| App Check enforcement | `appcheck.ts` and `humanity.ts` exist, wired into no route | `docs/11` |
| Sentinel telemetry | `sentinel.ts` reads no real signal | `docs/03` §3.6 |
| Atomic ACU ledger (**D2**) | Ledger entry and balance are not written in one transaction | `docs/13` D2 |
| Venue map generation | Only a preview component exists | `docs/04` M23 |
| Waitlist | Defined in the comms catalogue, no implementation | `docs/04` M6 |
| SMS / WhatsApp delivery | **Blocked, not pending.** No approved provider exists inside the vendor list (`CLAUDE.md` §1). The channels are declared in the catalogue; `dispatch()` records and sends nothing. | `docs/04` M10 |
| Error tracking | Not wired. Google Cloud Error Reporting is available in-project; Sentry would be a new vendor. | `docs/21` |

## Ordered by what actually blocks revenue

1. **Checkout holds.** Every oversold race is a charged customer with no ticket and a
   manual refund.
2. **QR signing.** Without it a screenshot is a valid ticket, and the fraud is the
   buyer's loss, not yours.
3. **The rest of the comms catalogue.** Ticket delivery is wired; cancellations, venue
   changes and refund confirmations are not. Point `dispatch()` at the same SMTP sender
   rather than building a second one.
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
npm test               # issuance + delivery
npm run test:issuance  # 10 tests, Firestore emulator, real transactions
npm run test:delivery  # 10 tests, real SMTP conversation
cd functions && npm run build
```
