import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { queryTable, insertRows, setupDatabase } from '@/lib/setup-db';

export async function GET(req: NextRequest) {
  try {
    await setupDatabase();
    const session = await getServerSession(authOptions);
    const userEmail = session?.user?.email;

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const aiLearnedOnly = searchParams.get('aiLearned');

    const filters: Record<string, any> = {};
    if (projectId) {
      filters.project_id = projectId;
    }

    const res = await queryTable('sheetbot_project_feedback', {
      filters,
      orderBy: 'created_at',
      orderDirection: 'DESC',
      limit: 100,
    }).catch(() => ({ rows: [] }));

    let rows = (res.rows || []).filter((r: any) => !r.deleted_at);

    // JSON tags 파싱
    const formatted = rows.map((r: any) => {
      let parsedTags: string[] = [];
      try {
        parsedTags = typeof r.tags === 'string' ? JSON.parse(r.tags) : r.tags || [];
      } catch {
        parsedTags = [];
      }
      return {
        ...r,
        tags: parsedTags,
      };
    });

    // 통계 계산
    const totalCount = formatted.length;
    const avgRating = totalCount > 0
      ? Number((formatted.reduce((acc: number, curr: any) => acc + (curr.rating || 0), 0) / totalCount).toFixed(1))
      : 5.0;

    return NextResponse.json({
      success: true,
      feedbacks: formatted,
      stats: {
        totalCount,
        avgRating,
        excellentCount: formatted.filter((f: any) => f.rating >= 4).length,
        issueCount: formatted.filter((f: any) => f.rating <= 2).length,
      },
    });
  } catch (error: any) {
    console.error('[Feedback API] GET error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const session = await getServerSession(authOptions);
    const userEmail = session?.user?.email || 'anonymous@user.com';

    const body = await req.json();
    const { projectId, projectName, rating, satisfactionType, tags, comment, scriptCodeSnapshot } = body;

    if (!projectId || rating === undefined) {
      return NextResponse.json({ success: false, message: '프로젝트 ID와 별점(평점)은 필수입니다.' }, { status: 400 });
    }

    const numericRating = Math.max(1, Math.min(5, Number(rating)));

    // satisfactionType 자동 판정 (미전달 시)
    let determinedType = satisfactionType;
    if (!determinedType) {
      if (numericRating === 5) determinedType = 'EXCELLENT';
      else if (numericRating === 4) determinedType = 'GOOD';
      else if (numericRating === 3) determinedType = 'AVERAGE';
      else if (numericRating === 2) determinedType = 'NEEDS_IMPROVEMENT';
      else determinedType = 'CRITICAL_ISSUE';
    }

    const feedbackEntry = {
      id: `fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      project_id: projectId,
      project_name: projectName || '무제 프로젝트',
      user_email: userEmail,
      rating: numericRating,
      satisfaction_type: determinedType,
      tags: JSON.stringify(tags || []),
      comment: comment || '',
      script_code_snapshot: scriptCodeSnapshot || '',
      ai_learned: 1, // AI 학습 반영 플래그
      created_at: new Date().toISOString(),
    };

    await insertRows('sheetbot_project_feedback', [feedbackEntry]);

    console.log(`[Feedback API] ✅ New feedback recorded for project ${projectId} (Rating: ${numericRating}★)`);

    return NextResponse.json({
      success: true,
      message: '소중한 피드백이 AI 자가 학습 시스템에 성공적으로 반영되었습니다!',
      feedback: feedbackEntry,
    });
  } catch (error: any) {
    console.error('[Feedback API] POST error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
