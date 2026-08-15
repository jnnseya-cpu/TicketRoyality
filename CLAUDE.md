# Operating directive — TicketRoyality

Standing rules for any AI agent working in this repository. These are not suggestions.

## 0. The two files that bind everything

- **`/STATUS.md` is the only source of truth for what is built.** `docs/` specifies a
  *target* system across 23 documents; most of it is not implemented. Reading a module
  spec and assuming it exists is the single easiest mistake to make here, and it has
  already been made at the cost of 16 published articles describing features that did
  not exist.
- **Update `STATUS.md` in the same commit** that changes what is built. Never after.

## 1. Vendor constraint — hard

The accounts that exist. Nothing outside this list may be introduced.

| Layer | Vendor | Used for |
| --- | --- | --- |
| Infrastructure | **Hostinger** | Domain, DNS, the `info@` mailbox that sends ticket email. A VPS is available and **not used** — App Hosting removes the need. |
| Infrastructure | **Firebase / Google Cloud** | Hosting (App Hosting → Cloud Run), Auth, Firestore, Storage, Functions, Scheduler, FCM, App Check, Maps, Gemini, Cloud Logging |
| Infrastructure | **Vercel** | Available, **currently unused**. The app is deployed on App Hosting. |
| Payments | **Stripe** · **BitriPay / KODA** | Cards; mobile money |
| AI | **Anthropic** · **Google** · **OpenAI** | The AI gateway |

Adding anything else is an escalation, not a decision. A *library* is not a vendor; a
service with its own account, contract or invoice is.

Consequences that are already load-bearing:

- Email is **SMTP through Hostinger**, never an email API.
- Error tracking is **Google Cloud Error Reporting**, never Sentry.
- **SMS and WhatsApp cannot be delivered.** They are declared in the comms catalogue
  as specification; `dispatch()` records them and sends nothing.
- KYC/AML has no provider. It is only needed if the platform ever holds funds.

## 2. Read before you write

Never generate code before inspecting what exists: routes, components, services,
schema, rules, middleware, utilities, types, env config, tests. Never assume anything
that can be verified from the codebase. Search first.

## 3. Never rebuild what works

Reuse, extend, integrate. Do not recreate auth, dashboards, navigation, schemas, APIs,
components, config, permissions, middleware or the design system. Working functionality
is an asset.

Before creating any file, function, endpoint, table, hook, helper, type or dependency,
search for an existing equivalent. One source of truth per concern — never
`UserService` / `user-service` / `UserManager` doing the same job.

## 4. Done means done

Once implemented, integrated and verified, leave it alone unless: the new requirement
depends on it, a verified defect exists, a security issue exists, a regression is
identified, or a required architectural change reaches it. No cosmetic refactors.

## 5. Root causes, not symptoms

`OBSERVE → TRACE → IDENTIFY ROOT CAUSE → FIX → VERIFY → CHECK REGRESSIONS.`

**Same error + same approach = stop and reassess.** The next attempt must incorporate
new evidence. One correct fix beats ten patches.

## 6. Build vertically

`UI → VALIDATION → API → BUSINESS LOGIC → DATABASE → RESPONSE → UI STATE → ERRORS → TESTS.`

One finished path beats ten half-built modules. Never leave `TODO`, mock data, fake
success or placeholder responses inside anything described as complete. Never present
invented numbers as a working feature.

## 7. Money and data

- Financial operations must be **idempotent** — transaction ids, idempotency keys,
  unique constraints, atomic transactions. A repeated webhook must never create
  repeated money.
- Business rules (pricing, commission, ACU, permissions, eligibility) are
  **authoritative server-side**. The frontend displays; it never decides.
- Never delete tables, rename key columns, reset databases or destructively regenerate
  schema. Prefer backward-compatible migrations.
- Tenant isolation is enforced in `firestore.rules`, never by hiding UI.

## 8. Secrets

Never in the repository, frontend bundles, logs or URLs. Server-side environment
variables only. `.env.example` carries empty placeholders and nothing else.

## 9. Failure handling

Every external call — database, payments, AI, webhooks, email, SMS, storage — must
detect failure, log usefully, fail **safely**, tell the user, and leave no corrupt
state. Never silently swallow an error. AI is never a single point of failure.

## 10. Verify, then claim

`IMPLEMENTED → TESTED → VERIFIED.` Never say "fixed" because code changed. If something
cannot be tested in this environment, **say so explicitly** rather than implying it was
checked. Fix every build, type, lint and runtime error your own change introduced,
without asking.

Verification commands:

```bash
npm run build          # app
npm run typecheck      # app + functions contract guard
npm run lint
npm run check:links    # link graph + article publishing gate
npm run test:issuance  # Firestore emulator, real transactions
cd functions && npm run build
```

Then serve the real artefact — `npm run start` runs the standalone server, which is
what Cloud Run executes. A green build is not a working app.

## 11. Scope

Do not fix unrelated things. Record and report them instead. Small controlled changes,
verified one at a time — never a 40-file rewrite followed by 73 errors.

Priority order: **P0** platform down, data corruption, security breach, payment failure
→ **P1** major feature unusable → **P2** defect → **P3** improvement → **P4** cosmetic.
Never polish P4 while P0/P1 stand.

`STABILITY → CORRECTNESS → SECURITY → UX → PERFORMANCE → NEW FEATURES.`

## 12. Ask rarely

Decide reversible low-risk details yourself from the code and existing conventions.
Escalate only where ambiguity materially affects product behaviour, security, money,
irreversible data changes, architecture or a major business rule — or where a sixth
vendor would be required.

Do not narrate ("now I will inspect the project"). Do the work. Communicate decisions
that affect architecture, security, functionality, cost, scope or compatibility.

## 13. Stop conditions

Stop and reassess before anything that would destroy production data, expose
credentials, bypass authentication, introduce a known vulnerability, create financial
transactions incorrectly, migrate critical data irreversibly, or overwrite working
functionality unnecessarily.

## Project-specific facts worth not rediscovering

- Three layers — `app` / `frontend` / `backend` / `shared` — are folders in **one**
  Next.js app, enforced by `no-restricted-imports` lint rules and `import 'server-only'`.
  `shared` depends on nothing; `frontend` never imports `backend`.
- `functions/` is a **separate deployable package**. It declares its own document shapes
  because `firebase deploy` uploads only that directory;
  `src/backend/services/issuance-contract.ts` makes drift a compile error.
- Issuance is idempotent by document id (`payment_events/{providerEventId}`), never by
  in-memory state.
- `npm run start` runs `node .next/standalone/server.js` — `next start` cannot serve a
  standalone build and exits silently.
- Blog articles carry `status: 'shipped' | 'draft'`. An article describing an unbuilt
  feature stays a draft; `check:links` enforces the gate.
