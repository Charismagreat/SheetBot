import { NextRequest } from 'next/server';
import { proxyJson } from '../../_proxy';

/** POST /api/user/files/uploads/:id/complete */
export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> | { id: string } },
) {
  const params = await Promise.resolve(ctx.params);
  return proxyJson(`/user-data/uploads/${params.id}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
}
