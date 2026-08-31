import { describe, expect, it } from "vitest";
import {
  brisbaneToday,
  capacityLinesToExpire,
  credentialStatus,
  credentialTransitions,
  demandLinesToExpire,
  engagementsOverdue,
  engagementsToActivate,
  engagementsToComplete,
  matchesToExpire,
  transfersToEscalate,
} from "./cron";

// The daily job's date rules — spec module 19's executor table.
//
// Two properties matter more than any single case. First, the boundaries: a match that
// must not expire mid-window, and a final on-site day that must stay committing. Both
// are off-by-one errors that would quietly cancel real work. Second, idempotency: every
// selector is re-run against the state the transition leaves behind, and must return
// nothing. That is the "running it twice changes nothing" clause, tested rather than
// asserted.

const TODAY = "2026-08-26"; // a Wednesday

describe("Brisbane calendar date (20.5)", () => {
  it("rolls the date at 00:00 Brisbane, not at 00:00 UTC", () => {
    // 15:30 UTC on the 25th is 01:30 on the 26th in Brisbane (UTC+10, no DST).
    expect(brisbaneToday(new Date("2026-08-25T15:30:00Z"))).toBe("2026-08-26");
    expect(brisbaneToday(new Date("2026-08-25T13:59:00Z"))).toBe("2026-08-25");
  });
});

describe("credential status (1.6, 7.1)", () => {
  it("treats the expiry date itself as still valid", () => {
    expect(credentialStatus(TODAY, TODAY)).toBe("Expiring Soon");
    expect(credentialStatus("2026-08-25", TODAY)).toBe("Expired");
  });

  it("warns at exactly 30 days and not at 31", () => {
    expect(credentialStatus("2026-09-25", TODAY)).toBe("Expiring Soon"); // 30 days out
    expect(credentialStatus("2026-09-26", TODAY)).toBe("Current"); // 31 days out
  });

  it("never expires a credential with no recorded expiry", () => {
    expect(credentialStatus(null, TODAY)).toBe("Current");
  });

  it("reports only what moved, so a second run warns nobody twice", () => {
    const rows = [
      { id: "warn", expiry_date: "2026-09-10", status: "Current" as const },
      { id: "gone", expiry_date: "2026-08-01", status: "Expiring Soon" as const },
      { id: "steady", expiry_date: "2027-01-01", status: "Current" as const },
    ];

    const first = credentialTransitions(rows, TODAY);
    expect(first).toEqual([
      { id: "warn", from: "Current", to: "Expiring Soon" },
      { id: "gone", from: "Expiring Soon", to: "Expired" },
    ]);

    // Apply what the job would have written, then run again.
    for (const t of first) {
      const row = rows.find((r) => r.id === t.id)!;
      row.status = t.to as typeof row.status;
    }
    expect(credentialTransitions(rows, TODAY)).toEqual([]);
  });
});

describe("capacity and demand line expiry (9.5, 10.3)", () => {
  it("expires a line the day after its window closes, not on the last day", () => {
    const lines = [
      { id: "last-day", status: "Open", available_until: TODAY },
      { id: "closed", status: "Open", available_until: "2026-08-25" },
      { id: "partial", status: "Partially Committed", available_until: "2026-08-25" },
      { id: "full", status: "Fully Committed", available_until: "2026-08-25" },
      { id: "already", status: "Expired", available_until: "2026-01-01" },
      { id: "withdrawn", status: "Withdrawn", available_until: "2026-01-01" },
    ];
    expect(capacityLinesToExpire(lines, TODAY)).toEqual(["closed", "partial", "full"]);

    // Idempotency: after the write, the same selector finds nothing.
    for (const id of ["closed", "partial", "full"]) {
      lines.find((l) => l.id === id)!.status = "Expired";
    }
    expect(capacityLinesToExpire(lines, TODAY)).toEqual([]);
  });

  it("expires a demand line once its end date has passed", () => {
    const lines = [
      { id: "running", status: "Open", end_date: TODAY },
      { id: "over", status: "Partially Filled", end_date: "2026-08-25" },
      { id: "filled", status: "Filled", end_date: "2026-08-01" },
    ];
    expect(demandLinesToExpire(lines, TODAY)).toEqual(["over", "filled"]);

    lines.find((l) => l.id === "over")!.status = "Expired";
    lines.find((l) => l.id === "filled")!.status = "Expired";
    expect(demandLinesToExpire(lines, TODAY)).toEqual([]);
  });
});

describe("match expiry (12.1, 9.5)", () => {
  const base = {
    status: "Awaiting Supplier",
    proposed_at: "2026-08-24T22:00:00Z", // 25 August, Brisbane
    demand_end: "2026-09-30",
    capacity_until: "2026-09-30",
  };

  it("does NOT expire a mid-window backfill proposal", () => {
    // The requirement started three weeks ago and runs for another month; the match was
    // proposed yesterday to backfill a cancellation. A start date in the past is normal
    // and must never, on its own, expire a match.
    const match = { ...base, id: "backfill", demand_end: "2026-09-30" };
    expect(matchesToExpire([match], TODAY)).toEqual([]);
  });

  it("expires exactly seven days after proposal", () => {
    const proposed = { ...base, id: "stale", proposed_at: "2026-08-19T00:30:00Z" };
    expect(matchesToExpire([proposed], "2026-08-25")).toEqual([]); // day six
    expect(matchesToExpire([proposed], "2026-08-26")).toHaveLength(1); // day seven
  });

  it("expires once the requirement's end date has passed, even inside the seven days", () => {
    const match = { ...base, id: "window-closed", demand_end: "2026-08-25" };
    expect(matchesToExpire([match], TODAY)[0]).toMatchObject({ id: "window-closed" });
  });

  it("expires with the capacity line it references, in the same run (9.5)", () => {
    const match = { ...base, id: "line-gone", capacity_until: "2026-08-25" };
    expect(matchesToExpire([match], TODAY)).toEqual([
      { id: "line-gone", reason: "the capacity line it references has expired" },
    ]);
  });

  it("leaves closed matches alone, so a second run changes nothing", () => {
    const match = { ...base, id: "done", status: "Expired", demand_end: "2026-01-01" };
    expect(matchesToExpire([match], TODAY)).toEqual([]);
    expect(matchesToExpire([{ ...match, status: "Accepted" }], TODAY)).toEqual([]);
  });
});

describe("engagement activation and completion (13.2)", () => {
  it("activates a Confirmed engagement on its start date", () => {
    const rows = [
      { id: "starts-today", status: "Confirmed", start_date: TODAY, end_date: "2026-09-30" },
      { id: "starts-later", status: "Confirmed", start_date: "2026-09-01", end_date: "2026-09-30" },
      { id: "not-yet-paid", status: "Awaiting Commercial", start_date: TODAY, end_date: "2026-09-30" },
    ];
    // An engagement without the commercial trigger never becomes Active (13.2).
    expect(engagementsToActivate(rows, TODAY)).toEqual(["starts-today"]);

    rows.find((r) => r.id === "starts-today")!.status = "Active";
    expect(engagementsToActivate(rows, TODAY)).toEqual([]);
  });

  it("completes only once the end date has passed — the final on-site day stays committing", () => {
    const rows = [
      { id: "last-day", status: "Active", start_date: "2026-08-01", end_date: TODAY },
      { id: "finished", status: "Active", start_date: "2026-08-01", end_date: "2026-08-25" },
    ];
    expect(engagementsToComplete(rows, TODAY)).toEqual(["finished"]);

    rows.find((r) => r.id === "finished")!.status = "Completed";
    expect(engagementsToComplete(rows, TODAY)).toEqual([]);

    // The following day, the last-day engagement completes — not before.
    expect(engagementsToComplete(rows, "2026-08-27")).toEqual(["last-day"]);
  });

  it("flags Awaiting Commercial past its start date once per day (13.2)", () => {
    const rows = [
      { id: "overdue", status: "Awaiting Commercial", start_date: "2026-08-20", end_date: "2026-09-30" },
      { id: "future", status: "Awaiting Commercial", start_date: "2026-09-20", end_date: "2026-09-30" },
      { id: "paid", status: "Confirmed", start_date: "2026-08-20", end_date: "2026-09-30" },
    ];
    expect(engagementsOverdue(rows, TODAY, new Set())).toEqual(["overdue"]);
    // Second run of the same day: the audit trail already carries the flag.
    expect(engagementsOverdue(rows, TODAY, new Set(["overdue"]))).toEqual([]);
  });
});

describe("transfer escalation (8.3)", () => {
  // Queensland public holidays come from the seeded table, never a library.
  const holidays = new Set(["2026-05-04", "2026-10-05"]);

  it("counts five business days, excluding weekends", () => {
    // Requested Monday 3 August 2026; five business days later is Monday the 10th.
    const rows = [{ id: "t1", status: "Requested", created_at: "2026-08-03T01:00:00Z" }];
    expect(transfersToEscalate(rows, "2026-08-07", holidays)).toEqual([]); // Friday, day four
    expect(transfersToEscalate(rows, "2026-08-10", holidays)).toEqual(["t1"]);
  });

  it("pushes the deadline past a Queensland public holiday", () => {
    // Requested Monday 27 April 2026; the first Monday in May is a public holiday, so
    // the fifth business day lands on Tuesday 5 May rather than Monday the 4th.
    const rows = [
      { id: "t2", status: "Awaiting Current Employer", created_at: "2026-04-26T22:00:00Z" },
    ];
    expect(transfersToEscalate(rows, "2026-05-04", holidays)).toEqual([]);
    expect(transfersToEscalate(rows, "2026-05-05", holidays)).toEqual(["t2"]);
  });

  it("ignores transfers that already moved, so a second run changes nothing", () => {
    const rows = [{ id: "t3", status: "Admin Review", created_at: "2026-01-01T00:00:00Z" }];
    expect(transfersToEscalate(rows, TODAY, holidays)).toEqual([]);
    expect(transfersToEscalate([{ ...rows[0], status: "Approved" }], TODAY, holidays)).toEqual([]);
  });
});
