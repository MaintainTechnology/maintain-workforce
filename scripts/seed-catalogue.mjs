#!/usr/bin/env node
// 23.1 — the catalogue (industries, trades, skills, qualifications, proficiency
// mappings), rate bands, regions and public holidays are founder-supplied
// spreadsheets loaded by this idempotent, re-runnable script. Admin UIs maintain
// them afterwards; this is only the initial load. 23.2 — no trade name lives in
// code: everything comes from the CSVs in the directory you point it at.
//
//   node scripts/seed-catalogue.mjs seed-data/
//
// Expected files (any may be absent; present ones load in this order):
//   industries.csv                  name
//   regions.csv                     name
//   proficiencies.csv               name,rank
//   qualifications.csv              name
//   trade_roles.csv                 industry,name
//   skills.csv                      industry,trade_role,name
//   trade_role_proficiencies.csv    industry,trade_role,proficiency
//   trade_role_qualifications.csv   industry,trade_role,qualification,level,is_mandatory
//   rate_bands.csv                  industry,trade_role,proficiency,region,band_low_cents,band_high_cents,effective_from
//   public_holidays.csv             date,name,region        (region optional per row)
//
// Idempotency: every load is an upsert on the table's natural key, so re-running
// with the same files changes nothing and re-running with corrected files updates
// in place. Rows are never deleted here — 4.3 retirement is an admin-UI concern.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: node scripts/seed-catalogue.mjs <directory-of-csvs> (or --self-test)");
  process.exit(1);
}

// The parser is the one piece with edge cases; --self-test proves it without a database.
if (dir === "--self-test") {
  const assert = (cond, msg) => { if (!cond) { console.error(`self-test failed: ${msg}`); process.exit(1); } };
  const rows = parseCsv('name,rank\n"Roof, Metal",1\n"He said ""go""",2\r\n\n skipped-blank ,3\n');
  assert(rows.length === 3, "row count");
  assert(rows[0].name === "Roof, Metal" && rows[0].rank === "1", "quoted comma");
  assert(rows[1].name === 'He said "go"', "escaped quote");
  assert(rows[2].name === "skipped-blank", "trimmed field after CRLF+blank line");
  console.log("self-test passed");
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

/** Minimal RFC-4180 CSV parse: quoted fields, embedded commas/quotes/newlines. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);

  const header = rows.shift()?.map((h) => h.trim().toLowerCase()) ?? [];
  return rows.map((cells) =>
    Object.fromEntries(header.map((name, i) => [name, (cells[i] ?? "").trim()])),
  );
}

async function loadFile(name) {
  try {
    return parseCsv(await readFile(join(dir, name), "utf8"));
  } catch {
    return null; // absent file = skip that section
  }
}

function required(record, file, ...fields) {
  for (const f of fields) {
    if (!record[f]) throw new Error(`${file}: a row is missing required column "${f}"`);
  }
}

async function upsert(table, rows, onConflict) {
  if (rows.length === 0) return;
  const { error } = await admin.from(table).upsert(rows, { onConflict });
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`  ${table}: ${rows.length} rows upserted`);
}

/** name -> id map for a whole catalogue table. */
async function idMap(table, key = "name") {
  const { data, error } = await admin.from(table).select(`id, ${key}`);
  if (error) throw new Error(`${table}: ${error.message}`);
  return new Map(data.map((r) => [r[key], r.id]));
}

function resolve(map, value, table, file) {
  const id = map.get(value);
  if (!id) throw new Error(`${file}: "${value}" is not a loaded ${table}`);
  return id;
}

// Trade roles are unique per (industry, name), so cross-file references use the
// "industry / trade_role" pair, keyed here as a single string.
const tradeKey = (industryId, name) => `${industryId}::${name}`;

async function main() {
  console.log(`Loading catalogue from ${dir}`);

  const industries = await loadFile("industries.csv");
  if (industries) {
    industries.forEach((r) => required(r, "industries.csv", "name"));
    await upsert("industry", industries.map((r) => ({ name: r.name })), "name");
  }

  const regions = await loadFile("regions.csv");
  if (regions) {
    regions.forEach((r) => required(r, "regions.csv", "name"));
    await upsert("region", regions.map((r) => ({ name: r.name })), "name");
  }

  const proficiencies = await loadFile("proficiencies.csv");
  if (proficiencies) {
    proficiencies.forEach((r) => required(r, "proficiencies.csv", "name", "rank"));
    await upsert(
      "proficiency",
      proficiencies.map((r) => ({ name: r.name, rank: Number(r.rank) })),
      "name",
    );
  }

  const qualifications = await loadFile("qualifications.csv");
  if (qualifications) {
    qualifications.forEach((r) => required(r, "qualifications.csv", "name"));
    await upsert("qualification", qualifications.map((r) => ({ name: r.name })), "name");
  }

  const industryIds = await idMap("industry");
  const regionIds = await idMap("region");
  const proficiencyIds = await idMap("proficiency");
  const qualificationIds = await idMap("qualification");

  const tradeRoles = await loadFile("trade_roles.csv");
  if (tradeRoles) {
    tradeRoles.forEach((r) => required(r, "trade_roles.csv", "industry", "name"));
    await upsert(
      "trade_role",
      tradeRoles.map((r) => ({
        industry_id: resolve(industryIds, r.industry, "industry", "trade_roles.csv"),
        name: r.name,
      })),
      "industry_id,name",
    );
  }

  const { data: tradeRows, error: tradeError } = await admin
    .from("trade_role")
    .select("id, industry_id, name");
  if (tradeError) throw new Error(`trade_role: ${tradeError.message}`);
  const tradeIds = new Map(tradeRows.map((r) => [tradeKey(r.industry_id, r.name), r.id]));

  const resolveTrade = (record, file) =>
    resolve(
      tradeIds,
      tradeKey(resolve(industryIds, record.industry, "industry", file), record.trade_role),
      "trade_role",
      file,
    );

  const skills = await loadFile("skills.csv");
  if (skills) {
    skills.forEach((r) => required(r, "skills.csv", "industry", "trade_role", "name"));
    await upsert(
      "skill",
      skills.map((r) => ({ trade_role_id: resolveTrade(r, "skills.csv"), name: r.name })),
      "trade_role_id,name",
    );
  }

  const trp = await loadFile("trade_role_proficiencies.csv");
  if (trp) {
    trp.forEach((r) =>
      required(r, "trade_role_proficiencies.csv", "industry", "trade_role", "proficiency"),
    );
    await upsert(
      "trade_role_proficiency",
      trp.map((r) => ({
        trade_role_id: resolveTrade(r, "trade_role_proficiencies.csv"),
        proficiency_id: resolve(proficiencyIds, r.proficiency, "proficiency", "trade_role_proficiencies.csv"),
      })),
      "trade_role_id,proficiency_id",
    );
  }

  const trq = await loadFile("trade_role_qualifications.csv");
  if (trq) {
    trq.forEach((r) =>
      required(r, "trade_role_qualifications.csv", "industry", "trade_role", "qualification", "level"),
    );
    await upsert(
      "trade_role_qualification",
      trq.map((r) => {
        if (r.level !== "worker" && r.level !== "company")
          throw new Error(`trade_role_qualifications.csv: level must be worker or company, got "${r.level}"`);
        return {
          trade_role_id: resolveTrade(r, "trade_role_qualifications.csv"),
          qualification_id: resolve(qualificationIds, r.qualification, "qualification", "trade_role_qualifications.csv"),
          level: r.level,
          is_mandatory: r.is_mandatory.toLowerCase() === "true",
        };
      }),
      "trade_role_id,qualification_id,level",
    );
  }

  const rateBands = await loadFile("rate_bands.csv");
  if (rateBands) {
    rateBands.forEach((r) =>
      required(
        r, "rate_bands.csv",
        "industry", "trade_role", "proficiency", "region",
        "band_low_cents", "band_high_cents", "effective_from",
      ),
    );
    await upsert(
      "rate_band",
      rateBands.map((r) => ({
        trade_role_id: resolveTrade(r, "rate_bands.csv"),
        proficiency_id: resolve(proficiencyIds, r.proficiency, "proficiency", "rate_bands.csv"),
        region_id: resolve(regionIds, r.region, "region", "rate_bands.csv"),
        band_low_cents: Number(r.band_low_cents),
        band_high_cents: Number(r.band_high_cents),
        effective_from: r.effective_from,
      })),
      "trade_role_id,proficiency_id,region_id,effective_from",
    );
  }

  const holidays = await loadFile("public_holidays.csv");
  if (holidays) {
    holidays.forEach((r) => required(r, "public_holidays.csv", "date", "name"));
    await upsert(
      "public_holiday",
      holidays.map((r) => ({
        holiday_date: r.date,
        name: r.name,
        region_id: r.region ? resolve(regionIds, r.region, "region", "public_holidays.csv") : null,
      })),
      "holiday_date",
    );
  }

  console.log("Catalogue load complete. Re-running with the same files is a no-op.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
