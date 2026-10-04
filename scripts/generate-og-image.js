const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const svg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="40%" stop-color="#064e3b" />
      <stop offset="100%" stop-color="#022c22" />
    </linearGradient>
    <linearGradient id="cardBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e293b" stop-opacity="0.9" />
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0.95" />
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)" />

  <circle cx="150" cy="120" r="280" fill="#059669" opacity="0.15" />
  <circle cx="1050" cy="500" r="260" fill="#10b981" opacity="0.12" />

  <rect x="70" y="65" width="1060" height="500" rx="28" fill="url(#cardBg)" stroke="#334155" stroke-width="2" />

  <!-- SheetBot Logo / Icon -->
  <g transform="translate(130, 160)">
    <rect width="140" height="140" rx="36" fill="#059669" />
    <rect x="28" y="28" width="36" height="36" rx="8" fill="#ffffff" fill-opacity="0.35" stroke="#ffffff" stroke-width="2" />
    <line x1="35" y1="41" x2="57" y2="41" stroke="#ffffff" stroke-width="3" stroke-linecap="round" />
    <line x1="35" y1="51" x2="49" y2="51" stroke="#ffffff" stroke-width="3" stroke-linecap="round" />
    <rect x="28" y="76" width="36" height="36" rx="8" fill="#ffffff" fill-opacity="0.35" stroke="#ffffff" stroke-width="2" />
    <line x1="35" y1="89" x2="55" y2="89" stroke="#ffffff" stroke-width="3" stroke-linecap="round" />
    <rect x="76" y="76" width="36" height="36" rx="8" fill="#ffffff" fill-opacity="0.35" stroke="#ffffff" stroke-width="2" />
    <line x1="83" y1="89" x2="103" y2="89" stroke="#ffffff" stroke-width="3" stroke-linecap="round" />
    <rect x="76" y="28" width="36" height="36" rx="8" fill="#ffffff" fill-opacity="0.65" stroke="#a7f3d0" stroke-width="3" />
    <circle cx="94" cy="46" r="6" fill="#ffffff" />
  </g>

  <!-- Text Section -->
  <text x="310" y="205" font-family="'Malgun Gothic', sans-serif" font-size="24" font-weight="bold" fill="#34d399" letter-spacing="1.5">
    SHEETBOT CLOUD ORDER
  </text>
  <text x="310" y="270" font-family="'Malgun Gothic', sans-serif" font-size="50" font-weight="bold" fill="#f8fafc">
    스마트 모바일 간편 주문서
  </text>
  <text x="310" y="330" font-family="'Malgun Gothic', sans-serif" font-size="24" fill="#94a3b8">
    구글 스프레드시트 실시간 연동 • 견적 조회 및 원클릭 접수
  </text>

  <!-- Bottom Badges -->
  <g transform="translate(130, 375)">
    <rect width="210" height="50" rx="25" fill="#065f46" stroke="#059669" stroke-width="1.5" />
    <text x="105" y="32" font-family="'Malgun Gothic', sans-serif" font-size="19" font-weight="bold" fill="#6ee7b7" text-anchor="middle">
      ⚡ 실시간 자동 접수
    </text>
  </g>

  <g transform="translate(360, 375)">
    <rect width="220" height="50" rx="25" fill="#1e293b" stroke="#475569" stroke-width="1.5" />
    <text x="110" y="32" font-family="'Malgun Gothic', sans-serif" font-size="19" font-weight="bold" fill="#cbd5e1" text-anchor="middle">
      🔒 100% 안전 보안 주문
    </text>
  </g>
</svg>
`;

const outDir = path.join(__dirname, "..", "public", "images");
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const outFile = path.join(outDir, "og-default.png");

sharp(Buffer.from(svg))
  .png()
  .toFile(outFile)
  .then(() => {
    console.log("Success! Generated:", outFile);
  })
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
