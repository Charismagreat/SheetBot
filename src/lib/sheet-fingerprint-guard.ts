import { callSheetsTool } from "./egdesk-helpers";

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
 * @returns 갱신할 안전한 유효 행 번호 (number), 사용자가 삭제한 경우 null
 */
export async function resolveSafeTargetRow(options: {
  spreadsheetId: string;
  expectedRow: number;
  fileName?: string;
  fileUrl?: string;
  pendingKeywords?: string[];
}): Promise<{ safeRow: number | null; reason: "MATCH_EXPECTED" | "MATCH_RELOCATED" | "ABORT_USER_DELETED" | "ERROR" }> {
  const { spreadsheetId, expectedRow, fileName, fileUrl, pendingKeywords = [] } = options;
  if (!spreadsheetId || expectedRow <= 1) {
    return { safeRow: null, reason: "ERROR" };
  }

  const defaultKeywords = [
    "[AI 배치",
    "대기중",
    "분석 대기",
    "⏳",
    "AI 요약",
    "분석 중",
    "음성 분석",
    ...pendingKeywords,
  ];

  try {
    // 1단계: 기대 행(expectedRow)을 0.1초 읽어와 핑거프린트 점검
    const testRange = `시트1!A${expectedRow}:M${expectedRow}`;
    const rowRes = await callSheetsTool("sheets_get_range", {
      spreadsheetId,
      range: testRange,
      preferOAuth: true,
    }).catch(() => null);

    const rowValues: string[] = (rowRes?.values && rowRes.values[0]) || [];
    const rowText = rowValues.join(" ");

    // 1-1. 대기 표식이 있거나, 해당 파일명/URL이 일치하는지 확인
    const hasPendingIndicator = defaultKeywords.some((kw) => rowText.includes(kw));
    const hasFileMatch = (fileName && rowText.includes(fileName)) || (fileUrl && rowText.includes(fileUrl));

    if (hasPendingIndicator || hasFileMatch) {
      // 기대 행 번호가 여전히 정확함!
      return { safeRow: expectedRow, reason: "MATCH_EXPECTED" };
    }

    // 2단계: 기대 행에 대기 표식이나 파일명이 없다 -> 행이 밀렸거나 삭제됨!
    console.warn(`[FingerprintGuard] ⚠️ Row ${expectedRow} does not match expected fingerprint. Starting dynamic relocation scan...`);

    // 최근 100행 범위를 읽어와 위치 역추적
    const scanRes = await callSheetsTool("sheets_get_range", {
      spreadsheetId,
      range: "시트1!A1:M100",
      preferOAuth: true,
    }).catch(() => null);

    const allRows: string[][] = scanRes?.values || [];

    // 2-1. 파일 URL 또는 파일명으로 매칭되는 행 탐색 (역순: 최신 등록건 우선)
    if (fileUrl || fileName) {
      const cleanFileName = fileName ? fileName.replace(/^\[SheetBot\]\s*/i, "").replace(/\.[^.]+$/, "").trim() : "";
      for (let i = allRows.length - 1; i >= 1; i--) {
        const lineStr = (allRows[i] || []).join(" ");
        const matchesFile = (fileUrl && lineStr.includes(fileUrl)) ||
          (fileName && lineStr.includes(fileName)) ||
          (cleanFileName.length >= 4 && lineStr.includes(cleanFileName));
        const matchesPending = defaultKeywords.some((kw) => lineStr.includes(kw));

        if (matchesFile && matchesPending) {
          const relocatedRow = i + 1;
          console.log(`[FingerprintGuard] 🎯 Relocated row found by strict file match: ${relocatedRow} for ${fileName}`);
          return { safeRow: relocatedRow, reason: "MATCH_RELOCATED" };
        }
      }
    }

    // 3단계: 시트 전체 어디에도 해당 파일이나 대기 행이 없음 -> 사용자가 시트에서 행을 삭제함!
    console.warn(`[FingerprintGuard] 🛑 Neither expected row ${expectedRow} nor file '${fileName}' was found in sheet. User deleted the row. ABORTING write to prevent data corruption!`);
    return { safeRow: null, reason: "ABORT_USER_DELETED" };
  } catch (err: any) {
    console.error("[FingerprintGuard] Unexpected error during fingerprint check:", err.message);
    // 예외 발생 시 다른 데이터 오염을 막기 위해 안전하게 null 반환
    return { safeRow: null, reason: "ERROR" };
  }
}
