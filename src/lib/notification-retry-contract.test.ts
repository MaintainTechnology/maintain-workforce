import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_NAV } from "./admin-navigation";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("notification retry contract (15.1)", () => {
  it("persists the immutable delivery payload and retry attempt state", () => {
    const migration = source(
      "supabase/migrations/20260828001100_notification_retry.sql",
    );
    const notify = source("src/lib/notify.ts");

    for (const column of ["subject text", "body text", "action_url text", "attempt_count integer"] ) {
      expect(migration).toContain(column);
    }
    expect(migration).toContain("notification_failed_queue_idx");
    expect(notify).toContain("subject: input.subject");
    expect(notify).toContain("body: input.body");
    expect(notify).toContain("action_url: actionUrl ?? null");
    expect(notify).toContain(
      "export async function retryNotification(id: string, actorUserId: string)",
    );
    expect(migration).toContain("claim_notification_retry");
    expect(migration).toContain("for update");
    expect(migration).toContain("retry_claimed_at > now() - interval '15 minutes'");
    expect(migration).toContain("to service_role");
    expect(notify).toContain("idempotencyKey:");
  });

  it("authorizes before every service-role read and accepts only the notification id", () => {
    const action = source("src/lib/actions/notification.ts");
    const authAt = action.indexOf("await requireMaintainAdmin()");
    const serviceAt = action.indexOf("createAdminClient()");

    expect(authAt).toBeGreaterThanOrEqual(0);
    expect(serviceAt).toBeGreaterThan(authAt);
    expect(action).toContain('notification_id: z.string().uuid()');
    expect(action).not.toMatch(/formData\.get\(["'](?:recipient|subject|body|action_url)["']\)/);
    expect(action).toContain('action: "notification.retry_requested"');
  });

  it("keeps the queue Maintain-only and never puts delivery copy in the retry form", () => {
    const page = source("src/app/(admin)/admin/notifications/page.tsx");
    const layout = source("src/app/(admin)/layout.tsx");
    const navigation = source("src/components/admin-navigation.tsx");
    const pagination = source("src/components/admin-page.tsx");
    const authAt = page.indexOf("await requireMaintainAdmin()");
    const serviceAt = page.indexOf("createAdminClient()");

    expect(authAt).toBeGreaterThanOrEqual(0);
    expect(serviceAt).toBeGreaterThan(authAt);
    expect(page).toContain('name="notification_id"');
    expect(page).not.toMatch(/name=["'](?:recipient|subject|body|action_url)["']/);
    expect(page).toContain("Legacy row");
    expect(page).toContain('{ count: "exact" }');
    expect(page).toContain(".range(from, from + PAGE_SIZE - 1)");
    expect(page).toContain("<Pagination");
    expect(page).toContain('previousHref={page > 1 ? `/admin/notifications?page=${page - 1}` : undefined}');
    expect(page).toContain('nextHref={page < totalPages ? `/admin/notifications?page=${page + 1}` : undefined}');
    expect(pagination).toContain("Previous");
    expect(pagination).toContain("Next");
    expect(layout).toContain("<AdminSidebar {...account} />");
    expect(layout).toContain("<AdminTopBar {...account} />");
    expect(navigation).toContain("ADMIN_NAV.map");
    expect(ADMIN_NAV).toContainEqual(expect.objectContaining({ href: "/admin/notifications", label: "Notifications" }));
  });
});
