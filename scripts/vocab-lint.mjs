#!/usr/bin/env node
// Vocabulary lint — spec 22.1. Runs as a blocking step in the deploy pipeline.
//
// The guardrail this enforces is legal, not stylistic: documents and code are
// discoverable, and language that describes Maintain as supplying labour is evidence
// that the model is labour hire in substance. Word-boundary matching with an explicit
// allowlist, so the test is executable and passable against compliant copy.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

// Scope. Everything is enforced except the pre-existing marketing site, which is
// listed explicitly below and linted in report mode — so any new platform file is
// covered automatically, and the exceptions stay visible rather than implied.
//
// Why the marketing site is excepted: rewriting it is outside this spec's scope, and
// much of what trips the lint there is the customer one-pager's own contrastive
// positioning ("Is this labour hire?" answered "No…"), which is approved copy.
const ROOTS = ["src", "supabase", "emails"];
const LEGACY_MARKETING = [
  "src/app/page.tsx",
  "src/app/about/page.tsx",
  "src/app/contact/page.tsx",
  "src/app/legal/privacy/page.tsx",
  "src/app/legal/terms/page.tsx",
  "src/lib/content.ts",
  "src/lib/site.ts",
  "src/lib/actions.ts",
  "src/components/exchange-ledger.tsx",
];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".sql", ".md", ".json", ".css"]);

// Phrases that may contain a banned word but are themselves approved or unavoidable.
const ALLOWLIST = [
  "hiring business",   // 22.1 approved register
  "supplying business",
  "labour-hire licence", // statutory carve-out: a statute's name cannot be paraphrased
  "labour_hire_licence",
  "lh_licence",
  "labour day", // a Queensland public holiday (8.3 seed data) — a proper noun, not the offering
  // The one-pager's own contrastive positioning: naming what Maintain is not.
  "not labour hire",
  "isn't labour hire",
  "is not labour hire",
  "never labour hire",
];

const BANNED = [
  { pattern: /\blabour[\s-]?hire\b/gi, note: 'use "capacity" or name the statutory licence' },
  { pattern: /\bhire\b/gi, note: 'the offering is capacity; "hiring business" is the approved term' },
  { pattern: /\bstaff supply\b/gi, note: "Maintain never supplies staff" },
  { pattern: /\bunder the umbrella\b/gi, note: "implies employment by Maintain" },
  { pattern: /\blabour\b/gi, note: 'the offering is "capacity", not "labour"' },
];

// This file necessarily contains the banned terms it screens for.
const SELF = "scripts/vocab-lint.mjs";
// The spec and its evaluations quote the rule and the planning record verbatim.
const EXEMPT_PREFIXES = ["specs/", "docs/"];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTENSIONS.has(extname(full))) out.push(full);
  }
  return out;
}

function maskAllowed(line) {
  let masked = line;
  for (const phrase of ALLOWLIST) {
    masked = masked.replaceAll(new RegExp(escape(phrase), "gi"), "~".repeat(phrase.length));
  }
  return masked;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function scan(roots) {
  const found = [];
  const seen = new Set();
  for (const root of roots) {
    for (const file of walk(root)) {
      const relative = file.split("\\").join("/");
      if (relative === SELF || seen.has(relative)) continue;
      seen.add(relative);
      if (EXEMPT_PREFIXES.some((prefix) => relative.startsWith(prefix))) continue;

      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        const masked = maskAllowed(line);
        for (const { pattern, note } of BANNED) {
          pattern.lastIndex = 0;
          const match = pattern.exec(masked);
          if (match) found.push({ file: relative, line: index + 1, term: match[0], note });
        }
      });
    }
  }
  return found;
}

const all = scan(ROOTS);
const enforced = all.filter((v) => !LEGACY_MARKETING.includes(v.file));
const reported = all.filter((v) => LEGACY_MARKETING.includes(v.file));

if (reported.length > 0) {
  console.warn(
    `Marketing copy: ${reported.length} occurrence(s) outside this spec's scope (report only).`,
  );
  for (const v of reported.slice(0, 5)) {
    console.warn(`  ${v.file}:${v.line}  "${v.term}"`);
  }
  if (reported.length > 5) console.warn(`  …and ${reported.length - 5} more.`);
}

if (enforced.length > 0) {
  console.error(`\nVocabulary lint failed — ${enforced.length} violation(s) of spec 22.1:\n`);
  for (const v of enforced) {
    console.error(`  ${v.file}:${v.line}  "${v.term}" — ${v.note}`);
  }
  console.error("\nApproved register: capacity, crew, supplying business, hiring business.");
  process.exit(1);
}

console.log("Vocabulary lint passed — no banned terms in platform copy, templates or identifiers.");
