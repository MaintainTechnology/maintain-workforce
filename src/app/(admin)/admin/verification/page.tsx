import type { Metadata } from "next";
import Link from "next/link";
import {
  approveCompany,
  companyChecklist,
  rejectCompany,
  uploadCompanyDocument,
  verifyCompanyDocument,
} from "@/lib/actions/company";
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

// Spec 1.4 / 1.5 — the Verification queue. It lists Pending companies and gives each one
// a checklist: ABN verified, public liability insurance, workers compensation, trade
// licence(s), the statutory licence field (nullable), and the payment-details flag —
// reference only, since 1.4 stores no bank data. Approving sets the company Active and
// notifies it; rejecting records a reason and notifies it. Only a Maintain admin can do
// either (1.5).

export const metadata: Metadata = { title: "Account approvals" };

const FEEDBACK: Record<string, string> = {
  approved: "Company approved and set Active.",
  rejected: "Rejection recorded and the company notified.",
  verified: "Checklist item verified.",
  document: "Document uploaded on the company's behalf.",
};

const PROBLEM: Record<string, string> = {
  invalid: "That request was missing something, so nothing changed.",
  not_found: "That company no longer exists.",
  reason_required: "Record a reason before rejecting.",
  file_too_large: "Documents are capped at 10 MB.",
  file_type: "Documents must be PDF, JPG or PNG.",
  upload_failed: "The file could not be stored. Try again.",
  save_failed: "The change could not be saved. Try again.",
  stale: "The company or document changed. Refresh before trying again; nothing was changed.",
  checklist_incomplete: "Verify all required, current documents and reference flags before activation.",
  invalid_transition: "That decision is not available. Verify an uploaded, current document and the correct catalogue licence; only Pending companies can be approved or rejected.",
};

type ChecklistRequirement = {
  doc_type: string;
  qualification_id: string | null;
  label: string;
  is_required: boolean;
  is_verified: boolean;
};

/** 1.6 — Current / Expiring Soon (within 30 days) / Expired, derived at read time (module 19). */
function expiryStatus(expiry: string | null): string {
  if (!expiry) return "—";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" });
  if (expiry < today) return "Expired";

  const soon = new Date(`${today}T00:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + 30);
  return expiry <= soon.toISOString().slice(0, 10) ? "Expiring Soon" : "Current";
}

export default async function VerificationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireMaintainAdmin();
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");
  const selectedId = one("company");
  const saved = FEEDBACK[one("saved")];
  const problem = PROBLEM[one("error")];

  const admin = createAdminClient();
  const checklist = await companyChecklist();

  const { data: pending } = await admin
    .from("company")
    .select("id, legal_name, trading_name, abn, contact_name, contact_email, contact_phone, created_at")
    .eq("status", "Pending")
    .order("created_at", { ascending: true });

  const selected = selectedId
    ? (await admin.from("company").select("*").eq("id", selectedId).maybeSingle()).data
    : null;

  const { data: documents } = selected
    ? await admin
        .from("company_document")
        .select("*")
        .eq("company_id", selected.id)
        .order("created_at", { ascending: false })
    : { data: [] as never[] };

  const { data: requirementData, error: checklistError } = selected
    ? await admin.rpc("company_verification_checklist", { p_company_id: selected.id })
    : { data: [], error: null };
  const checklistUnavailable = !!selected && (!!checklistError || !Array.isArray(requirementData) || requirementData.length === 0);
  const requirements = (Array.isArray(requirementData) ? requirementData : []) as ChecklistRequirement[];
  const requiredLicences = requirements.filter((item) => item.doc_type === "trade_licence" && item.is_required);

  // 1.7 — private bucket, signed URLs only, and Maintain is one of the two readers.
  const signed = new Map<string, string>();
  for (const doc of documents ?? []) {
    if (!doc.file_path) continue;
    const { data } = await admin.storage.from("company-documents").createSignedUrl(doc.file_path, 300);
    if (data?.signedUrl) signed.set(doc.id, data.signedUrl);
  }

  const byType = new Map<string, typeof documents>();
  for (const doc of documents ?? []) {
    byType.set(doc.doc_type, [...(byType.get(doc.doc_type) ?? []), doc]);
  }

  const outstanding = requirements.filter((item) => item.is_required && !item.is_verified);

  return (
    <div className={`${PAGE} flex flex-col gap-(--space-6)`}>
      <header className="flex flex-wrap items-baseline gap-(--space-4)">
        <h1 className={H1}>Account approvals</h1>
        <span className={`${MONO} text-body text-on-dark-muted`}>
          {(pending ?? []).length} companies Pending
        </span>
      </header>
      <p className="max-w-[62ch] text-body text-on-dark-muted">
        Review newly registered companies and approve their accounts once the verification checklist is complete.
        Approved companies can list spare capacity and post requirements.
      </p>

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

      <section className={CARD}>
        <div className="overflow-x-auto">
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>Registered</th>
                <th className={TH}>Company</th>
                <th className={TH}>ABN</th>
                <th className={TH}>Contact</th>
                <th className={TH}>Checklist</th>
              </tr>
            </thead>
            <tbody>
              {(pending ?? []).length === 0 && (
                <tr>
                  <td className={TD} colSpan={5}>
                    <span className="text-on-dark-muted">Nothing waiting on verification.</span>
                  </td>
                </tr>
              )}
              {(pending ?? []).map((company) => (
                <tr key={company.id}>
                  <td className={`${TD} ${MONO}`}>{formatDate(company.created_at)}</td>
                  <td className={TD}>
                    {company.legal_name}
                    {company.trading_name && (
                      <>
                        <br />
                        <span className="text-body-sm text-on-dark-muted">
                          trading as {company.trading_name}
                        </span>
                      </>
                    )}
                  </td>
                  <td className={`${TD} ${MONO}`}>
                    {company.abn ? formatAbn(company.abn) : "Not provided"}
                  </td>
                  <td className={TD}>
                    {company.contact_name ?? "—"}
                    <br />
                    <span className={`${MONO} text-body-sm text-on-dark-muted`}>
                      {company.contact_email}
                    </span>
                  </td>
                  <td className={TD}>
                    <Link className={LINK} href={`/admin/verification?company=${company.id}`}>
                      Open checklist
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* -------------------------------------------------- 1.4 per-company checklist */}
      {selected && (
        <section className={CARD}>
          <div className="flex flex-wrap items-baseline gap-(--space-4)">
            <h2 className={H2}>{selected.legal_name}</h2>
            <span className={pill(toneFor(selected.status))}>{selected.status}</span>
            <span className={`${MONO} text-body text-on-dark-muted`}>
              {selected.abn ? formatAbn(selected.abn) : "ABN not provided"}
            </span>
          </div>
          <p className={`${FIELD_HINT} mt-(--space-2)`}>
            {checklistUnavailable
              ? "The verification checklist could not be loaded. Refresh before making a decision."
              : outstanding.length === 0
              ? "Every mandatory checklist item is verified."
              : `Outstanding: ${outstanding.map((item) => item.label).join(", ")}.`}
          </p>

          <div className="mt-(--space-6) flex flex-col gap-(--space-5)">
            {checklist.map((item) => {
              const rows = byType.get(item.id) ?? [];
              const checks = requirements.filter((requirement) => requirement.doc_type === item.id);
              const mandatory = checks.filter((requirement) => requirement.is_required);
              const optional = mandatory.length === 0;
              const done = !checklistUnavailable && (mandatory.length > 0
                ? mandatory.every((requirement) => requirement.is_verified)
                : checks.some((requirement) => requirement.is_verified));
              const omittedAbn = item.id === "abn_verified" && !selected.abn;
              return (
                <div key={item.id} className="border-t border-hairline pt-(--space-4)">
                  <div className="flex flex-wrap items-center gap-(--space-3)">
                    <h3 className="font-display text-h4 font-bold text-on-dark">{item.label}</h3>
                    {optional && <span className={FIELD_HINT}>optional</span>}
                    <span className={pill(done ? toneFor("Active") : toneFor("Pending"))}>
                      {done ? "Verified" : optional ? "Not required" : "Outstanding"}
                    </span>
                  </div>

                  {item.kind === "flag" ? (
                    <div className="mt-(--space-3)">
                      <p className={FIELD_HINT}>
                        {item.id === "payment_details"
                          ? "Reference only — no bank data is stored."
                          : omittedAbn
                          ? "No ABN was supplied. This does not block verification or activation."
                          : "Checked against the Australian Business Register by hand."}
                      </p>
                      {!done && !omittedAbn && selected.status !== "Closed" && !checklistUnavailable && (
                        <form action={verifyCompanyDocument} className="mt-(--space-3)">
                          <input type="hidden" name="company_id" value={selected.id} />
                          <input type="hidden" name="expected_status" value={selected.status} />
                          <input type="hidden" name="doc_type" value={item.id} />
                          {item.id === "abn_verified" && (
                            <input type="hidden" name="expected_abn" value={selected.abn ?? ""} />
                          )}
                          <button type="submit" className={BTN_GHOST}>
                            Mark {item.label.toLowerCase()}
                          </button>
                        </form>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="mt-(--space-3) overflow-x-auto">
                        <table className={TABLE}>
                          <thead>
                            <tr>
                              <th className={TH}>Number</th>
                              <th className={TH}>Issuer</th>
                              <th className={TH}>Issued</th>
                              <th className={TH}>Expires</th>
                              <th className={TH}>Status</th>
                              <th className={TH}>File</th>
                              <th className={TH}>Verified</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.length === 0 && (
                              <tr>
                                <td className={TD} colSpan={7}>
                                  <span className="text-on-dark-muted">Nothing uploaded.</span>
                                </td>
                              </tr>
                            )}
                            {rows.map((doc) => {
                              const status = expiryStatus(doc.expiry_date);
                              return (
                                <tr key={doc.id}>
                                  <td className={`${TD} ${MONO}`}>{doc.number ?? "—"}</td>
                                  <td className={TD}>{doc.issuer ?? "—"}</td>
                                  <td className={`${TD} ${MONO}`}>{formatDate(doc.issue_date)}</td>
                                  <td className={`${TD} ${MONO}`}>{formatDate(doc.expiry_date)}</td>
                                  <td className={TD}>
                                    {status === "—" ? "—" : <span className={pill(toneFor(status))}>{status}</span>}
                                  </td>
                                  <td className={TD}>
                                    {signed.get(doc.id) ? (
                                      <a
                                        className={LINK}
                                        href={signed.get(doc.id)}
                                        rel="noopener noreferrer"
                                        target="_blank"
                                      >
                                        Open
                                      </a>
                                    ) : (
                                      "—"
                                    )}
                                  </td>
                                  <td className={TD}>
                                    {doc.verified_at && (
                                      <span className={`${MONO} text-on-dark-muted`}>
                                        {formatDate(doc.verified_at)}
                                      </span>
                                    )}
                                    {selected.status !== "Closed" && !checklistUnavailable && (!doc.verified_at || (
                                      item.id === "trade_licence" && requiredLicences.length > 0 &&
                                      !requiredLicences.some((requirement) => requirement.qualification_id === doc.qualification_id)
                                    )) && (
                                      <form action={verifyCompanyDocument}>
                                        <input type="hidden" name="company_id" value={selected.id} />
                                        <input type="hidden" name="expected_status" value={selected.status} />
                                        <input type="hidden" name="document_id" value={doc.id} />
                                        <input type="hidden" name="doc_type" value={doc.doc_type} />
                                        {item.id === "trade_licence" && requiredLicences.length > 0 && (
                                          <label className={FIELD}>
                                            <span className={FIELD_LABEL}>Catalogue licence</span>
                                            <select className={INPUT} name="qualification_id" defaultValue={doc.qualification_id ?? ""} required>
                                              <option value="" disabled>Choose the licence evidenced</option>
                                              {requiredLicences.map((requirement) => (
                                                <option key={requirement.qualification_id} value={requirement.qualification_id ?? ""}>
                                                  {requirement.label}
                                                </option>
                                              ))}
                                            </select>
                                          </label>
                                        )}
                                        <button type="submit" className={BTN_GHOST}>
                                          Verify
                                        </button>
                                      </form>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* 16.1 — paperwork arrives by phone and email, so Maintain can
                          upload it on the company's behalf. The row is audited with the
                          acting admin. */}
                      <form
                        action={uploadCompanyDocument}
                        encType="multipart/form-data"
                        className="mt-(--space-4) grid gap-(--space-3) md:grid-cols-6"
                      >
                        <input type="hidden" name="as_maintain" value="1" />
                        <input type="hidden" name="company_id" value={selected.id} />
                        <input type="hidden" name="doc_type" value={item.id} />
                        <label className={FIELD}>
                          <span className={FIELD_LABEL}>Number</span>
                          <input className={`${INPUT} ${MONO}`} name="number" />
                        </label>
                        <label className={FIELD}>
                          <span className={FIELD_LABEL}>Issuer</span>
                          <input className={INPUT} name="issuer" />
                        </label>
                        <label className={FIELD}>
                          <span className={FIELD_LABEL}>Issued</span>
                          <input className={INPUT} type="date" name="issue_date" />
                        </label>
                        <label className={FIELD}>
                          <span className={FIELD_LABEL}>Expires</span>
                          <input className={INPUT} type="date" name="expiry_date" />
                        </label>
                        <label className={FIELD}>
                          <span className={FIELD_LABEL}>File</span>
                          <input
                            className={INPUT}
                            type="file"
                            name="file"
                            accept="application/pdf,image/jpeg,image/png"
                          />
                        </label>
                        <div className="flex items-end">
                          <button type="submit" className={BTN_GHOST}>
                            Add
                          </button>
                        </div>
                      </form>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* -------------------------------------------------- 1.5 decision */}
          {selected.status === "Pending" && (
          <div className="mt-(--space-7) grid gap-(--space-6) border-t border-hairline pt-(--space-5) lg:grid-cols-2">
            <form action={approveCompany} className="flex flex-col gap-(--space-3)">
              <h3 className="font-display text-h4 font-bold text-on-dark">Approve</h3>
              <p className={FIELD_HINT}>
                Sets the company Active and emails it. From then on it can list spare
                capacity and post requirements.
              </p>
              <input type="hidden" name="company_id" value={selected.id} />
              <input type="hidden" name="expected_status" value={selected.status} />
              <button type="submit" className={`${BTN_PRIMARY} self-start`} disabled={outstanding.length > 0 || checklistUnavailable}>
                Approve and activate
              </button>
            </form>

            <form action={rejectCompany} className="flex flex-col gap-(--space-3)">
              <h3 className="font-display text-h4 font-bold text-on-dark">Reject</h3>
              <p className={FIELD_HINT}>
                The company stays Pending, the reason is audited, and the company is told
                what is missing.
              </p>
              <input type="hidden" name="company_id" value={selected.id} />
              <input type="hidden" name="expected_status" value={selected.status} />
              <label className={FIELD}>
                <span className={FIELD_LABEL}>Reason</span>
                <textarea className={INPUT} name="reason" rows={3} minLength={4} maxLength={2000} required />
              </label>
              <button type="submit" className={`${BTN_GHOST} self-start`}>
                Record rejection
              </button>
            </form>
          </div>
          )}
        </section>
      )}
    </div>
  );
}
