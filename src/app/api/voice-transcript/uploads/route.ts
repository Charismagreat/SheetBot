import { NextRequest } from 'next/server';
import { proxyJson } from './_proxy';

/** POST /api/voice-transcript/uploads — init chunked audio upload */
export async function POST(request: NextRequest) {
  const body = await request.text();
  return proxyJson('/voice-transcript/uploads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
