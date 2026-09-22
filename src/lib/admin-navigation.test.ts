import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/admin" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

const { AdminSidebar } = await import("../components/admin-navigation");

function render(pathname: string) {
  navigation.pathname = pathname;
  return renderToStaticMarkup(createElement(AdminSidebar, { email: "staff@example.test", signOut: null }));
}

function currentLink(html: string) {
  return [...html.matchAll(/<a\b[^>]*aria-current="page"[^>]*>[\s\S]*?<\/a>/g)]
    .map(([anchor]) => anchor.match(/href="([^"]+)"/)?.[1]);
}

describe("Maintain admin navigation", () => {
  it("keeps every admin workspace reachable from the dashboard", () => {
    const html = render("/admin");
    expect(html).toContain('aria-label="Maintain admin"');
    const navigationHtml = html.match(/<nav aria-label="Maintain admin">[\s\S]*?<\/nav>/)?.[0] ?? "";
    expect([...navigationHtml.matchAll(/<a\b/g)]).toHaveLength(11);
    for (const path of ["companies", "workers", "matching", "engagements", "transfers", "notifications"]) {
      expect(html).toContain(`href="/admin/${path}"`);
    }
    expect(currentLink(html)).toEqual(["/admin"]);
  });

  it.each([
    ["/admin/matching/demand-123", "/admin/matching"],
    ["/admin/companies/company-123/concierge", "/admin/companies"],
    ["/admin/engagements/engagement-123", "/admin/engagements"],
    ["/admin/workers/worker-123", "/admin/workers"],
  ])("identifies the workspace containing %s", (path, destination) => {
    expect(currentLink(render(path))).toEqual([destination]);
  });

  it("updates the selected destination when client navigation changes the path", () => {
    expect(currentLink(render("/admin/workers"))).toEqual(["/admin/workers"]);
    expect(currentLink(render("/admin/rates"))).toEqual(["/admin/rates"]);
  });

  it.each(["/admin/mfa", "/admin/workers-export"])("does not assign an unrelated current destination to %s", (path) => {
    expect(currentLink(render(path))).toEqual([]);
  });
});
