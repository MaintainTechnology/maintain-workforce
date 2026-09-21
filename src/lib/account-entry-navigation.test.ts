import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ signedIn: false }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ isSignedIn: session.signedIn }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const { SiteHeader } = await import("../components/site-header");
const { WorkspaceSidebar, WorkspaceHeader } = await import("../components/workspace-navigation");

describe("account navigation", () => {
  it("sends signed-in desktop and mobile account links through authoritative routing", () => {
    session.signedIn = true;
    const html = renderToStaticMarkup(createElement(SiteHeader));

    expect([...html.matchAll(/href="\/auth\/continue"/g)]).toHaveLength(2);
    expect(html).toContain("My account");
    expect(html).not.toContain('href="/signin"');
    expect(html).not.toContain('href="/signup"');
  });

  it("keeps sign-in and registration available for visitors", () => {
    session.signedIn = false;
    const html = renderToStaticMarkup(createElement(SiteHeader));

    expect(html).toContain('href="/signin"');
    expect(html).toContain('href="/signup"');
    expect(html).not.toContain('href="/auth/continue"');
  });

  it.each([false, true])("shows account approvals only when the server grants access (%s)", (canManageWorkforce) => {
    const account = {
      companyName: "Example Company",
      companyStatus: "Pending" as const,
      email: "member@example.test",
      canManageWorkforce,
      signOut: null,
    };
    const html = renderToStaticMarkup(createElement("div", null,
      createElement(WorkspaceSidebar, account), createElement(WorkspaceHeader, account)));

    expect([...html.matchAll(/href="\/admin\/verification"/g)]).toHaveLength(canManageWorkforce ? 2 : 0);
    expect(html.includes("Account approvals")).toBe(canManageWorkforce);
  });
});
