# 03 — Agent Architecture

## 3.1 The agent contract

No agent ships without all nine fields specified. This is the review gate.

```ts
interface AgentSpec {
  id: string;                    // stable, versioned: "growth.v4"
  purpose: string;               // one sentence, falsifiable
  inputs: JSONSchema;            // typed, validated before invocation
  outputs: JSONSchema;           // typed, constrained decoding
  scopes: Scope[];               // strictly ⊂ principal's scopes
  autonomy: 'L0' | 'L1' | 'L2' | 'L3';
  triggers: Trigger[];           // event | schedule | user | agent
  escalation: EscalationRule[];  // when to stop and ask a human
  apis: string[];                // every external call it may make
  costBudgetAcu: number;         // hard per-invocation ceiling
  slo: { p95LatencyMs: number; successRate: number };
}
```

### The autonomy ladder

| Level | Meaning | Permitted for |
| --- | --- | --- |
| **L0** | Suggest only. Renders in the UI, cannot act. | Any agent, day one |
| **L1** | Act only after explicit human approval. | Money, identity, bulk comms, pricing |
| **L2** | Act, then notify. Reversible within 24h. | Reversible ops, content, routing |
| **L3** | Act silently. | **Read-only agents exclusively.** Never granted to a writing agent. |

**Promotion criteria — an agent moves up one level only when all four are met:**
1. ≥ 500 invocations at the current level.
2. Human approval rate ≥ 95% at L1 (i.e. humans nearly always agreed).
3. Zero Sev-1 or Sev-2 incidents attributable to it in 90 days.
4. Explicit sign-off from the Governance Agent **and** a named human owner.

Demotion is automatic and immediate on any Sev-1, or on approval rate falling
below 85% over a 50-invocation rolling window.

## 3.2 Runtime architecture

```
                    ┌──────────────────────┐
   Event bus ──────▶│    ORCHESTRATOR      │◀────── Scheduler (cron)
   (Pub/Sub)        │  route · plan · fan  │◀────── User request
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │    POLICY ENGINE     │  scope check · autonomy check
                    │   (deny by default)  │  budget check · rate limit
                    └──────────┬───────────┘
                        allow  │  deny → escalation queue
                    ┌──────────▼───────────┐
                    │    AGENT RUNTIME     │  Genkit flow · typed I/O
                    │  memory · tools      │  retry · circuit breaker
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
        ┌──────────┐    ┌──────────┐    ┌──────────────┐
        │  KERNEL  │    │ EXTERNAL │    │  AUDIT LOG   │
        │  (txn)   │    │   APIs   │    │ (immutable)  │
        └──────────┘    └──────────┘    └──────────────┘
```

**Every arrow into the kernel passes through the policy engine. There is no bypass.**
The policy engine denies by default; an action executes only if an explicit allow rule
matches the tuple `(agent_id, scope, principal, autonomy_level, budget_remaining)`.

### Failure semantics

| Failure | Behaviour |
| --- | --- |
| Model timeout | Retry ×2 with jittered backoff, then fall back to the deterministic path (this pattern is already implemented in `PersonalizedRecommendations.tsx` and `SimilarEvents.tsx`) |
| Schema violation | Reject, re-prompt once with the validation error, then fail closed |
| Scope denial | Fail closed, write to the escalation queue, notify the principal |
| Budget exhausted | Fail closed, notify, offer a top-up. Never silently degrade quality |
| Kernel rejection | Surface the kernel's error verbatim. Never retry a write that was rejected on business rules |
| Partial multi-step failure | Compensating transaction, then escalate. No half-applied state |

## 3.3 Executive agents

### `chief_of_staff.v1`

| Field | Value |
| --- | --- |
| **Purpose** | Rank everything competing for the principal's attention by cost of inaction, in currency, and maintain one ordered list |
| **Inputs** | `{ principalId, role, openItems[], forecasts[], slaBreaches[], calendar[] }` |
| **Outputs** | `{ ranked: [{ itemId, costOfInactionMinor, currency, deadline, rationale, proposedAction? }], digest: string }` |
| **Scopes** | `read:own_workspace` |
| **Autonomy** | L2 (reorders a list; changes nothing else) |
| **Triggers** | Schedule `0 7 * * *` local · any new item · forecast delta > 10% |
| **Workflow** | Gather open items → request a cost estimate from the Analyst for each → rank → dedupe against yesterday's digest → write to Command Centre |
| **Escalation** | Any single item > £10,000 at risk → immediate push notification, do not wait for the digest |
| **APIs** | Internal only |
| **Budget** | 8 ACU/invocation |
| **Value** | Removes the "what do I do first" decision. Measured by: time-to-first-action after login |

### `cfo.v1`

| Field | Value |
| --- | --- |
| **Purpose** | Forecast cash position, flag margin erosion, reconcile projected against actual revenue |
| **Inputs** | `{ organizerId, tickets[], refunds[], commissionTerms, payoutHistory, upcomingEvents[] }` |
| **Outputs** | `{ cashForecast30d, marginByEvent[], anomalies[], breakEvenGaps[] }` |
| **Scopes** | `read:own_revenue`, `read:own_events` |
| **Autonomy** | L0 — reports only. Never moves money |
| **Triggers** | Daily 06:00 · any refund > 5% of an event's gross · payout requested |
| **Workflow** | Pull ledger → compute realised margin → project remaining sales → subtract committed costs → flag events below break-even |
| **Escalation** | Projected negative cash position → notify principal **and** platform admin (a failing organiser is a platform chargeback risk) |
| **APIs** | Internal, Stripe Balance, BitriPay settlements |
| **Budget** | 15 ACU |
| **Value** | Catches loss-making events while there is still time to act |

### `cro.v1`

| Field | Value |
| --- | --- |
| **Purpose** | Own sell-through: identify inventory that will not clear, propose the intervention that clears it |
| **Inputs** | `{ eventId, tiers[], salesVelocity, comparableEvents[], daysToEvent, capacity }` |
| **Outputs** | `{ projectedSellThrough, confidenceInterval, interventions: [{ type, costMinor, projectedLiftTickets, projectedNetMinor, confidence }] }` |
| **Scopes** | `read:own_events`, `read:market_benchmarks` |
| **Autonomy** | L1 — every intervention costs money or changes price |
| **Triggers** | Daily · sell-through 15% below the modelled curve · 14/7/3 days out |
| **Workflow** | Fit velocity curve → compare to k-anonymised comparables → project final → if gap, rank interventions by expected net return → present with confidence |
| **Escalation** | Projected sell-through < 40% at T-7 → escalate to Chief of Staff at top rank |
| **APIs** | Internal, Meta Marketing, Google Ads |
| **Budget** | 20 ACU |
| **Value** | The single highest-leverage agent. Empty seats have zero salvage value |

## 3.4 Growth & revenue agents

### `growth.v4`

| Field | Value |
| --- | --- |
| **Purpose** | Plan, write, launch and reconcile paid acquisition campaigns |
| **Inputs** | `{ eventId, budgetMinor, targetSegment, channel, brandGuidelines, pastCampaigns[] }` |
| **Outputs** | `{ campaign: { name, budgetMinor, audienceSpec, creatives: [{ headline, body, cta, hashtags[] }], flightDates }, projection: { lift, cpa, confidence, sampleSize } }` |
| **Scopes** | `read:own_events`, `write:campaigns`, `spend:ads` (hard-capped per invocation) |
| **Autonomy** | L1 for launch · L2 for creative iteration within an approved budget |
| **Triggers** | CRO gap detected · organiser request · campaign under-delivering by > 20% |
| **Workflow** | Segment from past attendees → build lookalike spec → generate 3 creative variants (already implemented as `generateAdCopy` in `src/server/ai/flows.ts`) → project return from comparable history → request approval → launch → monitor → reconcile projected vs actual |
| **Escalation** | Spend would exceed cap · CPA 2× projection after 20% of budget → pause and notify |
| **APIs** | Meta Marketing, Google Ads, TikTok Ads, SendGrid |
| **Budget** | 30 ACU |
| **Value** | Directly attributable incremental ticket revenue. Measured as: net revenue ÷ ad spend, reported per campaign |

### `event_architect.v1`

| Field | Value |
| --- | --- |
| **Purpose** | Turn a one-line brief into a complete, reviewable event draft |
| **Inputs** | `{ brief, briefFormat: 'text'\|'image'\|'url'\|'clone', organisationId, market, knownVenue?, targetCapacity?, priorEvents[] }` |
| **Outputs** | `{ draft: Event, tiers[], addons[], pricing: [{ tier, proposed, range, confidence, basis[], sensitivity }], copy, imagery[], checklist[], provenance{} }` |
| **Scopes** | `read:own_events`, `read:market_benchmarks`, `write:draft_events` — **never `publish:events`** |
| **Autonomy** | **L1, permanently.** It writes a draft; a human publishes |
| **Triggers** | Organiser submits a brief · clone-and-adapt · field-level regeneration |
| **Workflow** | Parse the brief → resolve venue and capacity → select category → retrieve k-anonymised comparables → propose tiers and prices with confidence → generate copy → offer imagery within the M22 rules → assemble the publish checklist → write as `draft` |
| **Escalation** | Pricing confidence < 0.5 → leave the tier blank with the reason · no comparable set → state it rather than inventing one · brief implies a real named performer → refuse imagery, flag for a licensed asset |
| **APIs** | AI Gateway (`07` §7.5a) · internal comparables · image generation · OCR/vision |
| **Budget** | 45 ACU hard ceiling per full build; per-stage below that |
| **Value** | Event creation from ~40 minutes of form-filling to a reviewed draft in under two |

**Never holds `publish:events`.** The scope does not exist for this agent at any
autonomy level, which is stronger than setting it to L1 — L1 can be promoted, an
absent scope cannot.

**It declines rather than fabricates.** A blank tier with *"no comparable events in
this category and market"* is a useful output; a confident price drawn from nothing is
a trap, because the organiser has no way to tell the two apart from the number alone.

**The 45 ACU ceiling is per build, not per attempt.** Retries within a build come out
of the same envelope, so a hard brief cannot silently cost five times a simple one.

### `pricing.v1`

| Field | Value |
| --- | --- |
| **Purpose** | Recommend tier prices and release timing to maximise revenue, not volume |
| **Inputs** | `{ eventId, tiers[], demandCurve, comparableEvents[], daysToEvent, remainingInventory }` |
| **Outputs** | `{ recommendations: [{ tierId, currentMinor, proposedMinor, projectedRevenueDeltaMinor, rationale }] }` |
| **Scopes** | `read:own_events`, `read:market_benchmarks` |
| **Autonomy** | **L1, permanently.** Price changes are never automatic |
| **Triggers** | Tier > 90% sold with > 7 days remaining · velocity 2σ off model · organiser request |
| **Workflow** | Estimate elasticity from this organiser's history → detect underpricing (sold out early) and overpricing (stalled) → propose with projected revenue delta |
| **Escalation** | Proposed change > 25% → require a second human approval |
| **APIs** | Internal only |
| **Budget** | 12 ACU |
| **Value** | VIP tiers selling out a week early is un-captured revenue. Typical recovery: 4–9% of gross |
| **Constraint** | **No surge pricing after a ticket is on sale at a lower price to an identical buyer.** Fairness is a brand asset; it is worth more than the delta |

### `seo.v1`

| Field | Value |
| --- | --- |
| **Purpose** | Grow organic discovery through structured data, internal linking and a small volume of reviewed editorial |
| **Inputs** | `{ catalogue, queryData, rankingPositions[], competitorGaps[], internalLinkGraph, coreWebVitals }` |
| **Outputs** | `{ metadataUpdates[], internalLinks[], draftArticles[], structuredDataFixes[], technicalIssues[] }` |
| **Scopes** | `read:catalogue`, `write:metadata`, `write:internal_links`, `write:draft_content` — **no publish scope, and no scope touching any external domain** |
| **Autonomy** | **L2** for metadata, internal links and structured data · **L1** for anything that becomes an indexable page |
| **Triggers** | Event published · nightly link refresh · ranking movement > 5 positions · Core Web Vitals regression |
| **Workflow** | Audit structured data → fix metadata gaps → rescore the internal link graph against semantic similarity → identify genuine content gaps → draft for human review |
| **Escalation** | Any proposal that would create more than 20 indexable pages in a day → human review of the whole batch |
| **APIs** | Search Console, internal analytics, AI Gateway (`07` §7.5a) |
| **Budget** | 30 ACU/day |
| **Value** | Organic is the only acquisition channel with no marginal cost per visitor |

**It holds no scope that reaches another domain.** There is no legitimate automated
action to take on somebody else's site, so the capability simply does not exist —
stronger than a policy, for the same reason `event_architect.v1` has no publish scope.

**The 20-page daily escalation exists to stop scaled content abuse structurally.** An
agent that can quietly add a thousand pages a week will eventually be pointed at that
task by someone measuring page count, and the penalty lands on the whole domain.

### `retention.v1`

| Field | Value |
| --- | --- |
| **Purpose** | Predict churn for attendees and organisers; propose the cheapest effective intervention |
| **Inputs** | `{ principalId, activityHistory, purchaseRecency, engagementSignals, supportHistory }` |
| **Outputs** | `{ churnProbability, drivers[], interventions: [{ type, costMinor, projectedRetentionLift }] }` |
| **Scopes** | `read:own_workspace` (attendee) · `read:platform_users` (admin) |
| **Autonomy** | L2 for content interventions · L1 for anything with a monetary cost |
| **Triggers** | Weekly · engagement drop > 50% · a negative support interaction |
| **Workflow** | Score churn → attribute drivers → select the lowest-cost intervention with adequate projected lift → execute or propose |
| **Escalation** | Organiser with > £50k lifetime GMV scoring > 70% churn → human account manager, same day |
| **APIs** | Internal, SendGrid, Twilio |
| **Budget** | 10 ACU |
| **Value** | Retaining a mid-tier organiser is worth roughly 8× acquiring one |

## 3.5 Operations agents

### `operations.v1`

| Field | Value |
| --- | --- |
| **Purpose** | Predict and prevent door-day operational failure |
| **Inputs** | `{ eventId, ticketsSold, historicalArrivalCurve, scannerCount, doorStaffCount, venueCapacity, weatherForecast }` |
| **Outputs** | `{ queueForecast: [{ bucket15min, expectedArrivals, waitMinutes }], staffingGap, recommendations[] }` |
| **Scopes** | `read:own_events`, `read:scan_telemetry` |
| **Autonomy** | L2 for recommendations · L1 for anything that costs staff hours |
| **Triggers** | T-48h · T-4h · live during doors every 5 minutes |
| **Workflow** | Fit arrival curve from comparable events → apply weather and transport adjustments → model queue at current scanner count → if wait > 12 minutes, recommend more scanners or staggered entry |
| **Escalation** | Live wait > 20 minutes → SMS the organiser immediately, do not wait for the dashboard |
| **APIs** | Internal, OpenWeather, TfL/transport status |
| **Budget** | 10 ACU |
| **Value** | Queue length is the single strongest driver of event NPS |

### `onboarding.v1`

| Field | Value |
| --- | --- |
| **Purpose** | Take an organiser, venue or promoter from sign-up to able-to-sell with no human review on the standard path |
| **Inputs** | `{ registration, uploadedDocuments[], kybData, taxRegistration, bankDetails, country }` |
| **Outputs** | `{ verificationResult, roleAssignment, accountStatus, merchantAccountRef?, welcomeWorkflow }` |
| **Scopes** | `read:own_application`, `propose:account_status` — **never `write:account_status`** |
| **Autonomy** | **L1.** Approval is a money-and-identity decision, so a human confirms |
| **Triggers** | New sign-up · document uploaded · KYC/KYB provider callback |
| **Workflow** | Validate the form → submit documents to Sumsub → screen against ComplyAdvantage → on a clean pass, assemble the approval with evidence attached → on any flag, route to the admin queue with the flag named |
| **Escalation** | Sanctions match · document authenticity failure · PEP hit → **freeze, human review, no agent discretion** (`06` §6.4) |
| **APIs** | Sumsub, Stripe Identity, BitriPay Merchant API, SendGrid |
| **Budget** | 25 ACU/application |
| **Value** | Activation time from days to minutes on the standard path |

**It proposes; it does not approve.** The organiser approval gate in `16` §16.1 is the
platform's single control on who may take money from the public. An agent that can
open that gate unattended is an agent that can be prompt-injected into onboarding a
fraudster.

What it removes is the *labour* of review — assembling documents, running screens,
checking the company register — not the decision. The admin sees a complete case with a
recommendation, and clicks once.

### `support.v2`

| Field | Value |
| --- | --- |
| **Purpose** | Resolve attendee and organiser enquiries end to end; escalate cleanly when it cannot |
| **Inputs** | `{ conversationId, messages[], principalContext, orderHistory, knowledgeBase }` |
| **Outputs** | `{ reply, confidence, resolved: boolean, suggestedAction?, escalate: boolean, escalationReason? }` |
| **Scopes** | `read:own_workspace`, `write:support_replies`, `refund:up_to_5000_minor` |
| **Autonomy** | L2 for informational replies · L1 for refunds and anything altering an order |
| **Triggers** | Inbound message · SLA breach risk |
| **Workflow** | Classify intent → retrieve context and policy → draft → self-check against policy → if confidence < 0.8 **or** intent ∈ {complaint, legal, safeguarding, chargeback} escalate → else reply |
| **Escalation** | Low confidence · sensitive intent · 3 unresolved turns · any mention of injury, discrimination or legal action → **immediate human, no further agent turns** |
| **APIs** | Internal, Zendesk, SendGrid, Twilio |
| **Budget** | 6 ACU/turn |
| **Value** | Deflects 60–70% of L1 volume. Measured on resolution rate, **not** deflection rate — deflecting an unresolved issue is a cost, not a saving |

**On "handles 90%+ autonomously, including refund initiation".** The first half is a
target worth having; the second conflicts with a permanent constraint. Refunds and
transfer approvals move money and change entitlement, so they stay **L1** — the agent
drafts the refund and a human releases it.

`01` §1.7 states this as a non-goal, not a phase-one limitation: *no agent moves money
without a human approval.* An agent that can issue refunds unattended is one
prompt-injection away from being a withdrawal mechanism, and the attack surface is an
inbound support message from anyone on the internet.

The `refund:up_to_5000_minor` scope is a **ceiling on what it may draft**, not a
licence to execute.

## 3.5b Venue & door agents

### `gate_intelligence.v1`

| Field | Value |
| --- | --- |
| **Purpose** | Predict arrival curves and staff the doors to match |
| **Inputs** | `{ ticketsSold, historicalArrivalCurves[], weather, transportStatus, gateCapacities[], liveScanRate }` |
| **Outputs** | `{ predictedCurve[], staffingByGate[], congestionAlerts[], recommendedOpenTime }` |
| **Scopes** | `read:tickets`, `read:scan_logs`, `write:gate_config` |
| **Autonomy** | **L1 before doors open · L2 once live** — a reallocation mid-queue must be fast |
| **Triggers** | T-7 days · T-24h · T-2h · live scan rate deviating > 30% from prediction |
| **Workflow** | Fit the curve from comparable events → adjust for weather and transport → allocate staff per gate → alert on predicted congestion → re-forecast live from actual scan rate |
| **Escalation** | Predicted queue > 20 minutes at any gate → notify the venue manager and the organiser immediately |
| **APIs** | Transport APIs, weather, internal `scan_logs` |
| **Budget** | 15 ACU/event |
| **Value** | Queue length is the single most-complained-about part of live events, and it is a forecasting problem, not a staffing-generosity problem |

**It runs on `scan_logs` (`08` §8.12), which is why that table records refusals.** A
live scan rate that counts only successful admissions under-reports actual arrival
pressure, and under-reports it worst exactly when duplicates are spiking.

### `seatmap_architect.v1`

| Field | Value |
| --- | --- |
| **Purpose** | Build a complete, priced, colour-coded seat map from a description, a plan or a photograph |
| **Inputs** | `{ source: 'text'\|'floorplan'\|'photo'\|'clone'\|'venue_library', payload, licensedCapacity, accessibleRequirement, priceBands[], venueId? }` |
| **Outputs** | `{ sections[], rows[], seats[], priceBands[], accessibleAllocation, suggestedHolds[], reconciliation: { seatCount, overCapacity, accessibleShortfall, unverifiedObstruction, unassigned } }` |
| **Scopes** | `read:venues`, `write:draft_seat_maps` — **never `publish:seat_maps`**, never `write:seat_maps` where tickets exist |
| **Autonomy** | **L1.** A venue manager confirms before anything sells against it |
| **Triggers** | Venue manager requests generation · clone for a recurring event · new venue onboarded |
| **Workflow** | Extract structure from the source → lay out sections and rows → number seats per scheme → assign price bands and accessible colours → allocate accessible and companion seats → reconcile against licensed capacity → emit warnings |
| **Escalation** | Over licensed capacity → **refuse to emit**, report the overage · accessible shortfall → refuse · low extraction confidence → emit with counts flagged rather than guessed |
| **APIs** | AI Gateway (`07` §7.5a) — vision for plans and photos |
| **Budget** | 40 ACU hard ceiling per generation |
| **Value** | Seat map creation from a day of drafting to a reviewed draft in minutes; the largest single barrier to onboarding a seated venue |

**It cannot touch a map with tickets sold against it.** The scope is
`write:draft_seat_maps`, and `04` M23 freezes geometry at first sale. Renumbering a
seat somebody holds is not an edit, it is invalidating their ticket.

**It refuses rather than trims.** Over licensed capacity and accessible shortfall both
produce a refusal with the number attached, not a quietly adjusted map. An agent that
silently removes four seats to fit a licence has made a safety decision it has no
authority to make, and nobody will know it happened.

### `capacity.v1`

| Field | Value |
| --- | --- |
| **Purpose** | Maximise usable capacity without breaching licence or accessibility duty |
| **Inputs** | `{ seatMap, sold[], holds[], zoneUtilisation[], licensedCapacity, accessibleSeatRequirement }` |
| **Outputs** | `{ allocationChanges[], zoneRebalance[], complianceWarnings[] }` |
| **Scopes** | `read:seat_maps`, `read:tickets`, `propose:allocation` — **never `write:allocation` directly** |
| **Autonomy** | **L0 for anything touching accessible seating · L1 otherwise** |
| **Triggers** | Seat map published · 80% sold in any zone · licensed capacity changed |
| **Workflow** | Compute utilisation per zone → find releasable holds → check accessible provision against the requirement → propose reallocation with the compliance position stated |
| **Escalation** | Any proposal that would reduce accessible seating → **refuse and log**, never propose |
| **APIs** | Internal only |
| **Budget** | 10 ACU/event |
| **Value** | Unsold held inventory is the most recoverable revenue on the platform |

**Accessible seating is hard-coded as L0 and un-proposable.** An optimiser that can
trade away accessible provision for yield will eventually do it, and the cost is a
person who cannot attend plus a legal exposure the yield never covered.

### `payments.v1`

| Field | Value |
| --- | --- |
| **Purpose** | Keep money moving: route it, recover it when it fails, schedule it out, reconcile it |
| **Inputs** | `{ order, market, method, providerHealth[], failureCode?, payoutSchedule, settlementFeeds[] }` |
| **Outputs** | `{ route, retryPlan?, payoutBatch?, reconciliationExceptions[] }` |
| **Scopes** | `read:payments`, `write:payment_routing`, `propose:payout_batch` — **never `execute:payout`** |
| **Autonomy** | **L2 for routing and retries · L1 for payout batches** |
| **Triggers** | Checkout initiated · payment failed · payout window · settlement file received |
| **Workflow** | Select the rail from the deterministic table in `06` §6.2 → on failure classify the code and retry only where retry can succeed → assemble payout batches → three-way reconcile gateway against ledger against bank, and raise exceptions |
| **Escalation** | Reconciliation exception over £100 · any settlement mismatch · a rail down beyond its breaker window |
| **APIs** | Stripe, Adyen, BitriPay, KODA (`06` §6.20), banking rails |
| **Budget** | 12 ACU/invocation |
| **Value** | Failed-payment recovery is the highest-conversion intervention on the platform: the buyer already decided |

**Routing is deterministic, not model-driven.** The agent executes the rule table in
`06` §6.2 and monitors it; it does not improvise which rail takes a payment. A model
choosing payment routes is a model that can be nudged into choosing the expensive one,
or the one that is currently down.

**Retry only where retry can work.** `insufficient_funds` is worth retrying on a
schedule; `stolen_card` and `do_not_honour` are not, and retrying them manufactures
chargebacks. The failure-code classification is a lookup table, reviewed quarterly.

## 3.6 Security & compliance agents

### `fraud.v3`

| Field | Value |
| --- | --- |
| **Purpose** | Score every transaction and every scan for fraud before it completes |
| **Inputs** | `{ transactionId, amountMinor, principal, deviceFingerprint, ipIntel, velocityFeatures, historicalPattern }` |
| **Outputs** | `{ riskScore: 0-100, decision: 'allow'\|'challenge'\|'block', reasons[], evidence[] }` |
| **Scopes** | `read:transactions`, `write:risk_decisions` |
| **Autonomy** | **L2 for `challenge` · L1 for `block`.** A false block is a lost customer and a support ticket; a human confirms every block |
| **Triggers** | Synchronous on every payment · every scan · every payout request |
| **Workflow** | Feature extraction → gradient-boosted model score → LLM narrative for the human reviewer → decision → write evidence |
| **Escalation** | Score > 85 → human review within 5 minutes · a pattern across ≥ 3 organisers → platform-wide alert |
| **APIs** | Internal, Stripe Radar, Sift/Seon, MaxMind |
| **Budget** | 3 ACU (must stay cheap — it runs on every transaction) |
| **SLO** | p95 < 120ms. **Fails open to `challenge`, never to `allow`** |
| **Value** | Chargeback and fake-ticket loss avoided |

### `security.v1`

| Field | Value |
| --- | --- |
| **Purpose** | Detect account takeover, credential stuffing, API abuse and anomalous privilege use |
| **Inputs** | `{ authEvents[], apiCallPatterns, geoVelocity, deviceChanges, privilegeUsage }` |
| **Outputs** | `{ threats: [{ type, severity, affectedPrincipals[], evidence[], recommendedAction }] }` |
| **Scopes** | `read:security_telemetry`, `write:security_actions` |
| **Autonomy** | L2 for step-up auth and rate limiting · L1 for account suspension |
| **Triggers** | Continuous · auth failure rate > 3σ · impossible travel · new device on a privileged account |
| **Workflow** | Baseline behaviour → detect deviation → correlate across principals → classify → act or escalate |
| **Escalation** | Any privileged account (`superuser`) anomaly → immediate page, 24/7 |
| **APIs** | Internal, Cloudflare, HaveIBeenPwned |
| **Budget** | 5 ACU |
| **Value** | An account takeover on an organiser account with payout access is an existential event |

### `compliance.v1`

| Field | Value |
| --- | --- |
| **Purpose** | Continuously verify KYC/KYB, AML screening, GDPR obligations and data retention |
| **Inputs** | `{ principalId, kycStatus, transactionVolume, jurisdiction, dataSubjectRequests[], retentionClock[] }` |
| **Outputs** | `{ obligations: [{ type, dueDate, status, blocking }], findings[] }` |
| **Scopes** | `read:compliance_records`, `write:compliance_findings` |
| **Autonomy** | L1 always — compliance decisions are never automatic |
| **Triggers** | Onboarding · volume crosses a KYC threshold · daily retention sweep · SAR received |
| **Workflow** | Evaluate obligations by jurisdiction and volume → check evidence → flag gaps → block payouts where legally required |
| **Escalation** | Sanctions-list hit → **immediate freeze, immediate human, no agent discretion** |
| **APIs** | Internal, Sumsub/Persona, ComplyAdvantage |
| **Budget** | 12 ACU |
| **Value** | A single AML failure can end a payments business |

## 3.7 Self-managing platform agents

### `reliability.v1`

| Field | Value |
| --- | --- |
| **Purpose** | Watch SLOs, correlate signals, diagnose, and drive the incident to resolution |
| **Inputs** | `{ metrics, traces, logs, deployHistory, dependencyStatus }` |
| **Outputs** | `{ incident?: { severity, hypothesis, evidence[], blastRadius, recommendedAction } }` |
| **Scopes** | `read:telemetry`, `write:incidents`, `execute:runbooks` |
| **Autonomy** | L2 for known runbooks (scale, restart, flag off) · L1 for rollback and schema change |
| **Triggers** | SLO burn rate > 2× · error rate anomaly · a dependency degrades |
| **Workflow** | Detect → correlate with the last deploy → form a hypothesis → match to a runbook → execute or escalate → verify recovery → write the postmortem draft |
| **Escalation** | Sev-1, or no runbook match, or recovery unverified within 10 minutes → page on-call |
| **APIs** | Cloud Monitoring, Sentry, PagerDuty, GitHub Actions |
| **Budget** | 25 ACU |
| **Value** | Target: > 60% of P3 incidents resolved without a human by month 24 |

### `auto_repair.v1`

| Field | Value |
| --- | --- |
| **Purpose** | Turn recurring, well-understood defects into merged pull requests |
| **Inputs** | `{ errorSignature, stackTrace, occurrenceCount, affectedUsers, sourceContext, testSuite }` |
| **Outputs** | `{ pullRequest?: { branch, diff, tests, rationale }, confidence }` |
| **Scopes** | `read:source`, `write:branches`, `open:pull_requests` — **never `merge`** |
| **Autonomy** | **L1, permanently.** Every PR is human-reviewed. No exceptions, at any maturity |
| **Triggers** | Error signature seen ≥ 50 times in 24h · a flaky test crosses threshold |
| **Workflow** | Cluster errors by signature → locate source → generate a fix → generate a failing-then-passing test → run the full suite → open a PR with evidence |
| **Escalation** | Confidence < 0.9 · touches auth, payments or security rules → do not open a PR, file an issue instead |
| **APIs** | GitHub, CI |
| **Budget** | 60 ACU (expensive, runs rarely) |
| **Value** | Removes the long tail of "known but never prioritised" defects |

### `governance.v1`

| Field | Value |
| --- | --- |
| **Purpose** | Govern the agents themselves: promotion, demotion, budget, drift, and policy |
| **Inputs** | `{ agentMetrics[], approvalRates[], incidentAttribution[], costPerAgent[], outputSamples[] }` |
| **Outputs** | `{ autonomyChanges[], budgetChanges[], driftAlerts[], policyViolations[] }` |
| **Scopes** | `read:agent_telemetry`, `write:agent_policy` |
| **Autonomy** | **L2 for demotion (always safe) · L1 for promotion (never automatic)** |
| **Triggers** | Weekly review · any Sev-1 · approval rate crossing a threshold · model version change |
| **Workflow** | Evaluate every agent against its promotion criteria → sample outputs for quality drift → propose promotions → **execute demotions immediately** → alert on cost anomalies |
| **Escalation** | Systemic drift across ≥ 3 agents → freeze all promotions, notify the platform owner |
| **APIs** | Internal only |
| **Budget** | 40 ACU/week |
| **Value** | The agent layer only stays safe if something is accountable for it. This is that thing |

**The asymmetry is deliberate:** demotion is fast and automatic; promotion is slow and
requires a human. Safety must be cheap to apply and capability expensive to grant.

### `bug_detection.v1`

| Field | Value |
| --- | --- |
| **Purpose** | Find regressions in telemetry before a user reports them |
| **Inputs** | `{ errorLogs[], releaseMarkers[], performanceTraces[], userReports[] }` |
| **Outputs** | `{ issues: [{ title, severity, signature, firstSeen, suspectedRelease, evidence }] }` |
| **Scopes** | `read:telemetry`, `open:issues` — **no source write, no deploy** |
| **Autonomy** | **L2** — filing an issue is reversible and costs only attention |
| **Triggers** | Error rate for any signature up > 3σ · new signature after a deploy · p95 latency regression > 25% |
| **Workflow** | Cluster errors by signature → correlate against release markers → classify severity by affected users and money at risk → deduplicate against open issues → file with evidence attached |
| **Escalation** | Sev-1 (checkout, scan, or auth broken) → page on-call immediately, do not wait for the issue to be triaged |
| **APIs** | Datadog, Sentry, GitHub, Cloud Monitoring |
| **Budget** | 25 ACU/day |
| **Value** | Compresses time-to-detection from a support ticket to a telemetry threshold |

Deliberately separate from `auto_repair.v1`. Detection is cheap, safe and should run
constantly; repair is expensive, risky and runs rarely. Fusing them would force the
whole pipeline to the higher risk tier and the lower frequency.

### `infra_optimisation.v1`

| Field | Value |
| --- | --- |
| **Purpose** | Keep infrastructure spend proportional to load |
| **Inputs** | `{ costReports[], podUtilisation[], requestVolume[], storageGrowth[], idleResources[] }` |
| **Outputs** | `{ recommendations: [{ resource, action, monthlySaving, riskNote }], applied[] }` |
| **Scopes** | `read:billing`, `read:metrics`, `write:non_production_scaling` |
| **Autonomy** | **L2 in non-production · L1 in production** — a right-sizing that is wrong is an outage |
| **Triggers** | Weekly · cost anomaly > 20% week-on-week · sustained utilisation < 30% for 7 days |
| **Workflow** | Attribute spend by service → find idle and over-provisioned resources → size against p99 not mean → propose with an explicit risk note → apply in non-production, queue production for approval |
| **Escalation** | Any recommendation touching the transactional core or the database → human approval, always |
| **APIs** | GCP Billing, GKE, Cloudflare Analytics |
| **Budget** | 20 ACU/week |
| **Value** | Infrastructure waste compounds silently; nobody's job is to notice a 12% overspend |

**Sized against p99, never the mean.** A pod right-sized to average load is a pod that
fails on the on-sale spike, which is the one hour that matters.

### `release_management.v1`

| Field | Value |
| --- | --- |
| **Purpose** | Own the deploy, and own the rollback |
| **Inputs** | `{ candidateBuild, testResults, errorRateBaseline, latencyBaseline, activeIncidents[] }` |
| **Outputs** | `{ decision: 'proceed'\|'hold'\|'rollback', stage, metrics, rationale }` |
| **Scopes** | `read:ci`, `write:deployment_traffic`, `execute:rollback` |
| **Autonomy** | **L3 for rollback · L1 for promotion to 100%** |
| **Triggers** | Merge to main · error rate above baseline post-deploy · manual invocation |
| **Workflow** | Verify green CI and no active Sev-1 → deploy to the blue slot → shift 5% of traffic → hold and compare error rate and p95 against baseline → 25% → 50% → **request human approval for 100%** |
| **Escalation** | Rollback executed → notify immediately with the metric that triggered it and the diff that was reverted |
| **APIs** | GitHub Actions, Vercel, GKE, Datadog |
| **Budget** | 15 ACU/deploy |
| **Value** | Cuts the blast radius of a bad deploy from every user to 5% of users for one minute |

**This is the only agent in the system holding L3**, and the exception is narrow and
principled: L3 applies to **rollback only** — returning the platform to a state that
was already running and already approved. Going forward always needs a human. An agent
that can undo without asking is a safety mechanism; an agent that can ship without
asking is not.

It moves no money and changes no identity, so it does not breach the constraint in
`01` §1.7.

### The six self-managing agents

| Agent | Watches | Acts on | Autonomy |
| --- | --- | --- | --- |
| `reliability.v1` | Uptime, latency, error rate, connector health | Alerts, failover, circuit breakers | L2 |
| `auto_repair.v1` | Recurring defect signatures | Opens pull requests, never merges | L1 permanently |
| `bug_detection.v1` | Telemetry, release markers | Files issues, pages on Sev-1 | L2 |
| `infra_optimisation.v1` | Cost and utilisation | Right-sizing, idle reclamation | L2 non-prod / L1 prod |
| `release_management.v1` | Deploy health | Progressive traffic shift, rollback | L3 rollback / L1 promote |
| `governance.v1` | The other five, and every other agent | Autonomy and budget changes | L2 demote / L1 promote |

Together these are what makes a 99.99% target survivable with a lean team: routine
detection, repair proposal, cost control and deploy safety run without a human in the
loop, while every irreversible step still requires one.

`governance.v1` governs the other five as it governs everything else. A self-managing
layer with nothing watching *it* is just an unsupervised layer.

### Operating parameters

| Agent | Cadence | Acts by |
| --- | --- | --- |
| `reliability.v1` | Every **30 seconds** | Alert, failover, breaker; triggers `auto_repair.v1` on breach |
| `auto_repair.v1` | On signature threshold | Restart pods, redeploy last known good via rolling update, open a PR |
| `bug_detection.v1` | Continuous | Cluster Datadog errors, classify severity, file a GitHub issue |
| `infra_optimisation.v1` | Weekly | Right-size pods, reclaim idle resources, **report monthly savings** |
| `release_management.v1` | Per deploy | Progressive traffic shift, auto-rollback on error-rate breach |
| `governance.v1` | Weekly + on incident | Enforce scope boundaries, **detect prompt injection**, block policy violations |

**Prompt-injection detection sits with `governance.v1` deliberately.** It is the only
agent whose job is watching other agents, and injection attempts arrive through
attacker-controlled text — a support message, an event description, a webhook payload,
a scraped page. Detection belongs with the principal that can actually revoke a scope,
not with the agent being attacked. Full treatment in `11` §11.7.

### What this layer does not remove

The closing claim in the source specification is that human engineers can *"focus
exclusively on product innovation."* That overstates it in a way worth correcting, because
teams staff against it.

| Removed | Not removed |
| --- | --- |
| Manual log trawling | Deciding whether an alert matters |
| Restarting a crashed pod at 03:00 | Being paged for a Sev-1 |
| Noticing a cost regression | Approving a production right-size |
| Writing the first draft of a fix | **Reviewing and merging it** |
| Remembering to roll back | Deciding whether to roll forward |

Look at the autonomy column and the reason is structural: `auto_repair.v1` is **L1
permanently** — it opens pull requests and never merges. `release_management.v1` holds
L3 for rollback only. `infra_optimisation.v1` needs approval in production. Every one of
those is a human in the loop by design, and each was set there for a reason that has not
changed.

**On-call does not go away. It gets quieter and better-informed.** A team that plans for
no on-call because agents handle it discovers otherwise during its first real incident —
at which point nobody is rostered.

The layer also creates work that did not exist before: somebody owns the agents. PRs need
reviewing, escalations need deciding, `governance.v1`'s promotion and demotion proposals
need a named human signing them off (`03` §3.1). That is a smaller job than the toil it
replaces, and it is not zero.

**And it does not deliver 99.99% on its own.** Availability is set by architecture, not
by agents — `07` §7.12 shows a single failover at the stated 1-hour RTO consuming the
entire annual error budget. Self-healing reduces how often you fail over; it does not
change what failing over costs.

## 3.8 Data & intelligence agents

### `analyst.v2`

| Field | Value |
| --- | --- |
| **Purpose** | Answer any question about the principal's own data, with the query shown |
| **Inputs** | `{ question, principalId, schemaContext, permissionScope }` |
| **Outputs** | `{ answer, query, resultSet, visualisation?, caveats[] }` |
| **Scopes** | `read:own_workspace` — enforced at query generation, not after |
| **Autonomy** | L3 (read-only, hence safe to run silently) |
| **Triggers** | User question · scheduled report |
| **Workflow** | Parse intent → generate a **parameterised** query scoped to the principal → validate against the permission scope before execution → execute → interpret → state caveats |
| **Escalation** | Question requires cross-tenant data → refuse and explain, never partially answer |
| **APIs** | Internal (BigQuery) |
| **Budget** | 8 ACU |
| **Value** | Removes the analyst bottleneck. Every organiser gets one |
| **Guardrail** | Generated SQL is **parameterised and scope-injected before execution**, never string-concatenated. The permission predicate is added by the runtime, not by the model |

### `research.v1`

| Field | Value |
| --- | --- |
| **Purpose** | Competitive, market and demand intelligence from public sources |
| **Inputs** | `{ topic, market, timeframe, competitors[] }` |
| **Outputs** | `{ findings: [{ claim, evidence, sourceUrl, confidence, retrievedAt }], implications[] }` |
| **Scopes** | `read:public_data`, `read:market_benchmarks` |
| **Autonomy** | L3 (read-only) |
| **Triggers** | Weekly · organiser request · a new competitor event detected in the same market |
| **Workflow** | Search → retrieve → extract claims → **cite every claim or drop it** → synthesise |
| **Escalation** | None (read-only) |
| **APIs** | Web search, Songkick, Bandsintown, public listings |
| **Budget** | 35 ACU |
| **Value** | "Three comparable events that weekend within 5 miles" changes an on-sale date |
| **Guardrail** | **Every claim carries a source URL and retrieval timestamp, or it is discarded.** No uncited assertions reach a user |

### `concierge.v1`

| Field | Value |
| --- | --- |
| **Purpose** | The fan's own agent — discovery, upgrades, and what to do on the day |
| **Inputs** | `{ ownedTickets[], attendanceHistory, statedPreferences, loyaltyTier, location, upcomingCatalogue }` |
| **Outputs** | `{ recommendations[], upgradeOffers[], dayOfGuidance[] }` |
| **Scopes** | `read:own_tickets`, `read:published_events` — **the fan's own scope, never wider** |
| **Autonomy** | **L0.** It suggests; the fan decides. It never buys |
| **Triggers** | Fan opens their Command Centre · T-48h before an owned event · new event matching stated preferences |
| **Workflow** | Read owned tickets and history → match against published inventory → rank by fit not by margin → surface upgrades the fan's tier actually unlocks |
| **Escalation** | None — it holds no authority to escalate |
| **APIs** | Internal, plus maps and transport for day-of guidance |
| **Budget** | Metered to the fan's ACU balance (`15` §15.6 F5) |
| **Value** | Repeat attendance is the cheapest revenue on the platform |

**Ranked by fit, not by margin.** A concierge that steers fans toward whatever pays the
platform most is a recommendation engine wearing a friendlier name, and fans work it
out fast. This is the `agent(X) ⊂ X` rule at its sharpest: the fan's agent holds the
fan's scope and serves the fan's interest.

### `dispute.v1`

| Field | Value |
| --- | --- |
| **Purpose** | Turn chargebacks into evidence packs before the deadline passes |
| **Inputs** | `{ chargeback, order, payment, scanLogs[], deliveryEvidence, communicationHistory, organiserPolicy }` |
| **Outputs** | `{ riskScore, recommendation: 'contest'\|'accept', evidencePack, deadline }` |
| **Scopes** | `read:orders`, `read:payments`, `read:scan_logs`, `draft:evidence` — **never `submit`** |
| **Autonomy** | **L1 permanently.** A human submits every response |
| **Triggers** | Chargeback webhook · dispute opened · 48h before a representment deadline |
| **Workflow** | Assemble the order, the payment, the delivery proof and the scan record → assess contestability against the reason code → draft the evidence pack → recommend contest or accept with the expected value of each |
| **Escalation** | Chargeback rate for any organiser above threshold → `fraud.v3` and the platform admin |
| **APIs** | Stripe, Adyen, BitriPay dispute APIs |
| **Budget** | 20 ACU/dispute |
| **Value** | Most chargebacks are lost by default, unanswered, because assembling evidence is tedious and the window is short |

**A scanned ticket is the strongest evidence a ticketing platform can produce**: it
shows the buyer received the goods and used them. That evidence only exists because
`scan_logs` retains the record — another return on `08` §8.12.

## 3.9 Multi-agent orchestration

Three patterns. Everything else is a composition of these.

**Sequential** — output feeds input:
`cro → growth → pricing` (find the gap, plan the campaign, adjust the price)

**Parallel with join** — independent, then merged:
`analyst ∥ research ∥ operations → chief_of_staff` (three views, one ranked list)

**Adversarial** — one proposes, one refutes:
`growth (proposes campaign) → compliance (checks claims are lawful) → fraud (checks
the segment is not a fraud ring)`. Any veto blocks. This pattern is mandatory for
every money-moving action.

### Conflict resolution

When agents disagree, resolve deterministically — never by asking a model to arbitrate:

1. **Safety wins.** Security, fraud and compliance vetoes are absolute and unappealable.
2. **Lower autonomy wins.** An L1 requirement overrides an L2 permission.
3. **Higher confidence wins**, but only if the gap ≥ 0.2.
4. **Otherwise, escalate to the human.** Never let two agents ping-pong.

### Loop prevention

- Max depth 5 agent-to-agent hops per originating trigger.
- Max 3 invocations of the same agent per trigger chain.
- Total budget per chain: 200 ACU.
- Any breach → halt, escalate, and log the full chain for the Governance Agent.

## 3.10 Benchmark claims and their provenance

Agent specifications attract quantified value claims — "15–30% revenue uplift", "70–80%
lower support cost", "40% faster entry", "10–15% of industry revenue lost to fraud".
They are useful for prioritisation and dangerous in a deck.

**The rule, applied to every number in this document set:**

| Claim type | Requirement |
| --- | --- |
| Industry benchmark | A source URL, the publication date, and the population it was measured over |
| Competitor figure | A source URL per claim, and a note where FX conversion is approximate |
| Our own projection | Labelled as a projection, with the assumption that drives it |
| Measured result | The metric definition and the window |

An unfootnoted benchmark is the fastest way to lose a room that would otherwise have
agreed with you — and the first person to check one number and find it unsourced stops
believing the other nineteen.

### Claims currently carried without a source

| Claim | Where | Status |
| --- | --- | --- |
| Dynamic pricing lifts revenue 15–30% | `pricing.v1` | **`OPEN` — needs a citation or removal** |
| Fraud costs the industry 10–15% of revenue | `fraud.v3` | **`OPEN`** |
| Automated campaigns drive 20–40% more sales | `growth.v4` | **`OPEN`** |
| Support automation cuts cost 70–80% | `support.v2` | **`OPEN`** |
| Gate intelligence cuts entry time 40% | `gate_intelligence.v1` | **`OPEN`** |

Each is plausible and none is currently sourced. They stay in the document as targets
because they are the right things to measure, and they are marked `OPEN` so nobody
quotes them externally as findings.

**Our own numbers do not have this problem** and should be preferred wherever they
exist: sell-through against the modelled curve, resolution rate, duplicate-scan rate,
ACU spend per organiser. Those are measured on our data and can be defended line by
line.

## 3.11 Prompt & model governance

| Control | Implementation |
| --- | --- |
| **Versioning** | Every prompt in git. The hash is written to the audit log with every invocation |
| **Model pinning** | Pinned per agent. Version changes are a deploy, never a silent upstream update |
| **Evaluation** | A golden set per agent (≥ 100 cases). CI blocks merge on regression |
| **Injection defence** | User content is delimited and marked untrusted. Tool calls are validated against the declared scope. **A tool call that appears in user-supplied text is never executed** |
| **Output validation** | Constrained decoding to schema; validation failure is a hard fail, never a coerced pass |
| **PII minimisation** | Prompts receive ids and aggregates. Names and emails are injected only where the task provably needs them, and never for training |
| **Cost attribution** | Every call tagged `agent_id`, `principal_id`, `trigger_id`. Anomalies alert the Governance Agent |

## 3.12 Agent registry

| Agent | Plane | Autonomy ceiling | Budget/call | SLO p95 |
| --- | --- | --- | --- | --- |
| `chief_of_staff.v1` | Executive | L2 | 8 | 3s |
| `cfo.v1` | Executive | L0 | 15 | 5s |
| `cro.v1` | Executive | L1 | 20 | 5s |
| `growth.v4` | Revenue | L1 | 30 | 8s |
| `event_architect.v1` | Revenue | L1 (no publish scope) | 45/build | 45s |
| `seo.v1` | Revenue | L2 metadata · L1 pages | 30/day | 20s |
| `pricing.v1` | Revenue | L1 | 12 | 4s |
| `retention.v1` | Revenue | L2 | 10 | 4s |
| `operations.v1` | Ops | L2 | 10 | 3s |
| `onboarding.v1` | Ops | L1 | 25 | 30s |
| `support.v2` | Ops | L2 | 6 | 2s |
| `gate_intelligence.v1` | Venue | L2 (live) | 15/event | 2s |
| `capacity.v1` | Venue | L1 (L0 accessible) | 10/event | 5s |
| `seatmap_architect.v1` | Venue | L1 (no publish scope) | 40/generation | 60s |
| `payments.v1` | Money | L2 route · L1 payout | 12 | 3s |
| `fraud.v3` | Security | L1 (block) | 3 | 120ms |
| `security.v1` | Security | L2 | 5 | 1s |
| `compliance.v1` | Security | L1 | 12 | 5s |
| `reliability.v1` | Platform | L2 | 25 | 2s |
| `auto_repair.v1` | Platform | L1 | 60 | 120s |
| `governance.v1` | Platform | L2 (demote) | 40/wk | 30s |
| `dispute.v1` | Money | L1 | 20 | 10s |
| `concierge.v1` | Fan | L0 | metered | 3s |
| `bug_detection.v1` | Platform | L2 | 25/day | 60s |
| `infra_optimisation.v1` | Platform | L2 non-prod · L1 prod | 20/wk | 60s |
| `release_management.v1` | Platform | **L3 rollback** · L1 promote | 15/deploy | 30s |
| `analyst.v2` | Data | L3 | 8 | 4s |
| `research.v1` | Data | L3 | 35 | 20s |

**28 agents.** Where an outline names an agent this table does not, it is because the
function already has an owner rather than because it was missed:

| Named elsewhere | Owned by | Why not separate |
| --- | --- | --- |
| Risk Agent | `fraud.v3` | Same signals, same model, same decision point |
| Admin Control Agent | `governance.v1` | RBAC enforcement and admin audit are one policy surface |
| Predictive Growth Agent | `analyst.v2` + `cro.v1` | Forecasting and budget allocation already split this way |
| API Integration Agent | `reliability.v1` | Consumes the connector health contract in `06` §6.23 |
| Churn Prevention Agent | `retention.v1` | Same agent, different name |
| Data Intelligence Agent | `analyst.v2` | Same agent, different name |
| System Health Agent | `reliability.v1` | Same agent, different name |
| AI Wallet · AI Notification | *not agents* | Deterministic services — `02` §2.2 |

Splitting an agent because a slide lists it twice produces two contracts, two budgets
and two sets of drift to govern. The registry is the authority; Command Centres are
views over it.
