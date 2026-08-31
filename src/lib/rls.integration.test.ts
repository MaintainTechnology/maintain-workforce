import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { createClerkRlsClients } from "@/test/clerk-rls-clients";
import { readRlsFixtureConfig } from "../../scripts/validate-rls-fixtures.mjs";

/**
 * Live RLS verification for the launch boundary. The suite is opt-in for ordinary
 * development, but RLS_TEST_REQUIRED=1 makes missing credentials or fixtures a hard
 * failure so CI and launch checks cannot pass by skipping or reading empty tables.
 */

// CI invokes this same no-network validator before applying preview migrations.
// Only the hooks below create the explicitly configured fixture sessions.
const fixtureConfig = readRlsFixtureConfig(process.env);
const URL = fixtureConfig?.url;
const ANON = fixtureConfig?.anonKey;
const env = fixtureConfig?.values ?? {} as NonNullable<typeof fixtureConfig>["values"];
const enabled = fixtureConfig !== null;
const ZERO = "00000000-0000-0000-0000-000000000000";

let clientA: SupabaseClient;
let clientB: SupabaseClient;
let buyer: SupabaseClient;
let supplier: SupabaseClient;
let pending: SupabaseClient;
let suspended: SupabaseClient;
let closed: SupabaseClient;
let admin: SupabaseClient;
let closeFixtureSessions: (() => Promise<void>) | undefined;

async function ownCompany(client: SupabaseClient): Promise<{ id: string; status: string }> {
  const { data, error } = await client.from("company").select("id, status").single();
  expect(error).toBeNull();
  expect(data).toBeTruthy();
  return data as { id: string; status: string };
}

async function expectPermissionDenied(request: PromiseLike<{ error: { code?: string } | null }>) {
  const { error } = await request;
  expect(error?.code).toBe("42501");
}

describe.skipIf(!enabled)("live tenant and privilege boundary (17.1)", () => {
  beforeAll(async () => {
    const fixture = createClerkRlsClients({
      url: URL!,
      anonKey: ANON!,
      clerkSecretKey: env.clerkSecretKey!,
      userIds: [
        env.companyAUserId!, env.companyBUserId!, env.buyerUserId!,
        env.supplierUserId!, env.pendingUserId!, env.suspendedUserId!, env.closedUserId!,
      ],
    });
    closeFixtureSessions = fixture.close;
    [clientA, clientB, buyer, supplier, pending, suspended, closed] = await fixture.ready;
    admin = createClient(URL!, env.serviceKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }, 60_000);

  afterAll(async () => { await closeFixtureSessions?.(); }, 60_000);

  it("proves seeded cross-tenant rows exist before asserting they are hidden", async () => {
    for (const [table, id] of [
      ["worker", env.companyBWorkerId],
      ["capacity_line", env.companyBCapacityLineId],
      ["demand_line", env.companyBDemandLineId],
      ["company_document", env.companyBDocumentId],
    ] as const) {
      const owned = await clientB.from(table).select("*").eq("id", id!).limit(1);
      expect(owned.error).toBeNull();
      expect(owned.data?.length).toBeGreaterThan(0);

      const hidden = await clientA.from(table).select("*").eq("id", id!).limit(1);
      expect(hidden.error).toBeNull();
      expect(hidden.data).toHaveLength(0);
    }
  });

  it("returns exact permission errors for Maintain-only base objects", async () => {
    for (const table of [
      "match",
      "match_worker",
      "engagement",
      "engagement_worker",
      "rate_band",
      "lead",
      "platform_config",
      "audit_event",
      "notification",
    ]) {
      await expectPermissionDenied(clientA.from(table).select("*").limit(1));
    }
  });

  it("rejects protected company, worker, document and marketplace mutations with 42501", async () => {
    const company = await ownCompany(clientA);
    await expectPermissionDenied(
      clientA.from("company").update({ status: company.status }).eq("id", company.id),
    );
    await expectPermissionDenied(
      clientA.from("company_document").update({ verified_by: "rls-test" }).eq("id", ZERO),
    );
    await expectPermissionDenied(
      clientA.from("worker").update({ status: "Inactive" }).eq("id", env.companyAWorkerId!),
    );

    for (const [table, filter] of [
      ["worker", ["id", ZERO]],
      ["capacity_listing", ["id", ZERO]],
      ["capacity_line", ["id", ZERO]],
      ["capacity_line_worker", ["capacity_line_id", ZERO]],
      ["capacity_line_travel_region", ["capacity_line_id", ZERO]],
      ["demand_request", ["id", ZERO]],
      ["demand_line", ["id", ZERO]],
      ["demand_line_skill", ["demand_line_id", ZERO]],
      ["demand_line_qualification", ["demand_line_id", ZERO]],
    ] as const) {
      await expectPermissionDenied(clientA.from(table).delete().eq(filter[0], filter[1]));
    }

    await expectPermissionDenied(
      clientA.from("capacity_line").update({ status: "Withdrawn" }).eq("id", ZERO),
    );
    await expectPermissionDenied(
      clientA.from("demand_line").update({ status: "Withdrawn" }).eq("id", ZERO),
    );
  });

  it("serves nonempty seeded projections without leaking the opposite rate", async () => {
    const checks = [
      [buyer, "buyer_match_view", env.buyerMatchId],
      [supplier, "supplier_match_view", env.supplierMatchId],
      [buyer, "buyer_engagement_view", env.buyerEngagementId],
      [supplier, "supplier_engagement_view", env.supplierEngagementId],
      [clientA, "company_transfer_view", env.transferId],
    ] as const;
    for (const [client, view, id] of checks) {
      const { data, error } = await client.from(view).select("*").eq("id", id!).limit(1);
      expect(error).toBeNull();
      expect(data?.length).toBeGreaterThan(0);
    }

    const buyerRows = await buyer
      .from("buyer_engagement_view")
      .select("*")
      .eq("id", env.buyerEngagementId!);
    expect(buyerRows.data?.[0]).not.toHaveProperty("supplier_rate_cents");
    expect(buyerRows.data?.[0]).not.toHaveProperty("fee_bp");
    const supplierRows = await supplier
      .from("supplier_engagement_view")
      .select("*")
      .eq("id", env.supplierEngagementId!);
    expect(supplierRows.data?.[0]).not.toHaveProperty("buyer_rate_cents");
    expect(supplierRows.data?.[0]).not.toHaveProperty("fee_bp");
  });

  it("keeps pre-commercial cancellations anonymous in both engagement projections", async () => {
    const buyerRow = await buyer
      .from("buyer_engagement_view")
      .select("supplier_company_id, commercial_confirmed_at")
      .eq("id", env.cancelledBuyerEngagementId!)
      .single();
    expect(buyerRow.error).toBeNull();
    expect(buyerRow.data?.commercial_confirmed_at).toBeNull();
    expect(buyerRow.data?.supplier_company_id).toBeNull();

    const supplierRow = await supplier
      .from("supplier_engagement_view")
      .select("buyer_company_id, commercial_confirmed_at")
      .eq("id", env.cancelledSupplierEngagementId!)
      .single();
    expect(supplierRow.error).toBeNull();
    expect(supplierRow.data?.commercial_confirmed_at).toBeNull();
    expect(supplierRow.data?.buyer_company_id).toBeNull();
  });

  it("forbidden projection mutations fail with exact permission errors", async () => {
    for (const view of [
      "buyer_match_view",
      "supplier_match_view",
      "buyer_engagement_view",
      "supplier_engagement_view",
      "company_transfer_view",
    ]) {
      await expectPermissionDenied(clientA.from(view).insert({ id: ZERO }));
      await expectPermissionDenied(clientA.from(view).update({ id: ZERO }).eq("id", ZERO));
      await expectPermissionDenied(clientA.from(view).delete().eq("id", ZERO));
    }
  });

  it("allows only Pending and Active companies to edit ordinary crew fields", async () => {
    const matrix = [
      [pending, "Pending", env.pendingWorkerId, true],
      [clientA, "Active", env.companyAWorkerId, true],
      [suspended, "Suspended", env.suspendedWorkerId, false],
      [closed, "Closed", env.closedWorkerId, false],
    ] as const;

    for (const [client, expectedStatus, workerId, writable] of matrix) {
      const company = await ownCompany(client);
      expect(company.status).toBe(expectedStatus);
      const worker = await client.from("worker").select("first_name").eq("id", workerId!).single();
      expect(worker.error).toBeNull();
      const update = await client
        .from("worker")
        .update({ first_name: worker.data!.first_name })
        .eq("id", workerId!)
        .select("id");
      if (writable) {
        expect(update.error).toBeNull();
        expect(update.data?.length).toBeGreaterThan(0);
      } else {
        // UPDATE RLS hides non-writable rows rather than raising a privilege error.
        expect(update.error).toBeNull();
        expect(update.data).toHaveLength(0);
      }
    }
  });

  it("rejects direct aggregate inserts for every company status; creation goes through checked RPCs", async () => {
    const matrix = [
      [pending, "Pending"],
      [clientA, "Active"],
      [suspended, "Suspended"],
      [closed, "Closed"],
    ] as const;

    for (const [client, expectedStatus] of matrix) {
      const company = await ownCompany(client);
      expect(company.status).toBe(expectedStatus);
      const inserted = await client
        .from("capacity_listing")
        .insert({ company_id: company.id })
        .select("id")
        .maybeSingle();
      expect(inserted.error?.code).toBe("42501");
    }
  });

  it("requires signed URLs for both private storage buckets", async () => {
    const companyDownload = await clientA.storage
      .from("company-documents")
      .download(env.companyDocumentPath!);
    expect(companyDownload.data).toBeNull();
    expect(companyDownload.error).toBeTruthy();

    const workerDownload = await clientA.storage
      .from("worker-qualifications")
      .download(env.workerQualificationPath!);
    expect(workerDownload.data).toBeNull();
    expect(workerDownload.error).toBeTruthy();
  });

  it("proves the overlap exclusion with distinct engagement fixtures", async () => {
    const source = await admin
      .from("engagement_worker")
      .select("worker_id, committed_window")
      .eq("id", env.committingEngagementWorkerId!)
      .single();
    expect(source.error).toBeNull();
    expect(source.data).toBeTruthy();

    const attemptedId = randomUUID();
    try {
      const { error } = await admin.from("engagement_worker").insert({
        id: attemptedId,
        engagement_id: env.overlapEngagementId!,
        worker_id: source.data!.worker_id,
        status: "Awaiting Commercial",
        committed_window: source.data!.committed_window,
      });
      expect(error?.code).toBe("23P01");
    } finally {
      // If the exclusion regresses, remove only this attempted test row even
      // though the assertion above failed. Never delete a pre-existing fixture.
      const cleanup = await admin.from("engagement_worker").delete().eq("id", attemptedId);
      expect(cleanup.error).toBeNull();
    }
  });
});
