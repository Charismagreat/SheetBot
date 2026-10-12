import { NextResponse } from 'next/server';
import { COPILOT_SIDEBAR_HTML } from '@/lib/templates/copilot-sidebar';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  return new NextResponse(COPILOT_SIDEBAR_HTML, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
