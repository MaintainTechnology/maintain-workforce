import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function jsxElement(file: string, name: string): string {
  return file.match(new RegExp(`<${name}\\b[\\s\\S]*?/>`))?.[0] ?? "";
}

describe("Clerk authentication delivery contract", () => {
  it("provides Clerk to the app and runs Clerk middleware from the Next 16 proxy", () => {
    const layout = source("src/app/layout.tsx");
    const proxy = source("src/proxy.ts");

    expect(layout).toMatch(
      /import\s+\{\s*ClerkProvider\s*\}\s+from\s+"@clerk\/nextjs"/,
    );
    expect(layout).toMatch(/<ClerkProvider\b[\s\S]*\{children\}[\s\S]*<\/ClerkProvider>/);

    expect(proxy).toMatch(
      /import\s+\{\s*clerkMiddleware\s*\}\s+from\s+"@clerk\/nextjs\/server"/,
    );
    // Clerk's middleware is the proxy; the exported function only wraps it to repair
    // the handshake cookies Clerk's Frontend API mis-serialises for headless browsers.
    expect(proxy).toMatch(/const withClerk\s*=\s*clerkMiddleware\(/);
    expect(proxy).toMatch(
      /export async function proxy\(request: NextRequest, event: NextFetchEvent\)[\s\S]*await withClerk\(request, event\)[\s\S]*secureSameSiteNoneCookies\(response\.headers\)/,
    );
    expect(proxy).toContain("authState.redirectToSignIn");
    expect(proxy).toMatch(/isAppRoute[\s\S]*isAdminRoute/);
  });

  it("delegates sign-in and sign-up to Clerk and sends new accounts to onboarding", () => {
    const signIn = source("src/app/signin/[[...rest]]/page.tsx");
    const signUp = source("src/app/signup/[[...rest]]/page.tsx");
    const signInElement = jsxElement(signIn, "SignIn");
    const signUpElement = jsxElement(signUp, "SignUp");

    expect(signIn).toMatch(/import\s+\{\s*SignIn\s*\}\s+from\s+"@clerk\/nextjs"/);
    expect(signInElement).toContain('signUpUrl="/signup"');
    expect(signInElement).toContain('fallbackRedirectUrl="/auth/continue"');

    expect(signUp).toMatch(/import\s+\{\s*SignUp\s*\}\s+from\s+"@clerk\/nextjs"/);
    expect(signUpElement).toContain('forceRedirectUrl="/onboarding"');
    expect(signUpElement).toContain('signInUrl="/signin"');

    expect(signUp).not.toContain("OnboardingForm");
    expect(signUp).not.toContain("completeCompanyRegistration");
    expect(signUp).not.toMatch(/<form\b/);
    expect(signUp).not.toContain("Registered legal name");
  });

  it("keeps company setup on a post-authentication onboarding page", () => {
    const page = source("src/app/onboarding/page.tsx");
    const form = source("src/app/onboarding/onboarding-form.tsx");
    const authCheck = page.indexOf("await getUser()");
    const companyLookup = page.indexOf('from("company_user")');

    expect(page).toContain('import { currentUser } from "@clerk/nextjs/server"');
    expect(page).toContain("getUser");
    expect(authCheck).toBeGreaterThanOrEqual(0);
    expect(companyLookup).toBeGreaterThan(authCheck);
    expect(page).toMatch(/if\s*\(!sessionUser\)\s*redirect\("\/signup"\)/);
    expect(page).toContain("resolveCompanyInvitation(sessionUser)");
    expect(page).toContain("<OnboardingForm");
    expect(page).toContain("Step 2 of 2");

    expect(form).toContain("completeCompanyRegistration");
    expect(form).toContain('name="legal_name"');
    expect(form).toContain('name="abn"');
    expect(form).not.toContain('name="password"');
    expect(form).not.toContain('type="password"');
  });

  it("sends Clerk invitations through sign-up with target-company metadata", () => {
    const clerk = source("src/lib/clerk.ts");
    const invitation = clerk.slice(
      clerk.indexOf("export async function inviteAdministrator"),
      clerk.indexOf("export async function consumeCompanyInvitation"),
    );

    expect(invitation).toContain("invitations.createInvitation({");
    expect(invitation).toContain('redirectUrl: new URL("/signup", baseUrl).toString()');
    expect(invitation).toMatch(
      /publicMetadata:\s*\{\s*company_id:\s*companyId,\s*invited_email:\s*invitedEmail\s*\}/,
    );
    expect(invitation).not.toContain("company_user");
  });

  it("retires the legacy Supabase credential actions", () => {
    const actions = source("src/lib/actions/auth.ts");
    expect(actions).not.toContain("signInWithPassword");
    expect(actions).not.toContain("resetPasswordForEmail");
    expect(actions).not.toContain("verifyOtp");
    expect(actions).toContain('redirect("/signin")');
  });

  it("ends Clerk sessions from both protected application shells", () => {
    for (const path of ["src/app/(app)/layout.tsx", "src/app/(admin)/layout.tsx"]) {
      const layout = source(path);
      expect(layout).toMatch(
        /import\s+\{\s*SignOutButton\s*\}\s+from\s+"@clerk\/nextjs"/,
      );
      expect(layout).toContain('<SignOutButton redirectUrl="/signin">');
      expect(layout).not.toContain("action={signOut}");
    }
  });
});
