export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import {
  callDriveTool,
  callSheetsTool,
  callAiCaller,
  listDriveFiles,
  createDriveFolder,
  insertRows,
} from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { getAiModelSettings } from "@/lib/ai-settings";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { checkTokenBalance, deductTokens } from "@/lib/token-wallet";
import { recordAiUsageLog } from "@/lib/ai-usage";
import { getKoreanTimeString } from "@/lib/date-utils";

/**
 * 60초 이내 동일 URL 중복 스크랩 방지 캐시 (Idempotency)
 */
const recentScraps = new Map<string, number>();

function cleanHtmlEntities(text: string): string {
  if (!text) return "";
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * POST /api/user/links/bookmark
 * 스마트폰 유튜브 앱 또는 웹 브라우저에서 '공유하기(Share)'로 수신된 URL을 분석하여
 * 구글 드라이브 [SheetBot] 스크랩 보관함 내 [SheetBot] 웹 링크 & 유튜브 스크랩 대장 시트에 자동 기록
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();

    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");
    const body = await req.json().catch(() => ({}));

    const bodyEmail = body.userEmail as string | undefined;
    const rawUrl = (body.url as string | undefined)?.trim();
    const rawText = (body.rawText as string | undefined)?.trim() || "";
    const memo = (body.memo as string | undefined)?.trim() || "스마트폰 공유하기(Share) 스크랩";
    const deviceId = (body.deviceId as string | undefined)?.trim() || "SheetBot Agent";

    const userEmail = (bodyEmail && bodyEmail.includes("@"))
      ? bodyEmail.toLowerCase().trim()
      : (sessionEmail || (headerEmail && headerEmail.includes("@") ? headerEmail.toLowerCase().trim() : ""));

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }
    if (!rawUrl) {
      return NextResponse.json({ success: false, error: "스크랩할 URL 주소가 없습니다." }, { status: 400 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();

    // 0. 중복 요청(Deduplication) 방지 (동일 사용자 + 동일 URL 60초 이내 연속 수신 차단)
    const dedupKey = `${cleanEmail}:${rawUrl}`;
    const nowTs = Date.now();
    const lastScrapTime = recentScraps.get(dedupKey);
    if (lastScrapTime && nowTs - lastScrapTime < 60000) {
      console.log(`[LinkBookmark] Duplicate request ignored within 60s: ${rawUrl}`);
      return NextResponse.json({
        success: true,
        message: "이미 스크랩 접수된 링크입니다. (중복 방지)",
        url: rawUrl,
        isDuplicate: true,
      });
    }
    recentScraps.set(dedupKey, nowTs);

    // 주기적으로 10분 지난 캐시 정리
    if (recentScraps.size > 200) {
      for (const [k, v] of recentScraps.entries()) {
        if (nowTs - v > 600000) recentScraps.delete(k);
      }
    }

    // 1. 링크 종류 식별 (유튜브 vs 일반 웹사이트)
    const isYouTube = /(?:youtube\.com|youtu\.be)/i.test(rawUrl);
    const category = isYouTube ? "🔴 유튜브" : "🌐 웹사이트";

    // 2. 메타데이터 파싱 (타이틀, 사이트명, 설명)
    let title = "";
    let siteName = isYouTube ? "YouTube" : "";
    let description = "";

    // 유튜브 oEmbed API 활용 (초고속 및 100% 정확한 영상 제목 및 채널명 획득)
    if (isYouTube) {
      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`;
        const oembedRes = await fetch(oembedUrl, { signal: AbortSignal.timeout(3000) });
        if (oembedRes.ok) {
          const oembedJson = await oembedRes.json();
          title = cleanHtmlEntities(oembedJson.title || "");
          siteName = oembedJson.author_name ? `${oembedJson.author_name} (YouTube)` : "YouTube";
        }
      } catch (oeErr: any) {
        console.warn("[LinkBookmark] YouTube oEmbed fetch error:", oeErr.message);
      }
    }

    // 일반 웹페이지 또는 유튜브 oEmbed 실패 시 OpenGraph 직접 파싱
    if (!title) {
      try {
        const htmlRes = await fetch(rawUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
          },
          signal: AbortSignal.timeout(4000),
        });

        if (htmlRes.ok) {
          const htmlText = await htmlRes.text();
          const ogTitleMatch = htmlText.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
            || htmlText.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
          const titleMatch = htmlText.match(/<title[^>]*>([^<]+)<\/title>/i);
          const ogSiteMatch = htmlText.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i);
          const ogDescMatch = htmlText.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)
            || htmlText.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);

          if (ogTitleMatch) title = cleanHtmlEntities(ogTitleMatch[1]);
          else if (titleMatch) title = cleanHtmlEntities(titleMatch[1]);

          if (ogSiteMatch && !siteName) siteName = cleanHtmlEntities(ogSiteMatch[1]);
          if (ogDescMatch) description = cleanHtmlEntities(ogDescMatch[1]);
        }
      } catch (htmlErr: any) {
        console.warn("[LinkBookmark] HTML metadata fetch error:", htmlErr.message);
      }
    }

    // 도메인 추출 폴백
    if (!siteName) {
      try {
        const u = new URL(rawUrl);
        siteName = u.hostname.replace(/^www\./, "");
      } catch {
        siteName = isYouTube ? "YouTube" : "Web";
      }
    }

    if (!title) {
      title = cleanHtmlEntities(rawText.replace(rawUrl, "").trim()) || rawUrl;
    }

    // 3. 구글 드라이브 폴더 및 구글 스프레드시트 탐색/생성 ([SheetBot] 네이밍 규칙 준수)
    const folderName = "[SheetBot] 스크랩 보관함";
    const sheetTitle = "[SheetBot] 웹 링크 & 유튜브 스크랩 대장";

    let targetFolderId: string | null = null;
    try {
      const folderSearch = await listDriveFiles({
        query: `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName}' and trashed = false`,
        preferOAuth: true,
      });
      const existingFolders = folderSearch?.files || [];
      if (existingFolders.length > 0) {
        targetFolderId = existingFolders[0].id;
      } else {
        const newFolderRes = await createDriveFolder(folderName, undefined, true);
        targetFolderId = newFolderRes?.id || (typeof newFolderRes === "string" ? newFolderRes : null);
      }
    } catch (fErr: any) {
      console.warn("[LinkBookmark] Folder resolve warning:", fErr.message);
    }

    // 3-1. 고유 ID 영구 바인딩 및 시트 탐색/생성
    const resolved = await resolveUserSpreadsheet({
      userEmail: cleanEmail,
      sheetType: "LINK_BOOKMARK",
      defaultTitle: sheetTitle,
      folderId: targetFolderId,
      preferOAuth: true,
    });

    const targetSpreadsheetId = resolved.spreadsheetId;
    const spreadsheetUrl = resolved.spreadsheetUrl;

    if (resolved.isNew && targetSpreadsheetId) {
      // 헤더 8열 서식 기입
      const headers = [
        ["등록 일시", "구분", "제목", "웹 링크(URL)", "출처(채널명)", "AI 핵심 3줄 요약", "수집 메모", "등록 기기"]
      ];
      await callSheetsTool("sheets_update_range", {
        spreadsheetId: targetSpreadsheetId,
        range: "A1:H1",
        values: headers,
        preferOAuth: true,
      }).catch(() => {});

      // 버건디/레드 테마 서식 스타일링
      await callSheetsTool("sheets_format_headers", {
        spreadsheetId: targetSpreadsheetId,
        tabName: "시트1",
        headerBgColor: "#991b1b",
        headerTextColor: "#ffffff",
        preferOAuth: true,
      }).catch(() => {});
    }

    // 4. [1단계: 선행 즉시 기록] 한국 시간(KST)으로 즉시 시트에 추가 (0.1초 체감 UX)
    const initialSummary = "⏳ AI 3줄 요약 분석 중...";
    let targetRow: number | null = null;

    if (targetSpreadsheetId) {
      // 정확한 삽입 행 번호 파악을 위해 현재 행 수 확인
      try {
        const rangeRes = await callSheetsTool("sheets_get_range", {
          spreadsheetId: targetSpreadsheetId,
          range: "시트1!A:A",
          preferOAuth: true,
        });
        const currentCount = rangeRes?.values?.length || 1;
        targetRow = currentCount + 1;
      } catch {
        targetRow = null;
      }

      // 한국 표준시(KST, UTC+9) 적용
      const nowStr = getKoreanTimeString();
      const newRowValues = [
        [nowStr, category, title, rawUrl, siteName, initialSummary, memo, deviceId]
      ];

      await callSheetsTool("sheets_append_values", {
        spreadsheetId: targetSpreadsheetId,
        range: "A:H",
        values: newRowValues,
        preferOAuth: true,
      }).catch((err: any) => console.warn("[LinkBookmark] append_values warning:", err.message));
    }

    // 5. SQLite 감사 대장 기록 (INTEGER id 규격 준수)
    const logId = Date.now();
    await insertRows("sheetbot_user_dispatch_logs", [
      {
        id: logId,
        user_email: cleanEmail,
        rule_id: "LINK_BOOKMARK",
        rule_name: isYouTube ? "🔴 유튜브 영상 자동 스크랩" : "🔖 웹 링크 자동 스크랩",
        device_id: deviceId,
        recipient: "Google Sheets",
        content: `[${category}] ${title} (${siteName}) -> ${sheetTitle}`,
        status: "SUCCESS",
        error_message: null,
        created_at: getKoreanTimeString(),
      },
    ]).catch((err) => console.warn("[LinkBookmark] DB log insert warning:", err.message));

    // 6. [2단계: 백그라운드 비동기 AI 분석 및 인플레이스 셀 갱신]
    if (targetSpreadsheetId && targetRow) {
      const rowToUpdate = targetRow;
      void (async () => {
        try {
          const aiSettings = await getAiModelSettings();
          const targetModel = aiSettings.defaultModel;

          // 1. 잔여 토큰 사전 점검 (최소 200 토큰)
          const balanceCheck = await checkTokenBalance(cleanEmail, 200);
          if (!balanceCheck.allowed) {
            const noTokenMsg = "⚠️ 잔여 토큰 부족으로 AI 요약이 생략되었습니다. (충전 후 정상 생성)";
            await callSheetsTool("sheets_update_range", {
              spreadsheetId: targetSpreadsheetId,
              range: `시트1!F${rowToUpdate}:F${rowToUpdate}`,
              values: [[noTokenMsg]],
              preferOAuth: true,
            });
            return;
          }

          const prompt = `당신은 웹 콘텐츠 및 유튜브 영상 스크랩 분석 비서입니다.
다음 수신된 링크 콘텐츠 정보를 분석하여 바쁜 직장인을 위한 핵심 3줄 요약(각 줄 머리에 1., 2., 3. 번호 부여)을 작성해 주세요. 불필요한 서두나 마크다운 없이 순수 텍스트 3줄로만 답변하세요:

- 제목: ${title}
- 출처/채널: ${siteName}
- 설명/발췌: ${description || rawText}
- URL: ${rawUrl}`;

          const aiRes = await callAiCaller(prompt, {
            caller: "sheetbot-link-scraper",
            model: targetModel || undefined,
            temperature: 0.2,
          });

          const summaryText = (aiRes.text || aiRes.content || "").trim();
          const finalSummary = summaryText.length > 5 ? summaryText : (description ? description.slice(0, 200) : "1. 원본 링크 참조\n2. 주요 콘텐츠 확인 완료\n3. 후속 검토 요망");

          // 2. 사용 토큰 계산 및 실제 차감
          const promptLen = prompt.length;
          const respLen = finalSummary.length;
          const rawTokens = Math.max(300, Math.ceil((promptLen + respLen) / 2.5));
          const multiplier = aiSettings.tokenMultiplier || 1.0;
          const usedTokens = Math.round(rawTokens * multiplier);

          await deductTokens(cleanEmail, usedTokens);

          // 3. AI 사용량 감사 로그 적재
          void recordAiUsageLog({
            userEmail: cleanEmail,
            caller: "sheetbot-link-scraper",
            purpose: `${category} 링크 스크랩 AI 3줄 요약 (${targetModel || "default"} / ${multiplier}x)`,
            model: targetModel || "default",
            promptTokens: Math.ceil(promptLen / 2.5),
            completionTokens: Math.ceil(respLen / 2.5),
            totalTokens: usedTokens,
            promptText: `링크 요약: ${title} (${rawUrl})`,
            responseText: finalSummary,
          });

          // 4. 해당 행의 F열(AI 핵심 3줄 요약) 핀포인트 갱신
          await callSheetsTool("sheets_update_range", {
            spreadsheetId: targetSpreadsheetId,
            range: `시트1!F${rowToUpdate}:F${rowToUpdate}`,
            values: [[finalSummary]],
            preferOAuth: true,
          });
          console.log(`[LinkBookmark] Row ${rowToUpdate} AI summary updated & ${usedTokens} tokens deducted.`);
        } catch (aiErr: any) {
          console.warn(`[LinkBookmark] Row ${rowToUpdate} background AI summary error:`, aiErr.message);
          if (description) {
            await callSheetsTool("sheets_update_range", {
              spreadsheetId: targetSpreadsheetId,
              range: `시트1!F${rowToUpdate}:F${rowToUpdate}`,
              values: [[description.slice(0, 200)]],
              preferOAuth: true,
            }).catch(() => {});
          }
        }
      })();
    }

    // 클라이언트에는 0.1초 만에 즉시 성공 응답 반환
    return NextResponse.json({
      success: true,
      message: `${category} '${title}' 링크가 구글 시트에 즉시 기록되었습니다. (AI 요약 분석 중)`,
      category,
      title,
      url: rawUrl,
      siteName,
      aiSummary: initialSummary,
      spreadsheetUrl,
    });
  } catch (err: any) {
    console.error("[LinkBookmark] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
