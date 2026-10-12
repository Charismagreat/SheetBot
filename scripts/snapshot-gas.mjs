#!/usr/bin/env node
/**
 * Snapshot all exports from @/lib/gas-manifest for byte-identical refactor checks.
 * Usage: npx tsx scripts/snapshot-gas.mjs [output.json]
 * Optional: GAS_MODULE=/path/to/gas-manifest.ts (or .mts)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outPath = process.argv[2] || path.join('/tmp', 'gas-snapshot.json');

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

const manifestMinimal = JSON.stringify({ oauthScopes: [] }, null, 2);
const manifestSample = JSON.stringify(
  {
    timeZone: 'America/New_York',
    oauthScopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    runtimeVersion: 'DEPRECATED',
  },
  null,
  2,
);
const manifestFull = JSON.stringify(
  {
    timeZone: 'Asia/Seoul',
    exceptionLogging: 'STACKDRIVER',
    runtimeVersion: 'V8',
    oauthScopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/script.send_mail',
    ],
  },
  null,
  2,
);

const snapshot = {
  STANDARD_OAUTH_SCOPES: gas.STANDARD_OAUTH_SCOPES,
  STANDARD_OAUTH_SCOPES_length: gas.STANDARD_OAUTH_SCOPES.length,

  ensureStandardManifest_undefined: gas.ensureStandardManifest(undefined),
  ensureStandardManifest_null: gas.ensureStandardManifest(null),
  ensureStandardManifest_empty: gas.ensureStandardManifest(''),
  ensureStandardManifest_whitespace: gas.ensureStandardManifest('   \n  '),
  ensureStandardManifest_invalid: gas.ensureStandardManifest('{not json'),
  ensureStandardManifest_minimal: gas.ensureStandardManifest(manifestMinimal),
  ensureStandardManifest_sample: gas.ensureStandardManifest(manifestSample),
  ensureStandardManifest_full: gas.ensureStandardManifest(manifestFull),

  generateSecureEgdeskConfig_user: gas.generateSecureEgdeskConfig('snapshot.user@example.com'),
  generateSecureEgdeskConfig_blank: gas.generateSecureEgdeskConfig(''),
  generateSecureEgdeskConfig_whitespace: gas.generateSecureEgdeskConfig('  trimmed@x.com  '),

  generateStandardEgdeskClient_a: gas.generateStandardEgdeskClient(),
  generateStandardEgdeskClient_b: gas.generateStandardEgdeskClient(),
  generateStandardEgdeskClient_c: gas.generateStandardEgdeskClient(),

  generateStandardTokenRecharge_a: gas.generateStandardTokenRecharge(),
  generateStandardTokenRecharge_b: gas.generateStandardTokenRecharge(),
  generateStandardTokenRecharge_c: gas.generateStandardTokenRecharge(),
};

fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
console.log('Wrote', outPath);
