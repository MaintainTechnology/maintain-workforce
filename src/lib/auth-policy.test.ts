import { describe, expect, it } from "vitest";
import * as authPolicy from "./auth-policy";

const { hasAal2, isMaintainAdminClaims, safeRedirectPath } = authPolicy;

describe("auth redirect policy", () => {
  it("keeps local return paths and rejects open redirects", () => {
    expect(safeRedirectPath("/app/matches?filter=open", "/app")).toBe(
      "/app/matches?filter=open",
    );
    expect(safeRedirectPath("https://attacker.example/path", "/app")).toBe("/app");
    expect(safeRedirectPath("//attacker.example/path", "/app")).toBe("/app");
    expect(safeRedirectPath("/\\attacker.example/path", "/app")).toBe("/app");
  });
});

describe("Supabase authorization claims", () => {
  it("recognises maintain_admin only from app_metadata", () => {
    expect(isMaintainAdminClaims({
      app_metadata: { role: "maintain_admin" },
    })).toBe(true);
    expect(isMaintainAdminClaims({
      user_metadata: { role: "maintain_admin" },
    })).toBe(false);
  });

  it("requires the current JWT to be aal2", () => {
    expect(hasAal2({ aal: "aal2" })).toBe(true);
    expect(hasAal2({ aal: "aal1", enrolled_factor: true })).toBe(false);
  });

  it("denies a pending company membership and allows an accepted membership", () => {
    const hasAcceptedCompanyMembership = (
      authPolicy as typeof authPolicy & {
        hasAcceptedCompanyMembership?: (membership: { accepted_at?: unknown } | null) => boolean;
      }
    ).hasAcceptedCompanyMembership;

    expect(typeof hasAcceptedCompanyMembership).toBe("function");
    expect(hasAcceptedCompanyMembership?.({ accepted_at: null })).toBe(false);
    expect(hasAcceptedCompanyMembership?.({ accepted_at: "2026-08-28T00:00:00Z" })).toBe(true);
  });
});
