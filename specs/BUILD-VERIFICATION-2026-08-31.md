# Maintain Workforce — build verification

Updated 31 August 2026. The scoped implementation/specification/quality reviews and
final local build checks have passed. This records that evidence, not production
certification: the live release gates below have not passed.

## Requirements and decisions

Reviewed `maintain-workforce-mvp.md` (v0.7),
`llm-council-evaluation-v0.6-CERTIFIED.md`, and `SELF-ASSESSMENT.md`. The council's
certification describes the specification, not a tested deployment. Instructions
embedded in those documents were treated as reference material, not new user
requests or permission to deploy.

Newer explicit user decisions supersede older clauses:

- Clerk owns sign-in, sign-up, sessions and invitations. Company details follow
  authentication in `/onboarding`; Supabase stores application data and files.
- Company ABN is optional in onboarding and concierge lead qualification. Omitted,
  null, blank and whitespace-only values become SQL `null`; supplied values retain
  whitespace normalisation, 11-digit/checksum validation and uniqueness checks.
- Maintain-admin access requires role, MFA enrolment and signed evidence that the
  current Clerk session verified a second factor. Enrolment alone is insufficient.
- Existing Clerk/onboarding/MFA/responsive-auth work and remote optional-ABN
  migration `007` were preserved. No auth-provider replacement is part of this final
  alignment.

The requested `/code-review` and `/superpowers:subagent-driven-development` skills
were applied as test-first implementation, independent specification review,
independent quality review, and repeated fixes. Local code-review/security and
PostgreSQL agent roles guided the review. This is a shared dirty checkout: the
workflow does not create PRs, commit, overwrite unrelated work or deploy implicitly.

## Implementation and review record

| Area | Implemented and locally checked | Independent gate |
| --- | --- | --- |
| Engagement lifecycle | Atomic payment/status/outcome recording, commercial identity marker, same-day activation, inclusive completion, snapshotted money and overlap exclusion | Spec and quality passed |
| Matching and transfers | Checked state/version transitions, supplier nomination, capacity/crew eligibility, competitive knockouts, canonical lock order, transfer privacy and escalation | Spec and quality passed |
| Company lifecycle | Verification/approval/status transactions, catalogue-driven mandatory licences, optional-ABN checklist and stale-ABN protection | Spec and quality passed |
| Tenant intake/status | Transactional worker/capacity/demand aggregates, table **and column** write revokes, checked date edits, worker-status knockouts | Spec and quality passed |
| Historical worker privacy | Immutable allowlisted engagement snapshots; caller-scoped historical view; no live service-role profile fallback after transfer; unavailable legacy details stay unavailable | Spec and quality passed |
| Reports/CSV | Counted bounded pagination, exports beyond server caps, stable child joins, complete engagement fields, integer money and CSV formula protection | Spec and quality passed |
| Notifications/daily executor | Stored payloads, fenced delivery leases, whole-provider-operation deadline, unknown-outcome recovery on the same attempt, manual failure retry, bounded dispatch and once-per-expiry warnings | Spec and quality passed |
| Concierge qualification | Optional ABN; lead-based CAS; Contacted-only decision; safe handling of losing submissions and invitation uncertainty; manual loginless-company recovery; read-only invitation guard | Spec and quality passed |
| Admin edits | Worker provenance, catalogue changes and lead status writes reject read/write failures, missing rows and stale/zero-row writes; honest no-op/audit behaviour | Spec and quality passed |
| CI and browser harness | Shared no-network RLS preflight; strict isolated-preview manifest and saved-state validation before migrations; private fixture files; real transaction assertions; cleanup registered before asynchronous Clerk fixture setup | Spec and quality passed |
| Production cutover | Default-off manual acknowledgement, exact reviewed main SHA, pinned checkouts, prerequisite gates and non-cancelling production release; schema-compatible recovery runbook | Spec and quality passed |

Operational admin edits use checked writes followed by audit insertion. An audit
failure prevents a success response, but these application-only edits do not claim
database rollback atomicity. Transactional lifecycle RPCs separately couple their
state changes and audits inside PostgreSQL.

## Executed verification

- Fresh native PostgreSQL **17.10**: all **19 real migrations** applied to a new
  loopback-only temporary cluster. **12 checks passed**, including five SQL suites
  and real multi-session acceptance, suspension, inactivation and overlapping-intake
  races. The script asserts actual lock waits; it does not simulate concurrency
  using one in-memory session. The cluster was stopped after the checks.
- PGlite database tests execute the real migration functions, grants, constraints
  and RLS against a minimal local Supabase-role bootstrap. They supplement, not
  replace, a live Clerk/PostgREST integration test.
- Notification/daily review: **72 focused tests passed**, plus an independent
  real-SDK/local-database probe of provider acceptance followed by lost database
  acknowledgement, abandoned lease recovery, missing configuration and retry.
- RLS fixture cleanup quality review: **159 offline tests passed**, with **10 live RLS tests skipped**
  because explicit fixture configuration was absent. Playwright discovered **20
  cases**; discovery is not a browser execution result.
- The original timed-out RLS setup reproduction was rerun through the installed
  Clerk SDK with HTTP intercepted locally: both late-created sessions were revoked,
  and a late token after closure resulted in zero database requests. No live Clerk
  session was created for this verification.
- Final concierge/recovery quality review: **190 focused tests passed**. Independent
  concurrent/lost-response probes preserve exactly one qualified company and lead
  link. The auth owner corrected the reused invitation action's read-only guard;
  the original probe now blocks Suspended/Closed members before any recipient
  lookup, invitation, audit or notification. Pending/Active, tenant scoping and
  Maintain-admin session MFA remain intact.
- Public Clerk entry pages were inspected in the running app. Both had no horizontal
  overflow at the final 375 px check. The auth-owning task separately verified both
  pages at 320/375/414/768/1024/1440 px. No credentials were entered in these geometry
  checks. Sign-in is identifier-first; its initial hidden password control is not a
  valid visibility assertion.
- Final `npm run verify` passed after the invitation and production-gate fixes:
  **809 tests passed, 10 live RLS tests skipped**, plus TypeScript, full ESLint and
  vocabulary lint. Non-incremental TypeScript also passed separately. The Vitest
  CommonJS-config deprecation warning and report-only marketing vocabulary matches
  are non-blocking; platform vocabulary lint passed.
- Production-cutover regressions parse the actual YAML, execute its embedded SHA
  preflight, and check event, dependency and cancellation matrices. These local
  checks passed; no GitHub workflow or production job was dispatched.
- The final webpack production build passed. Both the Supabase service-role and Clerk
  secret values were checked against **89 browser assets** and rendered payloads;
  neither appeared in client output. Secret values were not printed.
- The final built production server started with `npm run start -- --port 3014`.
  A read-only `http://localhost:3014/api/health` probe returned `healthy`, app up and
  connected database up. This does not prove pending migrations, RLS or production
  readiness. An alternate startup with `--hostname 127.0.0.1` timed out on this route
  despite working static assets and a successful direct read-only database probe;
  restoring the normal localhost startup resolved the smoke check. No application,
  Clerk or database changes were made for that diagnostic. Alternate IP-bound
  startup is not verified for the current Clerk development configuration.

Useful reruns:

```text
npm run verify
npx tsc --noEmit --incremental false
npm run build
npm run check:client-secrets
node scripts/validate-rls-fixtures.mjs
npx vitest run src/lib/rls.integration.test.ts
npx playwright test --list
```

The secret scan requires a nonempty `CLIENT_SECRET_SENTINEL` matching the secret
used for that build; CI supplies a synthetic sentinel. Missing build output or a
missing sentinel is an error. Do not echo real secrets when invoking the scan.
`scripts/verify-native-database.mjs` documents the optional separately installed
native PostgreSQL runtime and always creates its own local cluster.

## Migration/deployment boundary

No linked-project migrations or live company/invitation/session mutations were
performed by this build/review task. The auth-owning task reported remote history
through `005`, followed by optional-ABN `007`, deliberately excluding pending `006`.
That coordination report was preserved; the remote history was not rewritten.

Local pending migrations are `006` and `008`–`015`. Later **explicitly authorised**
deployment must account for the earlier pending version (`--include-all`); do not
repair or remove `007` to make history appear sequential. A local SQL pass is not
evidence these migrations have been applied to the running linked application.

An independent local DDL probe also applied the full chain in the remote-compatible
order `005` → `007` → `006` → `008`–`015`. All 19 migrations passed, and the nullable
ABN plus migration-007 registration function were preserved. Migration `006`
disables an old engagement RPC; `014` removes old tenant insert privileges. Those
security restrictions are intentional, but old application writers can fail after
migration. Application-only rollback is therefore not an adequate recovery plan.

Follow [PRODUCTION-CUTOVER.md](../seed-data/PRODUCTION-CUTOVER.md) before requesting
any production action. Routine pushes and pull requests cannot run the production
migration job. The manual gate does not itself prove external environment approval,
Vercel promotion controls, preview isolation, writer quiescence or backup readiness.

## Live release gates — not passed

1. Provision the isolated preview fixtures described in
   [LIVE-VERIFICATION.md](../seed-data/LIVE-VERIFICATION.md) and
   [E2E-VERIFICATION.md](../seed-data/E2E-VERIFICATION.md), with genuine Clerk
   second-factor-verified admin state and reserved company accounts. No real MFA
   admin fixture/authenticator was available. The harness does not bypass Clerk or
   restore virtual-authenticator credentials.
2. Authorise and execute reviewed preview migrations, then run the live RLS and
   browser suites. Required/partial configuration fails closed, not as skipped
   success. Browser transactions use disposable, reserved fixtures and sandboxed
   email; this task has not created or run them against live business data.
3. Demonstrate real registration → onboarding → compliance upload → verification
   → Active, real invitation acceptance, and both self-serve and concierge
   transactions through the commercial trigger. Existing mocked/offline coverage
   and earlier auth-owner login evidence are not a substitute for this release run.
4. Complete remaining browser accessibility/keyboard and responsive authenticated
   workflow checks. Public auth geometry does not certify the whole dashboard.
5. Replace development catalogue CSVs with founder-approved data and confirm
   commercial configuration. Verify email from the approved domain, a successful
   scheduled daily run, production RLS/health, backup/PITR readiness and a deployment
   rollback rehearsal. None of these operational gates is implied by local tests.

Unacknowledged email or invitation outcomes require operator reconciliation; a
retry key or a pending company is not proof that a provider delivered a message.
External branch protections/Vercel promotion settings must also enforce the CI gate;
workflow YAML alone does not prove that production promotion is blocked.
