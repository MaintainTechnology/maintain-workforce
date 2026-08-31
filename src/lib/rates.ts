import "server-only";

import { getBookingRules } from "@/lib/config";
import { buyerRateCents } from "@/lib/domain/money";
import { createAdminClient } from "@/lib/supabase/admin";

// Rate bands — spec 5.1, 5.2, 5.5, 17.1, 20.4.
//
// This module is the only place a rate band row is read. RLS revokes rate_band from
// authenticated (17.1), so every read here runs through the service role and this
// module decides what each side of the exchange is allowed to receive:
//
//   - a supplying business sees the recommended band for the trades of its own crew.
//     That band pre-fills its rate field; the business then confirms or overrides it,
//     because the supplier owns its rate (5.2) and Maintain never sets a
//     non-negotiable price between competing businesses.
//   - a hiring business never receives a raw band value. It receives only the
//     fee-marked-up indicative range (5.5), computed here and never on the client.
//
// A missing band never invents a rate (20.4): these functions return null and the
// caller flags the line "no recommended band".

export type RateBand = { lowCents: number; highCents: number };

type BandRow = {
  trade_role_id: string;
  proficiency_id: string;
  region_id: string;
  band_low_cents: number;
  band_high_cents: number;
};

/** Bands are published per (trade, proficiency, region) — 5.1. That triple is the key. */
export function bandKey(tradeRoleId: string, proficiencyId: string, regionId: string): string {
  return `${tradeRoleId}:${proficiencyId}:${regionId}`;
}

// 20.5 — calendar dates are Australia/Brisbane, which is UTC+10 and never observes
// daylight saving, so the offset is a constant rather than a timezone library.
const BRISBANE_OFFSET_MS = 10 * 60 * 60 * 1000;

function brisbaneToday(): string {
  return new Date(Date.now() + BRISBANE_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * 5.1 — band history is retained as effective-dated rows and never destructively
 * edited, so "the current band" is the latest row that has already taken effect.
 * Ordering by effective_from descending and keeping the first row per triple does
 * that in one query.
 */
async function currentBands(tradeRoleIds?: string[]): Promise<Map<string, RateBand>> {
  const admin = createAdminClient();

  let query = admin
    .from("rate_band")
    .select("trade_role_id, proficiency_id, region_id, band_low_cents, band_high_cents")
    .lte("effective_from", brisbaneToday())
    .order("effective_from", { ascending: false });

  if (tradeRoleIds) {
    if (tradeRoleIds.length === 0) return new Map();
    query = query.in("trade_role_id", tradeRoleIds);
  }

  const { data } = await query;
  const bands = new Map<string, RateBand>();
  for (const row of (data ?? []) as BandRow[]) {
    const key = bandKey(row.trade_role_id, row.proficiency_id, row.region_id);
    if (bands.has(key)) continue; // a later effective_from already claimed this triple
    bands.set(key, {
      lowCents: Number(row.band_low_cents),
      highCents: Number(row.band_high_cents),
    });
  }
  return bands;
}

/**
 * 5.2 / 17.1 — the supplier-side projection: bands scoped to the trades this business
 * runs, which is exactly what the capacity form needs to pre-fill a rate. Suppliers
 * see their own recommended band and never another supplier's confirmed rate.
 */
export async function supplierBandMap(tradeRoleIds: string[]): Promise<Record<string, RateBand>> {
  return Object.fromEntries(await currentBands(tradeRoleIds));
}

export async function supplierBand(
  tradeRoleId: string,
  proficiencyId: string,
  regionId: string,
): Promise<RateBand | null> {
  const bands = await currentBands([tradeRoleId]);
  return bands.get(bandKey(tradeRoleId, proficiencyId, regionId)) ?? null;
}

/**
 * 5.5 — the indicative all-in range shown at demand creation: each end of the band
 * marked up by the current fee, computed server-side. Only marked-up figures leave
 * this function, so no buyer-facing surface can carry a raw band value (17.1).
 */
export async function indicativeRangeMap(): Promise<Record<string, RateBand>> {
  const [bands, { feeBp }] = await Promise.all([currentBands(), getBookingRules()]);
  const ranges: Record<string, RateBand> = {};
  for (const [key, band] of bands) ranges[key] = markUp(band, feeBp);
  return ranges;
}

export async function indicativeRange(
  tradeRoleId: string,
  proficiencyId: string,
  regionId: string,
): Promise<RateBand | null> {
  const [bands, { feeBp }] = await Promise.all([
    currentBands([tradeRoleId]),
    getBookingRules(),
  ]);
  const band = bands.get(bandKey(tradeRoleId, proficiencyId, regionId));
  return band ? markUp(band, feeBp) : null;
}

/** 5.4 — the same round-half-up derivation that fixes the actual buyer rate. */
function markUp(band: RateBand, feeBp: number): RateBand {
  return {
    lowCents: buyerRateCents(band.lowCents, feeBp),
    highCents: buyerRateCents(band.highCents, feeBp),
  };
}
