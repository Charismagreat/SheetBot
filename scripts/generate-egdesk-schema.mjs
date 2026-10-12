#!/usr/bin/env node
/**
 * Regenerate egdesk.schema.ts from src/lib/setup-db.legacy-schema.ts snapshot
 * or refresh column lists — run after editing table definitions.
 *
 * For SheetBot, prefer editing egdesk.schema.ts directly; this script re-parses
 * the legacy safeCreateTable blocks if setup-db.legacy-schema.ts exists.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const legacyPath = path.join(root, 'src', 'lib', 'setup-db.legacy-schema.ts');
const outPath = path.join(root, 'egdesk.schema.ts');

const AUDIT = [
  'uuid',
  'updated_at',
  'updated_by',
  'deleted_at',
  'deleted_by',
  'restored_at',
  'restored_by',
];

function keyFor(name) {
  const k = name.replace(/[^a-zA-Z0-9_]/g, '_');
  return /^[a-zA-Z_]/.test(k) ? k : `_${k}`;
}

function parseLegacy(source) {
  const re =
    /await safeCreateTable\(\s*'([^']+)',\s*\[([\s\S]*?)\],\s*\{\s*tableName:\s*'([^']+)'\s*\}\s*\)/g;
  const colRe = /\{\s*name:\s*'([^']+)'/g;
  const tables = [];
  let m;
  while ((m = re.exec(source))) {
    const [, display, colsBlock, tname] = m;
    const cols = [...colsBlock.matchAll(colRe)].map((x) => x[1]);
    const seen = new Set();
    const ordered = [];
    for (const c of cols) {
      if (!seen.has(c)) {
        seen.add(c);
        ordered.push(c);
      }
    }
    for (const a of AUDIT) {
      if (!seen.has(a)) ordered.push(a);
    }
    tables.push({ tname, display, cols: ordered });
  }
  return tables;
}

function main() {
  if (!fs.existsSync(legacyPath)) {
    console.error(
      `No legacy schema source at ${legacyPath}. Edit egdesk.schema.ts directly.`,
    );
    process.exit(1);
  }
  const tables = parseLegacy(fs.readFileSync(legacyPath, 'utf8'));
  const body = tables
    .sort((a, b) => a.tname.localeCompare(b.tname))
    .map(({ tname, display, cols }) => {
      const colLiterals = cols.map((c) => `'${c}'`).join(', ');
      return `  ${keyFor(tname)}: {
    name: '${tname}',
    displayName: '${display.replace(/'/g, "\\'")}',
    columns: [${colLiterals}],
    columnCount: ${cols.length},
    rowCount: 0,
  }`;
    })
    .join(',\n');

  const content = `/**
 * egdesk.schema.ts — committed seed schema (SheetBot)
 *
 * COMMIT THIS FILE TO GIT.
 *
 * EGDesk creates these tables on server start (createTablesFromParsed).
 * Regenerate: node scripts/generate-egdesk-schema.mjs (requires legacy snapshot file)
 */

export const TABLES = {
${body}
} as const;

export type TableName = keyof typeof TABLES;
export const TABLE_NAMES = Object.keys(TABLES) as TableName[];
`;

  fs.writeFileSync(outPath, content, 'utf8');
  console.log(`Wrote ${outPath} (${tables.length} tables)`);
}

main();
