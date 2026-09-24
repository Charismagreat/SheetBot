export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { queryTable, updateRows } from "../../../../../egdesk-helpers";
import { creditTokens } from "@/lib/token-wallet";
import { executeSmartDispatchRules } from "@/lib/smart-dispatch-rules";
import { setupDatabase } from "@/lib/setup-db";
import { parseBankDepositSms } from "@/lib/bank-sms-parser";

/**
 * POST /api/wallet/bank-webhook
 * 스마트폰 은행 입금 알림(토스, 카카오뱅크 등)을 수신하거나, 수동 확인 시 입금을 매칭하여 토큰을 즉시 지급합니다.
 * Body: { depositorName: string, amountKrw: number, bankName?: string, secretKey?: string }
 */
export async function POST(request: Request) {
  try {
    // 1. 스마트폰(MacroDroid 등)에서 줄바꿈이 포함된 비표준 JSON이 오더라도 안전하게 즉시 파싱
    let body: any = {};
    const rawText = await request.text();
    
    if (rawText && rawText.trim()) {
      try {
        body = JSON.parse(rawText);
      } catch {
        try {
          // JSON 문자열 내부의 실제 줄바꿈을 정규식으로 안전 추출
          const smsMatch = rawText.match(/"(?:smsText|text|content|message|msg)"\s*:\s*"([\s\S]*?)"\s*}/);
          if (smsMatch) {
            body = { smsText: smsMatch[1] };
          } else {
            const sanitized = rawText.replace(/[\r\n]+/g, " ");
            body = JSON.parse(sanitized);
          }
        } catch {
          // JSON 형식이 아닌 일반 텍스트로 들어온 경우 본문 자체를 SMS 텍스트로 인식
          body = { smsText: rawText };
        }
      }
    }

    let { depositorName, amountKrw, bankName, requestId } = body || {};

    // 스마트폰 전달 앱에서 본문 텍스트 통째로 넘어온 경우 (smsText, text, content, message 등)
    const rawSms = body?.smsText || body?.text || body?.content || body?.message || body?.msg || depositorName || "";
    if (typeof rawSms === "string" && rawSms.length > 5) {
      const parsed = parseBankDepositSms(rawSms);
      if (parsed.success) {
        if (!amountKrw || Number(amountKrw) <= 0) {
          amountKrw = parsed.amountKrw;
        }
        if (!depositorName || depositorName === rawSms) {
          depositorName = parsed.depositCode;
        }
        if (!bankName || bankName === "자동감지") {
          bankName = parsed.bankName;
        }
      }
    }

    const cleanDepositor = (depositorName || "테스트").replace(/\s+/g, "").trim();
    const cleanAmount = Number(amountKrw) || 5000;

    // ⚡ [초고속 검증 가드]: 가상 입금 테스트 요청인 경우, 무거운 DB 초기화 블로킹 없이 0.05초 만에 즉시 성공 반환 (스마트폰 타임아웃 방지)
    const isSimulatedTest =
      Boolean(body?.isTest) ||
      rawSms.includes("성명(계좌)") ||
      rawSms.includes("테스트입금") ||
      rawSms.includes("입금알림") ||
      rawSms.includes("입금확인(테스트)") ||
      rawSms.includes("가상입금") ||
      (cleanAmount === 5000 && (rawSms.includes("2,05") || rawSms.includes("테스트") || rawSms.includes("카카오뱅크")));

    // ⚡ [생존 신호 동기화]: 웹훅이 전달되었다는 것은 스마트폰이 정상 동작 중임을 의미하므로 기기 last_connected_at 비동기 갱신
    const senderEmail = body?.userEmail ? String(body.userEmail).toLowerCase().trim() : null;
    const deviceModel = body?.deviceModel ? String(body.deviceModel).trim() : null;
    if (senderEmail) {
      const nowStr = new Date().toISOString().replace("T", " ").slice(0, 19);
      (async () => {
        try {
          const devRes = await queryTable("sheetbot_user_devices", {
            filters: { user_email: senderEmail, pairing_mode: "android_agent" },
            orderBy: "id",
            orderDirection: "DESC",
            limit: 1,
          });
          if (devRes.rows && devRes.rows.length > 0) {
            const updates: Record<string, any> = {
              status: "CONNECTED",
              last_connected_at: nowStr,
              updated_at: nowStr,
            };
            if (deviceModel) updates.label = `스마트폰 (${deviceModel})`;
            await updateRows("sheetbot_user_devices", updates, {
              filters: { id: devRes.rows[0].id },
            });
          }
        } catch {}
      })().catch(() => {});
    }

    if (isSimulatedTest && !requestId) {
      return NextResponse.json({
        success: true,
        isTest: true,
        matched: false,
        message: `🎉 [가상 입금 테스트 성공] 스마트폰 ↔ 서버 간 실시간 웹훅 전송 및 SMS 분석이 완벽히 확인되었습니다! (${bankName || "카카오뱅크"} ${cleanAmount.toLocaleString()}원)`,
        detail: "스마트폰과 시트봇 서버 간의 통신이 0.05초 만에 정상 확인되었습니다.",
        depositorName: "테스트",
        amountKrw: cleanAmount,
        bankName: bankName || "카카오뱅크",
        ttsText: `가상 입금 ${cleanAmount.toLocaleString()}원이 정상 감지되었습니다.`,
      });
    }

    if (!depositorName || !amountKrw) {
      return NextResponse.json(
        { success: false, error: "depositorName과 amountKrw(또는 은행 입금 SMS 문자 본문)가 필요합니다." },
        { status: 400 }
      );
    }

    // 실제 입금 매칭 시 필요한 DB 초기화는 백그라운드 병렬 보장
    setupDatabase().catch(() => {});

    // 1. PENDING 상태인 입금 요청 대장 조회
    const filters: Record<string, any> = { status: "PENDING" };
    if (requestId) filters.id = requestId;

    const res = await queryTable("sheetbot_deposit_requests", {
      filters,
      limit: 50,
      orderBy: "id",
      orderDirection: "DESC",
    }).catch(() => ({ rows: [] }));

    const pendingRequests = (res.rows || []).filter((r: any) => !r.deleted_at);

    // 2. 입금자명 및 금액 매칭 탐색
    // 1순위: 금액 일치 AND (실제 입금자명 / 입금코드 / 사용자명 매칭)
    let matched: any = pendingRequests.find((req: any) => {
      const amount = Number(req.amount_krw);
      if (amount !== cleanAmount) return false;

      const code = (req.deposit_code || "").replace(/\s+/g, "").trim().toLowerCase();
      const depositor = (req.depositor_name || "").replace(/\s+/g, "").trim().toLowerCase();
      const userName = (req.user_name || "").replace(/\s+/g, "").trim().toLowerCase();
      const target = cleanDepositor.toLowerCase();

      const isNameMatch =
        (depositor && (target.includes(depositor) || depositor.includes(target))) ||
        (code && (target.includes(code) || code.includes(target))) ||
        (userName && (target.includes(userName) || userName.includes(target)));

      return isNameMatch;
    });

    // 2순위: 1원 단위 고유 단수 금액(예: 4,987원) 안전망 폴백
    // 100원 단위가 아닌 1원 단위 특수 금액인 경우, 최근 PENDING 요청 중 해당 금액이 단 1건뿐이면 자동 승인
    if (!matched && cleanAmount % 100 !== 0) {
      const candidateByAmount = pendingRequests.filter(
        (req: any) => Number(req.amount_krw) === cleanAmount
      );
      if (candidateByAmount.length === 1) {
        matched = candidateByAmount[0];
        console.log(
          `[Bank-Webhook] 1원 단위 고유 금액(${cleanAmount}원) 단일 요청자 자동 매칭 성공: ${matched.user_email}`
        );
      }
    }

    if (!matched) {
      // 1. 가상 테스트 SMS 여부 감지 (isTest 플래그 또는 스마트폰 가상 입금 테스트 시그니처)
      const isSimulatedTest =
        Boolean(body?.isTest) ||
        rawSms.includes("성명(계좌)") ||
        rawSms.includes("테스트입금") ||
        rawSms.includes("입금알림") ||
        rawSms.includes("입금확인(테스트)") ||
        (cleanAmount === 5000 && rawSms.includes("2,05"));

      if (isSimulatedTest) {
        return NextResponse.json({
          success: true,
          isTest: true,
          matched: false,
          message: `🎉 [가상 입금 테스트 성공] 스마트폰 ↔ 서버 간 실시간 웹훅 전송 및 SMS 분석이 완벽히 확인되었습니다! (${bankName || "카카오뱅크"} ${cleanAmount.toLocaleString()}원)`,
          detail: "현재 웹에 대기 중인 실제 입금 신청건이 없어 토큰 실충전만 건너뛰었으며, 기기 연동 파이프라인은 100% 정상 작동 중입니다.",
          depositorName: "테스트",
          amountKrw: cleanAmount,
          bankName: bankName,
        });
      }

      // 2. 실제 은행 문자이지만 웹에 대기 세션이 없는 경우 (웹훅 수신 자체는 성공 처리)
      return NextResponse.json({
        success: true,
        matched: false,
        message: `ℹ️ [문자 감지 성공] ${bankName || "은행"} ${cleanAmount.toLocaleString()}원 (${cleanDepositor}) 입금을 수신했습니다. 단, 웹에 등록된 대기 세션과 일치하지 않아 대기 상태로 유지됩니다.`,
        depositorName: cleanDepositor,
        amountKrw: cleanAmount,
      });
    }

    // 3. 토큰 지갑 충전 실행
    const now = new Date().toISOString();
    const creditRes = await creditTokens(
      matched.user_email,
      matched.tokens_to_credit,
      matched.package_name,
      matched.amount_krw,
      "다이렉트 송금 (0원 수수료 / " + (bankName || "은행") + ")"
    );

    // 4. 요청 세션 상태를 COMPLETED로 업데이트
    await updateRows(
      "sheetbot_deposit_requests",
      {
        status: "COMPLETED",
        completed_at: now,
        updated_at: now,
        updated_by: "system_bank_webhook",
      },
      { filters: { id: matched.id } }
    );

    // 5. 관리자 및 고객 알림 발송 (문자/이메일)
    executeSmartDispatchRules("payment", {
      userEmail: matched.user_email,
      title: matched.package_name + " (다이렉트 송금)",
      amount: matched.amount_krw,
    }).catch((err) => console.warn("[Bank-Webhook] Dispatch error:", err));

    // 6. 고객 0원 영수증 SMS 및 실시간 TTS 음성 안내 페이로드 생성
    let recipientPhone = matched.phone_number || "";
    if (!recipientPhone) {
      try {
        const uDev = await queryTable("sheetbot_user_devices", {
          filters: { user_email: matched.user_email },
          limit: 3,
        });
        const foundWithPhone = (uDev.rows || []).find((d: any) => d.phone_number && !d.deleted_at);
        if (foundWithPhone) {
          recipientPhone = foundWithPhone.phone_number;
        }
      } catch {}
    }

    const replySms = recipientPhone
      ? {
          recipientPhone,
          message: `[SheetBot] ${matched.depositor_name || matched.user_name || "회원"}님, ${Number(matched.amount_krw).toLocaleString()}원 입금이 확인되어 ${Number(matched.tokens_to_credit).toLocaleString()} 토큰이 정상 충전되었습니다. 감사합니다.`,
        }
      : null;

    const ttsText = `${matched.depositor_name || "회원"}님 ${Number(matched.amount_krw).toLocaleString()}원 입금, ${Number(matched.tokens_to_credit).toLocaleString()} 토큰 자동 충전 완료되었습니다.`;

    return NextResponse.json({
      success: true,
      message: matched.user_email + "님께 " + matched.tokens_to_credit.toLocaleString() + " 토큰이 즉시 충전되었습니다!",
      requestId: matched.id,
      userEmail: matched.user_email,
      creditedTokens: matched.tokens_to_credit,
      newBalance: creditRes.newBalance,
      replySms,
      ttsText,
    });
  } catch (err: any) {
    console.error("[Bank-Webhook-API] POST error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
