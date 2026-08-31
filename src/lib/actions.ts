"use server";

import { z } from "zod";
import { site } from "@/lib/site";
import { captureLead } from "@/lib/lead-capture";

// Both site forms land here. Plain server actions so the forms still submit
// with JavaScript unavailable or half-loaded — PRODUCT.md assumes an older
// Android on patchy signal, so the enhanced path is the bonus, not the floor.

export type FormResult = {
  ok: boolean;
  // Field-level messages keyed by input name, shown inline under the field.
  errors?: Record<string, string>;
  // Human sentence for the whole submission (success or delivery failure).
  message?: string;
  // What the user typed, echoed back on every failure. React 19 resets
  // uncontrolled fields after a form action completes, so without this a
  // failed round trip blanks the form: data loss on a phone with patchy
  // signal, on the site's primary conversion.
  values?: Record<string, string>;
};

function echo(formData: FormData, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) out[key] = String(formData.get(key) ?? "");
  return out;
}

// ABN: 11 digits, spaces tolerated. Checksum validation arrives with the ABR
// lookup (v2); format is enough for the concierge intake.
const abnPattern = /^\d{2}\s?\d{3}\s?\d{3}\s?\d{3}$/;

const registrationSchema = z.object({
  company: z.string().trim().min(2, "Tell us the company name."),
  abn: z
    .string()
    .trim()
    .regex(abnPattern, "An ABN is 11 digits, like 51 824 753 556."),
  contact: z.string().trim().min(2, "Tell us who to speak to."),
  email: z.string().trim().email("That email does not look right."),
  phone: z.string().trim().min(6, "We need a phone number."),
  trades: z.string().trim().min(1, "Pick at least one trade."),
  posture: z.enum(["need", "have", "both"], {
    message: "Tell us which side you are on right now.",
  }),
  location: z.string().trim().min(2, "Tell us where you operate."),
  notes: z.string().trim().max(2000).optional(),
});

const enquirySchema = z.object({
  name: z.string().trim().min(2, "Tell us your name."),
  email: z.string().trim().email("That email does not look right."),
  company: z.string().trim().max(200).optional(),
  sites: z.string().trim().max(200).optional(),
  message: z.string().trim().min(10, "Tell us what you want to know."),
});

async function deliver(subject: string, lines: string[]): Promise<FormResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.BOOKING_NOTIFICATION_EMAIL;

  if (!apiKey || !to) {
    // No silent success: without delivery configured the form must say so and
    // hand over the direct channels instead of pretending the message landed.
    console.error("Form submission received but RESEND_API_KEY / BOOKING_NOTIFICATION_EMAIL are not set.");
    return {
      ok: false,
      message: `We could not send your message just now. Email ${site.email} and we will pick it up directly.`,
    };
  }

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    // RESEND_FROM_EMAIL needs its domain verified in Resend; the resend.dev
    // fallback works unverified so the form never silently depends on DNS.
    from: process.env.RESEND_FROM_EMAIL ?? `${site.name} <onboarding@resend.dev>`,
    to,
    subject,
    text: lines.join("\n"),
  });

  if (error) {
    console.error("Resend delivery failed:", error);
    return {
      ok: false,
      message: `We could not send your message just now. Email ${site.email} and we will pick it up directly.`,
    };
  }
  return { ok: true };
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

const REGISTRATION_KEYS = [
  "company",
  "abn",
  "contact",
  "email",
  "phone",
  "trades",
  "posture",
  "location",
  "notes",
];

const POSTURE_LABEL = {
  need: "Need labour",
  have: "Have labour available",
  both: "Both, depending on the month",
} as const;

// The site's primary conversion: concierge company registration. v1 is a
// manual marketplace (blueprint §6.2), so an intake that lands with the team
// for ABN verification IS the product's front door, not a stand-in for it.
export async function registerCompany(
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  // Honeypot: real users never see or fill this field.
  if (formData.get("website")) return { ok: true };

  const values = {
    ...echo(formData, REGISTRATION_KEYS),
    // Checkboxes: several inputs share name="trades"; join for echo + email.
    trades: formData.getAll("trades").map(String).filter(Boolean).join(", "),
  };
  const parsed = registrationSchema.safeParse({
    company: formData.get("company"),
    abn: formData.get("abn"),
    contact: formData.get("contact"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    trades: values.trades,
    posture: formData.get("posture"),
    location: formData.get("location"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error), values };
  }

  const r = parsed.data;

  // 0.2 route (a): the public capture form is one of the three ways a lead enters
  // the platform. Recorded before the email so the Leads queue is the system of
  // record even when delivery later fails.
  await captureLead({
    source: "website:register",
    posture: r.posture,
    businessName: r.company,
    contactName: r.contact,
    email: r.email,
    phone: r.phone,
    abn: r.abn,
    tradeInterest: r.trades,
    notes: [r.location ? `Operates in: ${r.location}` : null, r.notes].filter(Boolean).join(String.fromCharCode(10)),
  });

  const result = await deliver(
    `Company registration: ${r.company} (${r.trades})`,
    [
      `Company: ${r.company}`,
      `ABN: ${r.abn}`,
      `Contact: ${r.contact}`,
      `Email: ${r.email}`,
      `Phone: ${r.phone}`,
      `Trades: ${r.trades}`,
      `Posture: ${POSTURE_LABEL[r.posture]}`,
      `Operates in: ${r.location}`,
      `Notes: ${r.notes ?? "not given"}`,
    ],
  );
  return result.ok ? result : { ...result, values };
}

const ENQUIRY_KEYS = ["name", "email", "company", "sites", "message"];

export async function submitEnquiry(
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  if (formData.get("website")) return { ok: true };

  const values = echo(formData, ENQUIRY_KEYS);
  const parsed = enquirySchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    company: formData.get("company") || undefined,
    sites: formData.get("sites") || undefined,
    message: formData.get("message"),
  });
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error), values };
  }

  const e = parsed.data;
  const result = await deliver(
    `Client enquiry: ${e.name}${e.company ? ` (${e.company})` : ""}`,
    [
      `Name: ${e.name}`,
      `Email: ${e.email}`,
      `Company: ${e.company ?? "not given"}`,
      `Sites / locations: ${e.sites ?? "not given"}`,
      "",
      e.message,
    ],
  );
  return result.ok ? result : { ...result, values };
}
