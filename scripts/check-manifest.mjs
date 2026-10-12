#!/usr/bin/env node
/**
 * Regenerate route URL paths from src/app and compare to docs/route-manifest.txt.
 * Only URL_PATH values are compared (FILE column changes are ignored).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const appDir = path.join(root, "src", "app");
const manifestPath = path.join(root, "docs", "route-manifest.txt");

function collectRoutes() {
  const entries = [];
  function walk(dir) {
    for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, name.name);
      if (name.isDirectory()) {
        walk(full);
        continue;
      }
      if (name.name !== "route.ts" && name.name !== "page.tsx") continue;
      const rel = path.relative(path.join(root, "src"), full).replace(/\\/g, "/");
      const parts = rel.split("/");
      if (parts[0] !== "app") continue;
      const segs = parts.slice(1, -1);
      const urlPath = "/" + segs.join("/");
      const normalized = urlPath === "/" ? "/" : urlPath.replace(/\/+/g, "/");
      const kind = name.name === "route.ts" ? "API" : "PAGE";
      entries.push({ kind, urlPath: normalized, file: rel });
    }
  }
  walk(appDir);
  entries.sort((a, b) => a.kind.localeCompare(b.kind) || a.urlPath.localeCompare(b.urlPath));
  return entries;
}

function parseManifestUrls(text) {
  const urls = new Set();
  for (const line of text.split("\n")) {
    if (!line.trim() || line.startsWith("#") || line.startsWith("TYPE") || line.startsWith("-")) continue;
    const m = line.match(/^(API|PAGE)\s+(\S+)\s+/);
    if (m) urls.add(m[2]);
  }
  return urls;
}

function main() {
  const generated = collectRoutes();
  const generatedUrls = new Set(generated.map((e) => e.urlPath));

  if (!fs.existsSync(manifestPath)) {
    console.error(`Missing ${manifestPath}`);
    process.exit(1);
  }

  const baselineText = fs.readFileSync(manifestPath, "utf8");
  const baselineUrls = parseManifestUrls(baselineText);

  const missingInBaseline = [...generatedUrls].filter((u) => !baselineUrls.has(u));
  const extraInBaseline = [...baselineUrls].filter((u) => !generatedUrls.has(u));

  if (missingInBaseline.length === 0 && extraInBaseline.length === 0) {
    console.log(`OK: ${generatedUrls.size} URL paths match docs/route-manifest.txt`);
    process.exit(0);
  }

  console.error("Route manifest URL_PATH mismatch:");
  if (missingInBaseline.length) {
    console.error("\nNew routes (in src, not in manifest):");
    for (const u of missingInBaseline.sort()) console.error(`  + ${u}`);
  }
  if (extraInBaseline.length) {
    console.error("\nRemoved routes (in manifest, not in src):");
    for (const u of extraInBaseline.sort()) console.error(`  - ${u}`);
  }
  process.exit(1);
}

main();
