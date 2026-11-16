export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

export interface AiShortsMetaItem {
  id: string;
  modelName: string;
  modelVoice: string;
  topic: string;
  shortTitle: string;
  script: string;
  productImageUrl?: string;
  sheetUrl?: string;
  driveFolderUrl?: string;
  createdAt: string;
}

const META_STORE_PATH = path.join(os.homedir(), ".egdesk", "sheetbot-ai-shorts-meta.json");

function loadMetaStore(): Record<string, AiShortsMetaItem> {
  try {
    if (fs.existsSync(META_STORE_PATH)) {
      return JSON.parse(fs.readFileSync(META_STORE_PATH, "utf8")) || {};
    }
  } catch {}
  return {};
}

export function saveAiShortsMeta(item: AiShortsMetaItem): void {
  try {
    const store = loadMetaStore();
    store[item.id] = item;
    const dir = path.dirname(META_STORE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(META_STORE_PATH, JSON.stringify(store, null, 2), "utf8");
  } catch (e: any) {
    console.warn("[AiShortsMeta] Save warning:", e.message);
  }
}

export function getAiShortsMeta(id: string): AiShortsMetaItem | null {
  const store = loadMetaStore();
  return store[id] || null;
}

/**
 * GET /api/user/ai-model/video-meta?id=aimodel_...
 */
export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") || "").trim();
  if (!id) {
    return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
  }
  const item = getAiShortsMeta(id);
  if (!item) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: item });
}
