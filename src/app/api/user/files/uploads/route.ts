import { NextRequest } from 'next/server';
import { proxyJson } from './_proxy';

/** POST /api/user/files/uploads — init chunked upload */
export async function POST(request: NextRequest) {
  const body = await request.text();
  return proxyJson('/user-data/uploads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
