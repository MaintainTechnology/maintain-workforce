# MVP alignment — 9 September 2026

This focused pass implements concrete dashboard and workflow gaps against the MVP.
It is not an exhaustive module certification or a production readiness verdict.
The navigable company dashboard work is retained and the contract is reconciled in
[MVP v0.8](maintain-workforce-mvp.md), with [DESIGN.md](../DESIGN.md) governing styling.

## Corrections implemented

| Requirement | Gap and resulting behaviour | Principal evidence |
| --- | --- | --- |
| 14.1, 20.5 | Company dashboard now links its six operational figures and workspace destinations; persistent desktop/mobile navigation, current-route state, lifecycle banners and recovery states are present. Dates use dd/mm/yyyy in Brisbane. | `company-dashboard.test.ts`, `company-profile-refresh.test.ts`; component preview |
| 1.3, 3.2 | Worker and transfer pages exposed write controls to Suspended/Closed companies; these are now read-only. Pending preparation remains available. Proposal decisions and substitution controls require Active status, matching server guards. | `company-workforce-workflows.test.ts`, `company-match-controls-ui.test.ts` |
| 4.3, 7.1 | Uploaded worker evidence was inaccessible and inactive qualification labels could disappear. Current employers now receive private, 300-second signed evidence links; historic labels remain visible and inactive options stay out of new entry. Failed signing has an explicit recovery message. | `company-workforce-workflows.test.ts` using the actual Supabase SDK with mocked HTTP |
| 6.5 | A committed worker without open capacity could appear Unavailable. Current committing engagements now produce Engaged. | `company-workforce-workflows.test.ts` |
| 9.5, 10.3 | Failed capacity, requirement and match-lock reads could look empty or editable. They now reach the workspace error boundary. Any open match locks requirement editing, including matches with no remaining nominations. | `company-exchange-read-ui.test.ts` |
| 12.7 | All-knocked-out nominations lost their history. Supplier views now retain names/reasons and distinguish a substitution opportunity from a Declined proposal requiring Maintain. | `company-match-controls-ui.test.ts`, `matching-read-model.test.ts` |
| 14.2, 14.4 | Unbounded admin queries could truncate totals at the API row limit. Counted, stable pagination now detects incomplete reads; status/timing cards link to supported filters, including separate Upcoming and inclusive Overdue. | `admin-dashboard.test.ts`: 1,205 rows per aggregate table through a 200-row API cap |
| 1.8 | Clerk's default invitation expiry exceeded the specified 72 hours. New and reissued invitations now pass `expiresInDays: 3`; company binding and audit order remain intact. Existing outstanding provider tokens are unchanged. | `invitation-reissue-status.test.ts`, `lead-qualification-concurrency.test.ts` |
| Design system | Operational typography used a mono helper and status pills coloured their labels. Shared styles now use Manrope/tabular digits and decorative status dots with neutral labels; missing utility aliases map to canonical tokens. Admin navigation identifies the current route with 44px targets. Authenticated workspaces own their chrome. | `admin-navigation.test.ts`, full build, component inspection |

No mutation authority, counterparty projections, rate/fee arithmetic or marketplace
state machine was broadened. Existing server guards remain the authority behind
the corrected controls. No migrations, live invitations or external data changes
were performed in this pass.

## Documentation reconciliation

- Clerk credentials, sessions and invitations replace stale Supabase Auth guidance.
  The current server client requires the Clerk `supabase` JWT template and matching
  Supabase trust. `.env.example` now states that requirement.
- Optional ABN applies to onboarding and concierge qualification. Supplied values
  retain checksum/uniqueness checks; activation only requires ABN verification when
  an ABN is supplied. These are existing confirmed decisions, not new relaxations.
- Password policy, authentication delivery, WAF rules and real session MFA retain
  their provider/deployment verification requirements.
- The previous additive-only migration and arbitrary application rollback claims
  are removed. Security migrations require the existing
  [coordinated cutover runbook](../seed-data/PRODUCTION-CUTOVER.md).
- [The specs index](README.md) separates the current contract and evidence from
  historical Council ratings, scorecards and the marketing restyle's frozen scope.

## Verification

- `npm run verify` passed: generated route types/TypeScript, ESLint, **931 tests**
  across 72 passing files, and platform vocabulary lint. **10 live RLS tests were
  skipped**. An outdated navigation source-location assertion was corrected before
  this successful run; rendered navigation also has separate behaviour tests.
- After the final evidence-link touch-target adjustment, **34 focused tests** and
  targeted ESLint passed. These are a subset of the suite, not additional tests.
- `npm run build` passed on the final application source using CI-style dummy
  identity/database settings. `npm run check:client-secrets` scanned **93 browser
  assets** and rendered payloads without finding the build's server-secret sentinel.
  This is a local production-mode build, not a deployed or production-configured artifact.
- Independent implementation review found no actionable issues in the focused
  changes. Documentation review corrections were applied. All relative Markdown
  links in the seven reviewed specs documents resolve; `git diff --check` passed.
- Refreshed visual inspection covered the 1440px desktop preview, 375px mobile
  frame and 320px error state: no horizontal overflow or clipped controls. The
  earlier dashboard navigation inspection also exercised its mobile menu and
  lifecycle states. These are component checks with illustrative data.

The local preview renders the real company dashboard and navigation components
against illustrative data. It checks presentation and navigation affordances; it
does not exercise authenticated destination workflows, live RLS or provider state.

## Still outstanding

1. Execute the [isolated live RLS checks](../seed-data/LIVE-VERIFICATION.md) and
   [starred browser flows](../seed-data/E2E-VERIFICATION.md), including real Clerk
   invitation acceptance/expiry, current-session admin MFA, worker evidence access
   after transfer, and mobile supplier/buyer/transfer decisions.
2. Verify provider and deployment configuration: Clerk password policy/token trust,
   both email providers' delivery, webhook edge rules, live cron, required release
   protections, backups and rehearsed schema-compatible recovery. This pass did not
   inspect production state or apply migrations.
3. Close the MVP's named business decisions: founder catalogue and verified SEQ
   supply, real rate bands, fee and booking minimums, GST/invoice and payment-rail
   decisions, and the existing legal-copy review gate.
4. Complete one real lead-to-engagement transaction through the commercial trigger
   and Active status. That remains the MVP closing milestone.

The Definition of done remains an acceptance checklist. A local pass does not
check off unexecuted live or operational requirements, and this focused review
does not assert that every unreviewed clause is complete.
