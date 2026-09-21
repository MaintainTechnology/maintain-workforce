import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApprovalSubmitButton } from "@/components/approval-submit-button";

describe("account approval control", () => {
  it("explains the exact outstanding requirements while approval is disabled", () => {
    const html = renderToStaticMarkup(createElement(ApprovalSubmitButton, {
      checklistUnavailable: false,
      outstandingLabels: ["Payment details provided", "Workers compensation"],
    }));

    expect(html).toMatch(/<button[^>]*\sdisabled(?:=|>)/);
    expect(html).toContain('aria-describedby="approval-blocked-reason"');
    expect(html).toContain("Approval is locked");
    expect(html).toContain("Payment details provided, Workers compensation");
  });

  it("enables approval once every required item is complete", () => {
    const html = renderToStaticMarkup(createElement(ApprovalSubmitButton, {
      checklistUnavailable: false,
      outstandingLabels: [],
    }));

    expect(html).not.toMatch(/<button[^>]*\sdisabled(?:=|>)/);
    expect(html).not.toContain("approval-blocked-reason");
    expect(html).toContain("Approve and activate");
  });

  it("keeps approval blocked when the checklist cannot be loaded", () => {
    const html = renderToStaticMarkup(createElement(ApprovalSubmitButton, {
      checklistUnavailable: true,
      outstandingLabels: [],
    }));

    expect(html).toMatch(/<button[^>]*\sdisabled(?:=|>)/);
    expect(html).toContain("verification checklist could not be loaded");
  });
});
