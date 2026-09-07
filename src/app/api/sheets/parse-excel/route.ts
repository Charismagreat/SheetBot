export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import * as XLSX from "xlsx";

export async function POST(request: Request) {
  try {
    const sessionEmail = await getCurrentUserEmail();
    const userEmail = sessionEmail || (process.env.NODE_ENV === "development" ? "test.user@sheetbot.dev" : null);
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: "업로드할 엑셀 파일을 선택해 주세요." }, { status: 400 });
    }

    const fileName = file.name;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // XLSX 워크북 파싱
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetNames = workbook.SheetNames || [];

    if (sheetNames.length === 0) {
      return NextResponse.json({ success: false, error: "유효한 시트가 포함되어 있지 않은 엑셀 파일입니다." }, { status: 400 });
    }

    // 선택된 시트 또는 첫 번째 시트 분석
    const targetSheetName = (formData.get("sheetName") as string) || sheetNames[0];
    const worksheet = workbook.Sheets[targetSheetName] || workbook.Sheets[sheetNames[0]];

    // 시트 데이터를 2차원 배열로 변환
    const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

    // 빈 행 제거 및 실제 헤더/데이터 행 감지
    const cleanRows = rawData.filter((row) => row && row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ""));

    if (cleanRows.length === 0) {
      return NextResponse.json({
        success: true,
        fileName,
        sheets: sheetNames,
        activeSheet: targetSheetName,
        headers: [],
        sampleRows: [],
        totalRows: 0,
        previewGrid: [],
        message: "시트에 데이터가 비어 있습니다.",
      });
    }

    // 헤더 행 (첫 번째 유효 행) 및 샘플 데이터 행 추출
    const headers = cleanRows[0].map((h, i) => {
      const str = String(h || "").trim();
      return str || `열_${String.fromCharCode(65 + i)}`;
    });

    const dataRows = cleanRows.slice(1);
    const sampleRows = dataRows.slice(0, 8); // 최대 8개 샘플 행

    return NextResponse.json({
      success: true,
      fileName,
      sheets: sheetNames,
      activeSheet: targetSheetName,
      headers,
      sampleRows,
      totalRows: cleanRows.length,
      dataRowCount: dataRows.length,
      previewGrid: cleanRows.slice(0, 10), // 미리보기용 상위 10개 행
      allRows: cleanRows.slice(0, 100), // 초기 세팅용 데이터 (최대 100행)
    });
  } catch (err: any) {
    console.error("[Parse-Excel] Error parsing file:", err);
    return NextResponse.json({
      success: false,
      error: `엑셀 파일 분석 실패: ${err.message || "파일 형식을 확인해 주세요."}`,
    }, { status: 500 });
  }
}
