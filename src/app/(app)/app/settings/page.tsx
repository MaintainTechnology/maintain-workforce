import type { Metadata } from "next";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { CompanyDocumentForm } from "@/components/company-document-form";
import { CompanyDocumentFileInput } from "@/components/company-document-file-input";
import { COMPANY_DOCUMENT_TYPES } from "@/lib/company-document-policy";
import {
  companyChecklist,
  inviteCompanyAdmin,
  reissueInvitation,
  removeCompanyAdmin,
  updateCompanyProfile,
  uploadCompanyDocument,
} from "@/lib/actions/company";
import { requireCompanyAdmin } from "@/lib/auth";
import { userEmail } from "@/lib/clerk";
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
import { createClient } from "@/lib/supabase/server";
import { BTN_GHOST, BTN_PRIMARY, H1, H2 } from "@/lib/ui";

// Spec 3.1 — the company profile and settings screen: edit the company details of 1.1,
// view compliance documents and their statuses, and manage administrators (1.8).
//
// 1.3 — a Pending company reaches all of this. What it cannot do is create capacity or
// demand, which requireActiveCompany blocks in the capacity and demand actions.

export const metadata: Metadata = { title: "Company" };

const FEEDBACK: Record<string, string> = {
  profile: "Company details saved.",
  document: "Document uploaded.",
  invited: "Invitation sent.",
  removed: "Administrator removed.",
};

const PROBLEM: Record<string, string> = {
  read_only: "This account is read-only, so nothing was changed.",
  invalid: "Some details were missing or malformed, so nothing was changed.",
  abn_checksum: "That ABN fails the standard 11-digit checksum.",
  abn_review: "That ABN is already registered. Maintain is reviewing it and will be in touch.",
  abn_collision:
    "That ABN was registered by another company before this change was saved. Contact Maintain for help.",
  save_failed: "The change could not be saved. Try again.",
  not_found: "That company or document no longer exists. Refresh before trying again.",
  stale: "The company or document changed after this page loaded. Refresh and review the latest values before saving.",
  file_required: "Choose a document file before uploading. Details alone cannot be verified.",
  invalid_dates: "Check the document dates. Expiry must not be before its issue date.",
  file_too_large: "Documents are capped at 4 MB.",
  file_type: "Documents must be PDF, JPG or PNG.",
  upload_failed: "The file could not be stored. Try again.",
  invalid_email: "That email does not look right.",
  invite_failed: "The invitation could not be created. Try again.",
  invite_delivery_failed:
    "The administrator was added as Invited, but the email could not be delivered. Re-send it when delivery is available.",
  already_active: "That administrator has already signed in; use the password reset flow instead.",
  invalid_user: "That administrator could not be found.",
  cannot_remove_self: "You cannot remove your own access.",
  last_admin: "A company must keep at least one administrator.",
  remove_failed: "The administrator could not be removed. Try again.",
};

/**
 * 1.6 — document status is derived, never stored by hand: Current, Expiring Soon
 * (expiry within 30 days) or Expired. The daily job writes the stored column; between
 * runs the display value is computed here (module 19, "derived at read time").
 * Dates are calendar dates in Australia/Brisbane (20.5).
 */
function expiryStatus(expiry: string | null): string {
  if (!expiry) return "—";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" });
  if (expiry < today) return "Expired";

  const soon = new Date(`${today}T00:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + 30);
  return expiry <= soon.toISOString().slice(0, 10) ? "Expiring Soon" : "Current";
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, companyId, companyStatus } = await requireCompanyAdmin();
  const params = await searchParams;
  const saved = typeof params.saved === "string" ? FEEDBACK[params.saved] : undefined;
  const problem = typeof params.error === "string" ? PROBLEM[params.error] : undefined;

  const supabase = await createClient();
  const [companyResult, regionResult, industryResult, operatingResult, documentResult, userResult] =
    await Promise.all([
      supabase.from("company").select("*").eq("id", companyId).maybeSingle(),
      supabase.from("region").select("id, name, is_active").order("name"),
      supabase.from("industry").select("id, name, is_active").order("name"),
      supabase.from("company_operating_region").select("region_id").eq("company_id", companyId),
      supabase
        .from("company_document")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
      supabase
        .from("company_user")
        .select("user_id, created_at, invited_email, accepted_at")
        .eq("company_id", companyId),
    ]);

  // Every read above runs under the session. A rejected session must fail the screen,
  // not render "no documents", "no administrators" and empty selects — or, worse,
  // "Company not found." for a company that is there.
  if (
    [companyResult, regionResult, industryResult, operatingResult, documentResult, userResult].some(
      (result) => result.error,
    )
  ) {
    throw new Error("Company settings could not be loaded. Please try again.");
  }

  const company = companyResult.data;
  if (!company) return <p className="text-body text-on-dark-muted">Company not found.</p>;

  const regions = regionResult.data ?? [];
  const industries = industryResult.data ?? [];
  const operatingIds: string[] = (operatingResult.data ?? [])
    .map((r: { region_id: string }) => r.region_id)
    .sort();
  const documents = documentResult.data ?? [];
  const checklist = await companyChecklist();

  // 1.7 — documents live in a private bucket and are reachable only through short-lived
  // signed URLs. The rows were already scoped to this company by RLS above; the
  // service-role client is used purely to mint the URL, which storage has no policy for.
  const admin = createAdminClient();
  const signed = new Map<string, string>();
  for (const doc of documents) {
    if (!doc.file_path) continue;
    const { data } = await admin.storage.from("company-documents").createSignedUrl(doc.file_path, 300);
    if (data?.signedUrl) signed.set(doc.id, data.signedUrl);
  }

  // Administrators live in Clerk; company_user is the binding (2.2). Only the ids on
  // this company's rows are ever looked up, so nothing crosses a tenant boundary.
  const administrators = await Promise.all(
    (userResult.data ?? []).map(async (row: {
      user_id: string;
      created_at: string;
      invited_email: string | null;
      accepted_at: string | null;
    }) => ({
      id: row.user_id,
      email: (await userEmail(row.user_id)) ?? row.invited_email ?? "—",
      confirmed: Boolean(row.accepted_at),
    })),
  );

  const readOnly = companyStatus === "Suspended" || companyStatus === "Closed";
  const expectedProfile = JSON.stringify({
    legal_name: company.legal_name,
    trading_name: company.trading_name,
    abn: company.abn,
    industry_id: company.industry_id,
    contact_name: company.contact_name,
    contact_email: company.contact_email,
    contact_phone: company.contact_phone,
    primary_region_id: company.primary_region_id,
    operating_region_ids: operatingIds,
  });

  return (
    <div className={`${PAGE} flex flex-col gap-(--space-7)`}>
      <header className="flex flex-wrap items-center gap-(--space-4)">
        <h1 className={H1}>Company</h1>
        <span className={pill(toneFor(companyStatus))}>{companyStatus}</span>
      </header>

      {saved && (
        <p role="status" className={`${CARD} text-body text-on-dark`}>
          {saved}
        </p>
      )}
      {problem && (
        <p role="alert" className={`${CARD} text-body text-on-dark`}>
          {problem}
        </p>
      )}

      {/* -------------------------------------------------- 3.1 company details */}
      <section className={CARD}>
        <h2 className={H2}>Company details</h2>
        <p className={`${FIELD_HINT} mt-(--space-2)`}>
          If you provide an ABN, changing it re-runs the checksum and uniqueness checks.
        </p>

        <form action={updateCompanyProfile} className="mt-(--space-5) grid gap-(--space-5) md:grid-cols-2">
          <input type="hidden" name="expected_profile" value={expectedProfile} />
          <label className={FIELD}>
            <span className={FIELD_LABEL}>Registered legal name</span>
            <input className={INPUT} name="legal_name" defaultValue={company.legal_name} required disabled={readOnly} />
          </label>

          <label className={FIELD}>
            <span className={FIELD_LABEL}>Trading name</span>
            <input className={INPUT} name="trading_name" defaultValue={company.trading_name ?? ""} disabled={readOnly} />
          </label>

          <label className={FIELD}>
            <span className={FIELD_LABEL}>ABN (optional)</span>
            <input
              className={`${INPUT} ${MONO}`}
              name="abn"
              inputMode="numeric"
              defaultValue={company.abn ? formatAbn(company.abn) : ""}
              disabled={readOnly}
            />
          </label>

          <label className={FIELD}>
            <span className={FIELD_LABEL}>Industry</span>
            <select className={INPUT} name="industry_id" defaultValue={company.industry_id ?? ""} required disabled={readOnly}>
              <option value="">Choose an industry</option>
              {industries.map((industry: { id: string; name: string; is_active: boolean }) => (
                <option
                  key={industry.id}
                  value={industry.id}
                  disabled={!industry.is_active && industry.id !== company.industry_id}
                >
                  {industry.name}
                  {!industry.is_active ? " (Unavailable)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className={FIELD}>
            <span className={FIELD_LABEL}>Primary contact</span>
            <input className={INPUT} name="contact_name" defaultValue={company.contact_name ?? ""} required disabled={readOnly} />
          </label>

          <label className={FIELD}>
            <span className={FIELD_LABEL}>Contact email</span>
            <input className={INPUT} type="email" name="contact_email" defaultValue={company.contact_email} required disabled={readOnly} />
          </label>

          <label className={FIELD}>
            <span className={FIELD_LABEL}>Contact phone</span>
            <input className={INPUT} type="tel" name="contact_phone" defaultValue={company.contact_phone ?? ""} required disabled={readOnly} />
          </label>

          <label className={FIELD}>
            <span className={FIELD_LABEL}>Primary location</span>
            <select className={INPUT} name="primary_region_id" defaultValue={company.primary_region_id ?? ""} required disabled={readOnly}>
              <option value="">Choose a region</option>
              {regions.map((region: { id: string; name: string; is_active: boolean }) => (
                <option
                  key={region.id}
                  value={region.id}
                  disabled={!region.is_active && region.id !== company.primary_region_id}
                >
                  {region.name}
                  {!region.is_active ? " (Unavailable)" : ""}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="md:col-span-2">
            <legend className={FIELD_LABEL}>Regions you operate in</legend>
            <div className="mt-(--space-3) grid gap-(--space-2) sm:grid-cols-2 lg:grid-cols-3">
              {regions.map((region: { id: string; name: string; is_active: boolean }) => (
                <label key={region.id} className="flex min-h-11 items-center gap-(--space-3) text-body text-on-dark">
                  <input
                    type="checkbox"
                    name="operating_region_ids"
                    value={region.id}
                    defaultChecked={operatingIds.includes(region.id)}
                    className="size-4 accent-teal-mist"
                    disabled={readOnly || (!region.is_active && !operatingIds.includes(region.id))}
                  />
                  {region.name}
                  {!region.is_active ? " (Unavailable)" : ""}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="md:col-span-2">
            <PendingSubmitButton
              className={BTN_PRIMARY}
              disabled={readOnly}
              idleLabel="Save company details"
            />
          </div>
        </form>
      </section>

      {/* -------------------------------------------------- 1.3 / 1.4 documents */}
      <section id="company-documents" className={`${CARD} scroll-mt-6`}>
        <h2 className={H2}>Compliance documents</h2>
        <p className={`${FIELD_HINT} mt-(--space-2)`}>
          Save document details first, then attach a PDF, JPG or PNG up to 4 MB so Maintain can review and verify it.
        </p>
        {(params.section === "documents" || params.saved === "document") && (problem || saved) && (
          <p role={problem ? "alert" : "status"} className={`${FIELD_HINT} mt-(--space-3)`}>{problem || saved}</p>
        )}

        <div className="mt-(--space-5) overflow-x-auto">
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>Type</th>
                <th className={TH}>Number</th>
                <th className={TH}>Issuer</th>
                <th className={TH}>Expires</th>
                <th className={TH}>Status</th>
                <th className={TH}>Verified</th>
                <th className={TH}>File</th>
              </tr>
            </thead>
            <tbody>
              {documents.length === 0 && (
                <tr>
                  <td className={TD} colSpan={7}>
                    <span className="text-on-dark-muted">No documents saved yet.</span>
                  </td>
                </tr>
              )}
              {documents.map((doc) => {
                const status = expiryStatus(doc.expiry_date);
                const label = checklist.find((item) => item.id === doc.doc_type)?.label ?? doc.doc_type;
                const isDocument = COMPANY_DOCUMENT_TYPES.some((type) => type === doc.doc_type);
                return (
                  <tr key={doc.id}>
                    <td className={TD}>{label}</td>
                    <td className={`${TD} ${MONO}`}>{doc.number ?? "—"}</td>
                    <td className={TD}>{doc.issuer ?? "—"}</td>
                    <td className={`${TD} ${MONO}`}>{formatDate(doc.expiry_date)}</td>
                    <td className={TD}>
                      {isDocument && !doc.file_path?.trim()
                        ? <><span className={pill(toneFor("Pending"))}>File required</span><span className={`mt-(--space-2) block ${FIELD_HINT}`}>Details saved; unverified.</span></>
                        : status === "—" ? "—" : <span className={pill(toneFor(status))}>{status}</span>}
                    </td>
                    <td className={`${TD} ${MONO}`}>{doc.verified_at ? formatDate(doc.verified_at) : "—"}</td>
                    <td className={TD}>
                      {signed.get(doc.id) ? (
                        <a
                          className="font-semibold text-on-dark underline underline-offset-4"
                          href={signed.get(doc.id)}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          Open
                        </a>
                      ) : (
                        <span className={FIELD_HINT}>{doc.file_path?.trim() ? "File unavailable" : isDocument ? "No file attached" : "—"}</span>
                      )}
                      {isDocument && !doc.file_path?.trim() && !doc.verified_at && !doc.verified_by && !readOnly && (
                        <details className="mt-(--space-3) min-w-64">
                          <summary className="cursor-pointer py-(--space-2) font-semibold">Edit saved details</summary>
                          <CompanyDocumentForm key={doc.id} documentId={doc.id} document={doc} detailsOnly />
                        </details>
                      )}
                      {isDocument && !doc.file_path?.trim() && !doc.verified_at && !doc.verified_by && !readOnly && (
                        <form action={uploadCompanyDocument} className="mt-(--space-3) flex min-w-56 flex-col gap-(--space-3)">
                          <input type="hidden" name="document_id" value={doc.id} />
                          <input type="hidden" name="doc_type" value={doc.doc_type} />
                          <input type="hidden" name="expected_document" value={JSON.stringify({ number: doc.number, issuer: doc.issuer, issue_date: doc.issue_date, expiry_date: doc.expiry_date })} />
                          <label className={FIELD}>
                            <span className={FIELD_LABEL}>Attach the existing document</span>
                            <CompanyDocumentFileInput />
                          </label>
                          <PendingSubmitButton className={BTN_GHOST} idleLabel="Attach file" pendingLabel="Uploading…" />
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-(--space-6) border-t border-hairline pt-(--space-5)">
          <CompanyDocumentForm
            key={company.id}
            documentId={crypto.randomUUID()}
            types={checklist.filter((item) => item.kind === "document")}
            disabled={readOnly}
          />
        </div>
      </section>

      {/* -------------------------------------------------- 1.8 administrators */}
      <section className={CARD}>
        <h2 className={H2}>Administrators</h2>
        <p className={`${FIELD_HINT} mt-(--space-2)`}>
          An invitee sets a password through a tokenised link and is bound to this
          company only.
        </p>

        <ul className="mt-(--space-5) flex flex-col gap-(--space-3)">
          {administrators.length === 0 && (
            <li className="text-body text-on-dark-muted">
              No administrator has accepted an invitation yet. Maintain is managing this
              account in the meantime.
            </li>
          )}
          {administrators.map((person) => (
            <li key={person.id} className="flex flex-wrap items-center gap-(--space-3)">
              <span className={`${MONO} text-body text-on-dark`}>{person.email}</span>
              <span className={pill(person.confirmed ? toneFor("Active") : toneFor("Pending"))}>
                {person.confirmed ? "Active" : "Invited"}
              </span>
              {/* 1.8 — an expired invitation can be re-issued; only unconfirmed invitees qualify. */}
              {!person.confirmed && (
                <form action={reissueInvitation}>
                  <input type="hidden" name="email" value={person.email} />
                  <button type="submit" className={BTN_GHOST} disabled={readOnly}>
                    Re-send invitation
                  </button>
                </form>
              )}
              {/* 18.2 — removal is audited; the action refuses to strip the last administrator. */}
              {person.id !== user.id && administrators.length > 1 && (
                <form action={removeCompanyAdmin}>
                  <input type="hidden" name="user_id" value={person.id} />
                  <button type="submit" className={BTN_GHOST} disabled={readOnly}>
                    Remove
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>

        <form action={inviteCompanyAdmin} className="mt-(--space-5) flex flex-wrap items-end gap-(--space-4)">
          <label className={`${FIELD} min-w-[280px] flex-1`}>
            <span className={FIELD_LABEL}>Invite another administrator</span>
            <input className={INPUT} type="email" name="email" placeholder="name@company.com.au" required disabled={readOnly} />
          </label>
          <button type="submit" className={BTN_GHOST} disabled={readOnly}>
            Send invitation
          </button>
        </form>
      </section>
    </div>
  );
}
