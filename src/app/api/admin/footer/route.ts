export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable, insertRows, updateRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { DEFAULT_FOOTER, FooterInfo } from "@/lib/default-footer";

export async function GET(req: NextRequest) {
  try {
    await setupDatabase();
    const adminEmail = await getCurrentUserEmail();
    if (!adminEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

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
        console.warn("Footer parse error:", e);
      }
    }

    return NextResponse.json({ success: true, footer: DEFAULT_FOOTER });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const adminEmail = await getCurrentUserEmail();
    if (!adminEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const footerData: FooterInfo = {
      company_name: body.company_name?.trim() || DEFAULT_FOOTER.company_name,
      ceo_name: body.ceo_name?.trim() || DEFAULT_FOOTER.ceo_name,
      biz_number: body.biz_number?.trim() || DEFAULT_FOOTER.biz_number,
      mail_order_biz_number: body.mail_order_biz_number?.trim() || DEFAULT_FOOTER.mail_order_biz_number,
      address: body.address?.trim() || DEFAULT_FOOTER.address,
      privacy_manager: body.privacy_manager?.trim() || DEFAULT_FOOTER.privacy_manager,
      hosting_provider: body.hosting_provider?.trim() || DEFAULT_FOOTER.hosting_provider,
      cs_email: body.cs_email?.trim() || DEFAULT_FOOTER.cs_email,
      cs_phone: body.cs_phone?.trim() || DEFAULT_FOOTER.cs_phone,
      easybot_info: body.easybot_info?.trim() || DEFAULT_FOOTER.easybot_info,
      brand_description: body.brand_description?.trim() || DEFAULT_FOOTER.brand_description,
      copyright_text: body.copyright_text?.trim() || DEFAULT_FOOTER.copyright_text,
    };

    const now = new Date().toISOString();
    const valString = JSON.stringify(footerData);

    const existRes = await queryTable("sheetbot_settings", {
      filters: { key: "sheetbot_footer_info" },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    if (existRes.rows && existRes.rows.length > 0) {
      await updateRows("sheetbot_settings", {
        filters: { key: "sheetbot_footer_info" },
        updates: {
          value: valString,
          description: "푸터 회사 정보 및 고객센터 설정",
          updated_at: now,
          updated_by: adminEmail,
        },
      });
    } else {
      await insertRows("sheetbot_settings", [
        {
          id: `set_footer_${Date.now()}`,
          key: "sheetbot_footer_info",
          value: valString,
          description: "푸터 회사 정보 및 고객센터 설정",
          created_at: now,
          updated_at: now,
          updated_by: adminEmail,
          deleted_at: null,
        },
      ]);
    }

    return NextResponse.json({
      success: true,
      message: "푸터 회사 정보 및 고객센터 설정이 성공적으로 저장되었습니다.",
      footer: footerData,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
