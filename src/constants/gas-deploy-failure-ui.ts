import type { GasDeployFailureKind } from "@/lib/gas-deploy-errors";

export type GasDeployFailureUi = {
  title: string;
  hint: string;
  tone: "rose" | "amber" | "sky";
};

export function gasDeployFailureUi(kind: GasDeployFailureKind | null | undefined): GasDeployFailureUi {
  switch (kind) {
    case "ai_syntax":
      return {
        title: "AI 생성 코드 문법 오류",
        hint: "Google Apps Script가 Code.gs를 거부했습니다. 2단계에서 요구사항을 조율하거나 코드 미리보기를 확인한 뒤 다시 생성해 주세요.",
        tone: "amber",
      };
    case "quota":
      return {
        title: "Google API 호출 한도",
        hint: "1~2분 후 한 번만 다시 시도해 주세요.",
        tone: "amber",
      };
    case "auth":
      return {
        title: "Google Workspace 권한",
        hint: "스프레드시트·Apps Script 권한 승인이 필요할 수 있습니다.",
        tone: "sky",
      };
    case "infra":
      return {
        title: "EGDesk / 배포 연결 오류",
        hint: "EGDesk 실행, 터널 연결, Apps Script MCP 활성화를 확인해 주세요.",
        tone: "rose",
      };
    default:
      return {
        title: "배포 실패",
        hint: "아래 상세 메시지를 확인해 주세요.",
        tone: "rose",
      };
  }
}
