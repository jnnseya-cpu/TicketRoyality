# TicketRoyality AI-OS — Developer Documentation

This document set specifies the evolution of TicketRoyality from a ticketing platform
into an **AI Infrastructure Operating System** for live events: an autonomous,
multi-agent, self-managing platform where every user operates through an AI Command
Centre and the platform continuously learns, predicts, optimises, secures and heals
itself.

It is written to be **built from directly**. Every section carries concrete schemas,
endpoint contracts, agent I/O definitions, permission boundaries, escalation rules and
acceptance criteria. Where a decision is deferred it is marked `OPEN` with the owner
and the date it must be resolved.

## Scope discipline

Nothing in the existing platform is removed. Every module, user journey, revenue
stream and technical requirement already shipped in this repository is preserved and
extended. The AI-OS is an **additive control plane** over a working transactional
core, not a rewrite.

The transactional core that exists today (see the repository root `README.md`):
event catalogue, tiered ticketing, seat maps, single-use QR tickets, scoped door
check-in, Stripe / Bitripay / mobile-money payments, three role dashboards, ACU credit
billing, Firestore security rules.

## Reading order

| # | Document | What it answers |
| --- | --- | --- |
| 01 | [Vision & market](./01-vision-and-market.md) | What the AI-OS is, the gap it closes, why it wins |
| 02 | [User ecosystem & command centres](./02-user-ecosystem-and-command-centres.md) | Every actor, and the AI Command Centre each one gets |
| 03 | [Agent architecture](./03-agent-architecture.md) | Every agent: contract, permissions, triggers, escalation |
| 04 | [Platform modules](./04-platform-modules.md) | 27 modules, specified one by one |
| 05 | [BitriPay gateway](./05-bitripay-gateway.md) | The BitriPay integration door for merchants and partners |
| 06 | [Connector ecosystem](./06-connector-ecosystem.md) | Every third-party API category, provider and data contract |
| 07 | [System architecture](./07-system-architecture.md) | Runtime, data plane, AI plane, events, observability, DR |
| 08 | [Database schema](./08-database-schema.md) | PostgreSQL target: 20 tables, constraints, RLS policies, access matrix |
| 09 | [API specification](./09-api-specification.md) | REST endpoints, webhooks, auth, rate limits, error codes |
| 10 | [Monetisation](./10-monetisation.md) | Every revenue line, pricing engine, unit economics |
| 11 | [Security, compliance & risk](./11-security-compliance-risk.md) | Zero trust, fraud, KYC/AML, GDPR, PCI scope |
| 12 | [Admin super control centre](./12-admin-control-centre.md) | Total platform visibility and control |
| 13 | [Roadmap & production readiness](./13-roadmap-and-production-readiness.md) | Phased build, milestones, go-live gates |

### The shipped platform: layers and roles

Documents 01–13 specify where the platform is going. Documents 14–17 describe what is
in this repository today, and are written directly against the code — every permission
claim quotes the rule that enforces it.

| # | Document | What it answers |
| --- | --- | --- |
| 14 | [Layer architecture](./14-layer-architecture.md) | `frontend` / `backend` / `shared`: the boundaries, and how they are enforced |
| 15 | [Customer role](./15-customer-role.md) | Account, features, functions, structure, flows, workflows |
| 16 | [Event organiser role](./16-organiser-role.md) | The same nine-part treatment, plus the approval gate and the door |
| 17 | [Platform admin role](./17-admin-role.md) | Privileged operations, what even an admin cannot do, open items |
| 18 | [Glossary & reference](./18-glossary.md) | Every term, defined once |
| 19 | [Firestore → PostgreSQL](./19-firestore-to-postgres.md) | The datastore cutover: phases, gates, rollback, what it closes |
| 20 | [KODA gateway API door](./20-koda-gateway.md) | The verification layer: API, webhooks, matching, consent, acceptance |

Read 14 before 15–17: the role documents refer to the layer boundaries constantly, and
the reason a given operation lives in `backend` rather than `frontend` is usually the
reason it is safe.

## The blueprint, by the numbers

Summaries of this document set circulate with section counts attached. The figures
below are the ones the documents actually support — counted from the files in this
directory, not from an outline. If a summary you are holding disagrees with this table,
this table is correct.

| Quantity | Actual | Where |
| --- | --- | --- |
| Documents | 20 | this directory |
| Total lines | 10,377 | `wc -l docs/*.md` |
| Actor types | **13** | `02` §2.1 |
| AI Command Centres | **10** | `02` §2.3–2.12 |
| AI agents | **28** | `03` §3.12 registry |
| — of which self-managing | **6** | `03` §3.7 |
| Platform modules | **27** | `04` M1–M26 + M3a |
| Connector categories | **21** | `06` §6.21 |
| Database tables (target) | **38** | `08` §8.4–8.15 |
| Revenue lines | **9** | `10` §10.2–10.10 |
| Subscription tiers | **5** | `10` §10.3 — Free · Starter · Professional · Business · Enterprise |
| Admin console modules | **9** | `12` §12.2–12.10 |
| Roadmap phases | **5** | `13` — Phase 1 MVP (complete) → Phase 5 Global Scale |

Competitors analysed in `01` §1.3: Eventbrite, Ticketmaster / Live Nation, DICE,
Hopin / Zoom Events, Seat Unique, Fever, and Stripe / Adyen as the payments layer
beneath all of them.

The market review exists to locate the gap, not to set the build order. §1.5.1 states
the independence constraint that follows from it: **no competitor and no single vendor
may sit on a path the platform cannot operate without**, with a two-provider minimum
per connector category and a severance test applied to each.

### Mapping from the 17-section outline

An earlier outline numbered the material differently, splitting two documents in half
and promoting two subsections to top level. It resolves to these files:

| Outline § | Here |
| --- | --- |
| 01 Executive vision · 02 Market gap | `01-vision-and-market.md` |
| 03 User ecosystem · 04 Command centres | `02-user-ecosystem-and-command-centres.md` |
| 05 Core agent specs | `03-agent-architecture.md` |
| 06 Platform modules | `04-platform-modules.md` |
| 07 BitriPay door | `05-bitripay-gateway.md` |
| 08 Third-party connectors | `06-connector-ecosystem.md` |
| 09 Technical architecture | `07-system-architecture.md` |
| 10 Database schema | `08-database-schema.md` |
| 11 API specification | `09-api-specification.md` |
| 12 Monetisation model | `10-monetisation.md` |
| 13 Security & compliance | `11-security-compliance-risk.md` |
| 14 Admin super control centre | `12-admin-control-centre.md` |
| 15 Build roadmap | `13-roadmap-and-production-readiness.md` |
| 16 Competitive advantage | `01` §1.5 — moats are argued where the market gap is established |
| 17 Self-managing platform | `03` §3.7 — the maintenance agents live with every other agent contract |
| 18 Glossary & reference | `18-glossary.md` |
| — (not in the outline) | `19-firestore-to-postgres.md` · `20-koda-gateway.md` |

The outline has no counterpart for `14`–`17`. Those describe the code that exists now
rather than the system being specified, which is why they are numbered after it.

### Datastore decision — resolved

The blueprint specified PostgreSQL; the repository runs Firestore. **Resolved in favour
of PostgreSQL 16 with Row-Level Security**, recorded in `08` §8.1 and sequenced in `19`.

The decision was not a preference. Three defects in the shipped system are structural
to a document store rather than implementation mistakes: the ACU ledger and the balance
cannot be written atomically (debt D2), inventory oversell is an unfixable read-then-decide
race, and money is stored as floating point. Each becomes a database constraint in the
target model.

**The security model is preserved, not redesigned.** Every `firestore.rules` predicate
that `15`–`17` quote has an RLS equivalent in `08` §8.16 — including
`allow create, update, delete: if false` on the ledger, which becomes the absence of any
write policy and therefore applies to admins too.

| Doc | Status |
| --- | --- |
| `08` | The PostgreSQL target — 20 tables, RLS policies, constraints |
| `19` | The 17-week cutover: backfill → dual write → per-table read cutover → retire |
| `14`–`17` | **Still describe the running system**, which is Firestore, until `19` Phase 3 completes |

That divergence between `08` and `14`–`17` is deliberate and dated. A schema document
that disagrees with the database is only dangerous when nobody has said which is which.

## Conventions used throughout

- **Agent contracts** are specified as `purpose / inputs / outputs / permissions /
  triggers / workflow / escalation / APIs / business value`. Nothing ships without all
  nine.
- **Permissions** are expressed as scopes (`events:write`, `payouts:approve`). An
  agent may only hold scopes strictly narrower than the human principal it acts for.
- **Autonomy levels** are `L0` suggest → `L1` act-with-approval → `L2` act-and-notify
  → `L3` act-silently. No agent is granted `L3` on a money-moving or
  identity-changing action, ever.
- **`OPEN`** marks a decision that must be closed before the relevant phase ships.
