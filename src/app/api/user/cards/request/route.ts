import { NextRequest, NextResponse } from 'next/server';
import { setupDatabase, insertRows, queryTable } from '@/lib/setup-db';

export const dynamic = 'force-dynamic';

/**
 * 💡 POST /api/user/cards/request
 * - 맞춤 기능 제작 의뢰(FEATURE_CUSTOM) 및 신규 카드 출시 알림 예약(RELEASE_NOTIFY) 접수
 * - 서버 DB(sheetbot_feature_requests)에 실시간 영구 적재 (2중 안전망)
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();

    const body = await req.json();
    const requestType = (body.requestType || 'FEATURE_CUSTOM').trim().toUpperCase();
    const cardKey = (body.cardKey || '').trim();
    const title = (body.title || '').trim();
    const description = (body.description || '').trim();
    const contact = (body.contact || '').trim();
    const userEmail = (
      body.userEmail ||
      req.headers.get('x-sheetbot-user-email') ||
      ''
    ).trim().toLowerCase();

    if (!title) {
      return NextResponse.json({ success: false, error: '희망 기능명을 입력해 주세요.' }, { status: 400 });
    }
    if (!contact) {
      return NextResponse.json({ success: false, error: '회신 받으실 연락처 또는 이메일을 입력해 주세요.' }, { status: 400 });
    }

    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

    // 중복 접수 방어: 동일 사용자, 동일 카드/제목으로 1분 이내 접수건 확인
    if (userEmail) {
      const recent = await queryTable('sheetbot_feature_requests', {
        filter: {
          user_email: userEmail,
          title: title,
        },
        limit: 1,
      });

      if (recent && recent.rows && recent.rows.length > 0) {
        return NextResponse.json({
          success: true,
          isDuplicate: true,
          message: '이미 안전하게 접수된 요청입니다. 담당자가 검토 후 연락드리겠습니다.',
        });
      }
    }

    const newRow = {
      request_type: requestType,
      card_key: cardKey || null,
      title: title,
      description: description || null,
      contact: contact,
      user_email: userEmail || null,
      status: 'PENDING',
      admin_notes: null,
      created_at: nowStr,
    };

    const insertResult = await insertRows('sheetbot_feature_requests', [newRow]);

    return NextResponse.json({
      success: true,
      requestId: insertResult?.[0]?.id || Date.now(),
      message: requestType === 'RELEASE_NOTIFY'
        ? `🎉 '${title}' 카드의 출시 알림 예약이 성공적으로 등록되었습니다.`
        : `💡 '${title}' 맞춤 기능 제작 의뢰가 성공적으로 접수되었습니다.`,
    });
  } catch (error: any) {
    console.error('[FeatureRequest] 접수 실패:', error);
    return NextResponse.json({ success: false, error: error.message || '요청 접수 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

/**
 * 📋 GET /api/user/cards/request
 * - 내 의뢰 내역 또는 특정 카드에 대한 출시 알림 여부 확인
 */
export async function GET(req: NextRequest) {
  try {
    await setupDatabase();

    const { searchParams } = new URL(req.url);
    const userEmail = (
      searchParams.get('email') ||
      searchParams.get('userEmail') ||
      req.headers.get('x-sheetbot-user-email') ||
      ''
    ).trim().toLowerCase();

    if (!userEmail) {
      return NextResponse.json({ success: false, error: '이메일 정보가 필요합니다.' }, { status: 400 });
    }

    const result = await queryTable('sheetbot_feature_requests', {
      filter: { user_email: userEmail },
      limit: 50,
      orderBy: 'id',
      orderDirection: 'DESC',
    });

    return NextResponse.json({
      success: true,
      total: result.total || 0,
      requests: result.rows || [],
    });
  } catch (error: any) {
    console.error('[FeatureRequest] 조회 실패:', error);
    return NextResponse.json({ success: false, error: error.message || '조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
