# LLM Council Evaluation — Maintain Workforce MVP Developer Brief v0.1

| | |
|---|---|
| Subject | Maintain Workforce MVP Developer Brief v0.1 (36 sections) |
| Reference corpus | maintain-worker-blueprint.md (5 Aug) · maintain-worker-build-spec.md.pdf (5 Aug) · Maintain_Decision_Brief_01 (7 Aug) · Meeting-Summary-2026-08-07.md · MW-Operating-Blueprint-Module-00 v0.2 (7 Aug) · Maintain Capacity_GTM · Maintain-Workforce-Explained_1.pdf |
| Method | LLM Council (3 stages): five independent members answered blind, each with a distinct lens; five independent reviewers verified citations against the source documents and ranked the anonymized answers; the Chairman synthesized on merit and consensus |
| Date | 24 August 2026 |
| Previous evaluation | 4.8 / 10 (multi-agent panel, brief judged without the planning corpus) |

---

## The rating: 5.5 / 10

Member scores: 5, 5, 5.5, 6, 6. Calibration: 0–3 vision doc; 4–5 buildable only with constant founder access; 6–7 strong brief, team makes consequential decisions alone; 8–9 build-ready; 10 exhaustive with acceptance criteria.

The brief sits on the boundary between the 4–5 and 6–7 bands. The skeleton is genuinely strong — a full entity catalogue (s32), status vocabularies, an explicit out-of-scope list (s34), a concrete end-to-end success transaction (s35), and a catalogue-driven architecture rule (s33) that is the single most rework-preventing instruction in the document. Roughly 70 percent of the screens (the CRUD periphery) are buildable from it unattended.

What caps the score is not what the brief omits but what it confidently specifies: at least four settled behaviours that the team's own later decision record reversed, two of them for legal reasons. A competent team building this brief as written would produce a well-structured application that recreates the exact fact pattern (Maintain sets the price, Maintain assigns named individuals, per-person-per-hour with no minimum unit) that Decision Brief 01 told the founders to dismantle before writing any code — and that the customer-facing one-pager already promises customers the opposite of.

Relative to the previous evaluation (4.8), the planning corpus cuts both ways: most gaps turn out to have documented answers, which makes them cheap to fix — but the corpus also exposes the contradictions above, which are more dangerous than gaps because they direct the team to the wrong destination rather than leaving the route open.

---

## Council notes

- **Where they agreed (unanimous):** rate ownership (s13) and worker nomination (s20–22) contradict the confirmed decision record; the 15% fee is hardcoded against an open decision (OD-02); the registration/verification module — which every planning document calls the product — is missing entirely; availability has two sources of truth and no double-booking invariant; the s8 transfer flow contradicts s3/s29 as written; s35 is one happy path with no acceptance criteria; keep Next.js + Supabase + Vercel + Tailwind, cut Three.js and GSAP, add an email provider.
- **The one real disagreement:** whether the brief might be the newest founder word, deliberately superseding the decision record. The Chairman takes the position argued by the top-ranked members: the confirmed decision log (CD-06) and the live customer promise ("You quote your rate", "we never name an individual") bind until the founders record supersession in writing. A spec may overturn a confirmed decision, but only explicitly — silence about which document wins is itself the defect. The improved spec therefore adopts the decision-record positions and lists supersession as an open founder decision.
- **Aggregate ranking:** Red-teamer > Rigorist > Generalist > Pragmatist > First-principles (the Red-teamer's answer was ranked first by all five reviewers).
- **Overridden:** the First-principles recommendation to defer Worker Transfer was rejected — its premise ("no planning document asks for it") is factually wrong; the 7 Aug meeting records the founder explicitly requiring worker reassignment between companies. Transfers stay, redesigned as dedupe-initiated (never a cross-tenant search).

---

## Consensus findings

### A. Contradictions with the planning record (spec defects, not open questions)

1. **Who sets the rate (s13).** Brief: rates "centrally controlled; non-negotiable; not entered by suppliers." Reversed by Decision Brief 01 (D2 fix 4: supplier confirms or overrides their own rate — "one form field... removes the competition-law exposure entirely"), Operating Blueprint OD-01 ("Supplier quotes its rate per request in MVP"), and the customer one-pager ("You quote your rate").
2. **Who names the workers (s20–22).** Brief: Maintain "manually selects the best match" at worker level. Reversed by Operating Blueprint CD-06 (confirmed: "Supplier chooses which qualified tradie(s) fulfil. Maintain never assigns individuals"), the responsibility table ("Selects which tradie fulfils: Maintain — never"), Decision Brief D5, and the one-pager ("we never name an individual... you choose which of your people go"). The Operating Blueprint's guardrail names "Maintain assigning named individuals" as the trigger that makes the model labour hire in substance.
3. **Fee hardcoded (s14).** "×1.15" is baked into the formula; OD-02 says the fee percentage is an open founder decision ("placeholder for modelling only"), and the meeting left the per-tier percentage open.
4. **Pricing unit and minimum booking (s13–15).** Per-person-per-hour with no minimum unit; the meeting set an 8-hour minimum block, OD-07 assumes full-day bookings, Decision Brief D4 recommends a one-crew-day minimum and D2 fix 1 a minimum crew of two. Decision Brief D2: "hourly-per-head is the single most recognisable signature of labour hire."
5. **Beachhead trade (s9, s13, s21, s35).** Every example, the rate card, and the acceptance test are electricians. Decision Brief D3 scores electrical as a licence-gated trade and recommends inner-Brisbane commercial fit-out (carpentry + painting); CD-08 says SEQ commercial roofing; the GTM doc says commercial electrical. The planning documents conflict with each other; the brief silently canonises one contested option instead of flagging the decision.
6. **Rate structure conflict (s13).** Four proficiency levels at $45/$65/$80/$95 versus the meeting's three tiers at $60/$85/$120. "Actual production rates will be supplied separately" covers values, not structure.
7. **Payment promise vs scope (s34).** Payments are excluded (defensibly), but the one-pager promises "no job starts until the hiring business has pre-authorised payment" and CD-02 confirms Stripe Connect. The engagement record needs handoff fields linking to the manual payment process, and OD-04 (pre-auth expiry) flagged as unresolved — recorded, not built.
8. **Engagements record estimates, not outcomes (s24).** CD-09 makes confirmed hours "the truth of what happened"; the concept requires engagements to record the commercial outcome. The brief has no actual-hours or actual-value fields, no Disputed state, and no cancellation fields (meeting decision 10: roughly 3-hour window, minimum fee).

### B. Gaps every document says are the product

9. **No registration or verification workflow.** s31 lists Login and Forgot password only — a company cannot come to exist. s5 has a Pending status with no transition, no ABN validation, no admin verification queue, no company compliance documents (public liability, workers comp, licences) despite CD-05 defining the full verification standard, Blueprint D7 making ABN verification the condition of appearing, and Decision Brief D6 calling the register checks "the first brick of the moat."
10. **Qualification expiry is inert (s12).** Expiry dates are stored and nothing uses them. Decision Brief D6 item 6 (30-day flag, block on lapse) is "the thing a compliance manager will actually pay for."

### C. Internal defects

11. **Match/Engagement state machines contradict (s24).** The Engagement is created "once both parties have accepted" yet carries pre-acceptance statuses (Proposed, Supplier Approval, Buyer Approval); Match has no statuses at all. Engagement cardinality is undecidable (singular Worker field vs multi-worker matches; MatchWorker exists, EngagementWorker does not).
12. **Availability has two sources of truth (s6 vs s15)** with no derivation rule, no formula behind "100% availability" (s21), and nothing preventing a worker being double-booked across overlapping matches or engagements.
13. **Transfer flow contradicts the marketplace model (s8 vs s3/s29)** — the initiating step requires discovering another company's worker, which s3 and s29 forbid; as written it is a poaching workflow the one-pager promises to punish.
14. **Money precision absent.** No storage type, no rounding rule (e.g. $45.10 × 1.15 = $51.865/hr — which cent?), no ex/inc-GST declaration anywhere (OD-03 open), no rate-snapshot timing rule.
15. **Permissions are four lines (s29)** on a multi-tenant system whose cross-company records (Match, Engagement) must show different fields to each party; no RLS specification, no PII stance for worker records (facts about non-users).
16. **No acceptance criteria** beyond one happy path; no seed-data requirement despite the build-spec making it non-negotiable; no notification trigger/recipient/template definition behind s28's list of nouns.

---

## Recommendations (prioritized, all inside the designed concept)

R1. **Rewrite s13 as supplier-owned rates over Maintain-published bands.** The RateCard becomes a recommended band table (trade × proficiency × region, effective-dated). Each supplier confirms or overrides their rate (pre-filled from the band) per capacity line. The buyer always sees one all-in rate, never the split. One extra field; removes the competition-law exposure; matches OD-01, D2 fix 4, and the customer promise.

R2. **Flip the nomination step in s20–23 to CD-06.** The matching workspace shortlists candidates to prove feasibility, but the proposal to the supplier is a shape — trade, proficiency, quantity, dates, rate. The supplier accepts and nominates which of its listed workers fulfil (and may substitute any qualified listed worker). The buyer approves the shape and never selects or sees an individual pre-confirmation; names and ticket facts are revealed only after confirmation, for site access. Every screen in the brief survives; one action moves from Maintain to the supplier.

R3. **Add the Registration and Verification module** — the missing pillar. Public registration (ABN capture, checksum-validated, unique) creates a Pending company plus first administrator; Pending companies can log in and prepare but cannot list, buy, or appear in matching; an admin verification queue works a CD-05 checklist (ABN, public liability, workers comp, trade licences, labour-hire licence field) with per-document number, expiry, file upload and verified-by; 30-day expiry warnings; lapsed documents block new matches.

R4. **Make the fee a platform configuration value** (default 15%, marked placeholder pending OD-02) snapshotted per engagement; add minimum-booking configuration (minimum hours per line, minimum crew size) with founder-set defaults.

R5. **Publish one state machine per entity** (Company, CapacityLine, DemandLine, Match, Engagement, WorkerTransfer) with transitions, triggering actor, and side effects. Match owns the approval states; the Engagement is created only at dual acceptance, starting at Confirmed, with EngagementWorker rows, actual-outcome fields, a Disputed status, and cancellation fields.

R6. **Define availability as arithmetic with one source of truth.** Capacity lines carry the dates/hours; worker marketplace status is derived, never stored; the availability percentage has a formula; open matches soft-hold a worker's dates and Confirmed engagements hard-commit them, enforced with a Postgres exclusion constraint on the worker/daterange.

R7. **Rewrite s8 transfers as dedupe-initiated.** Adding a worker whose email and mobile match an existing worker surfaces "this worker already exists — request transfer" (never revealing the current employer); no cross-tenant browse or search exists; a 5-business-day non-response escalates to Admin Review; transfers are blocked while the worker has a Confirmed or Active engagement unless Maintain overrides; completion automatically withdraws the worker's open capacity lines and declines pending matches.

R8. **Write the money spec.** Integer cents; buyer rate = round-half-up(supplier cents × (1 + fee)); every displayed amount labelled ex GST (invoice flow pending OD-03); rates snapshotted at match proposal; band rows effective-dated; the estimated-value formula stated once.

R9. **Add the RLS and visibility appendix.** Per-table ownership classification; per-party projections on Match and Engagement (the buyer's view never contains the supplier rate or fee columns; the supplier's view never contains the buyer rate); worker PII is facts-only, never exposed to buyers pre-confirmation; Supabase region ap-southeast-2 for Australian data residency.

R10. **Grant Maintain admins concierge entry** — create and edit capacity and demand on a company's behalf (availability will be phoned in, not typed in by subbies), flagged and audited as admin-entered.

R11. **Convert s35 into roughly fifteen acceptance scenarios** covering the happy path, supplier decline, buyer decline, partial fill, capacity withdrawal mid-match, engagement cancellation, transfer decline and timeout, expired-qualification match attempts, and double-booking prevention.

R12. **Add the engineering section:** existing maintain-workforce repo as the host (authenticated route groups), DESIGN.md tokens (never hardcode colours), seed data as a founder-supplied launch precondition, notification trigger/recipient/template table, qualification/document expiry cron, WCAG AA floor, and a terminology appendix (no "labour", "hire", "staff supply" in UI copy or identifiers; the one-pager's vocabulary is the approved register). Keep legally sensitive copy as config so counsel's answers change text, not architecture.

R13. **De-anchor the beachhead.** Strip electrician examples; make the acceptance tests trade-agnostic; the seed catalogue and rate-band content become a named founder deliverable with the CD-08 / D3 / GTM conflict flagged for resolution.

R14. **Phase the build:** Phase 1 is the admin portal end-to-end plus minimal company intake (Maintain operates both sides concierge-style from day one); Phase 2 is company self-serve dashboards and approval flows. Software follows the manual process instead of preceding it.

---

## Stack and dependency verdict

| Dependency | Verdict | Reasoning |
|---|---|---|
| Next.js (App Router) | Keep | Recorded decision (Blueprint D9); the repo already runs Next.js 16; build the platform as authenticated route groups in the same app |
| Supabase | Keep | Auth + Postgres + RLS + Storage; RLS is the correct enforcement of s29 tenancy; region ap-southeast-2 |
| Vercel | Keep | Hosting plus Vercel Cron for the expiry job |
| Tailwind CSS | Keep | v4 already installed with the Hi-Vis token layer |
| GSAP | Cut from the app | The specced motion (fade-rise reveal, hover lift, one pulsing dot, reduced-motion respected) is plain CSS; tolerate only on the marketing homepage if the hero ledger truly demands timeline animation, lazy-loaded |
| Three.js | Cut | No document, screen, or design-system rule calls for 3D; pure bundle weight on a trust-first operations tool |
| @supabase/supabase-js + @supabase/ssr | Add | Auth/DB/Storage client for the App Router |
| supabase CLI (dev) | Add | Migrations plus generated TypeScript types; no ORM |
| Resend + react-email | Add (Resend already installed) | The ~15 transactional emails in s28; templates as code |
| zod + react-hook-form + @hookform/resolvers | Already installed — reuse | The product is ~70% forms; validation at the trust boundary |
| @tanstack/react-table | Add | Matching workspace filter/sort/multi-select |
| date-fns | Add | Availability-window display math (overlap logic lives in SQL daterange) |
| vitest | Add | Unit tests for fee/rounding and availability arithmetic |
| @playwright/test | Add | The s35 acceptance path end-to-end |
| ABN checksum | No dependency | ~20 lines inline; ABR API lookup is v2 |
| PostGIS / geocoding, Prisma, queues, SMS providers | Reject | Region-FK filtering suffices for a one-region MVP; Supabase CLI covers migrations; volumes are tens of events/day; s28 excludes SMS |

---

## Open founder decisions the spec must carry, not answer

1. Platform fee percentage (OD-02) — spec treats it as configuration, default 15% placeholder.
2. Beachhead seed trade and catalogue content (CD-08 roofing vs D3 fit-out carpentry/painting vs GTM electrical).
3. Rate band values (and confirmation of the three-tier vs four-level structure).
4. GST treatment and invoice flow (OD-03, accountant).
5. Minimum booking values (8-hour block vs crew-day display; minimum crew size).
6. Whether the brief's Maintain-set-rate and Maintain-selects-worker positions were intended to supersede CD-06/OD-01 — if so, record it in the decision log with legal sign-off; the spec assumes the decision record stands.
7. Product name (Decision Brief D1 recommends Maintain Crew; brief and repo say Maintain Workforce/Worker) — copy is config either way.

---

*Produced by the llm-council skill: five independent members (pragmatist, red-team, domain-rigor, first-principles, generalist lenses), five blind reviewers with document-verified rankings, Chairman synthesis. This file is the input to the improved build spec at specs/maintain-workforce-mvp.md.*
