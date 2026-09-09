# Maintain Workforce specifications

Start with [MVP spec v0.8](maintain-workforce-mvp.md) for the product contract and
[DESIGN.md](../DESIGN.md) for visual design. Confirmed user decisions in the MVP's
opening section supersede older auth, ABN and styling instructions.

| Document | Purpose |
| --- | --- |
| [MVP spec](maintain-workforce-mvp.md) | Required marketplace behaviour, permissions, dashboards, non-goals and unresolved business decisions |
| [9 September alignment](MVP-ALIGNMENT-2026-09-09.md) | Focused dashboard/workflow corrections and current local verification evidence |
| [31 August verification](BUILD-VERIFICATION-2026-08-31.md) | Earlier lifecycle, database, auth and release work; evidence is dated, not a current production verdict |
| [Production cutover](../seed-data/PRODUCTION-CUTOVER.md) | Required application/schema coordination and recovery procedure |
| [Live verification](../seed-data/LIVE-VERIFICATION.md) / [Browser verification](../seed-data/E2E-VERIFICATION.md) | Isolated integration fixtures and release checks |

`llm-council-evaluation*.md`, `SELF-ASSESSMENT.md` and `BUILD-SCORECARD.md` preserve
historical evaluations. Their scores describe the reviewed version and are not
evidence that the current build or a deployment has passed every requirement.
`hi-vis-restoration.md` records an earlier marketing restyle; its frozen-content
scope does not prohibit the subsequently requested navigable dashboard or MVP fixes.

Keep the MVP Definition of done and launch checks open until their stated evidence
exists. Local unit/SDK/database tests and fixture previews do not replace live
Clerk, RLS, private-storage, email, browser or production verification.
