import { callSheetsTool } from "./egdesk-helpers";
import { getWorkspaceCallOptionsForEmail } from "./auth";

/**
 * 🛡️ 지능형 행 핑거프린트 가드 (Fingerprint Row Guard)
 * 
 * AI 비동기 배치 작업 수거 및 시트 갱신 시,
 * 사용자가 시트에서 해당 행을 '행 삭제'했거나 위/아래 행을 삽입/삭제하여 행 번호가 어긋난 경우,
 * 기존의 다른 정상 데이터를 덮어씌워 오염시키는 사고를 100% 원천 차단하고
 * 실제 유효 행 위치를 역추적(Dynamic Relocation)하거나 안전하게 중단(Abort)합니다.
 * 
 * @param options.spreadsheetId 대상 스프레드시트 ID
 * @param options.expectedRow 최초 적재 시의 행 번호 (예: 12)
 * @param options.fileName 업로드된 파일명 또는 고유 제목
 * @param options.fileUrl 구글 드라이브 파일 보기 URL (하이퍼링크 등)
 * @param options.pendingKeywords 해당 행에 존재해야 할 대기 표식 키워드 목록
 * @param options.userEmail 멀티테넌시 시트 접근 권한용 사용자 이메일
 * @param options.callOptions 이미 조회된 WorkspaceVisitorCallOptions
 * @returns 갱신할 안전한 유효 행 번호 (number), 사용자가 삭제했거나 이미 완료된 경우 null
 */
export async function resolveSafeTargetRow(options: {
  spreadsheetId: string;
  expectedRow: number;
  fileName?: string;
  fileUrl?: string;
  pendingKeywords?: string[];
  userEmail?: string;
  callOptions?: any;
}): Promise<{
  safeRow: number | null;
  reason: "MATCH_EXPECTED" | "MATCH_RELOCATED" | "ALREADY_COMPLETED" | "ABORT_USER_DELETED" | "ERROR";
}> {
  const { spreadsheetId, expectedRow, fileName, fileUrl, pendingKeywords = [], userEmail, callOptions } = options;
  if (!spreadsheetId || expectedRow <= 1) {
    return { safeRow: null, reason: "ERROR" };
  }

  const defaultKeywords = [
    "[AI 배치",
    "대기중",
    "대기 중",
    "분석 대기",
    "⏳",
    "AI 요약",
    "분석 중",
    "음성 분석",
    ...pendingKeywords,
  ];

  try {
    const effectiveCallOptions =
      callOptions || (userEmail ? await getWorkspaceCallOptionsForEmail(userEmail).catch(() => ({})) : {});

    const cleanFileName = fileName
      ? fileName.replace(/^\[SheetBot\]\s*/i, "").replace(/\.[^.]+$/, "").trim()
      : "";

    const checkLineMatchesFile = (lineStr: string): boolean => {
      if (!fileUrl && !fileName) return false;
      return Boolean(
        (fileUrl && lineStr.includes(fileUrl)) ||
          (fileName && lineStr.includes(fileName)) ||
          (cleanFileName.length >= 4 && lineStr.includes(cleanFileName))
      );
    };

    // 1단계: 기대 행(expectedRow)을 읽어와 핑거프린트 점검
    const testRange = `시트1!A${expectedRow}:M${expectedRow}`;
    let rowFetchError = false;
    const rowRes = await callSheetsTool(
      "sheets_get_range",
      {
        spreadsheetId,
        range: testRange,
        preferOAuth: true,
      },
      effectiveCallOptions
    ).catch((err: any) => {
      rowFetchError = true;
      console.warn(`[FingerprintGuard] Row read warning (${spreadsheetId} R${expectedRow}): ${err?.message || err}`);
      return null;
    });

    if (!rowFetchError && rowRes && Array.isArray(rowRes.values)) {
      const rowValues: string[] = rowRes.values[0] || [];
      const rowText = rowValues.join(" ");

      const hasPendingIndicator = defaultKeywords.some((kw) => rowText.includes(kw));
      const hasFileMatch = checkLineMatchesFile(rowText);

      if (fileName || fileUrl) {
        if (hasFileMatch && hasPendingIndicator) {
          return { safeRow: expectedRow, reason: "MATCH_EXPECTED" };
        }
        if (hasFileMatch && !hasPendingIndicator && rowText.trim().length > 0) {
          console.log(`[FingerprintGuard] ✅ Row ${expectedRow} for '${fileName}' is already analyzed. Skipping duplicate write.`);
          return { safeRow: null, reason: "ALREADY_COMPLETED" };
        }
      } else if (hasPendingIndicator) {
        return { safeRow: expectedRow, reason: "MATCH_EXPECTED" };
      }
    }

    // 2단계: 기대 행에 대기 표식이나 파일명이 없다 -> 행이 밀렸거나 삭제됨!
    console.warn(`[FingerprintGuard] ⚠️ Row ${expectedRow} does not match expected fingerprint. Starting dynamic relocation scan...`);

    let scanFetchError = false;
    const scanRes = await callSheetsTool(
      "sheets_get_range",
      {
        spreadsheetId,
        range: "시트1!A1:M200",
        preferOAuth: true,
      },
      effectiveCallOptions
    ).catch((err: any) => {
      scanFetchError = true;
      console.warn(`[FingerprintGuard] Scan read error (${spreadsheetId}): ${err?.message || err}`);
      return null;
    });

    if (scanFetchError || !scanRes || !Array.isArray(scanRes.values)) {
      console.warn(`[FingerprintGuard] ⚠️ Cannot read sheet ${spreadsheetId} (permission or network error). Deferring without aborting.`);
      return { safeRow: null, reason: "ERROR" };
    }

    const allRows: string[][] = scanRes.values;

    // 2-1. 파일 URL 또는 파일명 + 대기 표식으로 매칭되는 행 탐색 (역순: 최신 등록건 우선)
    if (fileUrl || fileName) {
      for (let i = allRows.length - 1; i >= 1; i--) {
        const lineStr = (allRows[i] || []).join(" ");
        const matchesFile = checkLineMatchesFile(lineStr);
        const matchesPending = defaultKeywords.some((kw) => lineStr.includes(kw));

        if (matchesFile && matchesPending) {
          const relocatedRow = i + 1;
          console.log(`[FingerprintGuard] 🎯 Relocated row found by strict file match: ${relocatedRow} for ${fileName}`);
          return { safeRow: relocatedRow, reason: "MATCH_RELOCATED" };
        }
      }

      // 2-2. 파일명은 존재하지만 대기 표식이 없는 경우 -> 이미 분석 완료된 행!
      for (let i = allRows.length - 1; i >= 1; i--) {
        const lineStr = (allRows[i] || []).join(" ");
        if (checkLineMatchesFile(lineStr)) {
          const completedRow = i + 1;
          console.log(`[FingerprintGuard] ✅ Relocated row ${completedRow} for '${fileName}' is already completed. Skipping duplicate write.`);
          return { safeRow: null, reason: "ALREADY_COMPLETED" };
        }
      }
    }

    // 3단계: 시트 전체 어디에도 해당 파일이나 대기 행이 없음 -> 사용자가 시트에서 행을 삭제함!
    console.warn(`[FingerprintGuard] 🛑 Neither expected row ${expectedRow} nor file '${fileName}' was found in sheet. User deleted the row. ABORTING write to prevent data corruption!`);
    return { safeRow: null, reason: "ABORT_USER_DELETED" };
  } catch (err: any) {
    console.error("[FingerprintGuard] Unexpected error during fingerprint check:", err.message);
    return { safeRow: null, reason: "ERROR" };
  }
}
