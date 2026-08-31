import type { TransactionLine } from "./transaction-fixtures";

/** An independent oracle, not the production money implementation under test. */
export function commercialExpectation(line: TransactionLine, feeBp: number) {
  const days = (Date.parse(`${line.endDate}T00:00:00Z`) - Date.parse(`${line.startDate}T00:00:00Z`)) / 86_400_000 + 1;
  const buyerRate = Number((BigInt(line.supplierRateCents) * BigInt(10_000 + feeBp) + BigInt(5_000)) / BigInt(10_000));
  const hours = Math.floor(line.hoursPerWeek * days / 7 + 0.5);
  const supplierValue = line.supplierRateCents * hours * line.nomineeWorkerIds.length;
  const buyerValue = buyerRate * hours * line.nomineeWorkerIds.length;
  return { buyerRate, hours, supplierValue, buyerValue, feePerHour: buyerRate - line.supplierRateCents,
    maintainRevenue: buyerValue - supplierValue };
}

export function aud(cents: number): string {
  return `${new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100)} ex GST`;
}

/** Parse the actual download, including quoted commas, newlines and escaped quotes. */
export function csvRecords(source: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const text = source.replace(/^\uFEFF/, "");
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("The engagement CSV contains an unterminated quoted field.");
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift();
  if (!headers?.length || new Set(headers).size !== headers.length) throw new Error("Missing or duplicate CSV headers.");
  return rows.map((values) => {
    if (values.length !== headers.length) throw new Error("The engagement CSV has a malformed row.");
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}
