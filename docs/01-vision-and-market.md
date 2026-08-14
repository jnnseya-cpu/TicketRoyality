# 01 — Executive Vision & Market Gap Analysis

## Platform identity

**TicketRoyality is not a ticketing app.** It is an Event Infrastructure Operating
System: a full-stack AI-native platform that unifies every layer of the live-event
economy — from first ticket sale to final gate scan — into one autonomous,
self-improving system.

> **Mission.** To become the world's most trusted, intelligent and profitable event
> operating system, by giving every organiser, promoter, venue and fan a premium
> digital experience powered by AI-native automation, fraud-proof access control and
> real-time revenue intelligence.

### Who it is built for

| Segment | What they need that generic ticketing does not give them |
| --- | --- |
| **Stadiums & arenas** | Seat-level inventory, multi-gate entry, tiered hospitality |
| **Festivals** | Multi-day, multi-stage, wristband and capacity zoning |
| **Concert promoters** | Allocation to sub-promoters, settlement across parties |
| **Sports clubs** | Season inventory, member priority, recurring fixtures |
| **Conference organisers** | Sessions, speakers, hybrid and livestream attendance |
| **Nightclubs** | Fast door throughput, guest lists, table service |
| **Theatres** | Reserved seating, subscription series, accessibility holds |
| **VIP hospitality operators** | Packages, concierge workflow, named-guest management |

Nine segments, one inventory model. The alternative — a separate product per segment —
is what forces an organiser running a £250 hospitality package to use the same tool as
a £6 book club (`01` §1.3, Eventbrite).

### Where it operates

| Market | Primary rail | Regulatory posture |
| --- | --- | --- |
| **United Kingdom** | Stripe · Adyen | FCA-adjacent; PCI scope minimised |
| **European Union** | Stripe · Adyen · Open Banking | GDPR native, SCA compliant |
| **DRC** | BitriPay, direct mobile money, KODA verification | Local operator relationships |
| **Pan-African** | BitriPay | Per-market KYC and settlement |

**Both halves are first-class.** The UK/EU premium market and the DRC/pan-African
emerging market are not a home market and an expansion market — they are two
requirements the architecture was built to satisfy simultaneously. That is why mobile
money is a rail rather than a plugin, and why `06` §6.20 exists.

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

### Problem → mechanism

The four failures above are the commercial framing. Below is the operational one —
every problem an organiser actually reports, and the specific mechanism that closes it.

| Problem | Mechanism | Specified in |
| --- | --- | --- |
| Fake and duplicate tickets leaking revenue | One-time HMAC-signed QR, identity linking, NFC wallet passes, AI fraud scoring | `08` §8.10 · `03` §3.6 |
| Gate chaos and slow entry | Real-time multi-gate scanning, offline-tolerant sync, congestion prediction | `04` M16 · `08` §8.12 |
| Fragmented revenue streams | One revenue engine: tickets, VIP, hospitality, merchandise, F&B vouchers, parking, sponsorship | `10` §10.10 |
| No premium fan experience | Royal-grade digital tickets, seamless checkout, branded wallets, VIP concierge | `04` M3 · M4 · `02` §2.1 |
| Zero insight into attendee behaviour | Fan Intelligence: behavioural analytics, predictive models, post-event reporting | `04` M9 · `03` §3.8 |
| Manual organiser operations | Command Centre automating pricing, marketing, compliance and support | `02` §2.4 · `03` |
| No African market capability | BitriPay — M-Pesa, Airtel, Orange, Africell, CDF — plus KODA verification | `05` · `06` §6.20 |

Every row names where it is specified. A problem statement with no implementing section
is a marketing claim; this table is a build index.

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

### Seat Unique
**Does well:** the sharpest premium-hospitality proposition in the UK — official
partnerships with rights holders, curated packages that bundle a seat with dining and
access rather than selling a seat with an upsell bolted on, and a checkout that treats
a £400 purchase as a considered decision rather than a queue to survive.
**Fails:** hospitality-only by construction. There is no general admission model, no
long-tail self-serve, and inventory arrives through negotiated rights-holder deals
rather than a platform any organiser can publish onto. The result is a beautiful
product with a hard ceiling on how many events can exist inside it.
**Gap we take:** hospitality treated as a **first-class inventory type in a general
platform**, not a separate business. A VIP package, a general-admission ticket and a
livestream pass are the same object with different tiers, so an organiser sells all
three from one event without running two products or two reconciliations.

### Fever
**Does well:** demand generation at genuine scale. Fever originates experiences rather
than listing them, and its discovery engine converts intent into attendance better than
anything else in the category. The Original brand is real supply, not aggregation.
**Fails:** it is a media and production company wearing a marketplace's clothes. The
economics are built on owning the experience, which makes third-party organisers
suppliers rather than customers. There is no meaningful organiser back office, no
public API, and no route for an organiser to build their own audience — the audience
belongs to Fever by design.
**Gap we take:** Fever's discovery quality **with the organiser owning the
relationship**. Our fan data belongs to the organiser who earned it; our discovery
surface is a distribution channel they use, not a wall between them and their audience.

### Stripe / Adyen (the payments layer they all sit on)
**Does well:** payment rails, developer experience, global card coverage.
**Fails:** card-centric. In DRC, Nigeria, Kenya and much of the addressable emerging
market, mobile money is the dominant instrument and card penetration is a rounding
error.
**Gap we take:** mobile money as a first-class rail with a verification workflow, plus
BitriPay wallet settlement — already live in this codebase.

### Consolidated gap table

| Capability | Eventbrite | Ticketmaster | DICE | Hopin | Seat Unique | Fever | **AI-OS** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Self-serve publishing | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Seat-level assignment | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| VIP / hospitality inventory | ❌ | ✅ | ❌ | ❌ | ✅ | ⚠️ | ✅ |
| Hospitality **inside** a general platform | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Scoped door-staff access | ❌ | ⚠️ | ⚠️ | n/a | ⚠️ | ⚠️ | ✅ |
| Physical + online + stream, one model | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ✅ |
| Mobile money | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Organiser owns the fan relationship | ⚠️ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Public API + partner ecosystem | ⚠️ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ✅ |
| Autonomous agents that **act** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Usage-metered AI with hard credit ceiling | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

**The defensible position:** nobody combines stadium-grade inventory control,
self-serve access, emerging-market payment rails and an acting agent layer. Each is
individually replicable; the combination is a two-to-three year build for an incumbent
because it requires them to break their existing fee model.

Read the table by column, not by row. Every competitor is strong somewhere and each of
their strengths is buildable. What none of them can do cheaply is hold all eleven rows
at once, because the rows conflict with the businesses they already run: Ticketmaster
cannot open self-serve without cannibalising promoter deals, Fever cannot hand the fan
relationship back without dismantling its own economics, and Seat Unique cannot go
long-tail without diluting the curation that justifies its margin.

**This is a gap analysis, not a roadmap.** Nothing in this document set is scheduled
because a competitor shipped it. The build order in `13` is driven by what the platform
needs to be complete and safe — see §1.5.1.

### The six gaps nobody occupies

Distilled from the analysis above. Each is a position that is currently empty, not a
feature somebody does worse than we would.

| # | Gap | Why it is still open |
| --- | --- | --- |
| 1 | A unified AI-native event OS spanning creation, ticketing, VIP hospitality, fraud control and fan analytics | Each incumbent owns one or two layers; combining them breaks the fee model that funds them |
| 2 | A credible pan-African event platform with mobile money as a first-class rail | Card-first architectures treat mobile money as an integration, not a primitive |
| 3 | A **self-service** VIP and hospitality builder for independent promoters | Hospitality is sold through negotiated rights deals; nobody has made it self-serve |
| 4 | A multi-agent AI workforce embedded in the platform rather than bolted on | Requires the permission model to exist first — `01` §1.4, precondition 3 |
| 5 | A dedicated payment API door for African event revenue | Gateways serve merchants generally; none is shaped around event settlement |
| 6 | Autonomous pricing optimisation and churn prevention as platform features | Both need the behavioural data flywheel before they work at all |

Gaps 1 and 4 are the same observation from two directions: the agent layer is only
safe because the permission model exists, and the permission model is only valuable
because it spans every layer. That is the argument for one OS rather than five
integrated products.

Gap 6 is the honest one — it cannot be built first. Pricing and churn agents are
worthless without volume, which is why `13` schedules them in Phase 3 rather than
treating them as launch features.

## 1.4 Why an agent layer, and why now

Three preconditions are now met that were not eighteen months ago:

1. **Structured output is reliable.** Constrained decoding against a schema means an
   agent's output can be a typed transaction, not prose to be parsed. Every flow in
   `src/server/ai/flows.ts` already uses this pattern.
2. **Unit cost is below the value of the decision.** A Gemini Flash call costs
   fractions of a cent. A decision that reallocates £180 of ad spend is worth orders
   of magnitude more. The `ACU` system in this repo already meters this at
   provider cost × 4.
3. **The permission model exists.** `firestore.rules` in this repository already
   enforces that a principal cannot escalate its own role, cannot reset a redeemed
   ticket, and cannot mint credit. Agents inherit that model — which is precisely why
   they can be given autonomy safely.

## 1.5 Competitive advantage, restated as moats

Six claims are made for this platform. Each is stated with the section that has to be
true for it to hold — a claim with no implementing section is marketing.

| Claim | Holds because | Where |
| --- | --- | --- |
| Eventbrite-grade self-service **and** Seat Unique-grade VIP in one OS | Hospitality is an inventory type, not a separate product | `08` §8.13 · `02` §2.1 |
| A built-in multi-agent AI workforce, no third-party bolt-ons | 19 agents with contracts, scopes and an autonomy ladder | `03` |
| Native to UK/EU premium **and** DRC/pan-African emerging markets | Both are first-class rails, not a market and an expansion | §Platform identity, above |
| BitriPay for Africa, Stripe/Adyen for the West, KODA beneath both | Three independent rails plus a verification layer | `06` §6.2 · §6.20 |
| Zero-trust security architecture | Authorisation at the database, deny by default, no network trust | `11` §11.1 · `08` §8.16 |
| Self-healing, self-optimising infrastructure | Six self-managing agents; rollback is the only L3 in the system | `03` §3.7 |

**Row 5 is the one to check hardest**, because "military-grade" and "zero trust" are the
two most abused phrases in security marketing. What it means here is specific and
falsifiable: every request is authorised on its own merits at the data layer, no
principal is trusted by network position, and the platform admin — the most privileged
human — still cannot write the ledger from a session (`17` §17.3). If those three stop
being true, the claim is void.



| Moat | Mechanism | Time to replicate |
| --- | --- | --- |
| **Behavioural data flywheel** | Every scan, purchase, refund and no-show trains forecasting. More events → better forecasts → better sell-through → more organisers | 18–36 months, and requires volume first |
| **Payment rail coverage** | Mobile-money verification workflow + BitriPay + Stripe. Each new rail compounds addressable market | 6–12 months per rail, per region |
| **Agent action library** | The value is not the model, it is the catalogue of safe, permissioned, audited actions an agent may take | 12–24 months of iteration and incident learning |
| **Switching cost** | Seat maps, historical attendance, payout history and agent memory are all organiser-specific | Grows monotonically with tenure |
| **Marketplace liquidity** | Two-sided: fans follow organisers, organisers follow fans | Classic network effect |

### Moat strength, assessed honestly

Five moats are claimed. They are not equally strong, and treating them as if they were
is how a strategy ends up resting on the weakest one.

| Moat | Real? | Time to replicate | Assessment |
| --- | --- | --- | --- |
| Organiser stickiness | **Strongest** | Grows with tenure | Seat maps, history, payout records, agent tuning |
| Liquidity | **Strong, but local** | Per city | See below |
| Data flywheel | Real, slow | 18–36 months, needs volume first | Cannot be built early |
| Payment rails | Real if exclusive | 6–12 months per rail | See below |
| "Proprietary ACU + LangGraph" | **Weak** | Weeks | See below |

#### Liquidity is a city-level moat, not a global one

Event marketplaces do not have global network effects. A fan in Manchester does not
care how many events are listed in Kinshasa, and an organiser in Kinshasa gains nothing
from London's audience.

**The unit of liquidity is the city**, sometimes the city-and-category. That changes the
strategy entirely: winning means going deep in a small number of markets until each is
self-sustaining, not thin across many. A platform with 4,000 organisers spread over
forty cities has forty weak markets; the same 4,000 across six cities has six defensible
ones.

Most marketplace failures come from assuming the network effect is global when it is
local, and spending the growth budget accordingly.

#### The technology moat as stated is not a moat

*"Proprietary ACU billing + LangGraph orchestration, impossible to replicate quickly."*

| Claim | Reality |
| --- | --- |
| ACU billing is proprietary | It is a ledger table and a multiplier. A competent team builds it in a fortnight |
| LangGraph orchestration | LangGraph is an open-source library. Using it is not a moat — anyone can `pip install` it |
| Impossible to replicate quickly | Both are replicable in under a quarter |

This claim will not survive a diligence conversation with anyone technical, and losing
credibility on the weakest item damages the four that are genuine.

**What the actual technology moat is:** the catalogue of safe, permissioned, audited
actions an agent may take, and the incident learning behind each boundary. That is 12–24
months of iteration that cannot be shortcut, because most of it is knowledge about what
went wrong. It is already stated correctly in the moat table above; the ACU-and-LangGraph
framing should be dropped.

#### The payment moat depends on a word nobody has confirmed

"BitriPay integration creates exclusive competitive advantage" holds **only if it is
exclusive.** If BitriPay will integrate with any ticketing platform that asks, this is a
head start measured in months, not a moat.

`OPEN`: is there an exclusivity arrangement, in which markets, and for how long? The
answer changes how much weight this bears.

**KODA is the stronger position** and is not on the original list. It occupies a
category with no competitor at all, and the flat-fee structure means a percentage-taking
rival cannot follow without cannibalising its own model (`20` §20.2). A moat built on a
competitor's P&L is more durable than one built on a partnership someone else can also
sign.

#### Stickiness must come from value, not from lock-in

*"...all locked to platform"* is the wrong framing, on two grounds.

Data portability is a **GDPR right**, not a product decision — an organiser can demand
their data in a machine-readable format and we must provide it. Building a strategy on
their inability to leave is building on something that is not true.

And it is bad business. An organiser who stays because leaving is painful churns the
moment a competitor offers migration assistance, and tells everyone why on the way out.
One who stays because the forecasting is better and the payouts arrive on time does not.

**Adopted position: full export, on demand, in a documented format.** Confidence that
they will stay anyway is a stronger signal to a prospect than a locked door — and it is
the only version consistent with the fee transparency in `10` §10.2 and the data
ownership claim in the dimension table above.

### 1.5.1 Independence — no competitor on the critical path

A platform that reacts to competitors is permanently second. Independence here is an
engineering constraint with a testable definition, not a slogan.

**The rule:** no competitor, and no single vendor, may sit on a path the platform
cannot operate without.

| Path | Must never depend on | Why it holds |
| --- | --- | --- |
| Ticket issuance | Any external ticketing platform | `functions/src/issuance.ts` mints from our own inventory model |
| Entry validation | Any external scanning service | QR reference + `firestore.rules` redeem; works with one venue tablet |
| The record of who owns what | Any external system | `tickets` and `wallet_ledger` are ours, append-only, exportable |
| Fan relationship | Any discovery aggregator | Organiser owns their attendee data; our surface is a channel, not a gate |
| Payment acceptance | Any single PSP | Three independent rails: card, BitriPay wallet, mobile money |
| Knowing a payment landed | Any collecting gateway | KODA verifies direct-to-number payments no aggregator can see (`06` §6.20) |
| Model inference | Any single AI provider | Provider-abstracted; see `06` §6.7 |

**Two-provider minimum.** Every connector category in `06` names at least two viable
providers behind one internal interface. A category with one provider is a dependency
wearing an integration's clothes, and is marked as such.

**The severance test.** For each dependency, one question: *if this vendor terminated
us tomorrow, what stops working, for how long?*

| Answer | Verdict |
| --- | --- |
| Nothing — a second provider takes the traffic | Acceptable |
| Degraded feature, core transactions unaffected | Acceptable, documented |
| Cannot sell, cannot admit, or cannot prove who owns what | **Unacceptable — architectural defect** |

Nothing in the third row exists today, and the two-provider minimum is what keeps it
that way. Payment rails already pass: with Stripe removed the platform still sells via
BitriPay and mobile money, at reduced coverage rather than zero.

**What independence does not mean.** It is not vertical integration for its own sake.
We do not build a CDN, a card network, an accounting package or a CRM — §1.7 is
explicit about that. Owning the *critical path* means owning inventory, entitlement,
entry and the ledger. Everything else is a supplier, and suppliers are replaceable
precisely because we designed them to be.

### The dimension table

| Dimension | Incumbents | TicketRoyality | Verified by |
| --- | --- | --- | --- |
| AI integration | None, or bolted on | Native multi-agent OS with ACU billing | `03` — 28 agents, contracts and autonomy ladder |
| African markets | Absent | BitriPay-native, CDF, mobile money first, French and Lingala | `05` · `06` §6.20 · `07` §7.2 |
| VIP + self-service | Two separate products | One platform, one inventory model | `08` §8.13 · `04` M21 |
| Fraud control | Basic code checking | HMAC per-event salt, device intelligence, screenshot heuristic, one-time invalidation | `11` §11.12 · `08` §8.10 |
| Revenue intelligence | Reports | Pricing and revenue agents acting, not charting | `03` §3.4 |
| Scalability | Monolithic or capped | Autoscaled agent plane, edge rendering, read replicas | `07` §7.12 |
| **Data ownership** | Platform retains | **The organiser owns their fan data** | `04` M9 · M19 |

**Row 7 is the one incumbents cannot copy.** Every other row is an engineering
programme somebody with capital could fund. Handing the fan relationship back is a
business-model change: Fever's economics depend on owning the audience, and
Ticketmaster's leverage over promoters depends on owning the buyer. They can match our
technology far more easily than they can give that up.

### One claim needs a load test before it is quoted

"Scales to 1M tickets/hour" is 278 tickets per second sustained. That is achievable on
the specified architecture and it is **not currently measured.**

It belongs in the same category as the benchmarks in `03` §3.10: plausible, useful as a
target, and not yet a finding. `13` §13.4 requires a load test at 3× projected peak
before commercial launch — until that runs, the figure is a design goal and should be
stated as one.

Quoting an untested throughput number to a stadium is the kind of claim that gets
checked during procurement, by people who will ask for the test report.

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
