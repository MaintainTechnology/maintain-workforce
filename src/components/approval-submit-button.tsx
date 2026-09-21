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
  const blocked = checklistUnavailable || outstandingLabels.length > 0;
  const disabled = blocked || pending;
  const explanationId = blocked ? "approval-blocked-reason" : undefined;

  return (
    <>
      <button
        type="submit"
        className={`${BTN_PRIMARY} self-start`}
        disabled={disabled}
        aria-describedby={explanationId}
      >
        {pending ? "Approving…" : "Approve and activate"}
      </button>
      {blocked && (
        <p id="approval-blocked-reason" className="max-w-[54ch] text-body-sm text-on-dark-muted">
          {checklistUnavailable
            ? "Approval is unavailable because the verification checklist could not be loaded. Refresh this page before trying again."
            : `Approval is locked. Complete these required items first: ${outstandingLabels.join(", ")}.`}
        </p>
      )}
    </>
  );
}
