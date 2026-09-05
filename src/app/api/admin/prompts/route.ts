export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable, insertRows, updateRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

const DEFAULT_SEED_PROMPTS = [
  {
    id: "prompt_seed_1",
    category: "LOGISTICS",
    category_name: "발주 / 입출고",
    title: "발주서 PDF·이미지 OCR 자동 분석 및 대장 접수",
    description: "사이드바에서 발주서를 업로드하면 AI가 품목별로 1행씩 분리하여 최상단 2행에 자동 기록합니다.",
    prompt_text: "사이드바 메뉴에서 PDF나 이미지 발주서를 업로드하면 자동으로 AI OCR 정밀 분석하여 '발주서 접수대장' 시트에 기록해줘. 1장의 발주서에 여러 품목이 있을 때는 품목별로 1행씩 분리해서 최상단(2행~)에 최근 순으로 삽입해줘.",
    tags: JSON.stringify(["발주서", "OCR", "다중품목", "자동기록"]),
    icon: "Sparkles",
    is_featured: 1,
    sort_order: 1,
  },
  {
    id: "prompt_seed_2",
    category: "SALES",
    category_name: "매출 / 정산",
    title: "일일 마감 데이터 연간 누적 시트로 자동 백업",
    description: "매일 지정된 시간에 당일 매출을 누적 탭으로 복사하고 입력 폼을 초기화합니다.",
    prompt_text: "매일 밤 11시 50분에 '오늘매출' 탭의 A열부터 F열까지의 데이터를 복사해서 '연간누적' 탭의 마지막 빈 행 아래에 붙여넣고, 오늘매출 탭의 입력칸은 초기화해줘.",
    tags: JSON.stringify(["일일마감", "스케줄러", "누적백업", "초기화"]),
    icon: "Clock",
    is_featured: 1,
    sort_order: 2,
  },
  {
    id: "prompt_seed_3",
    category: "CUSTOMER",
    category_name: "고객 / 알림",
    title: "결제 완료 시 고객 휴대폰 감사 문자 자동 발송",
    description: "시트의 주문 상태가 변경되면 안드로이드 폰으로 고객에게 문자를 즉시 전송합니다.",
    prompt_text: "주문관리 시트의 D열(상태)이 '결제완료'로 수정되면, 해당 행의 고객명과 연락처를 읽어서 내 폰(구글메시지)으로 고객에게 '[SheetBot] {{고객명}}님, 결제가 정상 완료되었습니다.' 문자를 자동 발송해줘.",
    tags: JSON.stringify(["결제완료", "스마트알림", "문자발송", "onEdit"]),
    icon: "Smartphone",
    is_featured: 1,
    sort_order: 3,
  },
  {
    id: "prompt_seed_4",
    category: "INVENTORY",
    category_name: "재고 / 자재",
    title: "품절 임박 안전재고 감지 시 담당자 긴급 호출",
    description: "현재고가 기준치 이하로 떨어지면 행을 하이라이트하고 긴급 알림을 보냅니다.",
    prompt_text: "재고관리 시트에서 D열(현재고)의 숫자가 5 이하로 떨어지면 해당 행을 빨간색으로 하이라이트하고, 내 휴대폰 번호(010-1234-5678)로 '{{품목명}} 재고 부족 긴급 발주 필요' 문자를 즉시 전송해줘.",
    tags: JSON.stringify(["재고관리", "품절임박", "조건부서식", "긴급호출"]),
    icon: "Zap",
    is_featured: 0,
    sort_order: 4,
  },
  {
    id: "prompt_seed_5",
    category: "WEBAPP",
    category_name: "웹앱 / 접수폼",
    title: "모바일 고객 상담 접수 독립 웹페이지(Web App)",
    description: "구글 시트와 실시간 연동되는 모바일 반응형 독립 접수 폼 웹페이지를 생성합니다.",
    prompt_text: "외부 고객이 휴대폰으로 접속해 성함, 연락처, 문의내용을 입력할 수 있는 반응형 웹페이지 폼(doGet)을 만들고, 제출 시 '상담접수' 시트에 실시간 기록되도록 배포해줘.",
    tags: JSON.stringify(["웹앱", "접수폼", "모바일반응형", "실시간연동"]),
    icon: "FileSpreadsheet",
    is_featured: 1,
    sort_order: 5,
  },
];

export async function GET(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const res = await queryTable("sheetbot_prompt_templates", {
      orderBy: "sort_order",
      orderDirection: "ASC",
      limit: 100,
    }).catch(() => ({ rows: [] }));

    let validRows = (res.rows || []).filter((r: any) => !r.deleted_at);

    // 테이블이 비어있는 경우 기본 시드 프롬프트를 DB에 자동 등록
    if (validRows.length === 0) {
      const now = new Date().toISOString();
      const seedRows = DEFAULT_SEED_PROMPTS.map((p) => ({
        ...p,
        uuid: crypto.randomUUID(),
        created_at: now,
        updated_at: now,
        updated_by: "system_seed",
        deleted_at: null,
      }));

      await insertRows("sheetbot_prompt_templates", seedRows).catch((e) =>
        console.warn("Failed to seed prompt templates:", e.message)
      );
      validRows = seedRows;
    } else {
      validRows.sort((a: any, b: any) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
    }

    // 태그 파싱
    const formatted = validRows.map((r: any) => {
      let parsedTags: string[] = [];
      try {
        parsedTags = typeof r.tags === "string" ? JSON.parse(r.tags) : r.tags || [];
      } catch {
        parsedTags = [];
      }
      return {
        ...r,
        tags: parsedTags,
      };
    });

    return NextResponse.json({ success: true, prompts: formatted });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const { category, categoryName, title, description, promptText, tags, icon, isFeatured, sortOrder } = body;

    if (!title || !promptText) {
      return NextResponse.json({ success: false, error: "제목과 프롬프트 내용은 필수입니다." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const promptId = `prompt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const newPrompt = {
      id: promptId,
      uuid: crypto.randomUUID(),
      category: category || "GENERAL",
      category_name: categoryName || "일반 업무",
      title: title.trim(),
      description: (description || "").trim(),
      prompt_text: promptText.trim(),
      tags: JSON.stringify(Array.isArray(tags) ? tags : []),
      icon: icon || "Sparkles",
      is_featured: isFeatured ? 1 : 0,
      sort_order: Number(sortOrder) || 10,
      created_at: now,
      updated_at: now,
      updated_by: userEmail,
      deleted_at: null,
    };

    await insertRows("sheetbot_prompt_templates", [newPrompt]);

    return NextResponse.json({ success: true, message: "추천 프롬프트가 성공적으로 등록되었습니다.", prompt: newPrompt });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const { id, category, categoryName, title, description, promptText, tags, icon, isFeatured, sortOrder } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "수정할 프롬프트 ID가 필요합니다." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const updateData: Record<string, any> = {
      updated_at: now,
      updated_by: userEmail,
    };

    if (category !== undefined) updateData.category = category;
    if (categoryName !== undefined) updateData.category_name = categoryName;
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (promptText !== undefined) updateData.prompt_text = promptText.trim();
    if (tags !== undefined) updateData.tags = JSON.stringify(Array.isArray(tags) ? tags : []);
    if (icon !== undefined) updateData.icon = icon;
    if (isFeatured !== undefined) updateData.is_featured = isFeatured ? 1 : 0;
    if (sortOrder !== undefined) updateData.sort_order = Number(sortOrder);

    await updateRows("sheetbot_prompt_templates", { id }, updateData);

    return NextResponse.json({ success: true, message: "추천 프롬프트가 성공적으로 수정되었습니다." });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "삭제할 프롬프트 ID가 필요합니다." }, { status: 400 });
    }

    const now = new Date().toISOString();
    await updateRows("sheetbot_prompt_templates", { id }, {
      deleted_at: now,
      deleted_by: userEmail,
    });

    return NextResponse.json({ success: true, message: "추천 프롬프트가 성공적으로 삭제되었습니다." });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
