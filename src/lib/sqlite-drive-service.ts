import fs from 'fs';
import path from 'path';
import os from 'os';
// @ts-ignore - node:sqlite is built-in natively in Node.js v22+
import { DatabaseSync } from 'node:sqlite';
import { callAiCaller } from './egdesk-helpers';

const EGDESK_API_URL =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_EGDESK_API_URL) ||
  'http://localhost:8080';

/**
 * Drive MCP 도구 호출 헬퍼
 */
export async function callDriveTool(tool: string, args: Record<string, any>): Promise<any> {
  const response = await fetch(`${EGDESK_API_URL}/drive/tools/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, arguments: args }),
  });

  if (!response.ok) {
    throw new Error(`Drive Tool HTTP error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  if (json.success === false || json.error) {
    throw new Error(json.error || 'Drive Tool execution failed');
  }
  return json;
}

/**
 * 로컬 캐시 디렉토리 확보
 */
function getCacheDir(): string {
  const cacheDir = path.join(os.tmpdir(), 'sheetbot_sqlite_cache');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return cacheDir;
}

/**
 * 1. 구글 드라이브 폴더 확인 또는 생성
 */
export async function ensureDriveFolder(folderName = 'SheetBot_Databases'): Promise<string> {
  try {
    const listRes = await callDriveTool('drive_list_files', {
      query: `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName}' and trashed = false`,
      pageSize: 5,
    });

    let files: any[] = [];
    if (listRes?.result?.content?.[0]?.text) {
      try {
        files = JSON.parse(listRes.result.content[0].text);
      } catch {
        files = [];
      }
    }

    if (Array.isArray(files) && files.length > 0 && files[0].id) {
      return files[0].id;
    }

    const createRes = await callDriveTool('drive_create_folder', {
      name: folderName,
    });

    let createdId = '';
    if (createRes?.result?.content?.[0]?.text) {
      try {
        const parsed = JSON.parse(createRes.result.content[0].text);
        createdId = parsed.id || parsed.folderId;
      } catch {
        createdId = '';
      }
    }

    return createdId;
  } catch (err: any) {
    console.warn('ensureDriveFolder fallback:', err.message);
    return '';
  }
}

/**
 * 2. 구글 드라이브에서 특정 SQLite 파일 탐색
 */
export async function findDriveFile(
  fileName: string,
  folderId?: string
): Promise<{ id: string; name: string } | null> {
  try {
    let q = `name = '${fileName}' and trashed = false`;
    if (folderId) {
      q += ` and '${folderId}' in parents`;
    }

    const res = await callDriveTool('drive_list_files', {
      query: q,
      pageSize: 5,
    });

    let files: any[] = [];
    if (res?.result?.content?.[0]?.text) {
      try {
        files = JSON.parse(res.result.content[0].text);
      } catch {
        files = [];
      }
    }

    if (Array.isArray(files) && files.length > 0 && files[0].id) {
      return { id: files[0].id, name: files[0].name };
    }
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * 3. SQLite 파일 로컬 준비 (다운로드 또는 신규 생성)
 */
export async function prepareLocalSqliteFile(
  fileName: string,
  folderId?: string
): Promise<{ localPath: string; existingFileId: string | null }> {
  const safeName = fileName.endsWith('.sqlite') || fileName.endsWith('.db') ? fileName : `${fileName}.sqlite`;
  const localPath = path.join(getCacheDir(), safeName);

  const existing = await findDriveFile(safeName, folderId);
  if (existing && existing.id) {
    try {
      await callDriveTool('drive_download', {
        fileId: existing.id,
        destPath: localPath,
      });
      return { localPath, existingFileId: existing.id };
    } catch (err: any) {
      console.warn('Download existing sqlite error, creating fresh:', err.message);
    }
  }

  if (!fs.existsSync(localPath)) {
    const freshDb = new DatabaseSync(localPath);
    freshDb.exec('PRAGMA journal_mode = WAL;');
    freshDb.close();
  }

  return { localPath, existingFileId: existing?.id || null };
}

/**
 * 4. 시트 데이터 ➔ 구글 드라이브 SQLite로 트랜잭션 전송(Insert/Upsert)
 */
export async function exportRowsToDriveSqlite(options: {
  folderName?: string;
  folderId?: string;
  fileName: string;
  tableName?: string;
  headers: string[];
  rows: any[][];
}): Promise<{
  success: boolean;
  insertedCount: number;
  fileName: string;
  folderId: string;
  message: string;
}> {
  const folderId = options.folderId || (await ensureDriveFolder(options.folderName || 'SheetBot_Databases'));
  const safeFileName = options.fileName.endsWith('.sqlite') || options.fileName.endsWith('.db')
    ? options.fileName
    : `${options.fileName}.sqlite`;
  const tableName = (options.tableName || 'orders').replace(/[^a-zA-Z0-9_\uAC00-\uD7A3]/g, '_');

  const { localPath } = await prepareLocalSqliteFile(safeFileName, folderId);

  const db = new DatabaseSync(localPath);

  try {
    const sanitizedHeaders = options.headers.map((h, i) => {
      const clean = String(h || `col_${i + 1}`).trim().replace(/['"`\[\]]/g, '');
      return clean || `col_${i + 1}`;
    });

    const colDefs = sanitizedHeaders.map((h) => `"${h}" TEXT`).join(', ');
    db.exec(`
      CREATE TABLE IF NOT EXISTS "${tableName}" (
        _id INTEGER PRIMARY KEY AUTOINCREMENT,
        _synced_at TEXT DEFAULT (datetime('now', 'localtime')),
        ${colDefs}
      );
    `);

    db.exec('BEGIN TRANSACTION;');

    const placeholders = sanitizedHeaders.map(() => '?').join(', ');
    const colNames = sanitizedHeaders.map((h) => `"${h}"`).join(', ');
    const insertStmt = db.prepare(`
      INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders});
    `);

    let count = 0;
    for (const row of options.rows) {
      if (!row || !Array.isArray(row) || row.every((c) => c === null || c === undefined || c === '')) {
        continue;
      }
      const values = sanitizedHeaders.map((_, idx) => {
        const val = row[idx];
        if (val === null || val === undefined) return '';
        return String(val);
      });
      insertStmt.run(...values);
      count++;
    }

    db.exec('COMMIT;');
    db.close();

    await callDriveTool('drive_upload', {
      filePath: localPath,
      destName: safeFileName,
      folderId: folderId || undefined,
      mimeType: 'application/x-sqlite3',
    });

    return {
      success: true,
      insertedCount: count,
      fileName: safeFileName,
      folderId,
      message: `총 ${count}건의 데이터가 구글 드라이브 SQLite('${safeFileName}')에 안전하게 저장되었습니다.`,
    };
  } catch (err: any) {
    try {
      db.exec('ROLLBACK;');
    } catch {}
    try {
      db.close();
    } catch {}
    throw new Error(`SQLite 전송 오류: ${err.message}`);
  }
}

/**
 * 5-A. 조건 필터 기반 데이터 조회
 */
export async function querySqliteByFilter(options: {
  folderName?: string;
  folderId?: string;
  fileName: string;
  tableName?: string;
  startDate?: string;
  endDate?: string;
  dateColumn?: string;
  keyword?: string;
  keywordColumn?: string;
  limit?: number;
}): Promise<{
  success: boolean;
  headers: string[];
  rows: any[][];
  totalCount: number;
  message: string;
}> {
  const folderId = options.folderId || (await ensureDriveFolder(options.folderName || 'SheetBot_Databases'));
  const safeFileName = options.fileName.endsWith('.sqlite') || options.fileName.endsWith('.db')
    ? options.fileName
    : `${options.fileName}.sqlite`;

  const { localPath } = await prepareLocalSqliteFile(safeFileName, folderId);
  const db = new DatabaseSync(localPath, { readOnly: true });

  try {
    const tableName = (options.tableName || 'orders').replace(/[^a-zA-Z0-9_\uAC00-\uD7A3]/g, '_');

    const cols = db.prepare(`PRAGMA table_info("${tableName}");`).all() as any[];
    if (!cols || cols.length === 0) {
      db.close();
      return { success: true, headers: [], rows: [], totalCount: 0, message: '조회할 데이터 테이블이 없습니다.' };
    }

    const displayHeaders = cols
      .map((c) => c.name)
      .filter((name) => name !== '_id');

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (options.startDate || options.endDate) {
      const dateCol = options.dateColumn || displayHeaders.find((h) => h.includes('일시') || h.includes('일자') || h.includes('date') || h.includes('날짜')) || displayHeaders[0];
      if (dateCol) {
        if (options.startDate) {
          whereClauses.push(`"${dateCol}" >= ?`);
          params.push(options.startDate);
        }
        if (options.endDate) {
          whereClauses.push(`"${dateCol}" <= ?`);
          params.push(options.endDate + ' 23:59:59');
        }
      }
    }

    if (options.keyword && options.keyword.trim()) {
      const kw = `%${options.keyword.trim()}%`;
      if (options.keywordColumn) {
        whereClauses.push(`"${options.keywordColumn}" LIKE ?`);
        params.push(kw);
      } else {
        const searchOr = displayHeaders.map((h) => `"${h}" LIKE ?`).join(' OR ');
        whereClauses.push(`(${searchOr})`);
        displayHeaders.forEach(() => params.push(kw));
      }
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const limitSql = `LIMIT ${Math.min(options.limit || 500, 2000)}`;

    const selectCols = displayHeaders.map((h) => `"${h}"`).join(', ');
    const querySql = `SELECT ${selectCols} FROM "${tableName}" ${whereSql} ORDER BY 1 DESC ${limitSql};`;

    const rawRows = db.prepare(querySql).all(...params) as Record<string, any>[];
    db.close();

    const resultRows = rawRows.map((row) => displayHeaders.map((h) => (row[h] !== null && row[h] !== undefined ? row[h] : '')));

    return {
      success: true,
      headers: displayHeaders,
      rows: resultRows,
      totalCount: resultRows.length,
      message: `총 ${resultRows.length}건의 데이터가 조회되었습니다.`,
    };
  } catch (err: any) {
    try {
      db.close();
    } catch {}
    throw new Error(`SQLite 조건 조회 오류: ${err.message}`);
  }
}

/**
 * 5-B. 🤖 AI 자연어 검색 (Text-to-SQL)
 */
export async function querySqliteByAi(options: {
  folderName?: string;
  folderId?: string;
  fileName: string;
  question: string;
}): Promise<{
  success: boolean;
  sql: string;
  headers: string[];
  rows: any[][];
  totalCount: number;
  explanation: string;
}> {
  const folderId = options.folderId || (await ensureDriveFolder(options.folderName || 'SheetBot_Databases'));
  const safeFileName = options.fileName.endsWith('.sqlite') || options.fileName.endsWith('.db')
    ? options.fileName
    : `${options.fileName}.sqlite`;

  const { localPath } = await prepareLocalSqliteFile(safeFileName, folderId);
  const db = new DatabaseSync(localPath, { readOnly: true });

  try {
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';").all() as any[]).map((t) => t.name);

    if (tables.length === 0) {
      db.close();
      return { success: false, sql: '', headers: [], rows: [], totalCount: 0, explanation: '데이터베이스에 테이블이 존재하지 않습니다.' };
    }

    const schemaInfo: Record<string, string[]> = {};
    for (const t of tables) {
      const cols = db.prepare(`PRAGMA table_info("${t}");`).all() as any[];
      schemaInfo[t] = cols.map((c) => c.name);
    }

    const prompt = `
당신은 SQLite 전문 수석 데이터베이스 엔지니어입니다.
사용자의 자연어 질문을 분석하여 SQLite 3 문법에 100% 맞는 최적의 [읽기 전용 SELECT SQL 쿼리]를 작성하세요.

[SQLite 스키마 정보]
${JSON.stringify(schemaInfo, null, 2)}

[보안 및 문법 절대 규칙]
1. 오직 'SELECT' 쿼리만 작성해야 합니다. DROP, DELETE, UPDATE, INSERT, ALTER 등 데이터 변경/삭제 구문은 절대 금지됩니다.
2. 테이블명과 컬럼명에 한글이나 공백이 포함되어 있으므로 반드시 큰따옴표로 감싸세요 (예: SELECT "주문일시", "주문자 상호", SUM("주문금액") FROM "orders" ...).
3. 결과가 너무 많을 경우를 대비해 LIMIT 1000을 넘지 않도록 작성하세요.
4. JSON 형식으로만 반환하세요:
{
  "sql": "SELECT ... FROM ...",
  "explanation": "해당 쿼리가 어떤 결과를 추출하는지에 대한 1줄 요약"
}

[사용자 질문]
${options.question}
`;

    const aiRes = await callAiCaller(prompt, {
      model: 'gemini-3.8-flash',
      temperature: 0.1,
    });

    let generatedSql = '';
    let explanation = '';

    try {
      const cleanJson = aiRes.text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const first = cleanJson.indexOf('{');
      const last = cleanJson.lastIndexOf('}');
      const parsed = JSON.parse(cleanJson.substring(first, last + 1));
      generatedSql = parsed.sql;
      explanation = parsed.explanation;
    } catch {
      throw new Error('AI가 올바른 SQL 구문을 생성하지 못했습니다.');
    }

    const trimmedUpper = generatedSql.trim().toUpperCase();
    if (!trimmedUpper.startsWith('SELECT') && !trimmedUpper.startsWith('WITH')) {
      throw new Error('보안 정책상 SELECT 쿼리만 실행할 수 있습니다.');
    }
    const forbidden = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'CREATE', 'REPLACE', 'ATTACH', 'DETACH'];
    for (const kw of forbidden) {
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      if (regex.test(generatedSql)) {
        throw new Error(`보안 정책상 ${kw} 키워드는 사용할 수 없습니다.`);
      }
    }

    const rawRows = db.prepare(generatedSql).all() as Record<string, any>[];
    db.close();

    if (!rawRows || rawRows.length === 0) {
      return {
        success: true,
        sql: generatedSql,
        headers: [],
        rows: [],
        totalCount: 0,
        explanation: `${explanation} (조회된 결과가 0건입니다.)`,
      };
    }

    const headers = Object.keys(rawRows[0]);
    const resultRows = rawRows.map((row) => headers.map((h) => (row[h] !== null && row[h] !== undefined ? row[h] : '')));

    return {
      success: true,
      sql: generatedSql,
      headers,
      rows: resultRows,
      totalCount: resultRows.length,
      explanation,
    };
  } catch (err: any) {
    try {
      db.close();
    } catch {}
    throw new Error(`AI 자연어 쿼리 오류: ${err.message}`);
  }
}
