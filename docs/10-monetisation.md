# 10 — Monetisation Model

## 10.1 Revenue architecture

Eight distinct lines. The design goal is that **no single line exceeds 40% of revenue
by year three** — a platform dependent on one line is priced by whoever controls that
line.

| # | Line | Type | Gross margin | Year-3 target |
| --- | --- | --- | --- | --- |
| 1 | Ticket commission | Transactional | 85% | 38% |
| 2 | Subscription plans | Recurring | 92% | 22% |
| 3 | Promotion & placement | Transactional | 88% | 12% |
| 4 | BitriPay gateway spread | Transactional | 65% | 10% |
| 5 | AI credits (ACU) | Usage | 67% | 6% |
| 6 | API & developer platform | Recurring + usage | 90% | 5% |
| 7 | White label & enterprise | Contract | 78% | 5% |
| 8 | Marketplace & data | Transactional | 82% | 2% |

## 10.2 Line 1 — Ticket commission (`LIVE`)

Already implemented: global default with per-organiser override
(`DEFAULT_COMMISSION_PERCENT`, `DEFAULT_ADMIN_FEE`, overridable in the admin console).

| Tier | Commission | Admin fee | Qualification |
| --- | --- | --- | --- |
| **Standard** | 5.0% | £0.50 | Default |
| **Growth** | 4.0% | £0.40 | > £50k annual GMV |
| **Scale** | 3.0% | £0.30 | > £250k annual GMV |
| **Enterprise** | Negotiated | Negotiated | > £1m annual GMV |
| **Free events** | 0% | £0.00 | Acquisition — free events bring paying attendees |

**Who pays** is the organiser's choice, exposed at checkout:
- *Absorb* — the organiser takes it from their margin, the fan sees a clean price.
- *Pass on* — added as a visible line, labelled "Booking fee".

**Fees are always itemised at checkout, never bundled into the headline price.**
Hidden fees are the single most-complained-about characteristic of incumbent
ticketing, and being visibly different is worth more than the marginal conversion.

**Unit economics per £50 ticket, Standard tier:**

```
Face value                          £50.00
Commission 5%                        £2.50
Admin fee                            £0.50
─────────────────────────────────────────
Platform gross                       £3.00
  Payment processing (1.4% + 20p)   −£0.90
  Infrastructure                    −£0.05
  Support (allocated)               −£0.10
─────────────────────────────────────────
Platform net                         £1.95   (65% margin on gross)
```

## 10.3 Line 2 — Subscription plans (`NEW`)

Commission alone under-monetises high-volume organisers, who are precisely the
customers with the highest switching cost and the lowest support burden. Subscriptions
convert them to predictable revenue.

| Plan | £/month | Includes | Commission |
| --- | --- | --- | --- |
| **Free** | £0 | 1 event live, basic analytics, 100 ACU/mo | 5% + £0.50 |
| **Starter** | £29 | 5 events, full analytics, email tools, 500 ACU/mo | 4.5% + £0.40 |
| **Professional** | £99 | Unlimited events, seat editor, agents at L1, 2,000 ACU/mo, API | 3.5% + £0.30 |
| **Business** | £299 | Multi-user, promoter portal, agents at L2, 10,000 ACU/mo, priority support | 2.5% + £0.20 |
| **Enterprise** | From £1,500 | White label, SSO, SLA, dedicated CSM, custom agents | Negotiated |

**The subscription buys a lower take rate.** The organiser's decision is arithmetic,
not persuasion: at £99/month, Professional beats Free above roughly £6,600 monthly
GMV. Publishing that break-even openly converts better than obscuring it, because the
organisers who cross it are exactly the ones worth keeping.

## 10.4 Line 3 — Promotion & placement (`LIVE`)

Already implemented in the organiser promotions page.

| Product | Price | Duration | Inventory |
| --- | --- | --- | --- |
| Homepage video ad | £249 | 7 days | 3 concurrent slots |
| Featured event | £149 | 7 days | 9 concurrent slots |
| Newsletter spotlight | £99 | Single send | 4 per newsletter |
| Category takeover | £499 | 7 days | 1 per category |
| Push notification | £199 | Single send | 2 per user per week |

**Inventory is deliberately scarce.** Three video slots, not thirty. Scarcity sustains
price and protects the user experience; an ad-saturated homepage destroys the
discovery product that makes the ads valuable in the first place.

**Auction model (Phase 4):** second-price auction with a reserve, for oversubscribed
slots. Second-price removes the incentive to shade bids and typically raises yield
15–25% over fixed pricing.

## 10.5 Line 4 — BitriPay gateway spread (`NEW`)

Full specification in [05](./05-bitripay-gateway.md).

```
Merchant pays        2.4% + £0.20
BitriPay wholesale   1.6% + £0.10
────────────────────────────────
Spread               0.8% + £0.10
```

At £10m processed: £80,000 spread + £100,000 fixed = **£180,000 gross**, against
near-zero marginal infrastructure cost because the rails already exist for our own
checkout.

**Strategic value beyond the revenue:** every merchant integrated with our gateway is
a distribution channel for the events platform, and switching a payment gateway is
among the highest-friction changes a business ever makes.

## 10.6 Line 5 — AI credits, ACU (`LIVE`)

Already implemented: `ACU_USD_RATE`, `MARKUP_MULTIPLIER`, `TOPUP_PACKAGES_USD`,
`WELCOME_BONUS_ACU`.

| Parameter | Value |
| --- | --- |
| Unit | 1 ACU = $0.01 |
| Markup | Provider cost × 3 |
| Welcome bonus | 100 ACU ($1), once, at account creation |
| Top-up packages | $3 / $6 / $9 |
| Included allowance | Per subscription plan (see §10.3) |
| Behaviour at zero | Hard stop. Balance can never go negative |

**Why 3×, specifically:** it covers the provider cost, the orchestration and retry
overhead (typically 1.4× raw provider cost once retries and multi-step chains are
counted), the memory and vector infrastructure, and leaves a real margin. It is also
low enough that the value of a single decision vastly exceeds its price, which is what
keeps usage growing.

**Why a hard stop rather than an overdraft:** an AI feature that silently keeps
spending is the fastest route to a shock invoice and a churned customer. A hard stop
with a visible balance and a one-click top-up is a better product and a better
business.

**Margin:**
```
100 ACU sold ($1.00)
  Provider cost at 3× markup           −$0.33
  Orchestration overhead (~0.4×)       −$0.13
  Infrastructure (vector, memory)      −$0.07
──────────────────────────────────────────────
Net                                     $0.47   (47% margin)
```

## 10.7 Line 6 — API & developer platform (`NEW`)

| Tier | £/month | Requests/mo | Rate limit | Support |
| --- | --- | --- | --- | --- |
| Sandbox | £0 | Unlimited (sandbox) | 60/min | Community |
| Free | £0 | 10,000 | 120/min | Community |
| Growth | £99 | 250,000 | 600/min | Email, 48h |
| Scale | £499 | 2,000,000 | 3,000/min | Email, 8h |
| Enterprise | From £2,000 | Negotiated | Negotiated | Dedicated, SLA |

Overage: £0.40 per 1,000 requests above the included allowance, billed monthly.

## 10.8 Line 7 — White label & enterprise (`NEW`)

| Product | Price | Includes |
| --- | --- | --- |
| White label | From £2,500/mo | Custom domain, full branding, isolated data, SSO |
| Enterprise events | From £5,000/mo | Dedicated infra, 99.99% SLA, custom agents, CSM |
| Venue licence | From £1,500/mo | Multi-organiser venue instance, house-wide analytics |
| Implementation | £10,000–£75,000 | Migration, integration, training |

Enterprise contracts are annual, paid in advance. That prepayment funds the
infrastructure the contract commits to.

## 10.9 Line 8 — Marketplace & data (`NEW`)

| Product | Model |
| --- | --- |
| Service marketplace | 12% of the transaction value |
| Sponsor marketplace | 15% of the placement value |
| Market intelligence reports | £499–£4,999 per report |
| Anonymised benchmarks | Included in Business and above; £199/mo standalone |

**The data boundary, stated once and enforced everywhere:** we sell **aggregated,
k-anonymised (k ≥ 5) market intelligence**. We never sell, rent or share personal
data, contact lists, or any record identifying an individual attendee. This is not a
policy that gets revisited when revenue is tight — it is a condition of the platform's
existence, and the moment it is breached the organiser trust that makes everything
else work is gone.

## 10.10 Line 9 — Ancillary event revenue (`NEW`)

The unified revenue engine promised in `01` §1.2. An event sells more than admission,
and every one of these is currently transacted somewhere the platform cannot see —
cash at a merchandise table, a separate parking app, a sponsor invoice raised by email.

| Stream | Model | Take | Why it belongs here |
| --- | --- | --- | --- |
| **Merchandise** | Pre-order at checkout, collect at venue | 5% | Attaches to a ticket that already exists; no new payment relationship |
| **F&B vouchers** | Prepaid credit redeemed at the bar | 4% | Cuts queue time, and prepaid spend exceeds cash spend |
| **Parking** | Inventory with capacity, sold as a tier | 8% | Genuinely scarce; capacity management is what we already do |
| **Sponsorship activation** | Sponsor pass issuance, exposure reporting | Flat fee per activation | The sponsor actor (`02` §2.1) needs measurable delivery |
| **Hospitality upsell** | Package upgrade after purchase | Commission on the uplift | The highest-margin line on this table |

### Why these are one engine and not five integrations

Each is **the same object with a different label**: an inventory item with a price, a
quantity, a holder and a redemption event. Parking is a tier with 400 units. A
merchandise pre-order is a tier redeemed at a different gate. An F&B voucher is a
redemption against a balance.

`08` models this directly — `ticket_types` carries `is_hospitality`, and the same
pattern extends to any ancillary type without a new table. The alternative, a bespoke
schema per stream, is how platforms end up with five reconciliation processes and no
single view of what an event earned.

**The organiser sees one settlement.** That is the whole product claim: not that we
sell parking, but that ticket, package, voucher and parking revenue land in one
statement with one commission calculation, computed by `settle()`.

### Sequencing

Ancillary revenue is **Phase 3**, not Phase 2. It depends on the `orders` model
(`08` §8.9), which does not exist until the PostgreSQL cutover in `19` completes — a
basket containing a ticket and a parking space is exactly the multi-item order the
current schema cannot represent.

---

## 10.11 Dynamic pricing engine (`NEW`)

Applies to **platform-owned inventory only**: promotional placements, API overage and
ACU packages. It does **not** set organisers' ticket prices — `pricing.v1` only
recommends there, at L1, and a human decides.

| Input | Effect |
| --- | --- |
| Demand vs inventory | Placement price ±30% |
| Seasonality | Festival season commands a premium |
| Customer LTV | Loyalty discount for high-tenure organisers |
| Competitive rate | Floor protection |
| Elasticity estimate | Optimise for revenue, not volume |

**Guardrails:**
- Maximum 30% variance from list price.
- Never raise the price a specific customer sees after they have viewed it — that is
  a dark pattern and it is prohibited.
- Every dynamic price is explainable in one plain sentence to the customer.

## 10.12 Customer lifetime value

| Segment | Monthly GMV | Take | Monthly net | Avg tenure | LTV | CAC | LTV:CAC |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Hobbyist | £500 | 5.5% | £28 | 8 mo | £224 | £45 | 5.0 |
| Semi-pro | £3,000 | 5.0% | £150 | 18 mo | £2,700 | £280 | 9.6 |
| Professional | £15,000 | 4.2% | £630 | 34 mo | £21,420 | £1,900 | 11.3 |
| Enterprise | £120,000 | 3.1% | £3,720 | 52 mo | £193,440 | £22,000 | 8.8 |

**The strategic read:** Professional has the best LTV:CAC ratio, so it is where sales
and product investment concentrate. Hobbyist clears the 3.0 bar and must stay
self-serve — the moment it needs human touch, it stops being profitable.

## 10.13 Churn prevention

`retention.v1` (see [03](./03-agent-architecture.md)) scores churn and selects the
cheapest effective intervention.

| Signal | Churn lift | Intervention | Cost |
| --- | --- | --- | --- |
| No event published in 60 days | +180% | Re-engagement + free placement | £149 |
| Sell-through < 40% on last event | +140% | Growth agent audit + credit | £50 |
| Support ticket unresolved > 72h | +220% | Human account manager | £120 |
| Payout delayed or disputed | +310% | Immediate human contact | £200 |
| Competitor event listed same week | +90% | Proactive benchmark report | £0 |

**Intervention economics:** spending £200 to retain a Professional organiser with a
£21,420 LTV is a 107× return. This is why churn work outranks acquisition work at
almost every stage — and why the agent that does it needs a real budget, not a
token one.

## 10.14 Upsell & cross-sell

| Trigger | Offer | Conversion |
| --- | --- | --- |
| Free plan, 2nd event created | Starter, first month free | 22% |
| Starter, > £6,600 monthly GMV | Professional (break-even shown openly) | 34% |
| ACU exhausted twice in a month | Larger top-up or a plan upgrade | 41% |
| Event sold out early | Featured placement on the next event | 28% |
| Sell-through < 50% | Growth campaign credit | 19% |
| API used > 80% of quota | Next API tier | 46% |

Every offer is triggered by a **fact about the customer's own usage**, not by a
calendar. "You hit your ACU limit twice this month" converts; "It's been 30 days"
does not.

## 10.15 Three-year model

| Metric | Year 1 | Year 2 | Year 3 |
| --- | --- | --- | --- |
| Active organisers | 500 | 4,000 | 15,000 |
| GMV | £4m | £45m | £200m |
| Blended take rate | 5.2% | 4.6% | 4.1% |
| Commission revenue | £208k | £2.07m | £8.2m |
| Subscription revenue | £42k | £780k | £4.8m |
| Promotion revenue | £31k | £420k | £2.6m |
| Gateway revenue | £0 | £180k | £2.2m |
| ACU revenue | £18k | £210k | £1.3m |
| API revenue | £0 | £95k | £1.1m |
| Enterprise revenue | £0 | £180k | £1.1m |
| Marketplace revenue | £0 | £45k | £430k |
| **Total revenue** | **£299k** | **£3.98m** | **£21.7m** |
| Gross margin | 71% | 79% | 84% |

**Margin expands with scale** because the fixed costs — infrastructure, the agent
layer, compliance — are amortised across a growing base, and because the mix shifts
toward higher-margin recurring lines.

**No single line exceeds 40% by year three.** That was the design constraint in §10.1,
and the model satisfies it.

## 10.16 Pricing principles

1. **Transparent.** Every fee is itemised and named. No hidden costs, ever.
2. **Aligned.** We earn when organisers earn. Commission means we lose money on a
   failed event, which is the correct incentive.
3. **Predictable.** Subscriptions cap the variable cost for organisers who need to
   budget.
4. **Fair.** Free events cost nothing. Charging a charity to run a free volunteer day
   is a rounding error in revenue and a material cost in reputation.
5. **Defensible.** Every price is justifiable in one plain sentence to the customer
   paying it. If it cannot be, it is the wrong price.
