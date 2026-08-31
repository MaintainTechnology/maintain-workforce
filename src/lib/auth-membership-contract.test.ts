import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function exportedFunction(file: string, name: string): string {
  const start = file.indexOf(`export async function ${name}`);
  const next = file.indexOf("export async function ", start + 1);
  return file.slice(start, next === -1 ? undefined : next);
}

describe("Clerk company membership binding contract", () => {
  it("creates the company and first Clerk membership atomically after authentication", () => {
    const companyActions = source("src/lib/actions/company.ts");
    const registration = exportedFunction(companyActions, "completeCompanyRegistration");
    const migration = source(
      "supabase/migrations/20260828000500_clerk_company_registration.sql",
    );
    const authenticated = registration.indexOf("await getUser()");
    const registrationRpc = registration.indexOf(
      '"register_company_with_first_clerk_admin"',
    );

    expect(authenticated).toBeGreaterThanOrEqual(0);
    expect(registrationRpc).toBeGreaterThan(authenticated);
    expect(registration).toMatch(/if\s*\(!sessionUser\)\s*redirect\("\/signup"\)/);
    expect(registration).toMatch(/p_actor_user_id:\s*sessionUser\.id/);
    expect(registration).toMatch(/p_administrator_email:\s*sessionUser\.email/);
    expect(registration).toContain('redirect("/app")');
    expect(registration).not.toContain('.from("company").delete()');
    expect(registration).not.toContain("auth.signUp(");
    expect(registration).not.toContain("clerkClient(");

    expect(migration).toMatch(
      /register_company_with_first_clerk_admin\(\s*p_actor_user_id text/,
    );
    expect(migration).toMatch(
      /insert into company[\s\S]*insert into company_operating_region[\s\S]*insert into company_user[\s\S]*insert into audit_event/i,
    );
    expect(migration).toMatch(
      /insert into company_user\s*\(user_id, company_id, invited_email, accepted_at\)[\s\S]*trim\(p_actor_user_id\)/i,
    );
    expect(migration).toMatch(
      /grant execute on function register_company_with_first_clerk_admin[\s\S]*to service_role/i,
    );
  });

  it("defers invited membership binding until Clerk has created the signed-in user", () => {
    const auth = source("src/lib/auth.ts");
    const companyActions = source("src/lib/actions/company.ts");
    const leadActions = source("src/lib/actions/lead.ts");
    const companyInvite = exportedFunction(companyActions, "inviteCompanyAdmin");
    const leadInvite = exportedFunction(leadActions, "qualifyLead");
    const requireCompany = auth.slice(
      auth.indexOf("export async function requireCompanyAdmin"),
      auth.indexOf("export async function resolveCompanyInvitation"),
    );
    const binding = auth.slice(
      auth.indexOf("export async function resolveCompanyInvitation"),
      auth.indexOf("export async function requireWritableCompany"),
    );

    expect(companyInvite).toContain("await inviteAdministrator(email, companyId)");
    expect(leadInvite).toContain("await inviteAdministrator(input.contact_email, company.id)");
    expect(companyInvite).not.toContain('.from("company_user").insert');
    expect(leadInvite).not.toContain('.from("company_user").insert');

    expect(requireCompany).toMatch(
      /if\s*\(!membership\)[\s\S]*resolveCompanyInvitation\(sessionUser\)/,
    );
    expect(binding).toContain("await currentUser()");
    expect(binding).toMatch(/company_id\?:\s*string;\s*invited_email\?:\s*string/);
    expect(binding).toContain('.from("company_user").insert({');
    expect(binding).toMatch(/user_id:\s*user\.id/);
    expect(binding).toMatch(/company_id:\s*companyId/);
    expect(binding).toMatch(/invited_email:\s*user\.email/);
    expect(binding).toMatch(/accepted_at:\s*new Date\(\)\.toISOString\(\)/);
  });

  it("still requires an accepted database membership for company authorization", () => {
    const auth = source("src/lib/auth.ts");
    const requireCompany = auth.slice(
      auth.indexOf("export async function requireCompanyAdmin"),
      auth.indexOf("export async function resolveCompanyInvitation"),
    );

    expect(requireCompany).toMatch(
      /select\("company_id, accepted_at,[^"]*company:company_id \(status\)"\)/,
    );
    expect(requireCompany).toMatch(
      /if\s*\(!membership\.accepted_at\)\s*redirect\("\/accept-invitation"\)/,
    );
  });
});
