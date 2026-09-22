# Coordinated production cutover

This is an operator runbook, not deployment authorization. No production deployment,
external approval configuration, or backup/recovery rehearsal has been proved by
these code changes. Stop if any prerequisite below is missing.

Migration 006 revokes the old `set_engagement_status` execution path; migration 014
revokes old tenant aggregate insert privileges. Older application versions can fail
against this schema. Do not assume backward compatibility or rely on a Vercel-only
rollback to reverse database changes.

The document Save details workflow requires
`20260922000100_company_document_details.sql` before the matching application is
promoted. Its `save_company_document_details_atomic` RPC saves unverified details;
the `attach_company_document_with_snapshot_atomic` RPC then attaches a file to the
same record only if its details are still the ones shown to the uploader. Confirm
`npm run check:database-readiness` exposes both new RPCs before enabling this workflow.

## Before requesting approval

1. Enforce protected-main review/status checks, GitHub `production` environment
   approval by an authorized independent reviewer, and production secrets restricted
   to that environment. Restrict the environment to main. Configure and verify
   Vercel's external promotion controls so a push cannot promote unapproved code.
   This workflow does not configure or prove those controls.
2. Record the exact main commit SHA, migration files/checksums, target project,
   matching application artifact/deployment ID, and release owner. Have the matching
   production-configured artifact ready to promote; CI's dummy-key build is not that
   artifact. Confirm its Clerk, Supabase, and job configuration without logging keys.
3. Gather same-release preview evidence: confirm the preview deployment serves that
   SHA, then pass verification/build/client-secret scanning, clean local migrations,
   live seeded RLS, and starred browser flows. Freeze competing preview writers and
   deployments while validating. A green run against a different/moving preview
   deployment is not release evidence. See `LIVE-VERIFICATION.md` and `E2E-VERIFICATION.md`.
4. Verify a recent usable backup/PITR restore point for the correct production
   project, successful isolated recovery rehearsal, required access, and acceptable
   recovery time/data-loss bounds. Record the recovery evidence and authorized human
   database recovery owner. Merely enabling backups does not establish recoverability.
5. Schedule the maintenance window and freeze other releases. Block application
   writes, pause cron/dispatchers and any other writers, and drain in-flight requests
   and jobs. Verify quiescence before approving migration. Keep the previous artifact
   and a reviewed schema-compatible roll-forward/recovery plan available.

## Execute only after all prerequisites are met

1. Manually dispatch `ci` on `main` with `reviewed_sha` equal to the full 40-character
   commit SHA and `coordinated_cutover` explicitly set to true. The default false
   acknowledgement performs ordinary verification/local checks only; it performs
   no preview or production migration. An acknowledged non-main, malformed, missing,
   or mismatched SHA fails the first verification step before remote work.
2. Wait for all gates in that same run. Every job checks out immutable `github.sha`.
   Before approving the protected production job, recheck the release SHA, preview
   evidence, ready artifact, quiescence, and usable backup. If main or the release
   plan changed, reassess and start a new fully verified release; do not treat an old
   approval as authorization for new code.
3. The approved job applies only the reviewed checkout's migrations using
   `supabase db push --include-all`. Preserve the existing 005 → 007 history:
   `--include-all` is needed for pending 006. Do not remove 007, blindly regrant old
   permissions, or repair migration history to manufacture a clean result.
4. Keep writes/cron paused while promoting the matching application artifact through
   the separately enforced Vercel approval process. Check migration history, health,
   Clerk sign-in/onboarding, current-session admin MFA, tenant isolation, lead/company
   qualification, matching/engagement actions, reports, and notification/job state.
   Reconcile uncertain external delivery outcomes before retrying them. Resume writes
   and then cron only after the release owner accepts post-cutover checks; monitor
   errors and retain non-secret evidence.

## Interruption or failed cutover

New pushes/PRs cannot cancel a running manual cutover; manual runs and the production
job disable in-progress cancellation. Routine CI still cancels obsolete routine runs.
GitHub may replace pending runs, and external/operator cancellation remains possible;
this is not a durable release lock or a recovery guarantee.

On any failed or interrupted migration, keep maintenance/quiescence in place and
inspect the actual applied migration subset and database state before doing more.
Prefer a reviewed schema-compatible roll-forward. Roll back an application only
after proving compatibility with the current schema. If database recovery is needed,
the authorized human recovery owner must execute the rehearsed restore/PITR plan,
account for data written since the restore point and external side effects, and
re-verify the application/schema pair. Never use blind grant rollback, migration
history repair, or an old application promotion as a substitute for database recovery.

Do not place database URLs, credentials, Clerk states, tokens, or backup contents in
logs or release notes. Store only safe identifiers and links to access-controlled
evidence. See GitHub's [workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
and [concurrency rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
for the platform mechanics; external protections must still be verified by operators.
