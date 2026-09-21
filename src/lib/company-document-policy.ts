export const COMPANY_DOCUMENT_MAX_BYTES = 4 * 1024 * 1024;
export const COMPANY_DOCUMENT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png"] as const;
export const COMPANY_DOCUMENT_TYPES = ["public_liability", "workers_comp", "trade_licence", "lh_licence"] as const;

/** Mirrors the document readiness rules enforced by the verification transaction. */
export function companyDocumentIssue(
  document: { file_path: string | null; issue_date: string | null; expiry_date: string | null },
  today: string,
): string | null {
  if (!document.file_path?.trim()) return "Attach the document file before verifying.";
  if (document.expiry_date && document.expiry_date < today) return "This document has expired. Upload a current document.";
  if (document.issue_date && document.issue_date > today) return "This document is not valid yet. Check its issue date or upload a current document.";
  return null;
}
