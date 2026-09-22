"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { FormResult } from "@/lib/actions";
import { saveCompanyDocumentForm } from "@/lib/actions/company";
<<<<<<< HEAD
import { FIELD, FIELD_ERROR, FIELD_HINT, FIELD_LABEL, FIELD_OK, INPUT, MONO } from "@/lib/platform-ui";
=======
import { FIELD, FIELD_HINT, FIELD_LABEL, INPUT, MONO } from "@/lib/platform-ui";
>>>>>>> fb1ccdc2a57e4bf8192bcc59dadd4f7c99c31aba
import type { CompanyStatus } from "@/lib/supabase/types";
import { BTN_GHOST, BTN_PRIMARY } from "@/lib/ui";
import { CompanyDocumentFileInput } from "./company-document-file-input";

type DocumentDetails = {
  id: string;
  doc_type: string;
  number: string | null;
  issuer: string | null;
  issue_date: string | null;
  expiry_date: string | null;
};

/** The same explicit save/upload workflow in company settings and admin review. */
export function CompanyDocumentForm({
  documentId, document, docType, types, companyId, companyStatus, disabled = false, detailsOnly = false,
}: {
  documentId: string;
  document?: DocumentDetails;
  docType?: string;
  types?: { id: string; label: string; optional: boolean }[];
  companyId?: string;
  companyStatus?: CompanyStatus;
  disabled?: boolean;
  detailsOnly?: boolean;
}) {
  const [state, action, pending] = useActionState<FormResult | null, FormData>(saveCompanyDocumentForm, null);
  const [stableDocumentId] = useState(state?.values?.document_id ?? documentId);
  const [fields, setFields] = useState({
    doc_type: state?.values?.doc_type ?? document?.doc_type ?? docType ?? types?.[0]?.id ?? "public_liability",
    number: state?.values?.number ?? document?.number ?? "", issuer: state?.values?.issuer ?? document?.issuer ?? "",
    issue_date: state?.values?.issue_date ?? document?.issue_date ?? "", expiry_date: state?.values?.expiry_date ?? document?.expiry_date ?? "",
  });
  const [initialSnapshot] = useState(document ? JSON.stringify({
    number: document.number, issuer: document.issuer, issue_date: document.issue_date, expiry_date: document.expiry_date,
  }) : "");
  const snapshot = state?.values?.expected_document ?? initialSnapshot;
  const fileSaved = state?.values?.file_saved === "1";
  const readOnly = disabled || pending || fileSaved;
  const update = (name: keyof typeof fields, value: string) => setFields((current) => ({ ...current, [name]: value }));
  const form = useRef<HTMLFormElement>(null);
  // React suppresses synthetic reset handlers during its action commit. A native
  // listener keeps the chosen type and file available after Save details/errors.
  useEffect(() => {
    const element = form.current;
    const preserveInputs = (event: Event) => event.preventDefault();
    element?.addEventListener("reset", preserveInputs);
    return () => element?.removeEventListener("reset", preserveInputs);
  }, []);

  return (
    <form ref={form} action={action} className="grid gap-(--space-3) md:grid-cols-2" aria-label={document ? "Edit saved document details" : "Save document details or upload a file"}>
      <input type="hidden" name="document_id" value={stableDocumentId} />
      <input type="hidden" name="expected_document" value={snapshot} />
      {companyId && <>
        <input type="hidden" name="as_maintain" value="1" />
        <input type="hidden" name="company_id" value={companyId} />
        <input type="hidden" name="expected_status" value={companyStatus ?? ""} />
      </>}
      {types && !snapshot ? (
        <label className={FIELD}>
          <span className={FIELD_LABEL}>Document type</span>
          <select className={INPUT} name="doc_type" value={fields.doc_type} onChange={(event) => update("doc_type", event.target.value)} disabled={readOnly}>
            {types.map((type) => <option key={type.id} value={type.id}>{type.label}{type.optional ? " (optional)" : ""}</option>)}
          </select>
        </label>
      ) : <input type="hidden" name="doc_type" value={fields.doc_type} />}
      {([
        ["number", "Number", "text"], ["issuer", "Issuer", "text"],
        ["issue_date", "Issued", "date"], ["expiry_date", "Expires", "date"],
      ] as const).map(([name, label, type]) => (
        <label className={FIELD} key={name}>
          <span className={FIELD_LABEL}>{label}</span>
          <input className={`${INPUT} ${name === "number" ? MONO : ""}`} name={name} type={type}
            value={fields[name]} onChange={(event) => update(name, event.target.value)} disabled={readOnly}
            maxLength={name === "number" ? 120 : name === "issuer" ? 200 : undefined} />
        </label>
      ))}
      {!detailsOnly && <label className={FIELD}>
        <span className={FIELD_LABEL}>File (optional when saving details)</span>
        <CompanyDocumentFileInput required={false} disabled={readOnly} />
      </label>}
      <div className="flex flex-col gap-(--space-3) md:col-span-2">
        <p className={FIELD_HINT}>Save the details now and attach a file when ready. Saving does not verify the document.{!detailsOnly && " Use Upload document to send the selected file."}</p>
<<<<<<< HEAD
        {state?.message && <p role={state.ok ? "status" : "alert"} aria-live="polite" className={state.ok ? FIELD_OK : FIELD_ERROR}>{state.message}</p>}
=======
        {state?.message && <p role={state.ok ? "status" : "alert"} aria-live="polite" className="flex items-start gap-(--space-2) text-sm font-semibold text-on-dark">
          <span aria-hidden="true" className={`mt-[0.45em] size-2 shrink-0 rounded-(--radius-pill) ${state.ok ? "bg-status-active" : "bg-status-critical"}`} />
          <span>{state.message}</span>
        </p>}
>>>>>>> fb1ccdc2a57e4bf8192bcc59dadd4f7c99c31aba
        {fileSaved ? <p className={FIELD_HINT}>The saved document is listed above. Refresh this page to add another document.</p> : (
          <div className="flex flex-wrap gap-(--space-3)">
            <button type="submit" name="intent" value="details" formNoValidate disabled={readOnly} aria-busy={pending || undefined} className={companyId ? BTN_GHOST : BTN_PRIMARY}>
              {pending ? "Saving…" : "Save details"}
            </button>
            {!detailsOnly && <button type="submit" name="intent" value="upload" disabled={readOnly} aria-busy={pending || undefined} className={BTN_GHOST}>
              {pending ? "Saving…" : "Upload document"}
            </button>}
          </div>
        )}
      </div>
    </form>
  );
}
