type QualificationRow = {
  qualification_id?: unknown;
  status?: unknown;
  expiry_date?: unknown;
};

/** Historical uploads are retained; matching uses the longest-valid replacement. */
export function effectiveQualification<T extends QualificationRow>(
  rows: T[],
  qualificationId: string,
  today: string,
): T | undefined {
  let best: T | undefined;
  let bestCurrent = false;
  let bestExpiry = "";
  for (const row of rows) {
    if (row.qualification_id !== qualificationId) continue;
    const expiry = typeof row.expiry_date === "string" ? row.expiry_date : "9999-12-31";
    const current = row.status !== "Expired" && expiry >= today;
    if (!best || (current && !bestCurrent) || (current === bestCurrent && expiry > bestExpiry)) {
      best = row;
      bestCurrent = current;
      bestExpiry = expiry;
    }
  }
  return best;
}
