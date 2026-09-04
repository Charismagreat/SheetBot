export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable, insertRows, updateRows, callAiCaller } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

/**
 * GET /api/user/smart-rules
 * 회원의 자연어 스마트 알림 규칙 목록 조회
 */
export async function GET(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();

    const res = await queryTable("sheetbot_user_smart_rules", {
      filters: { user_email: cleanEmail },
      limit: 100,
      orderBy: "id",
      orderDirection: "DESC",
    }).catch(() => ({ rows: [] }));

    const validRules = (res.rows || []).filter((r: any) => !r.deleted_at);

    return NextResponse.json({ success: true, rules: validRules });
  } catch (err: any) {
    console.error("[UserSmartRules] GET error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/user/smart-rules
 * 회원이 자연어로 입력한 규칙을 AI로 파싱하여 스마트 발송 규칙 등록
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();
    const body = await req.json().catch(() => ({}));
    const prompt = body.prompt?.trim();
    const projectId = body.projectId || "all";

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: "규칙 생성에 필요한 자연어 설명(프롬프트)을 입력해 주세요." },
        { status: 400 }
      );
    }

    // AI Caller를 통한 자연어 규칙 파싱
    const systemPrompt = `당신은 Google 스프레드시트 업무 자동화 및 SMS 알림 규칙을 설계하는 AI 엔지니어입니다.
사용자가 입력한 자연어 발송 조건을 분석하여 반드시 다음 JSON 형식으로만 응답하세요. 백틱이나 다른 설명은 일체 추가하지 마세요:
{
  "name": "규칙의 직관적인 요약 제목 (예: 결제 완료 시 고객 감사 문자 발송)",
  "trigger_event": "sheet_edit" 또는 "row_added" 또는 "status_change" 또는 "daily_summary" 또는 "custom",
  "target_recipient": "self" (회원 본인에게 알림) 또는 "column_phone" (시트 내 고객 전화번호 열로 발송) 또는 "custom_number" (고정된 번호),
  "recipient_column": "시트 내에서 전화번호가 적힌 열 이름 (예: 연락처, 핸드폰, 고객전화, 없으면 '')",
  "custom_phone": "고정 번호가 명시된 경우 전화번호, 없으면 ''",
  "message_template": "발송될 문자 내용 템플릿. {{열이름}} 형식으로 시트 변수 치환 가능 (예: [SheetBot] {{이름}}님, 주문이 정상 완료되었습니다.)"
}`;

    let parsedRule: any = {
      name: prompt.slice(0, 24),
      trigger_event: "sheet_edit",
      target_recipient: "self",
      recipient_column: "",
      custom_phone: "",
      message_template: `[SheetBot] 자동 알림: ${prompt}`,
    };

    try {
      const aiRes = await callAiCaller(
        `${systemPrompt}\n\n[사용자 자연어 요청]: "${prompt}"`,
        { temperature: 0.1 }
      );
      const text = typeof aiRes === "string" ? aiRes : aiRes?.text || aiRes?.content || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.name) parsedRule.name = parsed.name;
        if (parsed.trigger_event) parsedRule.trigger_event = parsed.trigger_event;
        if (parsed.target_recipient) parsedRule.target_recipient = parsed.target_recipient;
        if (parsed.recipient_column) parsedRule.recipient_column = parsed.recipient_column;
        if (parsed.custom_phone) parsedRule.custom_phone = parsed.custom_phone;
        if (parsed.message_template) parsedRule.message_template = parsed.message_template;
      }
    } catch (aiErr: any) {
      console.warn("[UserSmartRules] AI parsing warning:", aiErr.message);
    }

    const now = new Date().toISOString();
    const newRuleId = `srule_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const newRow = {
      id: newRuleId,
      user_email: cleanEmail,
      project_id: projectId,
      name: parsedRule.name,
      prompt,
      trigger_event: parsedRule.trigger_event,
      target_recipient: parsedRule.target_recipient,
      recipient_column: parsedRule.recipient_column,
      custom_phone: parsedRule.custom_phone,
      message_template: parsedRule.message_template,
      is_active: 1, // 기본 활성화
      created_at: now,
    };

    await insertRows("sheetbot_user_smart_rules", [newRow]);

    return NextResponse.json({
      success: true,
      message: `자연어 스마트 알림 규칙 '${parsedRule.name}'이(가) 등록되었습니다.`,
      rule: newRow,
    });
  } catch (err: any) {
    console.error("[UserSmartRules] POST error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * PUT /api/user/smart-rules
 * 규칙 활성화/비활성화 토글 또는 내용 업데이트
 */
export async function PUT(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();
    const body = await req.json().catch(() => ({}));
    const { id, isActive, name, messageTemplate, prompt } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "규칙 ID가 필요합니다." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const updates: any = {
      updated_at: now,
      updated_by: cleanEmail,
    };

    if (typeof isActive === "boolean") {
      updates.is_active = isActive ? 1 : 0;
    }
    if (name) updates.name = name.trim();
    if (messageTemplate) updates.message_template = messageTemplate.trim();
    if (prompt) updates.prompt = prompt.trim();

    await updateRows("sheetbot_user_smart_rules", {
      filters: { id, user_email: cleanEmail },
      updates,
    });

    return NextResponse.json({
      success: true,
      message: "규칙 설정이 성공적으로 저장되었습니다.",
    });
  } catch (err: any) {
    console.error("[UserSmartRules] PUT error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/user/smart-rules
 * 규칙 소프트 삭제
 */
export async function DELETE(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id")?.trim();

    if (!id) {
      return NextResponse.json({ success: false, error: "삭제할 규칙 ID가 필요합니다." }, { status: 400 });
    }

    const now = new Date().toISOString();

    await updateRows("sheetbot_user_smart_rules", {
      filters: { id, user_email: cleanEmail },
      updates: {
        deleted_at: now,
        deleted_by: cleanEmail,
      },
    });

    return NextResponse.json({
      success: true,
      message: "스마트 알림 규칙이 성공적으로 삭제되었습니다.",
    });
  } catch (err: any) {
    console.error("[UserSmartRules] DELETE error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
