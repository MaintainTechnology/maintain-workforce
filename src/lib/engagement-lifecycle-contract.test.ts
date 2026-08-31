import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  notify: vi.fn(),
  requireMaintainAdmin: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({ requireMaintainAdmin: mocks.requireMaintainAdmin }));
vi.mock("@/lib/notify", () => ({
  notify: mocks.notify,
  NOTIFICATION_TRIGGERS: {
    ENGAGEMENT_CONFIRMED: "engagement confirmed",
    ENGAGEMENT_CANCELLED: "engagement cancelled",
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

const actions = await import("./actions/engagement");

const MIGRATION = "supabase/migrations/20260828000600_transactional_engagement_lifecycle.sql";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireMaintainAdmin.mockResolvedValue({ id: "maintain-admin" });
} );

describe("transactional engagement lifecycle migration", () => {
  it("fails migration preflight on duplicate match engagements before adding uniqueness", () => {
    const sql = source(MIGRATION);
    expect(sql).toMatch(/group by match_id[\s\S]*having count\(\*\) > 1/i);
    expect(sql).toMatch(/raise exception[^;]*duplicate/i);
    expect(sql).toMatch(/unique\s*\(match_id\)/i);
    expect(sql.indexOf("having count(*) > 1")).toBeLessThan(sql.search(/unique\s*\(match_id\)/i));
    expect(sql).toMatch(/left join engagement_worker[\s\S]*having count\(ew\.id\) = 0/i);
    expect(sql).toContain("engagements without workers exist");
  });

  it("makes payment and lifecycle RPCs authoritative, service-role-only transactions", () => {
    const sql = source(MIGRATION);
    for (const fn of [
      "record_engagement_payment",
      "transition_engagement_lifecycle",
      "record_engagement_outcome",
    ]) {
      expect(sql).toContain(`function ${fn}`);
      expect(sql).toMatch(new RegExp(`revoke all on function ${fn}\\([\\s\\S]*?from public, anon, authenticated`, "i"));
      expect(sql).toMatch(new RegExp(`grant execute on function ${fn}\\([\\s\\S]*?to service_role`, "i"));
    }
    expect(sql).toContain("for update");
    expect(sql).toContain("p_expected_status");
    expect(sql).toContain("engagement lifecycle writes require an authoritative RPC");
    expect(sql.match(/get diagnostics v_worker_count = row_count/g)).toHaveLength(2);
    expect(sql).toContain("commercial trigger rolled back");
    expect(sql).toContain("lifecycle transition rolled back");
    expect(sql).toContain("actual outcomes can be recorded only on a Completed engagement");
    expect(sql).toContain("'engagement.outcome_recorded'");
  });

  it("atomically couples the marker, status, worker copy and required commercial audits", () => {
    const sql = source(MIGRATION);
    expect(sql).toContain("commercial_confirmed_at = v_now");
    expect(sql).toContain("new engagements must begin in Awaiting Commercial");
    expect(sql).toMatch(/update engagement_worker[\s\S]*status = v_next_status[\s\S]*committed_window/i);
    expect(sql).toContain("'engagement.payment_status_recorded'");
    expect(sql).toContain("'engagement.confirmed'");
    expect(sql).toContain("'engagement.activated'");
    expect(sql).toMatch(/commercial marker requires a confirmed lifecycle status/i);
  });

  it("encodes only the canonical lifecycle edges and audits each transition", () => {
    const sql = source(MIGRATION);
    for (const fragment of [
      "v_before.status = 'Confirmed' and p_target_status = 'Active'",
      "v_before.status = 'Active' and p_target_status = 'Completed'",
      "v_before.status in ('Awaiting Commercial', 'Confirmed', 'Active', 'Disputed')",
      "v_before.status in ('Active', 'Completed') and p_target_status = 'Disputed'",
      "v_before.status = 'Disputed' and p_target_status = 'Completed'",
    ]) {
      expect(sql).toContain(fragment);
    }
    expect(sql).toMatch(/update engagement_worker[\s\S]*status = p_target_status[\s\S]*committed_window/i);
    for (const action of [
      "'engagement.activated'",
      "'engagement.completed'",
      "'engagement.cancelled'",
      "'engagement.disputed'",
    ]) {
      expect(sql).toContain(action);
    }
    expect(sql).toContain("activation is owned by the daily system actor");
    expect(sql).toContain("dispute resolution requires a Maintain actor");
    expect(sql).toContain("automatic completion is valid only after the stored end date");
    expect(sql).toMatch(/returning \* into v_after[\s\S]*'actual_hours', v_after\.actual_hours/i);
  });
});

describe("engagement server actions", () => {
  it("returns a failed FormResult when the payment RPC rejects the CAS", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "stale engagement status" } }));
    mocks.createAdminClient.mockReturnValue({ rpc });

    const result = await actions.recordPaymentStatus(
      null,
      form({
        engagement_id: "00000000-0000-4000-8000-000000000001",
        expected_status: "Awaiting Commercial",
        payment_status: "pre-authorised",
        external_payment_ref: "pay-1",
      }),
    );

    expect(result).toEqual({ ok: false, message: "The payment status could not be recorded. Refresh and try again." });
    expect(rpc).toHaveBeenCalledWith(
      "record_engagement_payment",
      expect.objectContaining({
        p_actor_user_id: "maintain-admin",
        p_expected_status: "Awaiting Commercial",
      }),
    );
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("returns a failed FormResult when a lifecycle transition rejects the CAS", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "illegal engagement transition" } }));
    mocks.createAdminClient.mockReturnValue({ rpc });

    const result = await actions.cancelEngagement(
      null,
      form({
        engagement_id: "00000000-0000-4000-8000-000000000001",
        expected_status: "Active",
        reason: "Site work cancelled",
      }),
    );

    expect(result).toEqual({ ok: false, message: "The engagement could not be cancelled. Refresh and try again." });
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("commits successfully even when post-commit confirmation delivery fails", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        engagement_id: "00000000-0000-4000-8000-000000000001",
        previous_status: "Awaiting Commercial",
        status: "Confirmed",
        payment_status: "pre-authorised",
        buyer_company_id: "00000000-0000-4000-8000-000000000002",
        supplier_company_id: "00000000-0000-4000-8000-000000000003",
        triggered: true,
        activated: false,
      },
      error: null,
    }));
    const maybeSingle = vi.fn(async () => ({ data: { contact_email: "ops@example.com" }, error: null }));
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    mocks.createAdminClient.mockReturnValue({ rpc, from: vi.fn(() => ({ select })) });
    mocks.notify.mockRejectedValue(new Error("mail provider unavailable"));

    const result = await actions.recordPaymentStatus(
      null,
      form({
        engagement_id: "00000000-0000-4000-8000-000000000001",
        expected_status: "Awaiting Commercial",
        payment_status: "pre-authorised",
      }),
    );

    expect(result.ok).toBe(true);
    expect(mocks.notify).toHaveBeenCalledTimes(2);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/admin/engagements/00000000-0000-4000-8000-000000000001",
    );
  });

  it("records Completed-state actuals through the locked outcome RPC", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        engagement_id: "00000000-0000-4000-8000-000000000001",
        previous_status: "Completed",
        status: "Completed",
        buyer_company_id: "00000000-0000-4000-8000-000000000002",
        supplier_company_id: "00000000-0000-4000-8000-000000000003",
      },
      error: null,
    }));
    mocks.createAdminClient.mockReturnValue({ rpc });

    const result = await actions.recordEngagementOutcome(
      null,
      form({
        engagement_id: "00000000-0000-4000-8000-000000000001",
        actual_hours: "72.5",
        actual_value_cents: "1234000",
      }),
    );

    expect(result).toEqual({ ok: true, message: "Engagement outcome recorded." });
    expect(rpc).toHaveBeenCalledWith("record_engagement_outcome", {
      p_engagement_id: "00000000-0000-4000-8000-000000000001",
      p_actual_hours: 72.5,
      p_actual_value_cents: 1234000,
      p_actor_user_id: "maintain-admin",
    });
  });

  it("routes all authoritative mutations through RPCs and has no silent trigger wrapper", () => {
    const file = source("src/lib/actions/engagement.ts");
    expect(file).toContain('.rpc("record_engagement_payment"');
    expect(file).toContain('.rpc("transition_engagement_lifecycle"');
    expect(file).not.toContain("recordCommercialTrigger");
    expect(file).not.toMatch(/\.from\("engagement"\)\s*\.update/);
  });
});

describe("engagement UI and daily transitions", () => {
  it("renders inline-result controls and links the register to engagement operations", () => {
    const list = source("src/app/(admin)/admin/engagements/page.tsx");
    const detail = source("src/app/(admin)/admin/engagements/[id]/page.tsx");
    expect(list).toContain("ActionForm");
    expect(list).toContain("/admin/engagements/${row.id}");
    for (const action of [
      "recordPaymentStatus",
      "cancelEngagement",
      "completeEngagement",
      "disputeEngagement",
      "recordEngagementOutcome",
    ]) {
      expect(detail).toContain(action);
      expect(detail).toContain("ActionForm");
    }
    expect(detail).toContain('name="end_date"');
    expect(detail).toContain('name="expected_status"');
  });

  it("uses the checked lifecycle RPC for cron activation and completion", () => {
    const cron = source("src/lib/cron.ts");
    const executor = source("supabase/migrations/20260828001200_transactional_daily_job.sql");
    expect(cron).toContain('.rpc("run_daily_state_transitions"');
    expect(executor).toContain("transition_engagement_lifecycle(v_row.id, 'Confirmed', 'Active', null, true, p_today)");
    expect(executor).toContain("transition_engagement_lifecycle(v_row.id, 'Active', 'Completed', null, true, p_today)");
    expect(cron).toContain("Daily state transitions failed");
    expect(cron).not.toContain("async function setEngagementStatus");
  });
});
