# TicketRoyality

**Premium event access. Verified tickets. Royal experience.**

A production-grade ticketing and event management platform for stadiums, concerts,
festivals, clubs, promoters and VIP events — with secure single-use QR tickets,
real-time door validation, fraud control, seat mapping, multi-gateway payments,
AI-assisted marketing and full revenue tooling.

Built with Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Firebase and
Genkit/Gemini.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # optional — the app runs without it
npm run dev                    # http://localhost:9002
```

The platform boots **without any credentials**. With no `NEXT_PUBLIC_FIREBASE_*`
variables set it serves a seeded UK dataset (21 events, 3 organisers, sample tickets)
so every screen is explorable immediately. Visit **`/dev-access`** to switch between
the customer, organiser and platform-admin dashboards without signing in.

Add real Firebase credentials and live Firestore data takes over automatically —
no code changes.

---

## Environment

| Variable | Required for | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_FIREBASE_*` | Auth, database | Six values from your Firebase web app config |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Venue maps | Static Maps API; falls back to a plain address panel |
| `GEMINI_API_KEY` | AI features | Server-only. Without it, AI degrades to deterministic fallbacks |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Card payments | Server-only |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Card payments | Client-safe |
| `BITRIPAY_CLIENT_ID`, `BITRIPAY_SECRET_ID` | Wallet payments | Server-only |
| `NEXT_PUBLIC_SITE_URL` | Payment redirects | e.g. `https://ticketroyality.com` |

Never commit `.env.local`. In production these are wired through Cloud Secret Manager
by `apphosting.yaml`.

---

## What's in it

### Discovery
- Premium dark/gold landing page with hero, feature matrix, revenue tools and CTAs
- Full event catalogue with search, category filter (10 groups, 47 subcategories),
  free / online / live-stream filters
- **Geolocation search** — opt-in, expanding 10 → 20 → 30 mile radius; keyword search
  always reaches worldwide
- Calendar view: pick a date, see that day's events
- AI recommendations and similar-event suggestions, with graceful non-AI fallbacks
- Paid homepage placements: 20-second video ad carousel + featured event grid

### Ticketing
- Multi-tier pricing (early bird, general, VIP, hospitality) with per-tier inventory
- Colour-coded seating sections with lettered rows and automatic seat labels (A1…A20)
- Cart with promo codes, plus direct single-event checkout
- **Single-use QR tickets** bound to one event, carrying attendee, tier, seat, price
  and venue — downloadable and printable
- **Scoped check-in portal**: a shareable link that scans one event and exposes
  nothing else. Green = valid, red = already used or wrong event

### Payments
- **Stripe** — form-POST redirect (keeps navigation in the user's click gesture, which
  an async fetch-then-redirect gets blocked for), plus a signature-verified,
  idempotent webhook
- **Bitripay** — server-to-server token + payment-link flow, credentials never exposed
- **Mobile money (Congo)** — Vodacom, Airtel, Orange, Africell with a 2% service
  charge; the customer submits a reference and an admin approval issues the ticket

### Dashboards
- **Customer** — purchased tickets (upcoming/past), QR modal, profile editor, payment
  methods, ACU wallet, become-an-organiser CTA, account deletion
- **Organiser** — overview with live sales charts, event calendar + list, orders with
  CSV export, coupons, revenue/statement/withdrawals, promotions, AI studio, settings
- **Platform admin** — organiser approvals, offline-payment verification, global and
  per-organiser commission, ACU grant console, platform-wide metrics

### AI + billing (ACU)
1 ACU = $0.01. Every AI call is charged at **provider cost × 3**, rounded up. Every
account is minted with 100 ACU ($1) on creation. At zero balance, AI features stop —
the balance can never go negative. All AI traffic goes through `/api/ai`; the browser
never touches a model provider directly.

---

## Architecture

```
src/
├── app/            Routes (App Router) + API route handlers
├── components/
│   ├── ui/         Design-system primitives
│   ├── common/     Header, Footer, Logo, splash, theming
│   ├── events/     Cards, filters, list, countdown, map, seat map, buy box
│   ├── dashboard/  Scanner, ticket card, charts, role guard
│   ├── tickets/    QR ticket modal
│   └── ai/         Recommendation surfaces
├── hooks/          use-auth, use-cart, use-toast, use-mobile
├── lib/            firebase, utils, errors, placeholder images
├── server/         database.ts (isomorphic data layer), demo-data, ai/
└── shared/         types + constants (categories, countries, billing)
```

`src/shared` is imported by both sides and must stay free of DOM and Node APIs.
`src/server/database.ts` is deliberately isomorphic so server components and client
components share one data layer.

### Hydration discipline
Server and client markup must match exactly. The codebase follows four rules:
1. Dates are formatted with a fixed UTC formatter, never `toLocaleDateString()`.
2. `Date.now()`, `Math.random()`, `localStorage`, `sessionStorage`, `navigator` and
   `window` are only read inside `useEffect`.
3. Components that depend on client-only state render an identical placeholder on the
   first paint (countdown, splash screen, theme toggle, cart badge).
4. `suppressHydrationWarning` on `<html>`/`<body>` absorbs attribute injection from
   `next-themes` and browser extensions (`fdprocessedid` from password managers).

### Security
`firestore.rules` enforces role-based access at the database, not in the UI:
- Users cannot self-assign `userType`, `status`, `commissionPercent`, `adminFee` or
  `wallet` — privilege escalation is blocked at the write.
- Tickets transition `valid → redeemed` only, only by the event's organiser, and only
  those two fields — a ticket can never be reset and reused.
- `wallet_ledger` is `create/update/delete: false` for every client. Credit is minted
  exclusively by trusted server code via the Admin SDK.
- Coupons require authentication to read, so discount codes cannot be enumerated.
- A final catch-all denies everything not explicitly matched.

Client-side route guards (`RequireRole`) are UX affordances only.

---

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server on port 9002 |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run genkit:dev` | Genkit developer UI for AI flows |

## Deploying

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

Then push to the branch connected to Firebase App Hosting. `apphosting.yaml` pins
the runtime and maps every secret; server-only secrets are `RUNTIME`-scoped so they
never enter the client bundle.

---

## Before launch

- [ ] Delete `src/app/dev-access` or gate it behind an allowlist
- [ ] Move ticket issuance into the Stripe webhook using the Firebase Admin SDK
- [ ] Move ACU ledger writes and admin grants into Cloud Functions
- [ ] Replace `picsum.photos` placeholders with real imagery and Firebase Storage uploads
- [ ] Run the Firebase rules simulator against each role
- [ ] Configure the Stripe webhook endpoint and rotate all sandbox keys

## Documentation

Architecture and product specifications live in [`docs/`](./docs).
