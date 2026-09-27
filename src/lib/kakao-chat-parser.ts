/**
 * 카카오톡 대화 내용 내보내기(.txt) 파일 전용 고성능 파서
 * 안드로이드, iOS, PC 카카오톡 내보내기 규격을 모두 수용하며,
 * 시작 일시(startTime), 종료 일시(endTime), 채팅방명, 대화 목록을 추출합니다.
 */

export interface KakaoChatMessage {
  timestamp: string;      // YYYY-MM-DD HH:mm:ss
  direction: "수신" | "발신";
  sender: string;         // 보낸 사람 이름
  message: string;        // 메시지 내용
  chatRoomName: string;   // 채팅방/상대방 이름
}

export interface KakaoChatParseResult {
  chatRoomName: string;
  totalCount: number;
  inboundCount: number;
  outboundCount: number;
  startTime: string;      // 파일 내 첫 대화 일시 (YYYY-MM-DD HH:mm:ss)
  endTime: string;        // 파일 내 마지막 대화 일시 (YYYY-MM-DD HH:mm:ss)
  messages: KakaoChatMessage[];
}

/**
 * 카카오톡 내보내기 텍스트 파일 파싱
 * @param content 파일 텍스트 전문
 * @param fallbackRoomName 파일명 등에서 가져온 보조 채팅방명 (예: "홍길동")
 * @param myName 사용자의 카톡 닉네임 (지정 시 해당 닉네임도 '발신'으로 자동 처리)
 */
export function parseKakaoChatText(
  content: string,
  fallbackRoomName: string = "",
  myName: string = ""
): KakaoChatParseResult {
  const lines = content.split(/\r?\n/);
  let detectedRoomName = "";
  let currentDate = ""; // YYYY-MM-DD

  const parsedMessages: KakaoChatMessage[] = [];
  let currentMsg: KakaoChatMessage | null = null;

  // 1. 첫 몇 줄에서 채팅방 이름 추출
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i].trim();
    // 예: "홍길동 님과 카카오톡 대화", "프로젝트 단톡방 카카오톡 대화"
    const roomMatch = line.match(/^(.+?)\s*(님과\s*)?카카오톡 대화/i);
    if (roomMatch && roomMatch[1]) {
      detectedRoomName = roomMatch[1].replace(/님과$/, "").trim();
      break;
    }
  }

  if (!detectedRoomName && fallbackRoomName) {
    detectedRoomName = fallbackRoomName.replace(/\.txt$/i, "").replace(/카카오톡 대화/i, "").trim();
  }
  if (!detectedRoomName) {
    detectedRoomName = "카카오톡 대화";
  }

  // 정규식 패턴들
  // [날짜 구분선] 예: "--------------- 2026년 9월 27일 일요일 ---------------" 또는 "--------------- 2026. 9. 27. 일요일 ---------------"
  const dateSepRegex1 = /^-+\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*.*?-+$/;
  const dateSepRegex2 = /^-+\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*.*?-+$/;

  // [안드로이드/PC 포맷] 예: "[홍길동] [오후 2:15] 안녕하세요"
  const androidMsgRegex = /^\[([^\]]+)\]\s*\[(오전|오후)\s*(\d{1,2}):(\d{2})\]\s*(.*)$/;

  // [iOS 포맷] 예: "2026. 9. 27. 오후 2:15, 홍길동 : 안녕하세요" 또는 "2026년 9월 27일 오후 2:15, 홍길동 : 안녕하세요"
  const iosMsgRegex = /^(\d{4})[\.\년]\s*(\d{1,2})[\.\월]\s*(\d{1,2})[일\.]?\s*(오전|오후)\s*(\d{1,2}):(\d{2}),\s*([^:]+)\s*:\s*(.*)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1) 날짜 구분선 검사
    const dateMatch1 = trimmed.match(dateSepRegex1);
    if (dateMatch1) {
      if (currentMsg) {
        parsedMessages.push(currentMsg);
        currentMsg = null;
      }
      const y = dateMatch1[1];
      const m = dateMatch1[2].padStart(2, "0");
      const d = dateMatch1[3].padStart(2, "0");
      currentDate = `${y}-${m}-${d}`;
      continue;
    }

    const dateMatch2 = trimmed.match(dateSepRegex2);
    if (dateMatch2) {
      if (currentMsg) {
        parsedMessages.push(currentMsg);
        currentMsg = null;
      }
      const y = dateMatch2[1];
      const m = dateMatch2[2].padStart(2, "0");
      const d = dateMatch2[3].padStart(2, "0");
      currentDate = `${y}-${m}-${d}`;
      continue;
    }

    // 2) 안드로이드/PC 포맷 메시지 검사
    const androidMatch = line.match(androidMsgRegex);
    if (androidMatch) {
      if (currentMsg) {
        parsedMessages.push(currentMsg);
        currentMsg = null;
      }

      const sender = androidMatch[1].trim();
      const ampm = androidMatch[2];
      let hour = parseInt(androidMatch[3], 10);
      const minute = androidMatch[4];
      const text = androidMatch[5];

      if (ampm === "오후" && hour < 12) hour += 12;
      if (ampm === "오전" && hour === 12) hour = 0;
      const hourStr = hour.toString().padStart(2, "0");

      const dateStr = currentDate || new Date().toISOString().slice(0, 10);
      const timestamp = `${dateStr} ${hourStr}:${minute}:00`;

      const isMyMessage = isMe(sender, myName);
      currentMsg = {
        timestamp,
        direction: isMyMessage ? "발신" : "수신",
        sender,
        message: text,
        chatRoomName: detectedRoomName,
      };
      continue;
    }

    // 3) iOS 포맷 메시지 검사
    const iosMatch = line.match(iosMsgRegex);
    if (iosMatch) {
      if (currentMsg) {
        parsedMessages.push(currentMsg);
        currentMsg = null;
      }

      const y = iosMatch[1];
      const m = iosMatch[2].padStart(2, "0");
      const d = iosMatch[3].padStart(2, "0");
      currentDate = `${y}-${m}-${d}`;

      const ampm = iosMatch[4];
      let hour = parseInt(iosMatch[5], 10);
      const minute = iosMatch[6];
      const sender = iosMatch[7].trim();
      const text = iosMatch[8];

      if (ampm === "오후" && hour < 12) hour += 12;
      if (ampm === "오전" && hour === 12) hour = 0;
      const hourStr = hour.toString().padStart(2, "0");
      const timestamp = `${currentDate} ${hourStr}:${minute}:00`;

      const isMyMessage = isMe(sender, myName);
      currentMsg = {
        timestamp,
        direction: isMyMessage ? "발신" : "수신",
        sender,
        message: text,
        chatRoomName: detectedRoomName,
      };
      continue;
    }

    // 4) 멀티라인(장문 메시지) 처리
    if (currentMsg && trimmed.length > 0) {
      currentMsg.message += `\n${line}`;
    }
  }

  if (currentMsg) {
    parsedMessages.push(currentMsg);
  }

  // 시간순 정렬
  parsedMessages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const totalCount = parsedMessages.length;
  let inboundCount = 0;
  let outboundCount = 0;

  for (const m of parsedMessages) {
    if (m.direction === "발신") {
      outboundCount++;
    } else {
      inboundCount++;
    }
  }

  const startTime = parsedMessages.length > 0 ? parsedMessages[0].timestamp : "";
  const endTime = parsedMessages.length > 0 ? parsedMessages[parsedMessages.length - 1].timestamp : "";

  return {
    chatRoomName: detectedRoomName,
    totalCount,
    inboundCount,
    outboundCount,
    startTime,
    endTime,
    messages: parsedMessages,
  };
}

/**
 * 발신자가 '나'인지 판별
 */
function isMe(sender: string, myCustomName: string = ""): Boolean {
  const clean = sender.trim().toLowerCase();
  if (clean === "나" || clean === "회원님" || clean === "me") {
    return true;
  }
  if (myCustomName && clean === myCustomName.trim().toLowerCase()) {
    return true;
  }
  return false;
}
