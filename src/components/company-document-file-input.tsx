"use client";

import { COMPANY_DOCUMENT_MAX_BYTES, COMPANY_DOCUMENT_MIME_TYPES } from "@/lib/company-document-policy";
import { FIELD_HINT, INPUT } from "@/lib/platform-ui";

export function CompanyDocumentFileInput({ disabled = false, required = true }: { disabled?: boolean; required?: boolean }) {
  return (
    <>
      <input
        className={INPUT}
        type="file"
        name="file"
        accept="application/pdf,image/jpeg,image/png"
        required={required}
        disabled={disabled}
        onChange={(event) => {
          const input = event.currentTarget;
          const file = input.files?.[0];
          input.setCustomValidity(!file ? "" : file.size > COMPANY_DOCUMENT_MAX_BYTES
            ? "Choose a PDF, JPG or PNG no larger than 4 MB."
            : !COMPANY_DOCUMENT_MIME_TYPES.some((type) => type === file.type)
              ? "Choose a PDF, JPG or PNG file."
              : "");
          if (file) input.reportValidity();
        }}
      />
      <span className={FIELD_HINT}>PDF, JPG or PNG. Maximum 4 MB.</span>
    </>
  );
}
