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

// 정적 탭 스키마 컨텍스트 (사용 중인 SPRING, BAND 2대 탭으로 확정)
const SYSTEM_PROMPT = `수입/무역 수불부 자동화 AI입니다. 업로드 문서를 분석하여 SPRING 또는 BAND 탭 중 알맞은 탭의 기입 정보를 JSON으로 출력하세요.

[탭 판정 규칙]
1. SPRING 탭: 달러($) 통화, Bal Seal 공급사, 스프링 품목(Part No: X...), PO NO: S25xx/S26xx. 인보이스일자=N열. 결제조건=NET60.
   - 중요: Bal Seal 인보이스에서 'WONEC-S2657' 및 'Cust PO Line #: 2' 또는 'Item 2'가 표기된 경우, 시트 매칭 PO NO는 반드시 'S2657-2' 형식으로 정확히 조합하세요.
2. BAND 탭: 유로(€) 통화, 밴드 품목(BAND, FLAT SPRING), PO NO: B25xx/B26xx. 인보이스일자=J열. 결제조건=NET30.
3. 문서가 무역과 무관하거나 판독 불가능하면 action="UNSUPPORTED_OR_UNREADABLE" 지정.
4. 계산 수식 열(금액, 결제금액, 합계, 송금예정일 등)은 절대 덮어쓰지 마세요.

응답 형식 (JSON만 출력):
{
  "targetTab": "SPRING" | "BAND",
  "action": "UPDATE_ROW" | "INSERT_ROW" | "UNSUPPORTED_OR_UNREADABLE",
  "matchCriteria": { "poNo": "S2657-2", "partNo": "X578630", "orderDate": "YYYY-MM-DD", "quantity": 100 },
  "updates": { "N": "MM/DD/YYYY" },
  "updatesDetail": [{ "colLetter": "N", "colName": "인보이스일자", "value": "MM/DD/YYYY" }],
  "documentSummary": { "docType": "INVOICE", "invoiceNo": "...", "invoiceDate": "...", "supplier": "...", "poNo": "...", "partNo": "...", "quantity": 0, "amount": 0 },
  "reasoning": "판단 사유"
}`;

/**
 * 단일 문서 AI 분석 헬퍼
 */
async function analyzeDocumentWithAi(fileName: string, mimeType: string, fileBase64?: string | null, fileText?: string | null) {
  const userMessagePrompt = `파일명: "${fileName}" (MIME: ${mimeType})
${fileText ? `[문서 추출 텍스트]:\n${fileText}\n` : "[문서 파일이 첨부되었습니다]"}

위 문서를 정밀 분석하여 'SPRING' 또는 'BAND' 탭 중 어느 탭의 어떤 열에 값을 입력해야 할지 최적의 결과를 JSON으로 판단해 주세요.`;

  const aiOptions: any = {
    model: "gemini-2.5-flash",
    systemPrompt: SYSTEM_PROMPT,
  };

  if (fileBase64) {
    aiOptions.files = [
      {
        name: fileName || "document.pdf",
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
 * 백그라운드 폴더 비동기 동기화 및 역방향 웹훅 콜백 워커 (Two-Way Async Webhook)
 */
async function runAsyncFolderSyncWithWebhook(params: {
  spreadsheetId: string;
  folderId: string;
  webhookUrl?: string;
  userEmail: string;
}) {
  const { spreadsheetId, folderId, webhookUrl, userEmail } = params;
  const logMsg = `[${new Date().toISOString()}] [ASYNC START] folderId: ${folderId}, ss: ${spreadsheetId}, webhook: ${webhookUrl || "none"}, user: ${userEmail}\n`;
  try { fs.appendFileSync("C:/dev/SheetBot/debug_sync.log", logMsg); } catch (_) {}
  console.log(`[auto-import-doc] [ASYNC START] folderId: ${folderId}, ss: ${spreadsheetId}, webhook: ${webhookUrl || "none"}, user: ${userEmail}`);

  try {
    // 1. 드라이브 폴더 내 파일 목록 조회
    const listRes = await callDriveTool("drive_list_files", {
      folderId,
      preferOAuth: true,
      pageSize: 50,
    });
    const items = listRes?.files || listRes?.items || [];
    try { fs.appendFileSync("C:/dev/SheetBot/debug_sync.log", `Found ${items.length} items in folder: ${items.map((i: any) => i.name).join(", ")}\n`); } catch (_) {}
    console.log(`[auto-import-doc] [ASYNC] Found ${items.length} items in folder`);

    // 2. 하위 완료함/미처리함 폴더 확인 또는 생성
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
        console.warn("[auto-import-doc] Failed to create done folder:", e.message);
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
        console.warn("[auto-import-doc] Failed to create review folder:", e.message);
      }
    }

    // 3. 미처리 대상 파일 필터링
    const targetFiles = items.filter((f: any) => {
      if (f.id === spreadsheetId) return false;
      if (f.mimeType === "application/vnd.google-apps.folder") return false;
      if (f.name.includes("수입,발주 현황")) return false;
      const isDoc = f.name.match(/\.(pdf|png|jpg|jpeg|tif|tiff|xlsx|xls|csv)$/i) ||
                    (f.mimeType && (f.mimeType.includes("pdf") || f.mimeType.includes("image")));
      return Boolean(isDoc);
    });

    console.log(`[auto-import-doc] [ASYNC] ${targetFiles.length} pending document(s) to process`);
    if (targetFiles.length === 0) return;

    // 4. 각 파일 순회 분석 및 콜백
    for (const file of targetFiles) {
      const safeBasename = path.basename(file.name || "document.pdf").replace(/[/\\?%*:|"<>]/g, "_");
      const tmpPath = path.join(os.tmpdir(), `sb_async_${Date.now()}_${safeBasename}`);

      try {
        console.log(`[auto-import-doc] [ASYNC] Processing file: ${file.name} (${file.id})`);

        // 파일 다운로드
        await callDriveTool("drive_download", {
          fileId: file.id,
          destPath: tmpPath,
          preferOAuth: true,
        });

        if (!fs.existsSync(tmpPath)) {
          console.warn(`[auto-import-doc] Download failed for ${file.name}`);
          continue;
        }

        const fileBuf = fs.readFileSync(tmpPath);
        const b64 = fileBuf.toString("base64");

        // AI 분석 실행
        const parsedResult = await analyzeDocumentWithAi(file.name, file.mimeType || "application/pdf", b64);
        console.log(`[auto-import-doc] [ASYNC] AI analysis result for ${file.name}:`, parsedResult.action, parsedResult.targetTab);

        if (parsedResult.action === "UNSUPPORTED_OR_UNREADABLE") {
          if (reviewFolderId) {
            await callDriveTool("drive_move", { fileId: file.id, destFolderId: reviewFolderId, preferOAuth: true });
          }
          continue;
        }

        const targetTab = parsedResult.targetTab || "SPRING";
        const isSpring = targetTab === "SPRING";

        // 기존 시트 데이터 읽어 타겟 행 탐색
        const rangeStr = `${targetTab}!A1:AB200`;
        const sheetDataRes = await callSheetsTool("sheets_get_range", {
          spreadsheetId,
          range: rangeStr,
          preferOAuth: true,
        });

        const rows: any[][] = sheetDataRes?.values || [];
        const startRow = isSpring ? 3 : 4; // 1-indexed
        const poColIdx = isSpring ? 6 : 3; // G열=6, D열=3 (0-indexed)
        const partColIdx = isSpring ? 2 : 1; // C열=2, B열=1 (0-indexed)
        const invColLetter = isSpring ? "N" : "J";

        let targetRowIndex = -1;
        const matchPo = String(parsedResult.matchCriteria?.poNo || "").trim();
        const matchPart = String(parsedResult.matchCriteria?.partNo || "").trim().toUpperCase();

        let bestRowIndex = -1;
        let bestScore = -1;
        const cleanMatchPo = matchPo.replace(/^WONEC-/i, "").replace(/[^A-Z0-9-]/gi, "").toUpperCase();

        for (let r = startRow - 1; r < rows.length; r++) {
          const row = rows[r] || [];
          const rowPo = String(row[poColIdx] || "").trim().toUpperCase();
          const cleanRowPo = rowPo.replace(/^WONEC-/i, "").replace(/[^A-Z0-9-]/gi, "").toUpperCase();
          const rowPart = String(row[partColIdx] || "").trim().toUpperCase();
          const currentInvDate = String(row[isSpring ? 13 : 9] || "").trim();

          let score = 0;

          const isExactPo = cleanMatchPo && cleanRowPo && (cleanMatchPo === cleanRowPo || cleanRowPo.endsWith(cleanMatchPo) || cleanMatchPo.endsWith(cleanRowPo));
          const isPartialPo = cleanMatchPo && cleanRowPo && (cleanRowPo.includes(cleanMatchPo) || cleanMatchPo.includes(cleanRowPo));
          const isPartMatch = matchPart && rowPart && rowPart === matchPart;

          if (isExactPo && isPartMatch) {
            score = 100; // PO와 품번 동시 완전 일치 (최우선)
          } else if (isExactPo) {
            score = 80;  // PO 완전 일치
          } else if (isPartialPo && isPartMatch) {
            score = 70;  // PO 부분 일치 + 품번 일치
          } else if (isPartMatch && !currentInvDate) {
            score = 40;  // 아직 송장일자가 비어있는 품번 일치 행
          } else if (isPartialPo) {
            score = 30;  // PO 부분 일치
          }

          if (score > bestScore) {
            bestScore = score;
            bestRowIndex = r + 1; // 1-indexed
            if (score === 100) break; // 완벽 일치 행 발견 시 즉시 확정
          }
        }

        // 🔒 【절대 원칙: 100점 만점 엄격 가드】
        // 오직 PO 번호와 품번이 둘 다 완벽하게 일치(100점 만점)하는 행에만 기입을 허용합니다!
        if (bestRowIndex !== -1 && bestScore === 100) {
          targetRowIndex = bestRowIndex;
          try { fs.appendFileSync("C:/dev/SheetBot/debug_sync.log", `[100PT MATCH CONFIRMED] File ${file.name} -> Row ${targetRowIndex} (PO: ${matchPo}, Part: ${matchPart})\n`); } catch (_) {}
        } else {
          // 100점 미달(조건 불일치) 시: 절대 시트에 오기입하지 않고, 미처리보관함으로 안전 격리!
          console.warn(`[auto-import-doc] [100PT GUARD] File ${file.name} does not meet 100% criteria (bestScore=${bestScore}, bestRow=${bestRowIndex}). Moving to review folder.`);
          try { fs.appendFileSync("C:/dev/SheetBot/debug_sync.log", `[100PT GUARD BLOCKED] File ${file.name} score=${bestScore} (PO: ${matchPo}, Part: ${matchPart}) -> Skipped sheet update & moved to review folder\n`); } catch (_) {}

          if (reviewFolderId) {
            try {
              await callDriveTool("drive_move", { fileId: file.id, destFolderId: reviewFolderId, preferOAuth: true });
            } catch (_) {}
          }
          continue; // 시트 기입을 건너뛰고 다음 파일로 이동
        }

        const invoiceDate = parsedResult.updates?.[invColLetter] ||
                            parsedResult.updatesDetail?.find((d: any) => d.colLetter === invColLetter)?.value ||
                            parsedResult.documentSummary?.invoiceDate || "";

        // 🚀 【핵심 3단계: 역방향 웹훅 콜백 전송】
        let webhookSuccess = false;
        if (webhookUrl && invoiceDate) {
          try {
            console.log(`[auto-import-doc] [ASYNC] Sending callback webhook to ${webhookUrl}...`);
            const cbRes = await fetch(webhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                spreadsheetId,
                targetTab,
                appliedRow: targetRowIndex,
                colLetter: invColLetter,
                value: invoiceDate,
                fileName: file.name,
                fileId: file.id,
                doneFolderId,
                reasoning: parsedResult.reasoning || "AI 분석 웹훅 자동 반영",
              }),
              redirect: "follow",
            });
            const cbBody = await cbRes.text().catch(() => "");
            try { fs.appendFileSync("C:/dev/SheetBot/debug_sync.log", `Webhook callback to ${webhookUrl}: status=${cbRes.status}, body=${cbBody}\n`); } catch (_) {}
            console.log(`[auto-import-doc] [ASYNC] Webhook callback status: ${cbRes.status}`);
            webhookSuccess = cbRes.ok;
          } catch (cbErr: any) {
            try { fs.appendFileSync("C:/dev/SheetBot/debug_sync.log", `Webhook callback FAILED: ${cbErr.message}\n`); } catch (_) {}
            console.error(`[auto-import-doc] [ASYNC] Webhook callback failed:`, cbErr.message);
          }
        }

        // 🚀 【웹훅 404/실패 시 2차 안전망: 검증된 정식 배포 웹앱 URL로 자동 재시도】
        if (!webhookSuccess && invoiceDate && webhookUrl !== KNOWN_ACTIVE_WEBHOOK_URL) {
          try {
            console.log(`[auto-import-doc] [ASYNC FAILOVER] Retrying with known active webhook: ${KNOWN_ACTIVE_WEBHOOK_URL}`);
            const retryRes = await fetch(KNOWN_ACTIVE_WEBHOOK_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                spreadsheetId,
                targetTab,
                appliedRow: targetRowIndex,
                colLetter: invColLetter,
                value: invoiceDate,
                fileName: file.name,
                fileId: file.id,
                doneFolderId,
                reasoning: parsedResult.reasoning || "AI 분석 웹훅 자동 반영 (Failover)",
              }),
              redirect: "follow",
            });
            const retryBody = await retryRes.text().catch(() => "");
            try { fs.appendFileSync("C:/dev/SheetBot/debug_sync.log", `Failover Webhook to ${KNOWN_ACTIVE_WEBHOOK_URL}: status=${retryRes.status}, body=${retryBody}\n`); } catch (_) {}
            webhookSuccess = retryRes.ok;
          } catch (retryErr: any) {
            console.error("[auto-import-doc] [ASYNC FAILOVER ERROR]:", retryErr.message);
          }
        }

        // 🛡️ 【이중안전가드: 웹훅 실패 시 서버 직접 폴백 기입 및 파란색 스타일링 동기화】
        if (!webhookSuccess && invoiceDate) {
          // 1. 셀 값 먼저 안전하게 직접 기입
          await callSheetsTool("sheets_update_range", {
            spreadsheetId,
            range: `${targetTab}!${invColLetter}${targetRowIndex}`,
            values: [[invoiceDate]],
          });
          console.log(`[auto-import-doc] [ASYNC FALLBACK] Updated ${targetTab}!${invColLetter}${targetRowIndex} = ${invoiceDate}`);

          // 2. 수식 자동 보완
          const formulaUpdates: Array<{ range: string; values: string[][] }> = [];
          if (isSpring) {
            formulaUpdates.push({ range: `${targetTab}!AA${targetRowIndex}`, values: [[`=N${targetRowIndex}+60`]] });
            formulaUpdates.push({ range: `${targetTab}!W${targetRowIndex}`, values: [[`=U${targetRowIndex}*10`]] });
            formulaUpdates.push({ range: `${targetTab}!Y${targetRowIndex}`, values: [[`=X${targetRowIndex}*J${targetRowIndex}`]] });
            formulaUpdates.push({ range: `${targetTab}!Z${targetRowIndex}`, values: [[`=R${targetRowIndex}+U${targetRowIndex}+Y${targetRowIndex}`]] });
          } else {
            formulaUpdates.push({ range: `${targetTab}!V${targetRowIndex}`, values: [[`=J${targetRowIndex}+30`]] });
            formulaUpdates.push({ range: `${targetTab}!R${targetRowIndex}`, values: [[`=P${targetRowIndex}*10`]] });
            formulaUpdates.push({ range: `${targetTab}!T${targetRowIndex}`, values: [[`=S${targetRowIndex}*F${targetRowIndex}`]] });
            formulaUpdates.push({ range: `${targetTab}!U${targetRowIndex}`, values: [[`=T${targetRowIndex}+P${targetRowIndex}+M${targetRowIndex}`]] });
          }
          for (const fu of formulaUpdates) {
            try {
              await callSheetsTool("sheets_update_range", { spreadsheetId, range: fu.range, values: fu.values });
            } catch (_) {}
          }

          // 3. 🎨 【이중안전가드 전용 파란색 스타일링(#1a73e8, bold) 자동 동기화】
          // 앱스크립트 웹앱 GET 엔드포인트(action=apply_doc)를 직접 호출하여 해당 셀을 앱스크립트와 완전히 동일한 파란색 글씨와 굵은 글씨로 포맷팅!
          try {
            const styleUrl = new URL(KNOWN_ACTIVE_WEBHOOK_URL);
            styleUrl.searchParams.set("action", "apply_doc");
            styleUrl.searchParams.set("spreadsheetId", spreadsheetId);
            styleUrl.searchParams.set("targetTab", targetTab);
            styleUrl.searchParams.set("appliedRow", String(targetRowIndex));
            styleUrl.searchParams.set("colLetter", invColLetter);
            styleUrl.searchParams.set("value", invoiceDate);
            styleUrl.searchParams.set("fileId", file.id);
            if (doneFolderId) styleUrl.searchParams.set("doneFolderId", doneFolderId);

            console.log(`[auto-import-doc] [ASYNC FALLBACK STYLE] Applying blue font style to ${targetTab}!${invColLetter}${targetRowIndex}...`);
            const styleRes = await fetch(styleUrl.toString(), {
              method: "GET",
              redirect: "follow",
            });
            const styleBody = await styleRes.text().catch(() => "");
            console.log(`[auto-import-doc] [ASYNC FALLBACK STYLE] Result (${styleRes.status}):`, styleBody);
            try {
              fs.appendFileSync(
                "C:/dev/SheetBot/debug_sync.log",
                `[FALLBACK BLUE STYLE APPLIED] Row ${targetRowIndex} (${targetTab}!${invColLetter}${targetRowIndex}) -> Status ${styleRes.status}\n`
              );
            } catch (_) {}
          } catch (styleErr: any) {
            console.error(`[auto-import-doc] [ASYNC FALLBACK STYLE ERROR]:`, styleErr.message);
          }

          // 4. 완료 파일 이동
          if (doneFolderId) {
            try {
              await callDriveTool("drive_move", { fileId: file.id, destFolderId: doneFolderId, preferOAuth: true });
            } catch (_) {}
          }
        }

        // 토큰 차감 및 감사 로그
        await deductTokens(userEmail, 15, `AI 문서 자동 분석 및 웹훅 반영 (${file.name})`);
        await recordAiUsageLog({
          userEmail,
          action: "TWO_WAY_WEBHOOK_DOC_SYNC",
          tokensUsed: 15,
          details: { fileName: file.name, targetTab, action: parsedResult.action, row: targetRowIndex },
        });

      } catch (fileErr: any) {
        console.error(`[auto-import-doc] [ASYNC] File error (${file.name}):`, fileErr.message);
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

    console.log(`[auto-import-doc] [ASYNC COMPLETED] Successfully processed folder ${folderId}`);
  } catch (err: any) {
    console.error("[auto-import-doc] [ASYNC FATAL ERROR]:", err);
  }
}

export async function POST(request: Request) {
  try {
    // 0. 헤더 기반 이메일 최우선 확인 (0ms 즉시 해결, 11초 인증 지연 원천 차단)
    const headerEmail = request.headers.get("x-user-email") || request.headers.get("x-sheetbot-user-email");
    let userEmail = (headerEmail && headerEmail.includes("@")) ? headerEmail.toLowerCase().trim() : "";
    if (!userEmail) {
      const sessionEmail = await getCurrentUserEmail();
      userEmail = sessionEmail || "chachogreat@gmail.com";
    }

    const body = await request.json();
    const { spreadsheetId, folderId, webhookUrl, mode, fileId, fileName, mimeType, fileBase64: clientBase64, fileText: clientFileText } = body;
    try { fs.appendFileSync("C:/dev/SheetBot/debug_sync.log", `[${new Date().toISOString()}] [POST INCOMING] body: ${JSON.stringify(body)}\n`); } catch (_) {}

    if (!spreadsheetId) {
      return NextResponse.json(
        { success: false, error: "spreadsheetId는 필수 항목입니다." },
        { status: 400 }
      );
    }

    // 🚀 【양방향 완전 비동기 웹훅 파이프라인 (Two-Way Async Webhook)】
    // 요청을 받자마자 0.05초 만에 HTTP 200 반환 후 소켓을 완전히 닫아 60초 터널 타임아웃을 100% 원천 차단!
    if (mode === "async_webhook" || mode === "async_folder" || webhookUrl || (folderId && !clientBase64 && !fileId)) {
      const effectiveFolderId = folderId;
      if (!effectiveFolderId) {
        return NextResponse.json(
          { success: false, error: "folderId가 필요합니다." },
          { status: 400 }
        );
      }

      const jobId = `sb_job_${Date.now()}`;

      // 백그라운드 워커 비동기 트리거 (요청 스레드를 묶지 않고 0.05초 만에 소켓 종결!)
      setImmediate(() => {
        runAsyncFolderSyncWithWebhook({
          spreadsheetId,
          folderId: effectiveFolderId,
          webhookUrl,
          userEmail,
        }).catch((e) => console.error("[auto-import-doc] Background worker error:", e));
      });

      return NextResponse.json({
        success: true,
        mode: "async_webhook",
        jobId,
        message: "📁 AI 문서 분석 작업이 백그라운드에 등록되었습니다. 분석 완료 시 웹훅으로 시트에 파란색 글씨로 자동 반영됩니다.",
      });
    }

    // ⚡ 단일 문서 실시간 동기 처리 (기존 호환성 보장)
    if (!fileId && !clientBase64 && !clientFileText) {
      return NextResponse.json(
        { success: false, error: "파일 정보 또는 folderId는 필수 항목입니다." },
        { status: 400 }
      );
    }

    const tokenCost = 15;
    const hasEnough = await checkTokenBalance(userEmail, tokenCost);
    if (!hasEnough) {
      return NextResponse.json(
        { success: false, error: "토큰 잔액이 부족합니다. 충전 후 다시 시도해 주세요." },
        { status: 402 }
      );
    }

    let fileBase64: string | null = clientBase64 || null;
    let effectiveMimeType = mimeType || "application/pdf";

    if (!fileBase64 && !clientFileText && fileId) {
      try {
        const safeBasename = path.basename(fileName || "document.pdf").replace(/[/\\?%*:|"<>]/g, "_");
        const tmpPath = path.join(os.tmpdir(), `sb_doc_${Date.now()}_${safeBasename}`);
        
        await callDriveTool("drive_download", {
          fileId,
          destPath: tmpPath,
          preferOAuth: true,
        });

        if (fs.existsSync(tmpPath)) {
          const fileBuf = fs.readFileSync(tmpPath);
          fileBase64 = fileBuf.toString("base64");
          try { fs.unlinkSync(tmpPath); } catch (_) {}
        }
      } catch (err: any) {
        console.warn("[auto-import-doc] Drive download fallback:", err.message);
      }
    }

    const parsedResult = await analyzeDocumentWithAi(fileName || "document.pdf", effectiveMimeType, fileBase64, clientFileText);

    await deductTokens(userEmail, tokenCost, `AI 문서 자동 분석 (${fileName})`);
    await recordAiUsageLog({
      userEmail,
      action: "AUTO_IMPORT_DOC_ANALYSIS",
      tokensUsed: tokenCost,
      details: { fileName, targetTab: parsedResult.targetTab, action: parsedResult.action },
    });

    return NextResponse.json({
      success: true,
      result: parsedResult,
    });
  } catch (err: any) {
    console.error("[auto-import-doc] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "서버 내부 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
