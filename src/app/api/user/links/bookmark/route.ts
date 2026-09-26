export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import {
  callDriveTool,
  callSheetsTool,
  callAiCaller,
  listDriveFiles,
  createDriveFolder,
  moveDriveFile,
  insertRows,
} from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

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
          title = oembedJson.title || "";
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

          if (ogTitleMatch) title = ogTitleMatch[1];
          else if (titleMatch) title = titleMatch[1];

          if (ogSiteMatch && !siteName) siteName = ogSiteMatch[1];
          if (ogDescMatch) description = ogDescMatch[1];
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
      title = rawText.replace(rawUrl, "").trim() || rawUrl;
    }

    // 3. Gemini 3.8 Flash AI 핵심 3줄 요약 생성
    let aiSummary = "1. 원본 링크 참조\n2. 주요 콘텐츠 확인 완료\n3. 후속 검토 요망";
    try {
      const prompt = `당신은 웹 콘텐츠 및 유튜브 영상 스크랩 분석 비서입니다.
다음 수신된 링크 콘텐츠 정보를 분석하여 바쁜 직장인을 위한 핵심 3줄 요약(각 줄 머리에 1., 2., 3. 번호 부여)을 작성해 주세요. 불필요한 서두나 마크다운 없이 순수 텍스트 3줄로만 답변하세요:

- 제목: ${title}
- 출처/채널: ${siteName}
- 설명/발췌: ${description || rawText}
- URL: ${rawUrl}`;

      const aiRes = await callAiCaller(prompt, {
        model: "gemini-3.8-flash",
        temperature: 0.2,
      });

      const summaryText = (aiRes.text || aiRes.content || "").trim();
      if (summaryText.length > 5) {
        aiSummary = summaryText;
      }
    } catch (aiErr: any) {
      console.warn("[LinkBookmark] AI summary warning:", aiErr.message);
      if (description) {
        aiSummary = description.slice(0, 200);
      }
    }

    // 4. 구글 드라이브 폴더 및 구글 스프레드시트 탐색/생성 ([SheetBot] 네이밍 규칙 준수)
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

    let targetSpreadsheetId: string | null = null;
    let spreadsheetUrl = "";

    const queryStr = targetFolderId
      ? `'${targetFolderId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and name = '${sheetTitle}' and trashed = false`
      : `mimeType = 'application/vnd.google-apps.spreadsheet' and name = '${sheetTitle}' and trashed = false`;

    const sheetSearch = await listDriveFiles({
      query: queryStr,
      preferOAuth: true,
    }).catch(() => ({ files: [] }));

    const foundSheets = sheetSearch?.files || [];
    if (foundSheets.length > 0) {
      targetSpreadsheetId = foundSheets[0].id;
      spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`;
    } else {
      // 신규 시트 생성
      const createRes = await callSheetsTool("sheets_create_spreadsheet", {
        title: sheetTitle,
        preferOAuth: true,
      }).catch((err: any) => {
        console.warn("[LinkBookmark] sheets_create_spreadsheet warning:", err.message);
        return null;
      });

      targetSpreadsheetId = createRes?.spreadsheetId || createRes?.id || null;

      if (targetSpreadsheetId) {
        spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`;

        if (targetFolderId) {
          await moveDriveFile(targetSpreadsheetId, targetFolderId, true).catch(() => {});
        }

        // 헤더 8열 서식 기입
        const headers = [
          ["스크랩일시", "구분", "제목 / 콘텐츠명", "원본 URL 링크", "채널 / 출처", "AI 핵심 요약 (3줄)", "공유 메모", "등록 기기"]
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
          headerBgColor: "#991b1b", // 유튜브 레드/버건디 테마
          headerTextColor: "#ffffff",
          preferOAuth: true,
        }).catch(() => {});
      }
    }

    // 5. 시트에 신규 스크랩 행 추가
    if (targetSpreadsheetId) {
      const nowStr = new Date().toISOString().replace("T", " ").slice(0, 19);
      const newRowValues = [
        [nowStr, category, title, rawUrl, siteName, aiSummary, memo, deviceId]
      ];
      await callSheetsTool("sheets_append_values", {
        spreadsheetId: targetSpreadsheetId,
        range: "A:H",
        values: newRowValues,
        preferOAuth: true,
      }).catch((err: any) => console.warn("[LinkBookmark] append_values warning:", err.message));
    }

    // 6. SQLite 감사 대장 기록 (INTEGER id 규격 준수)
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
        created_at: new Date().toISOString(),
      },
    ]).catch((err) => console.warn("[LinkBookmark] DB log insert warning:", err.message));

    return NextResponse.json({
      success: true,
      message: `${category} '${title}' 링크가 성공적으로 구글 시트에 스크랩되었습니다.`,
      category,
      title,
      url: rawUrl,
      siteName,
      aiSummary,
      spreadsheetUrl,
    });
  } catch (err: any) {
    console.error("[LinkBookmark] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
