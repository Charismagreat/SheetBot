/**
 * NextAuth SessionProvider basePath — app-owned (not overwritten by EGDesk generateApiWrapper).
 */

import { getEgdeskBasePath } from '../../egdesk-helpers';

export function getNextAuthBasePath(): string {
  const root = getEgdeskBasePath();
  return root ? `${root}/api/auth` : '/api/auth';
}
