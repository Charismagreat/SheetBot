export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { callAiCaller, callDriveTool, callSheetsTool } from "@/lib/egdesk-helpers";
import { recordAiUsageLog } from "@/lib/ai-usage";
import { checkTokenBalance, deductTokens } from "@/lib/token-wallet";
import fs from "fs";
import os from "os";
import path from "path";

// 검증된 프로덕션 활성 웹앱 배포 URL (Failover 보장용)
const KNOWN_ACTIVE_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbx7l5Ce6S4cwaU4mrDyUgZF5uKOSwU8zl3Nw_so5i6Rpl5MnMW6S98u1tgMrbHSl7zArw/exec";

// INVOICE 탭 헤더 정의 (총 25개 필드)
export const INVOICE_TAB_HEADERS = [
  "No.",
  "등록일시",
  "INVOICE NUMBER",
  "BILL TO",
  "SHIP TO",
  "ORDER NUMBER",
  "ORDER DATE",
  "PURCHASE ORDER",
  "BILLING CURRENCY",
  "INVOICE DATE",
  "SHIP DATE",
  "SHIP VIA",
  "PAYMENT TERMS",
  "Line",
  "Qty",
  "Part No. / Description",
  "Rev",
  "Cust Part No.",
  "Cust Po Line",
  "Unit Price",
  "Amount",
  "Country of Origin",
  "TAX",
  "TOTAL",
  "Etc"
];

// 상업송장(Commercial Invoice) 상세 분석 전용 AI 시스템 프롬프트
const INVOICE_SYSTEM_PROMPT = `당신은 상업송장(Commercial Invoice) 정밀 분석 및 대장화 AI입니다.
업로드된 인보이스 문서를 분석하여 아래 JSON 스키마에 맞추어 헤더 정보와 품목별 상세 Line Item 목록을 추출하세요.

[규칙]
1. 하나의 인보이스 문서에 여러 품목(Item / Line)이 존재하면 lineItems 배열에 각각 분할하여 누락 없이 담으세요.
   (예: 제품 품목 Line 2, 운임 Freight Line 3 등 각각 별도 lineItem으로 분리)
2. Part No와 Description은 'X578630\\nSprings'와 같이 줄바꿈으로 합쳐서 partNoDescription 필드에 담으세요.
3. Etc 필드에는 은행 송금 계좌 정보(Bank Name, Account Name, Swift Code, Routing Number, 기타 특이사항)를 줄바꿈으로 담으세요.
4. 금액과 수량은 콤마(,)나 통화기호를 적절히 보존하거나 숫자로 읽기 쉽게 기재하세요.
5. 문서가 인보이스가 아니거나 판독 불가능한 경우 action="UNSUPPORTED_OR_UNREADABLE"을 반환하세요.
6. 응답은 반드시 마크다운 코드블록 없는 순수 JSON이어야 합니다.

[JSON 응답 스키마]:
{
  "action": "PARSED" | "UNSUPPORTED_OR_UNREADABLE",
  "invoiceNumber": "4208670",
  "billTo": "WON CONDUCTOR TRADING CO,.Ltd.\\n16, MTV 25-ro 58 beon-gil\\n...",
  "shipTo": "WON CONDUCTOR TRADING CO,.Ltd.\\n16, MTV 25-ro 58 beon-gil\\n...",
  "orderNumber": "3257176",
  "orderDate": "7/7/2026",
  "purchaseOrder": "WONEC-S2657",
  "billingCurrency": "USD",
  "invoiceDate": "10/6/2026",
  "shipDate": "10/6/2026",
  "shipVia": "SEE DELIVERY INSTRUCTIONS",
  "paymentTerms": "NET60",
  "tax": "",
  "total": "4,840.00",
  "etc": "Bank Name: Bank of America, N.A.\\nSwift #: BOFAUS3N...",
  "lineItems": [
    {
      "line": "2",
      "qty": "100.00",
      "partNoDescription": "X578630\\nSprings",
      "rev": "B",
      "custPartNo": "",
      "custPoLine": "WONEC-S2657 item 2",
      "unitPrice": "48.40",
      "amount": "4,840.00",
      "countryOfOrigin": "USA"
    }
  ]
}`;

/**
 * 단일 인보이스 문서 AI 분석 헬퍼
 */
async function analyzeInvoiceDocumentWithAi(fileName: string, mimeType: string, fileBase64?: string | null) {
  const userMessagePrompt = `파일명: "${fileName}" (MIME: ${mimeType})
[문서 파일이 첨부되었습니다]

위 상업송장(Commercial Invoice) 문서를 정밀 분석하여 헤더 정보 및 모든 품목별 Line Item 상세 내역을 JSON으로 추출해 주세요.`;

  const aiOptions: any = {
    model: "gemini-2.5-flash",
    systemPrompt: INVOICE_SYSTEM_PROMPT,
  };

  if (fileBase64) {
    aiOptions.files = [
      {
        name: fileName || "invoice.pdf",
        content: fileBase64,
        mimeType: mimeType || "application/pdf",
      },
    ];
  }

  const aiRes = await callAiCaller(userMessagePrompt, aiOptions);
  const contentText = aiRes.text || aiRes.content || "";
  if (!contentText) {
    throw new Error("AI 응답이 비어있습니다.");
  }

  const jsonMatch = contentText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }
  return JSON.parse(contentText);
}

/**
 * 날짜를 yyyy-MM-dd HH:mm:ss 형식으로 포맷팅
 */
function getNowFormatted(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const mins = pad(d.getMinutes());
  const secs = pad(d.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutesToZero(mins)}:${secs}`;
}
function minutesToZero(m: string): string { return m; }

/**
 * 백그라운드 인보이스 분석 및 INVOICE 탭 누적 적재 워커
 */
async function processInvoiceFolderBackground(params: {
  spreadsheetId: string;
  folderId: string;
  webhookUrl?: string;
  userEmail: string;
}) {
  const { spreadsheetId, folderId, webhookUrl, userEmail } = params;
  const startLog = `[${new Date().toISOString()}] [INVOICE ASYNC START] folderId: ${folderId}, ss: ${spreadsheetId}, webhook: ${webhookUrl || "none"}, user: ${userEmail}\n`;
  try { fs.appendFileSync("C:/dev/SheetBot/debug_sync.log", startLog); } catch (_) {}
  console.log(`[auto-import-invoice] [ASYNC START] folderId: ${folderId}, ss: ${spreadsheetId}`);

  try {
    // 1. 드라이브 폴더 내 파일 목록 조회
    const listRes = await callDriveTool("drive_list_files", {
      folderId,
      preferOAuth: true,
      pageSize: 50,
    });
    const items = listRes?.files || listRes?.items || [];
    console.log(`[auto-import-invoice] [ASYNC] Found ${items.length} items in folder`);

    // 2. 완료함/미처리함 폴더 확인 및 생성
    let doneFolderId = "";
    let reviewFolderId = "";

    for (const item of items) {
      if (item.mimeType === "application/vnd.google-apps.folder") {
        if (item.name.includes("완료") || item.name.includes("처리완료함")) {
          doneFolderId = item.id;
        } else if (item.name.includes("확인필요") || item.name.includes("미처리보관함")) {
          reviewFolderId = item.id;
        }
      }
    }

    if (!doneFolderId) {
      try {
        const cf = await callDriveTool("drive_create_folder", {
          name: "📁 [완료] 처리완료함",
          parentId: folderId,
          preferOAuth: true,
        });
        doneFolderId = cf?.id || cf?.folderId || "";
      } catch (e: any) {
        console.warn("[auto-import-invoice] Failed to create done folder:", e.message);
      }
    }

    if (!reviewFolderId) {
      try {
        const rf = await callDriveTool("drive_create_folder", {
          name: "📁 [확인필요] 미처리보관함",
          parentId: folderId,
          preferOAuth: true,
        });
        reviewFolderId = rf?.id || rf?.folderId || "";
      } catch (e: any) {
        console.warn("[auto-import-invoice] Failed to create review folder:", e.message);
      }
    }

    // 3. 미처리 대상 문서 필터링 (PDF, 이미지 등)
    const targetFiles = items.filter((f: any) => {
      if (f.id === spreadsheetId) return false;
      if (f.mimeType === "application/vnd.google-apps.folder") return false;
      const name = (f.name || "").toLowerCase();
      const mType = (f.mimeType || "").toLowerCase();
      return (
        mType.includes("pdf") ||
        mType.includes("image") ||
        name.endsWith(".pdf") ||
        name.endsWith(".png") ||
        name.endsWith(".jpg") ||
        name.endsWith(".jpeg")
      );
    });

    console.log(`[auto-import-invoice] [ASYNC] Found ${targetFiles.length} target files to process`);
    if (targetFiles.length === 0) {
      return;
    }

    // 4. 기존 'INVOICE' 탭 데이터 읽기 (중복 등록 방지 및 No. 순번 추출)
    const invoiceTabRes = await callSheetsTool("sheets_get_range", {
      spreadsheetId,
      range: "INVOICE!A1:Y500",
      preferOAuth: true,
    }).catch(() => null);

    const existingRows: any[][] = invoiceTabRes?.values || [];
    let currentMaxNo = 0;
    const existingKeys = new Set<string>(); // "INVOICE_NO|LINE"

    if (existingRows.length > 1) {
      for (let r = 1; r < existingRows.length; r++) {
        const row = existingRows[r] || [];
        const noVal = parseInt(String(row[0] || "").replace(/[^0-9]/g, ""), 10);
        if (!isNaN(noVal) && noVal > currentMaxNo) {
          currentMaxNo = noVal;
        }
        const regAt = String(row[1] || "").trim();
        const invNo = String(row[2] || "").trim().toUpperCase();
        const lineVal = String(row[13] || "").trim();
        // 시스템에 의해 등록일시가 기입되어 완료된 행만 중복 체크 키로 등록
        if (regAt && invNo) {
          existingKeys.add(`${invNo}|${lineVal}`);
        }
      }
    }

    // 5. 각 파일별 AI 분석 및 행 생성
    for (const file of targetFiles) {
      const tmpPath = path.join(os.tmpdir(), `invoice_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`);
      try {
        console.log(`[auto-import-invoice] [ASYNC] Downloading ${file.name}...`);
        await callDriveTool("drive_download", {
          fileId: file.id,
          destPath: tmpPath,
          preferOAuth: true,
        });

        if (!fs.existsSync(tmpPath)) {
          console.error(`[auto-import-invoice] Downloaded file not found: ${tmpPath}`);
          continue;
        }

        const fileBuf = fs.readFileSync(tmpPath);
        const b64 = fileBuf.toString("base64");

        // AI 분석 실행
        const parsed = await analyzeInvoiceDocumentWithAi(file.name, file.mimeType || "application/pdf", b64);
        console.log(`[auto-import-invoice] [ASYNC] Parsed invoice: ${parsed.invoiceNumber}, lines: ${parsed.lineItems?.length || 0}`);

        if (parsed.action === "UNSUPPORTED_OR_UNREADABLE" || !parsed.invoiceNumber) {
          console.warn(`[auto-import-invoice] Unsupported or unreadable document: ${file.name}`);
          if (reviewFolderId) {
            await callDriveTool("drive_move", { fileId: file.id, destFolderId: reviewFolderId, preferOAuth: true });
          }
          continue;
        }

        const lineItems = Array.isArray(parsed.lineItems) && parsed.lineItems.length > 0
          ? parsed.lineItems
          : [
              {
                line: "1",
                qty: "",
                partNoDescription: "",
                rev: "",
                custPartNo: "",
                custPoLine: "",
                unitPrice: "",
                amount: parsed.total || "",
                countryOfOrigin: ""
              }
            ];

        const rowsToInsert: any[][] = [];
        const nowStr = getNowFormatted();

        for (const item of lineItems) {
          const invNo = String(parsed.invoiceNumber || "").trim().toUpperCase();
          const lineNo = String(item.line || "").trim();
          const key = `${invNo}|${lineNo}`;

          // 중복 방지: 이미 적재된 Invoice No + Line은 건너뜀
          if (existingKeys.has(key)) {
            console.log(`[auto-import-invoice] Skipping duplicate line item: ${key}`);
            continue;
          }
          existingKeys.add(key);

          currentMaxNo++;
          const rowData = [
            String(currentMaxNo),                   // A: No.
            nowStr,                                 // B: 등록일시
            String(parsed.invoiceNumber || ""),      // C: INVOICE NUMBER
            String(parsed.billTo || ""),             // D: BILL TO
            String(parsed.shipTo || ""),             // E: SHIP TO
            String(parsed.orderNumber || ""),        // F: ORDER NUMBER
            String(parsed.orderDate || ""),          // G: ORDER DATE
            String(parsed.purchaseOrder || ""),      // H: PURCHASE ORDER
            String(parsed.billingCurrency || ""),    // I: BILLING CURRENCY
            String(parsed.invoiceDate || ""),        // J: INVOICE DATE
            String(parsed.shipDate || ""),           // K: SHIP DATE
            String(parsed.shipVia || ""),            // L: SHIP VIA
            String(parsed.paymentTerms || ""),       // M: PAYMENT TERMS
            String(item.line || ""),                 // N: Line
            String(item.qty || ""),                  // O: Qty
            String(item.partNoDescription || ""),    // P: Part No. / Description
            String(item.rev || ""),                  // Q: Rev
            String(item.custPartNo || ""),           // R: Cust Part No.
            String(item.custPoLine || ""),           // S: Cust Po Line
            String(item.unitPrice || ""),            // T: Unit Price
            String(item.amount || ""),               // U: Amount
            String(item.countryOfOrigin || ""),      // V: Country of Origin
            String(parsed.tax || ""),                // W: TAX
            String(parsed.total || ""),              // X: TOTAL
            String(parsed.etc || "")                 // Y: Etc
          ];
          rowsToInsert.push(rowData);
        }

        if (rowsToInsert.length === 0) {
          console.log(`[auto-import-invoice] All items from ${file.name} were already registered.`);
          if (doneFolderId) {
            await callDriveTool("drive_move", { fileId: file.id, destFolderId: doneFolderId, preferOAuth: true });
          }
          continue;
        }

        // 🚀 【핵심 3단계: 역방향 웹훅 콜백 전송 (doPost)】
        let webhookSuccess = false;
        const targetWebhook = webhookUrl || KNOWN_ACTIVE_WEBHOOK_URL;

        try {
          console.log(`[auto-import-invoice] [ASYNC] Sending callback to ${targetWebhook}...`);
          const cbRes = await fetch(targetWebhook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "APPLY_INVOICE_TAB",
              spreadsheetId,
              rows: rowsToInsert,
              fileName: file.name,
              fileId: file.id,
              doneFolderId,
            }),
            redirect: "follow",
          });
          const cbBody = await cbRes.text().catch(() => "");
          console.log(`[auto-import-invoice] Callback status: ${cbRes.status}, body: ${cbBody}`);
          try {
            fs.appendFileSync("C:/dev/SheetBot/debug_sync.log", `[INVOICE CALLBACK] status=${cbRes.status}, body=${cbBody}\n`);
          } catch (_) {}
          webhookSuccess = cbRes.ok;
        } catch (cbErr: any) {
          console.error(`[auto-import-invoice] Callback error:`, cbErr.message);
        }

        // 🚀 【Failover: 정식 배포 URL 재시도】
        if (!webhookSuccess && targetWebhook !== KNOWN_ACTIVE_WEBHOOK_URL) {
          try {
            console.log(`[auto-import-invoice] Retrying with known webhook: ${KNOWN_ACTIVE_WEBHOOK_URL}`);
            const retryRes = await fetch(KNOWN_ACTIVE_WEBHOOK_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "APPLY_INVOICE_TAB",
                spreadsheetId,
                rows: rowsToInsert,
                fileName: file.name,
                fileId: file.id,
                doneFolderId,
              }),
              redirect: "follow",
            });
            webhookSuccess = retryRes.ok;
          } catch (rErr: any) {
            console.error("[auto-import-invoice] Retry error:", rErr.message);
          }
        }

        // 🛡️ 【이중안전가드: 웹훅 실패 시 서버 직접 시트 Append 기입】
        if (!webhookSuccess) {
          console.log(`[auto-import-invoice] [FALLBACK] Appending ${rowsToInsert.length} rows directly to INVOICE tab...`);
          await callSheetsTool("sheets_append_values", {
            spreadsheetId,
            range: "INVOICE!A:Y",
            values: rowsToInsert,
          });

          // 파일 완료함 이동
          if (doneFolderId) {
            await callDriveTool("drive_move", { fileId: file.id, destFolderId: doneFolderId, preferOAuth: true });
          }
        }

        // 토큰 차감 및 감사 로그
        await deductTokens(userEmail, 20, `상업송장(INVOICE) 상세 AI 분석 및 시트 등록 (${file.name})`);
        await recordAiUsageLog({
          userEmail,
          action: "INVOICE_TAB_DOC_SYNC",
          tokensUsed: 20,
          details: { fileName: file.name, invoiceNumber: parsed.invoiceNumber, linesInserted: rowsToInsert.length },
        });

      } catch (fErr: any) {
        console.error(`[auto-import-invoice] Error processing ${file.name}:`, fErr.message);
        if (reviewFolderId) {
          try {
            await callDriveTool("drive_move", { fileId: file.id, destFolderId: reviewFolderId, preferOAuth: true });
          } catch (_) {}
        }
      } finally {
        if (fs.existsSync(tmpPath)) {
          try { fs.unlinkSync(tmpPath); } catch (_) {}
        }
      }
    }

  } catch (err: any) {
    console.error("[auto-import-invoice] Fatal async worker error:", err.message);
  }
}

/**
 * POST /api/sheets/auto-import-invoice
 * 트리거 진입점 (0.05초 Fast-Return)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { spreadsheetId, folderId, webhookUrl, mode } = body;

    if (!spreadsheetId) {
      return NextResponse.json({ success: false, error: "spreadsheetId는 필수 항목입니다." }, { status: 400 });
    }

    if (!folderId) {
      return NextResponse.json({ success: false, error: "folderId는 필수 항목입니다." }, { status: 400 });
    }

    const headerEmail =
      req.headers.get("x-user-email") ||
      req.headers.get("x-sheetbot-user-email") ||
      req.headers.get("authorization")?.replace("Bearer ", "");
    const userEmail = (await getCurrentUserEmail()) || headerEmail || "chachogreat@gmail.com";

    // 토큰 잔액 점검
    const tokenCheck = await checkTokenBalance(userEmail);
    if (!tokenCheck.allowed || tokenCheck.balance <= 0) {
      return NextResponse.json({
        success: false,
        error: "토큰 잔액이 부족합니다. 코파일럿 사이드바에서 토큰을 충전해 주세요.",
      }, { status: 402 });
    }

    // 0.05초 비동기 Fast-Return
    setImmediate(() => {
      void processInvoiceFolderBackground({
        spreadsheetId,
        folderId,
        webhookUrl,
        userEmail,
      });
    });

    return NextResponse.json({
      success: true,
      message: "상업송장(INVOICE) AI 상세 분석 및 시트 등록 작업이 백그라운드에 등록되었습니다.",
      mode: mode || "async_webhook",
      userEmail,
    });

  } catch (error: any) {
    console.error("[auto-import-invoice] POST Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
