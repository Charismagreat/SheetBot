/**
 * SheetBot Zero-Retention Privacy Helper
 * 고객의 개인정보(전화번호, 문자 본문, 카카오톡 대화 내용)를 중앙 서버 DB에 평문으로 남기지 않고,
 * 오로지 고객 본인의 구글 드라이브에만 원본이 저장되도록 보장하는 프라이버시 유틸리티
 */

export function maskPhoneNumber(phone?: string | null): string {
  if (!phone) return "";
  const cleaned = phone.replace(/[^0-9]/g, "");
  if (cleaned.length === 11) {
    return cleaned.replace(/(\d{3})(\d{4})(\d{4})/, "$1-****-$3");
  }
  if (cleaned.length === 10) {
    return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, "$1-***-$3");
  }
  if (cleaned.length > 7) {
    return cleaned.slice(0, 3) + "-****-" + cleaned.slice(-4);
  }
  return phone.length > 4 ? phone.slice(0, -4) + "****" : "****";
}

export function maskRecipient(recipient?: string | null): string {
  if (!recipient) return "미지정";
  // 문자열 내에 포함된 모든 전화번호 패턴을 마스킹
  return recipient.replace(/01[0-9]-?[0-9]{3,4}-?[0-9]{4}/g, (match) => maskPhoneNumber(match));
}

export function formatZeroRetentionContent(category: string, originalLength?: number): string {
  const lenStr = originalLength ? ` (${originalLength}자)` : "";
  return `[🔒 프라이버시 보호: ${category} 원문은 고객 본인의 구글 드라이브 시트에만 안전하게 기록되었습니다${lenStr}]`;
}
