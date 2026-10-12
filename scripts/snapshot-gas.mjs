#!/usr/bin/env node
/**
 * Snapshot all exports from @/lib/gas-manifest for byte-identical refactor checks.
 * Usage: node scripts/snapshot-gas.mjs [output.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outPath = process.argv[2] || path.join('/tmp', 'gas-snapshot.json');

// Deterministic if generators ever pick up time/random (they should not today).
const fixedIso = '2000-01-01T00:00:00.000Z';
const realDate = Date;
// @ts-expect-error test stub
globalThis.Date = class extends realDate {
  constructor(...args) {
    if (args.length === 0) {
      super(fixedIso);
      return;
    }
    super(...args);
  }
  static now() {
    return new realDate(fixedIso).getTime();
  }
  toISOString() {
    return fixedIso;
  }
};
Math.random = () => 0.42;
if (globalThis.crypto?.getRandomValues) {
  const orig = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  globalThis.crypto.getRandomValues = (arr) => {
    for (let i = 0; i < arr.length; i++) arr[i] = 0;
    return arr;
  };
}

const gasModule = process.env.GAS_MODULE
  ? path.resolve(process.env.GAS_MODULE)
  : path.join(root, 'src/lib/gas-manifest.ts');
const gasUrl = pathToFileURL(gasModule).href;
const gas = await import(gasUrl);

const sampleManifest = JSON.stringify(
  {
    timeZone: 'America/New_York',
    oauthScopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  },
  null,
  2,
);

const snapshot = {
  STANDARD_OAUTH_SCOPES: gas.STANDARD_OAUTH_SCOPES,
  ensureStandardManifest_null: gas.ensureStandardManifest(null),
  ensureStandardManifest_empty: gas.ensureStandardManifest(''),
  ensureStandardManifest_invalid: gas.ensureStandardManifest('{not json'),
  ensureStandardManifest_sample: gas.ensureStandardManifest(sampleManifest),
  generateSecureEgdeskConfig: gas.generateSecureEgdeskConfig('snapshot.user@example.com'),
  generateSecureEgdeskConfig_blank: gas.generateSecureEgdeskConfig(''),
  generateStandardEgdeskClient: gas.generateStandardEgdeskClient(),
  generateStandardTokenRecharge: gas.generateStandardTokenRecharge(),
};

fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
console.log('Wrote', outPath);
