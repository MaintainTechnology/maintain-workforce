import { describe, expect, it } from "vitest";
import { effectiveQualification } from "./matching-credentials";

describe("effective qualification for matching", () => {
  it("prefers a valid renewal over expired history irrespective of row order", () => {
    const old = { qualification_id: "ticket", status: "Expired", expiry_date: "2026-07-01" };
    const current = { qualification_id: "ticket", status: "Current", expiry_date: "2027-07-01" };
    expect(effectiveQualification([old, current], "ticket", "2026-08-31")).toBe(current);
    expect(effectiveQualification([current, old], "ticket", "2026-08-31")).toBe(current);
  });

  it("uses the longest-valid replacement so an old in-window ticket does not grey the candidate", () => {
    const inWindow = { qualification_id: "ticket", status: "Expiring Soon", expiry_date: "2026-09-05" };
    const current = { qualification_id: "ticket", status: "Current", expiry_date: "2027-09-05" };
    expect(effectiveQualification([inWindow, current], "ticket", "2026-08-31")).toBe(current);
  });

  it("recognises expiry from dates even when the daily status refresh has not run", () => {
    const stale = { qualification_id: "ticket", status: "Current", expiry_date: "2026-08-01" };
    const current = { qualification_id: "ticket", status: "Current", expiry_date: "2026-09-01" };
    expect(effectiveQualification([stale, current], "ticket", "2026-08-31")).toBe(current);
  });

  it("supports non-expiring credentials and preserves an expired badge when no renewal exists", () => {
    const expired = { qualification_id: "ticket", status: "Expired", expiry_date: "2026-08-01" };
    const lifelong = { qualification_id: "ticket", status: "Current", expiry_date: null };
    expect(effectiveQualification([expired, lifelong], "ticket", "2026-08-31")).toBe(lifelong);
    expect(effectiveQualification([expired], "ticket", "2026-08-31")).toBe(expired);
    expect(effectiveQualification([expired], "another-ticket", "2026-08-31")).toBeUndefined();
  });
});
