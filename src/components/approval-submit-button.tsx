"use client";

import { useFormStatus } from "react-dom";
import { BTN_PRIMARY } from "@/lib/ui";

type ApprovalSubmitButtonProps = {
  checklistUnavailable: boolean;
  outstandingLabels: string[];
};

export function ApprovalSubmitButton({
  checklistUnavailable,
  outstandingLabels,
}: ApprovalSubmitButtonProps) {
  const { pending } = useFormStatus();
  const hasOutstanding = checklistUnavailable || outstandingLabels.length > 0;
  const explanationId = hasOutstanding ? "approval-outstanding-items" : undefined;

  return (
    <>
      <button
        type="submit"
        className={`${BTN_PRIMARY} self-start`}
        disabled={pending}
        aria-describedby={explanationId}
      >
        {pending ? "Approving…" : "Approve and activate"}
      </button>
      {hasOutstanding && (
        <p id="approval-outstanding-items" className="max-w-[54ch] text-body-sm text-on-dark-muted">
          {checklistUnavailable
            ? "Checklist details are unavailable. Maintain admins can still approve this account. The approval decision is audited."
            : `You can approve with these items outstanding: ${outstandingLabels.join(", ")}. They will remain unverified, and your approval decision will be audited.`}
        </p>
      )}
    </>
  );
}
