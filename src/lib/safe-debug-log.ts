import fs from "fs";
import os from "os";
import path from "path";

/**
 * Append debug lines without throwing (hosted cwd may be read-only).
 * Override directory with SHEETBOT_DEBUG_LOG_DIR.
 */
export function appendSheetbotDebugLog(logFileName: string, message: string): void {
  try {
    const safeName = path.basename(logFileName || "debug.log");
    const dir =
      process.env.SHEETBOT_DEBUG_LOG_DIR?.trim() ||
      path.join(os.tmpdir(), "sheetbot-debug");
    if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) {
      fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
    }
    const line = message.endsWith("\n") ? message : `${message}\n`;
    fs.appendFileSync(/*turbopackIgnore: true*/ path.join(dir, safeName), line, { flag: "a" });
  } catch {
    // never throw from debug logging
  }
}
