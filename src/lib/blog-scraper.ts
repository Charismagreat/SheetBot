/**
 * 블로그 벤치마킹 URL 정밀 스크래핑 헬퍼
 * 네이버 블로그, 티스토리, 일반 웹 블로그 본문 및 소제목 구조 추출
 */

export interface ScrapedBlogResult {
  url: string;
  title: string;
  subheadings: string[];
  sampleText: string;
  charCount: number;
  success: boolean;
}

/**
 * 네이버 PC 블로그 URL을 모바일 URL로 정규화 (iframe 우회 및 0.2초 초고속 스크래핑 보장)
 */
export function normalizeBlogUrl(url: string): string {
  const clean = url.trim();
  if (clean.includes("blog.naver.com") && !clean.includes("m.blog.naver.com")) {
    return clean.replace("blog.naver.com", "m.blog.naver.com");
  }
  return clean;
}

/**
 * 단일 블로그 URL 본문 및 소제목 추출
 */
export async function scrapeBlogContent(url: string, timeoutMs: number = 3500): Promise<ScrapedBlogResult> {
  const targetUrl = normalizeBlogUrl(url);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { url, title: "", subheadings: [], sampleText: "", charCount: 0, success: false };
    }

    const html = await res.text();

    // 1. 제목 추출 (<title> 또는 og:title)
    let title = "";
    const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i);
    if (ogTitleMatch) {
      title = ogTitleMatch[1];
    } else {
      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      title = titleMatch ? titleMatch[1] : "";
    }
    title = title.replace(/\s*:\s*네이버\s*블로그/i, "").trim();

    // 2. 소제목 태그 추출 (h2, h3, se-section-title 등)
    const subheadings: string[] = [];
    const hRegex = /<(?:h2|h3)[^>]*>(.*?)<\/(?:h2|h3)>/gi;
    let hMatch: RegExpExecArray | null;
    while ((hMatch = hRegex.exec(html)) !== null && subheadings.length < 6) {
      const raw = hMatch[1].replace(/<[^>]+>/g, "").trim();
      if (raw.length > 2 && raw.length < 50 && !subheadings.includes(raw)) {
        subheadings.push(raw);
      }
    }

    // 3. 본문 텍스트 추출 (태그 제거 및 공백 정규화)
    const bodyOnly = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
      .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ");

    const cleanText = bodyOnly
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&[a-z]+;/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return {
      url,
      title: title || "블로그 포스팅",
      subheadings,
      sampleText: cleanText.slice(0, 1000), // AI 분석용 앞부분 1,000자
      charCount: cleanText.length,
      success: true,
    };
  } catch (err: any) {
    console.warn(`[BlogScraper] Failed to scrape ${url}:`, err.message);
    return { url, title: "", subheadings: [], sampleText: "", charCount: 0, success: false };
  }
}

/**
 * 3개 참고 블로그 URL 병렬 스크래핑
 */
export async function scrapeReferenceBlogs(urls: string[]): Promise<ScrapedBlogResult[]> {
  const validUrls = urls.filter((u) => u && u.trim().startsWith("http")).slice(0, 3);
  if (validUrls.length === 0) return [];

  const results = await Promise.allSettled(
    validUrls.map((u) => scrapeBlogContent(u, 3500))
  );

  return results
    .filter((r): r is PromiseFulfilledResult<ScrapedBlogResult> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((v) => v.success);
}
