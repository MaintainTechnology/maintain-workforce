# Worker creation and account activation recovery

## Confirmed live cause

On 21 September 2026, production deployment `dpl_EwNGQdfuEo1GUjdXF9b1zpPP1heC`
served commit `99a347978787fe289799cc7ef5d8d89a2b9c16fd` at
`https://www.maintainworkforce.com.au`. The corresponding Supabase project is
`utamwkhekhkplzeurlhv` (`maintain-workforce`). Read-only PostgreSQL and PostgREST
OpenAPI checks both confirmed that `create_worker_transactional` and
`transition_company_status_atomic` are absent. This prevents worker creation and
company activation regardless of consent or repeated submissions.

The database has 10 applied migrations: 001–005 from 28 August plus the four
25 August migrations and 007. Nine committed migrations are missing:

| Version (28 August 2026) | Migration |
| --- | --- |
| 006 | transactional_engagement_lifecycle |
| 008 | transactional_matching |
| 009 | transactional_intake |
| 010 | transactional_transfer |
| 011 | notification_retry |
| 012 | transactional_daily_job |
| 013 | transactional_company_lifecycle |
| 014 | authoritative_tenant_mutations |
| 015 | historical_engagement_profiles |

The app is ahead of its database. CI run `35448824382` passed verification and local
database tests but failed the isolated-preview configuration check; the production
migration job did not run. `/api/health` still returns healthy because it tests
database connectivity, not the required functions.

Run the new read-only preflight with the intended environment already loaded:

```powershell
npm run check:database-readiness
# Or use one reviewed environment file, without printing its contents:
node --env-file=.env.local scripts/check-database-readiness.mjs
```

This reads the API schema only. It never invokes worker creation or company
activation, and fails if any of the four worker/approval RPCs are absent.

## Database release

Use the existing [production cutover procedure](PRODUCTION-CUTOVER.md). Apply the
complete reviewed missing sequence with `supabase db push --include-all`, keeping
007 in place; 006 must be inserted before applying 008 onward. Do not patch only
the missing RPCs or bypass the migration history. Migrations 006 and 014 change
execution privileges, so an old application-only rollback is insufficient.

The new isolated PostgreSQL regression reproduces the observed 005 → 007 state,
keeps a synthetic existing Pending company and membership, applies all missing
migrations, and verifies worker creation and the company lifecycle checks.
It also verifies that the upgrade does not approve companies automatically.

At diagnosis, seven completed physical backups existed (latest
`2026-09-20T19:34:35.969Z`); PITR was disabled and a recovery rehearsal was not
verified. Main was unprotected, the Production environment had no protection
rules, and the repository/Production secret lists were empty. The same-release
preview and protected cutover prerequisites therefore remain unfulfilled.
These are observations, not a completed production migration or deployment.

After the coordinated migration, rerun the preflight. Verify an authenticated
Pending-company worker save, its employment/consent/audit records, and the
staff approval flow using approved test fixtures. Refresh the company workspace
after approval; changes do not push into another person's already-open tab.

## Grant staff approval access using Clerk

The user selected **Clerk admin role, then approval in the dashboard**. Company
status stays in the database. Customer metadata cannot activate a company.

1. Choose the exact authorized staff account in the **production** Clerk instance
   (`clerk.maintainworkforce.com.au`). It must have signed up already. No live
   staff role was selected or granted during this diagnosis; both existing users
   had empty public metadata.
2. Grant the backend-controlled public metadata value:

   ```json
   { "role": "maintain_admin" }
   ```

   Preserve unrelated metadata. Do not place this in unsafe metadata, and do not
   assign the platform staff role to customers just to activate their companies.
   Use the existing audited grant script with the intended Clerk/Supabase
   environment and a named operator:

   ```powershell
   node --env-file=.env.local scripts/grant-maintain-admin.mjs <staff-email> --by <operator-email>
   ```

   The script records the role grant in `audit_event` and attempts to restore the
   previous metadata if that audit write fails. A manual Clerk Dashboard edit
   has the same role effect but does not produce this application audit entry.
3. Sign in and open `/admin/verification`. Staff must enroll in MFA and verify a
   second factor in their current session. A role alone does not bypass MFA.
   Role checks read current backend public metadata, so a stale session role
   must not prevent new staff from reaching the MFA check.
4. Select the Pending company, review/upload its documents, and verify each
   required checklist item. Once complete, select **Approve and activate**.
   This commits the Pending → Active transition and audit record atomically;
   notification is attempted afterward; check Notifications for delivery failures.
   All accepted administrators of that company
   then receive the Active company's permissions.

Backend public metadata and unsafe metadata have different trust rules; see
[Clerk's metadata documentation](https://clerk.com/docs/guides/users/extending).
The database migration workflow follows
[Supabase's migration guidance](https://supabase.com/docs/guides/deployment/database-migrations).

## Local verification

- `npm run verify` passed: TypeScript, ESLint, 1,049 tests, and vocabulary checks.
- `npm run build` passed with the current local environment.
- Ten live RLS tests were skipped because live test fixtures are not configured.
- Independent review covered worker error handling, the Clerk role/MFA boundary,
  layout refresh, read-only schema preflight, and the out-of-order upgrade test.
- The preflight was run against the configured live database and correctly failed
  for all four absent RPCs. No live worker, role, company status or schema was changed.
