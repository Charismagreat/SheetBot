import { callAiCaller } from "@/lib/egdesk-helpers";
import { updateRows } from "@/lib/egdesk-helpers";

export interface InquiryDraftInput {
  type: "ENTERPRISE" | "FDE_APPLICATION" | "FDE_REQUEST" | "GENERAL";
  companyName?: string;
  contactName?: string;
  userEmail?: string;
  phone?: string;
  industry?: string;
  targetAreas?: string;
  useVoucher?: string;
  title?: string;
  content?: string;
}

/**
 * 고객 문의 / FDE 지원 / 기업 맞춤 AX 견적 신청에 대한 AI 자동 초안 생성
 */
export async function generateInquiryAiDraft(input: InquiryDraftInput): Promise<string> {
  const {
    type,
    companyName = "",
    contactName = "",
    userEmail = "",
    phone = "",
    industry = "",
    targetAreas = "",
    useVoucher = "",
    title = "",
    content = "",
  } = input;

  let prompt = "";

  if (type === "ENTERPRISE") {
    prompt = `
당신은 대한민국 1등 구글 스프레드시트 기반 업무 자동화 & 경량 ERP 솔루션 'SheetBot (시트봇)'의 엔터프라이즈 AX(AI 전환) 수석 컨설턴트입니다.
아래 접수된 [기업 맞춤 AX 진단 & 견적 신청서]를 분석하고, 관리자가 신청 고객에게 보낼 전문적이고 정중하며 신뢰감 넘치는 1차 상담 및 회신 답변 초안을 작성해 주세요.

[신청 기업 정보]
- 회사명 / 상호: ${companyName || "고객사"}
- 담당자 성함 / 직책: ${contactName || "담당자님"}
- 연락처: ${phone || "미기재"}
- 이메일: ${userEmail || "미기재"}
- 업종 / 산업군: ${industry || "일반 기업"}
- 희망 자동화 영역: ${targetAreas || "업무 자동화 및 시트 연동"}
- 정부지원사업(비대면 바우처 등) 연계 희망: ${useVoucher === "YES" ? "희망함 (최대 70~80% 정부지원 연계 필요)" : useVoucher === "CONSULT" ? "상담 후 결정" : "자체 예산 집행"}
- 고객 상세 요구사항:
${content || "(별도 텍스트 없음)"}

[작성 지침]
1. 인사말: "${companyName} ${contactName} 담당자님, 안녕하세요. 구글 스프레드시트 기반 경량 ERP & 업무 자동화 전문 솔루션 SheetBot(시트봇) AX 컨설팅 팀입니다."로 시작하세요.
2. 기술적 진단 & 해결책:
   - 신청하신 업종(${industry})과 희망 자동화 영역(${targetAreas})에 맞춰, SheetBot의 네이티브 엔진(Apps Script 자동 주입, 이지데스크 터널, SQLite 양방향 동기화)을 통해 고가의 ERP 도입 없이 기존 구글 시트 그대로 단 1~3일 내 신속 구축 가능함을 설득력 있게 설명하세요.
3. 정부지원사업 안내:
   - 바우처 희망 여부(${useVoucher})를 반영하여, 비대면 서비스 바우처나 스마트공방/AX 지원사업과 연계하여 실부담금을 대폭 절감할 수 있는 컨설팅을 무상 지원함을 안내하세요.
4. 다음 단계 제안 (Call to Action):
   - 담당자 연락처(${phone})로 24시간 이내에 1차 맞춤 진단서와 함께 유선 상담을 드릴 예정임을 밝히고, 편하신 통화 가능 시간대를 회신 요청하세요.
5. 어조 및 서식 주의:
   - 매우 정중하고 비즈니스 매너를 갖춘 신뢰감 있는 톤(한국어).
   - [절대 주의] 이메일 제목(예: "**제목: ...**")이나 메타데이터를 절대 출력하지 말고, 곧바로 인사말 본문부터 시작하세요.
`.trim();
  } else if (type === "FDE_APPLICATION" || title.includes("파트너 지원")) {
    prompt = `
당신은 대한민국 1등 구글 스프레드시트 기반 업무 자동화 솔루션 'SheetBot (시트봇)'의 FDE(Forward Deployed Engineer) 파트너 선발 총괄 매니저입니다.
아래 접수된 [FDE 1기 파트너 지원서]를 검토하고, 지원자에게 보낼 따뜻하고 전문적인 1차 서류 검토 합격 및 온보딩 커피챗 안내 메일 본문 초안을 작성해 주세요.

[지원자 정보]
- 성명: ${contactName || "지원자님"}
- 이메일: ${userEmail || "미기재"}
- 연락처: ${phone || "미기재"}
- 지원서 내용:
${content || title}

[작성 지침]
1. 인사말: 지원해 주신 열정과 탁월한 역량에 진심 어린 감사를 표하세요.
2. 역량 피드백:
   - 지원서에 기재된 스프레드시트/코딩 숙련도, 자기소개 및 포부 내용을 면밀히 확인하고 긍정적으로 화답하세요. (특히 "이 시스템을 개발한 사람입니다" 또는 깊은 개발 배경이 있는 경우, 시트봇의 핵심 시스템 아키텍처를 가장 잘 이해하고 계신 최고 수준의 파트너로서 특별한 환영과 경의를 표현하세요.)
   - 시트봇 고객들의 다양한 맞춤 자동화 프로젝트(건당 30만~200만원 수익 쉐어)를 함께 수행할 핵심 리드 파트너로서 기대가 큼을 전달하세요.
3. 다음 절차 안내: 1차 서류 검토가 긍정적으로 완료되었으며, 15~20분 내외의 가벼운 비대면 1:1 온보딩 커피챗을 통해 파트너 계약 및 프로젝트 배정 절차를 안내해 드리고자 함을 안내하세요. 편하신 일정(날짜/시간대)을 회신해 달라고 요청하세요.
4. 어조 및 서식 주의:
   - 매우 정중하면서도 파트너로서 동료애와 신뢰를 주는 따뜻한 톤.
   - [절대 주의] 이메일 제목(예: "**제목: ...**")이나 마크다운 메타데이터 헤더를 절대 출력하지 말고, 곧바로 인사말 본문부터 시작하세요.
`.trim();
  } else {
    prompt = `
당신은 구글 스프레드시트 기반 업무 자동화 솔루션 'SheetBot (시트봇)'의 고객 성공 매니저(CSM)입니다.
아래 접수된 고객의 문의 사항을 분석하고, 친절하고 정확한 고객 1:1 답변 초안을 작성해 주세요.

[고객 문의 정보]
- 작성자: ${contactName || "고객님"} (${userEmail || "미기재"})
- 문의 제목: ${title}
- 문의 내용:
${content}

[작성 지침]
1. 고객님의 문의에 감사드리며, 겪고 계신 불편이나 궁금증에 깊이 공감하는 인사말로 시작하세요.
2. 문의 내용을 분석하여 명확하고 실행 가능한 해결 방안(예: 구글 계정 권한 재인증, 시트 상단 메뉴 재실행, 트리거 설정 등)을 단계별로 안내하세요.
3. 추가 문의 사항이 있으실 경우 언제든 편하게 다시 문의해 달라는 따뜻한 맺음말을 작성하세요.
4. 어조 및 서식 주의:
   - 친절하고 신뢰감 넘치는 정중한 경어체.
   - [절대 주의] 이메일 제목(예: "**제목: ...**")을 출력하지 말고 본문 첫머리부터 작성하세요.
`.trim();
  }

  try {
    const res = await callAiCaller(prompt, {
      model: "gemini-2.5-flash",
      temperature: 0.3,
    });

    let aiDraftText = (res.text || res.content || "").trim();
    if (aiDraftText && aiDraftText.length > 20) {
      // 혹시 모델이 앞단에 제목 라인을 출력했을 경우 깔끔하게 정제
      aiDraftText = cleanDraftText(aiDraftText);
      return aiDraftText;
    }
    return getFallbackDraft(input);
  } catch (err: any) {
    console.warn("[AI Draft Helper] callAiCaller error, using fallback draft:", err.message);
    return getFallbackDraft(input);
  }
}

/**
 * AI 생성 텍스트에서 불필요한 제목 태그나 헤더 정제
 */
function cleanDraftText(text: string): string {
  let cleaned = text.trim();
  // **제목: ...** 또는 제목: ... 형태 제거
  cleaned = cleaned.replace(/^\*\*제목\s*:\s*[^\n]+\*\*\s*\n*/i, "");
  cleaned = cleaned.replace(/^제목\s*:\s*[^\n]+\n*/i, "");
  cleaned = cleaned.replace(/^\[제목\]\s*[^\n]+\n*/i, "");
  return cleaned.trim();
}

/**
 * AI Caller 실패 시 또는 오프라인 환경을 위한 고품질 표준 폴백 초안
 */
function getFallbackDraft(input: InquiryDraftInput): string {
  const { type, companyName = "고객사", contactName = "담당자님", phone = "", targetAreas = "", useVoucher = "" } = input;

  if (type === "ENTERPRISE") {
    return `${companyName} ${contactName} 담당자님, 안녕하세요.
구글 스프레드시트 기반 경량 ERP & 맞춤 자동화 전문 솔루션 SheetBot(시트봇) AX 컨설팅 팀입니다.

신청해 주신 [무료 엑셀 AX 진단 및 맞춤 견적] 접수 내역을 확인하였습니다.
희망하신 자동화 영역(${targetAreas || "업무 프로세스 자동화"})은 시트봇의 네이티브 연동 엔진을 통해 기존 엑셀/구글 시트 장부를 그대로 활용하면서 단기간 내 안정적으로 구축 가능합니다.

${useVoucher === "YES" ? "아울러 희망하신 정부지원사업(비대면 바우처 등)을 연계하여 구축 비용을 최대 70~80%까지 절감받으실 수 있는 매칭 방안도 함께 검토하고 있습니다.\n" : ""}
보내주신 기업 정보와 요구사항을 토대로 작성된 [1차 맞춤 AX 진단 리포트]를 준비하여 기재해 주신 연락처(${phone || "유선"})로 24시간 이내에 직접 유선 상담을 드리겠습니다.

편하신 통화 가능 시간대나 추가 요구사항이 있으시면 언제든 편하게 회신해 주시기 바랍니다.

감사합니다.
SheetBot 엔터프라이즈 AX 팀 드림`.trim();
  }

  if (type === "FDE_APPLICATION") {
    return `${contactName} 파트너님, 안녕하세요.
SheetBot FDE 파트너 선발 총괄팀입니다.

우선 SheetBot 1기 FDE(Forward Deployed Engineer) 파트너에 관심을 갖고 소중한 지원서를 접수해 주셔서 진심으로 감사드립니다.

지원자님께서 작성해 주신 스프레드시트 및 업무 자동화 관련 역량과 경험을 긍정적으로 검토하였습니다. SheetBot 고객들의 다양한 현장 자동화 프로젝트를 함께 리드하실 수 있는 훌륭한 파트너로서 기대가 큽니다.

다음 단계로 15~20분 내외의 가벼운 비대면 1:1 온보딩 미팅을 통해 파트너 운영 방식과 프로젝트 배정 절차를 안내해 드리고자 합니다.

이번 주 중 편하신 날짜와 시간대 2~3곳을 회신해 주시면 온보딩 미팅 링크를 전달해 드리겠습니다.

감사합니다.
SheetBot FDE 선발팀 드림`.trim();
  }

  return `${contactName} 고객님, 안녕하세요.
SheetBot 고객지원팀입니다.

보내주신 문의 사항을 꼼꼼히 확인하였습니다. 고객님께서 겪고 계신 불편을 신속히 해결해 드릴 수 있도록 최적의 해결 방안을 검토 중에 있습니다.

해당 내용에 대해 확인된 상세 해결 절차와 가이드를 정리하여 추가 안내를 드릴 예정이며, 혹시 추가로 확인이 필요한 스크린샷이나 시트 환경이 있으시다면 언제든 편하게 회신해 주시기 바랍니다.

고객님의 편리하고 쾌적한 업무 자동화를 위해 최선을 다하겠습니다.

감사합니다.
SheetBot 고객지원팀 드림`.trim();
}

/**
 * DB에 AI 초안 저장
 */
export async function saveAiDraftToDb(
  table: "sheetbot_enterprise_inquiries" | "sheetbot_inquiries",
  id: string,
  aiDraft: string
): Promise<void> {
  const now = new Date().toISOString();
  await updateRows(table, {
    filters: { id },
    updates: {
      ai_draft: aiDraft,
      updated_at: now,
      updated_by: "AI_DRAFT_SYSTEM",
    },
  });
}

/**
 * 비동기 백그라운드 AI 초안 생성 및 DB 저장 (실행 지연 없음)
 */
export function generateAndSaveAiDraftAsync(
  table: "sheetbot_enterprise_inquiries" | "sheetbot_inquiries",
  id: string,
  input: InquiryDraftInput
): void {
  (async () => {
    try {
      const draft = await generateInquiryAiDraft(input);
      if (draft) {
        await saveAiDraftToDb(table, id, draft);
        console.log(`[AI Draft] Successfully generated and saved draft for ${table}:${id}`);
      }
    } catch (err: any) {
      console.warn(`[AI Draft] Background generation failed for ${table}:${id}:`, err.message);
    }
  })();
}
