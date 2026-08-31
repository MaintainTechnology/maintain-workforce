import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const buildRoot = join(process.cwd(), ".next");
const sentinel = process.env.CLIENT_SECRET_SENTINEL;

if (!sentinel || sentinel.length < 12) {
  throw new Error("CLIENT_SECRET_SENTINEL (at least 12 characters) is required.");
}
if (!existsSync(join(buildRoot, "BUILD_ID"))) {
  throw new Error("A completed production build is required before scanning client output.");
}

const roots = [join(buildRoot, "static"), join(buildRoot, "server", "app")];
const renderedExtensions = new Set([".html", ".rsc", ".txt", ".body"]);
const leaks = [];
let browserAssetCount = 0;

for (const root of roots) {
  for (const path of filesBelow(root)) {
    // Everything in .next/static is browser-addressable. Under server/app, only scan
    // rendered/prerendered payloads; server JavaScript is not a client bundle and may
    // legitimately retain a runtime environment-variable reference.
    if (root.endsWith(join(".next", "server", "app")) && !renderedExtensions.has(extname(path))) {
      continue;
    }
    if (root === roots[0]) browserAssetCount += 1;
    const body = readFileSync(path);
    if (body.includes(Buffer.from(sentinel))) leaks.push(relative(process.cwd(), path));
  }
}

if (browserAssetCount === 0) {
  throw new Error("No browser-addressable assets were found; the client scan did not run.");
}

if (leaks.length > 0) {
  throw new Error(`Server secret sentinel reached client output: ${leaks.join(", ")}`);
}

console.log(`Scanned ${browserAssetCount} browser assets; no server-secret sentinel in client output.`);

function filesBelow(directory) {
  try {
    if (!statSync(directory).isDirectory()) return [];
  } catch {
    return [];
  }
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}
