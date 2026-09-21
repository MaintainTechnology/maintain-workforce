# Worker creation and account activation recovery

## Production recovery completed on 21 September

Following the user's explicit instruction to perform the production migration and
recovery, the nine previously missing migrations were applied to
`utamwkhekhkplzeurlhv` using the native Supabase CLI, `db push --linked
--include-all --skip-vault`. The original migration versions and existing 007
history were preserved. A subsequent dry run reports `upToDate: true`, with no
pending migrations; the database now has all 19 repository migrations.

Before applying, a counts-only preflight found no duplicate engagements, orphaned
engagements, duplicate open worker transfers, or active competing transactions.
The existing seven completed provider backups were checked. A fresh snapshot of
all 36 public application tables (404 records) was saved locally outside Git in an
access-restricted recovery directory. Those records were restored into an isolated
local PostgreSQL-compatible database at the old 005 → 007 schema, then upgraded
using the exact nine migration files. The rehearsal preserved all record counts.
The snapshot is an application-data recovery aid; the provider backups remain the
full database recovery mechanism. No full provider restore/PITR drill was performed.

Live verification after applying confirmed:

- Every one of the 404 original records still matches its pre-migration values.
- All four worker/verification/approval API functions are present.
- A rollback-only synthetic database check passed worker creation for a Pending
  company, consent, employment, skills, travel regions, duplicate handling, and
  audit recording, using the same service role as the application.
- The same check rejected incomplete company verification, accepted a complete
  synthetic checklist, recorded activation atomically, and enforced stale-status,
  suspension and closure rules. Anonymous/authenticated roles cannot execute the
  privileged creation/approval RPCs.
- All synthetic records rolled back, with no emails or stored test companies,
  workers, documents, notifications or audit records left behind.

This verifies the live database contract. It does not claim an authenticated
customer-browser submission, staff MFA journey, document upload or email delivery.
The three actual companies remain Pending. The user subsequently designated the
staff identity recorded below; its pending invitation does not activate a company.

The initial release-process findings below are retained as dated evidence. The
user authorized this direct incident repair after those findings were explained;
missing CI preview fixtures and protection configuration were not fabricated or
silently marked complete.

## Initial application release

Production deployment `dpl_6TbVYGkDuyU22wfmU896JDh2MuEb` was built from isolated,
committed source `004ba087b995b0c1b8a907655921aaba16dbcd30`. It includes the reviewed
worker error handling, metadata-role access fix, workspace admin navigation,
company-status layout refresh, regression coverage and read-only readiness check.
The deployment excludes environment files, the private recovery snapshot, caches,
agent tooling and unused design masters.

The existing production environment was used for the remote Next.js build and
TypeScript validation. The resulting artifact was checked before promotion, then
promoted to `https://www.maintainworkforce.com.au`. Canonical checks at
`2026-09-21T00:32:44Z` returned healthy HTTP 200 from `/api/health`, HTTP 200 from
`/signin` and `/signup`, and HTTP 307 to sign-in for signed-out requests to
`/app/workers` and `/admin/verification`. Protected routes were not made public.

## Confirmed live cause before recovery

On 21 September 2026, production deployment `dpl_EwNGQdfuEo1GUjdXF9b1zpPP1heC`
served commit `99a347978787fe289799cc7ef5d8d89a2b9c16fd` at
`https://www.maintainworkforce.com.au`. The corresponding Supabase project is
`utamwkhekhkplzeurlhv` (`maintain-workforce`). Read-only PostgreSQL and PostgREST
OpenAPI checks both confirmed that `create_worker_transactional` and
`transition_company_status_atomic` were absent. This prevented worker creation and
company activation regardless of consent or repeated submissions.

The database then had 10 applied migrations: 001–005 from 28 August plus the four
25 August migrations and 007. Nine committed migrations were missing:

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

The app was ahead of its database. CI run `35448824382` passed verification and local
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

## Database release procedure and initial blockers

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
These were the initial observations; the production migration and its bounded
verification are recorded above.

After the coordinated migration, rerun the preflight. Verify an authenticated
Pending-company worker save, its employment/consent/audit records, and the
staff approval flow using approved test fixtures. Refresh the company workspace
after approval; changes do not push into another person's already-open tab.

## Grant staff approval access using Clerk

The user clarified the access contract after the initial recovery on 21 September:
Clerk's server-controlled `publicMetadata.isAdmin` must be the boolean `true` to
grant staff approval access. Existing `publicMetadata.role = maintain_admin`
grants remain compatible when `isAdmin` is absent. An explicit `isAdmin: false`
revokes access even if a legacy role remains. A present malformed value, including
the string `"true"`, does not grant access. The server reads current Clerk user metadata; client
state, stale session metadata and user-editable unsafe metadata do not grant access.

Authenticated staff without MFA enrollment can use the admin panel on the current
Clerk plan. Staff who already have MFA enabled must verify their second factor in
the current session. This corrected policy supersedes the earlier blanket MFA
requirement and plan blocker below; no paid plan change is required or authorized.
Company status stays in the database, and staff still review the required documents
before approving a company. Setting `isAdmin` does not itself activate a company.

### Initial designated staff setup and superseded MFA blocker

The user authorized `info@maintainworkforce.com.au` for staff access. An exact-email
production lookup found no existing Clerk user and no pending invitation. A
three-day invitation was then created with `publicMetadata.role = maintain_admin`
and `notify: false`. Its pending status, exact email and metadata were read back,
and application audit event 22 records this as a user-authorized automated
recovery action. No existing user's role was modified and no email was sent.
The acceptance URL is held only in the ignored, access-restricted local recovery
directory, with a private setup page; it must not be committed or deployed.

At the initial setup, this was a prepared invitation. The staff member must accept
it and establish their own credentials. The initial code required MFA for every
staff account. Production Clerk had no MFA strategy enabled, and its dashboard
required Pro for authenticator MFA; the checkout presented 25 due today and 25 per
month, without add-ons. The user chose to keep the current plan. The unpurchased
checkout was cancelled and no charge was made. These are historical observations,
not a requirement to upgrade or a current blocker for staff without MFA enrollment.

The user's subsequent clarification above replaces that blanket requirement.
The initial pending invitation was replaced with a three-day invitation carrying
`publicMetadata.isAdmin = true`, verified by backend readback and audit event 23.
The old invitation was revoked, and the private local setup page was updated with
the replacement acceptance link. No invitation email was sent. The designated
email is still awaiting signup; no existing user was modified. Legacy roles remain
accepted for existing accounts, but new grants use `isAdmin`. Any staff member already enrolled in
MFA must still complete their second factor. For optional MFA configuration, see
[Clerk MFA configuration](https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options#multi-factor-authentication).

### Normal grant and approval procedure

1. Choose the exact authorized staff account in the **production** Clerk instance
   (`clerk.maintainworkforce.com.au`). For the existing-user grant script, it must
   have signed up already. The designated invitation above assigns the same role
   when accepted; do not create a duplicate account or invitation.
2. Grant the backend-controlled public metadata value:

   ```json
   { "isAdmin": true }
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
3. Sign in and open `/admin/verification`. An authenticated staff account with
   `isAdmin: true` can use the approval panel without buying an MFA plan or enrolling
   in MFA. If that account already has MFA enabled, verify its second factor in the
   current session. Access checks read current backend public metadata, so stale
   session claims must not prevent newly authorized staff from reaching the panel.
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

## Database advisor findings

The post-recovery security advisor was reviewed, not reported as warning-free.
Six definer views are intentional party-filtered projections: anonymous reads
and authenticated writes were denied; membership-scoped reads remain available.
Eleven tables with RLS and no policy are private, deny-by-default surfaces.
No new access regression was identified in the bounded source/grant review.

Existing hardening follow-ups remain for pinning `is_committing`'s search path,
reviewing the `btree_gist` extension in `public`, and tightening excess anonymous
grants. These were not changed during the incident migration. Advisor references:
[definer views](https://supabase.github.io/splinter/0010_security_definer_view/),
[RLS without policies](https://supabase.github.io/splinter/0008_rls_enabled_no_policy/),
[mutable search paths](https://supabase.github.io/splinter/0011_function_search_path_mutable/),
and [extensions in public](https://supabase.github.io/splinter/0014_extension_in_public/).

## Verification of the metadata access correction

- `npm run verify` passed: TypeScript, ESLint, 1,075 tests, and vocabulary checks.
- Ten live RLS tests remain skipped because live fixtures are not configured.
- Tests exercise the real approval action with backend `isAdmin: true`, no MFA
  enrollment, the signed-in audit actor, and rejection of incomplete checklists.
- Negative cases cover signed-out access, self-edited metadata, forged form data,
  string flags, explicit revocation over legacy roles, and missing MFA proof for
  already-enrolled staff. Desktop/mobile account links and grant rollback pass.
- Independent source review found no actionable issues. No database migration or
  company activation is part of this metadata correction.

## Initial local verification

- `npm run verify` passed: TypeScript, ESLint, 1,049 tests, and vocabulary checks.
- `npm run build` passed with the current local environment.
- Ten live RLS tests were skipped because live test fixtures are not configured.
- Independent review covered worker error handling, the Clerk role/MFA boundary,
  layout refresh, read-only schema preflight, and the out-of-order upgrade test.
- Before recovery the preflight correctly failed for all four absent RPCs. After
  recovery the same live preflight passes; rollback-only database smoke also passed.
