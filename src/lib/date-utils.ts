/**
 * 한국 표준시(KST, UTC+9) 일시 문자열 생성 헬퍼
 * 반환 포맷: YYYY-MM-DD HH:mm:ss
 */
export function getKoreanTimeString(date: Date = new Date()): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().replace("T", " ").slice(0, 19);
}
