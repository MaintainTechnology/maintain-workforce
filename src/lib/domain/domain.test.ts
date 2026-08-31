import { describe, expect, it } from "vitest";
import { buyerRateCents, expectedHours, engagementEstimates, feeCentsPerHour, hoursPerWeekFromTotal } from "./money";
import { availability, addBusinessDays, classifyCandidate, inclusiveDays, intersect } from "./availability";
import { isValidAbn, formatAbn } from "./abn";

// The definition of done names these four calculations explicitly, so they are
// tested at the values where they are most likely to be wrong, not at happy ones.

describe("buyer rate (5.4)", () => {
  it("applies the 15% default", () => {
    expect(buyerRateCents(8000, 1500)).toBe(9200); // $80.00 -> $92.00, the spec's worked example
  });

  it("rounds half up on the exact half-cent", () => {
    // 4510 * 1.15 = 5186.5 cents. Half-up must give 5187, not banker's 5186.
    expect(buyerRateCents(4510, 1500)).toBe(5187);
  });

  it("never loses a cent between the two sides", () => {
    for (const rate of [4500, 6500, 8000, 9500, 4510, 7333]) {
      expect(feeCentsPerHour(rate, 1500)).toBe(buyerRateCents(rate, 1500) - rate);
    }
  });

  it("rejects fractional cents rather than silently truncating", () => {
    expect(() => buyerRateCents(80.5, 1500)).toThrow();
  });

  it("honours a configured fee that is not the default", () => {
    expect(buyerRateCents(10000, 1000)).toBe(11000); // 10%
    expect(buyerRateCents(10000, 0)).toBe(10000); // pilot with no fee
  });
});

describe("expected hours (20.3)", () => {
  it("counts inclusive days over seven", () => {
    // 7-25 September inclusive = 19 days; 40 h/wk -> 108.57 -> 109 hours.
    expect(expectedHours(40, 19)).toBe(109);
  });

  it("handles a single day", () => {
    expect(expectedHours(40, 1)).toBe(6); // 40/7 = 5.71 -> 6
  });

  it("returns zero for an empty window", () => {
    expect(expectedHours(40, 0)).toBe(0);
  });
});

describe("hours per week from total (10.1)", () => {
  it("ceils the derived hours, not the weeks", () => {
    // 10-day window = 1.428 weeks. 100 / 1.428 = 70 -> the ceiling binds here.
    expect(hoursPerWeekFromTotal(100, 10)).toBe(70);
  });

  it("is exact when the window is whole weeks", () => {
    expect(hoursPerWeekFromTotal(80, 14)).toBe(40);
  });
});

describe("engagement estimates (13.1, 20.3)", () => {
  it("reconciles supplier, buyer and Maintain figures", () => {
    const e = engagementEstimates({
      supplierRateCents: 8000,
      feeBp: 1500,
      hoursPerWeek: 40,
      inclusiveDays: 14,
      workerCount: 3,
    });
    expect(e.expectedHours).toBe(80);
    expect(e.buyerRateCents).toBe(9200);
    expect(e.estimatedSupplierValueCents).toBe(8000 * 80 * 3);
    expect(e.estimatedBuyerValueCents).toBe(9200 * 80 * 3);
    // The margin is the difference, never an independent calculation.
    expect(e.estimatedMaintainRevenueCents).toBe(
      e.estimatedBuyerValueCents - e.estimatedSupplierValueCents,
    );
  });

  it("scales with the nominated worker count, not the requested quantity", () => {
    const two = engagementEstimates({
      supplierRateCents: 8000, feeBp: 1500, hoursPerWeek: 40, inclusiveDays: 7, workerCount: 2,
    });
    const three = engagementEstimates({
      supplierRateCents: 8000, feeBp: 1500, hoursPerWeek: 40, inclusiveDays: 7, workerCount: 3,
    });
    expect(three.estimatedSupplierValueCents / two.estimatedSupplierValueCents).toBeCloseTo(1.5);
  });
});

describe("availability (21.2)", () => {
  const demand = { start: "2026-09-07", end: "2026-09-25" }; // 19 days

  it("is 100% when one line covers the window with enough hours", () => {
    const a = availability({
      demand,
      demandHoursPerWeek: 40,
      lines: [{ range: { start: "2026-09-01", end: "2026-09-30" }, hoursPerWeek: 40, status: "Open" }],
      committedRanges: [],
    });
    expect(a.percent).toBe(100);
    expect(a.hoursShortfall).toBe(false);
  });

  it("flags an hours shortfall while still covering the days", () => {
    const a = availability({
      demand,
      demandHoursPerWeek: 40,
      lines: [{ range: { start: "2026-09-01", end: "2026-09-30" }, hoursPerWeek: 32, status: "Open" }],
      committedRanges: [],
    });
    expect(a.percent).toBe(100);
    expect(a.hoursShortfall).toBe(true);
  });

  it("counts a Fully Committed line in the union (round-5 finding 3)", () => {
    // Commit status must never remove a line from the union; consumption does.
    const a = availability({
      demand,
      demandHoursPerWeek: 40,
      lines: [{ range: { start: "2026-09-01", end: "2026-09-30" }, hoursPerWeek: 40, status: "Fully Committed" }],
      committedRanges: [{ start: "2026-09-07", end: "2026-09-10" }],
    });
    expect(a.percent).toBeGreaterThan(0);
    expect(a.coveredDays).toBe(15); // 19 days less the 4 consumed
  });

  it("never subtracts engagement days outside the covered union", () => {
    const a = availability({
      demand,
      demandHoursPerWeek: 40,
      // line covers only 7-16 Sept (10 days)
      lines: [{ range: { start: "2026-09-07", end: "2026-09-16" }, hoursPerWeek: 40, status: "Open" }],
      // engagement sits entirely outside that union
      committedRanges: [{ start: "2026-09-20", end: "2026-09-25" }],
    });
    expect(a.coveredDays).toBe(10);
    expect(a.percent).toBe(53); // 10/19
  });

  it("returns 0% when a partial union is fully consumed (round-5 finding 2)", () => {
    const a = availability({
      demand,
      demandHoursPerWeek: 40,
      lines: [{ range: { start: "2026-09-07", end: "2026-09-11" }, hoursPerWeek: 40, status: "Open" }],
      committedRanges: [{ start: "2026-09-07", end: "2026-09-11" }],
    });
    expect(a.percent).toBe(0);
  });
});

describe("candidate classes (11.1)", () => {
  const base = {
    tradeMatches: true,
    proficiencyRank: 3,
    demandProficiencyRank: 3,
    includeHigherProficiency: false,
    regionCovered: true,
    workerStatusActive: true,
    employerActiveAndCompliant: true,
    requiredQualificationExpired: false,
    requiredQualificationExpiresBeforeStart: false,
    requiredQualificationExpiresInWindow: false,
    availabilityPercent: 100,
    softHeldElsewhere: false,
    partialCommittingConflict: false,
  };

  it("is Eligible when nothing is wrong", () => {
    expect(classifyCandidate(base).klass).toBe("Eligible");
  });

  it("excludes a zero-availability worker (11.1 / 21.2 agreement)", () => {
    expect(classifyCandidate({ ...base, availabilityPercent: 0 }).klass).toBe("Excluded");
  });

  it("greys, never excludes, a soft-held worker", () => {
    const r = classifyCandidate({ ...base, softHeldElsewhere: true });
    expect(r.klass).toBe("Greyed");
    expect(r.reasons.join()).toContain("another open match");
  });

  it("greys an in-window qualification expiry so an override can be recorded (7.3)", () => {
    expect(classifyCandidate({ ...base, requiredQualificationExpiresInWindow: true }).klass).toBe("Greyed");
  });

  it("excludes an expired qualification outright", () => {
    expect(classifyCandidate({ ...base, requiredQualificationExpired: true }).klass).toBe("Excluded");
  });

  it("excludes a non-compliant employer (1.6)", () => {
    expect(classifyCandidate({ ...base, employerActiveAndCompliant: false }).klass).toBe("Excluded");
  });

  it("hides higher proficiency until the toggle is on", () => {
    expect(classifyCandidate({ ...base, proficiencyRank: 4 }).klass).toBe("Excluded");
    expect(
      classifyCandidate({ ...base, proficiencyRank: 4, includeHigherProficiency: true }).klass,
    ).toBe("Eligible");
  });
});

describe("business days (8.3)", () => {
  it("skips weekends", () => {
    // Mon 7 Sep 2026 + 5 business days = Mon 14 Sep.
    expect(addBusinessDays("2026-09-07", 5, new Set())).toBe("2026-09-14");
  });

  it("skips Queensland public holidays from the seeded table", () => {
    const holidays = new Set(["2026-09-09"]);
    expect(addBusinessDays("2026-09-07", 5, holidays)).toBe("2026-09-15");
  });
});

describe("date helpers", () => {
  it("counts inclusive days", () => {
    expect(inclusiveDays({ start: "2026-09-07", end: "2026-09-25" })).toBe(19);
    expect(inclusiveDays({ start: "2026-09-07", end: "2026-09-07" })).toBe(1);
  });

  it("intersects windows for the engagement window rule (11.3)", () => {
    expect(intersect({ start: "2026-09-01", end: "2026-09-30" }, { start: "2026-09-07", end: "2026-10-10" }))
      .toEqual({ start: "2026-09-07", end: "2026-09-30" });
    expect(intersect({ start: "2026-09-01", end: "2026-09-05" }, { start: "2026-09-07", end: "2026-09-10" }))
      .toBeNull();
  });
});

describe("ABN checksum (1.2)", () => {
  it("accepts valid ABNs", () => {
    expect(isValidAbn("51824753556")).toBe(true); // ATO's published test ABN
    expect(isValidAbn("51 824 753 556")).toBe(true);
    // Further real, publicly listed ABNs. A checksum that rejects any of these would
    // turn away legitimate businesses at registration, so they are pinned here.
    expect(isValidAbn("53 004 085 616")).toBe(true); // Telstra
    expect(isValidAbn("33 051 775 556")).toBe(true); // BHP
    expect(isValidAbn("11 005 357 522")).toBe(true); // Woolworths
    expect(isValidAbn("48 123 123 124")).toBe(true); // ABR documented example
  });

  it("rejects a transposed digit", () => {
    expect(isValidAbn("51824753565")).toBe(false);
  });

  it("rejects wrong lengths and non-digits", () => {
    expect(isValidAbn("5182475355")).toBe(false);
    expect(isValidAbn("5182475355A")).toBe(false);
    expect(isValidAbn("")).toBe(false);
  });

  it("formats for display as the ABR prints it", () => {
    expect(formatAbn("51824753556")).toBe("51 824 753 556");
  });
});
