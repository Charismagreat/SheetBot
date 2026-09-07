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

    // 특정 프로젝트에 대한 평가 가능 여부(canRate) 판별
    let canRate = true;
    let lastRatedAt: string | null = null;

    if (projectId) {
      const projFeedbacks = formatted.filter((f: any) => f.project_id === projectId);
      if (projFeedbacks.length > 0) {
        const latestFeedback = projFeedbacks[0]; // orderBy created_at DESC
        lastRatedAt = latestFeedback.created_at;

        // 프로젝트의 최신 갱신 일시 조회
        const projRes = await queryTable('sheetbot_projects', {
          filters: { id: projectId },
          limit: 1,
        }).catch(() => ({ rows: [] }));
        const projectRow = projRes.rows?.[0];

        const feedbackTime = new Date(latestFeedback.created_at).getTime();
        const projectUpdatedTime = projectRow?.updated_at ? new Date(projectRow.updated_at).getTime() : 0;

        // 마지막 평가 이후 프로젝트 요구사항 수정 및 신규 배포가 이루어졌는지 확인
        canRate = projectUpdatedTime > (feedbackTime + 1000);
      }
    }

    return NextResponse.json({
      success: true,
      feedbacks: formatted,
      canRate,
      lastRatedAt,
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

    // 1. 이미 평가한 프로젝트인지 확인 (마지막 평가 이후 신규 코드 생성이 없었다면 재평가 차단)
    const existingFeedbackRes = await queryTable('sheetbot_project_feedback', {
      filters: { project_id: projectId },
      orderBy: 'created_at',
      orderDirection: 'DESC',
      limit: 1,
    }).catch(() => ({ rows: [] }));

    const lastFeedback = (existingFeedbackRes.rows || []).find((r: any) => !r.deleted_at);

    if (lastFeedback) {
      // 프로젝트의 최종 갱신/배포 일시 확인
      const projRes = await queryTable('sheetbot_projects', {
        filters: { id: projectId },
        limit: 1,
      }).catch(() => ({ rows: [] }));
      const projectRow = projRes.rows?.[0];

      const feedbackTime = new Date(lastFeedback.created_at).getTime();
      const projectUpdatedTime = projectRow?.updated_at ? new Date(projectRow.updated_at).getTime() : 0;

      // 요구사항 수정이나 신규 코드 생성이 피드백 이후에 이루어지지 않은 경우
      const hasNewGeneration = projectUpdatedTime > (feedbackTime + 1000);
      const isSnapshotDifferent = scriptCodeSnapshot && lastFeedback.script_code_snapshot && scriptCodeSnapshot.trim() !== lastFeedback.script_code_snapshot.trim();

      if (!hasNewGeneration && !isSnapshotDifferent) {
        return NextResponse.json({
          success: false,
          alreadyRated: true,
          message: '이미 만족도 평가를 완료하셨습니다. 추가 요구사항을 통해 AI 코드를 수정한 후 다시 평가하실 수 있습니다.',
        }, { status: 409 });
      }
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
