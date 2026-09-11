export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { querySqliteByFilter, querySqliteByAi } from '@/lib/sqlite-drive-service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mode, folderName, folderId, fileName, tableName, startDate, endDate, keyword, question, limit } = body;

    if (!fileName) {
      return NextResponse.json(
        { success: false, error: 'SQLite 파일명(fileName)이 누락되었습니다.' },
        { status: 400 }
      );
    }

    if (mode === 'ai') {
      if (!question || !question.trim()) {
        return NextResponse.json(
          { success: false, error: 'AI에게 전달할 자연어 질문(question)을 입력해 주세요.' },
          { status: 400 }
        );
      }

      const result = await querySqliteByAi({
        folderName: folderName || 'SheetBot_Databases',
        folderId,
        fileName,
        question,
      });

      return NextResponse.json(result);
    }

    // 기본: filter 모드 (간편 조건 검색)
    const result = await querySqliteByFilter({
      folderName: folderName || 'SheetBot_Databases',
      folderId,
      fileName,
      tableName: tableName || 'orders',
      startDate,
      endDate,
      keyword,
      limit: limit ? Number(limit) : 500,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[SQLite Query API] Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'SQLite 데이터 조회 실패' },
      { status: 500 }
    );
  }
}
