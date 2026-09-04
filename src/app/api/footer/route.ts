export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { queryTable } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { DEFAULT_FOOTER, FooterInfo } from "@/lib/default-footer";

export async function GET() {
  try {
    await setupDatabase();

    const res = await queryTable("sheetbot_settings", {
      filters: { key: "sheetbot_footer_info" },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    const validRows = (res.rows || []).filter((r: any) => !r.deleted_at);

    if (validRows.length > 0 && validRows[0].value) {
      try {
        const parsed: FooterInfo = JSON.parse(validRows[0].value);
        return NextResponse.json({ success: true, footer: { ...DEFAULT_FOOTER, ...parsed } });
      } catch (e) {
        console.warn("Failed to parse footer settings JSON, returning default", e);
      }
    }

    return NextResponse.json({ success: true, footer: DEFAULT_FOOTER });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, footer: DEFAULT_FOOTER }, { status: 500 });
  }
}
