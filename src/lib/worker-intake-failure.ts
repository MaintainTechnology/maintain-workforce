import "server-only";

/** Keep database internals and worker contact details out of the response and logs. */
export function workerIntakeFailure(
  error: { code?: string } | null,
  values: Record<string, string>,
  stage: "catalogue" | "duplicates" | "save" = "save",
) {
  const code = error?.code ?? "NO_RESULT";
  console.error("[worker-intake] Could not complete worker intake", { stage, code });

  let message = "That worker could not be saved. Your details have been kept. Try again.";
  if (code === "PGRST202" || code === "PGRST205") {
    message = "Worker setup needs attention from Maintain. Your details have been kept. Please contact Maintain support.";
  } else if (code === "23514" || code === "23503") {
    message = "Some selected worker options are no longer available. Refresh the page and check the worker's region, trade, proficiency and skills.";
  } else if (code === "42501") {
    message = "This account cannot add workers right now. Refresh the page to check its status or contact Maintain support.";
  }

  return { ok: false, values, message };
}
