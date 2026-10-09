import { NextRequest } from 'next/server';
import { proxyJson } from '../_proxy';

/** GET — upload status */
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> | { id: string } },
) {
  const params = await Promise.resolve(ctx.params);
  return proxyJson(`/voice-transcript/uploads/${params.id}`, { method: 'GET' });
}

/** DELETE — abort upload */
export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> | { id: string } },
) {
  const params = await Promise.resolve(ctx.params);
  return proxyJson(`/voice-transcript/uploads/${params.id}`, { method: 'DELETE' });
}
