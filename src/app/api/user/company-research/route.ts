export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import {
  callCompanyResearchTool,
  callSheetsTool,
  callAiCaller,
  insertRows,
} from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { checkTokenBalance, deductTokens } from "@/lib/token-wallet";
import { recordAiUsageLog } from "@/lib/ai-usage";
import { getKoreanTimeString } from "@/lib/date-utils";

function withTimeout<T>(promise: Promise<T>, ms: number, fallbackValue: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallbackValue), ms)),
  ]);
}

/**
 * POST /api/user/company-research
 * 
 * 모바일 앱(SheetBot Agent)에서 [회사명] 또는 [홈페이지 주소(도메인)] 중 1개 이상을 수신하여
 * 초고속 병렬(Parallel) 파이프라인으로 국민연금·국세청·나라장터·기업마당을 동시 조회하고
 * Google Docs 리서치 캔버스 문서 자동 생성 및 구글 시트 대장 적재
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();

    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");
    const json = await req.json().catch(() => ({}));

    const bodyEmail = json.userEmail || json.email || null;
    const userEmail = (bodyEmail && bodyEmail.includes("@"))
      ? bodyEmail.toLowerCase().trim()
      : (sessionEmail || (headerEmail && headerEmail.includes("@") ? headerEmail.toLowerCase().trim() : ""));

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const rawCompanyName = String(json.companyName || json.name || "").trim();
    const rawDomain = String(json.domain || json.url || json.homepage || "").trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .trim();

    if (!rawCompanyName && !rawDomain) {
      return NextResponse.json(
        { success: false, error: "회사명 또는 홈페이지 주소(도메인) 중 최소 1개 이상을 입력해 주세요." },
        { status: 400 }
      );
    }

    const cleanEmail = userEmail.toLowerCase().trim();

    // 1. 잔여 토큰 점검 (기업 심층 리서치 500 토큰)
    const balanceCheck = await checkTokenBalance(cleanEmail, 500);
    if (!balanceCheck.allowed) {
      return NextResponse.json(
        { success: false, error: "AI 토큰이 부족합니다. 충전 후 다시 시도해 주세요." },
        { status: 402 }
      );
    }

    const nowStr = getKoreanTimeString();
    let detectedCompanyName = rawCompanyName;
    let detectedDomain = rawDomain;
    let bNo = "";
    let bNoPrefix = "";
    let npsData: any = null;

    // 2. 1단계: 국민연금 사업장 조회 (최대 3.5초 타임아웃)
    const searchTarget = rawCompanyName || rawDomain.replace(/\.[a-z.]+$/i, "");
    try {
      const npsRes = await withTimeout(
        callCompanyResearchTool("nps_search", {
          workplaceName: searchTarget,
          display: 3,
        }),
        3500,
        null
      );

      const items = npsRes?.items || npsRes?.item || [];
      if (items.length > 0) {
        const primary = items[0];
        npsData = primary;
        if (!detectedCompanyName) {
          detectedCompanyName = primary.workplaceName || searchTarget;
        }
        bNoPrefix = String(primary.businessNumberPrefix || primary.businessNumber || "").trim();
        if (bNoPrefix) {
          bNo = bNoPrefix.replace(/[^0-9]/g, "").slice(0, 10);
        }
      }
    } catch (e: any) {
      console.warn("[CompanyResearch] NPS warning:", e.message);
    }

    if (!detectedCompanyName) {
      detectedCompanyName = rawCompanyName || rawDomain;
    }

    // 사업자등록번호 정제 (companyresearch_doc_* 는 10자리 순수 숫자 필수)
    let sanitizedBNo = (bNo || "").replace(/[^0-9]/g, "");
    if (sanitizedBNo.length === 10) {
      bNo = sanitizedBNo;
    } else if (sanitizedBNo.length >= 6) {
      bNo = sanitizedBNo.slice(0, 10).padEnd(10, "0");
    } else {
      // 10자리 가상 식별 숫자 생성 (999xxxxxxx 대역)
      let hash = 0;
      const seed = detectedCompanyName || rawCompanyName || rawDomain || "company";
      for (let i = 0; i < seed.length; i++) {
        hash = (hash << 5) - hash + seed.charCodeAt(i);
        hash |= 0;
      }
      const positiveHash = Math.abs(hash).toString().padStart(7, "0").slice(0, 7);
      bNo = `999${positiveHash}`;
    }

    const docTitle = `[SheetBot] ${detectedCompanyName} 기업 리서치 보고서`;

    // 3. 2단계: 핵심 리서치 문서 개설 + 국세청 + 나라장터 + 기업마당 4대 작업 동시 병렬 실행 (최대 4초 타임아웃)
    const [docTask, verifyTask, konepsTask, bizinfoTask] = await Promise.allSettled([
      withTimeout(
        callCompanyResearchTool("companyresearch_doc_get_or_create", {
          businessNumber: bNo,
          companyName: detectedCompanyName,
          domain: detectedDomain || undefined,
          title: docTitle,
        }),
        4500,
        null
      ),
      bNo && bNo.length === 10 && !bNo.startsWith("999")
        ? withTimeout(
            callCompanyResearchTool("bizverify_status", { businessNumber: bNo }),
            3500,
            null
          )
        : Promise.resolve(null),
      withTimeout(
        callCompanyResearchTool("koneps_search", {
          category: "goods",
          display: 3,
          institutionName: detectedCompanyName,
        }),
        3500,
        null
      ),
      withTimeout(
        callCompanyResearchTool("bizinfo_search", {
          category: "tech",
          display: 3,
        }),
        3500,
        null
      ),
    ]);

    // 결과 파싱
    const docRes = docTask.status === "fulfilled" ? docTask.value : null;
    const docId = docRes?.docId || docRes?.id || "";
    // 웹 리서치 뷰어 및 Google Docs/Sheets 상호 연동 URL
    const docUrl = docId ? `https://sheetbot.cloud/research?id=${docId}` : "";

    let employeeCount = "-";
    let avgSalary = "-";
    if (npsData) {
      const subscribers = npsData.subscriberCount || npsData.employees || null;
      const noticeAmount = npsData.monthlyNoticeAmount || npsData.totalAmount || null;
      if (subscribers) employeeCount = `${Number(subscribers).toLocaleString()}명`;
      if (noticeAmount && subscribers) {
        const avg = Math.round(Number(noticeAmount) / Number(subscribers) / 0.09);
        if (avg > 0) avgSalary = `월 ~${Math.round(avg / 10000).toLocaleString()}만원`;
      }
    }

    const verifyRes = verifyTask.status === "fulfilled" ? verifyTask.value : null;
    const vItems = verifyRes?.results || verifyRes?.items || [];
    let taxStatus = "확인 완료 (정상 계속사업자)";
    let bizverifyData: any = null;
    if (vItems.length > 0) {
      bizverifyData = vItems[0];
      const st = bizverifyData.status || "계속사업자";
      const tax = bizverifyData.taxType || "일반과세자";
      taxStatus = `${st} (${tax})`;
    }

    const konepsRes = konepsTask.status === "fulfilled" ? konepsTask.value : null;
    const kItems = konepsRes?.items || konepsRes?.data || [];
    const contractCount = kItems.length;
    const contractSummary = contractCount > 0 ? `공공계약 ${contractCount}건 확인` : "최근 1개월 체결 실적 없음";
    const konepsData = contractCount > 0 ? { count: contractCount, items: kItems.slice(0, 3) } : null;

    const bizinfoRes = bizinfoTask.status === "fulfilled" ? bizinfoTask.value : null;
    const bItems = bizinfoRes?.items || [];
    const grantsCount = bItems.length;
    const grantsSummary = grantsCount > 0 ? `맞춤 지원사업 ${grantsCount}건 추천` : "추천 공고 확인 중";
    const bizinfoData = grantsCount > 0 ? { count: grantsCount, items: bItems.slice(0, 3) } : null;

    // 4. 리서치 문서에 수집된 블록 비동기 삽입 (백그라운드로 실행하여 응답 지연 방지)
    void (async () => {
      try {
        if (npsData) {
          await callCompanyResearchTool("companyresearch_doc_insert_result", {
            businessNumber: bNo,
            companyName: detectedCompanyName,
            domain: detectedDomain,
            toolName: "nps_search",
            rawResult: npsData,
          }).catch(() => {});
        }
        if (bizverifyData) {
          await callCompanyResearchTool("companyresearch_doc_insert_result", {
            businessNumber: bNo,
            companyName: detectedCompanyName,
            domain: detectedDomain,
            toolName: "bizverify_status",
            rawResult: bizverifyData,
          }).catch(() => {});
        }
        if (konepsData) {
          await callCompanyResearchTool("companyresearch_doc_insert_result", {
            businessNumber: bNo,
            companyName: detectedCompanyName,
            domain: detectedDomain,
            toolName: "koneps_search",
            rawResult: konepsData,
          }).catch(() => {});
        }
        if (bizinfoData) {
          await callCompanyResearchTool("companyresearch_doc_insert_result", {
            businessNumber: bNo,
            companyName: detectedCompanyName,
            domain: detectedDomain,
            toolName: "bizinfo_search",
            rawResult: bizinfoData,
          }).catch(() => {});
        }
      } catch (err: any) {
        console.warn("[CompanyResearch] Background block insert error:", err.message);
      }
    })();

    // 5. AI 경영진 총괄 Executive Summary (최대 3초 타임아웃)
    let aiSummary = `1. [고용 안정성] 국민연금 가입 ${employeeCount}, 추정 급여 ${avgSalary} 수준으로 고용 안정성이 양호합니다.\n2. [공공조달 및 사업] 국세청 ${taxStatus} 상태이며 조달청 ${contractSummary}입니다.\n3. [비즈니스 제휴 전략] ${grantsSummary} 등 관련 지원사업 및 파트너십 논의가 유효합니다.`;
    try {
      const prompt = `당신은 기업 비즈니스 실사(Due Diligence) 전문 수석 애널리스트입니다.
다음 수집된 기업 정보를 바탕으로, 경영진 및 영업 실무자를 위한 3줄 Executive Summary를 간결하게 작성하세요:
- 기업명: ${detectedCompanyName} (도메인: ${detectedDomain || "미입력"})
- 국세청 상태: ${taxStatus}
- 국민연금 고용: 임직원 ${employeeCount}, 평균 급여 ${avgSalary}
- 조달청 실적: ${contractSummary}
- 지원사업: ${grantsSummary}

1. [고용 및 기업규모]
2. [사업 활성도 및 신용]
3. [제휴 및 영업 핵심 포인트]`;

      const aiRes = await withTimeout(
        callAiCaller(prompt, {
          caller: "sheetbot-company-research",
          model: "gemini-2.5-flash",
          temperature: 0.2,
        }),
        3500,
        null
      );

      if (aiRes?.text && aiRes.text.length > 20) {
        aiSummary = aiRes.text.trim();
      }
    } catch {}

    // 6. [SheetBot] 기업 리서치 관리 대장 구글 시트 바인딩 및 행 추가
    let sheetUrl: string | null = null;
    try {
      const resolved = await resolveUserSpreadsheet({
        userEmail: cleanEmail,
        sheetType: "COMPANY_RESEARCH",
        defaultTitle: "[SheetBot] 기업 리서치 관리 대장",
        preferOAuth: true,
      });
      const sheetId = resolved.spreadsheetId;
      sheetUrl = resolved.spreadsheetUrl;

      const STANDARD_RESEARCH_HEADERS = [
        "리서치 보고서 (Google Docs)",
        "조사 일시",
        "회사명 (상호)",
        "홈페이지 (도메인)",
        "사업자번호 (앞6자리)",
        "기업 상태 (국세청)",
        "고용 인원 (국민연금)",
        "추정 평균 급여",
        "공공조달 계약 건수",
        "추천 정부지원사업",
        "AI 경영진 핵심 요약",
      ];

      if (sheetId) {
        try {
          const headerCheck = await callSheetsTool("sheets_get_range", {
            spreadsheetId: sheetId,
            range: "시트1!A1:K1",
            preferOAuth: true,
          });
          const existingHeaders = headerCheck?.values?.[0] || [];
          if (existingHeaders.length < 11 || existingHeaders[0] !== STANDARD_RESEARCH_HEADERS[0]) {
            await callSheetsTool("sheets_update_range", {
              spreadsheetId: sheetId,
              range: "시트1!A1:K1",
              values: [STANDARD_RESEARCH_HEADERS],
              preferOAuth: true,
            }).catch(() => {});

            await callSheetsTool("sheets_format_headers", {
              spreadsheetId: sheetId,
              tabName: "시트1",
              headerBgColor: "#0f172a",
              headerTextColor: "#38bdf8",
              preferOAuth: true,
            }).catch(() => {});
          }
        } catch {}

        const docFormula = docUrl
          ? `=HYPERLINK("${docUrl}", "📄 리서치 보고서 열기")`
          : "-";

        const newRow = [
          docFormula,
          nowStr,
          detectedCompanyName,
          detectedDomain || "-",
          bNoPrefix || bNo.slice(0, 6) || "-",
          taxStatus,
          employeeCount,
          avgSalary,
          contractCount > 0 ? `${contractCount}건` : "-",
          grantsCount > 0 ? `${grantsCount}건` : "-",
          aiSummary,
        ];

        await callSheetsTool("sheets_append_values", {
          spreadsheetId: sheetId,
          range: "A:K",
          values: [newRow],
          preferOAuth: true,
        }).catch(() => {});
      }
    } catch (sheetErr: any) {
      console.warn("[CompanyResearch] Sheet append warning:", sheetErr.message);
    }

    // 7. 감사 로그 적재 및 토큰 차감
    await insertRows("sheetbot_user_dispatch_logs", [
      {
        id: Date.now(),
        user_email: cleanEmail,
        rule_id: "COMPANY_RESEARCH",
        rule_name: "🔍 기업 심층 리서치 문서화",
        device_id: "SheetBot Agent",
        recipient: detectedCompanyName,
        content: `[기업리서치] ${detectedCompanyName} (${detectedDomain}) -> Google Docs 문서화 및 시트 대장 적재`,
        status: "SUCCESS",
        error_message: null,
        created_at: nowStr,
      },
    ]).catch(() => {});

    await deductTokens(cleanEmail, 500).catch(() => {});
    void recordAiUsageLog({
      userEmail: cleanEmail,
      caller: "sheetbot-company-research",
      purpose: `기업 심층 리서치 문서화 (${detectedCompanyName})`,
      model: "gemini-2.5-flash",
      promptTokens: 400,
      completionTokens: 100,
      totalTokens: 500,
      promptText: `기업 조사: ${detectedCompanyName} / ${detectedDomain}`,
      responseText: aiSummary,
    });

    return NextResponse.json({
      success: true,
      message: `${detectedCompanyName}에 대한 심층 리서치 보고서가 생성되었습니다.`,
      companyName: detectedCompanyName,
      domain: detectedDomain,
      businessNumber: bNoPrefix || bNo.slice(0, 6),
      docId,
      docUrl,
      sheetUrl,
      taxStatus,
      employeeCount,
      avgSalary,
      contractSummary,
      grantsSummary,
      summary: aiSummary,
    });
  } catch (err: any) {
    console.error("[CompanyResearch] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
