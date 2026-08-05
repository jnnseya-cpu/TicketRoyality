# 11 — Security, Compliance & Risk

## 11.1 Zero-trust model

**Never trust, always verify.** Every request is authenticated, authorised and logged,
regardless of origin. There is no trusted internal network.

| Principle | Implementation |
| --- | --- |
| Identity is the perimeter | Every request carries a verifiable identity; no IP allowlist substitutes for auth |
| Least privilege | Scopes are granted narrowest-first; widening requires explicit action |
| Assume breach | Segmentation, short-lived credentials, blast-radius limits |
| Verify explicitly | Authority re-checked at execution, not only at plan time |
| Continuous validation | Session risk is re-scored on every privileged action |

**The rule that has already shaped this codebase:** authorisation lives in
`firestore.rules`, not in React. A client-side guard is a UX affordance. If the rules
would allow it, the platform allows it — so the rules are the thing that gets tested.

## 11.2 Identity & access

### Authentication

| Control | Requirement |
| --- | --- |
| Password | ≥ 12 chars, checked against HaveIBeenPwned, Argon2id |
| MFA | **Mandatory** for superuser and any organiser with payout access |
| Social sign-in | Google + Apple (Apple required by App Store if Google is offered) |
| Session | 30d attendee · 12h organiser · 1h superuser, sliding |
| Device binding | Fingerprint recorded; a new device triggers step-up |
| Step-up | Re-auth before payout changes, role changes, bulk email, key creation |

### Privilege escalation defence

Already enforced in `firestore.rules` via `noPrivilegedFields()`. A user cannot write
`userType`, `status`, `commissionPercent`, `adminFee`, `wallet` or
`welcomeBonusGranted` on their own document.

**Additional controls:**
- Organisers are created `pending` and cannot create an event until approved.
- Role changes are superuser-only and always audited.
- The `/dev-access` role switcher is **development-only and must be removed before
  launch** — it is listed as a blocking item in the pre-launch checklist.

`OPEN` — decide whether `/dev-access` is deleted or gated behind an IP allowlist plus
a feature flag. Owner: Engineering. Due: before Phase 3.

### Impersonation

Four mandatory controls, all four enforced server-side:
1. Recorded consent or documented lawful basis at session start.
2. Hard 30-minute expiry, no silent renewal.
3. Persistent banner for the whole session.
4. `acting_as` on every audit row, and surfaced to the impersonated user afterwards.

## 11.3 Application security

### The OWASP surface

| Threat | Control |
| --- | --- |
| Injection (SQL/NoSQL) | Parameterised queries only. `analyst.v2` generates **parameterised** SQL with the tenant predicate injected by the runtime, never by the model |
| Broken auth | Firebase Auth, MFA, short sessions, step-up |
| Sensitive data exposure | TLS 1.3, encryption at rest, field-level encryption for PII |
| XXE | No XML parsing anywhere in the stack |
| Broken access control | Security rules + server-side scope checks; **rules are unit-tested in CI** |
| Misconfiguration | IaC, no default credentials, hardened CSP |
| XSS | React escaping, strict CSP, `dangerouslySetInnerHTML` banned by lint rule |
| Insecure deserialisation | Schema validation on every boundary (Zod) |
| Vulnerable dependencies | Dependabot, `npm audit` in CI, blocked on high severity |
| Insufficient logging | Comprehensive audit log; **reads of PII logged, not only writes** |

### Content Security Policy

```
default-src 'self';
script-src 'self' 'nonce-{random}' https://js.stripe.com;
style-src 'self' 'unsafe-inline';
img-src 'self' data: https://firebasestorage.googleapis.com https://maps.googleapis.com;
connect-src 'self' https://*.googleapis.com https://api.stripe.com;
frame-src https://js.stripe.com https://hooks.stripe.com;
object-src 'none'; base-uri 'self'; form-action 'self';
frame-ancestors 'none'; upgrade-insecure-requests;
```

Nonce-based, not `unsafe-inline` for scripts. `frame-ancestors 'none'` blocks
clickjacking on the checkout flow.

### Anti-automation

Ticket on-sales are the most adversarial traffic in consumer software. Layered defence:

| Layer | Control |
| --- | --- |
| Edge | Cloudflare bot management, JS challenge on the checkout path |
| Rate limit | Per IP, per device, per payment instrument, per account |
| Inventory | Server-enforced per-order and per-person limits. **Never client-enforced** |
| Behaviour | `fraud.v3` velocity features across accounts sharing a fingerprint |
| Queue | Virtual waiting room admits at a controlled rate |
| Verification | Phone verification for high-demand on-sales |

## 11.4 Data protection

### Classification

| Class | Examples | Controls |
| --- | --- | --- |
| **Critical** | Payment credentials, API secrets, stream keys, QR secrets | Never stored in the DB; Secret Manager; never logged; never client-readable |
| **Sensitive** | ID documents, DOB, full address | Field-encrypted; ID docs never stored (provider reference only) |
| **Personal** | Name, email, phone, purchase history | Encrypted at rest; access logged; retention enforced |
| **Internal** | Analytics, aggregates | Standard controls |
| **Public** | Published events, organiser profiles | No restriction |

**Two things are never stored on our infrastructure:** raw card numbers (hosted fields
keep us in PCI SAQ-A) and identity documents (we keep the provider's verification
reference). Both are the highest-consequence data classes and the ones we gain least
from holding.

### Encryption

| State | Method |
| --- | --- |
| In transit | TLS 1.3, HSTS with preload, certificate pinning in mobile apps |
| At rest | AES-256, Google-managed keys; CMEK for enterprise tenants |
| In use | Field-level encryption for the Sensitive class |
| Backups | Encrypted, separate key |
| Secrets | Cloud Secret Manager, versioned, access-logged |

### Retention & erasure

| Data | Retention | Basis |
| --- | --- | --- |
| Account | Duration + 30 days | Recovery window |
| Tickets & orders | 7 years | Tax and accounting |
| Payments | 7 years | Financial regulation |
| Audit log | 7 years | Compliance |
| KYC records | 5 years post-relationship | AML |
| Technical logs | 90 days | Operations |
| Agent memory | 7 years episodic, indefinite semantic (revisable) | Product |
| Marketing consent | Until withdrawn + 3 years | Proof of consent |

**Erasure handling:** a GDPR erasure request deletes personal data but retains
transaction records under the legal-obligation basis, with identifiers replaced by a
pseudonymous token. The response to the subject states plainly what was deleted and
what was retained and why. Claiming full deletion while retaining records is worse
than retaining them openly.

## 11.5 Payment security

| Control | Implementation |
| --- | --- |
| **PCI scope** | **SAQ-A only.** Hosted fields; card data never touches our systems |
| 3D Secure | SCA-compliant, triggered by risk score and regulation |
| Tokenisation | Provider tokens only; no PAN storage under any circumstance |
| Idempotency | Unique key on every payment; unique index in the schema |
| Webhook verification | HMAC signature + 5-minute timestamp window + constant-time compare |
| Refund authority | Laddered by amount (see [04 §M11](./04-platform-modules.md#m11--support--disputes)) |
| Payout verification | Bank account verified against the KYC'd legal entity |
| Reserve | Risk-tiered, automatically recalculated |

**Any proposal that would move us from SAQ-A to SAQ-D is rejected by default.** The
compliance cost, audit burden and breach exposure are disproportionate to any benefit
we could obtain from touching card data.

## 11.6 Fraud prevention

### Vectors and controls

| Vector | Detection | Response |
| --- | --- | --- |
| Stolen cards | Radar + `fraud.v3` | Challenge → block (L1 human confirm) |
| Friendly fraud | Scan record proves attendance | Auto-assembled chargeback evidence |
| Ticket duplication | Rotating QR + one-scan enforcement | Refused at the gate |
| Account takeover | `security.v1` geo/device anomaly | Step-up, session revoke, notify |
| Organiser fraud | Payout holds, velocity, complaint rate | Freeze payouts, human review |
| Scalping | Bot detection, purchase limits, velocity | Block, cancel, refund |
| Refund abuse | Pattern across accounts | Restrict, require human approval |
| AML / layering | Transaction monitoring | SAR filing, freeze |

### Chargeback evidence

Assembled automatically on dispute — the win rate depends entirely on evidence quality:
1. Scan record with timestamp and operator (proof of delivery).
2. Terms accepted, with version and timestamp.
3. Ticket delivery confirmation (email open, download).
4. Device fingerprint and IP matching the purchase session.
5. Refund policy shown at checkout.
6. Any customer communication.

A scan record is close to conclusive proof that the service was delivered, which is
why it is captured on every admission and retained for seven years.

## 11.7 AI-specific security

The agent layer introduces threats that do not exist in a conventional platform.

| Threat | Control |
| --- | --- |
| **Prompt injection** | User content is delimited and marked untrusted. **A tool call appearing in user-supplied text is never executed.** Tool calls are validated against the agent's declared scopes before execution |
| **Data exfiltration via prompt** | Prompts receive ids and aggregates, not raw PII. Retrieval is scope-filtered **before** the vector search, not after |
| **Cross-tenant leakage** | Memory partitioned by `principalId`; only k-anonymised (k ≥ 5) procedural memory crosses tenants — enforced at the retrieval layer, never by instruction |
| **Excessive agency** | Autonomy ladder; L1 mandatory for money and identity; **no writing agent is ever L3** |
| **Model DoS / cost attack** | ACU budgets per agent, per principal, per chain. Hard ceilings |
| **Output injection** | Agent output rendered as text; never `eval`'d, never executed as markup |
| **Model supply chain** | Models pinned per agent; version changes are a deploy, never a silent upstream update |
| **Agent chain runaway** | Max depth 5, max 3 invocations per agent per chain, 200 ACU total |
| **Hallucinated authority** | Every tool re-checks scope at execution; a plan-time check is insufficient because state changes between plan and execute |

**The most important sentence in this section:** an agent is a client of the platform
with strictly narrower authority than the principal it serves. It is never a
privileged internal process. Every guarantee in this document depends on that.

## 11.8 Regulatory compliance

### GDPR / UK GDPR

| Requirement | Implementation |
| --- | --- |
| Lawful basis | Contract (tickets), legitimate interest (fraud), consent (marketing, geolocation, AI) |
| Data subject rights | Self-serve access, rectification, export, erasure |
| Consent | Granular, per purpose, withdrawable, timestamped with the version shown |
| Breach notification | 72 hours to the ICO; runbook maintained and drilled |
| DPIA | Completed for the agent layer, biometric-adjacent processing and profiling |
| Processor agreements | DPAs with every sub-processor; register maintained |
| International transfers | Adequacy or SCCs; documented per provider |
| Privacy by design | PII minimisation in prompts; retention enforced by scheduled job |

### AML / CTF

Applies once we operate as a payment facilitator.

| Control | Implementation |
| --- | --- |
| KYC | Sumsub/Persona, triggered by payout and volume thresholds |
| KYB | Full company verification for every gateway merchant |
| Sanctions | ComplyAdvantage, screened at onboarding and re-screened on change |
| PEP | Screened, escalated to human review |
| Transaction monitoring | Rules + anomaly detection |
| SAR | Filed by the MLRO; **tipping-off prohibited** |
| Record keeping | 5 years post-relationship |

`OPEN` — appoint a named MLRO before Phase 3. Owner: Compliance.

### PSD2 / SCA

Strong Customer Authentication via 3DS, with exemptions applied correctly (low value,
TRA, recurring). Getting exemptions wrong costs either conversion or liability shift.

### Accessibility (WCAG 2.2 AA)

Legally required in the UK public sector and a straightforward commercial requirement
elsewhere.

| Requirement | Implementation |
| --- | --- |
| Keyboard navigation | Full, including the seat map editor |
| Screen readers | Semantic HTML, ARIA on every custom control |
| Contrast | ≥ 4.5:1 body, ≥ 3:1 large — verified in both themes |
| Focus visible | Never removed; `focus-visible` rings throughout |
| Motion | `prefers-reduced-motion` honoured |
| Forms | Labels, error identification, suggestions |
| Accessible ticketing | Wheelchair spaces, companion tickets, assistance requests |

**The static QR fallback exists for accessibility reasons**, not convenience: an
attendee without a working smartphone must still be able to enter. Accessibility beats
anti-fraud where they conflict, and the static path is flagged to the operator instead
of being refused.

## 11.9 Risk register

| # | Risk | Likelihood | Impact | Mitigation | Owner |
| --- | --- | --- | --- | --- | --- |
| R1 | Payment provider outage during a major on-sale | Medium | High | Multi-provider failover, edge queue | Eng |
| R2 | Data breach exposing attendee PII | Low | Critical | Encryption, least privilege, tested rules, IR plan | Sec |
| R3 | Agent takes a harmful autonomous action | Low | High | Autonomy ladder, L1 on money, reversibility, governance | AI |
| R4 | Regulatory action over facilitator status | Medium | Critical | Legal sign-off gate before merchant onboarding | Legal |
| R5 | Scalping at scale damages brand | High | Medium | Bot mgmt, limits, verification, rotating QR | Prod |
| R6 | Organiser fraud — sells and does not deliver | Medium | High | Payout holds, reserves, KYC, complaint monitoring | Risk |
| R7 | Model provider price rise compresses ACU margin | Medium | Medium | Multi-provider routing, 3× markup headroom | Fin |
| R8 | Firestore hot-key limit at on-sale | Medium | High | Counter sharding, Redis inventory | Eng |
| R9 | Cross-tenant leak via agent memory | Low | Critical | Partitioned memory, pre-filtered retrieval, k ≥ 5 | AI |
| R10 | Chargeback rate breaches scheme threshold | Low | High | Fraud scoring, evidence automation, monitoring | Risk |
| R11 | Key personnel dependency | Medium | Medium | Documentation, pairing, runbooks | Eng |
| R12 | Cloud region outage during a live event | Low | High | Multi-region, **offline scanning** | Eng |

**R12's mitigation is the reason offline scanning is a requirement.** An event can run
its entire door with our platform completely unavailable. That converts a catastrophic
risk into an operational inconvenience.

## 11.10 Incident response

### Severity

| Sev | Definition | Response | Comms |
| --- | --- | --- | --- |
| **1** | Checkout or scanning down; data breach | Page immediately, 24/7 | Statuspage within 15 min |
| **2** | Major degradation; payment provider down | Page in hours | Statuspage within 60 min |
| **3** | Single feature degraded | Next business day | In-app notice |
| **4** | No user impact | Backlog | None |

### Breach runbook

```
T+0     Detect (automated or reported)
T+15m   Contain — revoke credentials, isolate, stop the bleed
T+1h    Assess — scope, data classes, subject count
T+4h    Notify leadership; engage legal and, if needed, external IR
T+24h   Preliminary root cause
T+72h   Regulator notification if required (GDPR Art. 33)
T+7d    Subject notification if high risk (Art. 34)
T+14d   Postmortem published internally, actions assigned with owners and dates
```

**Containment precedes investigation.** Understanding an ongoing breach fully before
stopping it maximises the damage.

## 11.11 Security testing

| Activity | Frequency |
| --- | --- |
| SAST | Every commit |
| Dependency scan | Every commit; blocked on high severity |
| DAST | Weekly against staging |
| **Firestore rules unit tests** | **Every commit — blocking** |
| Penetration test | Annual + before major releases |
| Red team | Annual |
| Restore drill | Quarterly |
| Access review | Quarterly |
| Prompt injection suite | Every agent release |

**Rules tests are blocking because the rules are the authorisation layer.** Every role
× every collection × positive and negative cases. A rules change without a test is an
untested authorisation change, and the whole zero-trust model rests on them being
correct.

---

## 11.12 Security control register

The concrete controls, with the ones that carry a caveat marked.

| Control | Specification |
| --- | --- |
| Service-to-service | **mTLS** between all microservices; identity verified per request, never by network position |
| Authentication | JWT, **15-minute expiry**, refresh-token rotation on a 7-day window |
| Session revocation | Refresh-token family invalidation on reuse detection |
| MFA | TOTP mandatory for organisers, admins and merchants — see below |
| RBAC | Enforced twice: at the API gateway, and as **RLS in PostgreSQL** (`08` §8.16) |
| QR security | HMAC-SHA256, **per-event salt**, expiry timestamp, one-time Redis invalidation |
| Encryption at rest | AES-256 (Cloud SQL managed), plus **field-level encryption for PII** |
| Encryption in transit | TLS 1.3 minimum, HSTS preload |
| Edge | Cloudflare Enterprise — Magic Transit, rate limiting, bot management |
| WAF | OWASP Top 10 at the edge — XSS, SQLi, CSRF |
| Secrets | Google Secret Manager only. Never in the database, never in config, never in a repo |
| Dependency scanning | Snyk, continuous, blocking on high severity |
| Penetration testing | Quarterly external, plus a re-test of every finding |

### SMS OTP is a fallback, never the primary factor

The source specification lists SMS OTP alongside TOTP as mandatory MFA. **SMS is the
weakest factor available** and the attack is neither theoretical nor difficult: SIM swap
against a mobile network's support desk, then a password reset.

For this platform the exposure is concrete. An organiser account controls payout
destinations. A platform admin account can suspend organisers and set commission. The
most valuable accounts must not be recoverable by someone who convinced a call centre
to move a number.

| Account type | Required | Permitted fallback |
| --- | --- | --- |
| Super admin | **Passkey or hardware key** | None |
| Platform admin | Passkey or TOTP | None |
| Organiser (payout-enabled) | TOTP or passkey | None |
| Organiser (pre-payout) | TOTP | SMS |
| Merchant | TOTP or passkey | None |
| Gate staff | Device-bound session | SMS |
| Fan | Optional | SMS |

SMS remains available where it materially helps adoption and the blast radius is one
person's tickets. It is removed everywhere it would gate money.

### QR expiry needs a floor, not just a timestamp

An expiry timestamp on the signed QR is correct, and the value matters more than the
mechanism. Too short and a fan whose phone was in a pocket during a queue gets refused
at the barrier; too long and a screenshot circulates usefully.

| Delivery | Signed validity |
| --- | --- |
| Wallet pass, in-app | Rotating, 60-second window — the pass regenerates |
| Static PDF or printed | Valid from T-24h to event end + 6h |
| NFC wristband | Bound to the tag, no time expiry |

**Static tickets cannot rotate**, so their signature validity is necessarily wide and
one-time redemption does the real work. The rotating window is a bonus available to
digital holders, not the control the system depends on. `20` §20.7 makes the same
argument about not depending on a heuristic when an authoritative signal exists.

---

## 11.13 Keeping non-humans out of signup and login

### The honest framing first

**"Impossible" is not achievable, and any vendor who promises it is selling something.**
A sufficiently motivated attacker can pay a human to solve a challenge for a fraction of
a penny. The achievable goal is precise: make automated account creation and login
**cost more than it is worth**, and make the accounts that do get through useless before
they can do damage.

That reframing matters because it changes what to build. Chasing a perfect gate produces
a login that frustrates real customers; raising cost and limiting blast radius does not.

### Layered controls

| Layer | Control | Blocks |
| --- | --- | --- |
| 1 | Cloudflare Bot Management + Turnstile | Commodity bots, headless browsers, datacentre IPs |
| 2 | Rate limiting per IP, ASN, device and email domain | Volume attempts |
| 3 | Device fingerprinting (Seon, `06` §6.16) | Farms reusing one device across many accounts |
| 4 | Disposable and role-address blocking | Throwaway inbox signups |
| 5 | **Mandatory email verification before any privileged action** | Unverified accounts doing anything that matters |
| 6 | Behavioural signals — timing, entry cadence, focus events | Scripted form fill |
| 7 | Velocity across the graph — shared device, payment instrument, address | Coordinated registration |
| 8 | Progressive friction on suspicion, never blanket | Attackers, without punishing everyone |
| 9 | Passkeys offered on every account | Credential stuffing, at the login side |
| 10 | Breached-password check at set and at login | Reused credentials |

### Progressive friction, not a wall

A CAPTCHA on every login is a conversion tax paid by real customers to inconvenience
bots that mostly solve it anyway.

```
risk score
  low      → nothing. Sign in, no challenge
  medium   → Turnstile, invisible in most cases
  high     → challenge + email verification
  severe   → refuse, log, no account created
```

Signals: new device, new ASN, impossible travel, datacentre IP, disposable domain,
signup velocity from the network, and mismatch between claimed locale and observed one.

### Limiting the blast radius of accounts that do get through

This is the half that usually gets skipped, and it is the half that holds.

| Restriction until verified | Reason |
| --- | --- |
| Cannot buy | No payment path, so no carding |
| Cannot join a waitlist or claim presale | No inventory hoarding |
| Cannot use a referral code | No referral farming (`04` M26) |
| Cannot follow, or trigger notifications | No spam vector |
| Cannot register as an organiser | Organiser is the money role |
| No API key | No programmatic access |

An unverified account can browse. That is all, and browsing is what we want anyone to be
able to do.

### Login-side specifics

| Control | Detail |
| --- | --- |
| Passkeys | Offered first; a phishing-resistant factor that is *easier* than a password |
| Credential stuffing | Per-account and per-IP throttling with exponential lockout |
| Enumeration | Identical response and timing for unknown email and wrong password |
| Session | 15-minute JWT, refresh rotation, family invalidation on reuse detection |
| Notification | Every new-device login emails the account holder with a one-click "not me" |
| MFA | Per `11` §11.12 — required on every money-holding role |

**Enumeration deserves the attention it rarely gets.** A signup form that says "this
email is already registered" hands an attacker a free membership oracle. Ours behaves
identically either way and sends the outcome to the inbox, where only the real owner
sees it.

### Accessibility is not optional here

Every challenge must have an accessible path. A visual-only CAPTCHA locks out blind
users entirely, and a platform that sells accessible seating cannot have a front door
that fails the same people.

Turnstile is chosen partly because it is usually invisible and does not require solving
a puzzle at all.

### What we will not do

| Not doing | Why |
| --- | --- |
| Requiring ID to buy a ticket | Wildly disproportionate; excludes the undocumented |
| Requiring a phone number for every account | Excludes anyone without one, and SMS is a weak signal anyway |
| Blocking VPNs outright | Privacy-conscious users are not attackers |
| Permanent IP bans | Addresses are shared and reassigned; you ban a household, then a university |
| Hidden shadow-banning | Unaccountable and unappealable — suspend visibly or not at all |

---

## 11.14 Compliance register, with four corrections

### Data protection

| Control | Specification |
| --- | --- |
| Privacy by design | Minimal collection; explicit consent at registration and checkout |
| Cookie consent | Cookiebot, with non-essential cookies off until accepted (`04` M24) |
| Subject access | Automated export from the admin panel, answered within 30 days |
| Processor agreements | DPAs with Stripe, Adyen, BitriPay, KODA, SendGrid, Twilio, Sumsub, Datadog |
| Sub-processor register | Published, with notice before any addition |
| Transfers | SCCs where data leaves the UK/EU — including `africa-south1` (`07` §7.12) |

### PCI-DSS

| Control | Specification |
| --- | --- |
| Scope | **SAQ-A.** Card data is tokenised by Stripe/Adyen and never touches our servers |
| Mobile money | No PANs in scope at all |
| Transport | TLS 1.3, HSTS preload on every payment path |
| Assurance | Annual SAQ-A, quarterly ASV vulnerability scans |

SAQ-A holds **only while payment fields are hosted by the provider**. The moment a card
number is rendered in our own DOM — an "improved" inline form, a well-meant autofill fix
— scope jumps to SAQ-A-EP and the annual assessment burden multiplies. Any change to the
checkout DOM is a PCI decision, not a UI one.

### KYC / KYB / AML

| Trigger | Action |
| --- | --- |
| Organiser before going live | Full KYB via Sumsub — blocking |
| Any BitriPay merchant | Full KYB before processing |
| Hospitality booking > £500 | Enhanced identity verification on the lead booker |
| All organisers, ongoing | ComplyAdvantage sanctions, PEP and adverse media |
| Velocity, geography, pattern deviation | Automated monitoring, continuous |

**Suspicious activity workflow:** agent flags → `compliance.v1` assembles → **human
decides** → filing. `03` §3.6 sets the autonomy; no agent files a report, and no agent
clears one.

---

### Correction 1 — "SAR" means two different things and must not

In this document set:

| Term | Always written as | Never abbreviated |
| --- | --- | --- |
| Subject Access Request (GDPR) | **DSAR** | — |
| Suspicious Activity Report (AML) | **Suspicious Activity Report** | — |

They appear within pages of each other, they route to entirely different teams, and one
of them carries a criminal offence for getting the handling wrong. A compliance document
where one acronym means both is a document that will eventually be misread under time
pressure.

### Correction 2 — the DPO threshold is the wrong test

The source states a DPO is required above 250 employees. **That is the Article 30 test
for records of processing, not the Article 37 test for a DPO.**

Article 37 requires a DPO where core activities involve:

- **large-scale, regular and systematic monitoring** of data subjects, or
- large-scale processing of **special-category** data.

This platform does both. Behavioural analytics, attendance tracking, scan logs and
recommendation profiling are systematic monitoring at scale; hospitality guest records
hold dietary and accessibility data, which is special-category (`08` §8.13c).

**A DPO is likely required from launch, at any headcount.** Waiting for 250 employees
would mean operating without one for the entire period the obligation actually applies.
`OPEN`, and it needs counsel rather than a headcount.

### Correction 3 — 7-year retention and 30-day erasure are not in conflict, but must be written as though someone will test them

| Data | Retention | On erasure request |
| --- | --- | --- |
| Order, invoice, tax records | **7 years** (UK) | **Retained** — Article 17(3)(b), legal obligation |
| Name, email, phone, address on the profile | Life of account | Deleted within 30 days |
| Behavioural, recommendation, marketing profile | 24 months rolling | Deleted immediately |
| Hospitality dietary and accessibility | **90 days after the event** | Deleted immediately |
| Scan logs | 24 months | Pseudonymised, not deleted — fraud defence |
| Audit log | 7 years | **Retained, immutable** — Article 17(3)(b) |

**Erasure does not mean deletion of everything.** It means deleting what has no
surviving lawful basis, and being able to say precisely which records survive and under
which article. A blanket "we delete everything in 30 days" is both untrue and a breach
of the tax obligation.

The honest sentence for the privacy policy: *we remove your personal details from your
account and our marketing systems; we keep the financial record of what you bought,
because the law requires us to.*

### Correction 4 — a filed Suspicious Activity Report must not be disclosed

Telling a customer their transaction was reported is **tipping off**, a criminal offence
under the UK Proceeds of Crime Act.

This collides with the platform's default posture, which is to explain every action:

| Normal | Under an open report |
| --- | --- |
| Suspension explains its reason | Suspension is generic; no reason given |
| Agent transcript is user-visible | The relevant entries are hidden from the user |
| Support can see the case | Support sees only "escalated — compliance" |
| Admin console shows the flag | Restricted to the nominated officer |

**This must be built, not remembered.** A support agent who sees an AML flag will
eventually mention it, because being helpful is their job. The control is that they
cannot see it.

Requires a nominated officer (MLRO) and a restricted case queue that the ordinary
compliance surface does not expose. `OPEN`, blocking before AML monitoring goes live.

---

## 11.15 The complete RBAC matrix

The source matrix covers 5 actors and 8 permissions. There are **13 actors** (`02` §2.1),
and the permissions it omits are the dangerous ones — payouts, credit, impersonation,
role grants. A matrix that stops before the money is a matrix that will be read as
complete.

Legend: `✓` full · `◐` own scope only · `◑` scoped to one event · `✗` denied ·
`—` not applicable.

### Catalogue and inventory

| Permission | Super | Admin | Organiser | Venue | Promoter | Host | Gate | Sponsor | Dev | Merchant | Support | Regulator | Fan |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Create / edit events | ✓ | ✓ | ◐ | ✗ | ✗ | ✗ | ✗ | ✗ | ◐ | ✗ | ✗ | ✗ | ✗ |
| Publish an event | ✓ | ✓ | ◐ | ✗ | ✗ | ✗ | ✗ | ✗ | ◐ | ✗ | ✗ | ✗ | ✗ |
| Cancel an event | ✓ | ✓ | ◐ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Edit seat maps | ✓ | ✓ | ◐ | ◐ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Configure gates and zones | ✓ | ✓ | ◐ | ◐ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Manage hospitality packages | ✓ | ✓ | ◐ | ✗ | ✗ | ◐ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

### Entry

| Permission | Super | Admin | Organiser | Venue | Promoter | Host | Gate | Sponsor | Dev | Merchant | Support | Regulator | Fan |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Scan tickets** | ✓ | ✓ | **◐** | ✗ | ✗ | ◑ | **◑** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Override a refused scan | ✓ | ✓ | ◐ | ✗ | ✗ | ✗ | ◑ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Emergency blocklist | ✓ | ✓ | ◐ | ◐ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

### Money — the block the source matrix omits

| Permission | Super | Admin | Organiser | Venue | Promoter | Host | Gate | Sponsor | Dev | Merchant | Support | Regulator | Fan |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Process refunds | ✓ | ✓ | ◐ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ◐ | ✗ | ✗ | ✗ |
| Request a payout | ✓ | ✓ | ◐ | ✗ | ◐ | ✗ | ✗ | ✗ | ✗ | ◐ | ✗ | ✗ | ✗ |
| **Release a payout** | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Set commission terms | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Change platform pricing** | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Grant ACU credit** | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Write the wallet ledger** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Approve offline payments | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Approve creator payouts | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

### Identity and governance

| Permission | Super | Admin | Organiser | Venue | Promoter | Host | Gate | Sponsor | Dev | Merchant | Support | Regulator | Fan |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Approve / suspend organisers | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Grant the admin role** | ✓ ⁽²⁾ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Impersonate a user** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ◐ ⁽³⁾ | ✗ | ✗ |
| Platform configuration | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Agent autonomy and kill switch | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Configure own agents | ✓ | ✓ | ◐ ⁽⁴⁾ | ◐ ⁽⁴⁾ | ✗ | ◐ ⁽⁴⁾ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Manage API keys | ✓ | ✓ | ◐ | ✗ | ✗ | ✗ | ✗ | ✗ | ◐ | ◐ | ✗ | ✗ | ✗ |
| Compliance override | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

### Data

| Permission | Super | Admin | Organiser | Venue | Promoter | Host | Gate | Sponsor | Dev | Merchant | Support | Regulator | Fan |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| View all user data | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ◐ ⁽³⁾ | ✗ | ✗ |
| View attendee lists | ✓ | ✓ | ◐ | ✗ | ✗ | ◐ | ✗ | ✗ | ✗ | ✗ | ◐ ⁽³⁾ | ✗ | ✗ |
| View analytics | ✓ | ✓ | ◐ | ◐ agg. | ◐ | ◐ | ✗ | ◐ agg. ⁽⁵⁾ | ✗ | ◐ | ✗ | ✗ | ◐ |
| View audit logs | ✓ | ◐ own | ◐ own events | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ read-only | ✗ |
| **Write audit logs** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Export personal data | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ◐ own |
| Delete an account | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ◐ own |

---

### The five footnotes are where the real rules live

**⁽¹⁾ Scanning is event-scoped, not role-scoped.** The source matrix gives Organiser a
plain `✓` on scan, which reads as *any ticket*. It must be `◐` — own events only —
because the alternative is one organiser admitting against another's inventory. This is
already enforced (`16` §16.3): the redeem rule checks `organizerId == request.auth.uid`
before anything else. Gate staff are narrower still: **one event**, by scoped link.

**⁽²⁾ Admin role grants need two people.** Debt D5 (`17` §17.8). A self-propagating
admin role with no second signature is correct at ten staff and wrong at a hundred, and
the moment to fix it is before anyone has forgotten who granted whom.

**⁽³⁾ Impersonation belongs to nobody by default.** Not super admin, not platform
admin — only a support agent, only with the user's recorded consent, only time-boxed,
and every action inside the session logged and attributed to the human, not the user.
An admin who can silently become a customer can place orders, change payout details and
read anything, with the audit trail naming the wrong person.

**⁽⁴⁾ Configuring an agent cannot exceed your own authority.** An organiser may enable
their agents, set budgets and adjust triggers. They cannot raise an agent above the
autonomy ceiling `governance.v1` permits, and no configuration can grant an agent a
scope its principal does not hold — `agent(X) ⊂ X` (`02` §2.1).

**⁽⁵⁾ Sponsor analytics are aggregate only**, k-anonymised at 25 (`04` M19). This row
is the one most likely to be widened by a commercial conversation, so it is stated here
as well as there.

### The two rows that are `✗` for everyone

`Write the wallet ledger` and `Write audit logs` are denied to **every principal
including super admin**, and that is not an oversight in the table. Both are written by
trusted server code holding credentials no session ever has (`08` §8.16).

An administrator who can silently edit the audit log is not an administrator, and a
platform where credit can be minted from a browser is not a platform. Every other cell
in this matrix is a policy decision; these two are the invariant the rest sits on.
