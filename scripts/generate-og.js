const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const width = 1200;
const height = 630;

const svg = `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- 배경 그라데이션 -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0f1d" />
      <stop offset="50%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#090d16" />
    </linearGradient>

    <!-- 에메랄드 & 인디고 앰비언트 글로우 -->
    <radialGradient id="glowEmerald" cx="20%" cy="30%" r="50%">
      <stop offset="0%" stop-color="#059669" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#059669" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="glowIndigo" cx="80%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#4f46e5" stop-opacity="0.3" />
      <stop offset="100%" stop-color="#4f46e5" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="glowTeal" cx="50%" cy="90%" r="50%">
      <stop offset="0%" stop-color="#0d9488" stop-opacity="0.25" />
      <stop offset="100%" stop-color="#0d9488" stop-opacity="0" />
    </radialGradient>

    <!-- 카드 배경 그라데이션 -->
    <linearGradient id="cardGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.08" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.02" />
    </linearGradient>

    <!-- 로고 그라데이션 -->
    <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#059669" />
      <stop offset="50%" stop-color="#0d9488" />
      <stop offset="100%" stop-color="#4f46e5" />
    </linearGradient>
  </defs>

  <!-- 1. 배경 -->
  <rect width="${width}" height="${height}" fill="url(#bgGrad)" />

  <!-- 2. 은은한 앰비언트 라이트 -->
  <circle cx="240" cy="200" r="380" fill="url(#glowEmerald)" />
  <circle cx="960" cy="250" r="420" fill="url(#glowIndigo)" />
  <circle cx="600" cy="560" r="320" fill="url(#glowTeal)" />

  <!-- 3. 그리드 패턴 라인 (엑셀/스프레드시트 느낌) -->
  <g opacity="0.05" stroke="#ffffff" stroke-width="1">
    <line x1="0" y1="90" x2="${width}" y2="90" />
    <line x1="0" y1="180" x2="${width}" y2="180" />
    <line x1="0" y1="270" x2="${width}" y2="270" />
    <line x1="0" y1="360" x2="${width}" y2="360" />
    <line x1="0" y1="450" x2="${width}" y2="450" />
    <line x1="0" y1="540" x2="${width}" y2="540" />
    <line x1="150" y1="0" x2="150" y2="${height}" />
    <line x1="300" y1="0" x2="300" y2="${height}" />
    <line x1="450" y1="0" x2="450" y2="${height}" />
    <line x1="600" y1="0" x2="600" y2="${height}" />
    <line x1="750" y1="0" x2="750" y2="${height}" />
    <line x1="900" y1="0" x2="900" y2="${height}" />
    <line x1="1050" y1="0" x2="1050" y2="${height}" />
  </g>

  <!-- 4. 메인 컨테이너 프레임 -->
  <rect x="60" y="50" width="1080" height="530" rx="32" fill="url(#cardGrad)" stroke="#ffffff" stroke-opacity="0.12" stroke-width="1.5" />

  <!-- 5. 상단 뱃지: 브랜드 카테고리 -->
  <g transform="translate(100, 95)">
    <rect width="320" height="38" rx="19" fill="#059669" fill-opacity="0.2" stroke="#10b981" stroke-opacity="0.4" stroke-width="1" />
    <text x="160" y="24" text-anchor="middle" font-family="'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif" font-size="14" font-weight="bold" fill="#34d399">✨ 구글 스프레드시트 AI 업무 자동화</text>
  </g>

  <!-- 도메인 주소 뱃지 (우상단) -->
  <g transform="translate(930, 95)">
    <rect width="170" height="38" rx="19" fill="#ffffff" fill-opacity="0.06" stroke="#ffffff" stroke-opacity="0.15" stroke-width="1" />
    <text x="85" y="24" text-anchor="middle" font-family="'Pretendard', 'Apple SD Gothic Neo', sans-serif" font-size="13" font-weight="600" fill="#94a3b8">sheetbot.cloud</text>
  </g>

  <!-- 6. 브랜드 로고 & 타이틀 -->
  <g transform="translate(100, 160)">
    <!-- SheetBot 2x2 아이콘 박스 -->
    <rect width="84" height="84" rx="24" fill="url(#logoGrad)" filter="drop-shadow(0 10px 20px rgba(5, 150, 105, 0.4))" />
    
    <!-- 2x2 셀 아이콘 -->
    <rect x="20" y="20" width="18" height="18" rx="4" fill="#ffffff" fill-opacity="0.9" />
    <rect x="46" y="20" width="18" height="18" rx="4" fill="#ffffff" fill-opacity="0.6" />
    <rect x="20" y="46" width="18" height="18" rx="4" fill="#ffffff" fill-opacity="0.6" />
    <rect x="46" y="46" width="18" height="18" rx="4" fill="#34d399" />
    
    <!-- 번개 스파크 효과 -->
    <polygon points="55,16 61,25 57,25 63,35 55,27 59,27" fill="#fbbf24" />

    <!-- 브랜드 텍스트 -->
    <text x="106" y="45" font-family="'Pretendard', 'Apple SD Gothic Neo', sans-serif" font-size="34" font-weight="900" fill="#ffffff" letter-spacing="-0.5">SheetBot</text>
    <text x="285" y="45" font-family="'Pretendard', 'Apple SD Gothic Neo', sans-serif" font-size="24" font-weight="700" fill="#10b981">시트봇</text>
    <text x="106" y="73" font-family="'Pretendard', 'Apple SD Gothic Neo', sans-serif" font-size="15" font-weight="500" fill="#94a3b8">복잡한 코딩 없이 말로 만드는 나만의 자동화 비서</text>
  </g>

  <!-- 7. 메인 헤드라인 텍스트 -->
  <text x="100" y="305" font-family="'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif" font-size="44" font-weight="900" fill="#ffffff" letter-spacing="-1.5">
    내 구글 시트에 <tspan fill="#34d399">AI 업무 비서</tspan>를 달아보세요
  </text>

  <!-- 8. 서브 설명 카피 -->
  <text x="100" y="352" font-family="'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif" font-size="20" font-weight="500" fill="#cbd5e1" letter-spacing="-0.5">
    영수증 · 명함 · 단체 문자 · 주문 접수까지, 복잡한 수식 없이 시트 하나로 즉시 해결!
  </text>

  <!-- 9. 4대 핵심 기능 피처 카드 그리드 -->
  <g transform="translate(100, 395)">
    <!-- 카드 1: 영수증 -->
    <g transform="translate(0, 0)">
      <rect width="235" height="135" rx="18" fill="#ffffff" fill-opacity="0.05" stroke="#ffffff" stroke-opacity="0.1" stroke-width="1" />
      <circle cx="28" cy="35" r="5" fill="#34d399" />
      <text x="42" y="39" font-family="'Pretendard', sans-serif" font-size="12" font-weight="bold" fill="#34d399">OCR 자동 장부</text>
      <text x="24" y="78" font-family="'Pretendard', sans-serif" font-size="18" font-weight="bold" fill="#ffffff">영수증 3초 인식</text>
      <text x="24" y="105" font-family="'Pretendard', sans-serif" font-size="13" fill="#94a3b8">사진 찍으면 시트 장부화</text>
    </g>

    <!-- 카드 2: 명함 CRM -->
    <g transform="translate(255, 0)">
      <rect width="235" height="135" rx="18" fill="#ffffff" fill-opacity="0.05" stroke="#ffffff" stroke-opacity="0.1" stroke-width="1" />
      <circle cx="28" cy="35" r="5" fill="#60a5fa" />
      <text x="42" y="39" font-family="'Pretendard', sans-serif" font-size="12" font-weight="bold" fill="#60a5fa">스마트 인맥 관리</text>
      <text x="24" y="78" font-family="'Pretendard', sans-serif" font-size="18" font-weight="bold" fill="#ffffff">명함 실시간 CRM</text>
      <text x="24" y="105" font-family="'Pretendard', sans-serif" font-size="13" fill="#94a3b8">촬영 즉시 고객 연락처 등록</text>
    </g>

    <!-- 카드 3: 스마트 문자 -->
    <g transform="translate(510, 0)">
      <rect width="235" height="135" rx="18" fill="#ffffff" fill-opacity="0.05" stroke="#ffffff" stroke-opacity="0.1" stroke-width="1" />
      <circle cx="28" cy="35" r="5" fill="#a78bfa" />
      <text x="42" y="39" font-family="'Pretendard', sans-serif" font-size="12" font-weight="bold" fill="#a78bfa">비용 0원 메시징</text>
      <text x="24" y="78" font-family="'Pretendard', sans-serif" font-size="18" font-weight="bold" fill="#ffffff">무료 문자 자동화</text>
      <text x="24" y="105" font-family="'Pretendard', sans-serif" font-size="13" fill="#94a3b8">내 폰 무제한 문자 연동</text>
    </g>

    <!-- 카드 4: 간편 주문서 -->
    <g transform="translate(765, 0)">
      <rect width="235" height="135" rx="18" fill="#ffffff" fill-opacity="0.05" stroke="#ffffff" stroke-opacity="0.1" stroke-width="1" />
      <circle cx="28" cy="35" r="5" fill="#f59e0b" />
      <text x="42" y="39" font-family="'Pretendard', sans-serif" font-size="12" font-weight="bold" fill="#f59e0b">모바일 간편 주문</text>
      <text x="24" y="78" font-family="'Pretendard', sans-serif" font-size="18" font-weight="bold" fill="#ffffff">모바일 웹 주문서</text>
      <text x="24" y="105" font-family="'Pretendard', sans-serif" font-size="13" fill="#94a3b8">고객 주문 즉시 시트 적재</text>
    </g>
  </g>
</svg>
`;

async function generate() {
  const outPath = path.join(__dirname, '..', 'public', 'images', 'og-sheetbot.png');
  await sharp(Buffer.from(svg))
    .png({ quality: 95 })
    .toFile(outPath);
  console.log('✅ Generated OG image at:', outPath);
}

generate().catch(err => {
  console.error(err);
  process.exit(1);
});
