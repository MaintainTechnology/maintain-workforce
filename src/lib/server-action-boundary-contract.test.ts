import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = join(process.cwd(), "src");
const internalOnlyFunctions = [
  "createEngagementForMatch",
  "enforceCrewMinimum",
  "notifyWorkerStatusKnockouts",
  "runWorkerKnockouts",
] as const;

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function exportedNames(moduleSource: string): Set<string> {
  const names = new Set<string>();

  for (const match of moduleSource.matchAll(
    /\bexport\s+(?:declare\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g,
  )) {
    names.add(match[1]);
  }

  for (const match of moduleSource.matchAll(/\bexport\s*\{([^}]+)\}/g)) {
    for (const specifier of match[1].split(",")) {
      const identifiers = specifier.trim().split(/\s+as\s+/);
      const exportedName = identifiers.at(-1)?.trim();
      if (exportedName) names.add(exportedName);
    }
  }

  return names;
}

describe("server action boundary", () => {
  it("does not expose trusted service-role orchestrators from any use-server module", () => {
    const exposed = filesBelow(sourceRoot)
      .filter((path) => /\.tsx?$/.test(path) && !/\.(?:test|spec)\.tsx?$/.test(path))
      .map((path) => ({ path, moduleSource: readFileSync(path, "utf8") }))
      .filter(({ moduleSource }) => /^\s*["']use server["'];/.test(moduleSource))
      .flatMap(({ path, moduleSource }) => {
        const names = exportedNames(moduleSource);
        return internalOnlyFunctions
          .filter((name) => names.has(name))
          .map((name) => `${relative(process.cwd(), path).split(sep).join("/")}: ${name}`);
      })
      .sort();

    expect(exposed).toEqual([]);
  }, 30_000);

  it("marks the orchestration modules server-only and keeps callers on those boundaries", () => {
    const matchOrchestration = source("src/lib/match-orchestration.ts");
    const transferOrchestration = source("src/lib/transfer-orchestration.ts");
    for (const moduleSource of [matchOrchestration, transferOrchestration]) {
      expect(moduleSource).toMatch(/^\s*import ["']server-only["'];/);
      expect(moduleSource).not.toMatch(/^\s*["']use server["'];/m);
    }

    expect(exportedNames(matchOrchestration)).toContain("notifyWorkerStatusKnockouts");
    expect(matchOrchestration).not.toMatch(/\.from\("(?:match|match_worker)"\)\s*\.(?:insert|update|delete)/);

    expect(source("src/lib/actions/match.ts")).toContain('from "@/lib/match-orchestration"');
    expect(source("src/lib/actions/match.ts")).toContain('.rpc("accept_match_as_buyer"');
    expect(source("src/lib/actions/match.ts")).not.toContain("createEngagementForMatch");
    expect(source("src/lib/actions/transfer.ts")).toContain('from "@/lib/transfer-orchestration"');
    expect(source("src/lib/actions/worker.ts")).toContain('from "@/lib/match-orchestration"');
    expect(source("src/lib/cron.ts")).toContain('.rpc("run_daily_state_transitions"');
    expect(source("src/lib/cron.ts")).not.toContain('from "@/lib/match-orchestration"');
  });
});
