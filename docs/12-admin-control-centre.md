# 12 — Admin Super Control Centre

## 12.1 Purpose

Total visibility, bounded control, complete accountability. The admin centre answers
three questions at any moment:

1. **What is happening right now?**
2. **What needs a human decision, ranked by cost of inaction?**
3. **Who did what, when, and can it be undone?**

**The governing constraint:** an administrator is the most powerful principal and
therefore the most dangerous. Every admin action is logged, most are reversible, and
none can alter the audit log. An admin who can silently edit history is not an
administrator — they are an unmitigated risk.

Current implementation: `/dashboard/superuser` with approvals, offline payments,
commissions and the ACU console. This document specifies the full build.

## 12.2 Overview — the situation panel

Live, never cached beyond 5 seconds.

| Metric | Detail |
| --- | --- |
| GMV | Today, 7d, 30d, with period-over-period delta |
| Take rate | Blended, by tier, trend |
| Active events | Published, on sale today, doors open now |
| Live scanning | Scans/minute, by event, error rate |
| Users | Total, new today, active 30d |
| Payment health | Success rate by provider, decline reasons |
| Error budget | Burn rate per SLO |
| Agent activity | Runs/hour, escalations open, ACU spend |
| Open incidents | By severity, with age |
| Cash position | Held funds, pending payouts, reserve |

**Held funds is deliberately prominent.** It is the platform's single largest
liability: money taken for events not yet delivered. If it is being paid out faster
than events complete, the platform is exposed, and that must be visible before it is a
problem.

## 12.3 Attention queue

The ranked list. Ordered by **cost of inaction in currency**, produced by
`chief_of_staff.v1` — not by recency or severity label.

| Item | Typical value | SLA |
| --- | --- | --- |
| Organiser application pending | Pipeline value | 24h |
| Offline payment awaiting verification | Ticket value | 12h |
| Fraud escalation | Transaction value | 15 min |
| Payout hold review | Held amount | 4h |
| Sanctions match | **Unbounded** | Immediate |
| Chargeback deadline approaching | Disputed amount | Scheme deadline − 24h |
| Agent escalation | Stated in the escalation | Per agent |
| SLO breach | Contractual exposure | Per severity |
| Support escalation | Churn risk × LTV | 8h |

**SLA breaches escalate automatically.** An item that ages past its SLA is promoted to
the top of the queue regardless of its monetary value, and a second breach pages the
platform owner. A queue that quietly grows is a queue nobody is accountable for.

## 12.4 User & organiser administration

| Capability | Detail |
| --- | --- |
| Search | Email, name, id, phone, payment reference |
| 360° view | Profile, events, tickets, payments, support history, agent runs, audit trail |
| Approve / deny organiser | With a mandatory reason, recorded |
| Suspend / reinstate | With a reason; suspension halts sales and payouts immediately |
| Role change | Audited; requires step-up auth |
| Commission override | Per organiser (already implemented) |
| Impersonate | Consented, 30-min expiry, banner, `acting_as` logged |
| Force password reset | Notifies the user |
| Reset MFA | Requires two admins — a single compromised admin must not be able to take over an account |
| Merge duplicates | Preserves both audit trails |
| GDPR export / erasure | One click, with the retained-data explanation generated |

**Dual control on MFA reset** is the only two-person requirement in the product, and it
exists because MFA reset is the single most powerful account-takeover primitive an
insider has.

## 12.5 Event administration

| Capability | Detail |
| --- | --- |
| Search & filter | Status, organiser, date, category, venue, GMV |
| Force unpublish | With a reason; notifies the organiser |
| Cancel event | Triggers automatic full refunds from held balance |
| Edit any field | Fully audited; the organiser is notified of the change |
| Transfer ownership | Organiser to organiser, with both parties notified |
| Inventory audit | Reconcile `sold` + `held` against issued tickets |
| Featured override | Grant or revoke placement |
| Content review | Flagged listings, with the reason |

**Cancelling an event is the highest-consequence admin action in the platform.** It
triggers refunds across every ticket holder and cannot be undone. It requires: a typed
confirmation of the event title, a mandatory reason, and it notifies the organiser and
every attendee within 60 seconds.

## 12.6 Financial administration

| Capability | Detail |
| --- | --- |
| Transaction search | Any field, any period, exportable |
| Refund | Any amount; above threshold requires a second approver |
| Payout approve / hold / release | With a reason |
| Reserve adjustment | Per merchant or organiser |
| Commission management | Global default and per-organiser (already implemented) |
| Reconciliation | Three-way: gateway ↔ ledger ↔ bank, with a discrepancy report |
| Chargeback management | Evidence, submission, outcome tracking |
| ACU grant | Per user, with a mandatory reason (already implemented) |
| Ledger inspection | Read-only, immutable, exportable |
| Manual adjustment | **Requires two approvers and a written justification** |

**Every financial write is dual-controlled above a threshold, and the ledger is
read-only to everyone including admins.** Corrections are made by posting a
compensating entry, never by editing history. This is standard double-entry
discipline and it is what makes the ledger admissible as evidence.

`OPEN` — set the dual-control threshold. Recommended £500. Owner: Finance.

## 12.7 Agent governance

The control surface for the AI layer, backed by `governance.v1`.

| Capability | Detail |
| --- | --- |
| Agent registry | Version, autonomy, budget, SLO, owner, last deploy |
| Autonomy control | Promote (human only) / demote (instant, one click) |
| Kill switch | Per agent, per principal, or global — takes effect within 5 seconds |
| Budget control | ACU ceilings per agent, per principal, per chain |
| Run inspector | Every invocation: inputs, outputs, tools, cost, decision, approver |
| Reversal | Undo any reversible agent action |
| Escalation queue | Approve, reject, or modify a proposed action |
| Quality sampling | Random output review, scored, feeding drift detection |
| Calibration | Projected vs actual outcome per agent — is it honest about its own accuracy? |
| Prompt versioning | Diff, rollback, per-agent history |
| Incident attribution | Which agent contributed to which incident |

### The global kill switch

One control disables the entire agent layer. It takes effect within 5 seconds and the
platform continues to function completely — every core journey (browse, buy, scan,
refund, payout) works with zero agents running.

**This is a hard architectural requirement, verified in CI by a test suite that runs
the full e2e path with the agent layer disabled.** If the platform cannot function
without agents, the agents are not an addition — they are a dependency, and a
dependency on a probabilistic system is not something to accept in a payments-adjacent
product.

### Calibration tracking

Every agent that makes a projection has it recorded alongside the actual outcome (see
`agent_memory.projectedOutcome` / `actualOutcome` in [08](./08-database-schema.md)).

| Agent | Projections | Mean error | Bias | Verdict |
| --- | --- | --- | --- | --- |
| `growth.v4` | 847 | 14% | +8% optimistic | Acceptable, monitor |
| `cro.v1` | 1,203 | 9% | −2% | Well calibrated |
| `pricing.v1` | 312 | 22% | +19% optimistic | **Review — over-promises** |

An agent that is systematically optimistic erodes trust faster than one that is
occasionally wrong. This table is the mechanism for catching it.

## 12.8 Platform operations

| Capability | Detail |
| --- | --- |
| Feature flags | Per environment, per cohort, per organiser |
| Deploy control | Trigger, monitor, roll back |
| Cache management | Purge by tag, by path, or globally |
| Rate-limit override | Temporary lift for a known-good partner |
| Maintenance mode | Per module — **never for scanning** |
| Queue management | Waiting-room admission rate for an on-sale |
| Connector health | Live status, circuit state, manual breaker reset |
| Job management | Cron status, manual trigger, failure inspection |
| Index management | Firestore index build status |

**Maintenance mode can never be applied to ticket scanning.** There is no legitimate
reason to take the door offline, and a control that permits it will eventually be used
by mistake at 19:45 on a Friday.

## 12.9 Analytics & reporting

| Report | Contents |
| --- | --- |
| Revenue | By line, by tier, by cohort, by period |
| Growth | Acquisition, activation, retention, referral, revenue |
| Organiser health | GMV, sell-through, churn risk, support load |
| Event performance | Sell-through distribution, no-show rate, scan rate |
| Payment | Success by provider, decline reasons, chargeback rate |
| Fraud | Blocked value, false-positive rate, loss rate |
| Agent | Runs, cost, approval rate, calibration, incidents |
| Infrastructure | Cost by service, per-transaction cost |
| Compliance | KYC completion, SARs, retention status, DSR turnaround |

**Every report is exportable and every export is logged.** Exports of personal data
require a stated purpose, which is recorded — that is the record a regulator asks for.

## 12.10 Audit & compliance

| Capability | Detail |
| --- | --- |
| Audit search | Actor, action, resource, period, IP |
| Immutability | Append-only, hash-chained, verifiable |
| Evidence pack | Signed, timestamped export for auditors |
| Access review | Who holds which privilege, with last-used dates |
| Retention monitor | Records approaching their deadline |
| DSR tracker | Access, rectification, erasure requests with SLA |
| Consent register | Per user, per purpose, versioned |
| Sub-processor register | With DPA status and review dates |

### Hash chaining

```
entry.hash = SHA256( previousEntry.hash ‖ canonicalJSON(entry) )
```

Any tampering breaks the chain and is detectable. The chain head is published daily to
an append-only external store, so tampering cannot be concealed even by someone with
full database access. This is what turns "we log everything" into a claim that can be
proven.

## 12.11 Admin security

Admins are the highest-value target on the platform. Controls are correspondingly
strict.

| Control | Requirement |
| --- | --- |
| MFA | Mandatory. No exemption, no exception |
| Session | 1 hour, sliding, revoked on privilege change |
| IP restriction | Optional allowlist per admin |
| Step-up | Required for financial, identity and role actions |
| Dual control | MFA reset, manual ledger adjustment, refunds above threshold |
| Action logging | **Every action, and every PII read** |
| Anomaly detection | `security.v1` watches admin behaviour specifically |
| Quarterly access review | Every privilege re-justified or removed |
| Break-glass | Emergency access, heavily logged, auto-expiring, alerts everyone |

**Privileges default to expiring.** An admin privilege granted for an incident is
time-boxed and lapses automatically. Standing privilege accumulates silently and is how
insider risk grows without anyone deciding to accept it.

## 12.12 Acceptance criteria

- Overview reflects reality within 5 seconds.
- Attention queue ranks by cost of inaction, and SLA breaches auto-escalate.
- Every admin action appears in the audit log within 1 second, with actor, before and
  after.
- The audit hash chain verifies; a tampering test detects modification.
- The global agent kill switch takes effect within 5 seconds, and full e2e tests pass
  with agents disabled.
- Dual control cannot be bypassed by any single account, including the platform owner.
- GDPR export completes within 30 seconds and contains every category listed in the
  privacy policy.
- Maintenance mode cannot be applied to scanning — verified by test.

---

## 12.13 Dispute Centre

| Capability | Detail |
| --- | --- |
| Active disputes | Every open chargeback, **ranked by response deadline**, not by value |
| Evidence packs | Assembled by `dispute.v1` (`03` §3.6): order, payment, delivery proof, scan record |
| Recommendation | Contest or accept, with the expected value of each |
| Submission | **Human, always.** The agent drafts; a person submits |
| Outcome tracking | Win rate by reason code, by organiser, by payment method |
| Organiser exposure | Chargeback rate per organiser, with escalation above threshold |

**Ranked by deadline, not by amount.** A £40 dispute expiring in six hours outranks a
£900 one with nine days left, because the second can still be won and the first cannot
once the window closes. Most chargebacks are lost by default, unanswered — sorting by
value is how that happens while everyone is busy.

`disputes_deadline_idx` (`08` §8.13c) is the query behind this screen.

**The strongest evidence a ticketing platform can produce is a scan.** It shows the
buyer received the goods and used them, which is exactly what a "goods not received"
reason code disputes. That evidence exists only because `scan_logs` retains refusals as
well as admissions.

---

## 12.14 API & Partner Management

| Capability | Detail |
| --- | --- |
| Key inventory | Every sandbox and live key, per partner, with last-used timestamp |
| Usage | Requests, error rate, p95 latency, quota consumed, per key |
| Webhook health | Delivery success, retry depth, endpoints failing beyond the retry window |
| Rate limits | Per-key override, time-boxed, with a reason recorded |
| Sandbox | Reset a partner's sandbox, replay historical webhook events |
| Revocation | Immediate, with the partner notified and the reason stated |

**Keys are shown by prefix and last four, never in full.** An admin console that can
redisplay a live secret turns every admin session into a credential store — and the
secret was already delivered once, at creation. If a partner has lost it, the answer is
rotation, not retrieval.

**Rate limit overrides expire.** A temporary lift granted during a partner's on-sale
becomes permanent the moment nobody remembers to remove it, and permanent overrides are
how a rate limit quietly stops existing. Every override carries an end date and a
reason.

**Webhook endpoints failing past the 24-hour retry window are disabled and the partner
is emailed**, rather than retried forever. An endpoint that has been dead for a week is
consuming delivery capacity for nothing.

---

## 12.15 Impersonation is not an admin capability

The source module list places *impersonate* under User Management, available to
platform administrators. **It is not, and `11` §11.15 footnote 3 sets the rule.**

| | Available to | Conditions |
| --- | --- | --- |
| Impersonation | **Support agents only** | Recorded user consent · time-boxed · every action attributed to the human |
| Admin equivalent | **Read-only user view** | Sees what the user sees; cannot act as them |

An administrator who can silently become a customer can place orders, change payout
destinations, read private data and accept terms — and the audit trail records the
*customer* doing it. The support flow exists precisely so the log names the right
person.

What admins actually need from this feature is *seeing what the user sees* while
diagnosing a complaint, and a read-only view delivers that without any of the risk. The
capability that was removed is the ability to **act**, which is the part nobody needs.

---

## 12.16 Module index

| # | Module | § |
| --- | --- | --- |
| 1 | Platform Intelligence — live GTV, ACU burn, active events, health score | 12.2 |
| 2 | Attention queue | 12.3 |
| 3 | User & organiser administration | 12.4 |
| 4 | Event administration | 12.5 |
| 5 | Financial administration & revenue intelligence | 12.6 |
| 6 | Agent governance & kill switch | 12.7 |
| 7 | Platform operations & system health | 12.8 |
| 8 | Analytics & reporting | 12.9 |
| 9 | Compliance Centre & audit | 12.10 |
| 10 | Admin security | 12.11 |
| 11 | **Dispute Centre** | 12.13 |
| 12 | **API & Partner Management** | 12.14 |

Twelve modules. The Transaction Monitor from the source list is not separate here — it
is the live feed inside Financial administration, because a fraud overlay and a manual
review queue that live on a different screen from the money they concern get checked
less often.
