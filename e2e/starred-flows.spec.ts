import { test, expect, type BrowserContext, type TestInfo } from "@playwright/test";
import { loadTransactionFixtures } from "./support/transaction-fixtures";
import {
  actor, assertCommercialSnapshot, assertRevealed, attachCreatedRecords, BuyerPrivacyEvidence,
  buyerAccepts, createConciergeRecords, createMultiLineCapacity, createMultiLineDemand,
  preauthorise, proposeLine, readEngagementExport, recordConciergeAcceptances,
  supplierNominates, verifyAdminSession, verifyCompanySession, verifyEmptyCompanyTransactions,
  type CreatedEngagement,
} from "./support/transaction-ui";

// Public rendering is a smoke check, not a claim that registration or MFA completed.
// The transaction tests below perform real UI writes only against explicit disposable
// fixtures. See seed-data/E2E-VERIFICATION.md for prerequisites and evidence limits.
const required = process.env.E2E_REQUIRED === "1";
const fixtures = loadTransactionFixtures();
const configured = fixtures !== null;
if (required && !configured) {
  throw new Error("E2E_REQUIRED=1 needs explicit isolated-preview transaction fixtures and real Clerk storage states.");
}

function projectFixture(info: TestInfo) {
  if (!fixtures) throw new Error("The transaction fixture gate was not satisfied.");
  const name = info.project.name;
  if (name !== "company-mobile" && name !== "admin-desktop") {
    throw new Error("Supply an explicitly isolated fixture set for every configured Playwright project.");
  }
  return { fixtures, project: fixtures.projects[name], marker: `${fixtures.runId}-${name}` };
}

test.describe("public Clerk entry-page smoke (no account creation)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("Clerk owns sign-in and sign-up before protected company onboarding", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.locator(".cl-signIn-root")).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
    // Clerk is identifier-first: its pre-rendered password input is initially hidden.
    // This smoke test does not enter an identifier, password or second factor.
    await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeVisible();

    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "Register your company" })).toBeVisible();
    await expect(page.locator(".cl-signUp-root")).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeVisible();
    await expect(page.getByLabel("Registered legal name")).toHaveCount(0);
    await expect(page.getByLabel(/ABN/)).toHaveCount(0);
    await expect(page.getByLabel("Industry", { exact: true })).toHaveCount(0);

    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/signup(?:[/?#]|$)/);
    await expect(page.locator(".cl-signUp-root")).toBeVisible();
  });
});

test.describe("fixture-dependent real starred transactions", () => {
  // Retrying a half-finished real transaction is not a clean replay. Dedicated
  // companies/workers are disjoint across projects; this group's cases are serial.
  test.describe.configure({ mode: "serial", retries: 0, timeout: 180_000 });
  test.skip(!configured, "Not executed: supply the isolated-preview fixtures documented in seed-data/E2E-VERIFICATION.md.");

  test("a genuinely Pending company has no SELL/BUY submission controls (1.3)", async ({ browser }, info) => {
    const { fixtures, project } = projectFixture(info);
    const contexts: BrowserContext[] = [];
    try {
      const pending = await actor(browser, contexts, fixtures, project.pending.storageState);
      await verifyCompanySession(pending, project.pending);
      await pending.goto("/app");
      await expect(pending.getByText(/Verification is in progress\./)).toBeVisible();
      await pending.goto("/app/capacity/new");
      await expect(pending.getByRole("main")).toContainText("Verification is still in progress.");
      await expect(pending.getByRole("button", { name: "List this capacity", exact: true })).toHaveCount(0);
      await pending.goto("/app/demand/new");
      await expect(pending.getByRole("main")).toContainText("Verification is still in progress.");
      await expect(pending.getByRole("button", { name: "Post this requirement", exact: true })).toHaveCount(0);
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });

  test("two capacity and requirement lines reach real nominations, private buyer acceptance, and pre-authorised confirmation", async ({ browser }, info) => {
    const { fixtures, project, marker: projectMarker } = projectFixture(info);
    const marker = `${projectMarker}-selfserve`;
    const { supplier: supplierFixture, buyer: buyerFixture, lines } = project.selfServe;
    const contexts: BrowserContext[] = [];
    const created: CreatedEngagement[] = [];
    try {
      const admin = await actor(browser, contexts, fixtures, project.adminStorageState, true);
      // Must succeed before ANY capacity, demand, proposal or payment write.
      await verifyAdminSession(admin);
      const supplier = await actor(browser, contexts, fixtures, supplierFixture.storageState);
      const buyer = await actor(browser, contexts, fixtures, buyerFixture.storageState);
      await Promise.all([verifyCompanySession(supplier, supplierFixture), verifyCompanySession(buyer, buyerFixture)]);
      await Promise.all([verifyEmptyCompanyTransactions(supplier), verifyEmptyCompanyTransactions(buyer)]);
      const privacy = new BuyerPrivacyEvidence(buyer, fixtures.target.appOrigin);

      const capacityIds = await createMultiLineCapacity(supplier, lines, marker);
      const demandIds = await createMultiLineDemand(buyer, lines, marker, fixtures.rules.feeBp);
      await privacy.check(lines, supplierFixture, true);
      for (const [index, fixture] of lines.entries()) {
        const line: CreatedEngagement = { fixture, marker: `${marker}-L${index + 1}`,
          capacityId: capacityIds[index], demandId: demandIds[index], matchId: "", engagementId: "" };
        created.push(line);
        line.matchId = await proposeLine(admin, line, supplierFixture, fixtures.rules.feeBp);
        await supplierNominates(supplier, line, line.matchId, buyerFixture, fixtures.rules.feeBp);
        line.engagementId = await buyerAccepts(buyer, line, line.matchId, supplierFixture, fixtures.rules.feeBp, privacy);
        await assertCommercialSnapshot(admin, line, supplierFixture, buyerFixture, fixtures.rules.feeBp, "Awaiting Commercial");
        await supplier.goto(`/app/engagements/${line.engagementId}`);
        await expect(supplier.getByText("Awaiting Commercial", { exact: true })).toBeVisible();
        expect(await supplier.content()).not.toContain(buyerFixture.displayName);
      }

      // Both acceptances are checked while ALL fixture engagements are unrevealed.
      // A legitimate reveal from the first must not contaminate the second's privacy assertion.
      for (const line of created) {
        const reference = `${line.marker}-preauth`;
        await preauthorise(admin, line, reference);
        await assertCommercialSnapshot(admin, line, supplierFixture, buyerFixture, fixtures.rules.feeBp, "Confirmed", reference);
        await assertRevealed(buyer, line, supplierFixture, false, fixtures.rules.feeBp);
        await privacy.check(lines, supplierFixture, false);
        await assertRevealed(supplier, line, buyerFixture, true, fixtures.rules.feeBp);
      }

      await supplier.goto("/app/capacity");
      await buyer.goto("/app/demand");
      for (const line of created) {
        const capacity = supplier.locator("tbody tr").filter({ has: supplier.locator(`a[href="/app/capacity/${line.capacityId}"]`) });
        const remaining = line.fixture.workers.length - line.fixture.nomineeWorkerIds.length;
        await expect(capacity.getByRole("cell", { name: `${remaining} of ${line.fixture.workers.length}`, exact: true })).toBeVisible();
        const demand = buyer.locator("tbody tr").filter({ has: buyer.locator(`a[href="/app/demand/${line.demandId}"]`) });
        await expect(demand.getByText("Filled", { exact: true })).toBeVisible();
      }
      await privacy.check(lines, supplierFixture, false);
    } finally {
      await attachCreatedRecords(info, marker, created);
      await Promise.all(contexts.map((context) => context.close()));
    }
  });

  test("Maintain records a complete concierge transaction for seeded login-less companies, with required decision evidence", async ({ browser }, info) => {
    const { fixtures, project, marker: projectMarker } = projectFixture(info);
    const marker = `${projectMarker}-concierge`;
    const input = project.concierge;
    const contexts: BrowserContext[] = [];
    const records: CreatedEngagement[] = [];
    try {
      // Deliberately no supplier/buyer browser context or login in this scenario.
      const admin = await actor(browser, contexts, fixtures, project.adminStorageState, true);
      await verifyAdminSession(admin);
      expect(await readEngagementExport(admin, input.supplier, input.buyer)).toHaveLength(0);
      for (const company of [input.supplier, input.buyer]) {
        await admin.goto(`/admin/companies/${company.id}/concierge`);
        await expect(admin.getByRole("heading", { name: `Concierge — ${company.legalName}`, exact: true })).toBeVisible();
        await expect(admin.getByText("Active", { exact: true })).toBeVisible();
      }
      await admin.goto("/admin/matching");
      await expect(admin.getByRole("link", { name: marker, exact: true })).toHaveCount(0);

      const created: CreatedEngagement = { ...await createConciergeRecords(admin, input, marker, fixtures.rules.feeBp), matchId: "", engagementId: "" };
      records.push(created);
      created.matchId = await proposeLine(admin, created, input.supplier, fixtures.rules.feeBp);
      await recordConciergeAcceptances(admin, created, created.matchId, input.supplierContact, input.buyerContact);
      const rows = (await readEngagementExport(admin, input.supplier, input.buyer))
        .filter((row) => row["Match id"] === created.matchId);
      expect(rows, "Concierge buyer acceptance must create one real engagement.").toHaveLength(1);
      created.engagementId = rows[0]["Engagement id"];
      await assertCommercialSnapshot(admin, created, input.supplier, input.buyer, fixtures.rules.feeBp, "Awaiting Commercial");
      const reference = `${marker}-preauth`;
      await preauthorise(admin, created, reference);
      await assertCommercialSnapshot(admin, created, input.supplier, input.buyer, fixtures.rules.feeBp, "Confirmed", reference);
    } finally {
      await attachCreatedRecords(info, marker, records);
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
});
