#!/usr/bin/env node
/**
 * Regenerate src/lib/gas/* template literals from monolith at a5a6d21 (verbatim template source).
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const gasDir = path.join(root, 'src/lib/gas');

const monolith = execSync('git show a5a6d21:src/lib/gas-manifest.ts', {
  cwd: root,
  encoding: 'utf8',
});

function extractReturnTemplate(exportPrefix) {
  const idx = monolith.indexOf(exportPrefix);
  if (idx < 0) throw new Error(`Missing ${exportPrefix}`);
  const ret = monolith.indexOf('return `', idx);
  const start = ret + 'return `'.length;
  const end = monolith.indexOf('`;\n}', start);
  if (end < 0) throw new Error(`Unclosed template for ${exportPrefix}`);
  return monolith.slice(start, end);
}

function writeFile(rel, content) {
  fs.mkdirSync(path.dirname(path.join(gasDir, rel)), { recursive: true });
  fs.writeFileSync(path.join(gasDir, rel), content, 'utf8');
}

// oauth-manifest (through ensureStandardManifest)
const oauthEnd = monolith.indexOf('/**\n * Apps Script 소스코드');
writeFile('oauth-manifest.ts', monolith.slice(0, oauthEnd).trimEnd() + '\n');

// egdesk-config
const cfgDoc = monolith.indexOf('/**\n * Apps Script 소스코드');
const cfgEnd = monolith.indexOf('/**\n * AI Caller', cfgDoc);
writeFile('egdesk-config.ts', monolith.slice(cfgDoc, cfgEnd).trimEnd() + '\n');

const clientDoc = monolith.indexOf('/**\n * AI Caller');
const clientEnd = monolith.indexOf('/**\n * 💳 SheetBot', clientDoc);
writeFile('egdesk-client.ts', monolith.slice(clientDoc, clientEnd).trimEnd() + '\n');

const rechargeInner = extractReturnTemplate('export function generateStandardTokenRecharge(): string {');
const modalMarker = '\nfunction getTokenRechargeModalHtml()';
const doGetMarker = '\nfunction doGet(e)';
const modalIdx = rechargeInner.indexOf(modalMarker);
const doGetIdx = rechargeInner.indexOf(doGetMarker);
if (modalIdx < 0 || doGetIdx < 0) throw new Error('modal/doGet markers missing');

const partA = rechargeInner.slice(0, modalIdx);
const partModal = rechargeInner.slice(modalIdx + 1, doGetIdx);
const partWebhook = rechargeInner.slice(doGetIdx + 1);

const splitLine = '\nfunction _callUserDataTool';
const splitIdx = partA.indexOf(splitLine);
if (splitIdx < 0) throw new Error('_callUserDataTool missing');
const partUi = partA.slice(0, splitIdx);
const partData = partA.slice(splitIdx + 1);

writeFile(
  'token-recharge-preamble-ui.ts',
  `/**
 * GAS fragment: TokenRecharge.gs (UI, alerts, phone/FDE modals).
 */
export const TOKEN_RECHARGE_GAS_UI = \`${partUi}\`;
`,
);

writeFile(
  'token-recharge-preamble-data.ts',
  `/**
 * GAS fragment: TokenRecharge.gs (user-data tools, deposit flows).
 */
export const TOKEN_RECHARGE_GAS_DATA = \`${partData}\`;
`,
);

writeFile(
  'token-recharge-modal.ts',
  `/**
 * GAS fragment: getTokenRechargeModalHtml() for TokenRecharge.gs.
 */
export function getTokenRechargeModalHtml(): string {
  return \`${partModal}\`;
}
`,
);

writeFile(
  'webhook-tail.ts',
  `/**
 * GAS fragment: doGet / doPost / _parseBankDepositSmsGas for TokenRecharge.gs.
 */
export const TOKEN_RECHARGE_WEBHOOK_TAIL = \`${partWebhook}\`;
`,
);

writeFile(
  'token-recharge.ts',
  `import { TOKEN_RECHARGE_GAS_DATA } from './token-recharge-preamble-data';
import { TOKEN_RECHARGE_GAS_UI } from './token-recharge-preamble-ui';
import { getTokenRechargeModalHtml } from './token-recharge-modal';
import { TOKEN_RECHARGE_WEBHOOK_TAIL } from './webhook-tail';

/**
 * 💳 SheetBot 인-시트(In-Sheet) 토큰 충전 및 실시간 입금 감지 표준 모듈 (TokenRecharge.gs) 생성기
 */
export function generateStandardTokenRecharge(): string {
  return \`\${TOKEN_RECHARGE_GAS_UI}\\n\${TOKEN_RECHARGE_GAS_DATA}\\n\${getTokenRechargeModalHtml()}\\n\${TOKEN_RECHARGE_WEBHOOK_TAIL}\`;
}
`,
);

console.log('Wrote readable gas templates from monolith slices.');
console.log('  UI lines:', partUi.split('\n').length);
console.log('  DATA lines:', partData.split('\n').length);
console.log('  modal lines:', partModal.split('\n').length);
console.log('  webhook lines:', partWebhook.split('\n').length);
