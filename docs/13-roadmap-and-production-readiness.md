# 13 — Developer Roadmap & Production Readiness

## 13.1 Phasing principle

Each phase ends at a **commercially meaningful state**, not a technically interesting
one. A phase that ships nothing sellable is a phase that should have been part of the
previous one.

Every phase has an explicit **exit gate**. The gate is binary. No partial passes.

---

## Phase 1 — MVP ✅ COMPLETE

**Status:** shipped in this repository. `npm run build` produces 43 routes.

| Delivered | Detail |
| --- | --- |
| Catalogue | Search, 10 category groups / 47 subcategories, free/online/livestream filters, calendar view |
| Geolocation | Opt-in, expanding 10/20/30-mile radius; keyword search reaches worldwide |
| Ticketing | Multi-tier pricing, seat maps with lettered rows and auto seat labels |
| QR tickets | Single-use, event-bound, downloadable and printable |
| Check-in | Scoped per-event portal; no dashboard, customer or financial access |
| Payments | Stripe (form POST + 303), Bitripay, Congolese mobile money with 2% fee |
| Dashboards | Customer, organiser, platform admin |
| AI | Ad copy, recommendations, similar events — each with a deterministic fallback |
| ACU | 1 ACU = $0.01, provider cost × 4, 100 ACU welcome bonus, hard stop at zero |
| Security | Role-based Firestore rules blocking privilege escalation and ticket reuse |
| Demo mode | Runs with zero credentials against a seeded UK dataset |

**Exit gate — met:**
- ✅ Production build passes with zero errors.
- ✅ `tsc --noEmit` clean.
- ✅ Every route renders.
- ✅ Security rules deny privilege escalation and ticket reuse.

---

## Phase 2 — Beta (months 1–4)

**Objective:** run 50 real events, end to end, with real money and real doors.

### Engineering

| Workstream | Deliverable |
| --- | --- |
| **Ticket issuance via webhook** | Move issuance out of the client into the Stripe webhook using the Firebase Admin SDK. **The single most important item in this phase** — a user who closes the tab after paying must still get their ticket |
| **ACU ledger via Cloud Functions** | Wallet writes and admin grants move server-side; `wallet_ledger` becomes genuinely append-only |
| Notifications | SendGrid, Twilio, FCM. Transactional first, marketing second |
| Media uploads | Firebase Storage for event images, organiser branding, speaker photos |
| Inventory holds | 15-minute checkout window; sweeper releases expired holds |
| Counter sharding | 10 shards per tier — required before any on-sale exceeding 1 sale/second |
| Offline scanning | Pre-downloaded manifest, local validation, reconciliation on reconnect |
| Observability | Sentry, Cloud Monitoring, OpenTelemetry, SLO dashboards |
| Rules test suite | Every role × every collection, positive and negative — **blocking in CI** |
| Remove `/dev-access` | Delete or gate behind an allowlist plus a feature flag |

### Product

- Waitlist with auto-offer on refund.
- Ticket transfer (named, re-issues the code, voids the original).
- Refund workflow with the authority ladder.
- Apple and Google Wallet passes.
- Email campaign builder for organisers.

### Exit gate

- [ ] 50 real events completed with real ticket sales.
- [ ] Zero ticket-issuance failures across the full period.
- [ ] Scan p95 < 200ms measured at a real door, on real venue wifi.
- [ ] Offline scanning verified at a live event with the network deliberately cut.
- [ ] Rules test suite green and blocking.
- [ ] Sentry error rate < 0.1% of sessions.
- [ ] `/dev-access` removed from production.

---

## Phase 3 — Commercial launch (months 5–10)

**Objective:** open self-serve signup, launch the agent layer at L1, become a payment
facilitator.

### Engineering

| Workstream | Deliverable |
| --- | --- |
| **Agent control plane** | Orchestrator, policy engine, memory (4 layers), escalation queue, transcript |
| **First five agents at L1** | `chief_of_staff`, `analyst`, `cro`, `growth`, `support` |
| **Governance agent** | Registry, promotion/demotion, budgets, drift, calibration |
| **Global kill switch** | Plus e2e tests proving the platform works with agents disabled |
| KYC/KYB | Sumsub, ComplyAdvantage — triggered by payout and volume thresholds |
| Payout automation | Stripe Connect, risk-tiered holds, reserves |
| BitriPay gateway | Merchant onboarding, API, webhooks, settlement engine |
| Public API v1 | OpenAPI 3.1, three SDKs, sandbox, developer portal |
| Semantic search | Embeddings, vector index, personalised ranking |
| Seat map editor | Canvas-based drag-and-drop, copy/paste, per-seat colour and status |
| Live streaming | Mux ingest, HLS delivery, token auth, chat, VOD |
| Tax | Avalara integration, VAT/GST by jurisdiction |
| Multi-region | Failover, tested quarterly |

### Commercial

- Subscription plans live (Free / Starter / Professional / Business).
- Promotional auction for oversubscribed placement inventory.
- Partner programme launched.

### Exit gate — **blocking legal item first**

- [ ] **Payment facilitator legal position signed off, signatory named and dated.**
      No external merchant is onboarded before this. Non-negotiable, not waivable by
      engineering.
- [ ] MLRO appointed.
- [ ] Penetration test passed; all high and critical findings remediated.
- [ ] Agent approval rate ≥ 90% at L1 across ≥ 500 invocations.
- [ ] Zero cross-tenant data leaks in the red-team exercise.
- [ ] Kill switch verified: full e2e suite passes with agents disabled.
- [ ] 99.9% uptime over 90 days.
- [ ] 500 active organisers.

---

## Phase 4 — Enterprise (months 11–18)

**Objective:** win contracts above £1m GMV. Enterprise procurement is a checklist, and
this phase is about passing it.

| Workstream | Deliverable |
| --- | --- |
| White label | Custom domain, full branding, isolated data |
| SSO | SAML 2.0, SCIM provisioning |
| Advanced RBAC | Custom roles, granular permissions, delegated admin |
| SLA | 99.99% with credits, contractual |
| Data residency | EU-only and UK-only deployment options |
| CMEK | Customer-managed encryption keys |
| Audit export | SIEM integration (Splunk, Datadog) |
| Agent promotion | Marketing, support and ops agents to L2 |
| Custom agents | Enterprise-specific agents with bespoke tools |
| Advanced forecasting | ML models on real historical data, replacing heuristics |
| Multi-party revenue share | Organiser / venue / promoter / artist splits |
| Salesforce & Workday | Enterprise system integration |

### Exit gate

- [ ] SOC 2 Type II achieved.
- [ ] ISO 27001 certified.
- [ ] Three enterprise contracts signed, each > £1m annual GMV.
- [ ] 99.99% uptime over 90 days.
- [ ] Agent L2 running for 90 days with zero Sev-1 attributions.
- [ ] 4,000 active organisers, £45m GMV.

---

## Phase 5 — Global scale (months 19–36)

**Objective:** multi-region, multi-currency, multi-language, autonomous operations.

| Workstream | Deliverable |
| --- | --- |
| Multi-region | EU, UK, US, Africa — active-active |
| Localisation | 12 languages, RTL support, local date and currency formats |
| Regional payment rails | Per-market, prioritised by addressable GMV |
| Regional compliance | Per-jurisdiction KYC, tax, consumer law |
| `auto_repair` at L1 | PRs opened automatically, **always human-reviewed** |
| `reliability` at L2 | Autonomous runbook execution |
| Predictive scaling | Pre-warm from the on-sale calendar |
| Marketplace | Services, sponsors, venues |
| Mobile apps | Native iOS and Android for attendees and door operators |
| Data products | k-anonymised market intelligence |

### Exit gate

- [ ] £200m GMV.
- [ ] 15,000 active organisers.
- [ ] > 60% of P3 incidents resolved by agents without a human.
- [ ] Sub-200ms p95 scan latency in every region.
- [ ] Zero critical security findings across two consecutive annual pen tests.

---

## 13.2 Team shape

| Phase | Eng | Product | Design | Data/AI | Ops | Commercial | Total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 ✅ | 2 | 1 | 1 | 0 | 0 | 0 | 4 |
| 2 | 5 | 1 | 1 | 1 | 1 | 1 | 10 |
| 3 | 10 | 2 | 2 | 3 | 2 | 4 | 23 |
| 4 | 18 | 4 | 3 | 5 | 4 | 10 | 44 |
| 5 | 32 | 7 | 5 | 9 | 8 | 22 | 83 |

**Critical hires, in order:**
1. **Payments/compliance engineer** (Phase 2) — the facilitator work gates Phase 3.
2. **MLRO** (Phase 3) — legally required, and the gate is blocking.
3. **SRE** (Phase 3) — 99.9% is not achievable without someone accountable for it.
4. **AI/ML engineer** (Phase 3) — the agent layer needs an owner, not a volunteer.

---

## 13.3 Technical debt register

Carried from Phase 1, each with an owner and a phase.

| # | Debt | Impact | Phase |
| --- | --- | --- | --- |
| D1 | Ticket issuance in the client, not the webhook | **High** — a closed tab loses a ticket | 2 |
| D2 | ACU ledger writes from the client | **High** — the ledger is not truly append-only | 2 |
| D3 | `/dev-access` role switcher in production | **Critical** — privilege escalation | 2 |
| D4 | `picsum.photos` placeholder images | Medium — unprofessional | 2 |
| D5 | No inventory holds; oversell possible under load | **High** | 2 |
| D6 | Tier counters unsharded | High at on-sale | 2 |
| D7 | No offline scanning | High — total outage stops a door | 2 |
| D8 | Coupon validation client-side | Medium — enumerable by an authenticated user | 3 |
| D9 | Seat map is a preview, not an editor | Medium — competitive gap | 3 |
| D10 | No rules test suite | **High** — authorisation is untested | 2 |

**D1, D2, D3, D5 and D10 are Phase 2 blockers.** None of them is a feature; all of
them are correctness or security.

---

## 13.4 Production readiness review

The checklist every phase passes before it ships. No item is optional.

### Functionality
- [ ] Every user journey tested end to end, on real devices.
- [ ] Error states designed and implemented — not left to a default.
- [ ] Empty states designed.
- [ ] Loading states with skeletons, no layout shift.
- [ ] Offline behaviour defined for every critical path.

### Reliability
- [ ] SLOs defined with error budgets.
- [ ] Alerting on burn rate, not raw thresholds.
- [ ] Runbooks written for every alert.
- [ ] On-call rota with escalation.
- [ ] Chaos test: kill each dependency, verify degradation.
- [ ] Load test at 10× projected peak.

### Security
- [ ] Rules test suite green and blocking.
- [ ] Pen test passed; high and critical findings remediated.
- [ ] Dependency scan clean.
- [ ] Secrets in Secret Manager, none in code or config.
- [ ] CSP enforced without `unsafe-inline` for scripts.
- [ ] Rate limits on every public endpoint.
- [ ] Prompt injection suite passing.

### Data
- [ ] Backups configured and a restore drilled.
- [ ] RPO and RTO verified, not assumed.
- [ ] Retention policy implemented as a scheduled job.
- [ ] GDPR export and erasure working.
- [ ] Migrations reversible.
- [ ] Denormalisation register reconciled nightly.

### Performance
- [ ] p95 within SLO for every endpoint.
- [ ] Core Web Vitals green on the catalogue and event pages.
- [ ] Bundle size within budget.
- [ ] Database queries indexed; no collection scans.
- [ ] Cache strategy documented, with correct invalidation.

### Compliance
- [ ] Privacy policy accurate to what the code actually does.
- [ ] Terms of service reviewed by counsel.
- [ ] Cookie consent implemented.
- [ ] Accessibility audit passed (WCAG 2.2 AA).
- [ ] DPAs signed with every sub-processor.

### AI
- [ ] Every agent has all nine contract fields specified.
- [ ] Autonomy levels set and enforced by the policy engine.
- [ ] Budgets configured as hard ceilings.
- [ ] Golden-set evaluations passing in CI.
- [ ] Kill switch verified within 5 seconds.
- [ ] **Full e2e suite passes with the agent layer disabled.**
- [ ] Calibration tracking live.

### Operational
- [ ] Monitoring dashboards built.
- [ ] Statuspage configured.
- [ ] Support runbooks written.
- [ ] Incident severity matrix agreed.
- [ ] Postmortem template and blameless process in place.

---

## 13.5 Immediate next actions

The ordered list for whoever picks this up on Monday.

| # | Action | Owner | Why first |
| --- | --- | --- | --- |
| 1 | Provision the Firebase project; set `NEXT_PUBLIC_FIREBASE_*` | Eng | Everything else is blocked on it |
| 2 | Deploy `firestore.rules` and `firestore.indexes.json` | Eng | Authorisation must exist before real data |
| 3 | Write the rules test suite and make it blocking in CI | Eng | D10 — authorisation is currently untested |
| 4 | Move ticket issuance into the Stripe webhook (Admin SDK) | Eng | D1 — the highest-impact correctness bug |
| 5 | Move ACU ledger writes into Cloud Functions | Eng | D2 — the ledger is not yet append-only |
| 6 | Remove `/dev-access` from the production build | Eng | D3 — privilege escalation |
| 7 | Implement inventory holds and the expiry sweeper | Eng | D5 — oversell is possible today |
| 8 | Configure Sentry and Cloud Monitoring | Eng | You cannot fix what you cannot see |
| 9 | Replace placeholder imagery; wire Storage uploads | Product | D4 — first-impression quality |
| 10 | Engage counsel on payment facilitator status | Legal | Long lead time; gates Phase 3 |

**Items 3–7 are correctness and security, not features.** They ship before anything
new is built on top of them, because every feature added first makes them more
expensive to fix.

---

## 13.6 Commercial targets per phase, and one correction

### Deliverables by area

| Area | Phase 1 (MVP) | Phase 2 (Beta) | Phase 3 (Commercial) |
| --- | --- | --- | --- |
| Core | Next.js, NestJS, PostgreSQL, Kong, auth | — | — |
| Event engine | Self-serve creation, tiers, Stripe checkout, QR | Seat map builder, dynamic pricing per section | Discovery marketplace |
| Entry | Scan validation, one-time, offline sync | Wallet passes, multi-gate | — |
| Roles | Super admin, organiser, customer | Venue, promoter, host, gate staff | All 13 |
| Payments | Stripe, payouts, refunds | BitriPay mobile money, CDF, KODA verification | Multi-party splits |
| Hospitality | — | Package builder, deposits, VIP check-in | Concierge, CRM |
| Marketing | — | SendGrid, abandoned cart, WhatsApp | Full attribution |
| Agents | `support.v2`, `pricing.v1` | `growth.v4`, `fraud.v3`, `onboarding.v1`, `gate_intelligence.v1` | **All 28**, ACU billing, Command Centres |
| Compliance | — | KYB automation | Full GDPR tooling, AML, PCI SAQ-A |
| API | — | — | Developer portal, SDKs, webhook tester |
| White label | — | — | First deployment |

### The commercial targets need one word changed

| Phase | Organisers | Stated as MRR | Tickets | Implied per organiser |
| --- | --- | --- | --- | --- |
| 1 | 10 | £5,000 | 1,000 | **£500/month** |
| 2 | 50 | £25,000 | 25,000 | **£500/month** |
| 3 | 250 | £100,000 | 500,000 | **£400/month** |

**Those figures are not achievable as subscription MRR.** The published tier ladder tops
out at £299 (`10` §10.3) or £149 in the alternative model, so £400–£500 per organiser
per month cannot come from subscriptions unless nearly everyone is on an enterprise
contract from launch — which contradicts a self-serve strategy.

The numbers are entirely achievable as **total monthly revenue**. Working Phase 3
backwards:

```
500,000 tickets over the phase ≈ 40,000/month at steady state
40,000 × £30 average face value          = £1,200,000 GMV/month
  commission at 5%                       =    £60,000
  subscriptions, 250 orgs, mixed tiers   =    £22,000
  promotion, placement, ACU, gateway     =    £18,000
──────────────────────────────────────────────────────
Total monthly revenue                    =   £100,000  ✓
```

The target is right. The label is wrong.

### Why the distinction is worth a paragraph

MRR means **contracted recurring subscription revenue** and nothing else. It is the
number investors and boards use to value a business, precisely because it is the
revenue that arrives next month whether or not anyone sells a ticket.

Reporting £100,000 of mostly-transactional revenue as MRR overstates the durable part by
roughly 4.5×. Somebody will eventually run the tier ladder against the organiser count,
find it cannot reconcile, and stop trusting the rest of the model — which is expensive
in exactly the room where these numbers get used.

**Restated, and adopted:**

| Phase | Organisers | **Subscription MRR** | **Total monthly revenue** | Tickets |
| --- | --- | --- | --- | --- |
| 1 | 10 | ~£300 | £5,000 | 1,000 |
| 2 | 50 | ~£4,000 | £25,000 | 25,000 |
| 3 | 250 | ~£22,000 | £100,000 | 500,000 |
| 4 | 1,000 | ~£120,000 | £450,000 | 2,000,000 |
| 5 | 4,000 | ~£600,000 | £2,000,000 | 10,000,000 |

Both columns are tracked. **Subscription MRR is the health metric**, because it is the
one that says whether organisers keep choosing to be here when they are not selling.

---

## 13.7 Phase 4 — Enterprise & global scale, with three decisions to take

| Deliverable | Status |
| --- | --- |
| Enterprise contracts — UK stadiums, African promoters, conference groups | Aligned |
| NFC wristbands for cashless events | Aligned — `08` §8.10 `nfc_tag_id` exists |
| Pan-African expansion — Nigeria, Kenya, South Africa, Ivory Coast | Aligned, per-market KYC and rails |
| Cross-event loyalty and tier rewards | Aligned — `04` M20 |
| **Fan-to-fan resale marketplace** | **Contradicts `01` §1.7** — see below |
| **NFT collectibles** | Needs a decision — see below |
| **Licensing fan insights to brands** | Needs a boundary — see below |

---

### Decision 1 — resale contradicts a stated non-goal

`01` §1.7 says plainly: *not a secondary marketplace. Resale is a fraud surface and a
brand risk. Transfer is supported; profit-taking resale is not.*

Phase 4 proposes exactly that marketplace. One of the two has to change, and the choice
is a strategic one rather than a technical one — so it is stated rather than quietly
resolved.

**There is a version that keeps both.** The non-goal is aimed at *profit-taking*
resale, not at a fan who genuinely cannot attend:

| | Capped resale | Open secondary market |
| --- | --- | --- |
| Price ceiling | **Face value + original fees** | Whatever the market pays |
| Who profits | Nobody | Touts |
| Platform commission | Small, on the transaction | Large, on the markup |
| Anti-tout positioning (`01` §1.3, DICE) | **Preserved** | Abandoned |
| UK regulatory exposure | Low | Significant |

Capped resale is a fan-protection feature. Open resale is the business model the
platform's own market analysis criticises Ticketmaster for, and adopting it would make
the fee-transparency argument in `10` §10.2 impossible to make with a straight face.

**Regulatory note.** UK resale is regulated: the Consumer Rights Act 2015 requires
seat, row and restriction disclosure on resale listings, and the Breaching of Limits on
Ticket Sales Regulations 2018 criminalises bulk automated purchase. Ireland caps resale
at face value outright. Several markets in the expansion list have their own positions.

**Recommendation: capped resale at face value, in-platform, with the original ticket
invalidated and a new one issued.** That is technically the transfer mechanism already
specified (`08` §8.10 `transferred_to`) with a payment attached, so it is weeks of work
rather than a new product — and it closes the fraud surface that off-platform resale
opens, because a ticket sold on a classifieds site is a scam we currently cannot stop.

`OPEN`. Owner: whoever owns strategy. Blocking before any resale UI is designed.

---

### Decision 2 — NFT collectibles, scoped or not at all

| Framing | Risk |
| --- | --- |
| **Commemorative only** — no resale value implied, no marketplace, no floor price | Low. It is a digital stub |
| **Tradeable asset** — marketplace, royalties, floor price | High. Consumer-protection and possibly financial-promotion exposure |

The second framing turns a ticket platform into an issuer of speculative assets to
consumers, which is a different regulated activity in most of the markets listed and a
reputational position the platform would be taking on permanently.

**Recommendation: commemorative only, or not at all.** A landmark-event collectible
that a fan keeps is a nice thing. A collectible with a floor price is a financial
product, and the people most likely to buy it are the Gen-Z audience `04` M26 targets —
which makes getting it wrong worse, not better.

Also worth saying: this is the item on the roadmap most likely to look dated by the time
Phase 4 arrives. It should be re-tested against demand before it is built, not assumed.

---

### Decision 3 — licensing fan insights needs a hard boundary

*Organisers licence anonymised fan data insights to brands, with consent.*

This is workable, and it is one careless implementation away from being the thing
`01` §1.3 criticises Fever for. The boundary that makes it safe:

| Permitted | Never |
| --- | --- |
| Aggregate statistics, k-anonymised at 25 (`04` M19) | Individual records, however hashed |
| Trends, cohorts, category affinity | Contact details, in any form |
| Consented leads, where the fan explicitly opted in **to that brand** | Consent inferred from a ticket purchase |
| Organiser's own audience | Another organiser's audience |

**"Anonymised" is a high bar under GDPR and is usually claimed wrongly.** Data that can
be re-identified by combining it with anything else is *pseudonymised*, not anonymised,
and it remains personal data with every obligation attached. A dataset of "attendees of
this event, by postcode district and age band" is re-identifiable at small event sizes —
which is precisely why the k-anonymity floor exists and why it must apply here too.

**Consent must be specific.** A checkbox at ticket purchase saying "we may share
insights with partners" is not a lawful basis for licensing that person's behaviour to a
named brand. Consent has to name the purpose and be as easy to withdraw as to give.

**Recommendation: aggregate-only licensing, no lead sales without per-brand opt-in.**
The revenue is smaller and it is the only version that survives a regulator reading it.

---

### Phase 4 commercial goal, restated

Applying the correction in §13.6 — 2,000 organisers at £1m would be £500 each, which the
tier ladder cannot produce:

| | Stated | Restated |
| --- | --- | --- |
| Organisers | 2,000+ | 2,000+ |
| MRR | £1m+ | **~£240,000 subscription MRR** |
| Total monthly revenue | — | **~£1,000,000** |
| Tickets | 10m/year | 10m/year |

The £1m figure is right as total monthly revenue. It is not MRR, and the distinction is
the one a board will check first.
