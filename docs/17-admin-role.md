# 17 — The Platform Admin Role (`superuser`)

The admin is the only role that can act on documents it does not own. Every other
permission in the system is scoped by `request.auth.uid`; the superuser's is scoped by
a single predicate that says *this person is trusted*. That makes it the role whose
boundaries need stating most precisely.

Grounded in `userType: 'superuser'`, the `isSuperuser()` helper in `firestore.rules`,
and `src/app/dashboard/superuser/`.

---

## 17.1 Account

### How a superuser comes to exist

Not by registration. The `users` create rule permits exactly two roles:

```
request.resource.data.userType in ['customer', 'organiser']
```

`superuser` is not in that list, so the first admin must be created out of band —
directly in the Firestore console, or by a seeding script running with the Admin SDK.
Subsequent admins are promoted by an existing admin, because `allow update: if
isSuperuser()` lets an admin write any field on any user document, including
`userType`.

**Consequence, stated plainly:** admin is a self-propagating role with no second
signature. Whoever holds it can mint another one. That is the correct model for a
platform of this size and the wrong model past it — see the open item in §17.8.

### The predicate

```
function isSuperuser() {
  return isSignedIn()
    && exists(/databases/$(database)/documents/users/$(request.auth.uid))
    && userDoc().userType == 'superuser';
}
```

Note the `exists()` check before the `get()`. Without it, a signed-in user whose
profile document has been deleted causes the rule to evaluate against a null document
rather than returning false cleanly. Rules that error and rules that deny are the same
to the caller, but not to whoever is reading the logs at 3am.

### The account cannot be self-service

There is no `/register/superuser` route and adding one would be a mistake. The role's
value comes from the fact that acquiring it requires access the platform's own sign-up
flow does not grant.

---

## 17.2 Features

| # | Feature | Route | Collection touched |
| --- | --- | --- | --- |
| 1 | Platform overview: users, events, tickets, revenue streams | `/dashboard/superuser` | aggregate |
| 2 | Organiser approvals queue | `…/approvals` | `users` |
| 3 | Commission agreements, per organiser | `…/commissions` | `users` |
| 4 | Offline (mobile-money) payment review | `…/offline-payments` | `offline_payments` |
| 5 | ACU console: search, inspect, grant credit | `…/acu` | `users`, `wallet_ledger` |

### The overview

Three metrics read live — `getPlatformStats()` returns `totalUsers`, `totalEvents`,
`totalTickets`. Three revenue lines are derived from them: commission, featured
placements, video ads.

The derivation currently uses illustrative multipliers rather than reading actual
transactions. This is marked in the code and is debt item **D3**: an admin revenue
figure that is modelled rather than measured is a number that will eventually be quoted
to a board. It must be replaced with a sum over real ticket and placement records
before the platform trades.

---

## 17.3 Functions and functionalities

### What the rules grant the superuser

| Collection | `read` | `create` | `update` | `delete` |
| --- | --- | --- | --- | --- |
| `users` | all | via Admin SDK | **all fields, any user** | yes |
| `events` | all, drafts included | — | any event | yes |
| `tickets` | all | yes | **any field, any state** | yes |
| `coupons` | all | — | any | yes |
| `offline_payments` | all | — | approve / deny | yes |
| `wallet_ledger` | all | **no** | **no** | **no** |

Read that last row again. The superuser is the only principal with unrestricted write
access to every other collection, and it still cannot write the ledger from a client:

```
match /wallet_ledger/{entryId} {
  allow get, list: if isSuperuser() || (isSignedIn() && resource.data.uid == request.auth.uid);
  allow create, update, delete: if false;
}
```

`if false` — not `if isSuperuser()`. Credit is minted only by trusted server code
holding the Admin SDK, which bypasses rules entirely. The distinction that matters is
*a browser session belonging to an admin* versus *server code an admin invoked*. The
first can be phished, XSS'd, or left open on a train. The second cannot.

### Privileged operations

| Operation | Function | Effect |
| --- | --- | --- |
| Approve an organiser | `updateUserProfile(uid, { status: 'approved' })` | `isApprovedOrganiser()` becomes true |
| Suspend an organiser | `updateUserProfile(uid, { status: 'suspended' })` | All supply creation stops immediately |
| Set bespoke terms | `updateUserProfile(uid, { commissionPercent, adminFee })` | `commissionTermsFor` picks them up everywhere |
| Approve a payment | `updateOfflinePaymentStatus(id, 'approved', reviewer)` | Tickets issued |
| Deny a payment | `updateOfflinePaymentStatus(id, 'denied', reviewer)` | Nothing issued, decision recorded |
| Grant credit | `acu-ledger.adminGrant(uid, acu, reason)` | Ledger entry + balance |
| Find any user | `findUserByEmail(email)` | Profile lookup for support |

Every one of these is a write nobody else on the platform can perform. Together they
are the entire set — there is no sixth screen with a hidden capability.

### The ledger contract

`buildEntry` in `src/backend/services/acu-ledger.ts` refuses to construct an entry
that does not balance:

```ts
// balanceAfter must equal balanceBefore + delta, and must never go negative
// ADMIN_GRANT and REVERSAL additionally require a non-empty reason
```

An admin grant without a reason is rejected at construction, before it reaches the
database. An unexplained credit is indistinguishable from a fraudulent one when it is
read back six months later, and by then the person who made it has forgotten.

---

## 17.4 Structure

```
src/app/dashboard/superuser/
├── page.tsx                overview · metrics · revenue streams · queue counts
├── approvals/page.tsx      pending organisers, approve / reject
├── commissions/page.tsx    platform defaults + per-organiser agreements
├── offline-payments/page.tsx  pending claims, approve / deny
└── acu/page.tsx            find an account · balance · grant with reason

src/backend/services/
├── acu-ledger.ts           buildEntry · welcomeBonus · stripeTopup · adminGrant ·
│                           aiSpend · reversal
└── ticket-issuance.ts      buildTickets · issueTickets

firestore.rules              isSuperuser() — the entire trust definition
```

Five screens. The admin surface is small on purpose: every screen added here is a new
way for a compromised admin session to do damage, so each one has to earn its place by
being a task that genuinely cannot be done anywhere else.

---

## 17.5 Architecture

### Reads and role writes go direct

```
Approvals ──▶ getOrganisers('pending') ──▶ Firestore ──▶ isSuperuser()
Approvals ──▶ updateUserProfile(uid, { status }) ──▶ Firestore ──▶ isSuperuser()
```

The admin's authority is checked by the database on every single operation, using the
admin's own session. There is no service account in the browser and no "admin mode"
flag the client can assert.

### Credit goes through the server, always

```
ACU console ──▶ (route handler) ──▶ backend/services/acu-ledger.adminGrant
                                          │ buildEntry: balance assertion + reason
                                          ▼
                                   Admin SDK ──▶ wallet_ledger  (rules bypassed)
                                             └─▶ users/{uid}.wallet
```

Two writes that must both land or neither: the ledger entry and the balance field. This
is the strongest argument in the codebase for a transaction, and it is debt item
**D2** — `post()` currently throws with a message naming the debt rather than writing
half of it.

### Approval issues tickets, and that is also privileged

```
Offline payments ──approve──▶ updateOfflinePaymentStatus
                                    │
                                    ▼
                        backend/services/ticket-issuance.issueTickets
                                    │  buys tickets *for another user*
                                    ▼
                              Admin SDK required
```

`tickets` create requires `userId == request.auth.uid`. An admin approving a customer's
mobile-money payment is, by definition, creating a ticket for somebody else. The rule
is right and the operation is legitimate — which is exactly the situation the Admin SDK
exists for. Loosening the rule to accommodate it would loosen it for everyone.

---

## 17.6 Flows

### F1 — Organiser approval

```
/dashboard/superuser/approvals
   │ getOrganisers('pending')
   ▼
review: company name · website · bio · contact
   │
   ├─ approve → status: 'approved'
   │              └─ isApprovedOrganiser() true → may create events and coupons
   │
   └─ reject  → status: 'suspended'
                  └─ signs in, sees the dashboard, creates nothing
```

Rejection is `suspended`, not deletion. The account and its history survive so the
decision can be reviewed, appealed, or reversed with one field.

### F2 — Commission agreement

```
/dashboard/superuser/commissions
   │ platform default: 5% + £0.50 per ticket
   ▼
select organiser → set commissionPercent, adminFee
   ▼
updateUserProfile — only a superuser may write these two fields
   ▼
commissionTermsFor(profile) now returns the bespoke terms
   ▼
takes effect immediately in:
   ├─ organiser overview          (settle)
   ├─ organiser revenue statement (platformCutForTicket)
   ├─ organiser reports           (settle)
   ├─ organiser settings badge
   └─ this table
```

One write, five surfaces, zero divergence — because all five call the same function in
`shared/pricing.ts`. That is the payoff for extracting the arithmetic instead of
inlining it in each page.

### F3 — Offline payment review

```
customer pays by Vodacom / Airtel / Orange / Africell
   │ submits reference; status pinned to 'pending' by the create rule
   ▼
/dashboard/superuser/offline-payments
   │ getPendingOfflinePayments()
   ▼
compare against the provider statement:
   reference · paymentNumber · baseAmount · serviceFee (2%) · totalAmount
   │
   ├─ approve → status: 'approved', reviewedAt, reviewedBy
   │               └─ tickets issued via the Admin SDK
   │
   └─ deny    → status: 'denied', reviewedAt, reviewedBy
                   └─ nothing issued
```

`reviewedBy` records which admin decided. Attribution is what makes an approval queue
auditable rather than merely functional.

### F4 — ACU grant

```
/dashboard/superuser/acu
   │ findUserByEmail(email)
   ▼
inspect: balance, lifetime granted / purchased / spent
   ▼
choose amount in USD → usdToAcu → ACU
   │ reason is required, not optional
   ▼
buildEntry({ type: 'ADMIN_GRANT', delta, reason }, balanceBefore)
   │ asserts balanceAfter === balanceBefore + delta, and ≥ 0
   ▼
Admin SDK: append to wallet_ledger, update users/{uid}.wallet
   ▼
recipient sees it in their own ledger — same entry, same reason
```

The recipient can read the entry that credited them, including the reason. Credit that
appears without explanation generates a support ticket; credit that explains itself
does not.

### F5 — Monitoring

```
/dashboard/superuser
   ├─ getPlatformStats()          users · events · tickets
   ├─ getOrganisers('pending')    approval backlog
   ├─ getPendingOfflinePayments() payment backlog
   └─ derived revenue lines       commission · featured · video ads   ← D3
```

The two queue counts are the operationally important numbers on this page. A growing
approvals backlog is organisers who cannot sell yet; a growing payments backlog is
customers who have paid and hold nothing.

---

## 17.7 Workflow summary

| Trigger | Admin action | System effect | Enforced by |
| --- | --- | --- | --- |
| Organiser registers | Review and approve | Supply creation unlocked | `isSuperuser()` on `users` update |
| Bespoke deal agreed | Set percent and fee | All settlement figures change | `noPrivilegedFields()` blocks self-set |
| Mobile-money claim | Verify against statement | Tickets issued or nothing | `offline_payments` update is admin-only |
| Support credit needed | Grant with a reason | Ledger entry + balance | `buildEntry` assertion |
| Abuse detected | Suspend the account | Creation stops instantly | `isApprovedOrganiser()` |
| Bad charge | Reversal entry | Balance corrected, both entries kept | Append-only ledger |

Note the last row: a mistaken grant is fixed by appending a `REVERSAL`, never by
editing or deleting the original. Both entries stay. A ledger that can be rewritten is
a record of what somebody currently wants to be true.

---

## 17.8 Boundaries, and what is deliberately still missing

### What even the superuser cannot do

1. Write `wallet_ledger` from a browser session — `if false` applies to everyone.
2. Delete a ledger entry. Corrections are reversals.
3. Create an `ADMIN_GRANT` or `REVERSAL` without a reason.
4. Produce a ledger entry whose arithmetic does not balance.
5. Drive a balance negative.

### Open items

| ID | Item | Why it matters |
| --- | --- | --- |
| **D1** | Ticket issuance needs the Admin SDK | Approving an offline payment currently throws rather than issuing |
| **D2** | Ledger persistence needs the Admin SDK + a transaction | Entry and balance must land together or not at all |
| **D3** | Overview revenue is modelled, not measured | A derived figure will eventually be quoted as fact |
| **D4** | No audit log of admin actions | `reviewedBy` covers payments only; role changes and grants are unattributed |
| **D5** | Admin is self-propagating with no second signature | Correct at this size, wrong past it — needs two-person approval for role grants |

D4 and D5 are the two that grow more expensive the longer they wait. Everything else on
this list is wiring; those two are a design decision that becomes harder to change once
there are enough admins that nobody remembers who granted whom.

### The invariant that governs the whole role

> Every admin capability is a capability *no other principal has*. If a screen here
> could be built for organisers instead, it belongs there — concentrating power in the
> admin role is a cost paid on every session, not a feature.

That is why the admin surface is five screens rather than fifty, and why the
organiser's revenue page recomputes from their own tickets rather than asking an admin
for a figure.
