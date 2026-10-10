async function check() {
  const url = 'http://localhost:3007/t/mcp-server-fxkud1/p/SheetBot/';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'facebookexternalhit/1.1;kakaotalk-scrap/1.0; +https://devtalk.kakao.com/category/scrap'
    }
  });
  const html = await res.text();
  const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1];
  const ogDesc = html.match(/<meta property="og:description" content="([^"]+)"/)?.[1];
  const ogImg = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  const ogSite = html.match(/<meta property="og:site_name" content="([^"]+)"/)?.[1];
  
  console.log('--- KakaoTalk Scraper Preview Result ---');
  console.log('Site Name  :', ogSite);
  console.log('OG Title   :', ogTitle);
  console.log('OG Desc    :', ogDesc);
  console.log('OG Image   :', ogImg);
  console.log('----------------------------------------');
}
check();
