import { describe, expect, it } from "vitest";
import { parseRegistrationInput } from "./registration";

const validRegistration = {
  legal_name: "Example Construction Pty Ltd",
  trading_name: "Example Construction",
  abn: "51 824 753 556",
  industry_id: "11111111-1111-4111-8111-111111111111",
  contact_name: "Sam Taylor",
  contact_email: "ops@example.com.au",
  contact_phone: "07 3000 0000",
  primary_region_id: "22222222-2222-4222-8222-222222222222",
  operating_region_ids: ["22222222-2222-4222-8222-222222222222"],
};

describe("post-sign-up company registration validation", () => {
  it("accepts company fields after Clerk has established the administrator", () => {
    const result = parseRegistrationInput(validRegistration);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contact_email).toBe("ops@example.com.au");
      expect(result.data.abn).toBe("51824753556");
    }
  });

  it("allows the ABN to be left blank during onboarding", () => {
    const result = parseRegistrationInput({
      ...validRegistration,
      abn: "",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.abn).toBeUndefined();
    }
  });

  it("allows the ABN field to be omitted during onboarding", () => {
    const { abn: _abn, ...withoutAbn } = validRegistration;
    void _abn;
    const result = parseRegistrationInput(withoutAbn);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.abn).toBeUndefined();
    }
  });

  it("does not collect or validate credentials in the company step", () => {
    const result = parseRegistrationInput({
      ...validRegistration,
      email: "not-an-email",
      password: "short",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("email");
      expect(result.data).not.toHaveProperty("password");
    }
  });

  it("explains when eleven digits still fail the official checksum", () => {
    const result = parseRegistrationInput({
      ...validRegistration,
      abn: "51824563652",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.abn).toMatch(/11 digits.*not a valid ABN/i);
    }
  });

  it("distinguishes an incomplete number from an invalid eleven-digit ABN", () => {
    const result = parseRegistrationInput({
      ...validRegistration,
      abn: "5182475355",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.abn).toMatch(/ABN is 11 digits/i);
    }
  });
});
