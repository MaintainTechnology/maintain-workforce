import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Maintain matching authorization contract", () => {
  it("authorizes before every service-role demand-line read", () => {
    const matching = source("src/lib/matching.ts");
    const contextFunction = matching.slice(
      matching.indexOf("export async function getDemandLineContext"),
      matching.indexOf("export async function getCandidates"),
    );
    const contextAuthorization = contextFunction.indexOf("await requireMaintainAdmin()");
    const contextServiceClient = contextFunction.indexOf("createAdminClient()");

    expect(contextAuthorization).toBeGreaterThanOrEqual(0);
    expect(contextAuthorization).toBeLessThan(contextServiceClient);

    const page = source("src/app/(admin)/admin/matching/[demandLineId]/page.tsx");
    const pageAuthorization = page.indexOf("await requireMaintainAdmin()");
    const pageDemandRead = page.indexOf("await getDemandLineContext(");

    expect(pageAuthorization).toBeGreaterThanOrEqual(0);
    expect(pageAuthorization).toBeLessThan(pageDemandRead);
  });
});
