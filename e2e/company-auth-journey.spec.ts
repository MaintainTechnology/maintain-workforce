import { expect, test } from "@playwright/test";
import { frontendApiHost, installTestingToken, mintTestingToken, withDotenvLocal } from "./support/clerk-testing-token";
import { noHorizontalOverflow } from "./support/transaction-ui";

// The real company entry journey through Clerk's own components: registration with
// email-code verification, company onboarding, the Pending dashboard and workspace
// routes, sign-out, and sign-in with the new credentials. It creates one Clerk test
// user (a +clerk_test address: Clerk sends no email and accepts the fixed code 424242)
// and one Pending company, both named after the run. Opt-in only, because it writes:
// the gate is the same E2E_ALLOW_TEST_WRITES flag the transaction scenarios use, plus a
// Clerk Testing Token (or a development secret key to mint one) to pass Clerk's bot
// protection. Records are retained for inspection like every other mutating scenario;
// E2E_DELETE_TEST_RECORDS=1 removes this run's user and company afterwards.
const env = withDotenvLocal(process.env);
const allowed = env.E2E_ALLOW_TEST_WRITES === "1";
const deleteAfter = env.E2E_DELETE_TEST_RECORDS === "1";
const publishableKey = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

test.describe("company registration and sign-in through Clerk", () => {
  test.describe.configure({ mode: "serial", retries: 0, timeout: 180_000 });
  test.skip(!allowed, "Not executed: set E2E_ALLOW_TEST_WRITES=1 with CLERK_TESTING_TOKEN or a development CLERK_SECRET_KEY to create a disposable test account and company.");
  test.skip(allowed && !publishableKey.startsWith("pk_test_"), "Testing Tokens and +clerk_test addresses only exist on development Clerk instances.");

  const run = Date.now().toString(36);
  const email = `mw-e2e-${run}+clerk_test@example.com`;
  const password = `Mw-E2E-${run}-passphrase-2026!`; // the instance requires 15+ characters
  const legalName = `E2E TEST COMPANY ${run}`;
  let clerkUserId: string | null = null;

  test.beforeEach(async ({ context }) => {
    const token = await mintTestingToken(env);
    test.skip(!token, "Not executed: no CLERK_TESTING_TOKEN and no development CLERK_SECRET_KEY to mint one.");
    await installTestingToken(context, token as string, frontendApiHost(publishableKey));
  });

  test.afterAll(async () => {
    if (!deleteAfter) return;
    const secretKey = env.CLERK_SECRET_KEY;
    if (clerkUserId && secretKey?.startsWith("sk_test_")) {
      await fetch(`https://api.clerk.com/v1/users/${clerkUserId}`, { method: "DELETE", headers: { Authorization: `Bearer ${secretKey}` } });
    }
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey && env.NEXT_PUBLIC_SUPABASE_URL) {
      // company_user and company_operating_region cascade from the company row.
      await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/company?legal_name=eq.${encodeURIComponent(legalName)}`, {
        method: "DELETE",
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
    }
  });

  test("registers a company, reaches its dashboard, signs out and signs back in", async ({ page }) => {
    await test.step("Clerk sign-up with email-code verification", async () => {
      await page.goto("/signup");
      await expect(page.locator(".cl-signUp-root")).toBeVisible();
      await page.getByLabel("Email address", { exact: true }).fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      const code = page.locator('input[autocomplete="one-time-code"]');
      await expect(code, "Clerk's verification step; bot protection would have replaced the form instead").toBeVisible({ timeout: 30_000 });
      await code.pressSequentially("424242", { delay: 30 });
      await page.waitForURL(/\/onboarding(?:[/?#]|$)/, { timeout: 60_000 });
      clerkUserId = await page.evaluate(() => (window as unknown as { Clerk?: { user?: { id: string } } }).Clerk?.user?.id ?? null);
      expect(clerkUserId).toMatch(/^user_/);
    });

    await test.step("company onboarding creates a Pending company", async () => {
      await page.getByLabel("Registered legal name", { exact: true }).fill(legalName);
      await page.getByLabel("Industry", { exact: true }).selectOption({ index: 1 });
      await page.getByLabel("Primary location", { exact: true }).selectOption({ index: 1 });
      await page.getByRole("checkbox").first().check();
      await page.getByLabel("Contact name", { exact: true }).fill("E2E test operator");
      await page.getByLabel("Contact email", { exact: true }).fill(email);
      await page.getByLabel("Contact phone", { exact: true }).fill("0400000000");
      await noHorizontalOverflow(page);
      await page.getByRole("button", { name: /Create your company/ }).click();
      await page.waitForURL(/\/app(?:[?#]|$)/, { timeout: 60_000 });
    });

    await test.step("Pending dashboard and workspace routes render for the new company", async () => {
      await expect(page.getByRole("heading", { name: "Your exchange" })).toBeVisible();
      await expect(page.getByText(/Verification is in progress\./)).toBeVisible();
      await expect(page.getByRole("link", { name: "SELL CAPACITY", exact: true })).toHaveCount(0);
      await noHorizontalOverflow(page);
      for (const route of ["workers", "capacity", "demand", "matches", "engagements"] as const) {
        await page.goto(`/app/${route}`);
        await expect(page).toHaveURL(new RegExp(`/app/${route}$`));
        await expect(page.getByRole("main")).toBeVisible();
      }
      await page.goto("/app/settings");
      await expect(page.getByLabel("Registered legal name", { exact: true })).toHaveValue(legalName);
    });

    await test.step("sign-out removes access to the workspace", async () => {
      await page.goto("/app");
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await page.waitForURL(/\/signin(?:[/?#]|$)/);
      await page.goto("/app");
      await expect(page).toHaveURL(/\/signin\?redirect_url=/);
    });

    await test.step("sign-in with the new credentials lands on the dashboard", async () => {
      await page.goto("/signin");
      await page.getByLabel("Email address", { exact: true }).fill(email);
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      const passwordField = page.locator('input[name="password"]:visible');
      await expect(passwordField).toBeVisible();
      await passwordField.fill(password);
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.waitForURL(/\/app(?:[?#]|$)/, { timeout: 60_000 });
      await expect(page.getByRole("heading", { name: "Your exchange" })).toBeVisible();
      // A signed-in visitor at the sign-in page is sent on to the workspace.
      await page.goto("/signin");
      await expect(page).toHaveURL(/\/app(?:[?#]|$)/);
    });
  });
});
