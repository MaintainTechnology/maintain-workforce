import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = join(process.cwd(), "scripts/check-client-secrets.mjs");
const sentinel = "client-secret-regression-sentinel";
const directories: string[] = [];

function fixture(build: boolean) {
  const directory = mkdtempSync(join(tmpdir(), "mw-client-scan-"));
  directories.push(directory);
  if (build) {
    mkdirSync(join(directory, ".next/static"), { recursive: true });
    mkdirSync(join(directory, ".next/server/app"), { recursive: true });
    writeFileSync(join(directory, ".next/BUILD_ID"), "regression-build");
  }
  return directory;
}

function scan(directory: string) {
  return spawnSync(process.execPath, [script], {
    cwd: directory,
    env: { ...process.env, CLIENT_SECRET_SENTINEL: sentinel },
    encoding: "utf8",
    timeout: 10_000,
  });
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});

describe("client secret scan", () => {
  it("fails closed when no completed production build exists", () => {
    const result = scan(fixture(false));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/production build/i);
  });

  it("does not treat an empty static directory as a clean scan", () => {
    const result = scan(fixture(true));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/no browser-addressable/i);
  });

  it("scans static assets and rendered payloads without leaking the sentinel in errors", () => {
    const directory = fixture(true);
    writeFileSync(join(directory, ".next/static/chunk.js"), "/* safe browser code */");
    writeFileSync(join(directory, ".next/server/app/page.rsc"), sentinel);
    const result = scan(directory);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("page.rsc");
    expect(result.stderr).not.toContain(sentinel);
  });

  it("checks browser JavaScript but ignores private server JavaScript", () => {
    const directory = fixture(true);
    writeFileSync(join(directory, ".next/static/chunk.js"), "/* safe browser code */");
    writeFileSync(join(directory, ".next/server/app/page.js"), sentinel);
    expect(scan(directory).status).toBe(0);
    writeFileSync(join(directory, ".next/static/chunk.js"), sentinel);
    expect(scan(directory).status).not.toBe(0);
  });
});
