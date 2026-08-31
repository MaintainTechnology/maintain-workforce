import type { Metadata } from "next";
import Link from "next/link";
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
  CARD,
  FIELD,
  FIELD_HINT,
  FIELD_LABEL,
  INPUT,
  MONO,
  PAGE,
  TABLE,
  TD,
  TH,
  formatDate,
  pill,
  toneFor,
} from "@/lib/platform-ui";
import { createAdminClient } from "@/lib/supabase/admin";
import { BTN_GHOST, BTN_PRIMARY, H1, H2, LINK } from "@/lib/ui";

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

  const open = (leads ?? []).filter((lead) => OPEN_STATUSES.includes(lead.status)).length;

  return (
    <div className={`${PAGE} flex flex-col gap-(--space-6)`}>
      <header className="flex flex-wrap items-baseline gap-(--space-4)">
        <h1 className={H1}>Leads</h1>
        <span className={`${MONO} text-body text-on-dark-muted`}>
          {open} awaiting a decision
        </span>
      </header>

      {saved && (
        <p role="status" className={`${CARD} text-body text-on-dark`}>
          {saved}
          {one("imported") && (
            <span className={`${MONO} ml-(--space-3)`}>
              {one("imported")} in, {one("rejected")} rejected
            </span>
          )}
        </p>
      )}
      {problem && (
        <p role="alert" className={`${CARD} text-body text-on-dark`}>
          {problem}
        </p>
      )}

      {/* -------------------------------------------------- 0.4 filters */}
      <section className={CARD}>
        <form method="get" className="flex flex-wrap items-end gap-(--space-4)">
          <label className={FIELD}>
            <span className={FIELD_LABEL}>Intent</span>
            <select className={INPUT} name="intent" defaultValue={intent}>
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
            <select className={INPUT} name="status" defaultValue={status}>
              <option value="">Any status</option>
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <button type="submit" className={BTN_GHOST}>
            Apply filters
          </button>
          <Link href="/admin/leads" className={LINK}>
            Clear
          </Link>
        </form>
      </section>

      {/* -------------------------------------------------- 0.4 list */}
      <section className={CARD}>
        <div className="overflow-x-auto">
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
                <th className={TH}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {(leads ?? []).length === 0 && (
                <tr>
                  <td className={TD} colSpan={8}>
                    <span className="text-on-dark-muted">No leads match these filters.</span>
                  </td>
                </tr>
              )}
              {(leads ?? []).map((lead) => (
                <tr key={lead.id}>
                  <td className={`${TD} ${MONO}`}>{formatDate(lead.created_at)}</td>
                  <td className={TD}>{lead.business_name ?? "—"}</td>
                  <td className={TD}>
                    {lead.contact_name ?? "—"}
                    <br />
                    <span className={`${MONO} text-body-sm text-on-dark-muted`}>
                      {lead.email ?? lead.phone ?? "—"}
                    </span>
                  </td>
                  <td className={`${TD} ${MONO}`}>{lead.abn ? formatAbn(lead.abn) : "—"}</td>
                  <td className={TD}>{lead.intent}</td>
                  <td className={TD}>
                    <span className={pill(toneFor(lead.status))}>{lead.status}</span>
                  </td>
                  <td className={TD}>{lead.source ?? "—"}</td>
                  <td className={TD}>
                    <Link className={LINK} href={`/admin/leads${query({ intent, status, lead: lead.id })}`}>
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* -------------------------------------------------- 0.4 detail + decisions */}
      {selected && (
        <section className={CARD}>
          <div className="flex flex-wrap items-baseline gap-(--space-4)">
            <h2 className={H2}>{selected.business_name ?? "Unnamed business"}</h2>
            <span className={pill(toneFor(selected.status))}>{selected.status}</span>
          </div>

          <dl className="mt-(--space-5) grid gap-(--space-4) md:grid-cols-3">
            {[
              ["Contact", selected.contact_name ?? "—"],
              ["Email", selected.email ?? "—"],
              ["Phone", selected.phone ?? "—"],
              ["ABN", selected.abn ? formatAbn(selected.abn) : "not captured"],
              ["Trade interest", selected.trade_interest ?? "—"],
              ["Funnel score", selected.funnel_score ?? "—"],
              ["Source", selected.source ?? "—"],
              ["Received", formatDate(selected.created_at)],
              ["Company", selected.company_id ? "linked" : "not created yet"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className={FIELD_LABEL}>{label}</dt>
                <dd className={`${MONO} mt-(--space-1) text-body text-on-dark-muted`}>{value}</dd>
              </div>
            ))}
          </dl>

          {selected.notes && (
            <p className="mt-(--space-5) max-w-[70ch] text-body text-on-dark-muted">{selected.notes}</p>
          )}
          {selected.disqualified_reason && (
            <p className="mt-(--space-4) text-body text-on-dark">
              Disqualified: {selected.disqualified_reason}
            </p>
          )}

          {selected.status === "New" && (
            <form action={markLeadContacted} className="mt-(--space-5)">
              <input type="hidden" name="lead_id" value={selected.id} />
              <button type="submit" className={BTN_GHOST}>
                Mark Contacted
              </button>
            </form>
          )}

          {selected.status === "Contacted" && (
            <div className="mt-(--space-6) grid gap-(--space-6) border-t border-hairline pt-(--space-5) lg:grid-cols-2">
              {/* 0.3 — qualification needs a legal name and contact email, with ABN
                  validated only if supplied. It creates the Pending company and sends
                  the first administrator their Clerk-owned invitation. */}
              <form action={qualifyLead} className="flex flex-col gap-(--space-4)">
                <h3 className="font-display text-h4 font-bold text-on-dark">Qualify</h3>
                <p className={FIELD_HINT}>
                  Creates a Pending company from these details, links this lead to it, and
                  emails the first administrator an invitation.
                </p>
                <input type="hidden" name="lead_id" value={selected.id} />

                <label className={FIELD}>
                  <span className={FIELD_LABEL}>Registered legal name</span>
                  <input className={INPUT} name="legal_name" defaultValue={selected.business_name ?? ""} required />
                </label>

                <label className={FIELD}>
                  <span className={FIELD_LABEL}>ABN (optional)</span>
                  <input
                    className={`${INPUT} ${MONO}`}
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

                <button type="submit" className={`${BTN_PRIMARY} self-start`}>
                  Qualify and invite
                </button>
              </form>

              <form action={disqualifyLead} className="flex flex-col gap-(--space-4)">
                <h3 className="font-display text-h4 font-bold text-on-dark">Disqualify</h3>
                <p className={FIELD_HINT}>The reason is recorded against the lead and audited.</p>
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
      <section className={CARD}>
        <h2 className={H2}>Import leads</h2>
        <p className={`${FIELD_HINT} mt-(--space-2)`}>
          CSV with a header row. Recognised columns: source, intent, contact_name,
          business_name, abn, phone, email, trade_interest, notes, funnel_score. Rows
          that fail validation are skipped and counted.
        </p>
        <form action={importLeads} encType="multipart/form-data" className="mt-(--space-5) flex flex-wrap items-end gap-(--space-4)">
          <label className={FIELD}>
            <span className={FIELD_LABEL}>CSV file</span>
            <input className={INPUT} type="file" name="file" accept=".csv,text/csv" required />
          </label>
          <button type="submit" className={BTN_GHOST}>
            Import CSV
          </button>
        </form>
      </section>
    </div>
  );
}
