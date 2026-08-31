import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// The runner is plain Node.js; import the same implementation used by CI.
import { cleanupE2eFixtures, prepareE2eFixtures } from "../../scripts/prepare-e2e-fixtures.mjs";

let parent: string;
beforeEach(async () => { parent = await mkdtemp(join(tmpdir(), "mw-e2e-secret-test-")); });
afterEach(async () => { await rm(parent, { recursive: true, force: true }); });
function bundle() {
  const project = { adminStorageState: "admin.json", pending: { storageState: "company.json" },
    selfServe: { supplier: { storageState: "company.json" }, buyer: { storageState: "company.json" } } };
  return { manifest: { projects: { "company-mobile": structuredClone(project), "admin-desktop": structuredClone(project) } },
    storageStates: { "admin.json": { cookies: [{ value: "TEST-ADMIN-SECRET" }], origins: [] },
      "company.json": { cookies: [{ value: "TEST-COMPANY-SECRET" }], origins: [] } } };
}

describe("CI browser fixture secret files", () => {
  it("writes only named private files to a fresh temporary directory and removes only that directory", async () => {
    const path = await prepareE2eFixtures(JSON.stringify(bundle()), parent);
    expect(basename(path)).toBe("fixtures.json");
    expect(dirname(dirname(path))).toBe(parent);
    expect(await readdir(dirname(path))).toEqual(["admin.json", "company.json", "fixtures.json"]);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(bundle().manifest);
    expect(await readFile(join(dirname(path), "admin.json"), "utf8")).toContain("TEST-ADMIN-SECRET");
    if (process.platform !== "win32") expect((await stat(path)).mode & 0o777).toBe(0o600);
    await cleanupE2eFixtures(path, parent);
    expect(await readdir(parent)).toEqual([]);
    await cleanupE2eFixtures(path, parent); // Safe idempotent cleanup.
  });

  it.each(["../outside.json", "/tmp/outside.json", "C:\\outside.json", "fixtures.json", "missing.json"])(
    "rejects unsafe or missing state reference %s before writing any secret", async (path) => {
      const value = bundle();
      value.manifest.projects["company-mobile"].adminStorageState = path;
      await expect(prepareE2eFixtures(JSON.stringify(value), parent)).rejects.toThrow("reference");
      expect(await readdir(parent)).toEqual([]);
    },
  );

  it("does not echo malformed secret contents or persist unused credentials", async () => {
    await expect(prepareE2eFixtures("TEST-SECRET-not-json", parent)).rejects.not.toThrow("TEST-SECRET");
    const value = { ...bundle(), storageStates: { ...bundle().storageStates, "unused.json": { cookie: "TEST-UNUSED-SECRET" } } };
    await expect(prepareE2eFixtures(JSON.stringify(value), parent)).rejects.toThrow("unreferenced");
    expect(await readdir(parent)).toEqual([]);
  });

  it("refuses broad cleanup paths and preserves unrelated files", async () => {
    await writeFile(join(parent, "keep.txt"), "unrelated fixture");
    await expect(cleanupE2eFixtures(join(parent, "fixtures.json"), parent)).rejects.toThrow("Refusing");
    expect(await readFile(join(parent, "keep.txt"), "utf8")).toBe("unrelated fixture");
  });
});
