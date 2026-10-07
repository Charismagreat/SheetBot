const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function makeSeal() {
  const userHome = process.env.USERPROFILE || 'C:\\Users\\CHARISMA';
  const sealDir = path.join(userHome, '.egdesk', 'uploads', 'chachogreat_gmail_com', 'seal');
  fs.mkdirSync(sealDir, { recursive: true });

  const sampleSealSvg = `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
    <circle cx="100" cy="100" r="88" stroke="#dc2626" stroke-width="6" fill="none"/>
    <circle cx="100" cy="100" r="80" stroke="#dc2626" stroke-width="2" fill="none"/>
    <text x="100" y="85" font-family="sans-serif" font-size="24" font-weight="bold" fill="#dc2626" text-anchor="middle">차호석</text>
    <text x="100" y="125" font-family="sans-serif" font-size="24" font-weight="bold" fill="#dc2626" text-anchor="middle">견적의인</text>
  </svg>`;

  const buf = await sharp(Buffer.from(sampleSealSvg)).png().toBuffer();
  fs.writeFileSync(path.join(sealDir, 'official_seal.png'), buf);
  console.log('Saved official_seal.png successfully:', buf.length, 'bytes');
}

makeSeal().catch(console.error);
