export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail, getWorkspaceCallOptionsForEmail } from "@/lib/auth";
import {
  callDriveTool,
  callSheetsTool,
  callAiCaller,
  listDriveFiles,
  WorkspaceVisitorCallOptions,
} from "@/lib/egdesk-helpers";
import { resolveUserSpreadsheet, SheetBindingType } from "@/lib/sheet-binding-helper";
import { uploadDriveFileWithBridge } from "@/lib/drive-upload-helper";
import {
  resolveDynamicCardManifest,
  unwrapAiCallerJson,
} from "@/lib/dynamic-card-helper";
import { getKoreanTimeString } from "@/lib/date-utils";

/**
 * 🛡️ 15초 중복 실행 방지 캐시 (Idempotency) & 사용자별 드라이브 폴더 메모리 캐시
 */
const recentDynamicExecutions = new Map<string, { timestamp: number; response: any }>();
const folderCache = new Map<string, string>();

async function ensureIsolatedDriveFolder(
  userEmail: string,
  folderName: string,
  callOptions?: WorkspaceVisitorCallOptions
): Promise<string | null> {
  const cacheKey = `${userEmail}:${folderName}`;
  if (folderCache.has(cacheKey)) {
    return folderCache.get(cacheKey)!;
  }

  try {
    const queryStr = `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName.replace(/'/g, "\\'")}' and trashed = false`;
    const searchRes = await listDriveFiles(
      { query: queryStr },
      { preferOAuth: true, ...callOptions }
    ).catch(() => ({ files: [] }));

    if (searchRes?.files && searchRes.files.length > 0 && searchRes.files[0]?.id) {
      const fid = searchRes.files[0].id;
      folderCache.set(cacheKey, fid);
      return fid;
    }

    const createRes = await callDriveTool(
      "drive_create_folder",
      { name: folderName, preferOAuth: true },
      callOptions
    ).catch(() => null);

    const folderId = (createRes as any)?.folderId || (createRes as any)?.id || null;
    if (folderId) {
      folderCache.set(cacheKey, folderId);
    }
    return folderId;
  } catch (err: any) {
    console.warn(`[DynamicCardExecute] Folder creation warning (${folderName}):`, err?.message);
    return null;
  }
}

/**
 * 🚀 POST /api/cards/dynamic/execute
 * 모바일 앱의 동적 카드(Server-Driven Dynamic Card)에서 전송된 입력값 + 첨부 이미지(1600px 압축)를 수신하여:
 * 1) 첨부 파일이 있을 경우 격리된 구글 드라이브 폴더에 업로드
 * 2) 카드 설계도(Manifest)의 aiPrompt와 sheetSpec.headers를 바탕으로 AI Caller 추출 수행
 * 3) 해당 카드의 전용 구글 스프레드시트를 자동 프로비저닝(헤더 자동 생성)하고 행을 추가
 */
export async function POST(req: NextRequest) {
  try {
    const headerEmail = req.headers.get("x-sheetbot-user-email");
    const contentType = req.headers.get("content-type") || "";

    let bodyEmail = "";
    let cardKey = "";
    let cardTitle = "";
    let rawManifestJson = "";
    let fieldsObj: Record<string, string> = {};
    let fileBuffer: Buffer | null = null;
    let fileName = "";
    let mimeType = "image/jpeg";

    if (contentType.includes("application/json")) {
      const json = await req.json();
      bodyEmail = json.userEmail || json.email || "";
      cardKey = (json.cardKey || json.key || "").trim();
      cardTitle = (json.cardTitle || json.title || "").trim();
      rawManifestJson =
        typeof json.manifest === "object"
          ? JSON.stringify(json.manifest)
          : String(json.manifestJson || json.manifest_json || "");
      fieldsObj = json.fields && typeof json.fields === "object" ? json.fields : {};
      fileName = json.fileName || "";
      mimeType = json.mimeType || "image/jpeg";

      const rawBase64 = json.fileBase64 || json.imageBase64 || "";
      if (rawBase64) {
        const cleanBase64 = String(rawBase64).replace(/^data:[^;]+;base64,/, "");
        fileBuffer = Buffer.from(cleanBase64, "base64");
      }
    } else {
      const formData = await req.formData();
      bodyEmail =
        (formData.get("userEmail") as string | null) ||
        (formData.get("email") as string | null) ||
        "";
      cardKey = ((formData.get("cardKey") as string | null) || "").trim();
      cardTitle = ((formData.get("cardTitle") as string | null) || "").trim();
      rawManifestJson = ((formData.get("manifestJson") as string | null) || "").trim();

      const rawFieldsStr = (formData.get("fieldsJson") as string | null) || "{}";
      try {
        fieldsObj = JSON.parse(rawFieldsStr);
      } catch {
        fieldsObj = {};
      }

      const file = formData.get("file") as File | null;
      if (file) {
        const arrBuf = await file.arrayBuffer();
        fileBuffer = Buffer.from(arrBuf);
        fileName = (formData.get("fileName") as string | null) || file.name || `card_${Date.now()}.jpg`;
        mimeType = file.type || "image/jpeg";
      }
    }

    let userEmail = (bodyEmail && bodyEmail.includes("@"))
      ? bodyEmail.trim().toLowerCase()
      : (headerEmail && headerEmail.includes("@") ? headerEmail.trim().toLowerCase() : "");

    if (!userEmail) {
      const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
      if (sessionEmail && sessionEmail.includes("@")) {
        userEmail = sessionEmail.trim().toLowerCase();
      }
    }

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }
    if (!cardKey) {
      return NextResponse.json({ success: false, error: "실행할 카드 고유 키(cardKey)가 필요합니다." }, { status: 400 });
    }

    // 1. 15초 멱등성(Idempotency) 방어
    const dedupSig = `${userEmail}:${cardKey}:${fileName}:${fileBuffer?.length || 0}:${JSON.stringify(fieldsObj)}`;
    const nowTs = Date.now();
    const cached = recentDynamicExecutions.get(dedupSig);
    if (cached && nowTs - cached.timestamp < 15000) {
      return NextResponse.json({
        ...cached.response,
        isDuplicate: true,
      });
    }
    if (recentDynamicExecutions.size > 200) {
      for (const [k, v] of recentDynamicExecutions.entries()) {
        if (nowTs - v.timestamp > 60000) recentDynamicExecutions.delete(k);
      }
    }

    const callOptions = await getWorkspaceCallOptionsForEmail(userEmail, req);

    // 2. 카드 설계도(Manifest) 로드
    const manifest = await resolveDynamicCardManifest(
      cardKey,
      rawManifestJson || null,
      cardTitle || cardKey
    );
    const headers =
      manifest.sheetSpec?.headers?.length > 0
        ? manifest.sheetSpec.headers
        : ["일련번호", "등록일시", "구분/분류", "핵심내용", "AI상세분석", "첨부파일URL", "비고"];
    const targetSheetTitle = manifest.sheetSpec?.sheetName || `[SheetBot] ${cardTitle || cardKey} 대장`;
    const targetFolderName = manifest.sheetSpec?.folderName || `[SheetBot] ${cardTitle || cardKey} 보관함`;

    // 3. 구글 드라이브 폴더 확보 및 첨부 파일 업로드 (Strict Folder-Id Guard 준수)
    const targetFolderId = await ensureIsolatedDriveFolder(userEmail, targetFolderName, callOptions);
    let driveFileUrl = "";

    if (fileBuffer && fileBuffer.length > 0) {
      if (!targetFolderId) {
        return NextResponse.json(
          {
            success: false,
            error: "구글 드라이브 대상 보관함 폴더를 확인할 수 없어 업로드를 중단했습니다. 구글 계정 연결을 확인해 주세요.",
          },
          { status: 500 }
        );
      }

      const uploaded = await uploadDriveFileWithBridge({
        buffer: fileBuffer,
        fileName: fileName || `${cardKey}_${Date.now()}.jpg`,
        folderId: targetFolderId,
        mimeType,
        preferOAuth: true,
        userEmail,
        callOptions,
      });
      driveFileUrl = uploaded.webViewLink || "";
    }

    // 4. AI Caller를 통한 데이터 추출 및 분석 (2중 언래핑 준수)
    const nowKst = getKoreanTimeString();
    let extractedMap: Record<string, any> = {};
    let aiSummary = "";

    const userInputsDescription = Object.entries(fieldsObj)
      .filter(([, v]) => v !== undefined && String(v).trim() !== "")
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n");

    const aiPromptText = `당신은 '${targetSheetTitle}' 업무 자동화 AI입니다.
${manifest.aiPrompt || "제공된 데이터와 첨부 이미지를 정밀 분석하여 시트 각 컬럼에 들어갈 값을 추출하세요."}

[사용자 입력 데이터]
${userInputsDescription || "(직접 입력된 텍스트 없음)"}
${driveFileUrl ? `[첨부 파일 URL]: ${driveFileUrl}` : ""}

[대상 시트 컬럼 헤더 목록]
${JSON.stringify(headers)}

반드시 아래 순수 JSON 형식으로만 응답하세요:
{
  "summary": "처리 결과 한 줄 요약 (모바일 화면 및 음성 안내용)",
  "columns": {
    // 위 대상 시트 컬럼 헤더 이름을 정확히 key로 하고, 추출된 값을 문자열/숫자로 매핑
  }
}`;

    try {
      const aiFiles =
        fileBuffer && fileBuffer.length > 0
          ? [
              {
                name: fileName || "attachment.jpg",
                content: fileBuffer.toString("base64"),
                encoding: "base64",
                mimeType,
              },
            ]
          : undefined;

      const aiRes = await callAiCaller(aiPromptText, {
        caller: `sheetbot-dynamic-card-${cardKey}`,
        temperature: 0.2,
        files: aiFiles,
      });

      const parsed = unwrapAiCallerJson<{ summary?: string; columns?: Record<string, any> }>(aiRes);
      if (parsed) {
        aiSummary = parsed.summary || "";
        extractedMap = parsed.columns || (parsed as Record<string, any>);
      }
    } catch (aiErr: any) {
      console.warn(`[DynamicCardExecute] AI Caller fallback for ${cardKey}:`, aiErr?.message);
    }

    // 5. 구글 스프레드시트 프로비저닝 및 행 데이터 조립
    const bindingType = `DYNAMIC_${cardKey.toUpperCase()}` as SheetBindingType;
    const resolvedSheet = await resolveUserSpreadsheet({
      userEmail,
      sheetType: bindingType,
      defaultTitle: targetSheetTitle,
      folderId: targetFolderId,
      preferOAuth: true,
      callOptions,
    });

    const spreadsheetId = resolvedSheet.spreadsheetId;
    const spreadsheetUrl =
      resolvedSheet.spreadsheetUrl ||
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    // 메인 탭 이름 확인 및 신규 시트일 경우 헤더 주입
    let primaryTabName = "시트1";
    try {
      const meta = await callSheetsTool(
        "sheets_get_spreadsheet",
        { spreadsheetId, preferOAuth: true },
        callOptions
      ).catch(() => null);
      if (meta?.sheets?.[0]?.title) {
        primaryTabName = meta.sheets[0].title;
      }

      const firstCell = await callSheetsTool(
        "sheets_get_range",
        { spreadsheetId, range: `${primaryTabName}!A1:A1`, preferOAuth: true },
        callOptions
      ).catch(() => null);

      const hasHeader = firstCell?.values?.[0]?.[0];
      if (!hasHeader) {
        const colEnd = String.fromCharCode(65 + Math.min(25, Math.max(0, headers.length - 1)));
        await callSheetsTool(
          "sheets_update_range",
          {
            spreadsheetId,
            range: `${primaryTabName}!A1:${colEnd}1`,
            values: [headers],
            preferOAuth: true,
          },
          callOptions
        );
        await callSheetsTool(
          "sheets_format_headers",
          { spreadsheetId, sheetName: primaryTabName, preferOAuth: true },
          callOptions
        ).catch(() => {});
      }
    } catch (sheetInitErr: any) {
      console.warn(`[DynamicCardExecute] Header check warning:`, sheetInitErr?.message);
    }

    // 6. 헤더 순서에 맞춰 행 값 배열 생성
    const serialNo = `SB-${Date.now().toString().slice(-6)}`;
    const firstInputText = Object.values(fieldsObj).find((v) => String(v).trim().length > 0) || "";

    const rowValues = headers.map((headerName) => {
      const h = headerName.trim();
      if (extractedMap[h] !== undefined && extractedMap[h] !== null && String(extractedMap[h]).trim() !== "") {
        return String(extractedMap[h]);
      }
      if (h.includes("일련번호") || h.includes("번호") && h.length <= 4) {
        return serialNo;
      }
      if (h.includes("일시") || h.includes("날짜") || h.includes("일자")) {
        return nowKst;
      }
      if (h.includes("URL") || h.includes("링크") || h.includes("사진") || h.includes("파일")) {
        return driveFileUrl || "";
      }
      if (h.includes("비고") || h.includes("메모")) {
        return fieldsObj.memo || firstInputText || "";
      }
      if (h.includes("분석") || h.includes("요약") || h.includes("내용")) {
        return aiSummary || firstInputText || "기록 완료";
      }
      return "";
    });

    await callSheetsTool(
      "sheets_append_values",
      {
        spreadsheetId,
        range: `${primaryTabName}!A1`,
        values: [rowValues],
        preferOAuth: true,
      },
      callOptions
    );

    const responsePayload = {
      success: true,
      cardKey,
      summary: aiSummary || `'${targetSheetTitle}'에 새 항목이 기록되었습니다.`,
      message: `🎉 '${targetSheetTitle}'에 성공적으로 기록되었습니다!`,
      extractedData: extractedMap,
      headers,
      rowValues,
      spreadsheetId,
      spreadsheetUrl,
      driveFileUrl: driveFileUrl || null,
    };

    recentDynamicExecutions.set(dedupSig, {
      timestamp: Date.now(),
      response: responsePayload,
    });

    return NextResponse.json(responsePayload);
  } catch (err: any) {
    console.error("[DynamicCardExecute] Error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || "동적 카드 실행 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
