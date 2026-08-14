# 14 — Layer Architecture: Frontend / Backend / Shared

## 14.1 The dependency direction

```
        ┌─────────────────────────────────────────┐
        │  src/app        routing shell only      │
        │  pages · layouts · route handlers       │
        └────────────┬───────────────┬────────────┘
                     │               │
         ┌───────────▼──────┐   ┌────▼─────────────┐
         │  src/frontend    │   │  src/backend     │
         │  browser only    │   │  server only     │
         └───────────┬──────┘   └────┬─────────────┘
                     │               │
                     └───────┬───────┘
                             ▼
                   ┌──────────────────┐
                   │   src/shared     │
                   │  depends on      │
                   │  nothing         │
                   └──────────────────┘
```

**Four rules. All four are lint errors, not review comments.**

| # | Rule | Why |
| --- | --- | --- |
| 1 | `shared` imports nothing from `frontend`, `backend` or `app` | It is the bottom layer. A cycle here makes every layer above untestable in isolation |
| 2 | `frontend` never imports `backend` | Server-only code — Stripe secret keys, Genkit clients — would be bundled into the browser |
| 3 | `backend` never imports `frontend` | A server module has no business depending on a React component |
| 4 | `app` is a shell | Pages compose frontend; route handlers orchestrate backend. Business logic lives in neither |

Enforced in `eslint.config.mjs` via `no-restricted-imports`, scoped per directory.
Each violation message names the fix, not just the rule.

### Verified, not asserted

```
$ npx eslint src/frontend/components/__boundary_probe.ts
  error  '@/backend/payments/stripe' import is restricted…
         frontend/ must not import backend/ — server-only code would leak into
         the client bundle. Call a route handler in app/api instead.

$ npx eslint src/shared/__boundary_probe.ts
  error  '@/frontend/components/ui/button' import is restricted…
         shared/ is the bottom layer — it must not import frontend, backend or app.
```

## 14.2 What lives where

### `src/shared` — isomorphic contracts

Runs identically in the browser and on the server. **No DOM APIs, no Node built-ins,
no `window`, no `fs`.**

| Path | Contents |
| --- | --- |
| `types/` | The domain model: `Event`, `Ticket`, `UserProfile`, `Coupon`, `OfflinePayment`, `LedgerEntry` |
| `constants/categories.ts` | 10 groups, 47 subcategories, group-scoped keys |
| `constants/countries.ts` | ISO country list |
| `constants/billing.ts` | ACU rate, markup, commission defaults, offline fee, top-up packages |
| `constants/placeholder-images.ts` | Deterministic placeholder seeds |
| `data/repositories.ts` | Firestore access via the client SDK |
| `data/seed.ts` | The demo dataset used when Firebase is unconfigured |
| `firebase/client.ts` | SDK initialisation, with inert handles when unconfigured |
| `pricing.ts` | Commission, settlement, coupons, inventory arithmetic |
| `utils.ts` | Formatting, distance, references |
| `errors.ts` | `FirestorePermissionError`, auth error translation |

**Why the data layer is `shared` and not `backend`:** it uses the Firebase *client*
SDK, and it genuinely runs in both places. Server components (`/events/[id]`,
`/organisers`) call `getEventById` during SSR; client components call the same
function in the browser. Authorisation is enforced by `firestore.rules` in both cases,
so there is no privilege difference between the two call sites.

Calling that module "backend" would be a lie that invites someone to put a secret in
it.

### `src/frontend` — the browser

| Path | Contents |
| --- | --- |
| `components/ui/` | 28 design-system primitives |
| `components/common/` | Header, Footer, Logo, SplashScreen, theming |
| `components/events/` | Cards, filters, list, countdown, map, seat map, buy box |
| `components/dashboard/` | Scanner, ticket card, charts, profile form, role guard |
| `components/tickets/` | QR ticket modal |
| `components/auth/` | Registration forms |
| `components/ai/` | Recommendation surfaces |
| `components/home/` | Video ads, featured events |
| `hooks/` | `use-auth`, `use-cart`, `use-toast`, `use-mobile` |

### `src/backend` — server only

Every module starts with `import 'server-only'`, so an accidental import from the
client is a **build error**, not a runtime surprise. That is a second, independent
guard behind the lint rule.

| Path | Contents |
| --- | --- |
| `ai/genkit.ts` | Genkit runtime, provider cost estimation |
| `ai/schemas.ts` | Zod schemas — separate from flows because a `'use server'` file may only export async functions |
| `ai/flows.ts` | `generateAdCopy`, `recommendEvents`, `findSimilarEvents` |
| `payments/stripe.ts` | Checkout sessions, webhook verification |
| `payments/bitripay.ts` | Token exchange, payment creation |
| `services/payment-events.ts` | Records a verified provider event for the issuance function |
| `firebase/admin.ts` | Admin SDK handle — the only code that bypasses `firestore.rules` |
| `services/acu-ledger.ts` | Append-only wallet ledger |

### `src/app` — the shell

Pages compose frontend components. Route handlers parse, delegate to backend, and
format the response. **Neither contains business logic.** `src/app/api/checkout` went
from 95 lines of inline Stripe code to 70 lines of parsing plus one adapter call.

## 14.3 How the layers talk

### Frontend needs server work → HTTP

```
Component ──fetch──▶ app/api/ai ──▶ backend/ai/flows ──▶ Gemini
                            │
                            └──▶ shared/constants/billing  (cost → ACU)
```

The browser never holds a model API key or a Stripe secret. `/api/ai` is the only
door, which is also where cost is metered.

### Frontend needs data → repository directly

```
Component ──▶ shared/data/repositories ──▶ Firestore ──▶ firestore.rules
```

No API hop. Authorisation is enforced at the database, so an HTTP layer in front would
add latency and a second place for authorisation to drift, without adding safety.

### Payment confirmation → webhook, never the redirect

```
Stripe ──webhook──▶ app/api/stripe-webhook ──▶ backend/payments/stripe (verify)
                                           └──▶ backend/services/payment-events
                                                        │
                                                        ▼
                                            payment_events/{providerEventId}
                                                        │  Firestore trigger
                                                        ▼
                                            functions/src/issuance.issueTickets
```

A user who closes the tab the instant their card is charged still receives their
ticket. The redirect is a convenience; the webhook is the authority.

The webhook records and returns; it does not issue. Stripe marks a delivery failed if
it is not acknowledged within seconds, and a Firestore transaction under on-sale
contention is exactly the operation that occasionally takes longer than that. The
document id is the provider's event id, so a replayed delivery cannot create a second
document and cannot issue a second set of tickets.

## 14.4 Two guards, not one

| Guard | Catches | When |
| --- | --- | --- |
| `no-restricted-imports` | A `frontend → backend` import | Lint, before commit |
| `import 'server-only'` | The same import, if lint is bypassed | Build |

Defence in depth matters here because the failure mode is silent: a leaked Stripe
secret in a client bundle does not throw, it just sits there in JavaScript anyone can
read.

## 14.5 Where privileged work still has to go

Three operations cannot run with the client SDK, because `firestore.rules` correctly
forbids them:

| Operation | Blocked by | Correct home |
| --- | --- | --- |
| Issue a ticket for another user | `tickets` create requires `userId == request.auth.uid` | `functions/src/issuance.ts` (Cloud Function, Admin SDK) |
| Write the ACU ledger | `wallet_ledger` is `create/update/delete: false` for all clients | `backend/services/acu-ledger` + Admin SDK |
| Grant credit as an admin | Same | Same |

Both services are written with real, typed contracts and pure, testable core functions
(`buildTickets`, `buildEntry`). Only persistence is stubbed, and each stub throws a
message naming the debt item rather than failing silently.

**These rules are not obstacles to work around.** A rule permissive enough to let the
client mint tickets is permissive enough to let a hostile client mint tickets. The
Admin SDK exists precisely so trusted code can do what untrusted code must not.

## 14.6 Testing implications

| Layer | Strategy | Needs |
| --- | --- | --- |
| `shared` | Pure unit tests | Nothing. `settle`, `applyCoupon`, `buildEntry`, `getDistanceInMiles` are all deterministic |
| `backend` | Unit + contract tests | Mocked provider HTTP |
| `frontend` | Component tests | Mocked repositories |
| `app` | E2E | Firebase emulator |
| Rules | `@firebase/rules-unit-testing` | Emulator — **blocking in CI** |

The separation buys this: `shared/pricing.ts` is tested without a browser, a server or
a database. Before it existed, commission arithmetic was inlined in four dashboard
pages and could only be exercised by rendering React.

## 14.7 Migration notes

| Old | New |
| --- | --- |
| `@/components/*` | `@/frontend/components/*` |
| `@/hooks/*` | `@/frontend/hooks/*` |
| `@/lib/utils` | `@/shared/utils` |
| `@/lib/errors` | `@/shared/errors` |
| `@/lib/firebase` | `@/shared/firebase/client` |
| `@/lib/placeholder-images` | `@/shared/constants/placeholder-images` |
| `@/server/database` | `@/shared/data/repositories` |
| `@/server/demo-data` | `@/shared/data/seed` |
| `@/server/ai/*` | `@/backend/ai/*` |

All moves used `git mv`, so file history is preserved and `git log --follow` works.

## 14.8 Adding code — the decision

```
Does it touch the DOM, React, or browser APIs?
  └─ yes → src/frontend

Does it need a secret, or must it never reach the browser?
  └─ yes → src/backend   (and add `import 'server-only'`)

Is it a type, a constant, or pure logic both sides need?
  └─ yes → src/shared

Is it a URL, a page, or an HTTP entry point?
  └─ yes → src/app       (thin — delegate immediately)
```

If something seems to belong in two layers, it is usually two things. Split it: the
pure part goes to `shared`, the effectful part to `frontend` or `backend`.
