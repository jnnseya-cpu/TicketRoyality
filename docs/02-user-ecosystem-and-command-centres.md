# 02 — User Ecosystem & AI Command Centres

## 2.1 The complete actor model

Thirteen actor types. Each has a distinct authority boundary, a distinct data scope, and
a distinct Command Centre. The first four exist in the codebase today; the remaining
nine are additive.

| # | Actor | Status | Authority | Data scope |
| --- | --- | --- | --- | --- |
| 1 | **Attendee (fan)** | Live | Buy, transfer, refund-request, manage own profile | Own tickets, own wallet, public catalogue |
| 2 | **Organiser** | Live | Publish, price, refund, delegate check-in, buy promotion, withdraw | Own events, own attendees, own revenue |
| 3 | **Platform admin** | Live | Approve, suspend, set commission, verify offline payments, grant credit, resolve disputes | Everything operational, fully audited |
| 4 | **Gate staff / security** | Live (scoped link) | Scan and admit for **one** event; report incidents; check blocklist | Ticket validity only — no name lists, no finances |
| 5 | **Super admin (platform owner)** | New | Everything a platform admin can do, **plus** revenue controls, agent governance, compliance override, admin role grants | Unrestricted, every action hash-chained |
| 6 | **Venue manager** | New | Capacity, licensing constraints, blackout dates, gate configuration, security zones, house rules | Events at their venue only |
| 7 | **Promoter / partner** | New | Sell allocation, earn commission, run campaigns, manage sub-promoters | Their allocation and its performance only |
| 8 | **VIP hospitality host** | New | Build packages, run concierge workflow, manage guest lists, upsell | Hospitality inventory and its guests only |
| 9 | **Merchant (BitriPay)** | New | Accept payments via the gateway, manage keys, settle, refund | Own transactions and settlements |
| 10 | **Developer** | New | Provision API keys, call the public API, subscribe webhooks | Whatever their key's scopes permit |
| 11 | **Sponsor** | New | Buy visibility, manage sponsor passes, measure exposure | Impression and engagement metrics only |
| 12 | **Support agent (human)** | New | Act on behalf of a user, time-boxed and consented | Impersonation session, fully logged |
| 13 | **Regulator / auditor** | New | Read-only, immutable, exportable | Audit log, KYC/AML records, transaction trail |

The platform owner is **Groupe Nseya**, operating the super admin role. Naming it
matters: the compliance override and the agent kill switch belong to an identified
operator, not to an abstract "platform".

### Capability register

Authority says what an actor *may* do; this says what they are *given*. Every
capability names where it is specified, and the ones with no home yet are marked —
because an actor with capabilities nobody has specified is a role that will ship half
built.

| Actor | Capabilities | Specified in |
| --- | --- | --- |
| **Super admin** | Full system access, revenue controls, agent governance, compliance override | `12` · `03` §3.10 |
| **Platform admin** | User management, dispute resolution, analytics, agent monitoring | `12` §12.4–12.9 |
| **Organiser** | Event builder, ticket types, seat maps, marketing, payout dashboard | `04` M2 · M5 · M7 |
| **Venue manager** | Seat map builder, gate configuration, security zones, vendor management | `04` **M17** |
| **Promoter / partner** | Commission links, affiliate tracking, promo codes, sub-promoter management | `04` **M18** |
| **VIP hospitality host** | Package builder, concierge tools, hospitality CRM, upsell automation | `04` **M21** · `08` §8.13 |
| **Sponsor / corporate** | Sponsor pass management, logo placement, attendee data reports | `04` **M19** |
| **Fan / attendee** | Discovery, checkout, digital wallet, QR ticket, loyalty programme | `15` · `04` **M20** |
| **Gate staff / security** | Mobile scanner, gate assignment, blocklist check, incident reporting | `04` M16 |
| **Developer / API partner** | API key management, sandbox, webhook configuration, SDK access | `04` M13 · `09` §9.9–9.10 |
| **BitriPay merchant** | QR payments, settlement, refunds, transaction monitoring, revenue split | `05` §5.5–5.9 |
| **Regulator / compliance** | Read-only audit trail, KYC/KYB reports, AML logs, GDPR data export | `11` §11.8 · `12` §12.10 |
| **Support agent** | Consented, time-boxed impersonation; full session logging | `02` §2.11 |

**Five modules were created by this table** — M17 through M21. They existed as
capabilities attached to actors and as nothing else, which is the most common way a
platform ships a role that cannot actually do its job.

Support agent is the thirteenth actor and appears in no outline of this ecosystem. It
is here because impersonation is the single most dangerous capability on the platform
and needs a specified boundary rather than an admin quietly using someone's account.

### Why super admin and platform admin are two actors, not one

Doc `17` §17.8 records this as debt **D5**: today `superuser` is a single self-propagating
role with no second signature. Splitting it is the fix.

| | Platform admin | Super admin |
| --- | --- | --- |
| Approve / suspend organisers | ✅ | ✅ |
| Resolve disputes, verify offline payments | ✅ | ✅ |
| Set commission terms | ✅ | ✅ |
| **Grant the admin role** | ❌ | ✅, two-person |
| **Change platform-wide pricing** | ❌ | ✅ |
| **Agent governance and kill switch** | ❌ | ✅ |
| **Compliance override** | ❌ | ✅, always escalated to audit |

The operations team needs the first block daily and the second block never. Granting
both to everyone who needs the first is how a support login becomes a platform-wide
incident.

### VIP hospitality host

The actor that makes hospitality a first-class inventory type rather than a separate
product (`01` §1.3, Seat Unique). A host is not an organiser: they sell against
allocation someone else created, they hold guest lists containing named individuals at
high value, and their concierge workflow touches personal data an ordinary organiser
never sees. Distinct authority, distinct data scope, therefore a distinct actor.

### Authority inheritance rule

```
platform_admin ⊃ { organiser ∪ merchant ∪ venue ∪ promoter }
organiser      ⊃ { door_operator(event_id) }
support_agent  ⊆ impersonated_principal   (never a superset, always time-boxed)
agent(X)       ⊂ X                        (strictly narrower, always)
```

The last line is the invariant the whole system rests on. An agent acting for an
organiser can never hold a scope that organiser does not hold, and always holds fewer.

## 2.2 The AI Command Centre

Every actor gets a Command Centre — a persistent surface with the same five-part
anatomy, populated differently per role.

```
┌──────────────────────────────────────────────────────────────┐
│ 1. SITUATION      What is true right now. Live, not cached.  │
│ 2. ATTENTION      Ranked list of what needs a decision.      │
│ 3. FORECAST       What happens if nothing changes.           │
│ 4. ACTIONS        What the agents propose, with £ impact.    │
│ 5. TRANSCRIPT     Everything agents did, and why. Reversible.│
└──────────────────────────────────────────────────────────────┘
```

### Design rules, non-negotiable

1. **Attention is ranked by cost of inaction, in currency.** Not by recency, not by
   severity label. "£2,400 at risk" outranks "3 new comments".
2. **Every proposed action shows its money.** An action with no quantified impact does
   not appear in the Actions panel; it goes in the transcript.
3. **Every executed action is reversible or explicitly flagged irreversible.** The
   transcript exposes a one-click undo where physics allows it.
4. **The Command Centre never blocks the classic UI.** Users who ignore it entirely
   keep the platform they already have. Adoption is earned, not forced.

### Cluster composition

Every Command Centre is fronted by a **Personal AI Chief of Staff** (`chief_of_staff.v1`)
and backed by a cluster drawn from the agent registry in `03`.

**A Command Centre is a view over the registry, not a private set of agents.** The same
`pricing.v1` serves the organiser and reports to the super admin's revenue view; it is
one agent with one contract, one budget and one autonomy level, surfaced twice. Cloning
it per audience would produce two agents that drift apart and disagree in front of the
two people least able to reconcile them.

| Command Centre | Surfaced as | Registry agent |
| --- | --- | --- |
| **Super admin** | AI Platform Governor | `chief_of_staff.v1` |
| | Revenue Intelligence | `cfo.v1` |
| | AI Threat Command | `security.v1` + `fraud.v3` |
| | AI Governance | `governance.v1` |
| | Regulatory Compliance | `compliance.v1` |
| **Organiser** | AI Event Strategist | `analyst.v2` |
| | AI Marketing | `growth.v4` |
| | AI Pricing | `pricing.v1` |
| | AI Revenue | `cro.v1` |
| | AI Support | `support.v2` |
| | AI Gate Intelligence | **`gate_intelligence.v1`** — new |
| **Venue manager** | AI Capacity Optimiser | **`capacity.v1`** — new |
| | AI Security Command | `security.v1` |
| | AI Operations | `operations.v1` |
| **Fan / attendee** | AI Concierge | **`concierge.v1`** — new |
| | AI Wallet | *not an agent* — see below |
| | AI Notification | *not an agent* — see below |
| **Platform admin** | AI Dispute Resolution | **`dispute.v1`** — new |
| | AI User Intelligence | `fraud.v3` + `compliance.v1` |
| | AI System Health | `reliability.v1` → `auto_repair.v1` |

### Two things on that list are not agents, and saying so matters

**AI Wallet** manages digital tickets, transfers and resale eligibility. **AI
Notification** sends countdown reminders, travel alerts and review requests. Both are
deterministic platform services with no model in the loop.

Calling them agents would inflate the registry with things that have no prompt, no
autonomy level, no ACU budget and no escalation path — and an agent registry that
includes a cron job is a registry nobody can reason about. They appear in the fan's
Command Centre because that is where the fan expects to find them; they are specified
in `04` M3 and M10.

The honest count is **25 agents** (`03`), surfaced across **10 Command Centres**.

## 2.3 Attendee Command Centre

**Agents:** Personal Concierge · Discovery · Wallet.

| Panel | Content |
| --- | --- |
| Situation | Next event and countdown, ticket status, travel time from home postcode, wallet balance |
| Attention | "Doors in 90 minutes and your ticket is not downloaded" · "Event moved venue" · "Your card expires before the event" |
| Forecast | "Tickets for the event you viewed 4 times are 82% sold; at current pace it sells out Thursday" |
| Actions | Add to calendar · download all tickets for offline use · set a price-drop watch · transfer a spare ticket |
| Transcript | Every recommendation and why it was made, with a "less like this" control |

**Data scope:** own profile, own tickets, own wallet, public catalogue.
**Never sees:** other attendees, organiser financials, platform metrics.
**Max autonomy: L2** (act-and-notify) — and only for reversible actions such as
calendar sync or watch-list changes. Purchases are always L1.

## 2.4 Organiser Command Centre

The commercial heart of the product. **Agents:** Chief of Staff · Analyst · Growth ·
Operations · Support · Pricing · Research.

| Panel | Content |
| --- | --- |
| Situation | Live sell-through per tier, revenue net of commission, scan rate during doors, refund rate, payout balance |
| Attention | "Cardiff is 34% sold with 9 days left — £4,100 below break-even" · "VIP sold out 6 days early, you left money on the table" · "3 refund requests older than 48h" |
| Forecast | Final sell-through with an 80% confidence band, projected net revenue, no-show rate, door queue length by 15-minute bucket |
| Actions | Launch a lookalike campaign (£ spend → £ projected return) · release 40 held seats · reprice tier 2 by −12% · buy a homepage placement · extend early bird by 48h |
| Transcript | Every campaign written, every price changed, every refund auto-approved, each reversible |

**Data scope:** own events, own attendees, own revenue, anonymised market benchmarks.
**Never sees:** another organiser's attendee list, pricing or conversion rates.
Benchmarks are k-anonymised with **k ≥ 5** and suppressed below that threshold.
**Max autonomy: L2** for marketing copy, tier release and support replies.
**L1 mandatory** for: price changes, refunds, payouts, and anything that emails the
full attendee list.

### Worked example — the flow that has to work on day one

```
07:02  Analyst          Cardiff Half Marathon: 312/900 sold, 9 days out.
                        Pace 4.1/day. Projected final 349 (80% CI 320–381).
                        Break-even 465. Shortfall −116 tickets, −£4,060.
07:02  Growth           Cause: paid traffic stopped 6 days ago (budget exhausted).
                        Historical: your 3 previous races converted 3.2% from
                        lookalike-of-past-attendees at £2.40 CPC.
07:02  Growth           Proposal: £280 lookalike, 6-day flight, cap CPA £8.
                        Projected +112 tickets, +£3,920 gross, +£3,510 net.
                        Confidence: medium-high (n=3 comparable events).
07:02  Chief of Staff   Ranked #1 in Attention. £4,060 at risk.
09:14  Human            Approves.
09:14  Growth  [L1→act] Creative written, 3 variants. Campaign live at 09:16.
09:14  Audit            agent=growth.v4 · model=gemini-2.5-flash · principal=org_a1b2
                        · action=campaign.create · spend_cap=28000 (minor units)
                        · approved_by=user_c3d4 · reversible=true
Day+6  Analyst          Delivered +97 (87% of projection). CPA £2.89.
                        Final 421. Still −44 vs break-even. Next proposal queued.
```

Note what makes this credible: a stated confidence band, a stated sample size, a
delivered-versus-projected reconciliation, and a follow-up. An agent that never
reports a miss is not trusted twice.

## 2.5 Platform Admin Command Centre

**Agents:** Governance · Security · Fraud · Compliance · Reliability · Revenue.

| Panel | Content |
| --- | --- |
| Situation | GMV today, take rate, active events, scans/minute, error budget burn, agent spend, open incidents |
| Attention | "Organiser #4471: refund rate 34% vs 3% platform median" · "Mobile-money queue 41 items, oldest 19h — SLA is 12h" · "Auth error rate 4.2σ above baseline" |
| Forecast | 30-day GMV, chargeback exposure, infrastructure cost, credit liability on unspent ACU |
| Actions | Freeze an organiser's payouts · force step-up auth on a segment · roll back a release · adjust global commission · grant goodwill credit |
| Transcript | Every admin and agent action, immutable, exportable for audit |

**Data scope:** everything. **Every read of PII is logged**, not just writes — the
audit trail answers "who looked at this customer's record" as well as "who changed
it".
**Max autonomy: L2** for reversible platform actions (scaling, cache, feature flags).
**L1 mandatory** for anything touching a user's money, identity or account status.

## 2.6 Venue Manager Command Centre

| Panel | Content |
| --- | --- |
| Situation | Events booked, capacity utilisation, licensing headroom, staffing requirement |
| Attention | "Saturday's event exceeds your 22:30 curfew by 40 minutes" · "Double-booked 14 March" |
| Forecast | Occupancy by hour, projected bar revenue, staffing need by 30-minute bucket |
| Actions | Block a date · adjust stated capacity · publish house rules to all events at this venue |

**Data scope:** events at their venue. Sees aggregate attendance, **never** attendee
identities — a venue has no lawful basis for the guest list of a promoter's event.

## 2.7 Promoter / Partner Command Centre

| Panel | Content |
| --- | --- |
| Situation | Allocation sold vs held, commission earned, tracking-link performance |
| Attention | "Allocation 90% sold — request more?" · "Your link converts at 1.1% vs your 3.4% average" |
| Forecast | Projected commission, allocation sell-out date |
| Actions | Request more allocation · generate a tracking link · launch a campaign against their allocation |

**Data scope:** their allocation only. Cannot see the event's total sales, the
organiser's margin, or other promoters' performance.

## 2.8 Merchant Command Centre (BitriPay)

| Panel | Content |
| --- | --- |
| Situation | Volume today, success rate, settlement balance, next settlement time |
| Attention | "Success rate dropped to 91.2% from 97.8% — issuer decline spike on one BIN range" · "Webhook endpoint failing, 340 undelivered" |
| Forecast | Settlement amount and date, chargeback exposure |
| Actions | Retry failed webhooks · rotate keys · request early settlement · open a dispute |

Full specification in [05 — BitriPay gateway](./05-bitripay-gateway.md).

## 2.9 Developer Command Centre

| Panel | Content |
| --- | --- |
| Situation | Requests today, p95 latency, error rate by endpoint, rate-limit headroom |
| Attention | "You are at 84% of your hourly quota" · "12% of your calls use a field deprecated in v2" |
| Forecast | Projected quota exhaustion, cost at current growth |
| Actions | Rotate keys · replay a webhook · upgrade tier · open a sandbox |

## 2.10 Sponsor Command Centre

| Panel | Content |
| --- | --- |
| Situation | Impressions, unique reach, engagement rate, spend to date |
| Attention | "Your placement under-delivered 18% — makegood available" |
| Forecast | Projected delivery against contracted impressions |
| Actions | Extend flight · swap creative · request a makegood |

**Data scope:** aggregate metrics only. Never individual attendee data — a sponsor has
no relationship with the fan.

## 2.11 Support Agent (human) Command Centre

| Panel | Content |
| --- | --- |
| Situation | Queue depth, SLA breach risk, sentiment distribution |
| Attention | Tickets predicted to escalate, ranked by predicted cost |
| Forecast | Volume by hour, staffing need |
| Actions | Impersonate (consented, time-boxed) · issue a refund (within a limit) · grant credit · escalate |

**Impersonation controls — all four are mandatory:**
1. Explicit user consent, or a documented lawful basis recorded at session start.
2. Hard 30-minute expiry, no silent renewal.
3. A persistent banner visible to the support agent for the entire session.
4. Every action tagged `acting_as` in the audit log, and surfaced to the user in their
   own transcript afterwards.

## 2.12 Regulator / Auditor Command Centre

Read-only, immutable, exportable. No agent may write to anything an auditor reads.

| Panel | Content |
| --- | --- |
| Situation | Compliance posture, open findings, retention status |
| Attention | Records approaching a retention deadline, unresolved SARs |
| Forecast | Upcoming filing obligations |
| Actions | Export an evidence pack (signed, timestamped, hash-chained) |

## 2.13 Cross-cutting: the memory model

Each Command Centre is backed by a four-layer memory. Without this, agents repeat
themselves, contradict prior decisions, and lose user trust within days.

| Layer | Contents | Store | TTL | Scope |
| --- | --- | --- | --- | --- |
| **Working** | Current session, last 20 turns | Redis | 24h | Session |
| **Episodic** | Every decision, action, outcome, and the delta between projected and actual | Firestore `agent_memory` | 7 years | Principal |
| **Semantic** | Learned facts: "this organiser prices below market", "this venue always over-runs" | Vector DB (Vertex Matching Engine) | Indefinite, revisable | Principal |
| **Procedural** | Which action sequences worked, keyed by context | Firestore `agent_playbooks` | Indefinite | Platform-wide, k-anonymised |

**Isolation rule:** working, episodic and semantic memory are strictly partitioned by
principal. Only procedural memory crosses tenants, and only as k-anonymised patterns
(k ≥ 5) — never as raw facts. A pattern learned from Organiser A's data may help
Organiser B; a *fact* about Organiser A must never reach Organiser B. This is
enforced at the retrieval layer, not by prompt instruction.
