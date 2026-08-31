import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260828000700_optional_company_abn.sql",
  ),
  "utf8",
);

describe("optional company ABN database contract", () => {
  it("allows null while preserving uniqueness and checksum validation when supplied", () => {
    expect(migration).toMatch(/alter column abn drop not null/i);
    expect(migration).toContain("company_abn_valid");
    expect(migration).toMatch(/when abn is null then true/i);
    expect(migration).toMatch(/abn !~ '\^\[0-9\]\{11\}\$'/);
    expect(migration).toMatch(/mod\([\s\S]*89[\s\S]*\) = 0/);
    expect(migration).not.toMatch(/drop constraint company_abn_key/i);
  });

  it("normalises an empty RPC value to null before company creation", () => {
    expect(migration).toMatch(/v_abn text := nullif\(trim\(p_abn\), ''\)/i);
    expect(migration).toMatch(/insert into company[\s\S]*?values \([\s\S]*?v_abn,/i);
  });
});
