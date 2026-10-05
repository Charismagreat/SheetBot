import { NextRequest } from 'next/server';
import { proxyJson } from '../_proxy';

/** GET /api/user/files/uploads/:id — status */
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> | { id: string } },
) {
  const params = await Promise.resolve(ctx.params);
  return proxyJson(`/user-data/uploads/${params.id}`, { method: 'GET' });
}

/** DELETE /api/user/files/uploads/:id — abort */
export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> | { id: string } },
) {
  const params = await Promise.resolve(ctx.params);
  return proxyJson(`/user-data/uploads/${params.id}`, { method: 'DELETE' });
}
