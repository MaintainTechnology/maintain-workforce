import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { z } from "zod";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { requireCompanyAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addWorkerQualification, setWorkerAccountStatus } from "@/lib/actions/worker";
import { BTN_GHOST, BTN_PRIMARY, H2, LINK } from "@/lib/ui";
import { CARD, MONO, TABLE, TD, TH, formatDate, pill, toneFor } from "@/lib/platform-ui";
import type { DocumentStatus } from "@/lib/supabase/types";

// Worker record — spec 6.1, 6.3, 6.4, 6.6 and module 7.
//
// Facts only: there is no rating or score anywhere on this screen, because 6.3 keeps
// them out of the schema. Everything shown is either stored fact or a documented
// derivation, and the derivations say so.

export const metadata: Metadata = { title: "Worker" };

/** 20.5 — calendar dates in Australia/Brisbane; Queensland has no daylight saving. */
function brisbaneToday(): string {
  return new Date(Date.now() + 10 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * 7.1 — qualification status is derived, never manually set. The daily job (19) writes
 * the same value to the column; this is the between-runs read-time derivation, which is
 * why the column is not simply displayed.
 */
function credentialStatus(expiry: string | null, today: string): DocumentStatus {
  if (!expiry) return "Current";
  if (expiry < today) return "Expired";
  const horizon = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return expiry <= horizon ? "Expiring Soon" : "Current";
}

const NOTICES: Record<string, string> = {
  "status-updated": "Worker status updated.",
  "qualification-added": "Qualification saved.",
  "not-permitted": "That change is not yours to make.",
  invalid: "That entry was not valid.",
  "file-too-large": "Evidence documents are capped at 10 MB.",
  "file-type": "Evidence must be PDF, JPG or PNG.",
  "upload-failed": "The file could not be stored. Try again.",
};

export default async function WorkerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { companyStatus } = await requireCompanyAdmin();
  const readOnly = companyStatus === "Suspended" || companyStatus === "Closed";
  const { id } = await params;
  const { notice } = await searchParams;
  // worker.id is a uuid; anything else is a URL nobody was given, so it is a 404 rather
  // than a PostgREST type error dressed up as a failed read.
  if (!z.uuid().safeParse(id).success) notFound();
  const supabase = await createClient();
  const today = brisbaneToday();

  // RLS keys `worker` on the open employment row (17.1), so a worker who has transferred
  // away is simply not here — no extra check is needed, and none would be trustworthy.
  const { data: worker, error: workerError } = await supabase
    .from("worker")
    .select(
      "id, first_name, last_name, mobile, email, status, base_region_id, primary_trade_id, primary_proficiency_id, proficiency_overridden_by_maintain, proficiency_changed_at, consent_confirmed_at, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  // Only a successful empty answer is a 404; a rejected read says so instead.
  if (workerError) throw new Error("This worker record could not be loaded. Please try again.");
  if (!worker) notFound();

  const [
    tradesResult,
    proficienciesResult,
    regionsResult,
    qualificationsResult,
    workerQualificationsResult,
    employmentResult,
    skillsResult,
    travelResult,
  ] = await Promise.all([
    supabase.from("trade_role").select("id, name"),
    supabase.from("proficiency").select("id, name"),
    supabase.from("region").select("id, name"),
    // Inactive catalogue names stay on historical records (4.3); only new entry is filtered.
    supabase.from("qualification").select("id, name, is_active").order("name"),
    supabase
      .from("worker_qualification")
      .select("id, qualification_id, number, issue_date, expiry_date, file_path")
      .eq("worker_id", id),
    // 17.1 — the company reads its own employment rows only. A previous employer keeps
    // its history and gains nothing live.
    supabase
      .from("worker_employment")
      .select("id, company_id, start_date, end_date, end_reason")
      .eq("worker_id", id)
      .order("start_date", { ascending: false }),
    supabase.from("worker_skill").select("skill_id").eq("worker_id", id),
    supabase.from("worker_travel_region").select("region_id").eq("worker_id", id),
  ]);

  if (
    [
      tradesResult,
      proficienciesResult,
      regionsResult,
      qualificationsResult,
      workerQualificationsResult,
      employmentResult,
      skillsResult,
      travelResult,
    ].some((result) => result.error)
  ) {
    throw new Error("This worker record could not be loaded. Please try again.");
  }

  const tradeName = new Map((tradesResult.data ?? []).map((t) => [t.id as string, t.name as string]));
  const proficiencyName = new Map(
    (proficienciesResult.data ?? []).map((p) => [p.id as string, p.name as string]),
  );
  const regionName = new Map((regionsResult.data ?? []).map((r) => [r.id as string, r.name as string]));
  const qualificationName = new Map(
    (qualificationsResult.data ?? []).map((q) => [q.id as string, q.name as string]),
  );
  const qualifications = workerQualificationsResult.data ?? [];
  // 7.1 — sign on the server using the current employer's session. The storage read
  // policy checks the worker's open employment, including evidence uploaded before
  // a transfer. No path is moved or exposed as a public document URL.
  const evidenceUrls = new Map(await Promise.all(
    qualifications.filter((row) => row.file_path).map(async (row) => {
      const { data } = await supabase.storage
        .from("worker-qualifications")
        .createSignedUrl(row.file_path as string, 300);
      return [row.id as string, data?.signedUrl] as const;
    }),
  ));

  const skillIds = (skillsResult.data ?? []).map((s) => s.skill_id as string);
  let skillNames: string[] = [];
  if (skillIds.length > 0) {
    const { data, error } = await supabase.from("skill").select("id, name").in("id", skillIds);
    if (error) throw new Error("This worker record could not be loaded. Please try again.");
    skillNames = (data ?? []).map((s) => s.name as string);
  }

  const travelRegions = (travelResult.data ?? [])
    .map((row) => regionName.get(row.region_id as string))
    .filter((name): name is string => Boolean(name));

  const nextStatus = worker.status === "Active" ? "Inactive" : "Active";

  return (
    <div className="flex max-w-[900px] flex-col gap-(--space-6)">
      <div>
        <Link href="/app/workers" className={LINK}>
          Back to your crew
        </Link>
        <div className="mt-(--space-4) flex flex-wrap items-center gap-(--space-4)">
          <h1 className={H2}>
            {worker.first_name} {worker.last_name}
          </h1>
          <span className={pill(toneFor(String(worker.status)))}>{worker.status}</span>
        </div>
      </div>

      {notice && NOTICES[notice] ? (
        <div className={CARD} role="status">
          <p className="text-body text-on-dark">{NOTICES[notice]}</p>
        </div>
      ) : null}

      <section className={CARD}>
        <h2 className="text-title font-display font-bold text-on-dark">Profile</h2>
        <dl className="mt-(--space-4) grid gap-(--space-4) sm:grid-cols-2">
          <Fact label="Mobile" value={worker.mobile} mono />
          <Fact label="Email" value={worker.email} mono />
          <Fact label="Base region" value={regionName.get(worker.base_region_id as string) ?? "—"} />
          <Fact label="Primary trade" value={tradeName.get(worker.primary_trade_id as string) ?? "—"} mono />
          <Fact
            label="Primary proficiency"
            value={proficiencyName.get(worker.primary_proficiency_id as string) ?? "—"}
            mono
            /* 6.6 — proficiency provenance is on the record, so a Maintain override is
               readable long after the fact rather than being invisible history. */
            note={
              worker.proficiency_overridden_by_maintain
                ? `Set by Maintain on ${formatDate(worker.proficiency_changed_at)}`
                : undefined
            }
          />
          <Fact label="Additional skills" value={skillNames.length > 0 ? skillNames.join(", ") : "—"} />
          <Fact label="Travel regions" value={travelRegions.length > 0 ? travelRegions.join(", ") : "—"} />
          {/* 6.3 — the consent record is part of the profile, not a hidden column. */}
          <Fact label="Consent recorded" value={formatDate(worker.consent_confirmed_at)} mono />
        </dl>

        {/* 6.5 / module 19 — a company admin moves its own worker between Active and
            Inactive. Suspended is Maintain's, and the action refuses it outright. */}
        {readOnly ? (
          <p className="mt-(--space-5) text-body-sm text-on-dark-muted">
            This account is read-only. Worker records and qualifications remain available to view.
          </p>
        ) : worker.status !== "Suspended" ? (
          <form action={setWorkerAccountStatus} className="mt-(--space-5) flex flex-wrap items-center gap-(--space-3)">
            <input type="hidden" name="worker_id" value={worker.id as string} />
            <input type="hidden" name="status" value={nextStatus} />
            <button type="submit" className={BTN_GHOST}>
              Mark {nextStatus.toLowerCase()}
            </button>
            <span className="text-body-sm text-on-dark-muted">
              Account status only. Availability comes from your capacity lines.
            </span>
          </form>
        ) : (
          <p className="mt-(--space-5) text-body-sm text-on-dark-muted">
            This worker was suspended by Maintain. Only Maintain can reactivate the account.
          </p>
        )}
      </section>

      <section className={CARD}>
        <h2 className="text-title font-display font-bold text-on-dark">Employment with you</h2>
        <p className="mt-(--space-2) text-body-sm text-on-dark-muted">
          The open row — the one with no end date — is the current employer. Changing
          employer never creates a second worker record.
        </p>
        <div className="mt-(--space-4) overflow-x-auto">
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>From</th>
                <th className={TH}>To</th>
                <th className={TH}>End reason</th>
              </tr>
            </thead>
            <tbody>
              {(employmentResult.data ?? []).map((row) => (
                <tr key={row.id as string}>
                  <td className={`${TD} ${MONO}`}>{formatDate(row.start_date as string)}</td>
                  <td className={`${TD} ${MONO}`}>
                    {row.end_date ? formatDate(row.end_date as string) : "Current"}
                  </td>
                  <td className={TD}>{(row.end_reason as string | null) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={CARD}>
        <h2 className="text-title font-display font-bold text-on-dark">Qualifications</h2>
        <p className="mt-(--space-2) max-w-[60ch] text-body-sm text-on-dark-muted">
          Status is worked out from the expiry date and cannot be set by hand. These
          records follow the worker: if they move to another business, the documents go
          with them and stay where they were filed.
        </p>

        <div className="mt-(--space-4) overflow-x-auto">
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>Qualification</th>
                <th className={TH}>Number</th>
                <th className={TH}>Issued</th>
                <th className={TH}>Expires</th>
                <th className={TH}>Status</th>
                <th className={TH}>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {qualifications.length === 0 ? (
                <tr>
                  <td className={TD} colSpan={6}>
                    None recorded yet.
                  </td>
                </tr>
              ) : (
                qualifications.map((row) => {
                  const status = credentialStatus((row.expiry_date as string | null) ?? null, today);
                  return (
                    <tr key={row.id as string}>
                      <td className={TD}>
                        {qualificationName.get(row.qualification_id as string) ?? "—"}
                      </td>
                      <td className={`${TD} ${MONO}`}>{(row.number as string | null) ?? "—"}</td>
                      <td className={`${TD} ${MONO}`}>{formatDate(row.issue_date as string | null)}</td>
                      <td className={`${TD} ${MONO}`}>{formatDate(row.expiry_date as string | null)}</td>
                      <td className={TD}>
                        <span className={pill(toneFor(status))}>{status}</span>
                      </td>
                      <td className={TD}>
                        {evidenceUrls.get(row.id as string) ? (
                          <a
                            href={evidenceUrls.get(row.id as string)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`${LINK} inline-flex min-h-11 items-center`}
                            aria-label={`Open evidence for ${qualificationName.get(row.qualification_id as string) ?? "qualification"}`}
                          >
                            Open evidence
                          </a>
                        ) : row.file_path ? "Unavailable — refresh to retry" : "No document"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!readOnly && <form action={addWorkerQualification} className="mt-(--space-5) grid gap-(--space-4) sm:grid-cols-2">
          <input type="hidden" name="worker_id" value={worker.id as string} />
          <label className="flex flex-col gap-(--space-2)">
            <span className="text-sm font-semibold text-on-dark">Qualification</span>
            <select
              name="qualification_id"
              required
              className="min-h-11 w-full rounded-(--radius-md) border border-hairline bg-black-2 px-(--space-4) py-(--space-3) text-body text-on-dark"
            >
              <option value="">Choose one</option>
              {(qualificationsResult.data ?? []).filter((q) => q.is_active).map((q) => (
                <option key={q.id as string} value={q.id as string}>
                  {q.name as string}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-(--space-2)">
            <span className="text-sm font-semibold text-on-dark">Licence or ticket number</span>
            <input
              name="number"
              className="min-h-11 w-full rounded-(--radius-md) border border-hairline bg-black-2 px-(--space-4) py-(--space-3) text-body text-on-dark"
            />
          </label>
          <label className="flex flex-col gap-(--space-2)">
            <span className="text-sm font-semibold text-on-dark">Issued</span>
            <input
              name="issue_date"
              type="date"
              className="min-h-11 w-full rounded-(--radius-md) border border-hairline bg-black-2 px-(--space-4) py-(--space-3) text-body text-on-dark"
            />
          </label>
          <label className="flex flex-col gap-(--space-2)">
            <span className="text-sm font-semibold text-on-dark">Expires</span>
            <input
              name="expiry_date"
              type="date"
              className="min-h-11 w-full rounded-(--radius-md) border border-hairline bg-black-2 px-(--space-4) py-(--space-3) text-body text-on-dark"
            />
          </label>
          <label className="flex flex-col gap-(--space-2) sm:col-span-2">
            <span className="text-sm font-semibold text-on-dark">Evidence document (optional)</span>
            <input
              name="file"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              className="min-h-11 w-full rounded-(--radius-md) border border-hairline bg-black-2 px-(--space-4) py-(--space-3) text-body text-on-dark file:mr-(--space-3) file:border-0 file:bg-transparent file:text-on-dark-muted"
            />
            <span className="text-sm text-on-dark-muted">
              PDF, JPG or PNG, up to 10 MB. You can save the qualification details without a file.
            </span>
          </label>
          <div className="sm:col-span-2">
            <PendingSubmitButton className={BTN_PRIMARY} idleLabel="Save qualification" />
          </div>
        </form>}
      </section>
    </div>
  );
}

function Fact({
  label,
  value,
  mono,
  note,
}: {
  label: string;
  value: string;
  mono?: boolean;
  note?: string;
}) {
  return (
    <div>
      <dt className="text-label uppercase tracking-[0.08em] text-on-dark-faint">{label}</dt>
      <dd className={`mt-(--space-1) text-body text-on-dark ${mono ? MONO : ""}`}>{value}</dd>
      {note ? <p className="mt-(--space-1) text-body-sm text-on-dark-muted">{note}</p> : null}
    </div>
  );
}
