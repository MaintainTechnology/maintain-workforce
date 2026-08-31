import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TransferStatus } from "@/lib/supabase/types";

export type TransferSearchParams = Record<string, string | string[] | undefined>;
export type TransferPage = { page: number; hasPrevious: boolean; hasNext: boolean };
export type TransferQueueRow = {
  id: string;
  worker_id: string | null;
  from_company_id: string | null;
  to_company_id: string;
  status: TransferStatus;
  reason: string | null;
  created_at: string;
  decided_at: string | null;
};

const PAGE_SIZE = 50;

export function transferPageNumber(value: string | string[] | undefined): number {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 && Number.isSafeInteger(page * PAGE_SIZE)
    ? page : 1;
}

export function transferPageHref(pathname: string, search: TransferSearchParams, page: number): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (key === "page" || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) query.append(key, item);
  }
  if (page > 1) query.set("page", String(page));
  const suffix = query.toString();
  return suffix ? `${pathname}?${suffix}` : pathname;
}

/** Every page fits below the API response cap, including one next-page sentinel. */
export async function loadTransferPage(
  db: SupabaseClient,
  relation: "worker_transfer" | "company_transfer_view",
  rawPage: string | string[] | undefined,
): Promise<{ rows: TransferQueueRow[]; pagination: TransferPage }> {
  const page = transferPageNumber(rawPage);
  const from = (page - 1) * PAGE_SIZE;
  const { data, error } = await db.from(relation)
    .select("id, worker_id, from_company_id, to_company_id, status, reason, created_at, decided_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + PAGE_SIZE);
  if (error) throw new Error("Transfer requests could not be loaded. Please refresh and try again.");
  const rows = (data ?? []) as TransferQueueRow[];
  return {
    rows: rows.slice(0, PAGE_SIZE),
    pagination: { page, hasPrevious: page > 1, hasNext: rows.length > PAGE_SIZE },
  };
}
