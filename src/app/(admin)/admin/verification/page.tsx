import type { Metadata } from "next";
import Link from "next/link";
import { Notice, PageHeader, SectionHeader, TableEmpty, TableFrame } from "@/components/admin-page";
import { Icon } from "@/components/icon";
import {
  approveCompany,
  companyChecklist,
  rejectCompany,
  updatePendingCompanyProfileAsMaintain,
  uploadCompanyDocument,
  verifyCompanyDocument,
} from "@/lib/actions/company";
import { requireMaintainAdmin } from "@/lib/auth";
import { ApprovalSubmitButton } from "@/components/approval-submit-button";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { CompanyDocumentForm } from "@/components/company-document-form";
import { CompanyDocumentFileInput } from "@/components/company-document-file-input";
import { companyDocumentIssue } from "@/lib/company-document-policy";
import { formatAbn } from "@/lib/domain/abn";
import {
  CHECKBOX,
  CHECK_OPTION,
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
} from "@/lib/admin-ui";
import { createAdminClient } from "@/lib/supabase/admin";
import { BTN_GHOST, BTN_GHOST_SM, NAV_FOCUS, PANEL } from "@/lib/ui";

// Spec 1.4 / 1.5 — the Verification queue. It lists Pending companies and gives each one
// a checklist: ABN verified, public liability insurance, workers compensation, trade
// licence(s), the statutory licence field (nullable), and the payment-details flag —
// reference only, since 1.4 stores no bank data. Approving sets the company Active and
// notifies it; rejecting records a reason and notifies it. Only a Maintain admin can do
// either (1.5).
//
// Amber budget (DESIGN.md): one — "Approve and activate". Saving onboarding details,
// verifying a document and uploading are ghost controls; the activation is the decision.

export const metadata: Metadata = { title: "Account approvals" };

const FEEDBACK: Record<string, string> = {
  approved: "Company approved and set Active.",
  rejected: "Rejection recorded and the company notified.",
  verified: "Checklist item verified. You can select Approve and activate whenever you are ready to approve the account.",
  document: "Document file saved. Open it to review the evidence, then select Verify.",
  profile: "Onboarding company details saved.",
};

const PROBLEM: Record<string, string> = {
  invalid: "That request was missing something, so nothing changed.",
  not_found: "That company no longer exists.",
  reason_required: "Record a reason before rejecting.",
  file_required: "Choose the document file before uploading. Details alone cannot be verified.",
  file_too_large: "Documents are capped at 4 MB.",
  invalid_dates: "Check the document dates. Expiry must not be before its issue date.",
  document_not_ready: "Attach a current document file before verifying. Check the issue and expiry dates below.",
  file_type: "Documents must be PDF, JPG or PNG.",
  upload_failed: "The file could not be stored. Try again.",
  save_failed: "The change could not be saved. Try again.",
  abn_checksum: "That ABN fails the standard 11-digit checksum.",
  abn_collision: "That ABN is already registered to another company.",
  stale: "The company or document changed. Refresh before trying again; nothing was changed.",
  checklist_incomplete: "The checklist is incomplete. Maintain admins can approve the account with outstanding items.",
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
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" });

  const admin = createAdminClient();
  const checklist = await companyChecklist();

  const { data: pending } = await admin
    .from("company")
    .select("id, legal_name, trading_name, abn, contact_name, contact_email, contact_phone, created_at")
    .eq("status", "Pending")
    .order("created_at", { ascending: true });

  const selectedResult = selectedId
    ? await admin.from("company").select("*").eq("id", selectedId).maybeSingle()
    : { data: null, error: null };
  if (selectedResult.error) {
    throw new Error("Onboarding company details could not be loaded. Please try again.");
  }
  const selected = selectedResult.data;

  const [industryResult, regionResult, operatingResult] = selected
    ? await Promise.all([
        admin.from("industry").select("id, name, is_active").order("name"),
        admin.from("region").select("id, name, is_active").order("name"),
        admin
          .from("company_operating_region")
          .select("region_id")
          .eq("company_id", selected.id),
      ])
    : [
        { data: [] as Array<{ id: string; name: string; is_active: boolean }>, error: null },
        { data: [] as Array<{ id: string; name: string; is_active: boolean }>, error: null },
        { data: [] as Array<{ region_id: string }>, error: null },
      ];
  if (industryResult.error || regionResult.error || operatingResult.error) {
    throw new Error("Onboarding company details could not be loaded. Please try again.");
  }
  const industries = industryResult.data ?? [];
  const regions = regionResult.data ?? [];
  const operatingIds = (operatingResult.data ?? [])
    .map((row: { region_id: string }) => row.region_id)
    .sort();

  const { data: documents, error: documentsError } = selected
    ? await admin
        .from("company_document")
        .select("*")
        .eq("company_id", selected.id)
        .order("created_at", { ascending: false })
    : { data: [] as never[], error: null };
  if (documentsError) throw new Error("Company documents could not be loaded. Please try again.");

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
  const expectedProfile = selected
    ? JSON.stringify({
        legal_name: selected.legal_name,
        trading_name: selected.trading_name,
        abn: selected.abn,
        industry_id: selected.industry_id,
        contact_name: selected.contact_name,
        contact_email: selected.contact_email,
        contact_phone: selected.contact_phone,
        primary_region_id: selected.primary_region_id,
        operating_region_ids: operatingIds,
      })
    : "";

  const pendingRows = pending ?? [];
  const editable = selected?.status === "Pending";

  return (
    <div className="flex flex-col gap-(--space-6)">
      <PageHeader
        title="Account approvals"
        lead="Pending companies and their verification checklist. Verify confirms an individual document. Approve and activate opens the account and records your decision — Maintain admins can approve with incomplete information or missing documents."
        meta={
          <span>
            <strong className="font-semibold text-on-dark">{pendingRows.length}</strong>{" "}
            {pendingRows.length === 1 ? "company" : "companies"} Pending
          </span>
        }
      />

      {saved && <Notice tone="ok">{saved}</Notice>}
      {problem && <Notice tone="error">{problem}</Notice>}

      <TableFrame>
        <table className={TABLE}>
          <thead>
            <tr>
              <th className={TH}>Registered</th>
              <th className={TH}>Company</th>
              <th className={TH}>Contact</th>
              <th className={TH}><span className="sr-only">Checklist</span></th>
            </tr>
          </thead>
          <tbody>
            {pendingRows.length === 0 && (
              <TableEmpty colSpan={4}>Nothing waiting on verification.</TableEmpty>
            )}
            {pendingRows.map((company) => {
              const isSelected = company.id === selectedId;
              return (
                <tr key={company.id} className={isSelected ? "bg-white/[0.04]" : undefined}>
                  <td className={`${TD} whitespace-nowrap tabular-nums text-on-dark-muted`}>{formatDate(company.created_at)}</td>
                  <td className={TD}>
                    <span className="font-semibold">{company.legal_name}</span>
                    {company.trading_name && (
                      <span className="block text-xs text-on-dark-muted">trading as {company.trading_name}</span>
                    )}
                    <span className="mt-(--space-1) block text-xs tabular-nums text-on-dark-faint">
                      {company.abn ? `ABN ${formatAbn(company.abn)}` : "ABN not provided"}
                    </span>
                  </td>
                  <td className={TD}>
                    {company.contact_name ?? "—"}
                    <span className="block text-xs text-on-dark-muted [overflow-wrap:anywhere]">{company.contact_email}</span>
                  </td>
                  <td className={`${TD} text-right`}>
                    <Link
                      className={`inline-flex min-h-11 items-center gap-(--space-1) text-sm font-semibold ${isSelected ? "text-on-dark" : "text-on-dark-muted hover:text-on-dark"} ${NAV_FOCUS}`}
                      href={`/admin/verification?company=${company.id}`}
                      aria-current={isSelected ? "true" : undefined}
                    >
                      {isSelected ? "Checklist open" : "Open checklist"}
                      <Icon name="i-arrow-right" className="size-4" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableFrame>

      {/* -------------------------------------------------- 1.4 per-company checklist */}
      {selected && (
        <section className={`${PANEL} p-(--space-5)`} aria-labelledby="approval-company-heading">
          <SectionHeader
            title={<span id="approval-company-heading">{selected.legal_name}</span>}
            hint={
              checklistUnavailable
                ? "The verification checklist could not be loaded. Account approval remains available to Maintain admins."
                : outstanding.length === 0
                ? "Every mandatory checklist item is verified."
                : `Checklist items still outstanding: ${outstanding.map((item) => item.label).join(", ")}. You can still approve this account.`
            }
            actions={
              <>
                <span className="text-sm tabular-nums text-on-dark-muted">
                  {selected.abn ? `ABN ${formatAbn(selected.abn)}` : "ABN not provided"}
                </span>
                <span className={pill(toneFor(selected.status))}>{selected.status}</span>
              </>
            }
          />

          <div className="mt-(--space-6) border-t border-hairline pt-(--space-5)">
            <h3 className={SUBSECTION_TITLE}>Onboarding company details</h3>
            <p className={`${FIELD_HINT} mt-(--space-1) max-w-[72ch]`}>
              The company details saved from onboarding. Changes made here are audited and
              become the company&apos;s current profile. Insurance documents and payment
              confirmation are completed separately below.
            </p>

            <form
              action={updatePendingCompanyProfileAsMaintain}
              className="mt-(--space-5) grid gap-(--space-4) md:grid-cols-2"
            >
              <input type="hidden" name="company_id" value={selected.id} />
              <input type="hidden" name="expected_status" value={selected.status} />
              <input type="hidden" name="expected_profile" value={expectedProfile} />

              <label className={FIELD}>
                <span className={FIELD_LABEL}>Registered legal name</span>
                <input className={INPUT} name="legal_name" defaultValue={selected.legal_name} required disabled={!editable} />
              </label>

              <label className={FIELD}>
                <span className={FIELD_LABEL}>Trading name</span>
                <input className={INPUT} name="trading_name" defaultValue={selected.trading_name ?? ""} disabled={!editable} />
              </label>

              <label className={FIELD}>
                <span className={FIELD_LABEL}>ABN (optional)</span>
                <input
                  className={`${INPUT} tabular-nums`}
                  name="abn"
                  inputMode="numeric"
                  defaultValue={selected.abn ? formatAbn(selected.abn) : ""}
                  disabled={!editable}
                />
              </label>

              <label className={FIELD}>
                <span className={FIELD_LABEL}>Industry</span>
                <select className={INPUT} name="industry_id" defaultValue={selected.industry_id ?? ""} required disabled={!editable}>
                  <option value="">Choose an industry</option>
                  {industries.map((industry: { id: string; name: string; is_active: boolean }) => (
                    <option
                      key={industry.id}
                      value={industry.id}
                      disabled={!industry.is_active && industry.id !== selected.industry_id}
                    >
                      {industry.name}{industry.is_active ? "" : " (inactive)"}
                    </option>
                  ))}
                </select>
              </label>

              <label className={FIELD}>
                <span className={FIELD_LABEL}>Contact name</span>
                <input className={INPUT} name="contact_name" defaultValue={selected.contact_name ?? ""} required disabled={!editable} />
              </label>

              <label className={FIELD}>
                <span className={FIELD_LABEL}>Contact email</span>
                <input className={INPUT} type="email" name="contact_email" defaultValue={selected.contact_email} required disabled={!editable} />
              </label>

              <label className={FIELD}>
                <span className={FIELD_LABEL}>Contact phone</span>
                <input className={INPUT} type="tel" name="contact_phone" defaultValue={selected.contact_phone ?? ""} required disabled={!editable} />
              </label>

              <label className={FIELD}>
                <span className={FIELD_LABEL}>Primary location</span>
                <select className={INPUT} name="primary_region_id" defaultValue={selected.primary_region_id ?? ""} required disabled={!editable}>
                  <option value="">Choose a region</option>
                  {regions.map((region: { id: string; name: string; is_active: boolean }) => (
                    <option
                      key={region.id}
                      value={region.id}
                      disabled={!region.is_active && region.id !== selected.primary_region_id}
                    >
                      {region.name}{region.is_active ? "" : " (inactive)"}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset className="md:col-span-2">
                <legend className={FIELD_LABEL}>Regions the company operates in</legend>
                <div className="mt-(--space-3) flex flex-wrap gap-(--space-2)">
                  {regions.map((region: { id: string; name: string; is_active: boolean }) => {
                    const selectedRegion = operatingIds.includes(region.id);
                    return (
                      <label key={region.id} className={CHECK_OPTION}>
                        <input
                          type="checkbox"
                          name="operating_region_ids"
                          value={region.id}
                          defaultChecked={selectedRegion}
                          disabled={!editable || (!region.is_active && !selectedRegion)}
                          className={CHECKBOX}
                        />
                        {region.name}{region.is_active ? "" : " (inactive)"}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="md:col-span-2">
                <PendingSubmitButton className={BTN_GHOST_SM} disabled={!editable} idleLabel="Save onboarding details" />
              </div>
            </form>
          </div>

          <div className="mt-(--space-6) flex flex-col gap-(--space-6)">
            {checklist.map((item) => {
              const rows = byType.get(item.id) ?? [];
              const checks = requirements.filter((requirement) => requirement.doc_type === item.id);
              const mandatory = checks.filter((requirement) => requirement.is_required);
              const optional = mandatory.length === 0;
              const done = !checklistUnavailable && (mandatory.length > 0
                ? mandatory.every((requirement) => requirement.is_verified)
                : checks.some((requirement) => requirement.is_verified));
              const omittedAbn = item.id === "abn_verified" && !selected.abn;
              const stateLabel = done
                ? "Verified"
                : optional
                  ? "Not required"
                  : item.kind === "document"
                    ? rows.length === 0 ? "Not submitted"
                      : rows.every((doc) => !doc.file_path?.trim()) ? "File required"
                      : rows.some((doc) => !companyDocumentIssue(doc, today) && signed.has(doc.id))
                        ? "Awaiting verification" : "Needs attention"
                    : item.id === "payment_details" ? "Not confirmed" : "Outstanding";
              return (
                <div key={item.id} id={`checklist-${item.id}`} className="scroll-mt-6 border-t border-hairline pt-(--space-5)">
                  <div className="flex flex-wrap items-center gap-(--space-3)">
                    <h3 className={SUBSECTION_TITLE}>{item.label}</h3>
                    {optional && <span className="text-xs text-on-dark-faint">optional</span>}
                    <span className={pill(done ? toneFor("Active") : toneFor("Pending"))}>
                      {stateLabel}
                    </span>
                  </div>
                  {one("section") === item.id && (problem || saved) && (
                    <Notice tone={problem ? "error" : "ok"} className="mt-(--space-3)">{problem || saved}</Notice>
                  )}

                  {item.kind === "flag" ? (
                    <div className="mt-(--space-3) flex flex-wrap items-center gap-(--space-4)">
                      <p className={FIELD_HINT}>
                        {item.id === "payment_details"
                          ? "Reference only — no bank data is stored."
                          : omittedAbn
                          ? "No ABN was supplied. This does not block verification or activation."
                          : "Checked against the Australian Business Register by hand."}
                      </p>
                      {!done && !omittedAbn && selected.status !== "Closed" && !checklistUnavailable && (
                        <form action={verifyCompanyDocument}>
                          <input type="hidden" name="company_id" value={selected.id} />
                          <input type="hidden" name="expected_status" value={selected.status} />
                          <input type="hidden" name="doc_type" value={item.id} />
                          {item.id === "abn_verified" && (
                            <input type="hidden" name="expected_abn" value={selected.abn ?? ""} />
                          )}
                          <PendingSubmitButton className={BTN_GHOST_SM} idleLabel={`Mark ${item.label.toLowerCase()}`} pendingLabel="Verifying…" />
                        </form>
                      )}
                    </div>
                  ) : (
                    <>
                      <TableFrame inset className="mt-(--space-4)">
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
                              <TableEmpty colSpan={7}>No details or file saved yet.</TableEmpty>
                            )}
                            {rows.map((doc) => {
                              const status = expiryStatus(doc.expiry_date);
                              const issue = companyDocumentIssue(doc, today)
                                ?? (!signed.has(doc.id) ? "The file could not be opened. Refresh before verifying." : null);
                              const canAttach = !doc.file_path?.trim() && !doc.verified_at && !doc.verified_by && selected.status !== "Closed";
                              return (
                                <tr key={doc.id} id={`document-${doc.id}`} className="scroll-mt-6">
                                  <td className={`${TD} tabular-nums`}>{doc.number ?? "—"}</td>
                                  <td className={TD}>{doc.issuer ?? "—"}</td>
                                  <td className={`${TD} whitespace-nowrap tabular-nums`}>{formatDate(doc.issue_date)}</td>
                                  <td className={`${TD} whitespace-nowrap tabular-nums`}>{formatDate(doc.expiry_date)}</td>
                                  <td className={TD}>
                                    {!doc.file_path?.trim() ? <><span className={pill(toneFor("Pending"))}>File required</span><span className={`mt-(--space-2) block ${FIELD_HINT}`}>Details saved; unverified.</span></>
                                      : status === "—" ? <span className="text-on-dark-muted">No expiry recorded</span> : <span className={pill(toneFor(status))}>{status}</span>}
                                  </td>
                                  <td className={TD}>
                                    {signed.get(doc.id) ? (
                                      <a
                                        className={`inline-flex min-h-11 items-center gap-(--space-1) text-sm font-semibold text-on-dark underline underline-offset-4 ${NAV_FOCUS}`}
                                        href={signed.get(doc.id)}
                                        rel="noopener noreferrer"
                                        target="_blank"
                                      >
                                        Open
                                      </a>
                                    ) : (
                                      <span className={FIELD_HINT}>{doc.file_path?.trim() ? "File unavailable" : "No file attached"}</span>
                                    )}
                                  </td>
                                  <td className={`${TD} min-w-[16rem]`}>
                                    {one("document") === doc.id && (problem || saved) && (
                                      <Notice tone={problem ? "error" : "ok"} className="mb-(--space-3)">{problem || saved}</Notice>
                                    )}
                                    {issue && <p className={`${FIELD_HINT} mb-(--space-3)`}>{issue}</p>}
                                    {doc.verified_at && (
                                      <span className="tabular-nums text-on-dark-muted">
                                        Verified {formatDate(doc.verified_at)}
                                      </span>
                                    )}
                                    {selected.status !== "Closed" && !checklistUnavailable && (!doc.verified_at || (
                                      item.id === "trade_licence" && requiredLicences.length > 0 &&
                                      !requiredLicences.some((requirement) => requirement.qualification_id === doc.qualification_id)
                                    )) && (
                                      <form action={verifyCompanyDocument} className="flex flex-col gap-(--space-3)">
                                        <input type="hidden" name="company_id" value={selected.id} />
                                        <input type="hidden" name="expected_status" value={selected.status} />
                                        <input type="hidden" name="document_id" value={doc.id} />
                                        <input type="hidden" name="doc_type" value={doc.doc_type} />
                                        {item.id === "trade_licence" && requiredLicences.length > 0 && (
                                          <label className={FIELD}>
                                            <span className={FIELD_LABEL}>Catalogue licence</span>
                                            <select className={INPUT_SM} name="qualification_id" defaultValue={doc.qualification_id ?? ""} required>
                                              <option value="" disabled>Choose the licence evidenced</option>
                                              {requiredLicences.map((requirement) => (
                                                <option key={requirement.qualification_id} value={requirement.qualification_id ?? ""}>
                                                  {requirement.label}
                                                </option>
                                              ))}
                                            </select>
                                          </label>
                                        )}
                                        <div>
                                          <PendingSubmitButton className={BTN_GHOST_SM} idleLabel="Verify" pendingLabel="Verifying…" disabled={!!issue} />
                                        </div>
                                      </form>
                                    )}
                                    {canAttach && (
                                      <details className="mt-(--space-3)">
                                        <summary className="cursor-pointer py-(--space-2) font-semibold">Edit saved details</summary>
                                        <CompanyDocumentForm key={doc.id} documentId={doc.id} document={doc} companyId={selected.id} companyStatus={selected.status} detailsOnly />
                                      </details>
                                    )}
                                    {canAttach && (
                                      <form action={uploadCompanyDocument} className="mt-(--space-3) flex min-w-56 flex-col gap-(--space-3)">
                                        <input type="hidden" name="as_maintain" value="1" />
                                        <input type="hidden" name="company_id" value={selected.id} />
                                        <input type="hidden" name="expected_status" value={selected.status} />
                                        <input type="hidden" name="document_id" value={doc.id} />
                                        <input type="hidden" name="doc_type" value={doc.doc_type} />
                                        <input type="hidden" name="expected_document" value={JSON.stringify({ number: doc.number, issuer: doc.issuer, issue_date: doc.issue_date, expiry_date: doc.expiry_date })} />
                                        <label className={FIELD}>
                                          <span className={FIELD_LABEL}>Attach the existing document</span>
                                          <CompanyDocumentFileInput />
                                        </label>
                                        <div>
                                          <PendingSubmitButton className={BTN_GHOST_SM} idleLabel="Attach file" pendingLabel="Uploading…" />
                                        </div>
                                      </form>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </TableFrame>

                      {/* 16.1 — paperwork arrives by phone and email, so Maintain can
                          upload it on the company's behalf. The row is audited with the
                          acting admin. */}
                      <div className="mt-(--space-4)">
                        <CompanyDocumentForm
                          key={`${selected.id}:${item.id}`}
                          documentId={crypto.randomUUID()}
                          docType={item.id}
                          companyId={selected.id}
                          companyStatus={selected.status}
                          disabled={selected.status === "Closed"}
                        />
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* -------------------------------------------------- 1.5 decision */}
          {selected.status === "Pending" && (
          <div className="mt-(--space-7) grid gap-(--space-8) border-t border-hairline pt-(--space-5) lg:grid-cols-2">
            <form action={approveCompany} className="flex flex-col gap-(--space-3)">
              <div>
                <h3 className={SUBSECTION_TITLE}>Approve</h3>
                <p className={`${FIELD_HINT} mt-(--space-1)`}>
                  Sets the company Active and emails it. From then on it can list spare
                  capacity and post requirements. Missing information or files do not block
                  admin approval. Document verification statuses stay unchanged.
                </p>
              </div>
              <input type="hidden" name="company_id" value={selected.id} />
              <input type="hidden" name="expected_status" value={selected.status} />
              <ApprovalSubmitButton
                checklistUnavailable={checklistUnavailable}
                outstandingLabels={outstanding.map((item) => item.label)}
              />
            </form>

            <form action={rejectCompany} className="flex flex-col gap-(--space-3)">
              <div>
                <h3 className={SUBSECTION_TITLE}>Reject</h3>
                <p className={`${FIELD_HINT} mt-(--space-1)`}>
                  The company stays Pending, the reason is audited, and the company is told
                  what is missing.
                </p>
              </div>
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
