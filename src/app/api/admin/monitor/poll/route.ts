export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail, isCurrentUserAdmin } from "@/lib/auth";
import { queryTable } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

export async function GET(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();
    const isAdmin = await isCurrentUserAdmin(userEmail);

    if (!userEmail || !isAdmin) {
      return NextResponse.json({ success: false, isAdmin: false }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const lastKnownEntId = Number(searchParams.get("lastKnownEntId") || searchParams.get("lastKnownId") || 0);
    const lastKnownTaxId = Number(searchParams.get("lastKnownTaxId") || 0);
    const suppressSla = searchParams.get("suppressSla") === "1";
    const suppressDevice = searchParams.get("suppressDevice") === "1";

    // 병렬로 최신 현황 조회 (기업 견적, 세금계산서, 일반 문의, 기기 상태)
    const [entRes, taxRes, genRes, devRes] = await Promise.all([
      queryTable("sheetbot_enterprise_inquiries", {
        orderBy: "id",
        orderDirection: "DESC",
        limit: 10,
      }).catch(() => ({ rows: [] })),
      queryTable("sheetbot_tax_invoices", {
        orderBy: "id",
        orderDirection: "DESC",
        limit: 10,
      }).catch(() => ({ rows: [] })),
      queryTable("sheetbot_inquiries", {
        orderBy: "id",
        orderDirection: "DESC",
        limit: 20,
      }).catch(() => ({ rows: [] })),
      queryTable("sheetbot_user_devices", {
        limit: 10,
      }).catch(() => ({ rows: [] })),
    ]);

    const validEnt = (entRes.rows || []).filter((r: any) => !r.deleted_at);
    const validTax = (taxRes.rows || []).filter((r: any) => !r.deleted_at);
    const validGen = (genRes.rows || []).filter((r: any) => !r.deleted_at);
    const validDev = (devRes.rows || []).filter((r: any) => !r.deleted_at);

    const latestEnt = validEnt[0];
    const latestEntId = latestEnt ? Number(latestEnt.id) || 0 : 0;

    const latestTax = validTax[0];
    const latestTaxId = latestTax ? Number(latestTax.id) || 0 : 0;

    // ----------------------------------------------------
    // [시나리오 1] VIP 고액 리드 인입 감시 (최우선 순위)
    // ----------------------------------------------------
    if (lastKnownEntId > 0 && latestEntId > lastKnownEntId && latestEnt) {
      let scoreObj: any = null;
      try {
        if (latestEnt.ai_score) {
          scoreObj = typeof latestEnt.ai_score === "string" ? JSON.parse(latestEnt.ai_score) : latestEnt.ai_score;
        }
      } catch {}

      const companyName = latestEnt.company_name || "신규 고객사";
      const tier = scoreObj?.tier || "S";
      const probability = scoreObj?.conversionProbability || 85;
      const estimatedPrice = scoreObj?.estimatedPriceRange || "650만 ~ 800만원";

      const alertMessage = `🚨 **[VIP 긴급 알림]** 방금 **'${companyName}'**에서 **${estimatedPrice}** 규모의 기업 맞춤 구축 견적이 접수되었습니다!\n\n- 🎯 **판정**: ${tier}등급 (수주 확률 ${probability}%)\n- 🛠️ **구축 범위**: ${latestEnt.target_areas || "시트 자동화 및 API 연동"}\n\nAI 맞춤 제안서와 회신 초안이 이미 준비되어 있습니다. 지금 바로 문의 대장에서 검토하시겠습니까?`;

      return NextResponse.json({
        success: true,
        hasNewAlert: true,
        alertType: "VIP_LEAD",
        maxEntId: latestEntId,
        maxTaxId: latestTaxId,
        alert: {
          id: `vip_${latestEnt.id}`,
          title: "VIP 견적 접수",
          companyName,
          tier,
          probability,
          estimatedPrice,
          message: alertMessage,
          chips: [
            { label: "📑 VIP 견적서/제안서 확인", url: "/dashboard/admin?tab=inquiries", highlight: true },
            { label: "📲 0원 문자 즉시 회신", url: "/dashboard/admin?tab=sms" },
          ],
        },
      });
    }

    // ----------------------------------------------------
    // [시나리오 5] 전자세금계산서 신규 신청 감지 (우선순위 2)
    // ----------------------------------------------------
    if (lastKnownTaxId > 0 && latestTaxId > lastKnownTaxId && latestTax) {
      if (latestTax.status === "REQUESTED" || latestTax.status === "PENDING" || !latestTax.status) {
        const company = latestTax.company_name || latestTax.user_email || "신청 고객";
        const amount = Number(latestTax.amount_krw || 0).toLocaleString();
        const bizNum = latestTax.biz_number || "미기재";

        const taxMessage = `📑 **[전자세금계산서 신청]** **'${company}'** 님으로부터 **${amount}원** 세금계산서 발행 요청이 접수되었습니다.\n\n- 🏢 **사업자번호**: ${bizNum}\n- 📧 **담당자 이메일**: ${latestTax.manager_email || latestTax.user_email}\n\n홈택스 전송 전 신청 내역을 검토하고 승인해 주세요.`;

        return NextResponse.json({
          success: true,
          hasNewAlert: true,
          alertType: "TAX_INVOICE",
          maxEntId: latestEntId,
          maxTaxId: latestTaxId,
          alert: {
            id: `tax_${latestTax.id}`,
            title: "세금계산서 신청",
            message: taxMessage,
            chips: [
              { label: "📑 세금계산서 승인 검토", url: "/dashboard/admin?tab=tax_invoices", highlight: true },
              { label: "🏛️ 홈택스 연동 확인", url: "/dashboard/admin?tab=tax_invoices" },
            ],
          },
        });
      }
    }

    // ----------------------------------------------------
    // [시나리오 3] 24시간 방치 방지 SLA 골든타임 경보 (우선순위 3)
    // ----------------------------------------------------
    if (!suppressSla) {
      const nowMs = Date.now();
      const allPending = [
        ...validEnt.filter((r: any) => r.status !== "ANSWERED" && r.status !== "COMPLETED").map((r: any) => ({ ...r, _type: "enterprise" })),
        ...validGen.filter((r: any) => r.status !== "ANSWERED" && r.status !== "COMPLETED").map((r: any) => ({ ...r, _type: "general" })),
      ];

      // 가장 오래된 미답변 건 찾기
      let oldestPending: any = null;
      let oldestElapsedHours = 0;

      for (const p of allPending) {
        const timeStr = p.created_at || p.updated_at;
        if (!timeStr) continue;
        const createdMs = new Date(timeStr).getTime();
        if (isNaN(createdMs)) continue;
        const diffHours = (nowMs - createdMs) / (1000 * 60 * 60);

        // 20시간 이상 경과한 경우 SLA 골든타임 임박 판정
        if (diffHours >= 20 && diffHours > oldestElapsedHours) {
          oldestPending = p;
          oldestElapsedHours = Math.floor(diffHours);
        }
      }

      if (oldestPending) {
        const name = oldestPending.company_name || oldestPending.user_name || oldestPending.user_email || "고객";
        const contentPreview = (oldestPending.target_areas || oldestPending.message || oldestPending.content || "문의 상세").slice(0, 40);

        const slaMessage = `⏰ **[SLA 골든타임 경보]** 접수된 지 **${oldestElapsedHours}시간**이 경과한 미답변 고객 문의가 있습니다!\n\n- 👤 **고객/사명**: ${name}\n- 📌 **문의 내용**: "${contentPreview}..."\n\n고객 만족도 및 수주율 유지를 위해 24시간 이내 회신을 권장합니다. 지금 바로 답변 초안을 확인하시겠습니까?`;

        return NextResponse.json({
          success: true,
          hasNewAlert: true,
          alertType: "SLA_WARNING",
          maxEntId: latestEntId,
          maxTaxId: latestTaxId,
          alert: {
            id: `sla_${oldestPending.id}_${oldestElapsedHours}`,
            title: "SLA 골든타임 경보",
            message: slaMessage,
            chips: [
              { label: "⚡ 골든타임 미답변 문의 확인", url: "/dashboard/admin?tab=inquiries", highlight: true },
              { label: "🤖 AI 자동 초안 검토", url: "/dashboard/admin?tab=inquiries" },
            ],
          },
        });
      }
    }

    // ----------------------------------------------------
    // [시나리오 4] 0원 문자 스마트폰 연결 이상 감지 (우선순위 4)
    // ----------------------------------------------------
    if (!suppressDevice && validDev.length > 0) {
      // 관리자 본인의 등록 기기 또는 전체 등록 기기 확인
      const disconnectedDev = validDev.find((d: any) => d.status === "DISCONNECTED" || d.status === "OFFLINE");

      if (disconnectedDev) {
        const devLabel = disconnectedDev.label || disconnectedDev.phone_number || "스마트폰 기기";
        const devMessage = `⚠️ **[0원 문자 기기 경보]** 연동된 스마트폰(**${devLabel}**)이 오프라인 상태이거나 통신이 중단되었습니다.\n\n현재 상태에서는 고객 문의에 대한 자동 문자(SMS) 전송이 지연될 수 있습니다. 스마트폰의 구글 메시지 앱 연결 상태를 확인해 주세요.`;

        return NextResponse.json({
          success: true,
          hasNewAlert: true,
          alertType: "DEVICE_OFFLINE",
          maxEntId: latestEntId,
          maxTaxId: latestTaxId,
          alert: {
            id: `dev_${disconnectedDev.id}`,
            title: "SMS 기기 오프라인",
            message: devMessage,
            chips: [
              { label: "📱 기기 연결 관리 바로가기", url: "/dashboard/user/phone", highlight: true },
              { label: "🔄 연결 상태 점검", url: "/dashboard/user/phone" },
            ],
          },
        });
      }
    }

    // 신규 경보 없음 - 기준 ID 갱신
    return NextResponse.json({
      success: true,
      hasNewAlert: false,
      maxEntId: latestEntId,
      maxTaxId: latestTaxId,
    });
  } catch (err: any) {
    console.error("[Admin Monitor Poll API] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
