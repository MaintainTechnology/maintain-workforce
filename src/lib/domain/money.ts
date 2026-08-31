// Money rules — spec module 20.
// Every amount in this system is integer cents (20.1). Nothing here returns a float
// dollar value, because a rounding drift in the fee is the one arithmetic error the
// marketplace cannot absorb: it lands on a real invoice.

/** Basis points. 1500 = 15%, the spec's placeholder default (5.3, Open Question 1). */
export const DEFAULT_FEE_BP = 1500;

/**
 * 5.4 — buyer rate = round-half-up(supplier_rate_cents × (10000 + fee_bp) / 10000).
 *
 * Half-up rather than JS's Math.round because Math.round is half-up only for
 * positives and we want the rule stated once, explicitly, where it is auditable.
 */
export function buyerRateCents(supplierRateCents: number, feeBp: number): number {
  assertInteger(supplierRateCents, "supplierRateCents");
  assertInteger(feeBp, "feeBp");
  const numerator = supplierRateCents * (10000 + feeBp);
  return roundHalfUp(numerator, 10000);
}

/** The Maintain margin per hour: buyer rate less supplier rate (14, 20.2). */
export function feeCentsPerHour(supplierRateCents: number, feeBp: number): number {
  return buyerRateCents(supplierRateCents, feeBp) - supplierRateCents;
}

/**
 * 20.3 — expected hours = hours_per_week × (inclusive calendar days ÷ 7),
 * rounded to the nearest whole hour.
 */
export function expectedHours(hoursPerWeek: number, inclusiveDays: number): number {
  if (inclusiveDays <= 0) return 0;
  return roundHalfUp(hoursPerWeek * inclusiveDays, 7);
}

/**
 * 10.1 — when a buyer enters total hours instead of hours/week:
 * hours_per_week = ceil(total_hours ÷ (inclusive days ÷ 7)).
 * The ceiling binds to the derived hours/week, not to the weeks (round-4 finding 5).
 */
export function hoursPerWeekFromTotal(totalHours: number, inclusiveDays: number): number {
  if (inclusiveDays <= 0) throw new Error("inclusiveDays must be positive");
  const weeks = inclusiveDays / 7;
  return Math.ceil(totalHours / weeks);
}

/** 20.3 — estimates are frozen at engagement creation and labelled "Estimated". */
export function engagementEstimates(input: {
  supplierRateCents: number;
  feeBp: number;
  hoursPerWeek: number;
  inclusiveDays: number;
  workerCount: number;
}) {
  const { supplierRateCents, feeBp, hoursPerWeek, inclusiveDays, workerCount } = input;
  const buyerRate = buyerRateCents(supplierRateCents, feeBp);
  const hours = expectedHours(hoursPerWeek, inclusiveDays);
  const supplierValue = supplierRateCents * hours * workerCount;
  const buyerValue = buyerRate * hours * workerCount;
  return {
    buyerRateCents: buyerRate,
    feeCentsPerHour: buyerRate - supplierRateCents,
    expectedHours: hours,
    estimatedSupplierValueCents: Math.round(supplierValue),
    estimatedBuyerValueCents: Math.round(buyerValue),
    // The difference, not an independent calculation — the three figures must reconcile.
    estimatedMaintainRevenueCents: Math.round(buyerValue) - Math.round(supplierValue),
  };
}

/** 20.5 — AUD, en-AU, ex GST. Every displayed amount carries the label (20.1). */
export function formatCentsExGst(cents: number): string {
  const dollars = cents / 100;
  return `${new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(dollars)} ex GST`;
}

function roundHalfUp(numerator: number, denominator: number): number {
  return Math.floor(numerator / denominator + 0.5);
}

function assertInteger(value: number, name: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer number of cents, received ${value}`);
  }
}
