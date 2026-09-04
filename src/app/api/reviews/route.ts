export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable, insertRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

const DEFAULT_SEED_REVIEWS = [
  {
    id: "rev_seed_1",
    user_email: "ceo_mark@startup.io",
    user_name: "김민석 대표",
    rating: 5,
    title: "매일 1시간씩 걸리던 일일 매출 마감 작업이 5초 만에 끝납니다.",
    content: "구글 시트 여러 개를 열어서 수기 집계하느라 퇴근이 늦었는데, SheetBot에 자연어로 '매일 밤 11시 각 매장 시트 합산해서 본사 시트로 복사해줘'라고 적었더니 Apps Script 트리거까지 완벽히 세팅되었습니다. 진심으로 추천합니다!",
    use_case: "프랜차이즈 일일 매출 자동 마감",
    created_at: "2026-08-25T14:20:00Z",
  },
  {
    id: "rev_seed_2",
    user_email: "operation@growthlab.kr",
    user_name: "이수진 팀장",
    rating: 5,
    title: "코딩을 전혀 몰라도 사내 슬랙 웹훅과 이메일 발송 자동화 완성",
    content: "설문지 응답 시트가 채워질 때마다 담당자에게 이메일을 보내고 슬랙 알림을 쏘는 코드를 만들고 싶었는데, SheetBot 이지봇과 대화하면서 10분 만에 배포까지 성공했습니다. 정기 구독이 아니라 토큰 충전식이라 비용도 정말 합리적입니다.",
    use_case: "고객 설문 응답 실시간 알림 웹훅",
    created_at: "2026-08-30T10:15:00Z",
  },
  {
    id: "rev_seed_3",
    user_email: "developer_jun@techcorp.com",
    user_name: "박준형 개발자",
    rating: 5,
    title: "개발자 입장에서도 Apps Script 보일러플레이트 짜는 시간이 획기적으로 줄었습니다",
    content: "GAS 문법 특유의 SpreadsheetApp API 호출 패턴을 AI가 완벽하게 짜줍니다. 최신 Gemini 3.5/3.8 Flash 모델과 연동되어 코드 생성 퀄리티가 우수하고 오류 수정 가이드도 훌륭합니다.",
    use_case: "재고 데이터 동기화 및 이상치 알림",
    created_at: "2026-09-02T16:40:00Z",
  },
];

export async function GET(req: NextRequest) {
  try {
    await setupDatabase();

    const res = await queryTable("sheetbot_reviews", {
      orderBy: "id",
      orderDirection: "DESC",
      limit: 100,
    }).catch(() => ({ rows: [] }));

    const validRows = (res.rows || []).filter((r: any) => !r.deleted_at);

    let reviews = validRows;
    if (reviews.length === 0) {
      reviews = DEFAULT_SEED_REVIEWS;
    }

    return NextResponse.json({ success: true, reviews });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "후기 작성은 로그인 후 이용 가능합니다." }, { status: 401 });
    }

    const body = await req.json();
    if (!body.title || !body.content || !body.rating) {
      return NextResponse.json({ success: false, error: "제목, 내용, 평점을 모두 입력해 주세요." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const newId = `rev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const newRow = {
      id: newId,
      user_email: userEmail.toLowerCase().trim(),
      user_name: body.userName || "시트봇 회원",
      rating: Math.min(5, Math.max(1, Number(body.rating) || 5)),
      title: body.title.trim(),
      content: body.content.trim(),
      use_case: body.use_case?.trim() || "구글 시트 업무 자동화",
      created_at: now,
    };

    await insertRows("sheetbot_reviews", [newRow]);

    return NextResponse.json({
      success: true,
      message: "소중한 사용 후기가 등록되었습니다. 감사합니다!",
      review: newRow,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
