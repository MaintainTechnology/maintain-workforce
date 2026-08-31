import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ companyStatus: "Pending" }));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string): never => {
    throw Object.assign(new Error(`redirect:${url}`), { url });
  }),
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user-1", sessionClaims: { sub: "user-1" } })),
  currentUser: vi.fn(async () => ({
    id: "user-1",
    primaryEmailAddress: { emailAddress: "admin@example.test" },
    emailAddresses: [{ emailAddress: "admin@example.test" }],
    publicMetadata: {},
  })),
}));
vi.mock("@/lib/clerk", () => ({
  consumeCompanyInvitation: vi.fn(async () => undefined),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: {
          company_id: "company-1",
          accepted_at: "2026-08-28T00:00:00Z",
          company: { status: state.companyStatus },
        },
        error: null,
      })),
    };
    return { from: vi.fn(() => query) };
  }),
}));

const auth = await import("./auth");

type WritableGuard = () => Promise<{
  companyId: string;
  companyStatus: string;
  user: { id: string; email: string };
}>;

function writableGuard(): WritableGuard | undefined {
  return (auth as typeof auth & { requireWritableCompany?: WritableGuard }).requireWritableCompany;
}

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function exportedFunction(file: string, name: string): string {
  const start = file.indexOf(`export async function ${name}`);
  const next = file.indexOf("export async function ", start + 1);
  return file.slice(start, next === -1 ? undefined : next);
}

beforeEach(() => {
  state.companyStatus = "Pending";
});

describe("company mutation status guards", () => {
  it("allows Pending and Active companies to make non-marketplace workspace changes", async () => {
    const guard = writableGuard();
    expect(typeof guard).toBe("function");
    if (!guard) return;

    for (const status of ["Pending", "Active"]) {
      state.companyStatus = status;
      await expect(guard()).resolves.toMatchObject({ companyStatus: status });
    }
  });

  it("denies Suspended and Closed companies before a company mutation", async () => {
    const guard = writableGuard();
    expect(typeof guard).toBe("function");
    if (!guard) return;

    for (const status of ["Suspended", "Closed"]) {
      state.companyStatus = status;
      await expect(guard()).rejects.toThrow(/read-only|closed/i);
    }
  });

  it("uses the writable guard for all company worker and transfer mutations", () => {
    const worker = source("src/lib/actions/worker.ts");
    const transfer = source("src/lib/actions/transfer.ts");

    for (const name of ["createWorker", "setWorkerAccountStatus", "addWorkerQualification"]) {
      expect(exportedFunction(worker, name)).toContain("await requireWritableCompany()");
    }
    for (const name of ["requestTransfer", "approveTransfer", "declineTransfer", "withdrawTransfer"]) {
      expect(exportedFunction(transfer, name)).toContain("await requireWritableCompany()");
    }
  });

  it("requires an Active company for every supplier or buyer match decision", () => {
    const match = source("src/lib/actions/match.ts");
    for (const name of [
      "supplierAcceptMatch",
      "supplierDeclineMatch",
      "buyerDeclineMatch",
      "buyerAcceptMatch",
    ]) {
      expect(exportedFunction(match, name)).toContain("await requireActiveCompany()");
    }
  });

  it("leaves company read pages on the inclusive company-admin guard", () => {
    for (const path of [
      "src/app/(app)/app/workers/page.tsx",
      "src/app/(app)/app/workers/[id]/page.tsx",
      "src/app/(app)/app/transfers/page.tsx",
    ]) {
      expect(source(path)).toContain("await requireCompanyAdmin()");
    }
  });
});
