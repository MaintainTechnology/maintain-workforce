import type { Metadata } from "next";
import Link from "next/link";
import {
  Fact,
  FactList,
  Notice,
  PageHeader,
  SectionHeader,
  TableEmpty,
  TableFrame,
} from "@/components/admin-page";
import { Icon } from "@/components/icon";
import {
  disqualifyLead,
  importLeads,
  leadFilterOptions,
  markLeadContacted,
  qualifyLead,
} from "@/lib/actions/lead";
import { requireMaintainAdmin } from "@/lib/auth";
import { formatAbn } from "@/lib/domain/abn";
import {
  FIELD,
  FIELD_HINT,
  FIELD_LABEL,
  INPUT,
  INPUT_SM,
  SUBSECTION_TITLE,
  TABLE,
  TD,
  TH,
  formatDate,
  pill,
  toneFor,
} from "@/lib/platform-ui";
import { createAdminClient } from "@/lib/supabase/admin";
import { BTN_GHOST, BTN_GHOST_SM, BTN_PRIMARY, LINK, NAV_FOCUS, PANEL } from "@/lib/ui";

// Spec 0.4 — the Leads queue: list, filter by intent and status, lead detail, and the
// qualify / disqualify actions. A lead is never visible to any company (0.3), so this
// screen is Maintain-only and every read runs with the service-role client behind
// requireMaintainAdmin (17.3).

export const metadata: Metadata = { title: "Leads" };

const FEEDBACK: Record<string, string> = {
  imported: "CSV imported.",
  contacted: "Lead marked Contacted.",
  qualified: "Lead qualified. The Pending company was created and the invitation sent.",
  disqualified: "Lead disqualified.",
};

const PROBLEM: Record<string, string> = {
  invalid: "That request was missing something, so nothing changed.",
  not_found: "That lead no longer exists.",
  not_new: "Only a New lead can be marked Contacted.",
  not_contacted: "Only a Contacted lead can be qualified or disqualified. Mark a New lead Contacted first.",
  status_update_failed: "The lead status update could not be confirmed. Review the current lead before trying again.",
  status_changed: "The lead changed or is no longer available. Review its current details before trying again.",
  no_file: "Choose a CSV file to import.",
  empty_csv: "That CSV had no rows under its header.",
  qualification_details_invalid:
    "Qualification needs a company legal name and a valid contact email. ABN is optional; any supplied ABN must be valid.",
  abn_checksum: "That ABN fails the standard 11-digit checksum.",
  abn_taken: "That ABN already belongs to a registered company, so this lead cannot be qualified.",
  already_qualified: "This lead is already linked to a company.",
  lead_changed:
    "The lead changed while this qualification was being prepared. Review its current details before trying again.",
  qualification_recovery_required:
    "Qualification could not be confirmed or fully reversed. Review the lead, company and invitation before trying again.",
  qualification_invitation_unconfirmed:
    "Qualification was recorded, but the invitation outcome is unconfirmed. The company was not deleted. Refresh the lead and company, check the invitation in Clerk, then re-issue from company administration only if needed.",
  company_create_failed: "The company could not be created. Try again.",
  reason_required: "Record a reason before disqualifying.",
};

/** Statuses that still have a decision to make — the queue's default view. */
const OPEN_STATUSES = ["New", "Contacted"];

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : "";
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireMaintainAdmin();
  const params = await searchParams;

  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");
  const intent = one("intent");
  const status = one("status");
  const selectedId = one("lead");
  const saved = FEEDBACK[one("saved")];
  const problem = PROBLEM[one("error")];

  const { intents, statuses } = await leadFilterOptions();
  const admin = createAdminClient();

  let listQuery = admin
    .from("lead")
    .select("id, source, intent, contact_name, business_name, abn, email, phone, status, company_id, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (intent) listQuery = listQuery.eq("intent", intent);
  if (status) listQuery = listQuery.eq("status", status);

  const [{ data: leads }, { data: industries }, { data: regions }] = await Promise.all([
    listQuery,
    admin.from("industry").select("id, name").eq("is_active", true).order("name"),
    admin.from("region").select("id, name").eq("is_active", true).order("name"),
  ]);

  const selected = selectedId
    ? (await admin.from("lead").select("*").eq("id", selectedId).maybeSingle()).data
    : null;

  const rows = leads ?? [];
  const open = rows.filter((lead) => OPEN_STATUSES.includes(lead.status)).length;
  const filtered = Boolean(intent || status);

  return (
    <div className="flex flex-col gap-(--space-6)">
      <PageHeader
        title="Leads"
        lead="Enquiries from the marketing site and imported lists. Mark a lead Contacted once you have spoken to them, then qualify it into a Pending company or record why not."
        meta={
          <>
            <span><strong className="font-semibold text-on-dark">{open}</strong> awaiting a decision</span>
            <span aria-hidden="true" className="text-on-dark-faint">·</span>
            <span>{rows.length} shown{filtered ? " with filters" : ", newest first"}</span>
          </>
        }
      />

      {saved && (
        <Notice tone="ok">
          {saved}
          {one("imported") && (
            <span className="ml-(--space-2) tabular-nums text-on-dark-muted">
              {one("imported")} in, {one("rejected")} rejected
            </span>
          )}
        </Notice>
      )}
      {problem && <Notice tone="error">{problem}</Notice>}

      {/* -------------------------------------------------- 0.4 filters */}
      <form method="get" className="flex flex-wrap items-end gap-(--space-3)" aria-label="Lead filters">
        <label className={FIELD}>
          <span className={FIELD_LABEL}>Intent</span>
          <select className={`${INPUT_SM} w-44`} name="intent" defaultValue={intent}>
            <option value="">Any intent</option>
            {intents.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className={FIELD}>
          <span className={FIELD_LABEL}>Status</span>
          <select className={`${INPUT_SM} w-44`} name="status" defaultValue={status}>
            <option value="">Any status</option>
            {statuses.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" className={BTN_GHOST_SM}>
          Apply filters
        </button>
        {filtered && (
          <Link href="/admin/leads" className={`${LINK} text-sm`}>
            Clear
          </Link>
        )}
      </form>

      {/* -------------------------------------------------- 0.4 list */}
      <TableFrame>
        <table className={TABLE}>
          <thead>
            <tr>
              <th className={TH}>Received</th>
              <th className={TH}>Business</th>
              <th className={TH}>Contact</th>
              <th className={TH}>ABN</th>
              <th className={TH}>Intent</th>
              <th className={TH}>Status</th>
              <th className={TH}>Source</th>
              <th className={TH}><span className="sr-only">Detail</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <TableEmpty colSpan={8}>
                {filtered ? "No leads match these filters." : "No leads yet. New enquiries from the site appear here, or import a list below."}
              </TableEmpty>
            )}
            {rows.map((lead) => {
              const isSelected = lead.id === selectedId;
              return (
                <tr key={lead.id} className={isSelected ? "bg-white/[0.04]" : undefined}>
                  <td className={`${TD} whitespace-nowrap tabular-nums text-on-dark-muted`}>{formatDate(lead.created_at)}</td>
                  <td className={`${TD} font-semibold`}>{lead.business_name ?? "—"}</td>
                  <td className={TD}>
                    {lead.contact_name ?? "—"}
                    <span className="block text-xs text-on-dark-muted">{lead.email ?? lead.phone ?? "—"}</span>
                  </td>
                  <td className={`${TD} whitespace-nowrap tabular-nums`}>{lead.abn ? formatAbn(lead.abn) : "—"}</td>
                  <td className={TD}>{lead.intent}</td>
                  <td className={TD}>
                    <span className={pill(toneFor(lead.status))}>{lead.status}</span>
                  </td>
                  <td className={`${TD} text-on-dark-muted`}>{lead.source ?? "—"}</td>
                  <td className={`${TD} text-right`}>
                    <Link
                      className={`inline-flex min-h-11 items-center gap-(--space-1) text-sm font-semibold ${isSelected ? "text-on-dark" : "text-on-dark-muted hover:text-on-dark"} ${NAV_FOCUS}`}
                      href={`/admin/leads${query({ intent, status, lead: lead.id })}`}
                      aria-current={isSelected ? "true" : undefined}
                    >
                      {isSelected ? "Open" : "Review"}
                      <Icon name="i-arrow-right" className="size-4" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableFrame>

      {/* -------------------------------------------------- 0.4 detail + decisions */}
      {selected && (
        <section className={`${PANEL} p-(--space-5)`} aria-labelledby="lead-detail-heading">
          <SectionHeader
            title={<span id="lead-detail-heading">{selected.business_name ?? "Unnamed business"}</span>}
            hint={`Received ${formatDate(selected.created_at)}${selected.source ? ` via ${selected.source}` : ""}`}
            actions={<span className={pill(toneFor(selected.status))}>{selected.status}</span>}
          />

          <FactList columns={4} className="mt-(--space-5)">
            <Fact label="Contact" value={selected.contact_name ?? "—"} />
            <Fact label="Email" value={selected.email ?? "—"} />
            <Fact label="Phone" value={selected.phone ?? "—"} numeric />
            <Fact label="ABN" value={selected.abn ? formatAbn(selected.abn) : "Not captured"} numeric />
            <Fact label="Trade interest" value={selected.trade_interest ?? "—"} />
            <Fact label="Funnel score" value={selected.funnel_score ?? "—"} numeric />
            <Fact label="Intent" value={selected.intent} />
            <Fact label="Company" value={selected.company_id ? "Linked" : "Not created yet"} />
          </FactList>

          {selected.notes && (
            <p className="mt-(--space-5) max-w-[70ch] text-sm leading-relaxed text-on-dark-muted">{selected.notes}</p>
          )}
          {selected.disqualified_reason && (
            <p className="mt-(--space-4) text-sm text-on-dark">
              <span className="font-semibold">Disqualified:</span> {selected.disqualified_reason}
            </p>
          )}

          {selected.status === "New" && (
            <form action={markLeadContacted} className="mt-(--space-5) flex flex-wrap items-center gap-(--space-4) border-t border-hairline pt-(--space-5)">
              <input type="hidden" name="lead_id" value={selected.id} />
              <button type="submit" className={BTN_GHOST}>
                Mark Contacted
              </button>
              <p className={FIELD_HINT}>Qualification and disqualification open once the lead has been contacted.</p>
            </form>
          )}

          {selected.status === "Contacted" && (
            <div className="mt-(--space-6) grid gap-(--space-8) border-t border-hairline pt-(--space-5) lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              {/* 0.3 — qualification needs a legal name and contact email, with ABN
                  validated only if supplied. It creates the Pending company and sends
                  the first administrator their Clerk-owned invitation. */}
              <form action={qualifyLead} className="flex flex-col gap-(--space-4)">
                <div>
                  <h3 className={SUBSECTION_TITLE}>Qualify</h3>
                  <p className={`${FIELD_HINT} mt-(--space-1)`}>
                    Creates a Pending company from these details, links this lead to it, and
                    emails the first administrator an invitation.
                  </p>
                </div>
                <input type="hidden" name="lead_id" value={selected.id} />

                <div className="grid gap-(--space-4) sm:grid-cols-2">
                  <label className={`${FIELD} sm:col-span-2`}>
                    <span className={FIELD_LABEL}>Registered legal name</span>
                    <input className={INPUT} name="legal_name" defaultValue={selected.business_name ?? ""} required />
                  </label>

                  <label className={FIELD}>
                    <span className={FIELD_LABEL}>ABN (optional)</span>
                    <input
                      className={`${INPUT} tabular-nums`}
                      name="abn"
                      inputMode="numeric"
                      defaultValue={selected.abn ? formatAbn(selected.abn) : ""}
                    />
                  </label>

                  <label className={FIELD}>
                    <span className={FIELD_LABEL}>Contact email</span>
                    <input className={INPUT} type="email" name="contact_email" defaultValue={selected.email ?? ""} required />
                  </label>

                  <label className={FIELD}>
                    <span className={FIELD_LABEL}>Contact name</span>
                    <input className={INPUT} name="contact_name" defaultValue={selected.contact_name ?? ""} />
                  </label>

                  <label className={FIELD}>
                    <span className={FIELD_LABEL}>Contact phone</span>
                    <input className={INPUT} type="tel" name="contact_phone" defaultValue={selected.phone ?? ""} />
                  </label>

                  <label className={FIELD}>
                    <span className={FIELD_LABEL}>Industry</span>
                    <select className={INPUT} name="industry_id" defaultValue="">
                      <option value="">Decide later</option>
                      {(industries ?? []).map((industry) => (
                        <option key={industry.id} value={industry.id}>
                          {industry.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={FIELD}>
                    <span className={FIELD_LABEL}>Primary region</span>
                    <select className={INPUT} name="primary_region_id" defaultValue="">
                      <option value="">Decide later</option>
                      {(regions ?? []).map((region) => (
                        <option key={region.id} value={region.id}>
                          {region.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <button type="submit" className={`${BTN_PRIMARY} self-start`}>
                  Qualify and invite
                </button>
              </form>

              <form action={disqualifyLead} className="flex flex-col gap-(--space-4)">
                <div>
                  <h3 className={SUBSECTION_TITLE}>Disqualify</h3>
                  <p className={`${FIELD_HINT} mt-(--space-1)`}>The reason is recorded against the lead and audited.</p>
                </div>
                <input type="hidden" name="lead_id" value={selected.id} />
                <label className={FIELD}>
                  <span className={FIELD_LABEL}>Reason</span>
                  <textarea className={INPUT} name="reason" rows={4} required />
                </label>
                <button type="submit" className={`${BTN_GHOST} self-start`}>
                  Disqualify lead
                </button>
              </form>
            </div>
          )}
        </section>
      )}

      {/* -------------------------------------------------- 0.2 route (b): CSV import */}
      <details className={`group ${PANEL}`}>
        <summary className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-(--space-4) px-(--space-5) py-(--space-4) [&::-webkit-details-marker]:hidden ${NAV_FOCUS} rounded-(--radius-lg)`}>
          <span>
            <span className={SUBSECTION_TITLE}>Import leads from CSV</span>
            <span className="mt-(--space-1) block text-sm text-on-dark-muted">
              A header row, then one lead per line. Rows that fail validation are skipped and counted.
            </span>
          </span>
          <Icon name="i-arrow-right" className="size-4 shrink-0 text-on-dark-muted transition-transform duration-(--dur-base) ease-(--ease-out) group-open:rotate-90" />
        </summary>
        <div className="border-t border-hairline px-(--space-5) py-(--space-5)">
          <p className={FIELD_HINT}>
            Recognised columns: <span className="text-on-dark">source, intent, contact_name, business_name, abn, phone, email, trade_interest, notes, funnel_score</span>.
          </p>
          <form action={importLeads} encType="multipart/form-data" className="mt-(--space-4) flex flex-wrap items-end gap-(--space-3)">
            <label className={`${FIELD} min-w-[16rem]`}>
              <span className={FIELD_LABEL}>CSV file</span>
              <input className={INPUT_SM} type="file" name="file" accept=".csv,text/csv" required />
            </label>
            <button type="submit" className={BTN_GHOST_SM}>
              Import CSV
            </button>
          </form>
        </div>
      </details>
    </div>
  );
}
