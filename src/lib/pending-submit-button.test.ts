import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const form = vi.hoisted(() => ({ pending: false }));
vi.mock("react-dom", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-dom")>(),
  useFormStatus: () => ({ pending: form.pending }),
}));

const { PendingSubmitButton } = await import("@/components/pending-submit-button");

describe("pending submit button", () => {
  beforeEach(() => { form.pending = false; });

  it("shows the requested idle label while enabled", () => {
    const html = renderToStaticMarkup(createElement(PendingSubmitButton, {
      idleLabel: "Save onboarding details", className: "button",
    }));
    expect(html).toContain("Save onboarding details");
    expect(html).not.toMatch(/<button[^>]*\sdisabled(?:=|>)/);
  });

  it("disables repeat submissions and reports progress", () => {
    form.pending = true;
    const html = renderToStaticMarkup(createElement(PendingSubmitButton, {
      idleLabel: "Save onboarding details", pendingLabel: "Saving…", className: "button",
    }));
    expect(html).toMatch(/<button[^>]*\sdisabled(?:=|>)/);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Saving…");
  });
});
