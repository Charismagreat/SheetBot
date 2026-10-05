import { NextRequest } from 'next/server';
import { proxyRaw } from '../../../_proxy';

/** PUT /api/user/files/uploads/:id/chunks/:index — raw octet-stream chunk */
export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; index: string }> | { id: string; index: string } },
) {
  const params = await Promise.resolve(ctx.params);
  const buf = await request.arrayBuffer();
  const sha = request.headers.get('x-chunk-sha256');
  return proxyRaw(
    `/user-data/uploads/${params.id}/chunks/${params.index}`,
    'PUT',
    buf,
    {
      'Content-Type': 'application/octet-stream',
      ...(sha ? { 'x-chunk-sha256': sha } : {}),
    },
  );
}
