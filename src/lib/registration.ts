import { z } from "zod";
import { isValidAbn, normaliseAbn } from "@/lib/domain/abn";

const optionalAbnSchema = z.preprocess(
  (value) =>
    value == null || (typeof value === "string" && value.trim() === "") ? undefined : value,
  z
    .string()
    .trim()
    .refine(
      (value) => /^\d{11}$/.test(normaliseAbn(value)),
      "An ABN is 11 digits, like 51 824 753 556.",
    )
    .refine(
      isValidAbn,
      "This has 11 digits, but it is not a valid ABN. Check it against your ABR record.",
    )
    .optional(),
);

const registrationSchema = z.object({
  legal_name: z.string().trim().min(2, "Tell us the registered company name."),
  trading_name: z.string().trim().max(200).optional(),
  abn: optionalAbnSchema,
  industry_id: z.string().uuid("Choose the industry you work in."),
  contact_name: z.string().trim().min(2, "Tell us who to speak to."),
  contact_email: z.string().trim().email("That email does not look right."),
  contact_phone: z.string().trim().min(6, "We need a phone number."),
  primary_region_id: z.string().uuid("Choose your primary region."),
  operating_region_ids: z
    .array(z.string().uuid())
    .min(1, "Choose at least one region you operate in."),
});

export type RegistrationInput = z.infer<typeof registrationSchema>;

export type RegistrationParseResult =
  | { success: true; data: RegistrationInput }
  | { success: false; errors: Record<string, string> };

function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    if (!(field in errors)) errors[field] = issue.message;
  }
  return errors;
}

/** Pure validation shared by the public form and focused unit tests. */
export function parseRegistrationInput(input: Record<string, unknown>): RegistrationParseResult {
  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success) return { success: false, errors: fieldErrors(parsed.error) };

  return {
    success: true,
    data: {
      ...parsed.data,
      contact_email: parsed.data.contact_email.toLowerCase(),
      abn: parsed.data.abn ? normaliseAbn(parsed.data.abn) : undefined,
      operating_region_ids: Array.from(
        new Set([...parsed.data.operating_region_ids, parsed.data.primary_region_id]),
      ),
    },
  };
}
