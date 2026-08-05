# 01 — Executive Vision & Market Gap Analysis

## 1.1 What the AI-OS is

TicketRoyality AI-OS is an **operating system for live commerce**. The transactional
platform — catalogue, ticketing, entry control, payments, payouts — is the kernel. On
top of it runs a control plane of specialised AI agents that observe every event in
the system, decide, and act inside hard permission boundaries.

The distinction that matters commercially: **existing platforms are systems of record;
this is a system of action.** Eventbrite tells an organiser they sold 412 tickets.
The AI-OS tells them they will finish at 610 against a 900 capacity, that the shortfall
is concentrated in the 25–34 segment in one postcode cluster, that a £180 spend on a
lookalike campaign closes 60% of the gap, and — on approval — buys the placement,
writes the creative, and reports the delta.

### The three planes

```
┌─────────────────────────────────────────────────────────────┐
│  EXPERIENCE PLANE                                           │
│  AI Command Centres · dashboards · public site · portals    │
├─────────────────────────────────────────────────────────────┤
│  CONTROL PLANE (the AI-OS)                                  │
│  Agent runtime · orchestrator · memory · policy engine ·    │
│  governance · autonomy ladder · human-in-the-loop queue     │
├─────────────────────────────────────────────────────────────┤
│  KERNEL (transactional core — exists today)                 │
│  Events · tickets · entry · payments · payouts · identity   │
└─────────────────────────────────────────────────────────────┘
```

The kernel is authoritative. Agents never own state; they propose and execute
**transactions against the kernel**, and every one is written to an immutable audit
log with the agent id, the model version, the prompt hash, the inputs and the
principal it acted for. This is the single most important architectural constraint in
the document: **an agent is a client of the platform, with less authority than the
human it serves, never a privileged internal process.**

## 1.2 The problem, stated precisely

Live events fail commercially in four repeatable ways, and none of them is a
creative failure:

| Failure | Where the money goes | Current tooling |
| --- | --- | --- |
| **Under-sold inventory** | Empty seats have zero salvage value at 20:00 on the night | Dashboards that report, after the fact |
| **Leaked revenue** | Fake tickets, duplicated codes, unrecorded door sales, unbilled add-ons | Scanning apps that check a code, nothing more |
| **Operational drag** | Organiser time spent on spreadsheets, refund emails, reconciliation | Exports to Excel |
| **Payment exclusion** | Buyers who cannot pay by card simply do not buy | Card-first checkouts |

Each is an execution gap, not an information gap. Reporting more numbers does not
close any of them. Acting on the numbers does.

## 1.3 Market gap analysis

Assessed against the platforms that own the category today.

### Eventbrite
**Does well:** unrivalled discovery surface, frictionless self-serve publishing,
trusted consumer brand.
**Fails:** flat fee structure punishes high-value tickets; no real hospitality/VIP
inventory model; door control is a thin scanning app; no seat-level assignment;
no automation beyond templated email. An organiser running a £250 hospitality package
is using the same product as someone running a £6 book club.
**Gap we take:** premium and hospitality inventory, seat-level control, and an
agent layer that acts on sales data instead of charting it.

### Ticketmaster / Live Nation
**Does well:** stadium-scale reliability, primary+secondary market control, deep
promoter relationships, genuine seat mapping.
**Fails:** closed to the long tail — you cannot self-serve onto it; punitive fee
stacking that organisers cannot control or explain to fans; effectively zero API
surface for third parties to build on.
**Gap we take:** stadium-grade capability, self-serve access, transparent
organiser-controlled fees, and a public API.

### DICE
**Does well:** genuinely excellent mobile-first fan experience, aggressive and
effective anti-tout enforcement, curated discovery.
**Fails:** curation is the product, so it is deliberately not a platform; almost no
organiser-side tooling; no marketplace, no API, no partner ecosystem.
**Gap we take:** the fan experience quality without the curation bottleneck, plus a
full organiser back office.

### Hopin / Zoom Events (virtual)
**Does well:** streaming, virtual networking, sponsor booths.
**Fails:** virtual-only; falls apart for hybrid; no physical door control; commercial
model is seat-based SaaS, not transactional.
**Gap we take:** one inventory model covering physical, online and live-stream, with
identical ticketing, identical entry validation and identical revenue reporting.

### Stripe / Adyen (the payments layer they all sit on)
**Does well:** payment rails, developer experience, global card coverage.
**Fails:** card-centric. In DRC, Nigeria, Kenya and much of the addressable emerging
market, mobile money is the dominant instrument and card penetration is a rounding
error.
**Gap we take:** mobile money as a first-class rail with a verification workflow, plus
BitriPay wallet settlement — already live in this codebase.

### Consolidated gap table

| Capability | Eventbrite | Ticketmaster | DICE | Hopin | **AI-OS** |
| --- | --- | --- | --- | --- | --- |
| Self-serve publishing | ✅ | ❌ | ❌ | ✅ | ✅ |
| Seat-level assignment | ❌ | ✅ | ❌ | ❌ | ✅ |
| VIP / hospitality inventory | ❌ | ✅ | ❌ | ❌ | ✅ |
| Scoped door-staff access | ❌ | ⚠️ | ⚠️ | n/a | ✅ |
| Physical + online + stream, one model | ❌ | ❌ | ❌ | ⚠️ | ✅ |
| Mobile money | ❌ | ❌ | ❌ | ❌ | ✅ |
| Public API + partner ecosystem | ⚠️ | ❌ | ❌ | ⚠️ | ✅ |
| Autonomous agents that **act** | ❌ | ❌ | ❌ | ❌ | ✅ |
| Usage-metered AI with hard credit ceiling | ❌ | ❌ | ❌ | ❌ | ✅ |

**The defensible position:** nobody combines stadium-grade inventory control,
self-serve access, emerging-market payment rails and an acting agent layer. Each is
individually replicable; the combination is a two-to-three year build for an incumbent
because it requires them to break their existing fee model.

## 1.4 Why an agent layer, and why now

Three preconditions are now met that were not eighteen months ago:

1. **Structured output is reliable.** Constrained decoding against a schema means an
   agent's output can be a typed transaction, not prose to be parsed. Every flow in
   `src/server/ai/flows.ts` already uses this pattern.
2. **Unit cost is below the value of the decision.** A Gemini Flash call costs
   fractions of a cent. A decision that reallocates £180 of ad spend is worth orders
   of magnitude more. The `ACU` system in this repo already meters this at
   provider cost × 3.
3. **The permission model exists.** `firestore.rules` in this repository already
   enforces that a principal cannot escalate its own role, cannot reset a redeemed
   ticket, and cannot mint credit. Agents inherit that model — which is precisely why
   they can be given autonomy safely.

## 1.5 Competitive advantage, restated as moats

| Moat | Mechanism | Time to replicate |
| --- | --- | --- |
| **Behavioural data flywheel** | Every scan, purchase, refund and no-show trains forecasting. More events → better forecasts → better sell-through → more organisers | 18–36 months, and requires volume first |
| **Payment rail coverage** | Mobile-money verification workflow + BitriPay + Stripe. Each new rail compounds addressable market | 6–12 months per rail, per region |
| **Agent action library** | The value is not the model, it is the catalogue of safe, permissioned, audited actions an agent may take | 12–24 months of iteration and incident learning |
| **Switching cost** | Seat maps, historical attendance, payout history and agent memory are all organiser-specific | Grows monotonically with tenure |
| **Marketplace liquidity** | Two-sided: fans follow organisers, organisers follow fans | Classic network effect |

## 1.6 What success looks like

| Horizon | Commercial | Technical |
| --- | --- | --- |
| **12 months** | 500 active organisers, £4m GMV, 6% blended take rate | 99.9% uptime, p95 scan < 200ms, 3 payment rails live |
| **24 months** | 4,000 organisers, £45m GMV, 30% of organisers on a paid plan | Agent layer at L2 autonomy for marketing and support, < 2% escalation rate |
| **36 months** | £200m GMV, BitriPay processing for external merchants, white-label live | Multi-region, 99.99%, self-healing agents closing >60% of P3 incidents unaided |

## 1.7 Non-goals

Stated explicitly so the build does not drift:

- **Not a secondary marketplace.** Resale is a fraud surface and a brand risk. Transfer
  is supported; profit-taking resale is not.
- **Not a general-purpose CRM.** We integrate with Salesforce and HubSpot; we do not
  rebuild them.
- **Not a video platform.** We integrate ingest and delivery; we do not build a CDN.
- **Not an autonomous financial actor.** No agent moves money without a human
  approval. This is a permanent constraint, not a phase-one limitation.
