export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import path from "path";
import fs from "fs";
import { getCurrentUserEmail, getWorkspaceCallOptionsForEmail } from "@/lib/auth";
import { setupDatabase } from "@/lib/setup-db";
import { callSheetsTool, callAiCaller } from "@/lib/egdesk-helpers";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { getKoreanTimeString } from "@/lib/date-utils";
import { recordAiCopilotActivity } from "@/lib/ai-copilot-learning";

/**
 * AI Caller 응답 2중 언래핑 안전 파서
 */
function unwrapAiCallerText(rawText: string): string {
  if (!rawText) return "";
  const clean = rawText.trim();
  try {
    const parsed = JSON.parse(clean);
    if (typeof parsed === "object" && parsed !== null) {
      if (typeof parsed.content === "string") return parsed.content;
      if (Array.isArray(parsed.content) && parsed.content[0]?.text) {
        return parsed.content[0].text;
      }
    }
  } catch {}
  return clean;
}

/**
 * Puro-33/kakao-autoreply-win의 코드 관문(Hold Gate) 철학 반영:
 * 돈·계좌·약속 확정·개인정보·의사결정이 포함된 메시지인지 검사하여 주의 배지를 반환합니다.
 */
export function evaluateKakaoSafetyGate(text: string, inboundContext: string = ""): string[] {
  const combined = `${text} ${inboundContext}`;
  const warnings: string[] = [];

  if (/(계좌|입금|송금|이체|결제|송장|세금계산서|[0-9]{1,3}(?:,[0-9]{3})+\s*원|[0-9]+\s*만\s*원)/.test(combined)) {
    warnings.push("💰 [금전·계좌 확인] 금액이나 계좌번호가 정확한지 발송 전 반드시 확인하세요.");
  }
  if (/(내일|모레|이번\s*주|다음\s*주|[0-9]{1,2}시|[0-9]{1,2}월\s*[0-9]{1,2}일|약속|미팅|방문|출석|확정)/.test(combined)) {
    warnings.push("📅 [일정·약속 확인] 날짜와 시간, 장소가 실제 일정과 맞는지 확인하세요.");
  }
  if (/(주민번호|비밀번호|인증번호|카드번호|사업자등록번호)/.test(combined)) {
    warnings.push("🔒 [민감 개인정보 주의] 민감한 번호나 인증 정보가 포함되어 있습니다.");
  }
  return warnings;
}

/**
 * 호스트 Windows PC에서 scripts/pc_kakao_send.py를 실행하여 PC 카카오톡 창으로 무포커스 전송 수행
 */
function runPcKakaoSendBridge(
  roomName: string,
  messageText: string,
  dryRun = false
): Promise<{
  ok: boolean;
  confirmed?: boolean;
  already_open?: boolean;
  draft_present?: boolean;
  error?: string;
  steps?: string[];
}> {
  return new Promise((resolve) => {
    const scriptPath = path.join(process.cwd(), "scripts", "pc_kakao_send.py");
    if (!fs.existsSync(/*turbopackIgnore: true*/ scriptPath)) {
      return resolve({
        ok: false,
        error: "호스트 PC에 pc_kakao_send.py 스크립트가 없습니다.",
      });
    }

    const args = dryRun
      ? [scriptPath, "dry", roomName, messageText]
      : [scriptPath, "send", roomName, messageText, "--yes"];

    execFile(
      "python",
      args,
      { timeout: 10000, windowsHide: true, encoding: "utf8" },
      (err, stdout) => {
        const out = (stdout || "").trim();
        if (out.startsWith("{")) {
          try {
            const parsed = JSON.parse(out);
            return resolve(parsed);
          } catch {}
        }
        return resolve({
          ok: false,
          error: err?.message || out || "PC 카카오톡 전송 브릿지 실행 실패",
        });
      }
    );
  });
}

/**
 * 구글 시트 [SheetBot] 카카오톡 메시지 대장에 발신/답장 내역 기록
 */
async function appendOutboundKakaoToSheet(
  userEmail: string,
  req: NextRequest,
  roomName: string,
  recipientName: string,
  message: string,
  methodLabel: string
) {
  if (!userEmail || !userEmail.includes("@")) return;
  try {
    const callOptions = await getWorkspaceCallOptionsForEmail(userEmail, req);
    const resolved = await resolveUserSpreadsheet({
      userEmail,
      sheetType: "KAKAO",
      defaultTitle: "[SheetBot] 카카오톡 메시지 대장",
      preferOAuth: true,
      callOptions,
    });
    if (resolved?.spreadsheetId) {
      const nowStr = getKoreanTimeString();
      await callSheetsTool(
        "sheets_append_values",
        {
          spreadsheetId: resolved.spreadsheetId,
          range: "A:F",
          values: [[nowStr, "📤 카톡 답장/발신", roomName, `나 ➔ ${recipientName}`, message, methodLabel]],
          preferOAuth: true,
        },
        callOptions
      ).catch(() => {});
    }
  } catch {}
}

/**
 * POST /api/user/messages/kakao/send
 * 시트봇 AI 비서 카드에서 카카오톡 답장 초안 추천 및 발송(방식 A: PC 카톡 무포커스 브릿지 / 방식 B: 스마트폰 카톡) 처리
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();

    const body = await req.json().catch(() => ({}));
    const {
      userEmail: bodyEmail,
      phoneNumber = "",
      chatRoomName: rawRoomName = "",
      recipientName: rawRecipient = "",
      message: rawMessage = "",
      inboundContext = "",
      mode = "PC_BRIDGE", // "PC_BRIDGE" | "LOG_MOBILE_DIRECT" | "LOG_MOBILE_JUMP" | "SUGGEST_REPLY"
    } = body;

    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");
    const userEmail =
      bodyEmail && bodyEmail.includes("@")
        ? bodyEmail.toLowerCase().trim()
        : sessionEmail ||
          (headerEmail && headerEmail.includes("@") ? headerEmail.toLowerCase().trim() : "");

    const roomName = String(rawRoomName || rawRecipient || "").trim();
    const recipientName = String(rawRecipient || rawRoomName || "상대방").trim();
    const message = String(rawMessage || "").trim();

    // 1. [AI 맞춤 답장 초안 생성 모드]
    if (mode === "SUGGEST_REPLY") {
      const prompt = `당신은 한국의 비즈니스 및 일상 커뮤니케이션에 능통한 카카오톡 AI 비서입니다.
상대방('${recipientName}', 채팅방: '${roomName}')에게 보낼 자연스럽고 예의 바른 카카오톡 답장 초안을 작성하세요.

[직전 받은 메시지 / 대화 맥락]
${inboundContext || "(최근 수신 메시지 없음 - 안부 및 용건 확인)"}

[사용자 추가 요청 사항]
${message || "맥락에 맞게 정중하고 간결하게 답장 작성"}

[작성 규칙]
1. 상대방 이름/직함(예: 대표님, 과장님, 관장님, 팀장님 등)에 맞춰 자연스러운 존댓말(해요체 또는 하십시오체)을 사용할 것.
2. 불필요한 인사말 치장을 줄이고 실제 카카오톡 대화처럼 1~3문장 이내로 깔끔하게 작성할 것.
3. 오직 전송할 카카오톡 메시지 본문만 출력하고 따옴표나 부연 설명은 절대 쓰지 말 것.`;

      let suggestedReply = "";
      try {
        const aiRes = await callAiCaller(prompt, { model: "gemini-2.5-flash" });
        suggestedReply = unwrapAiCallerText(aiRes?.text || aiRes?.content || "").trim();
      } catch {}

      if (!suggestedReply) {
        suggestedReply = inboundContext
          ? `네, ${recipientName}님! 보내주신 내용 잘 확인했습니다. 확인 후 다시 말씀드리겠습니다. 감사합니다.`
          : `안녕하세요 ${recipientName}님, 관련하여 연락드렸습니다. 확인 부탁드립니다!`;
      }

      const safetyWarnings = evaluateKakaoSafetyGate(suggestedReply, inboundContext);
      return NextResponse.json({
        success: true,
        suggestedReply,
        safetyWarnings,
      });
    }

    if (!roomName) {
      return NextResponse.json(
        { success: false, error: "카카오톡 대화방 이름이나 상대방 이름을 입력해 주세요." },
        { status: 400 }
      );
    }

    if (!message) {
      return NextResponse.json(
        { success: false, error: "전송할 카카오톡 메시지 내용을 입력해 주세요." },
        { status: 400 }
      );
    }

    // 2. [방식 B-1: 스마트폰 상단바 알림 RemoteInput 직접 답장 성공 기록]
    if (mode === "LOG_MOBILE_DIRECT") {
      await Promise.all([
        appendOutboundKakaoToSheet(
          userEmail,
          req,
          roomName,
          recipientName,
          message,
          "📱 스마트폰 카톡 알림 즉시답장(RemoteInput)"
        ),
        recordAiCopilotActivity({
          userEmail: userEmail || "anonymous",
          phoneNumber,
          req,
          command: `[카톡 즉시답장] '${roomName}' 방에 카카오톡 답장 전송: ${message.slice(0, 40)}`,
          actionType: "KAKAO_DISPATCH",
          domainTag: "문자/소통",
          targetSheet: "카카오톡대화대장",
          targetRecipient: roomName,
          dispatchMethod: "방식 B (스마트폰 상단바 알림 RemoteInput 0초 답장)",
          resultSummary: `💛 [${roomName}] 방으로 스마트폰 알림 즉시 답장 완료: "${message.slice(0, 50)}"`,
          status: "SUCCESS",
        }),
      ]);

      return NextResponse.json({
        success: true,
        method: "MOBILE_DIRECT_REPLY",
        message: `'${roomName}' 대화방으로 카카오톡 답장이 전송 및 기록되었습니다.`,
      });
    }

    // 3. [방식 B-2: 스마트폰 카톡방 열기 + 클립보드 자동 복사 기록]
    if (mode === "LOG_MOBILE_JUMP") {
      await Promise.all([
        appendOutboundKakaoToSheet(
          userEmail,
          req,
          roomName,
          recipientName,
          message,
          "📱 스마트폰 카톡 앱 오픈(클립보드 복사)"
        ),
        recordAiCopilotActivity({
          userEmail: userEmail || "anonymous",
          phoneNumber,
          req,
          command: `[카톡 앱 열기] '${roomName}' 방으로 카카오톡 답장 복사 후 이동: ${message.slice(0, 40)}`,
          actionType: "KAKAO_DISPATCH",
          domainTag: "문자/소통",
          targetSheet: "카카오톡대화대장",
          targetRecipient: roomName,
          dispatchMethod: "방식 B (스마트폰 카톡 오픈 + 답장 클립보드 복사)",
          resultSummary: `📱 [${roomName}] 카톡방 열기 및 답장 초안 클립보드 복사 완료: "${message.slice(0, 50)}"`,
          status: "SUCCESS",
        }),
      ]);

      return NextResponse.json({
        success: true,
        method: "MOBILE_JUMP_CLIPBOARD",
        message: "카카오톡 답장 이력이 시트에 기록되었습니다.",
      });
    }

    // 4. [방식 A: 호스트 PC 카카오톡 무포커스 창 제어(pc_kakao_send.py) 자동 발송]
    const bridgeResult = await runPcKakaoSendBridge(roomName, message, false);

    if (bridgeResult.ok) {
      await Promise.all([
        appendOutboundKakaoToSheet(
          userEmail,
          req,
          roomName,
          recipientName,
          message,
          "🖥️ PC 카카오톡 무포커스 자동발송(pc_kakao_send)"
        ),
        recordAiCopilotActivity({
          userEmail: userEmail || "anonymous",
          phoneNumber,
          req,
          command: `[PC 카톡 자동발송] '${roomName}' 방에 카카오톡 전송: ${message.slice(0, 40)}`,
          actionType: "KAKAO_DISPATCH",
          domainTag: "문자/소통",
          targetSheet: "카카오톡대화대장",
          targetRecipient: roomName,
          dispatchMethod: "방식 A (PC 카카오톡 Win32 무포커스 브릿지)",
          resultSummary: `🖥️ [${roomName}] PC 카카오톡 무포커스 자동 전송 완료${bridgeResult.confirmed ? " (입력칸 비워짐 확인됨)" : ""}: "${message.slice(0, 50)}"`,
          status: "SUCCESS",
        }),
      ]);

      return NextResponse.json({
        success: true,
        method: "PC_KAKAO_BRIDGE",
        confirmed: Boolean(bridgeResult.confirmed),
        chatRoomName: roomName,
        message: `🖥️ PC 카카오톡을 통해 [${roomName}] 방으로 답장을 자동 전송했습니다!`,
      });
    }

    // PC 카카오톡 미실행 또는 입력창 초안 존재 등으로 거부된 경우
    const errReason = bridgeResult.error || "호스트 PC에서 열려 있는 카카오톡을 찾지 못했습니다.";
    const isDraftProtected = Boolean(bridgeResult.draft_present);

    return NextResponse.json({
      success: false,
      requireMobileFallback: true,
      draftProtected: isDraftProtected,
      error: isDraftProtected
        ? `⚠️ PC 카카오톡 [${roomName}] 입력창에 작성 중이던 글(초안)이 있어 덮어쓰지 않고 보호했습니다. 스마트폰 카톡 발송(방식 B)을 이용해 주세요.`
        : `PC 카카오톡 자동 전송 불가 (${errReason}). 스마트폰 카톡 발송(방식 B)을 이용해 주세요.`,
    });
  } catch (err: any) {
    console.error("[KakaoSend] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "카카오톡 전송 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
