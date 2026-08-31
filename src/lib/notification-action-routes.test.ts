import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  companyDocumentNotificationTargets,
  transferEscalationNotificationTargets,
  workerQualificationNotificationTargets,
} from "./cron";

const root = join(process.cwd(), "src", "app");

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? filesBelow(path) : [path];
    });
}

function implementedPageRoutes(): string[] {
  return [
    filesBelow(root)
      .filter((path) => path.endsWith(`${sep}page.tsx`))
      .map((path) => relative(root, path).split(sep))
      .map((segments) => segments.filter((segment) => !/^\(.+\)$/.test(segment)))
      .map((segments) => segments.slice(0, -1))
      .map((segments) => `/${segments.join("/")}`.replace(/\/$/, "") || "/"),
  ].flat().sort();
}

function routeMatches(target: string, pagePattern: string): boolean {
  const targetSegments = target.split("/").filter(Boolean);
  const pageSegments = pagePattern.split("/").filter(Boolean);

  for (let index = 0; index < pageSegments.length; index += 1) {
    const pageSegment = pageSegments[index];
    if (/^\[\[\.\.\..+\]\]$/.test(pageSegment)) return true;
    if (/^\[\.\.\..+\]$/.test(pageSegment)) {
      return targetSegments.length > index;
    }
    if (index >= targetSegments.length) return false;
    if (/^\[[^\]]+\]$/.test(pageSegment)) continue;
    if (pageSegment !== targetSegments[index]) return false;
  }

  return targetSegments.length === pageSegments.length;
}

type ActionTarget = { file: string; path: string; raw: string };

function productionActionTargets(): ActionTarget[] {
  const sourceRoot = join(process.cwd(), "src");
  const productionFiles = filesBelow(sourceRoot).filter(
    (path) =>
      /\.tsx?$/.test(path) &&
      !/\.(?:test|spec)\.tsx?$/.test(path) &&
      readFileSync(path, "utf8").includes("actionPath:"),
  );

  return productionFiles
    .flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return [...source.matchAll(/actionPath:\s*(?:"([^"]+)"|`([^`]+)`)/g)].map((match) => {
        const raw = match[1] ?? match[2];
        const path = raw.split("?")[0].replace(/\$\{[^}]+\}/g, "__dynamic__");
        return { file: relative(process.cwd(), file).split(sep).join("/"), path, raw };
      });
    })
    .sort((left, right) =>
      `${left.file}:${left.raw}`.localeCompare(`${right.file}:${right.raw}`),
    );
}

describe("notification action routes", () => {
  it("scans every production caller, including cron and template-literal deep links", () => {
    const targets = productionActionTargets();

    expect(targets.some((target) => target.file === "src/lib/cron.ts")).toBe(true);
    expect(targets.some((target) => target.raw.includes("${"))).toBe(true);
  });

  it("backs static and dynamic actionPath targets with an implemented Next page", () => {
    const routes = implementedPageRoutes();
    const unresolved = productionActionTargets()
      .filter((target) => !routes.some((route) => routeMatches(target.path, route)))
      .map((target) => `${target.file}: ${target.raw}`)
      .sort();

    expect(unresolved).toEqual([]);
  });

  it("routes company-document notices by recipient posture", () => {
    expect(
      companyDocumentNotificationTargets({
        companyId: "company-1",
        companyEmail: "company@example.com",
        maintainEmail: "maintain@example.com",
      }),
    ).toEqual([
      {
        to: "company@example.com",
        companyId: "company-1",
        actionPath: "/app/settings",
      },
      {
        to: "maintain@example.com",
        companyId: null,
        actionPath: "/admin/companies",
      },
    ]);
  });

  it("routes worker-qualification notices by recipient posture", () => {
    expect(
      workerQualificationNotificationTargets({
        companyId: "company-1",
        companyEmail: "company@example.com",
        maintainEmail: "maintain@example.com",
      }),
    ).toEqual([
      {
        to: "company@example.com",
        companyId: "company-1",
        actionPath: "/app/workers",
      },
      {
        to: "maintain@example.com",
        companyId: null,
        actionPath: "/admin/workers",
      },
    ]);
  });

  it("routes transfer-escalation notices by recipient posture", () => {
    expect(
      transferEscalationNotificationTargets({
        companies: [
          { companyId: "to-company", email: "to@example.com" },
          { companyId: "from-company", email: "from@example.com" },
        ],
        maintainEmail: "maintain@example.com",
      }),
    ).toEqual([
      {
        to: "to@example.com",
        companyId: "to-company",
        actionPath: "/app/transfers",
      },
      {
        to: "from@example.com",
        companyId: "from-company",
        actionPath: "/app/transfers",
      },
      {
        to: "maintain@example.com",
        companyId: null,
        actionPath: "/admin/transfers",
      },
    ]);
  });
});
