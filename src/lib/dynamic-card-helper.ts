import { callAiCaller, queryTable, insertRows, updateRows } from "@/lib/egdesk-helpers";

/**
 * ⚡ OTA 동적 카드(Server-Driven Dynamic Card) 입력 필드 규격
 */
export interface DynamicCardInputField {
  key: string; // 예: "photo", "memo", "customerName", "amount"
  label: string; // 예: "📷 사진 촬영 / 파일 첨부", "메모 입력"
  type: "IMAGE" | "FILE" | "TEXT" | "NUMBER" | "PHONE";
  placeholder?: string;
  required?: boolean;
}

/**
 * ⚡ 동적 카드 연동 구글 시트 / FileToSheet 자동 생성 규격
 */
export interface DynamicCardSheetSpec {
  cardId: string; // 시트 바인딩 키 (예: "custom_vehicle_log")
  sheetName: string; // 구글 시트 파일/탭 이름 (예: "[SheetBot] 업무용 차량 주행일지")
  folderName?: string; // 구글 드라이브 보관 폴더명 (예: "[SheetBot] 차량 주행일지 보관함")
  headers: string[]; // 1행 컬럼 헤더 배열
}

/**
 * ⚡ 모바일 앱이 APK 업데이트 없이 즉시 다운로드·렌더링·실행하는 카드 설계도(Manifest)
 */
export interface DynamicCardManifest {
  uiType: "DYNAMIC_NATIVE" | "MINI_WEBAPP";
  sheetSpec: DynamicCardSheetSpec;
  inputs: DynamicCardInputField[];
  submitButtonText?: string; // 예: "🚀 AI 판독 및 시트 기록"
  aiPrompt?: string; // 사진/텍스트에서 시트 컬럼 값을 추출하기 위한 AI 지시문
  webAppUrl?: string; // MINI_WEBAPP 모드일 때 로드할 URL
  keywords?: string[]; // 초성/자연어 검색 키워드
}

/**
 * 🛡️ 이지데스크 AI Caller 2중 언래핑(Unwrapping) JSON 파서 (표준 원칙 준수)
 */
export function unwrapAiCallerText(res: any): string {
  if (!res) return "";
  let raw = "";
  if (typeof res === "string") {
    raw = res;
  } else if (typeof res.content === "string") {
    raw = res.content;
  } else if (typeof res.text === "string") {
    raw = res.text;
  } else if (res.raw && typeof res.raw.content === "string") {
    raw = res.raw.content;
  } else {
    raw = JSON.stringify(res);
  }

  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.includes('"content"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed.content === "string" && ("usage" in parsed || "finishReason" in parsed)) {
        return parsed.content.trim();
      }
    } catch {
      // ignore outer wrapper parse failure
    }
  }
  return trimmed;
}

export function unwrapAiCallerJson<T = Record<string, any>>(res: any): T | null {
  const innerText = unwrapAiCallerText(res);
  if (!innerText) return null;

  // 마크다운 코드블록(```json ... ```) 제거
  const cleaned = innerText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // 텍스트 내에 포함된 첫 번째 JSON 객체({...}) 추출 시도
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * 🛍️ 기본 카탈로그 내 미내장(동적 확장) 카드 5종의 기본 Manifest 사전
 */
export const DEFAULT_DYNAMIC_MANIFESTS: Record<string, DynamicCardManifest> = {
  cardTaxInvoice: {
    uiType: "DYNAMIC_NATIVE",
    sheetSpec: {
      cardId: "tax_invoice_ocr",
      sheetName: "[SheetBot] 전자세금계산서 및 거래명세표 대장",
      folderName: "[SheetBot] 세금계산서 보관함",
      headers: [
        "일련번호",
        "등록일시",
        "작성일자",
        "공급자상호",
        "사업자등록번호",
        "대표자명",
        "품목요약",
        "공급가액(원)",
        "세액(원)",
        "합계금액(원)",
        "증빙파일URL",
        "비고",
      ],
    },
    inputs: [
      {
        key: "file",
        label: "📷 세금계산서 / 거래명세표 촬영·첨부",
        type: "IMAGE",
        required: false,
      },
      {
        key: "companyName",
        label: "거래처 상호 (직접 입력 시)",
        type: "TEXT",
        placeholder: "사진 첨부 시 AI가 자동 인식합니다",
      },
      {
        key: "memo",
        label: "비고 / 정산 메모",
        type: "TEXT",
        placeholder: "예: 11월분 정기 매입 정산",
      },
    ],
    submitButtonText: "🚀 AI 계산서 판독 및 시트 기록",
    aiPrompt:
      "첨부된 세금계산서 또는 거래명세표 이미지와 입력 메모를 분석하여 작성일자(YYYY-MM-DD), 공급자상호, 사업자등록번호, 대표자명, 품목요약, 공급가액(원), 세액(원), 합계금액(원), 비고를 JSON으로 정확히 추출하세요.",
    keywords: ["세금계산서", "계산서", "거래명세표", "홈택스", "매입", "매출", "정산"],
  },
  cardInventory: {
    uiType: "DYNAMIC_NATIVE",
    sheetSpec: {
      cardId: "smart_inventory",
      sheetName: "[SheetBot] 스마트 실시간 재고 입출고 대장",
      folderName: "[SheetBot] 재고 송장 보관함",
      headers: [
        "일련번호",
        "등록일시",
        "입출고구분",
        "품목명",
        "규격/모델",
        "수량",
        "단가(원)",
        "거래처/담당자",
        "현장사진URL",
        "비고",
      ],
    },
    inputs: [
      {
        key: "file",
        label: "📷 입출고 송장 / 바코드·현장 사진 촬영",
        type: "IMAGE",
        required: false,
      },
      {
        key: "itemInfo",
        label: "입출고 품목 및 수량 메모",
        type: "TEXT",
        placeholder: "예: [입고] A4용지 10박스 / 송장 사진 첨부 가능",
      },
    ],
    submitButtonText: "📦 AI 재고 판독 및 시트 기록",
    aiPrompt:
      "첨부된 입출고 송장/재고 사진 및 사용자 입력 텍스트를 분석하여 입출고구분(입고/출고/재고실사), 품목명, 규격/모델, 수량(숫자), 단가(원), 거래처/담당자, 비고를 JSON으로 추출하세요.",
    keywords: ["재고", "입출고", "송장", "바코드", "창고", "수량", "발주"],
  },
  cardAttendance: {
    uiType: "DYNAMIC_NATIVE",
    sheetSpec: {
      cardId: "staff_attendance",
      sheetName: "[SheetBot] 직원 출퇴근 및 근무시간 대장",
      folderName: "[SheetBot] 근무표 보관함",
      headers: [
        "일련번호",
        "기록일시",
        "직원성함",
        "근무구분(출근/퇴근/외근)",
        "근무시간/교대",
        "현장/지점명",
        "인증사진URL",
        "특이사항",
      ],
    },
    inputs: [
      {
        key: "staffName",
        label: "직원 성함 / 근무 구분",
        type: "TEXT",
        placeholder: "예: 홍길동 매니저 - 오전 출근",
        required: true,
      },
      {
        key: "file",
        label: "📷 현장 출퇴근 인증 사진 / 근무표 촬영 (선택)",
        type: "IMAGE",
        required: false,
      },
      {
        key: "memo",
        label: "특이사항 / 연장근무 메모",
        type: "TEXT",
        placeholder: "예: 1시간 연장근무 포함",
      },
    ],
    submitButtonText: "⏰ 출퇴근 기록 시트 전송",
    aiPrompt:
      "입력된 직원 출퇴근 정보와 사진을 바탕으로 직원성함, 근무구분(출근/퇴근/외근), 근무시간/교대, 현장/지점명, 특이사항을 JSON으로 정리하세요.",
    keywords: ["출퇴근", "근태", "알바", "급여", "출근", "퇴근", "근무시간"],
  },
  cardReviewReply: {
    uiType: "DYNAMIC_NATIVE",
    sheetSpec: {
      cardId: "review_ai_reply",
      sheetName: "[SheetBot] 플레이스·배달앱 리뷰 AI 답글 대장",
      folderName: "[SheetBot] 고객 리뷰 캡처 보관함",
      headers: [
        "일련번호",
        "등록일시",
        "플랫폼(배민/플레이스등)",
        "고객닉네임/별점",
        "고객리뷰원문",
        "AI추천맞춤답글",
        "리뷰캡처URL",
        "비고",
      ],
    },
    inputs: [
      {
        key: "file",
        label: "📷 고객 리뷰 화면 캡처 첨부 (선택)",
        type: "IMAGE",
        required: false,
      },
      {
        key: "reviewText",
        label: "고객 리뷰 내용 또는 답글 요청사항",
        type: "TEXT",
        placeholder: "리뷰 내용을 붙여넣거나 캡처 이미지를 첨부하세요",
      },
    ],
    submitButtonText: "💬 AI 정성 답글 생성 및 시트 기록",
    aiPrompt:
      "첨부된 리뷰 캡처 이미지 또는 고객 리뷰 원문을 분석하여 플랫폼(배민/플레이스등), 고객닉네임/별점, 고객리뷰원문을 파악하고, 사장님의 따뜻하고 진정성 있는 3~4문장 분량의 'AI추천맞춤답글'을 작성하여 JSON으로 반환하세요.",
    keywords: ["리뷰", "배민", "배달의민족", "플레이스", "답글", "댓글", "별점"],
  },
  cardVipCustomAuto: {
    uiType: "DYNAMIC_NATIVE",
    sheetSpec: {
      cardId: "vip_custom_auto",
      sheetName: "[SheetBot] VIP 프라이빗 비즈니스 통합 대장",
      folderName: "[SheetBot] VIP 전용 보관함",
      headers: [
        "일련번호",
        "등록일시",
        "업무분류",
        "핵심제목",
        "상세내용/AI요약",
        "관련금액/지표",
        "후속조치사항",
        "첨부파일URL",
      ],
    },
    inputs: [
      {
        key: "file",
        label: "📷 현장 사진 / 서류 첨부 (선택)",
        type: "IMAGE",
        required: false,
      },
      {
        key: "memo",
        label: "업무 지시 / 현장 메모",
        type: "TEXT",
        placeholder: "기록할 내용이나 AI 분석 지시사항을 입력하세요",
      },
    ],
    submitButtonText: "👑 VIP AI 분석 및 전용 시트 기록",
    aiPrompt:
      "첨부 파일과 입력 메모를 분석하여 업무분류, 핵심제목, 상세내용/AI요약, 관련금액/지표, 후속조치사항을 JSON으로 정리하세요.",
    keywords: ["VIP", "맞춤", "전용", "프라이빗"],
  },
};

/**
 * 임의의 카드에 별도 manifest_json이 없을 때 즉시 사용 가능한 표준 동적 Manifest를 자동 조립
 */
export function buildDefaultManifestForCard(
  key: string,
  title: string,
  description: string
): DynamicCardManifest {
  if (DEFAULT_DYNAMIC_MANIFESTS[key]) {
    return DEFAULT_DYNAMIC_MANIFESTS[key];
  }

  const cleanTitle = (title || key).replace(/^[^\w가-힣]+/, "").trim();
  const safeId = key
    .replace(/^card/i, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_") || "custom_card";

  return {
    uiType: "DYNAMIC_NATIVE",
    sheetSpec: {
      cardId: safeId,
      sheetName: `[SheetBot] ${cleanTitle} 대장`,
      folderName: `[SheetBot] ${cleanTitle} 보관함`,
      headers: [
        "일련번호",
        "등록일시",
        "구분/분류",
        "핵심내용",
        "AI상세분석",
        "금액/수치",
        "첨부파일URL",
        "비고",
      ],
    },
    inputs: [
      {
        key: "file",
        label: `📷 ${cleanTitle} 사진 촬영 / 파일 첨부`,
        type: "IMAGE",
        required: false,
      },
      {
        key: "memo",
        label: "내용 입력 / AI 요청 메모",
        type: "TEXT",
        placeholder: `${cleanTitle} 관련 메모나 지시사항을 입력하세요`,
        required: false,
      },
    ],
    submitButtonText: `🚀 ${cleanTitle} AI 처리 및 시트 기록`,
    aiPrompt: `다음은 '${cleanTitle}'(${description}) 업무 카드입니다. 첨부된 이미지/문서 및 사용자의 입력 메모를 정밀 분석하여 '구분/분류', '핵심내용', 'AI상세분석', '금액/수치', '비고' 항목을 JSON 형식으로 추출하세요.`,
    keywords: [cleanTitle],
  };
}

/**
 * DB(`sheetbot_marketplace_cards.manifest_json` 또는 `sheetbot_settings`)에 동적 카드 Manifest 백업 저장
 */
export async function saveDynamicCardManifestBackup(
  cardKey: string,
  manifest: DynamicCardManifest,
  userEmail: string
): Promise<void> {
  const settingKey = `card_manifest:${cardKey.trim()}`;
  const manifestStr = JSON.stringify(manifest);
  const now = new Date().toISOString();

  try {
    const existing = await queryTable("sheetbot_settings", {
      filters: { key: settingKey },
      limit: 5,
    }).catch(() => ({ rows: [] }));

    const activeRow = (existing.rows || []).find((r: any) => !r.deleted_at);
    if (activeRow?.id) {
      await updateRows("sheetbot_settings", {
        filters: { id: String(activeRow.id) },
        updates: {
          value: manifestStr,
          updated_at: now,
          updated_by: userEmail,
        },
      });
    } else {
      await insertRows("sheetbot_settings", [
        {
          key: settingKey,
          value: manifestStr,
          description: `Dynamic card manifest for ${cardKey}`,
          created_at: now,
          updated_at: now,
          updated_by: userEmail,
        },
      ]);
    }
  } catch (err: any) {
    console.warn(`[DynamicCardHelper] Backup save warning for ${cardKey}:`, err?.message);
  }
}

/**
 * 카드 키(`cardKey`)로 DB 또는 기본 사전에서 `DynamicCardManifest`를 조회
 */
export async function resolveDynamicCardManifest(
  cardKey: string,
  rawManifestJson?: string | null,
  fallbackTitle?: string,
  fallbackDescription?: string
): Promise<DynamicCardManifest> {
  if (rawManifestJson && rawManifestJson.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(rawManifestJson) as DynamicCardManifest;
      if (parsed && parsed.sheetSpec && Array.isArray(parsed.sheetSpec.headers)) {
        return parsed;
      }
    } catch {
      // ignore invalid JSON
    }
  }

  // 1. sheetbot_marketplace_cards 테이블 조회
  try {
    const res = await queryTable("sheetbot_marketplace_cards", {
      filters: { key: cardKey },
      limit: 5,
    }).catch(() => ({ rows: [] }));

    const row = (res.rows || []).find((r: any) => !r.deleted_at);
    if (row) {
      if (row.manifest_json && String(row.manifest_json).trim().startsWith("{")) {
        try {
          const parsed = JSON.parse(String(row.manifest_json)) as DynamicCardManifest;
          if (parsed && parsed.sheetSpec) return parsed;
        } catch {
          // fallback below
        }
      }
      fallbackTitle = fallbackTitle || row.title;
      fallbackDescription = fallbackDescription || row.description;
    }
  } catch {
    // ignore
  }

  // 2. sheetbot_settings 백업 조회
  try {
    const settingRes = await queryTable("sheetbot_settings", {
      filters: { key: `card_manifest:${cardKey}` },
      limit: 5,
    }).catch(() => ({ rows: [] }));

    const settingRow = (settingRes.rows || []).find((r: any) => !r.deleted_at);
    if (settingRow?.value && String(settingRow.value).trim().startsWith("{")) {
      const parsed = JSON.parse(String(settingRow.value)) as DynamicCardManifest;
      if (parsed && parsed.sheetSpec) return parsed;
    }
  } catch {
    // ignore
  }

  // 3. 기본 내장 사전 또는 자동 생성 폴백
  return buildDefaultManifestForCard(
    cardKey,
    fallbackTitle || cardKey,
    fallbackDescription || ""
  );
}

/**
 * 🤖 자연어 요구사항(프롬프트)으로부터 카드 메타데이터 + DynamicCardManifest를 AI로 즉시 설계
 */
export async function generateCardSpecWithAi(params: {
  prompt: string;
  userEmail?: string;
  preferredKey?: string;
  preferredTitle?: string;
}): Promise<{
  key: string;
  title: string;
  icon: string;
  category: "store" | "crm" | "ai" | "exclusive";
  categoryName: string;
  description: string;
  badge: string;
  manifest: DynamicCardManifest;
}> {
  const sysPrompt = `당신은 '시트봇(SheetBot)' 모바일 앱의 동적 업무 카드 아키텍트입니다.
사용자의 자연어 요청을 분석하여 스마트폰 앱을 업데이트하지 않고도 즉시 다운로드해 사용할 수 있는 카드 메타데이터와 실행 설계도(manifest)를 JSON으로 생성하세요.

반드시 순수 JSON 객체만 반환하며, 아래 스키마를 정확히 따르세요:
{
  "key": "cardCustom영문카멜케이스 (예: cardVehicleMileage)",
  "title": "직관적인 한글 카드 제목 (18자 이내, 예: 업무용 차량 주행일지)",
  "icon": "이모지 1개 (예: 🚗)",
  "category": "store | crm | ai | exclusive 중 하나",
  "categoryName": "매장 · 정산 | 고객 · 영업 | AI 자동화 | 나만의 맞춤 카드",
  "description": "카드의 핵심 기능과 효과를 설명하는 2문장 설명",
  "badge": "NEW 또는 맞춤",
  "manifest": {
    "uiType": "DYNAMIC_NATIVE",
    "sheetSpec": {
      "cardId": "영문_스네이크_케이스 (예: vehicle_mileage)",
      "sheetName": "[SheetBot] 한글 대장명 (예: [SheetBot] 업무용 차량 주행일지 대장)",
      "folderName": "[SheetBot] 한글 보관함명 (예: [SheetBot] 차량 주행일지 보관함)",
      "headers": ["일련번호", "등록일시", ...업무에 꼭 필요한 5~7개 한글 컬럼명..., "첨부파일URL", "비고"]
    },
    "inputs": [
      {
        "key": "file",
        "label": "📷 사진 촬영 / 파일 첨부 라벨",
        "type": "IMAGE",
        "required": false
      },
      {
        "key": "memo",
        "label": "텍스트 입력창 라벨",
        "type": "TEXT",
        "placeholder": "예시 입력 안내문",
        "required": false
      }
    ],
    "submitButtonText": "🚀 AI 분석 및 시트 기록 버튼 문구",
    "aiPrompt": "첨부된 이미지/파일과 사용자 입력값을 분석하여 sheetSpec.headers의 각 컬럼에 들어갈 값을 JSON 객체로 추출하라는 구체적인 AI 지시문",
    "keywords": ["초성/자연어 검색용 한글 키워드 5개"]
  }
}`;

  const userPrompt = `사용자 요청: "${params.prompt}"
${params.preferredTitle ? `희망 제목: ${params.preferredTitle}` : ""}
${params.preferredKey ? `희망 키: ${params.preferredKey}` : ""}`;

  try {
    const aiRes = await callAiCaller(userPrompt, {
      caller: "sheetbot-dynamic-card-designer",
      systemPrompt: sysPrompt,
      temperature: 0.2,
    });

    const parsed = unwrapAiCallerJson<any>(aiRes);
    if (parsed && parsed.title && parsed.manifest?.sheetSpec?.headers) {
      const finalKey =
        params.preferredKey ||
        parsed.key ||
        `cardCustom${Date.now().toString().slice(-5)}`;
      const finalTitle = params.preferredTitle || parsed.title;
      return {
        key: finalKey,
        title: finalTitle,
        icon: parsed.icon || "⚡",
        category: parsed.category || "exclusive",
        categoryName: parsed.categoryName || "나만의 맞춤 카드",
        description: parsed.description || params.prompt,
        badge: parsed.badge || "맞춤",
        manifest: parsed.manifest,
      };
    }
  } catch (err: any) {
    console.warn("[DynamicCardHelper] AI generation fallback:", err?.message);
  }

  // 폴백: 프롬프트 기반 기본 설계도 생성
  const fallbackKey =
    params.preferredKey || `cardCustom${Date.now().toString().slice(-5)}`;
  const fallbackTitle =
    params.preferredTitle || params.prompt.slice(0, 18).trim() || "나만의 맞춤 카드";

  return {
    key: fallbackKey,
    title: fallbackTitle,
    icon: "⚡",
    category: "exclusive",
    categoryName: "나만의 맞춤 카드",
    description: params.prompt,
    badge: "맞춤",
    manifest: buildDefaultManifestForCard(fallbackKey, fallbackTitle, params.prompt),
  };
}
