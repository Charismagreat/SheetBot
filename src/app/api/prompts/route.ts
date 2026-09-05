import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { queryTable, insertRows, setupDatabase } from '@/lib/setup-db';

export async function GET(req: NextRequest) {
  try {
    await setupDatabase(true);
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');

    const filters: Record<string, any> = {};
    if (category && category !== 'ALL') {
      filters.category = category;
    }

    const res = await queryTable('sheetbot_prompt_templates', {
      filters,
      limit: 100,
    }).catch(() => ({ rows: [] }));

    let rows = (res.rows || []).filter((r: any) => !r.deleted_at);

    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((r: any) =>
        (r.title && r.title.toLowerCase().includes(q)) ||
        (r.description && r.description.toLowerCase().includes(q)) ||
        (r.prompt_text && r.prompt_text.toLowerCase().includes(q)) ||
        (r.tags && r.tags.toLowerCase().includes(q))
      );
    }

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

    return NextResponse.json({ success: true, prompts: formatted });
  } catch (error: any) {
    console.error('[Prompts API] GET error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const session = await getServerSession(authOptions);
    const userEmail = session?.user?.email || 'anonymous@user.com';

    const body = await req.json();
    const { category, categoryName, title, description, promptText, tags, icon, isFeatured } = body;

    if (!title || !promptText) {
      return NextResponse.json({ success: false, message: '제목과 프롬프트 내용은 필수입니다.' }, { status: 400 });
    }

    const newPrompt = {
      id: `prompt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      category: category || 'CUSTOM',
      category_name: categoryName || '사용자 발굴 프롬프트',
      title,
      description: description || '',
      prompt_text: promptText,
      tags: JSON.stringify(tags || []),
      icon: icon || 'Sparkles',
      is_featured: isFeatured ? 1 : 0,
      created_at: new Date().toISOString(),
    };

    await insertRows('sheetbot_prompt_templates', [newPrompt]);

    return NextResponse.json({ success: true, prompt: newPrompt });
  } catch (error: any) {
    console.error('[Prompts API] POST error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
