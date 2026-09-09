// Materialize operator-provided CI secret files outside the checkout. This does
// not create accounts, authenticate, provision a database, or manufacture tokens.
import { appendFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PREFIX = "mw-e2e-fixtures-";
const MANIFEST = "fixtures.json";
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const filename = (value) => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]*\.json$/.test(value) && value !== MANIFEST;

/** Validate the operator's bundle without writing credentials or opening a session. */
export function parseE2eFixtureBundle(serialized) {
  if (typeof serialized !== "string" || serialized.trim() === "") {
    throw new Error("E2E_FIXTURE_BUNDLE_JSON is missing or empty. Configure this repository Actions secret using seed-data/E2E-VERIFICATION.md; real isolated-preview Clerk session states are required.");
  }
  let bundle;
  try { bundle = JSON.parse(serialized); } catch {
    throw new Error("E2E_FIXTURE_BUNDLE_JSON is not valid JSON. Supply the complete raw JSON bundle described in seed-data/E2E-VERIFICATION.md, without Markdown fences or base64 encoding.");
  }
  if (!record(bundle) || !record(bundle.manifest) || !record(bundle.storageStates) ||
      !record(bundle.manifest.projects)) throw new Error("The E2E secret bundle needs a manifest and storageStates.");
  const names = Object.keys(bundle.storageStates);
  if (names.length < 1 || names.length > 8 || names.some((name) => !filename(name) || !record(bundle.storageStates[name]))) {
    throw new Error("Storage-state keys must be unique plain JSON filenames (at most eight).");
  }
  const references = new Set();
  for (const name of ["company-mobile", "admin-desktop"]) {
    const project = bundle.manifest.projects[name];
    const paths = [project?.adminStorageState, project?.pending?.storageState,
      project?.selfServe?.supplier?.storageState, project?.selfServe?.buyer?.storageState];
    for (const path of paths) {
      if (!filename(path) || !Object.hasOwn(bundle.storageStates, path)) {
        throw new Error("Every project session must reference a storage-state filename supplied in the bundle.");
      }
      references.add(path);
    }
  }
  if (names.some((name) => !references.has(name))) throw new Error("Do not include unreferenced session credentials in the E2E bundle.");
  return bundle;
}

export async function prepareE2eFixtures(serialized, parent = tmpdir()) {
  const bundle = parseE2eFixtureBundle(serialized);
  const names = Object.keys(bundle.storageStates);
  const base = await realpath(parent);
  const directory = await mkdtemp(join(base, PREFIX));
  try {
    // CI runs on Linux. Explicit modes keep bearer credentials private to this job.
    await mkdir(directory, { mode: 0o700, recursive: true });
    for (const name of names) {
      await writeFile(join(directory, name), JSON.stringify(bundle.storageStates[name]), { mode: 0o600, flag: "wx" });
    }
    const manifestPath = join(directory, MANIFEST);
    await writeFile(manifestPath, JSON.stringify(bundle.manifest), { mode: 0o600, flag: "wx" });
    return manifestPath;
  } catch (error) {
    await cleanupE2eFixtures(join(directory, MANIFEST), base);
    throw error;
  }
}

export async function cleanupE2eFixtures(manifestPath, parent = tmpdir()) {
  if (!manifestPath) return;
  const base = await realpath(parent);
  const absolute = resolve(manifestPath);
  const directory = dirname(absolute);
  if (basename(absolute) !== MANIFEST || dirname(directory) !== base || !basename(directory).startsWith(PREFIX)) {
    throw new Error("Refusing to remove a path outside the dedicated temporary E2E fixture directory.");
  }
  let actual;
  try { actual = await realpath(directory); } catch (error) { if (error.code === "ENOENT") return; throw error; }
  if (actual !== directory) throw new Error("Refusing to follow a fixture-directory link during cleanup.");
  await rm(directory, { recursive: true, force: true });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv[2] === "--cleanup") {
    await cleanupE2eFixtures(process.env.E2E_FIXTURES_FILE);
  } else {
    // An explicit workflow environment file is required, so ad-hoc invocation cannot
    // silently leave bearer credentials in a directory the operator cannot locate.
    if (!process.env.GITHUB_ENV) throw new Error("Run fixture preparation only in the configured CI secret-file step.");
    await readFile(process.env.GITHUB_ENV); // Prove the runner-owned output file exists.
    const path = await prepareE2eFixtures(process.env.E2E_FIXTURE_BUNDLE_JSON);
    try { await appendFile(process.env.GITHUB_ENV, `E2E_FIXTURES_FILE=${path}\n`); }
    catch (error) { await cleanupE2eFixtures(path); throw error; }
    console.log("Prepared private isolated-preview browser fixture files.");
  }
}
