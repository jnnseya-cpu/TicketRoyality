# 16 — The Event Organiser Role

The organiser is the only role that creates supply, takes money from strangers, and
controls a door. It is therefore the only role that is **gated on a human decision**
before it can do any of those things.

Grounded in `userType: 'organiser'` (`src/shared/types/index.ts`), the `events`,
`tickets` and `coupons` blocks of `firestore.rules`, and
`src/app/dashboard/organiser/`.

---

## 16.1 Account

### Identity and commercial fields

| Field | Purpose | Mutable by organiser |
| --- | --- | --- |
| `userType: 'organiser'` | Role | **no** |
| `status` | `pending` → `approved` / `suspended` | **no** |
| `companyName`, `website`, `bio` | Public identity | yes |
| `logoUrl`, `coverUrl`, `socials` | Public branding | yes |
| `commissionPercent` | Negotiated rate | **no** — superuser only |
| `adminFee` | Per-ticket fee | **no** — superuser only |
| `wallet` | ACU balance for AI Studio | **no** |

An organiser can rewrite everything about how they *appear*, and nothing about what
they *cost*. Those are two different kinds of field and the rules treat them
differently.

### The approval gate

```
/register/organiser
      │  rules force: status == 'pending'
      ▼
   pending ──────────────────────────────┐
      │                                  │
      │ superuser approves               │ superuser rejects / suspends
      ▼                                  ▼
   approved                          suspended
      │
      └──▶ may create events, coupons, and redeem tickets
```

The gate is not a UI state — it is a predicate used by three separate rules:

```
function isApprovedOrganiser() {
  return isSignedIn()
    && exists(/databases/$(database)/documents/users/$(request.auth.uid))
    && userDoc().userType == 'organiser'
    && userDoc().status == 'approved';
}
```

A `pending` organiser can sign in, complete their profile, and see their dashboard.
They cannot create an event, cannot create a coupon, and have nothing to sell. Every
`create` on `events` and `coupons` calls `isApprovedOrganiser()`, so suspending an
organiser stops new supply the instant the superuser saves — no deploy, no cache purge,
no session invalidation.

### Ownership is asserted on both sides of an update

```
allow update, delete: if isSuperuser()
                      || (isApprovedOrganiser()
                          && resource.data.organizerId == request.auth.uid
                          && request.resource.data.organizerId == request.auth.uid);
```

Both `resource` (the document as it is) **and** `request.resource` (the document as it
would be) must name the caller. Checking only the first would let an organiser edit
their own event and reassign it to somebody else on the way out.

---

## 16.2 Features

| # | Feature | Route | Gate |
| --- | --- | --- | --- |
| 1 | Overview: sales, net, events, tickets | `/dashboard/organiser` | approved |
| 2 | Create an event | `/dashboard/organiser/events/new` | approved |
| 3 | Edit / publish / cancel an event | `…/events/[id]/edit` | approved + owner |
| 4 | Event list with draft state | `…/events` | owner |
| 5 | Tiered ticketing | Event form | — |
| 6 | Seat maps (sections, rows, colours, prices) | Event form | — |
| 7 | Physical / online / livestream types | Event form | — |
| 8 | Recurring events (weekly, monthly) | Event form | — |
| 9 | Speakers and line-up | Event form | — |
| 10 | Orders and attendee list | `…/tickets` | owner |
| 11 | Door check-in scanner | `/events/[id]/check-in` | owner |
| 12 | Coupons: percentage or fixed, limited, expiring | `…/coupons` | approved |
| 13 | Paid promotion purchase | `…/promotions` | approved |
| 14 | Revenue, statement, withdrawal request | `…/revenue` | approved |
| 15 | Reports and CSV export | `…/reports` | approved |
| 16 | AI Studio — ad copy generation | `…/ai-studio` | ACU balance |
| 17 | Profile, branding, commercial terms (read-only) | `…/settings` | — |

### Promotion inventory

Three placements, priced per campaign, charged on approval:

| Placement | Price | Period |
| --- | --- | --- |
| Homepage video ad — 20s spot in the Events Ads carousel, three rotating slots | £249 | 7 days |
| Featured event — Featured Events grid and top of category search | £149 | 7 days |
| Newsletter spotlight — dedicated block in the weekly regional email | £99 | single send |

These are the platform's second and third revenue lines. Commission is the first.

---

## 16.3 Functions and functionalities

### Reads

| Function | Scope | Rule |
| --- | --- | --- |
| `getEventsByOrganizer(uid)` | Own events, drafts included | `organizerId == request.auth.uid` |
| `getTicketsForOrganizer(uid)` | Tickets for own events | `resource.data.organizerId == request.auth.uid` |
| `getCouponsForOrganizer(uid)` | Own coupons | `organizerId == request.auth.uid` |
| `getTicketById(id)` | One ticket, for the scanner | Same |

Drafts are visible to their owner and to admins, never to the public — the `events`
read rule allows `status == 'published'` **or** `organizerId == request.auth.uid` **or**
`isSuperuser()`. An organiser can build an entire festival privately and publish it in
one action.

### Writes

| Function | What it may set | Constraint |
| --- | --- | --- |
| `createEvent` | Everything except `organizerId` | must equal own uid |
| `updateEvent` | Everything except `organizerId` | owner on both sides |
| `deleteEvent` | — | owner |
| `createCoupon` | Code, type, amount, limit, expiry, scope | `organizerId` = own uid |
| `redeemTicket` | `status`, `redeemedAt` — nothing else | `hasOnly(['status','redeemedAt'])` |
| `updateUserProfile` | Branding and contact fields | `noPrivilegedFields()` |

### The one write that is deliberately tiny

`redeemTicket` is the most security-sensitive action an organiser performs, and it is
the most constrained:

```
allow update: if isSuperuser()
              || (isSignedIn()
                  && resource.data.organizerId == request.auth.uid
                  && resource.data.status == 'valid'
                  && request.resource.data.status == 'redeemed'
                  && request.resource.data.diff(resource.data).affectedKeys()
                       .hasOnly(['status','redeemedAt']));
```

Four conditions, all necessary:

| Condition | Prevents |
| --- | --- |
| `organizerId == uid` | Scanning another organiser's tickets |
| `resource.data.status == 'valid'` | Re-redeeming, and reviving a refunded ticket |
| `request.resource.data.status == 'redeemed'` | Using the scan path to set any other state |
| `hasOnly(['status','redeemedAt'])` | Editing the price, the attendee, or the event on the way through |

Without the fourth condition an organiser could rewrite `price` on every ticket they
scan and change what the platform is owed. It is not a hypothetical — it is the
straightforward exploit of a rule that only checked `status`.

### Commercial arithmetic

Every money figure an organiser sees comes from `src/shared/pricing.ts`:

```ts
const terms = commissionTermsFor(profile);          // bespoke, else platform default
const { gross, commission, adminFees, platformTotal, net } = settle(tickets, terms);
const fee = platformCutForTicket(ticket.price, terms);   // per line on the statement
```

The overview, the revenue statement, the reports page, the organiser settings badge
and the superuser's commissions table all call the same two functions. Before that
extraction the formula `(gross * rate) / 100 + adminFee * count` was written out by
hand in four files — four chances for the organiser's dashboard and the admin's audit
screen to quietly disagree about what the platform is owed.

---

## 16.4 Structure

```
src/app/dashboard/organiser/
├── page.tsx                    overview · gross · net · upcoming
├── events/
│   ├── page.tsx                list, draft/published state
│   ├── new/page.tsx            creation form
│   └── [id]/edit/page.tsx      edit, publish, cancel
├── tickets/page.tsx            orders and attendees
├── coupons/page.tsx            discount codes
├── promotions/page.tsx         paid placements
├── revenue/page.tsx            balance · statement · payout methods · withdrawal
├── reports/page.tsx            per-event, per-category, CSV export
├── ai-studio/page.tsx          ad-copy generation, ACU metered
└── settings/page.tsx           profile, branding, commercial terms

src/app/events/[id]/check-in/   door scanner (organiser-only, event-scoped)

src/frontend/components/
├── events/SeatMap · EventMap · Countdown
└── dashboard/Scanner · charts · ProfileForm · RequireRole
```

Every one of these pages is wrapped in `RequireRole role="organiser"`, which is
explicitly documented in its own source as *"a UX affordance, not a security
boundary — actual authorisation is enforced by the Firestore security rules."*
Both statements matter: the guard exists so an organiser does not see a broken screen,
and it is not trusted so a hostile client gains nothing by removing it.

---

## 16.5 Architecture

### Catalogue writes go direct

```
Event form ──▶ shared/data/repositories.createEvent ──▶ Firestore ──▶ rules
                                                                       │
                                                    isApprovedOrganiser() ∧ owns it
```

No API route. The authorisation predicate the route handler would run is the exact
predicate the database already runs, and the database version cannot be bypassed by
calling Firestore directly.

### AI Studio goes through the metering door

```
AI Studio form ──▶ app/api/ai ──▶ backend/ai/flows.generateAdCopy ──▶ Gemini
                       │
                       ├─ balance check      (refuse below MIN_BALANCE_ACU_TO_RUN_AI)
                       ├─ chargeForProviderCost(cost) → × 3 → ACU, rounded up
                       └─ acu-ledger.aiSpend  (Admin SDK)
```

The response carries its own price back to the UI — `billing: { acu, providerCostUsd,
userChargeUsd }` — so the organiser sees what a generation cost immediately, not on a
statement four weeks later. An AI feature whose cost is invisible until the invoice is
a support ticket with a delay fuse on it.

### The door is offline-hostile by design

```
/events/[id]/check-in
    │ camera → QR → reference
    ▼
getTicketById ──▶ verify: event matches, organiser matches, status == 'valid'
    ▼
redeemTicket ──▶ single-field update
    ▼
accepted · already redeemed · wrong event · not found
```

Four outcomes, all distinct on screen. "Already redeemed" is not an error state — it
is the single most important thing a door steward needs to be able to tell apart from
"not found", because one means *a duplicate is being presented* and the other means
*this ticket was never sold*.

---

## 16.6 Flows

### F1 — Onboarding

```
/register/organiser
   │ name · company · email · password
   ▼
Auth user + profile { userType: 'organiser', status: 'pending' }
   │  rules refuse any other status at creation
   ▼
dashboard visible, creation blocked, banner explains why
   ▼
──────────── superuser reviews at /dashboard/superuser/approvals ────────────
   │
   ├─ approve → status: 'approved' → isApprovedOrganiser() now true
   └─ reject  → status: 'suspended'
```

### F2 — Event lifecycle

```
create (draft)
   │ title · description · category (group::subcategory) · images
   │ type: physical | online | livestream
   │ date · location · coordinates · capacity
   │ tiers: name · price · quantity
   │ optional: seat map · speakers · recurrence · stream details
   ▼
draft  ──── visible to owner and admins only ────
   │ publish
   ▼
published ──▶ appears in /events, search, category pages, organiser profile
   │
   ├─ edit    → same rules, ownership checked on both sides
   └─ cancel  → status: 'cancelled', existing tickets keep their record
```

Cancelling does not delete tickets. The buyer needs a record of what they bought and
the organiser needs a record of what they owe.

### F3 — Selling

```
published event
   │
   ├─ organic discovery: /events, search, filters, calendar
   ├─ organiser profile page: /organisers/[id]
   ├─ coupon: code created here, redeemed in the buy box
   └─ paid placement: featured grid, video ad, newsletter
        │
        ▼
   customer buys (doc 15, F2)
        │
        ▼
   ticket created with organizerId frozen onto it
        │
        ▼
   appears in …/tickets, …/revenue, …/reports
```

Ticket documents carry `eventTitle`, `eventDate`, `eventLocation`, `organizerName` as
**frozen copies**, not references. A ticket printed for a venue that later renames
itself must still say what it said when it was sold. Denormalisation here is a
correctness requirement, not a performance optimisation.

### F4 — Door

```
staff open /events/[id]/check-in on the event they are working
   ▼
scan QR → reference
   ▼
┌──────────────┬─────────────────┬──────────────┬───────────┐
│ valid, mine  │ already redeemed│ other event  │ not found │
│ → admit,     │ → refuse, show  │ → refuse,    │ → refuse  │
│   redeem     │   redeemedAt    │   name event │           │
└──────────────┴─────────────────┴──────────────┴───────────┘
```

The scanner is scoped to one event by URL. An organiser running three simultaneous
shows cannot accidentally admit a Saturday ticket at Friday's door, because the check
is `resource.data.eventId` against the page's event, not a global lookup.

### F5 — Money

```
tickets sold
   ▼
settle(tickets, commissionTermsFor(profile))
   ├─ gross         total ticket face value
   ├─ commission    gross × percent
   ├─ adminFees     adminFee × ticket count
   ├─ platformTotal commission + adminFees
   └─ net           gross − platformTotal
   ▼
/dashboard/organiser/revenue
   ├─ running-balance statement, newest first, per-ticket debit and credit
   ├─ payout method: Stripe Connect · Bitripay · bank transfer
   └─ withdrawal request, minimum £10
```

The statement recomputes a running balance from the ticket history rather than storing
a balance field. A stored balance and a ticket list that disagree is an incident; a
derived balance cannot disagree with its own inputs.

### F6 — AI-assisted marketing

```
AI Studio: event name · description · audience · channel · tone
   ▼
balance ≥ 1 ACU?  ──no──▶ refuse with a link to top-up
   │ yes
   ▼
POST /api/ai → generateAdCopy → { headline, body, callToAction, hashtags[] }
   ▼
displayed with its exact cost: N ACU (provider $X × 3)
   ▼
copy to clipboard → paste into the event description or a social post
```

Output is a constrained structured object, not free text. A headline field that
sometimes contains three paragraphs is unusable in a layout, and a schema is cheaper
than parsing.

---

## 16.7 Workflow summary

| Stage | Organiser does | System does | Enforced by |
| --- | --- | --- | --- |
| Apply | Register with company details | Create `pending` profile | create rule pins `pending` |
| Wait | Complete profile and branding | Block all supply creation | `isApprovedOrganiser()` |
| Build | Draft events, tiers, seat maps | Keep drafts private | events read rule |
| Publish | One action | Expose to catalogue and search | `status == 'published'` |
| Promote | Coupons, placements | Charge on approval | coupons create rule |
| Sell | Nothing | Issue tickets on webhook | Admin SDK |
| Admit | Scan at the door | Single-direction redeem | `hasOnly(['status','redeemedAt'])` |
| Settle | Request withdrawal | `settle()` derives every figure | `shared/pricing.ts` |
| Report | Export CSV | Aggregate per event and category | Own tickets only |

## 16.8 What the organiser role deliberately cannot do

1. Create anything at all while `pending` or `suspended`.
2. Read, edit or scan another organiser's events, tickets or coupons.
3. Reassign an event to a different organiser.
4. Change their own commission percentage or admin fee.
5. Change any field on a ticket other than `status` and `redeemedAt`.
6. Move a ticket from `redeemed` back to `valid`.
7. Approve their own mobile-money payments, or anyone else's.
8. Read another organiser's revenue, or the platform's aggregate figures.
9. Grant themselves ACU credit.

Items 3, 4 and 5 are the ones that would be easy to miss in a hand-rolled permission
check and are cheap to state once in a rule. That asymmetry is the argument for putting
authorisation in the database rather than in the application.
