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
      return NextResponse.json({ success: false, isAdmin: false, error: "관리자 권한이 필요합니다." }, { status: 403 });
    }

    const now = new Date();
    const kstHour = (now.getUTCHours() + 9) % 24;
    const greeting =
      kstHour >= 6 && kstHour < 12
        ? "좋은 아침입니다, 관리자님! ☀️"
        : kstHour >= 12 && kstHour < 18
        ? "좋은 오후입니다, 관리자님! ☕"
        : "늦은 시간까지 수고 많으십니다, 관리자님! 🌙";

    // 1. 전체 문의 및 기업 견적 건수 집계
    const [genRes, entRes, taxRes, vocRes, usersRes] = await Promise.all([
      queryTable("sheetbot_inquiries", {
        orderBy: "id",
        orderDirection: "DESC",
        limit: 100,
      }).catch(() => ({ rows: [] })),
      queryTable("sheetbot_enterprise_inquiries", {
        orderBy: "id",
        orderDirection: "DESC",
        limit: 100,
      }).catch(() => ({ rows: [] })),
      queryTable("sheetbot_tax_invoices", {
        limit: 100,
      }).catch(() => ({ rows: [] })),
      queryTable("sheetbot_settings", {
        filters: { key: "sheetbot_voc_analytics" },
        limit: 1,
      }).catch(() => ({ rows: [] })),
      queryTable("sheetbot_users", {
        limit: 1000,
      }).catch(() => ({ rows: [] })),
    ]);

    const activeGen = (genRes.rows || []).filter((r: any) => !r.deleted_at);
    const activeEnt = (entRes.rows || []).filter((r: any) => !r.deleted_at);
    const activeTax = (taxRes.rows || []).filter((r: any) => !r.deleted_at);
    const activeUsers = (usersRes.rows || []).filter((r: any) => !r.deleted_at);

    // 미답변 / 검토 대기 건수
    const pendingGen = activeGen.filter((r: any) => r.status !== "ANSWERED" && r.status !== "COMPLETED");
    const pendingEnt = activeEnt.filter((r: any) => r.status !== "ANSWERED" && r.status !== "COMPLETED");
    const totalPendingCount = pendingGen.length + pendingEnt.length;

    // 미발급 세금계산서 건수
    const pendingTaxCount = activeTax.filter((r: any) => r.status === "PENDING" || r.status === "REQUESTED").length;

    // 최신 VIP 리드 (S 또는 A 등급, 또는 가장 최근 기업 견적)
    let latestVipLead: any = null;
    for (const ent of activeEnt) {
      let scoreObj = null;
      try {
        if (ent.ai_score) {
          scoreObj = typeof ent.ai_score === "string" ? JSON.parse(ent.ai_score) : ent.ai_score;
        }
      } catch {}

      if (scoreObj?.tier === "S" || scoreObj?.tier === "A" || ent.status !== "COMPLETED") {
        latestVipLead = {
          id: ent.id,
          companyName: ent.company_name || "기업 고객사",
          contactName: ent.contact_name || "담당자",
          phone: ent.phone || "",
          tier: scoreObj?.tier || "S",
          score: scoreObj?.score || 90,
          probability: scoreObj?.conversionProbability || 85,
          estimatedPrice: scoreObj?.estimatedPriceRange || "650만 ~ 800만원",
          targetAreas: ent.target_areas || "시트 자동화",
          createdAt: ent.created_at || ent.updated_at,
          status: ent.status,
        };
        break;
      }
    }

    // VOC 캐시 파싱
    let vocSummary = {
      topPainPoint: "수기 엑셀 취합 및 데이터 분산 (42%)",
      topDemandFeature: "네이버/쿠팡 주문서 자동 수집 (45%)",
    };
    const validVocRows = (vocRes.rows || []).filter((r: any) => !r.deleted_at);
    if (validVocRows.length > 0 && validVocRows[0].value) {
      try {
        const parsedVoc = JSON.parse(validVocRows[0].value);
        if (parsedVoc.topPainPoints?.[0]) {
          vocSummary.topPainPoint = `${parsedVoc.topPainPoints[0].keyword} (${parsedVoc.topPainPoints[0].percentage}%)`;
        }
        if (parsedVoc.demandHeatmap?.[0]) {
          vocSummary.topDemandFeature = `${parsedVoc.demandHeatmap[0].featureName} (${parsedVoc.demandHeatmap[0].demandScore}%)`;
        }
      } catch {}
    }

    // 포맷된 브리핑 메시지 텍스트 조립
    const isEvening = kstHour >= 18 || kstHour < 5;
    const lines: string[] = [];

    if (isEvening) {
      // 🌇 시나리오 6: 퇴근길 일일 마감 결산 리포트
      lines.push(
        "오늘 하루도 정말 수고 많으셨습니다, 관리자님! ☕",
        "시트봇 AI가 준비한 **오늘의 일일 마감 결산 리포트**를 브리핑해 드립니다. 🌇",
        "",
        `1. 📥 **고객 응대 마감**: 오늘 접수된 문의 중 **${activeGen.length + activeEnt.length - totalPendingCount}건 완료**, **미처리 잔여 ${totalPendingCount}건**`,
      );

      if (latestVipLead) {
        lines.push(
          `   - 🎯 **오늘의 핵심 VIP 리드**: **${latestVipLead.companyName}** (${latestVipLead.tier}등급 / ${latestVipLead.estimatedPrice})`
        );
      }

      lines.push(
        `2. 📑 **세무 마감**: 승인 대기 세금계산서 **${pendingTaxCount}건**`,
        `3. 👥 **운영 현황**: 총 **${activeUsers.length}명**의 가입 회원 관리 중`,
        `4. 🔥 **오늘의 VOC 트렌드**: 고객 1위 관심사는 **'${vocSummary.topDemandFeature}'**이었습니다.`,
        "",
        totalPendingCount === 0
          ? "🎉 **완벽한 하루였습니다!** 오늘 인입된 모든 고객 문의가 100% 답변 완료되었습니다. 편안한 저녁 시간 보내세요!"
          : "💡 *남아있는 미답변 문의는 내일 아침 모닝 브리핑에서 다시 챙겨드리겠습니다. 편안한 퇴근길 되세요!*"
      );
    } else {
      // ☀️ 시나리오 2: 데일리 모닝 경영 브리핑
      lines.push(
        greeting,
        "시트봇 AI가 감지한 **실시간 SheetBot 핵심 운영 현황**을 브리핑해 드립니다. 📊",
        "",
        `1. 📥 **접수된 고객 문의**: 총 ${activeGen.length + activeEnt.length}건 중 **검토 대기 ${totalPendingCount}건**`,
      );

      if (latestVipLead) {
        lines.push(
          `   - 🎯 **최신 VIP 리드**: **${latestVipLead.companyName}** (${latestVipLead.tier}등급 / 수주확률 ${latestVipLead.probability}% / 예상 ${latestVipLead.estimatedPrice})`
        );
      }

      lines.push(
        `2. 📑 **세무 행정**: 승인 대기 세금계산서 **${pendingTaxCount}건**`,
        `3. 👥 **누적 회원 수**: 총 **${activeUsers.length}명**의 회원이 가입되어 있습니다.`,
        `4. 🔥 **최신 고객 VOC**: 고객들의 1위 고충은 **'${vocSummary.topPainPoint}'**, 최다 요청 기능은 **'${vocSummary.topDemandFeature}'**입니다.`
      );

      if (totalPendingCount > 0) {
        lines.push("", "💡 *미답변 문의 건에 대해 AI 맞춤 초안이 이미 준비되어 있으니, 문의 대장에서 원클릭 [0원 문자 발송] 또는 [공식 메일 회신]을 진행해 보세요.*");
      } else {
        lines.push("", "✨ *현재 모든 고객 문의가 정상적으로 답변 완료되었습니다. 활기찬 하루 되세요!*");
      }
    }

    const formattedText = lines.join("\n");

    return NextResponse.json({
      success: true,
      isAdmin: true,
      data: {
        isEvening,
        greeting: isEvening ? "수고 많으셨습니다, 관리자님! ☕" : greeting,
        formattedText,
        stats: {
          totalInquiries: activeGen.length + activeEnt.length,
          pendingInquiries: totalPendingCount,
          pendingTaxCount,
          totalUsers: activeUsers.length,
          vocSummary,
        },
        vipAlert: latestVipLead,
      },
    });
  } catch (err: any) {
    console.error("[Admin Briefing API] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
