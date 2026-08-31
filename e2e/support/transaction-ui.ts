import { expect, type Browser, type BrowserContext, type Locator, type Page, type TestInfo } from "@playwright/test";
import { aud, commercialExpectation, csvRecords } from "./transaction-evidence";
import type { CompanyFixture, SignedInCompanyFixture, TransactionFixtures, TransactionLine } from "./transaction-fixtures";

export type CreatedLine = { fixture: TransactionLine; marker: string; capacityId: string; demandId: string };
export type CreatedEngagement = CreatedLine & { matchId: string; engagementId: string };

export function actionForm(page: Page, submitName: string): Locator {
  return page.locator("form").filter({ has: page.getByRole("button", { name: submitName, exact: true }) });
}

export function fact(page: Page, label: string): Locator {
  return page.locator("dl > div").filter({ has: page.getByText(label, { exact: true }) }).locator("dd");
}

export async function actor(
  browser: Browser, contexts: BrowserContext[], fixtures: TransactionFixtures,
  storageState: string, admin = false,
): Promise<Page> {
  const context = await browser.newContext({
    baseURL: fixtures.target.appOrigin,
    storageState,
    viewport: admin ? { width: 1280, height: 900 } : { width: 375, height: 812 },
  });
  contexts.push(context);
  return context.newPage();
}

export async function verifyAdminSession(page: Page): Promise<void> {
  await page.goto("/admin/matching");
  // This protected route executes the real Clerk role + enrollment + signed
  // session-second-factor guard. Cookie presence or an enrollment flag is NOT proof.
  await expect(page, "The saved Maintain session must already have real second-factor assurance; sign in with MFA and save fresh state.")
    .toHaveURL(/\/admin\/matching$/);
  await expect(page.getByRole("heading", { name: "Matching", exact: true })).toBeVisible();
}

export async function verifyCompanySession(page: Page, company: SignedInCompanyFixture): Promise<void> {
  await page.goto("/app/settings");
  await expect(page).toHaveURL(/\/app\/settings$/);
  await expect(page.getByLabel("Registered legal name", { exact: true })).toHaveValue(company.legalName);
}

export async function verifyEmptyCompanyTransactions(page: Page): Promise<void> {
  for (const route of ["capacity", "demand", "engagements"] as const) {
    await page.goto(`/app/${route}`);
    await expect(page).toHaveURL(new RegExp(`/app/${route}$`));
    await expect(page.locator(`a[href^="/app/${route}/"]:not([href="/app/${route}/new"])`),
      "Use fresh dedicated fixture companies; a partial earlier run must be reset by its operator.")
      .toHaveCount(0);
  }
}

export async function noHorizontalOverflow(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )).toBeLessThanOrEqual(1);
}

async function fillCapacity(form: Locator, line: TransactionLine, marker: string, concierge: boolean) {
  await form.getByLabel("Trade and proficiency", { exact: true }).selectOption(`${line.tradeRoleId}:${line.proficiencyId}`);
  await form.getByLabel("Location region", { exact: true }).selectOption(line.regionId);
  const rate = form.getByLabel(concierge ? "Rate as given, per hour ex GST" : "Your rate, per hour ex GST", { exact: true });
  if (!concierge) {
    const prefill = (Math.floor((line.bandLowCents + line.bandHighCents) / 2 + 0.5) / 100).toFixed(2);
    await expect(rate).toHaveValue(prefill);
  }
  await expect(form).toContainText(aud(line.bandLowCents));
  await expect(form).toContainText(aud(line.bandHighCents));
  await rate.fill((line.supplierRateCents / 100).toFixed(2));
  await form.getByLabel("Available from", { exact: true }).fill(line.startDate);
  await form.getByLabel("Available until", { exact: true }).fill(line.endDate);
  await form.getByLabel("Hours per week", { exact: true }).fill(String(line.capacityHoursPerWeek));
  await form.getByLabel("Available days (optional)", { exact: true }).fill(marker);
  for (const worker of line.workers) await form.getByRole("checkbox", { name: worker.name, exact: true }).check();
}

async function fillDemand(form: Locator, line: TransactionLine, marker: string, feeBp: number) {
  await form.getByLabel("Trade", { exact: true }).selectOption(line.tradeRoleId);
  await form.getByLabel("Proficiency", { exact: true }).selectOption(line.proficiencyId);
  await form.getByLabel("How many", { exact: true }).fill(String(line.nomineeWorkerIds.length));
  await form.getByLabel("Start date", { exact: true }).fill(line.startDate);
  await form.getByLabel("End date", { exact: true }).fill(line.endDate);
  await form.getByLabel("Hours", { exact: true }).fill(String(line.hoursPerWeek));
  await form.getByLabel("Hours basis", { exact: true }).selectOption("week");
  for (const item of [...line.skills, ...line.qualifications]) {
    await form.getByRole("checkbox", { name: item.name, exact: true }).check();
  }
  await form.getByLabel("Notes (optional)", { exact: true }).fill(marker);
  const low = commercialExpectation({ ...line, supplierRateCents: line.bandLowCents }, feeBp).buyerRate;
  const high = commercialExpectation({ ...line, supplierRateCents: line.bandHighCents }, feeBp).buyerRate;
  await expect(form).toContainText(`Indicative all-in rate ${aud(low)} – ${aud(high)}`);
}

export async function createMultiLineCapacity(page: Page, lines: TransactionLine[], marker: string): Promise<string[]> {
  await page.goto("/app/capacity/new");
  const form = actionForm(page, "List this capacity");
  for (const [index, line] of lines.entries()) {
    if (index > 0) await form.getByRole("button", { name: "Add another line", exact: true }).click();
    await fillCapacity(form.getByRole("group", { name: `Line ${index + 1}`, exact: true }), line, `${marker}-L${index + 1}`, false);
  }
  const payload = JSON.parse(await form.locator('input[name="payload"]').inputValue());
  expect(payload.lines).toHaveLength(lines.length);
  for (const [index, line] of lines.entries()) {
    expect([...payload.lines[index].workerIds].sort()).toEqual(line.workers.map((worker) => worker.id).sort());
    expect(payload.lines[index].supplierRateCents).toBe(line.supplierRateCents);
  }
  await form.getByRole("button", { name: "List this capacity", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/capacity$/);
  const links = page.locator('tbody a[href^="/app/capacity/"]');
  await expect(links).toHaveCount(lines.length);
  const paths = await links.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")!));
  const ids: string[] = [];
  for (const path of paths) {
    await page.goto(path);
    const body = await page.getByRole("main").innerText();
    const index = lines.findIndex((_, index) => body.includes(`${marker}-L${index + 1}`));
    expect(index, "The created capacity line must carry this run's marker.").toBeGreaterThanOrEqual(0);
    expect(ids[index], "Two created rows must not resolve to the same fixture line.").toBeUndefined();
    ids[index] = recordId(path);
    await expect(page.getByLabel("Your rate, per hour ex GST", { exact: true }))
      .toHaveValue((lines[index].supplierRateCents / 100).toFixed(2));
    await expect(page.getByText("Set by your own team", { exact: true })).toBeVisible();
  }
  expect(ids.filter(Boolean)).toHaveLength(lines.length);
  return ids;
}

export async function createMultiLineDemand(page: Page, lines: TransactionLine[], name: string, feeBp: number): Promise<string[]> {
  await page.goto("/app/demand/new");
  const form = actionForm(page, "Post this requirement");
  await form.getByLabel("Project or site name", { exact: true }).fill(name);
  await form.getByLabel("Work location region", { exact: true }).selectOption(lines[0].regionId);
  for (const [index, line] of lines.entries()) {
    if (index > 0) await form.getByRole("button", { name: "Add another line", exact: true }).click();
    await fillDemand(form.getByRole("group", { name: `Line ${index + 1}`, exact: true }), line, `${name}-L${index + 1}`, feeBp);
  }
  const payload = JSON.parse(await form.locator('input[name="payload"]').inputValue());
  expect(payload.lines).toHaveLength(lines.length);
  for (const [index, line] of lines.entries()) {
    expect(payload.lines[index].skillIds.sort()).toEqual(line.skills.map((item) => item.id).sort());
    expect(payload.lines[index].qualificationIds.sort()).toEqual(line.qualifications.map((item) => item.id).sort());
  }
  await expect(page.getByRole("main")).not.toContainText(/supplier rate|platform fee/i);
  await form.getByRole("button", { name: "Post this requirement", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/demand$/);
  const rows = page.locator("tbody tr").filter({ has: page.getByRole("cell", { name, exact: true }) });
  await expect(rows).toHaveCount(lines.length);
  const paths = await rows.locator('a[href^="/app/demand/"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")!));
  const ids: string[] = [];
  for (const path of paths) {
    await page.goto(path);
    const body = await page.getByRole("main").innerText();
    const index = lines.findIndex((_, index) => body.includes(`${name}-L${index + 1}`));
    expect(index, "The created demand line must carry this run's marker.").toBeGreaterThanOrEqual(0);
    expect(ids[index]).toBeUndefined();
    ids[index] = recordId(path);
  }
  expect(ids.filter(Boolean)).toHaveLength(lines.length);
  return ids;
}

export async function proposeLine(admin: Page, line: CreatedLine, supplier: CompanyFixture, feeBp: number): Promise<string> {
  await admin.goto(`/admin/matching/${line.demandId}`);
  const form = actionForm(admin, "Propose match");
  await form.getByLabel("Filter candidates", { exact: true }).fill(supplier.displayName);
  for (const workerId of line.fixture.shortlistWorkerIds) {
    const worker = line.fixture.workers.find((item) => item.id === workerId)!;
    const checkbox = form.getByRole("checkbox", { name: `Shortlist ${worker.name} from ${supplier.displayName}`, exact: true });
    const row = form.locator("tr").filter({ has: checkbox });
    await expect(row.getByText("Eligible", { exact: true })).toBeVisible();
    await expect(row.getByRole("cell", { name: "100%", exact: true })).toBeVisible();
    await expect(row).toContainText(aud(line.fixture.supplierRateCents));
    await expect(row).toContainText(aud(commercialExpectation(line.fixture, feeBp).buyerRate));
    await checkbox.check();
  }
  const keys = await form.locator('input[name="candidate"]').evaluateAll((nodes) => nodes.map((node) => (node as HTMLInputElement).value));
  expect(keys.map((key) => key.split(":")[1]).sort()).toEqual([...line.fixture.shortlistWorkerIds].sort());
  const capacityIds = [...new Set(keys.map((key) => key.split(":")[0]))];
  expect(capacityIds).toHaveLength(1);
  if (line.capacityId) expect(capacityIds[0]).toBe(line.capacityId);
  else line.capacityId = recordId(capacityIds[0]);
  await form.getByRole("button", { name: "Propose match", exact: true }).click();
  await expect(admin.getByText("1 match proposed.", { exact: true })).toBeVisible();
  await expect(admin.getByText("Awaiting Supplier", { exact: true })).toBeVisible();
  const acceptance = actionForm(admin, "Record acceptance and nominations");
  await expect(acceptance).toHaveCount(1);
  return recordId(await acceptance.locator('input[name="match_id"]').inputValue());
}

export async function supplierNominates(page: Page, line: CreatedLine, matchId: string, buyer: CompanyFixture, feeBp: number) {
  await page.goto(`/app/matches/${matchId}`);
  await expect(page.getByText("Awaiting Supplier", { exact: true })).toBeVisible();
  const money = commercialExpectation(line.fixture, feeBp);
  await expect(fact(page, "Your rate")).toHaveText(aud(line.fixture.supplierRateCents));
  await expect(fact(page, "Estimated value")).toHaveText(`${aud(money.supplierValue)} (estimated)`);
  const body = await page.content();
  expect(body).not.toContain(buyer.legalName);
  expect(body).not.toContain(buyer.displayName);
  const form = actionForm(page, "Accept and nominate");
  for (const worker of line.fixture.workers) {
    await form.locator(`input[name="worker_id"][value="${worker.id}"]`).setChecked(line.fixture.nomineeWorkerIds.includes(worker.id));
  }
  await noHorizontalOverflow(page);
  await form.getByRole("button", { name: "Accept and nominate", exact: true }).click();
  await expect(page.getByText("Awaiting Buyer", { exact: true })).toBeVisible();
  for (const id of line.fixture.nomineeWorkerIds) {
    const worker = line.fixture.workers.find((item) => item.id === id)!;
    await expect(page.getByRole("listitem").filter({ hasText: worker.name })).toHaveCount(1);
  }
}

/** Records only same-origin business HTML/RSC/JSON, never cookies or auth-provider responses. */
export class BuyerPrivacyEvidence {
  private pending: Promise<{ body: string } | { error: Error }>[] = [];
  constructor(private page: Page, appOrigin: string) {
    page.on("response", (response) => {
      const url = new URL(response.url());
      if (url.origin !== new URL(appOrigin).origin || !url.pathname.startsWith("/app/")) return;
      if (!/text\/html|text\/x-component|application\/json/.test(response.headers()["content-type"] ?? "")) return;
      // Failed body reads must fail the privacy check, not silently remove evidence.
      this.pending.push(response.text().then((body) => ({ body }),
        () => ({ error: new Error("A buyer-facing response body could not be inspected.") })));
    });
  }
  async check(lines: TransactionLine[], supplier: CompanyFixture, beforeConfirmation: boolean): Promise<void> {
    const results = await Promise.all(this.pending.splice(0));
    const bodies = results.map((result) => {
      if ("error" in result) throw result.error;
      return result.body;
    });
    bodies.push(await this.page.content());
    expect(bodies.length).toBeGreaterThan(0);
    const contacts = lines.flatMap((line) => line.workers.flatMap((worker) => [worker.mobile, worker.email]));
    const identities = beforeConfirmation ? [supplier.legalName, supplier.displayName,
      ...lines.flatMap((line) => line.workers.flatMap((worker) => [worker.id, worker.name, ...worker.ticketNumbers]))] : [];
    for (const body of bodies) {
      for (const privateValue of [...contacts, ...identities]) expect(body).not.toContain(privateValue);
      expect(body).not.toMatch(/supplier_rate_cents|supplierRateCents|fee_cents_per_hour|feeCentsPerHour|fee_bp|feeBp|estimated_supplier_value_cents/);
      if (beforeConfirmation) expect(body).not.toMatch(/first_name|last_name|ticket_number/);
    }
    await expect(this.page.getByRole("main")).not.toContainText(/supplier rate|platform fee/i);
  }
}

async function engagementLinks(page: Page): Promise<string[]> {
  await page.goto("/app/engagements");
  await expect(page.getByRole("heading", { name: "Engagements", exact: true })).toBeVisible();
  return page.locator('tbody a[href^="/app/engagements/"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")!));
}

export async function buyerAccepts(
  buyer: Page, line: CreatedLine, matchId: string, supplier: CompanyFixture,
  feeBp: number, privacy: BuyerPrivacyEvidence,
): Promise<string> {
  const before = new Set(await engagementLinks(buyer));
  await buyer.goto(`/app/matches/${matchId}`);
  await expect(buyer.getByText("Awaiting Buyer", { exact: true })).toBeVisible();
  const quantity = line.fixture.nomineeWorkerIds.length;
  const money = commercialExpectation(line.fixture, feeBp);
  await expect(fact(buyer, "Crew offered")).toHaveText(String(quantity));
  await expect(fact(buyer, "All-in rate")).toHaveText(aud(money.buyerRate));
  await expect(fact(buyer, "Estimated total")).toHaveText(`${aud(money.buyerValue)} (estimated)`);
  for (const qualification of line.fixture.qualifications) {
    await expect(buyer.getByText(`${qualification.name} ${quantity}/${quantity}`, { exact: true })).toBeVisible();
  }
  await expect(buyer.getByRole("main").getByRole("checkbox")).toHaveCount(0);
  await noHorizontalOverflow(buyer);
  await privacy.check([line.fixture], supplier, true);
  const form = actionForm(buyer, `Accept a crew of ${quantity}`);
  await expect(form.locator('input[name="presented_quantity"]')).toHaveValue(String(quantity));
  expect(Number(await form.locator('input[name="presented_nomination_version"]').inputValue())).toBeGreaterThan(0);
  await form.getByRole("button", { name: `Accept a crew of ${quantity}`, exact: true }).click();
  await expect(buyer.getByText("Accepted", { exact: true })).toBeVisible();
  await privacy.check([line.fixture], supplier, true);
  const created = (await engagementLinks(buyer)).filter((path) => !before.has(path));
  expect(created, "Buyer acceptance must create exactly one new engagement.").toHaveLength(1);
  const engagementId = recordId(created[0]);
  await buyer.goto(`/app/engagements/${engagementId}`);
  await expect(buyer.getByText("Awaiting Commercial", { exact: true })).toBeVisible();
  await expect(fact(buyer, "Payment")).toHaveText("none");
  await expect(fact(buyer, "Estimated total cost")).toHaveText(aud(money.buyerValue));
  await expect(buyer.getByText("Revealed once Maintain confirms the commercial step.", { exact: true })).toBeVisible();
  await privacy.check([line.fixture], supplier, true);
  return engagementId;
}

export async function readEngagementExport(admin: Page, supplier: CompanyFixture, buyer: CompanyFixture): Promise<Record<string, string>[]> {
  const params = new URLSearchParams({ supplier: supplier.id, buyer: buyer.id });
  await admin.goto(`/admin/engagements?${params}`);
  const downloadPromise = admin.waitForEvent("download");
  await admin.getByRole("link", { name: "Export CSV", exact: true }).click();
  const download = await downloadPromise;
  expect(await download.failure()).toBeNull();
  const stream = await download.createReadStream();
  if (!stream) throw new Error("The engagement CSV download has no readable body.");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return csvRecords(Buffer.concat(chunks).toString("utf8"));
}

export async function assertCommercialSnapshot(
  admin: Page, created: CreatedEngagement, supplier: CompanyFixture, buyer: CompanyFixture,
  feeBp: number, status: "Awaiting Commercial" | "Confirmed", paymentReference = "",
): Promise<void> {
  const records = await readEngagementExport(admin, supplier, buyer);
  const matching = records.filter((row) => row["Engagement id"] === created.engagementId);
  expect(matching).toHaveLength(1);
  const row = matching[0];
  const line = created.fixture;
  const money = commercialExpectation(line, feeBp);
  expect(row).toMatchObject({
    "Match id": created.matchId,
    "Status": status,
    "Supplying business id": supplier.id,
    "Hiring business id": buyer.id,
    "Requirement line id": created.demandId,
    "Capacity line id": created.capacityId,
    "Trade id": line.tradeRoleId,
    "Proficiency id": line.proficiencyId,
    "Work region id": line.regionId,
    "Start date": line.startDate,
    "End date": line.endDate,
    "Hours per week": String(line.hoursPerWeek),
    "Expected hours": String(money.hours),
    "Supplier rate (AUD ex GST)": (line.supplierRateCents / 100).toFixed(2),
    "Fee (basis points)": String(feeBp),
    "Fee per hour (AUD ex GST)": (money.feePerHour / 100).toFixed(2),
    "Buyer rate (AUD ex GST)": (money.buyerRate / 100).toFixed(2),
    "Estimated supplier value (AUD ex GST)": (money.supplierValue / 100).toFixed(2),
    "Estimated Maintain revenue (AUD ex GST)": (money.maintainRevenue / 100).toFixed(2),
    "Estimated buyer value (AUD ex GST)": (money.buyerValue / 100).toFixed(2),
    "Payment status": status === "Confirmed" ? "pre-authorised" : "none",
    "External payment reference": paymentReference,
  });
  if (status === "Confirmed") expect(row["Commercial confirmed at"]).not.toBe("");
  else expect(row["Commercial confirmed at"]).toBe("");
}

export async function preauthorise(admin: Page, created: CreatedEngagement, reference: string): Promise<void> {
  await admin.goto(`/admin/engagements/${created.engagementId}`);
  await expect(admin.getByText("Awaiting Commercial", { exact: true })).toBeVisible();
  await expect(fact(admin, "Crew")).toHaveText(String(created.fixture.nomineeWorkerIds.length));
  const form = actionForm(admin, "Record pre-authorised");
  await form.getByLabel("External payment reference", { exact: true }).fill(reference);
  await form.getByRole("button", { name: "Record pre-authorised", exact: true }).click();
  await expect(admin.getByText("Confirmed", { exact: true })).toBeVisible();
  await expect(fact(admin, "Payment")).toContainText(`pre-authorised · ${reference}`);
}

export async function assertRevealed(
  page: Page, created: CreatedEngagement, counterparty: CompanyFixture, supplier: boolean, feeBp: number,
): Promise<void> {
  await page.goto(`/app/engagements/${created.engagementId}`);
  await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
  await expect(page.getByText(counterparty.displayName, { exact: true })).toBeVisible();
  await expect(fact(page, "Payment")).toHaveText("pre-authorised");
  await expect(fact(page, supplier ? "Your rate" : "All-in rate"))
    .toHaveText(aud(supplier ? created.fixture.supplierRateCents : commercialExpectation(created.fixture, feeBp).buyerRate));
  for (const worker of created.fixture.workers) {
    if (created.fixture.nomineeWorkerIds.includes(worker.id)) {
      await expect(page.getByText(worker.name, { exact: true })).toBeVisible();
    } else {
      await expect(page.getByText(worker.name, { exact: true })).toHaveCount(0);
    }
  }
  await noHorizontalOverflow(page);
}

export async function createConciergeRecords(
  admin: Page, input: { supplier: CompanyFixture; buyer: CompanyFixture; line: TransactionLine;
    supplierContact: string; buyerContact: string }, marker: string, feeBp: number,
): Promise<CreatedLine> {
  const timestamp = new Date().toISOString();
  // This is a recorded test interaction, not a claim that an actual phone call occurred.
  await admin.goto(`/admin/companies/${input.supplier.id}/concierge`);
  await expect(admin.getByRole("heading", { name: `Concierge — ${input.supplier.legalName}`, exact: true })).toBeVisible();
  const capacity = actionForm(admin, "List this capacity");
  await fillCapacity(capacity, input.line, `${marker}-capacity`, true);
  await capacity.getByLabel("Evidence note (required)", { exact: true })
    .fill(`TEST FIXTURE: ${input.supplierContact}, ${timestamp}, ${marker}; supplier supplied this rate and roster.`);
  const capacityPayload = JSON.parse(await capacity.locator('input[name="payload"]').inputValue());
  expect(capacityPayload.lines[0].workerIds.sort()).toEqual(input.line.workers.map((worker) => worker.id).sort());
  await capacity.getByRole("button", { name: "List this capacity", exact: true }).click();
  await expect(admin).toHaveURL(new RegExp(`/admin/companies/${input.supplier.id}/concierge\\?saved=capacity$`));
  await expect(admin.getByRole("status")).toHaveText("Capacity listed on the company's behalf.");

  await admin.goto(`/admin/companies/${input.buyer.id}/concierge`);
  await expect(admin.getByRole("heading", { name: `Concierge — ${input.buyer.legalName}`, exact: true })).toBeVisible();
  const demand = actionForm(admin, "Post this requirement");
  await demand.getByLabel("Project or site name", { exact: true }).fill(marker);
  await demand.getByLabel("Work location region", { exact: true }).selectOption(input.line.regionId);
  await fillDemand(demand, input.line, marker, feeBp);
  await demand.getByLabel("Evidence note (required)", { exact: true })
    .fill(`TEST FIXTURE: ${input.buyerContact}, ${timestamp}, ${marker}; buyer supplied these dates, hours and requirements.`);
  await demand.getByRole("button", { name: "Post this requirement", exact: true }).click();
  await expect(admin).toHaveURL(new RegExp(`/admin/companies/${input.buyer.id}/concierge\\?saved=demand$`));
  await expect(admin.getByRole("status")).toHaveText("Requirement posted on the company's behalf.");
  await admin.goto("/admin/matching");
  const link = admin.getByRole("link", { name: marker, exact: true });
  await expect(link).toHaveCount(1);
  return { fixture: input.line, marker, capacityId: "", demandId: recordId((await link.getAttribute("href"))!) };
}

export async function recordConciergeAcceptances(
  admin: Page, created: CreatedLine, matchId: string, supplierContact: string, buyerContact: string,
): Promise<void> {
  await admin.goto(`/admin/matching/${created.demandId}`);
  const supplier = actionForm(admin, "Record acceptance and nominations");
  for (const id of created.fixture.nomineeWorkerIds) await supplier.locator(`input[name="worker_id"][value="${id}"]`).check();
  // No HTML-required attribute exists on this decision textarea: prove the actual
  // server validation rejects absent evidence without advancing the match.
  await supplier.getByRole("button", { name: "Record acceptance and nominations", exact: true }).click();
  await expect(supplier.getByRole("alert")).toContainText("Record who you spoke to and when.");
  await expect(admin.getByText("Awaiting Supplier", { exact: true })).toBeVisible();
  await supplier.getByLabel("Evidence note", { exact: true })
    .fill(`TEST FIXTURE: ${supplierContact}, ${new Date().toISOString()}, ${created.marker}; supplier named the selected nominations and ratified the rate.`);
  await supplier.getByRole("button", { name: "Record acceptance and nominations", exact: true }).click();
  await expect(admin.getByText("Awaiting Buyer", { exact: true })).toBeVisible();
  await expect(admin.getByText("Admin entered", { exact: true })).toBeVisible();
  const buyer = actionForm(admin, "Record buyer acceptance");
  await expect(buyer.locator('input[name="match_id"]')).toHaveValue(matchId);
  await expect(buyer.locator('input[name="presented_quantity"]')).toHaveValue(String(created.fixture.nomineeWorkerIds.length));
  await buyer.getByRole("button", { name: "Record buyer acceptance", exact: true }).click();
  await expect(buyer.getByRole("alert")).toContainText("Record who you spoke to and when.");
  await expect(admin.getByText("Awaiting Buyer", { exact: true })).toBeVisible();
  await buyer.getByLabel("Evidence note", { exact: true })
    .fill(`TEST FIXTURE: ${buyerContact}, ${new Date().toISOString()}, ${created.marker}; buyer accepted this unnamed crew quantity and all-in rate.`);
  await buyer.getByRole("button", { name: "Record buyer acceptance", exact: true }).click();
  await expect(admin.getByText("Accepted", { exact: true })).toBeVisible();
}

export async function attachCreatedRecords(info: TestInfo, marker: string, created: CreatedEngagement[]): Promise<void> {
  await info.attach("created-transaction-records", { contentType: "application/json", body: Buffer.from(JSON.stringify({
    marker,
    cleanup: "Records deliberately retained in the disposable fixture database for review. Reset only the dedicated test fixtures before another run.",
    records: created.map(({ capacityId, demandId, matchId, engagementId }) => ({ capacityId, demandId, matchId, engagementId })),
  }, null, 2)) });
}

export function recordId(path: string): string {
  const value = path.split("/").at(-1) ?? "";
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) {
    throw new Error("The application did not return an expected record identifier.");
  }
  return value;
}
