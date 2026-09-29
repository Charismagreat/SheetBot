import { queryTable } from "@/lib/egdesk-helpers";

/**
 * 사장님 이메일과 모바일 고객용 주문/견적 URL 키(Slug) 상호 변환 헬퍼
 */

/**
 * 이메일을 URL 친화적인 안전한 base64url 키로 인코딩
 */
export function encodeUserKey(email: string): string {
  if (!email) return "";
  return Buffer.from(email.toLowerCase().trim()).toString("base64url");
}

/**
 * URL 키로부터 사장님 이메일 안전 복원
 * 1. Base64URL 디코딩 검증
 * 2. 실패 시 sheetbot_users DB에서 사용자 ID 매핑 조회
 */
export async function resolveUserEmailFromKey(userKey: string): Promise<string | null> {
  if (!userKey) return null;

  // 1. 직접 이메일인 경우 (URL 인코딩된 이메일)
  if (userKey.includes("@")) {
    return decodeURIComponent(userKey).toLowerCase().trim();
  }

  // 2. Base64URL 디코딩 시도
  try {
    const decoded = Buffer.from(userKey, "base64url").toString("utf-8");
    if (decoded.includes("@") && decoded.includes(".")) {
      return decoded.toLowerCase().trim();
    }
  } catch (_) {}

  // 3. sheetbot_users DB에서 id 또는 uuid로 조회
  try {
    const res = await queryTable("sheetbot_users", {
      filters: { id: userKey },
      limit: 1,
    });
    if (res?.rows && res.rows.length > 0 && res.rows[0].email) {
      return res.rows[0].email.toLowerCase().trim();
    }
  } catch (_) {}

  return null;
}
