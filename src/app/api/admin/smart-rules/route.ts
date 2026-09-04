export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { setupDatabase } from "@/lib/setup-db";
import {
  getSmartDispatchRules,
  saveSmartDispatchRules,
  parseNaturalLanguageRule,
} from "@/lib/smart-dispatch-rules";

export async function GET(req: NextRequest) {
  try {
    await setupDatabase();
    const adminEmail = await getCurrentUserEmail();
    if (!adminEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const rules = await getSmartDispatchRules();
    return NextResponse.json({ success: true, rules });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const adminEmail = await getCurrentUserEmail();
    if (!adminEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const prompt = body.prompt?.trim();

    if (!prompt) {
      return NextResponse.json({ success: false, error: "자연어 발송 규칙 내용을 입력해 주세요." }, { status: 400 });
    }

    // AI 자연어 파싱 수행
    const newRule = await parseNaturalLanguageRule(prompt);

    const existingRules = await getSmartDispatchRules();
    const updatedRules = [newRule, ...existingRules];
    await saveSmartDispatchRules(updatedRules, adminEmail);

    return NextResponse.json({
      success: true,
      message: `AI가 자연어를 분석하여 [${newRule.name}] 규칙을 생성 및 등록했습니다.`,
      rule: newRule,
      rules: updatedRules,
    });
  } catch (err: any) {
    console.error("[SmartRules API] POST error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    await setupDatabase();
    const adminEmail = await getCurrentUserEmail();
    if (!adminEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const { id, enabled } = body;

    const rules = await getSmartDispatchRules();
    const updatedRules = rules.map((r) => (r.id === id ? { ...r, enabled: !!enabled } : r));
    await saveSmartDispatchRules(updatedRules, adminEmail);

    return NextResponse.json({
      success: true,
      message: "규칙 상태가 변경되었습니다.",
      rules: updatedRules,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await setupDatabase();
    const adminEmail = await getCurrentUserEmail();
    if (!adminEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "삭제할 규칙 ID가 필요합니다." }, { status: 400 });
    }

    const rules = await getSmartDispatchRules();
    const filteredRules = rules.filter((r) => r.id !== id);
    await saveSmartDispatchRules(filteredRules, adminEmail);

    return NextResponse.json({
      success: true,
      message: "발송 규칙이 삭제되었습니다.",
      rules: filteredRules,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
