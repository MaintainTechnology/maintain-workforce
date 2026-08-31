"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMaintainAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";

// Catalogue administration — spec module 4.
//
// 4.1: Industry → TradeRole → Skill, plus Qualification, Proficiency and Region are
// Maintain-administered reference data, and adding or editing any of them requires no
// deployment. Everything below is therefore a data write, never a code change.
//
// 4.3: catalogue items are never hard-deleted once referenced. There is deliberately no
// delete action in this file — only is_active, which hides an item from new data entry
// while it stays on the records and history that already reference it.
//
// 23.2: nothing here names a trade. The catalogue's content is founder-supplied and
// arrives through the seed script; these actions are how it is maintained afterwards.

const BASE_PATH = "/admin/catalogue";

/** The tables these generic actions may touch. An allowlist, not a parameter: the
 *  table name arrives in a form post, and a crafted post must not reach `company`. */
const CATALOGUE_TABLES = [
  "industry",
  "region",
  "proficiency",
  "trade_role",
  "skill",
  "qualification",
] as const;

const tableSchema = z.enum(CATALOGUE_TABLES);
const idSchema = z.string().uuid();
const nameSchema = z.string().trim().min(2, "A name needs at least two characters.").max(120);

/** Where to send the admin back to, preserving whichever trade they were editing. */
function returnTo(formData: FormData): string {
  const raw = String(formData.get("return_to") ?? BASE_PATH);
  // Only same-app paths: an open redirect out of an admin form is not a feature.
  return raw.startsWith("/admin") ? raw : BASE_PATH;
}

function finish(path: string, params: { ok?: string; error?: string }): never {
  const [base, existing] = path.split("?");
  const search = new URLSearchParams(existing);
  search.delete("ok");
  search.delete("error");
  if (params.ok) search.set("ok", params.ok);
  if (params.error) search.set("error", params.error);
  revalidatePath(base);
  const query = search.toString();
  redirect(query ? `${base}?${query}` : base);
}

/* --------------------------------------------------------------- 4.1 create ---- */

export async function createIndustry(formData: FormData): Promise<void> {
  const actor = await requireMaintainAdmin();
  const back = returnTo(formData);
  const name = nameSchema.safeParse(formData.get("name"));
  if (!name.success) finish(back, { error: name.error.issues[0].message });

  const db = createAdminClient();
  const { data, error } = await db
    .from("industry")
    .insert({ name: name.data })
    .select("id, name")
    .single();
  if (error) finish(back, { error: error.message });

  await audit({
    actor: { userId: actor.id },
    action: "catalogue.industry_created",
    entityType: "industry",
    entityId: data.id,
    after: data,
  });
  finish(back, { ok: `Industry "${name.data}" added.` });
}

export async function createTradeRole(formData: FormData): Promise<void> {
  const actor = await requireMaintainAdmin();
  const back = returnTo(formData);
  const parsed = z
    .object({ industry_id: idSchema, name: nameSchema })
    .safeParse({ industry_id: formData.get("industry_id"), name: formData.get("name") });
  if (!parsed.success) finish(back, { error: parsed.error.issues[0].message });

  const db = createAdminClient();
  const { data, error } = await db
    .from("trade_role")
    .insert(parsed.data)
    .select("id, name, industry_id")
    .single();
  if (error) finish(back, { error: error.message });

  await audit({
    actor: { userId: actor.id },
    action: "catalogue.trade_role_created",
    entityType: "trade_role",
    entityId: data.id,
    after: data,
  });
  finish(back, { ok: "Trade added." });
}

export async function createSkill(formData: FormData): Promise<void> {
  const actor = await requireMaintainAdmin();
  const back = returnTo(formData);
  const parsed = z
    .object({ trade_role_id: idSchema, name: nameSchema })
    .safeParse({ trade_role_id: formData.get("trade_role_id"), name: formData.get("name") });
  if (!parsed.success) finish(back, { error: parsed.error.issues[0].message });

  const db = createAdminClient();
  const { data, error } = await db
    .from("skill")
    .insert(parsed.data)
    .select("id, name, trade_role_id")
    .single();
  if (error) finish(back, { error: error.message });

  await audit({
    actor: { userId: actor.id },
    action: "catalogue.skill_created",
    entityType: "skill",
    entityId: data.id,
    after: data,
  });
  finish(back, { ok: "Skill added." });
}

export async function createQualification(formData: FormData): Promise<void> {
  const actor = await requireMaintainAdmin();
  const back = returnTo(formData);
  const name = nameSchema.safeParse(formData.get("name"));
  if (!name.success) finish(back, { error: name.error.issues[0].message });

  const db = createAdminClient();
  const { data, error } = await db
    .from("qualification")
    .insert({ name: name.data })
    .select("id, name")
    .single();
  if (error) finish(back, { error: error.message });

  await audit({
    actor: { userId: actor.id },
    action: "catalogue.qualification_created",
    entityType: "qualification",
    entityId: data.id,
    after: data,
  });
  finish(back, { ok: "Qualification added." });
}

/**
 * 4.5 — proficiency rows carry a rank integer (Apprentice < Junior < Mid < Senior) that
 * drives the 11.1 "include higher proficiency" toggle. The rank is the ordering the
 * matching workspace reasons about, so it is required, not optional.
 */
export async function createProficiency(formData: FormData): Promise<void> {
  const actor = await requireMaintainAdmin();
  const back = returnTo(formData);
  const parsed = z
    .object({ name: nameSchema, rank: z.coerce.number().int().min(1).max(99) })
    .safeParse({ name: formData.get("name"), rank: formData.get("rank") });
  if (!parsed.success) finish(back, { error: parsed.error.issues[0].message });

  const db = createAdminClient();
  const { data, error } = await db
    .from("proficiency")
    .insert(parsed.data)
    .select("id, name, rank")
    .single();
  if (error) finish(back, { error: error.message });

  await audit({
    actor: { userId: actor.id },
    action: "catalogue.proficiency_created",
    entityType: "proficiency",
    entityId: data.id,
    after: data,
  });
  finish(back, { ok: "Proficiency added." });
}

/** 4.4 — the MVP ships with one region; the table exists so more are added as data. */
export async function createRegion(formData: FormData): Promise<void> {
  const actor = await requireMaintainAdmin();
  const back = returnTo(formData);
  const name = nameSchema.safeParse(formData.get("name"));
  if (!name.success) finish(back, { error: name.error.issues[0].message });

  const db = createAdminClient();
  const { data, error } = await db
    .from("region")
    .insert({ name: name.data })
    .select("id, name")
    .single();
  if (error) finish(back, { error: error.message });

  await audit({
    actor: { userId: actor.id },
    action: "catalogue.region_created",
    entityType: "region",
    entityId: data.id,
    after: data,
  });
  finish(back, { ok: "Region added." });
}

/* --------------------------------------------------------------- 4.1/4.3 edit ---- */

export async function renameCatalogueItem(formData: FormData): Promise<void> {
  const actor = await requireMaintainAdmin();
  const back = returnTo(formData);
  const parsed = z
    .object({ table: tableSchema, id: idSchema, name: nameSchema })
    .safeParse({
      table: formData.get("table"),
      id: formData.get("id"),
      name: formData.get("name"),
    });
  if (!parsed.success) finish(back, { error: parsed.error.issues[0].message });

  const db = createAdminClient();
  const { data: before, error: readError } = await db
    .from(parsed.data.table)
    .select("id, name")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (readError) finish(back, { error: "The catalogue item could not be loaded. Try again." });
  if (!before) finish(back, { error: "That catalogue item no longer exists." });
  if (before.name === parsed.data.name) finish(back, { ok: "No change was needed." });

  const { data: after, error } = await db
    .from(parsed.data.table)
    .update({ name: parsed.data.name })
    .eq("id", parsed.data.id)
    .eq("name", before.name)
    .select("id, name")
    .maybeSingle();
  if (error) finish(back, { error: error.message });
  if (!after) finish(back, { error: "This item changed or is no longer available. Review it before trying again." });

  await audit({
    actor: { userId: actor.id },
    action: `catalogue.${parsed.data.table}_renamed`,
    entityType: parsed.data.table,
    entityId: parsed.data.id,
    before,
    after,
  });
  finish(back, { ok: "Renamed." });
}

/**
 * 4.3 — the only "removal" a catalogue item ever gets. An inactive item is hidden from
 * new data entry and stays on every record and history row that already references it,
 * so a retired trade never orphans a worker's classification.
 */
export async function setCatalogueItemActive(formData: FormData): Promise<void> {
  const actor = await requireMaintainAdmin();
  const back = returnTo(formData);
  const parsed = z
    .object({ table: tableSchema, id: idSchema, is_active: z.enum(["true", "false"]) })
    .safeParse({
      table: formData.get("table"),
      id: formData.get("id"),
      is_active: formData.get("is_active"),
    });
  if (!parsed.success) finish(back, { error: parsed.error.issues[0].message });

  const isActive = parsed.data.is_active === "true";
  const db = createAdminClient();
  const { data: before, error: readError } = await db
    .from(parsed.data.table)
    .select("id, is_active")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (readError) finish(back, { error: "The catalogue item could not be loaded. Try again." });
  if (!before) finish(back, { error: "That catalogue item no longer exists." });
  if (before.is_active === isActive) finish(back, { ok: "No change was needed." });

  const { data: after, error } = await db
    .from(parsed.data.table)
    .update({ is_active: isActive })
    .eq("id", parsed.data.id)
    .eq("is_active", before.is_active)
    .select("id, is_active")
    .maybeSingle();
  if (error) finish(back, { error: error.message });
  if (!after) finish(back, { error: "This item changed or is no longer available. Review it before trying again." });

  await audit({
    actor: { userId: actor.id },
    action: `catalogue.${parsed.data.table}_${isActive ? "reactivated" : "deactivated"}`,
    entityType: parsed.data.table,
    entityId: parsed.data.id,
    before,
    after,
  });
  finish(back, { ok: isActive ? "Reactivated." : "Hidden from new entry." });
}

/* ------------------------------------------------------------------ 4.2 join ---- */

/**
 * 4.2 — the TradeRoleProficiency join defines which proficiency levels each trade
 * supports; worker classification, demand lines and rate bands may only use combinations
 * present in it.
 *
 * Removing a mapping is a plain delete rather than a soft flag: unlike a catalogue item
 * (4.3), a mapping is not referenced by any row — it constrains what new rows may say.
 * Records already carrying the combination keep it.
 */
export async function setTradeProficiency(formData: FormData): Promise<void> {
  const actor = await requireMaintainAdmin();
  const back = returnTo(formData);
  const parsed = z
    .object({
      trade_role_id: idSchema,
      proficiency_id: idSchema,
      enabled: z.enum(["true", "false"]),
    })
    .safeParse({
      trade_role_id: formData.get("trade_role_id"),
      proficiency_id: formData.get("proficiency_id"),
      enabled: formData.get("enabled"),
    });
  if (!parsed.success) finish(back, { error: parsed.error.issues[0].message });

  const { trade_role_id, proficiency_id } = parsed.data;
  const enabled = parsed.data.enabled === "true";
  const db = createAdminClient();

  const { error } = enabled
    ? await db.from("trade_role_proficiency").upsert({ trade_role_id, proficiency_id })
    : await db
        .from("trade_role_proficiency")
        .delete()
        .eq("trade_role_id", trade_role_id)
        .eq("proficiency_id", proficiency_id);
  if (error) finish(back, { error: error.message });

  await audit({
    actor: { userId: actor.id },
    action: `catalogue.trade_proficiency_${enabled ? "added" : "removed"}`,
    entityType: "trade_role_proficiency",
    entityId: trade_role_id,
    after: { trade_role_id, proficiency_id, enabled },
  });
  finish(back, { ok: enabled ? "Proficiency enabled for this trade." : "Proficiency removed." });
}

/**
 * 4.5 — mandatory credentials are data, not code. A worker-level mandatory row defines
 * "expired mandatory qualification" (7.2) for that trade; a company-level mandatory row
 * names the CompanyDocument type that "a licence required for its trades" (1.6) means.
 * Both rules are computed from these rows, which is why the level is required and the
 * mandatory flag is set here rather than inferred anywhere in code.
 */
export async function setTradeQualification(formData: FormData): Promise<void> {
  const actor = await requireMaintainAdmin();
  const back = returnTo(formData);
  const parsed = z
    .object({
      trade_role_id: idSchema,
      qualification_id: idSchema,
      level: z.enum(["worker", "company"]),
      is_mandatory: z.enum(["true", "false"]),
      enabled: z.enum(["true", "false"]),
    })
    .safeParse({
      trade_role_id: formData.get("trade_role_id"),
      qualification_id: formData.get("qualification_id"),
      level: formData.get("level"),
      is_mandatory: formData.get("is_mandatory") ?? "false",
      enabled: formData.get("enabled"),
    });
  if (!parsed.success) finish(back, { error: parsed.error.issues[0].message });

  const { trade_role_id, qualification_id, level } = parsed.data;
  const isMandatory = parsed.data.is_mandatory === "true";
  const enabled = parsed.data.enabled === "true";
  const db = createAdminClient();

  const { error } = enabled
    ? await db
        .from("trade_role_qualification")
        .upsert(
          { trade_role_id, qualification_id, level, is_mandatory: isMandatory },
          { onConflict: "trade_role_id,qualification_id,level" },
        )
    : await db
        .from("trade_role_qualification")
        .delete()
        .eq("trade_role_id", trade_role_id)
        .eq("qualification_id", qualification_id)
        .eq("level", level);
  if (error) finish(back, { error: error.message });

  await audit({
    actor: { userId: actor.id },
    action: `catalogue.trade_qualification_${enabled ? "set" : "removed"}`,
    entityType: "trade_role_qualification",
    entityId: trade_role_id,
    after: { trade_role_id, qualification_id, level, is_mandatory: isMandatory, enabled },
  });
  finish(back, {
    ok: enabled
      ? `Qualification ${isMandatory ? "made mandatory" : "marked optional"} at ${level} level.`
      : "Qualification mapping removed.",
  });
}
