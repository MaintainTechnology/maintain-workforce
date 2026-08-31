"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireMaintainAdmin } from "@/lib/auth";
import { inviteAdministrator } from "@/lib/clerk";
import { isValidAbn, normaliseAbn } from "@/lib/domain/abn";
import { notify, NOTIFICATION_TRIGGERS } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import type { LeadIntent, LeadStatus } from "@/lib/supabase/types";

// Leads — spec module 0. A lead is never visible to any company (0.3), so every export
// here is gated on requireMaintainAdmin and the table is Maintain-only under RLS (17.1).
// The third intake route, the token-authenticated webhook, lives in
// src/app/api/webhooks/lead/route.ts because its trust boundary is a header, not a session.

const LEAD_INTENTS: LeadIntent[] = ["sell", "buy", "both"];

const csvRowSchema = z.object({
  source: z.string().trim().max(120).optional(),
  intent: z.enum(["sell", "buy", "both"]),
  contact_name: z.string().trim().max(200).optional(),
  business_name: z.string().trim().max(200).optional(),
  abn: z.string().trim().max(20).optional(), // 0.2 optional at capture
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().optional(),
  trade_interest: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(4000).optional(),
  funnel_score: z.string().trim().max(40).optional(),
});

/**
 * RFC 4180 enough for a founder-supplied export: quoted fields, doubled quotes inside
 * them, CRLF or LF. A CSV dependency for one admin-only import would not earn its place.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") field += char;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

/**
 * 0.2 route (b) — CSV import by a Maintain admin. The header row names the columns, so
 * a founder can reorder them without the import caring.
 */
export async function importLeads(formData: FormData): Promise<void> {
  const user = await requireMaintainAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) redirect("/admin/leads?error=no_file");

  const rows = parseCsv(await (file as File).text());
  if (rows.length < 2) redirect("/admin/leads?error=empty_csv");

  const header = rows[0].map((cell) => cell.trim().toLowerCase().replace(/\s+/g, "_"));
  const admin = createAdminClient();
  let imported = 0;
  let rejected = 0;

  for (const cells of rows.slice(1)) {
    const raw: Record<string, string> = {};
    header.forEach((key, index) => {
      const value = (cells[index] ?? "").trim();
      if (value) raw[key] = value;
    });

    const parsed = csvRowSchema.safeParse(raw);
    if (!parsed.success) {
      rejected += 1;
      continue;
    }

    const { data: lead } = await admin
      .from("lead")
      .insert({ ...parsed.data, abn: parsed.data.abn ? normaliseAbn(parsed.data.abn) : null, status: "New" })
      .select("id")
      .single();

    if (lead) {
      imported += 1;
      await audit({
        actor: { userId: user.id },
        action: "lead.created",
        entityType: "lead",
        entityId: lead.id,
        after: { source: parsed.data.source ?? "csv-import", intent: parsed.data.intent },
      });
    } else rejected += 1;
  }

  redirect(`/admin/leads?saved=imported&imported=${imported}&rejected=${rejected}`);
}

/** 0.3 — New → Contacted. Qualification is the human step that follows. */
export async function markLeadContacted(formData: FormData): Promise<void> {
  const user = await requireMaintainAdmin();
  const parsedId = z.string().uuid().safeParse(formData.get("lead_id"));
  if (!parsedId.success) redirect("/admin/leads?error=invalid");
  const leadId = parsedId.data;
  const back = `/admin/leads?lead=${leadId}`;

  const admin = createAdminClient();
  const { data: lead, error: readError } = await admin.from("lead").select("id, status, company_id").eq("id", leadId).maybeSingle();
  if (readError) redirect(`${back}&error=status_update_failed`);
  if (!lead) redirect("/admin/leads?error=not_found");
  if (lead.company_id !== null) redirect(`${back}&error=already_qualified`);
  if (lead.status !== "New") redirect(`${back}&error=not_new`);

  const { data: after, error: updateError } = await admin
    .from("lead")
    .update({ status: "Contacted" satisfies LeadStatus })
    .eq("id", leadId)
    .eq("status", lead.status)
    .is("company_id", null)
    .select("status")
    .maybeSingle();
  if (updateError) redirect(`${back}&error=status_update_failed`);
  if (!after) redirect(`${back}&error=status_changed`);

  await audit({
    actor: { userId: user.id },
    action: "lead.contacted",
    entityType: "lead",
    entityId: leadId,
    before: { status: lead.status },
    after,
  });

  redirect(`/admin/leads?lead=${leadId}&saved=contacted`);
}

const qualifySchema = z.object({
  abn: z.string().trim().nullish(),
  contact_email: z.string().trim().email(),
  legal_name: z.string().trim().min(2),
  contact_name: z.string().trim().max(200).optional(),
  contact_phone: z.string().trim().max(40).optional(),
  industry_id: z.string().uuid().optional(),
  primary_region_id: z.string().uuid().optional(),
});

/**
 * 0.3 — qualification requires a legal name and contact email. ABN is optional;
 * any supplied ABN is checksum-validated and uniqueness-checked per 1.2. It creates
 * the Pending company pre-filled from the lead, links the lead to it, and sends the
 * Maintain-initiated first-administrator invitation through Clerk (1.8).
 *
 * Until that invitation is accepted the company has no users and is concierge-managed
 * (16.1).
 */
export async function qualifyLead(formData: FormData): Promise<void> {
  const user = await requireMaintainAdmin();
  const leadId = String(formData.get("lead_id") ?? "");
  if (!leadId) redirect("/admin/leads?error=invalid");
  const back = `/admin/leads?lead=${leadId}`;

  const parsed = qualifySchema.safeParse({
    abn: formData.get("abn"),
    contact_email: formData.get("contact_email"),
    legal_name: formData.get("legal_name"),
    contact_name: formData.get("contact_name") || undefined,
    contact_phone: formData.get("contact_phone") || undefined,
    industry_id: formData.get("industry_id") || undefined,
    primary_region_id: formData.get("primary_region_id") || undefined,
  });
  if (!parsed.success) redirect(`${back}&error=qualification_details_invalid`);
  const input = parsed.data;

  const abn = input.abn ? normaliseAbn(input.abn) : null;
  if (abn !== null && !isValidAbn(abn)) redirect(`${back}&error=abn_checksum`);

  const admin = createAdminClient();
  const { data: lead, error: leadReadError } = await admin.from("lead").select("*").eq("id", leadId).maybeSingle();
  if (leadReadError) redirect(`${back}&error=company_create_failed`);
  if (!lead) redirect("/admin/leads?error=not_found");
  if (lead.company_id) redirect(`${back}&error=already_qualified`);
  if (lead.status !== "Contacted") redirect(`${back}&error=not_contacted`);

  // 1.2 — supplied ABNs remain unique across companies; a missing ABN has no collision.
  // Maintain is inside the trust boundary, so this queue can plainly identify a duplicate.
  if (abn !== null) {
    const { data: existing, error: duplicateReadError } = await admin.from("company").select("id").eq("abn", abn).limit(1);
    if (duplicateReadError) redirect(`${back}&error=company_create_failed`);
    if (existing && existing.length > 0) {
      await notify({
        trigger: NOTIFICATION_TRIGGERS.ABN_COLLISION_REVIEW,
        to: process.env.MAINTAIN_NOTIFICATION_EMAIL ?? process.env.BOOKING_NOTIFICATION_EMAIL ?? "",
        subject: "Lead qualification blocked — ABN already registered",
        body: "A lead could not be qualified because its ABN already belongs to a registered company.",
        entityType: "lead",
        entityId: leadId,
        actionPath: `/admin/leads?lead=${leadId}`,
      });
      redirect(`${back}&error=abn_taken`);
    }
  }

  const { data: company, error: companyError } = await admin
    .from("company")
    .insert({
      legal_name: input.legal_name,
      abn,
      industry_id: input.industry_id ?? null,
      contact_name: input.contact_name ?? null,
      contact_email: input.contact_email,
      contact_phone: input.contact_phone ?? null,
      primary_region_id: input.primary_region_id ?? null,
      status: "Pending", // 0.3 the company created by qualification is Pending
    })
    .select("id")
    .single();
  if (companyError || !company) redirect(`${back}&error=company_create_failed`);

  // Only compensate this request's new, unlinked Pending company. A failed claim
  // response can hide a committed link; the FK also protects a link racing this read.
  const discardUnlinkedCompany = async (): Promise<boolean> => {
    const { data: links, error: linksError } = await admin
      .from("lead")
      .select("id")
      .eq("company_id", company.id)
      .limit(1);
    if (linksError || !links || links.length > 0) return false;
    const { data: removed, error: removalError } = await admin
      .from("company")
      .delete()
      .eq("id", company.id)
      .eq("status", "Pending")
      .select("id")
      .maybeSingle();
    return !removalError && removed?.id === company.id;
  };

  if (input.primary_region_id) {
    const { data: operatingRegion, error: operatingRegionError } = await admin
      .from("company_operating_region")
      .insert({ company_id: company.id, region_id: input.primary_region_id })
      .select("company_id")
      .single();
    if (operatingRegionError || !operatingRegion) {
      const removed = await discardUnlinkedCompany();
      redirect(`${back}&error=${removed ? "company_create_failed" : "qualification_recovery_required"}`);
    }
  }

  // ABN uniqueness cannot arbitrate blank-ABN submissions. Claim the lead itself:
  // only the request that still sees the original unlinked status may invite.
  const { data: claimedLead, error: leadUpdateError } = await admin
    .from("lead")
    .update({ status: "Qualified" satisfies LeadStatus, company_id: company.id })
    .eq("id", leadId)
    .eq("status", lead.status)
    .is("company_id", null)
    .select("id")
    .maybeSingle();
  if (leadUpdateError || claimedLead?.id !== leadId) {
    const removed = await discardUnlinkedCompany();
    if (!removed) redirect(`${back}&error=qualification_recovery_required`);
    redirect(`${back}&error=${leadUpdateError ? "company_create_failed" : "lead_changed"}`);
  }

  // Record the claimed qualification before the external invitation attempt. Its
  // provider outcome cannot safely determine whether this company should exist.
  await audit({
    actor: { userId: user.id },
    action: "lead.qualified",
    entityType: "lead",
    entityId: leadId,
    before: { status: lead.status, company_id: null },
    after: { status: "Qualified", company_id: company.id },
  });
  await audit({
    actor: { userId: user.id },
    action: "company.created_from_lead",
    entityType: "company",
    entityId: company.id,
    after: { legal_name: input.legal_name, abn, status: "Pending", lead_id: leadId },
  });

  // Clerk creates the user only when the invitation is accepted. The invitation's
  // backend-controlled company metadata is bound to company_user on first sign-in.
  // The helper's `ok: false` also covers a lost response after provider acceptance;
  // preserve this company and lead link for reconciliation, never compensate or retry.
  let invited: Awaited<ReturnType<typeof inviteAdministrator>>;
  try {
    invited = await inviteAdministrator(input.contact_email, company.id);
  } catch {
    redirect(`${back}&error=qualification_invitation_unconfirmed`);
  }
  if (!invited.ok) redirect(`${back}&error=qualification_invitation_unconfirmed`);

  await audit({
    actor: { userId: user.id },
    action: "company_user.invited",
    entityType: "company_user",
    entityId: input.contact_email,
    after: { company_id: company.id, email: input.contact_email, first_administrator: true },
  });

  await notify({
    trigger: NOTIFICATION_TRIGGERS.ADMIN_INVITATION,
    to: input.contact_email,
    subject: "Your company account on Maintain Workforce",
    body: `Maintain has set up ${input.legal_name}. Clerk has emailed a secure link to finish joining.`,
    companyId: company.id,
    entityType: "company",
    entityId: company.id,
  });

  redirect(`/admin/leads?lead=${leadId}&saved=qualified`);
}

/** 0.3 — Contacted → Disqualified, with the reason retained and audited. */
export async function disqualifyLead(formData: FormData): Promise<void> {
  const user = await requireMaintainAdmin();
  const parsedId = z.string().uuid().safeParse(formData.get("lead_id"));
  if (!parsedId.success) redirect("/admin/leads?error=invalid");
  const leadId = parsedId.data;
  const back = `/admin/leads?lead=${leadId}`;
  const parsedReason = z.string().trim().min(4).safeParse(formData.get("reason"));
  if (!parsedReason.success) redirect(`${back}&error=reason_required`);
  const reason = parsedReason.data;

  const admin = createAdminClient();
  const { data: lead, error: readError } = await admin
    .from("lead").select("id, status, company_id, disqualified_reason").eq("id", leadId).maybeSingle();
  if (readError) redirect(`${back}&error=status_update_failed`);
  if (!lead) redirect("/admin/leads?error=not_found");
  if (lead.company_id !== null) redirect(`${back}&error=already_qualified`);
  if (lead.status !== "Contacted") redirect(`${back}&error=not_contacted`);

  let update = admin
    .from("lead")
    .update({ status: "Disqualified" satisfies LeadStatus, disqualified_reason: reason })
    .eq("id", leadId)
    .eq("status", lead.status)
    .is("company_id", null);
  update = lead.disqualified_reason === null
    ? update.is("disqualified_reason", null)
    : update.eq("disqualified_reason", lead.disqualified_reason);
  const { data: after, error: updateError } = await update.select("status, disqualified_reason").maybeSingle();
  if (updateError) redirect(`${back}&error=status_update_failed`);
  if (!after) redirect(`${back}&error=status_changed`);

  await audit({
    actor: { userId: user.id },
    action: "lead.disqualified",
    entityType: "lead",
    entityId: leadId,
    before: { status: lead.status, disqualified_reason: lead.disqualified_reason },
    after,
  });

  redirect(`/admin/leads?lead=${leadId}&saved=disqualified`);
}

/** Shared by the Leads queue filter (0.4) so the option list and the query cannot drift. */
export async function leadFilterOptions(): Promise<{
  intents: LeadIntent[];
  statuses: LeadStatus[];
}> {
  return {
    intents: LEAD_INTENTS,
    statuses: ["New", "Contacted", "Qualified", "Disqualified"],
  };
}
