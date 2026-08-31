# Browser verification: scope and fixture contract

The previous starred-flow file mostly asserted page headings. It did not demonstrate
a transaction. The replacement separates anonymous entry-page smoke from two
fixture-dependent scenarios that submit the actual application forms.

Implementation verification is **not** a live E2E result. The new transaction
scenarios have been typechecked, linted, unit-checked and discovered by Playwright;
they have not been executed against a provisioned preview in this development task.
No account, Clerk session, company, payment record or database migration was created
by implementing or listing these tests.

## What the scenarios verify when executed

- Public smoke: Clerk sign-in and sign-up render; company registration fields stay
  off the Clerk account form; anonymous `/onboarding` redirects to sign-up. Sign-in
  is identifier-first, so the initial password input is not expected to be visible.
- Pending fixture: the actual authenticated Pending company cannot access either
  SELL or BUY submission controls. Database/action enforcement is tested separately.
- Self-serve transaction: two named-worker capacity lines in one submission, with
  exact band pre-fill and supplier overrides; two requirement lines in one submission
  with all-in indicative ranges; Maintain shortlist and 100% eligible availability;
  supplier nomination of a **different** crew subset; aggregate buyer ticket coverage
  and name-free acceptance; a real Awaiting Commercial engagement for each line;
  recorded payment pre-authorisation; Confirmed status and appropriate identity reveal.
- Commercial evidence: the actual authenticated Maintain CSV download is checked
  before and after pre-authorisation for linkage IDs, dates, canonical demand hours,
  integer-cent half-up rates, fee, estimated values and the commercial marker.
  The test oracle does not import the production money implementation.
- Privacy: same-origin buyer HTML/RSC/JSON response bodies and rendered content are
  inspected for fixture names, IDs and ticket numbers before confirmation, and for
  worker mobile/email and supplier-rate/fee fields before and after confirmation.
  An unreadable captured response fails the check. This is scoped browser evidence,
  not a substitute for the live RLS suite or a proof about every possible API response.
- Concierge: only the Maintain browser signs in. Capacity and demand are entered for
  two seeded login-less companies, then supplier nominations and buyer acceptance
  are recorded. Missing decision evidence is rejected without changing the state;
  explicit `TEST FIXTURE` notes name the test contact, timestamp and run. The engagement
  reaches Awaiting Commercial and then Confirmed with matching financial snapshots.
- The company acceptance and revealed-engagement screens are checked at a 375 px
  viewport for horizontal overflow. Maintain contexts use 1280 px. The existing
  twelve credential-free responsive Clerk cases remain independent and unchanged.

## What is not covered by these scenarios

Do not label a green seeded transaction run as completion of every Definition of Done
item. Registration, email/device verification, onboarding submission, compliance-file
upload and Maintain verification/activation are **fixture prerequisites here**, not
steps this suite executes. Actual MFA enrollment/challenge/recovery is also not driven.
The test requires a genuine previously second-factor-verified session and verifies
that the application's real protected admin route accepts it before any write.

Login-less company history is an operator-attested fixture fact; the browser does
not query Clerk login history. Evidence notes are submitted through real actions and
their rejection path is exercised, but exact audit-note persistence is covered by
the database tests, not exposed by the browser UI. This suite does not prove real
email delivery, Overdue/daily-clock behavior, transfer escalation, keyboard-only or
axe accessibility coverage, payment-provider processing, production rollout or the
first real customer transaction. Those remain separate verification work.

## Safety gate

Every mutating scenario requires all of the following environment variables:

| Variable | Required value |
| --- | --- |
| `E2E_REQUIRED` | `1` in promotion-blocking CI. Missing fixtures then fail test discovery. |
| `E2E_ALLOW_TEST_WRITES` | `1`, explicit authorization to create the described test business records. |
| `E2E_TARGET` | `isolated-preview`. |
| `E2E_FIXTURES_FILE` | Absolute path to an operator-provided JSON manifest, outside version control. |
| `APP_BASE_URL` | Exact preview origin, with no path, query, user information or fragment. |
| `NEXT_PUBLIC_SUPABASE_URL` | Exact disposable database endpoint, matching the manifest. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | The preview's `pk_test_` development-instance key. Live keys are rejected. |

The application itself still needs its normal server configuration. The browser
harness does **not** need a Clerk secret key, Supabase service key or account passwords.
It does not manufacture tokens, change roles, create sessions, call test auth endpoints
or bypass the Clerk application guard.

The manifest's target assertions are explicit operator attestations, not a way to
discover or cryptographically verify deployment configuration. Before opting in,
verify that the preview deployment actually points to the stated disposable Supabase
project and Clerk development instance, and that all outgoing email goes to a sandbox
or controlled test recipients. Never point this suite at the linked production project.
Use a new/disposable preview database with the reviewed migrations applied in their
documented order; this suite does not apply them. Preserve the existing remote `007`
history when separately planning any authorized migration deployment.

An ordinary developer run without any E2E fixture settings reports the transaction
cases as skipped. A partially configured run fails rather than silently skipping.
No default email addresses, guessed rates, trade names or worker IDs are supplied.

## Manifest schema

The executable schema is `e2e/support/transaction-fixtures.ts`. The JSON has these
top-level fields (all are required):

| Field | Shape |
| --- | --- |
| `version` | `1` |
| `runId` | A new 3–40 character identifier, letters/digits/underscore/hyphen, starting with a letter or digit. |
| `target` | Object described below. |
| `rules` | `{ "feeBp": integer, "minimumCrewSize": integer, "minimumHoursPerLine": number }`, matching the seeded active configuration. |
| `projects` | Objects under **both** `company-mobile` and `admin-desktop`, each using the project shape below. |

`target` contains `purpose: "isolated-preview"`, `appOrigin`, `supabaseUrl`, and the
literal booleans `databaseIsDisposable: true`, `reservedTestAccountsOnly: true`, and
`emailDeliveryIsSandboxed: true`. Remote origins require HTTPS; HTTP is accepted only
for localhost. The endpoint/origin must exactly match the corresponding environment
value (a trailing slash is allowed).

Each **project** object contains:

| Field | Shape |
| --- | --- |
| `adminStorageState` | Path to genuine Playwright state captured after a successful Clerk second-factor challenge for an audited Maintain-admin fixture. |
| `pending` | Signed-in company object in Pending status. |
| `selfServe.supplier` | Signed-in company object in Active status. |
| `selfServe.buyer` | Different signed-in company object in Active status. |
| `selfServe.lines` | Exactly two line objects described below. |
| `concierge.supplier` | Login-less Active company object. |
| `concierge.buyer` | Different login-less Active company object. |
| `concierge.line` | One line object with its own workers. |
| `concierge.supplierContact` | Name of the reserved supplier test operator. |
| `concierge.buyerContact` | Name of the reserved buyer test operator. |

A **company** object is `{ "id": "UUID", "legalName": "exact registered name",
"displayName": "exact trading name, or legal name when absent" }`. Signed-in companies
also have `storageState`. Login-less companies instead have `neverLoggedIn: true` and
must never have accepted/sign-in users in their fixture setup. Names are test canaries:
use distinctive, synthetic values, not real customer names.

All ten company IDs must be distinct across the two projects and both flows. All
workers and their full names must be distinct across the six capacity lines. Do not
reuse the companies/workers from another concurrent job or the live RLS fixtures.
An admin state can be shared across the two projects because it is not mutated or
signed out; the company states and business records are separate.

Each **line** object contains:

| Field | Shape and prerequisite |
| --- | --- |
| `tradeRoleId`, `proficiencyId`, `regionId` | Existing active catalogue UUIDs, with a valid trade/proficiency pair. The two self-serve lines share one request region. |
| `startDate`, `endDate` | Strict `YYYY-MM-DD`, ordered and strictly future-starting in Australia/Brisbane. Capacity and demand use this same window, so eligible availability is 100%. |
| `hoursPerWeek` | Canonical buyer hours, in half-hour steps, at most 168. |
| `capacityHoursPerWeek` | At least the buyer hours, at most 168. Prefer a different number to verify estimates use demand hours. |
| `supplierRateCents` | Positive integer cents, intentionally different from the band midpoint so the UI override is exercised. |
| `bandLowCents`, `bandHighCents` | Exact current applicable supplier band, ordered, positive integer cents. |
| `workers` | 2–30 worker objects, employed only by the corresponding supplier, stored Active and fully eligible for this window. |
| `shortlistWorkerIds` | Unique nonempty UUID subset of the line's roster. Maintain selects only this feasibility subset. |
| `nomineeWorkerIds` | Equal-sized unique roster subset with at least one different worker; at least the configured minimum crew size. The supplier nominates this subset. |
| `skills` | Nonempty array of `{ "id": "UUID", "name": "exact catalogue label" }`, all held by every eligible fixture worker. |
| `qualifications` | Nonempty array of `{ "id": "UUID", "name": "exact catalogue label" }`, all held by every fixture worker, valid through the engagement end. |

Each **worker** object contains `id`, exact full `name`, exact stored `mobile`, exact
stored `email`, and a nonempty `ticketNumbers` array of the worker's seeded ticket
numbers. These synthetic values are privacy canaries. All mandatory trade credentials
and both companies' mandatory compliance documents must be current and verified.
The line's expected hours must satisfy `minimumHoursPerLine`; workers must have no
existing commitments, transfers, competing nominations or capacity memberships.

## Saved session handling

Capture complete Playwright `storageState` only after signing in normally to the
preview with each reserved fixture identity. For the Maintain fixture, complete the
real Clerk second factor and confirm `/admin/matching` is accessible. Save the full
cookie/origin state; do not hand-edit a JWT or an `fva` claim. Session assurance must
come from Clerk, not from a Boolean in this manifest.

Relative state paths resolve from the manifest's directory. State files must exist
and contain an unexpired applicable `__session` Clerk cookie. The offline preflight
validates cookie fields (including path, flags and expiry), origin/localStorage
records, and optional IndexedDB saved-state structure before preview migrations.
It preserves the original file rather than rewriting credential values. Virtual
WebAuthn `credentials` and unsupported top-level extensions are rejected: this
harness does not restore a virtual authenticator. Capture ordinary session state
after the real Clerk challenge. That shape check is
not proof of identity or MFA: stale, revoked, wrong-role, wrong-tenant or
second-factor-unverified state fails the real route/tenant preflight before writes.

State files are bearer credentials. Keep them outside the checkout and outside
uploaded test artifacts, provide them through an approved secret-file mechanism,
and remove that temporary secret directory after CI. Do not print, commit or attach
their contents. This harness never enumerates or revokes existing sessions.

### CI secret-file provisioning

Configure `E2E_FIXTURE_BUNDLE_JSON` as an approved CI secret with the shape
`{ "manifest": <the manifest above>, "storageStates": { "admin.json": <full state>, ... } }`.
Every state path in the manifest must be a plain filename provided in `storageStates`;
absolute paths, traversal, missing files and unused session credentials are rejected.
Use at most eight files (one admin plus three company states per project; an admin
state may be shared). No default identities or cookies are generated.

`scripts/prepare-e2e-fixtures.mjs` writes the bundle to a fresh private OS temporary
directory, records `E2E_FIXTURES_FILE` in the runner environment, and never logs its
contents. CI validates test discovery before preview migrations. Its always-run
cleanup removes only that validated temporary fixture directory. Missing or expired
secrets fail the gate; rotate genuine fixture sessions through the normal Clerk flow.

## Execution and retained records

Read-only development checks:

```text
npx vitest run src/lib/e2e-fixture-contract.test.ts src/lib/ci-pipeline-contract.test.ts
npx tsc --noEmit --incremental false
npx playwright test --list
```

Only after provisioning and authorizing the stated fixtures and environment:

```text
npm run test:e2e
```

Each project creates two self-serve engagements and one concierge engagement,
including capacity, requirements, matches, audit and notification records. The only
payment action is recording a synthetic off-platform reference; no payment provider
is called. Data and notifications are real within the disposable fixture database.

The mutating group is serial with retries disabled. A partial run is not silently
retried against dirty business fixtures. Self-serve preflight requires empty
capacity/demand/engagement lists. Concierge preflight requires no existing engagement
for its company pair and no requirement carrying this run's marker. Setup must still
guarantee that its workers and companies are fresh; those UI checks are not a general
database-cleanliness proof.

Records are deliberately retained for inspection, not deleted through an elevated
cleanup API. Each test attaches a non-secret `created-transaction-records` manifest
with the run marker and IDs it reached. If setup fails before an ID is collected,
locate the exact run marker in capacity `available_days` and demand `name`/`notes`.
After reviewing the evidence, an authorized operator must reset the **dedicated**
fixture dataset or dispose of that preview database before another mutating run.
Never use a blanket cleanup against a shared or production database.
