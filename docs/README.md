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
| 04 | [Platform modules](./04-platform-modules.md) | Module-by-module product specification |
| 05 | [BitriPay gateway](./05-bitripay-gateway.md) | The BitriPay integration door for merchants and partners |
| 06 | [Connector ecosystem](./06-connector-ecosystem.md) | Every third-party API category, provider and data contract |
| 07 | [System architecture](./07-system-architecture.md) | Runtime, data plane, AI plane, events, observability, DR |
| 08 | [Database schema](./08-database-schema.md) | ERD, collections, fields, indexes, access matrix |
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

Read 14 before 15–17: the role documents refer to the layer boundaries constantly, and
the reason a given operation lives in `backend` rather than `frontend` is usually the
reason it is safe.

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
