# Live verification fixtures

These are preview-only checks, not production data setup. No live check is implied
by a passing ordinary `npm test`: the RLS suite skips without explicit fixtures.
`RLS_TEST_REQUIRED=1` makes missing fixtures a failure, as configured in CI. Partial
explicit RLS configuration also fails instead of silently skipping the suite.

## Clerk and Supabase

Use a dedicated **Clerk development instance** and a seeded Supabase preview
project. Configure the same `supabase` Clerk JWT template used by the application.
The template and Supabase integration must preserve the Clerk user ID in `sub` so
accepted `company_user` membership supplies the tenant boundary. Do not create
Supabase password users for these tests.

Set `RLS_TEST_URL`, `RLS_TEST_ANON_KEY`, `RLS_TEST_SERVICE_KEY`, and
`RLS_TEST_CLERK_SECRET_KEY`. The Clerk secret must start with `sk_test_`; production
keys are rejected before any session request. The service key is used only to
verify the exclusion constraint and clean up newly attempted test rows.

Supply existing Clerk fixture user IDs in:

- `RLS_TEST_COMPANY_A_CLERK_USER_ID` and `RLS_TEST_COMPANY_B_CLERK_USER_ID`
- `RLS_TEST_BUYER_CLERK_USER_ID` and `RLS_TEST_SUPPLIER_CLERK_USER_ID`
- `RLS_TEST_PENDING_CLERK_USER_ID`, `RLS_TEST_SUSPENDED_CLERK_USER_ID`, and
  `RLS_TEST_CLOSED_CLERK_USER_ID`

These users must have accepted membership in the seeded companies, with the named
company statuses. They are not created or granted permissions by the suite. Each
run creates short-lived Clerk sessions for these explicit fixtures, obtains fresh
template tokens, and revokes **only its own created sessions** in cleanup. The
cleanup handle is registered before awaiting setup, so a setup-hook timeout does
not lose ownership of in-flight creations. Cleanup closes token access, immediately
revokes known sessions, and revokes late-returning sessions before setup settles.
Failed revocations fail teardown and can be retried without revoking successful
ones twice. Existing user sessions are not enumerated or revoked.

A killed runner, a provider request that never returns, or a lost creation response
with no returned session ID cannot prove cleanup. Treat a setup/teardown timeout as
a failed run, reconcile sessions in the isolated fixture instance, and never infer
a passing security gate from an interrupted test process.

## Required database rows

The full environment contract is shared in `scripts/validate-rls-fixtures.mjs` and
CI maps each key explicitly. Its no-network preflight runs **before preview
migrations**, rejecting missing values, malformed fixture IDs, non-development
Clerk keys, and a database origin that differs from the preview's configured origin.
It neither creates sessions nor verifies that rows exist; the subsequent live
suite proves those facts. Required fixtures include:

- Owned workers for both Active companies and Pending/Suspended/Closed companies.
- Company B capacity, demand, and document rows hidden from Company A.
- Nonempty buyer/supplier match and engagement projections, plus a company transfer.
- Buyer and supplier engagements cancelled **before** commercial confirmation.
- Private company-document and worker-qualification storage paths.
- A committing engagement-worker and a distinct eligible engagement for attempting
  a conflicting worker/date window. The attempted row receives a new UUID and is
  cleaned up even if the overlap assertion fails; existing fixtures are preserved.

Empty fixtures are a failure, not a passing privacy test. Run:

```text
node scripts/validate-rls-fixtures.mjs
npx vitest run src/lib/rls.integration.test.ts
```

The suite is not evidence of a successful browser MFA challenge. Maintain-admin
browser tests require an actual second-factor-verified Clerk session; enrollment
alone is insufficient.

## Migration ordering

The linked project's recorded history contains `005`, then optional-ABN `007`.
Pending lifecycle `006` was intentionally not deployed with `007`. Apply reviewed
pending migrations to a disposable database first. A later explicitly authorised
deployment must account for older pending migrations (`--include-all`); do not
repair or erase the existing `007` history to force a sequential appearance.

Production requires the separately approved
[coordinated cutover](PRODUCTION-CUTOVER.md). The pending RPC/privilege changes can
break old writers; a successful preview run is neither production authorization nor
proof that application-only rollback is safe.
