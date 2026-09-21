import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const form = vi.hoisted(() => ({ pending: false }));
vi.mock("react-dom", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-dom")>(),
  useFormStatus: () => ({ pending: form.pending }),
}));

const { ApprovalSubmitButton } = await import("@/components/approval-submit-button");

describe("account approval control", () => {
  beforeEach(() => { form.pending = false; });

  it("shows the exact outstanding requirements while preserving admin approval", () => {
    const html = renderToStaticMarkup(createElement(ApprovalSubmitButton, {
      checklistUnavailable: false,
      outstandingLabels: ["Payment details provided", "Workers compensation"],
    }));

    expect(html).not.toMatch(/<button[^>]*\sdisabled(?:=|>)/);
    expect(html).toContain('aria-describedby="approval-outstanding-items"');
    expect(html).toContain("You can approve with these items outstanding");
    expect(html).toContain("Payment details provided, Workers compensation");
    expect(html).toContain("They will remain unverified");
    expect(html).toContain("approval decision will be audited");
  });

  it("enables approval once every required item is complete", () => {
    const html = renderToStaticMarkup(createElement(ApprovalSubmitButton, {
      checklistUnavailable: false,
      outstandingLabels: [],
    }));

    expect(html).not.toMatch(/<button[^>]*\sdisabled(?:=|>)/);
    expect(html).not.toContain("approval-outstanding-items");
    expect(html).toContain("Approve and activate");
  });

  it("explains unavailable checklist details without disabling approval", () => {
    const html = renderToStaticMarkup(createElement(ApprovalSubmitButton, {
      checklistUnavailable: true,
      outstandingLabels: [],
    }));

    expect(html).not.toMatch(/<button[^>]*\sdisabled(?:=|>)/);
    expect(html).toContain("Checklist details are unavailable");
    expect(html).toContain("Maintain admins can still approve this account");
    expect(html).toContain('aria-describedby="approval-outstanding-items"');
  });

  it.each([false, true])("prevents duplicate approval while submitting with checklist unavailable=%s", (checklistUnavailable) => {
    form.pending = true;
    const html = renderToStaticMarkup(createElement(ApprovalSubmitButton, {
      checklistUnavailable,
      outstandingLabels: ["Public liability insurance", "Workers compensation"],
    }));

    expect(html).toMatch(/<button[^>]*\sdisabled(?:=|>)/);
    expect(html).toContain("Approving…");
  });
});
