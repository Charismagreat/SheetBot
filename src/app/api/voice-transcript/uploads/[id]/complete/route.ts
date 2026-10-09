import { NextRequest } from 'next/server';
import { proxyJson } from '../../_proxy';

/** POST — finalize upload */
export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> | { id: string } },
) {
  const params = await Promise.resolve(ctx.params);
  return proxyJson(`/voice-transcript/uploads/${params.id}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
}
