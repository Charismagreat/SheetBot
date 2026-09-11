export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { exportRowsToDriveSqlite } from '@/lib/sqlite-drive-service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { folderName, folderId, fileName, tableName, headers, rows } = body;

    if (!fileName) {
      return NextResponse.json(
        { success: false, error: 'SQLite 파일명(fileName)이 누락되었습니다.' },
        { status: 400 }
      );
    }

    if (!Array.isArray(headers) || !Array.isArray(rows)) {
      return NextResponse.json(
        { success: false, error: '전송할 데이터 형식(headers, rows 배열)이 올바르지 않습니다.' },
        { status: 400 }
      );
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '전송할 데이터 행이 없습니다.' },
        { status: 400 }
      );
    }

    const result = await exportRowsToDriveSqlite({
      folderName: folderName || 'SheetBot_Databases',
      folderId,
      fileName,
      tableName: tableName || 'orders',
      headers,
      rows,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[SQLite Export API] Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'SQLite 데이터 전송 실패' },
      { status: 500 }
    );
  }
}
