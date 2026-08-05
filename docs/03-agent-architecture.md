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

## 3.10 Prompt & model governance

| Control | Implementation |
| --- | --- |
| **Versioning** | Every prompt in git. The hash is written to the audit log with every invocation |
| **Model pinning** | Pinned per agent. Version changes are a deploy, never a silent upstream update |
| **Evaluation** | A golden set per agent (≥ 100 cases). CI blocks merge on regression |
| **Injection defence** | User content is delimited and marked untrusted. Tool calls are validated against the declared scope. **A tool call that appears in user-supplied text is never executed** |
| **Output validation** | Constrained decoding to schema; validation failure is a hard fail, never a coerced pass |
| **PII minimisation** | Prompts receive ids and aggregates. Names and emails are injected only where the task provably needs them, and never for training |
| **Cost attribution** | Every call tagged `agent_id`, `principal_id`, `trigger_id`. Anomalies alert the Governance Agent |

## 3.11 Agent registry

| Agent | Plane | Autonomy ceiling | Budget/call | SLO p95 |
| --- | --- | --- | --- | --- |
| `chief_of_staff.v1` | Executive | L2 | 8 | 3s |
| `cfo.v1` | Executive | L0 | 15 | 5s |
| `cro.v1` | Executive | L1 | 20 | 5s |
| `growth.v4` | Revenue | L1 | 30 | 8s |
| `pricing.v1` | Revenue | L1 | 12 | 4s |
| `retention.v1` | Revenue | L2 | 10 | 4s |
| `operations.v1` | Ops | L2 | 10 | 3s |
| `support.v2` | Ops | L2 | 6 | 2s |
| `fraud.v3` | Security | L1 (block) | 3 | 120ms |
| `security.v1` | Security | L2 | 5 | 1s |
| `compliance.v1` | Security | L1 | 12 | 5s |
| `reliability.v1` | Platform | L2 | 25 | 2s |
| `auto_repair.v1` | Platform | L1 | 60 | 120s |
| `governance.v1` | Platform | L2 (demote) | 40/wk | 30s |
| `analyst.v2` | Data | L3 | 8 | 4s |
| `research.v1` | Data | L3 | 35 | 20s |
