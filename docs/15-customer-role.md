# 15 — The Customer Role

The customer is the only role that can exist without approval, without a company, and
without ever seeing an admin. Everything below is grounded in shipped code —
`userType: 'customer'` in `src/shared/types/index.ts`, the `users` and `tickets` blocks
of `firestore.rules`, and `src/app/dashboard/customer/`.

---

## 15.1 Account

### Identity

| Field | Source | Mutable by customer |
| --- | --- | --- |
| `uid` | Firebase Auth | never |
| `email` | Registration | via Auth, not Firestore |
| `fullName` | Registration | yes |
| `userType: 'customer'` | Registration | **no** — `noPrivilegedFields()` |
| `status` | Set to `approved` at creation | **no** |
| `dateOfBirth`, `phone`, `address` | Profile form | yes |
| `wallet` | Server-side ledger | **no** |
| `welcomeBonusGranted` | Server-side | **no** |

A customer account is `approved` from the moment it is created. There is no queue,
no review, no waiting. Contrast this with the organiser (doc 16), who cannot sell
anything until a human says yes.

### The registration rule, in full

```
allow create: if isSelf(uid)
              && request.resource.data.uid == uid
              && request.resource.data.userType in ['customer', 'organiser']
              && (request.resource.data.userType != 'organiser'
                  || request.resource.data.status == 'pending');
```

A customer signing up cannot write `userType: 'superuser'`. A customer already signed
up cannot edit their own document to become one — `noPrivilegedFields()` rejects any
update whose `affectedKeys()` touches `userType`, `status`, `commissionPercent`,
`adminFee`, `wallet` or `welcomeBonusGranted`.

This is the whole privilege-escalation defence, and it is six lines long. It is short
because it is a *deny-list of fields on a self-update*, not a role check that has to
be repeated everywhere.

### Account states

```
                  register
   (none) ──────────────────────▶ approved ──────────────┐
                                     │                   │
                        superuser    │        customer   │
                        suspends     ▼        deletes    ▼
                                 suspended            (removed)
```

`suspended` is written only by a superuser. The customer cannot set it, cannot clear
it, and cannot see the field change in their own UI other than by being blocked.

### Deletion

`DeleteAccountDialog` in the customer dashboard removes the Auth user and the profile
document. Tickets already issued are **not** cascade-deleted — an organiser's door
scan must keep working after a buyer deletes their account, and the ticket is also the
organiser's record of a sale.

---

## 15.2 Features

| # | Feature | Route | Depends on |
| --- | --- | --- | --- |
| 1 | Browse the catalogue | `/events` | `getEvents` |
| 2 | Search, filter, calendar view | `/events` | `EventList`, `EventFilters` |
| 3 | Event detail, map, seat map, countdown | `/events/[id]` | `getEventById` |
| 4 | Organiser directory and profile | `/organisers`, `/organisers/[id]` | `getOrganisers` |
| 5 | Cart across multiple events | `/cart` | `use-cart` (localStorage) |
| 6 | Card checkout | Stripe | `/api/checkout` |
| 7 | Crypto checkout | Bitripay | `/api/bitripay-checkout` |
| 8 | Mobile-money checkout | Offline | `offline_payments` |
| 9 | Coupon redemption | Buy box | `findCouponByCode`, `applyCoupon` |
| 10 | Ticket wallet with QR | `/dashboard/customer` | `getUserTickets` |
| 11 | AI recommendations | Home, event detail | `/api/ai` |
| 12 | ACU credit wallet | `/dashboard/customer/wallet` | `getLedgerEntries` |
| 13 | Profile management | `/dashboard/customer` | `updateUserProfile` |
| 14 | Account deletion | `/dashboard/customer` | `DeleteAccountDialog` |

Features 1–4 need no account at all. The catalogue is public because
`firestore.rules` allows `get, list` on any event whose `status == 'published'`,
with no `isSignedIn()` requirement. Requiring a login to browse is a conversion tax
with no security benefit.

---

## 15.3 Functions and functionalities

### Reads the customer can perform

| Function | Returns | Rule that permits it |
| --- | --- | --- |
| `getEvents({ featuredOnly, max })` | Published events | `status == 'published'` |
| `getEventById(id)` | One event, or `null` | Same |
| `getOrganisers()` | Organiser profiles | `resource.data.userType == 'organiser'` |
| `getUserTickets(uid)` | Own tickets only | `resource.data.userId == request.auth.uid` |
| `getLedgerEntries(uid)` | Own ledger only | `resource.data.uid == request.auth.uid` |
| `findCouponByCode(code)` | One coupon | `isSignedIn()` — **not public** |

Coupon reads require a signed-in user deliberately. A public read on `coupons` would
let anybody enumerate every discount code on the platform with a single query.

### Writes the customer can perform

| Function | Constraint enforced at the database |
| --- | --- |
| `createUserProfile` | Only for own `uid`, only `customer`/`organiser` |
| `updateUserProfile` | Only own doc, only non-privileged fields |
| `createTicket` | Only `userId == own uid`, only `status: 'valid'` |
| `createOfflinePayment` | Only own `userId`, always `status: 'pending'` |

### Writes the customer can never perform

| Attempt | Blocked by |
| --- | --- |
| Mint a ticket for someone else | `request.resource.data.userId == request.auth.uid` |
| Un-redeem their own ticket | update requires `resource.data.status == 'valid'` and organiser ownership |
| Approve their own mobile-money payment | `offline_payments` update is superuser-only |
| Credit their own ACU wallet | `wallet_ledger` is `create/update/delete: if false` |
| Become an organiser without review | organiser create forces `status: 'pending'` |

### Pure logic the customer's screens run

All from `src/shared/pricing.ts` — no network, no database, testable in isolation:

```ts
availableInTier(tier)          // quantity - sold - held
leadPrice(event)               // cheapest live tier, for the "from £X" label
applyCoupon(subtotal, coupon)  // validity, expiry, usage limit, discount
offlineTotal(amount)           // { baseAmount, serviceFee (2%), totalAmount }
```

`applyCoupon` returning `{ valid: false, reason }` is a *client-side courtesy*. The
authoritative price is recomputed server-side before the Stripe session is created —
a customer who edits the DOM changes the label, not the charge.

---

## 15.4 Structure

```
src/app/
├── events/                     public catalogue + detail
├── organisers/                 public directory + profile
├── cart/                       cart review
├── checkout/success            post-payment landing
├── checkout/cancel             abandonment landing, carries a reason
├── register/customer           sign-up
├── login/ · forgot-password/
└── dashboard/customer/
    ├── page.tsx                tickets · profile · account
    └── wallet/page.tsx         ACU balance, top-up, ledger

src/frontend/components/
├── events/                     EventCard · EventFilters · EventList · Countdown ·
│                               EventMap · SeatMap · BuyBox
├── tickets/                    QR ticket modal
├── dashboard/                  TicketCard · ProfileForm · DeleteAccountDialog · RequireRole
└── ai/                         recommendation surfaces

src/shared/
├── data/repositories.ts        every read and write above
└── pricing.ts                  every number the customer sees
```

The customer surface touches **no** `src/backend` module directly. Card, crypto and AI
all go through a route handler in `src/app/api`. That is rule 2 of doc 14, and for the
customer it is the rule that matters most: the browser is the one place an attacker
already controls.

---

## 15.5 Architecture

### Reads go straight to Firestore

```
EventList ──▶ shared/data/repositories ──▶ Firestore ──▶ firestore.rules
```

No API hop. Authorisation is already at the database; an HTTP layer in front would add
latency and a second place for authorisation to drift out of sync.

### Money goes through the server, always

```
BuyBox ──POST form──▶ app/api/checkout ──▶ backend/payments/stripe ──▶ Stripe
                                                                        │
Stripe ──webhook──▶ app/api/stripe-webhook ──▶ backend/payments/stripe (verify sig)
                                            └─▶ backend/services/ticket-issuance
```

Two details that are deliberate, not incidental:

**A form POST, not `fetch`.** The checkout handler answers with a 303 redirect and the
buy box posts to it with a plain HTML `<form>`. An async fetch-then-`location.assign`
loses the user's click gesture and the browser blocks the navigation with *"the current
window does not have permission to navigate the target frame."*

**The webhook is the authority, the redirect is a courtesy.** A buyer whose train
enters a tunnel the instant their card is charged still gets their ticket. Issuing on
the success-page render would lose that sale and produce a charged customer with
nothing to show for it.

### AI is metered at one door

```
Recommendation UI ──▶ app/api/ai ──▶ backend/ai/flows ──▶ Gemini
                            │
                            └──▶ shared/constants/billing → chargeForProviderCost
```

`/api/ai` is the only route to a model, which is also the only place cost can be
measured. Provider cost × 3, converted at 1 ACU = $0.01, rounded up. Balance below
`MIN_BALANCE_ACU_TO_RUN_AI` is a hard stop — not a soft warning, not an overdraft.

---

## 15.6 Flows

### F1 — Registration

```
/register/customer
   │ email + password + full name
   ▼
createUserWithEmailAndPassword ──▶ Firebase Auth
   │
   ▼
createUserProfile({ uid, userType: 'customer', status: 'approved' })
   │  rules verify: isSelf ∧ uid matches ∧ userType ∈ {customer, organiser}
   ▼
welcome bonus: 100 ACU  (server-side; welcomeBonusGranted flips once)
   ▼
/dashboard/customer
```

The bonus is granted server-side and guarded by `welcomeBonusGranted`, which the
customer cannot write. Client-side granting would mean 100 free ACU per
delete-and-recreate cycle.

### F2 — Discovery → purchase (card)

```
/events ──filter──▶ /events/[id] ──▶ BuyBox
                                       │ tier, quantity, optional seat
                                       │ coupon → findCouponByCode → applyCoupon
                                       ▼
                              add to cart ──or──▶ buy now
                                       │
                                       ▼
                            <form method=POST> /api/checkout
                                       │
                                       ▼ 303
                                Stripe Checkout
                          ┌────────────┴────────────┐
                     completed                 abandoned
                          │                         │
             webhook ─▶ issue tickets        /checkout/cancel?reason=…
                          │
                          ▼
                 /checkout/success  ──▶ /dashboard/customer
```

Both terminal states are handled. `/checkout/cancel` carries a `reason` query
parameter so an abandonment caused by *"Stripe is not configured"* is distinguishable
from a customer changing their mind — the two need completely different responses from
whoever is on call.

### F3 — Purchase by mobile money (Congo)

```
BuyBox → offline tab
   │ choose Vodacom / Airtel / Orange / Africell
   ▼
offlineTotal(amount) → base + 2% service fee = total
   │ customer pays the displayed number from their handset
   ▼
createOfflinePayment({ status: 'pending', reference, … })
   │  rules: userId == own uid ∧ status == 'pending'
   ▼
────────────────── waits for a human ──────────────────
   │
   ▼
superuser /dashboard/superuser/offline-payments
   ├─ approved → tickets issued
   └─ denied   → nothing issued, reason recorded
```

The customer submits a *claim*, never a settlement. `status` is pinned to `'pending'`
by the create rule and only a superuser can move it. Self-approval is not blocked by
UI, it is impossible.

### F4 — Attending

```
Ticket issued (status: valid, QR = reference)
   │
   ▼
/dashboard/customer → upcoming tab → TicketCard → QR modal
   │
   ▼
door: organiser scans at /events/[id]/check-in
   │
   ▼
status: valid → redeemed, redeemedAt stamped
   │
   ▼
ticket moves to the past tab; a second scan is refused
```

The scan is a single-field, single-direction update, restricted to the event's own
organiser:

```
diff(resource.data).affectedKeys().hasOnly(['status','redeemedAt'])
```

There is no path from `redeemed` back to `valid` for anyone except a superuser. That
is what makes a ticket single-use rather than merely single-use-by-convention.

### F5 — AI spend

```
Ask for a recommendation
   ▼
balance < MIN_BALANCE_ACU_TO_RUN_AI ? ──yes──▶ refuse, link to top-up
   │ no
   ▼
POST /api/ai ──▶ backend/ai/flows ──▶ Gemini
   ▼
providerCostUsd × 3 → usdToAcu → ceil
   ▼
acu-ledger.buildEntry: balanceAfter = before − charge, asserted ≥ 0
   ▼
append to wallet_ledger (Admin SDK — clients cannot write it)
```

`buildEntry` asserts `balanceAfter === balanceBefore + delta` and refuses a negative
result. A ledger that can silently disagree with itself is worse than no ledger,
because it will be believed.

### F6 — Top-up

```
/dashboard/customer/wallet → package ($3 / $6 / $9)
   ▼
Stripe Checkout ──webhook──▶ acu-ledger.stripeTopup
   ▼
balance += usdToAcu(amount); ledger entry records amountUsd
```

Top-ups are credited on the webhook for exactly the reason tickets are: the customer
closing the tab must not cost them the credit they paid for.

---

## 15.7 Workflow summary

| Stage | Customer does | System does | Enforced by |
| --- | --- | --- | --- |
| Register | Email, password, name | Create Auth user + profile, grant 100 ACU | `users` create rule |
| Discover | Search, filter, calendar | Serve published events | `status == 'published'` |
| Select | Tier, seat, quantity, coupon | `availableInTier`, `applyCoupon` | Client compute, server recompute |
| Pay | Card / crypto / mobile money | Session, or a pending claim | `/api/checkout`, `offline_payments` |
| Receive | Nothing | Webhook issues tickets | Admin SDK |
| Attend | Present QR | Organiser redeems | `hasOnly(['status','redeemedAt'])` |
| Manage | Edit profile, top up, delete | Persist, meter, remove | `noPrivilegedFields()` |

## 15.8 What the customer role deliberately cannot do

Not as a UI omission — as a database refusal:

1. Read another customer's tickets, ledger or profile.
2. Read an unpublished draft event.
3. Issue, alter, refund or un-redeem a ticket.
4. Approve their own offline payment.
5. Create or amend a coupon.
6. Change their own role, status, commission terms or wallet balance.
7. Write a single row of `wallet_ledger`.

Every one of these is a rule in `firestore.rules`, so it holds against the app, against
`curl`, and against a modified client. Hiding a button is not access control.
