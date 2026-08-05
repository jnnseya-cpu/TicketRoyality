# 18 — Glossary & Reference

Terms used across this document set, defined once so they are used consistently.

## Commercial

| Term | Definition |
| --- | --- |
| **ACU** | AI Credits Unit — the internal billing currency for LLM and agent compute. 1 ACU = $0.01, charged at provider cost × 4 (`10` §10.6, `src/shared/constants/billing.ts`) |
| **GTV** | Gross Ticket Value — total face value of all tickets sold. The volume figure |
| **GMV** | Gross Merchandise Value — GTV plus fees, add-ons and hospitality. The commercial figure |
| **Take rate** | Platform revenue ÷ GMV. Blended across commission, subscription, placement and gateway spread |
| **MRR** | Monthly Recurring Revenue — subscription income only, excluding transactional |
| **Commission terms** | An organiser's percentage plus per-ticket admin fee. Platform default 5% + £0.50, overridable per organiser by an admin (`shared/pricing.ts`) |
| **Settlement** | Splitting gross sales into platform cut and organiser payout. One implementation: `settle()` |
| **Lead price** | The cheapest live tier on an event — the "from £X" label |

## Payments

| Term | Definition |
| --- | --- |
| **BitriPay** | The platform's African payment gateway — M-Pesa, Airtel Money, Orange Money, Africell. Collects and settles |
| **KODA** | The payment **verification** layer (`06` §6.20). Read-only; confirms that a direct-to-number mobile-money payment landed. Does not collect, settle or move funds |
| **Direct-to-number** | A mobile-money payment made straight to a merchant's own number, bypassing any aggregator. Invisible to gateways by construction — the gap KODA fills |
| **Offline payment** | This platform's term for a direct-to-number payment awaiting verification. `status: 'pending'` until approved (`17` §17.6 F3) |
| **PSP** | Payment Service Provider — Stripe, Adyen, Checkout.com |
| **STK push** | SIM Toolkit push — the operator-initiated prompt on a handset that authorises a mobile-money payment. A gateway function; not something KODA performs |
| **Settlement spread** | The margin between what a merchant is charged and what the underlying rail costs. Revenue line 4 (`10` §10.5) |

## Identity & security

| Term | Definition |
| --- | --- |
| **KYC** | Know Your Customer — identity verification for an individual |
| **KYB** | Know Your Business — identity verification for a company, required for organisers taking payouts and all BitriPay merchants |
| **AML** | Anti-Money Laundering — transaction monitoring, sanctions and PEP screening |
| **PEP** | Politically Exposed Person — a category requiring enhanced diligence |
| **RBAC** | Role-Based Access Control — here, enforced in `firestore.rules` rather than application code (`15`–`17`) |
| **Zero trust** | No actor is trusted by network position. Every request is authorised on its own merits |
| **HMAC-SHA256** | Keyed hash used to sign QR ticket payloads, so a ticket cannot be forged without the key |
| **Hash chaining** | Each audit entry includes the hash of its predecessor, so deleting or altering one breaks the chain visibly (`12` §12.10) |
| **PCI-DSS** | Payment card security standard. We minimise scope by never touching card data — it goes browser-to-PSP |

## Platform

| Term | Definition |
| --- | --- |
| **AI-OS** | The agent control plane over the transactional core. Additive, never a rewrite |
| **Command Centre** | A role's AI surface. Thirteen actors, ten Command Centres (`02`) |
| **Autonomy level** | `L0` suggest → `L1` act-with-approval → `L2` act-and-notify → `L3` act-silently |
| **Escalation** | An agent handing a decision to a human, with the cost of inaction attached |
| **Tier** | A named price band within an event — quantity, price, sold count |
| **Reference** | The unique string on a ticket, encoded in its QR |
| **Redeem** | Move a ticket `valid → redeemed`. One direction only, by the owning organiser |
| **Scoped door access** | A per-event link granting scan-and-admit and nothing else |
| **Severance test** | "If this vendor terminated us tomorrow, what stops working, for how long?" (`01` §1.5.1) |

## Infrastructure

| Term | Definition |
| --- | --- |
| **GKE** | Google Kubernetes Engine — hosts the agent plane only, never the transactional core (`06` §6.19) |
| **Blue/green** | Two production environments; traffic shifts between them so rollback is a routing change |
| **Circuit breaker** | A connector guard that stops calling a failing vendor rather than queueing behind it |
| **Fail-open / fail-closed** | Whether a connector outage permits the operation to proceed. Recommendations fail open; payments and identity fail closed |
| **p95 / p99** | Latency at the 95th / 99th percentile. Infrastructure is sized against p99, never the mean |
| **Derived state** | Data rebuildable from the source of truth — search indexes, vector embeddings, aggregates. Never authoritative |

## Layers

| Term | Definition |
| --- | --- |
| **`shared`** | Isomorphic: types, constants, pure logic, data access. Depends on nothing |
| **`frontend`** | Browser only. Never imports `backend` |
| **`backend`** | Server only. Every module carries `import 'server-only'` |
| **`app`** | Routing shell. Pages compose frontend; route handlers delegate to backend |
| **Admin SDK** | Firebase server SDK. Bypasses security rules, so it is the only way to perform the three privileged operations in `14` §14.5 |
