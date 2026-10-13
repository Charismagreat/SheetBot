/**
 * When true, new wraps push `SheetBotClient.gs` instead of `EgdeskConfig.gs`.
 * Opt-out legacy tunnel: `SHEETBOT_LEGACY_EGDESK_TUNNEL=1`.
 * Opt-in default for new deploys: `SHEETBOT_RUNTIME_DEPLOY_DEFAULT=1` (without forcing USE_SHEETBOT_RUNTIME).
 */
export function shouldDeploySheetbotRuntimeClient(): boolean {
  if (process.env.SHEETBOT_LEGACY_EGDESK_TUNNEL === "1") return false;
  if (process.env.USE_SHEETBOT_RUNTIME === "true" || process.env.SHEETBOT_RUNTIME_DEPLOY === "1") {
    return true;
  }
  return process.env.SHEETBOT_RUNTIME_DEPLOY_DEFAULT === "1";
}

export function defaultSheetbotPublicApiBase(): string {
  const raw =
    process.env.SHEETBOT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_EGDESK_VISITOR_ORIGIN ||
    "https://sheetbot.cloud";
  return String(raw).replace(/\/$/, "");
}
