export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable, updateRows } from "@/lib/egdesk-helpers";
import { getKoreanTimeString } from "@/lib/date-utils";
import {
  generateCounterpartyVerificationKit,
  inferContactLabelsFromMetadata,
  ingestContactSignal,
  normalizeContactKey,
  recomputeContactProfile,
  submitVerificationSelfCheck,
  syncRelationshipLedgerToSheet,
} from "@/lib/relationship-intelligence";

async function resolveAuthenticatedEmail(req: NextRequest, bodyEmail?: string): Promise<string | null> {
  const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
  if (sessionEmail) return sessionEmail.toLowerCase().trim();
  const headerEmail = req.headers.get("x-sheetbot-user-email");
  if (headerEmail) return headerEmail.toLowerCase().trim();
  if (bodyEmail) return bodyEmail.toLowerCase().trim();
  return null;
}

/**
 * GET /api/user/relationship
 * - 본인(user_email 격리)의 상대방 관계 프로필 목록 및 검증 체크리스트 조회
 * - ?contactKey=... 지정 시 해당 상대방의 상세 시그널 + 검증 체크리스트 함께 반환
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userEmail = await resolveAuthenticatedEmail(
      req,
      searchParams.get("userEmail") || undefined
    );
    if (!userEmail) {
      return NextResponse.json(
        { success: false, error: "인증된 사용자 이메일이 필요합니다." },
        { status: 401 }
      );
    }

    const contactKeyParam = searchParams.get("contactKey");
    if (contactKeyParam) {
      const contactKey = normalizeContactKey(contactKeyParam);
      const [profileRes, signalsRes, verificationsRes] = await Promise.all([
        queryTable("sheetbot_contact_profiles", {
          filters: { user_email: userEmail, contact_key: contactKey },
          orderBy: "id",
          orderDirection: "DESC",
          limit: 1,
        }).catch(() => ({ rows: [] })),
        queryTable("sheetbot_contact_signals", {
          filters: { user_email: userEmail, contact_key: contactKey },
          orderBy: "id",
          orderDirection: "DESC",
          limit: 30,
        }).catch(() => ({ rows: [] })),
        queryTable("sheetbot_contact_verifications", {
          filters: { user_email: userEmail, contact_key: contactKey },
          orderBy: "id",
          orderDirection: "DESC",
          limit: 10,
        }).catch(() => ({ rows: [] })),
      ]);

      return NextResponse.json({
        success: true,
        profile: (profileRes.rows || []).find((r: any) => !r.deleted_at) || null,
        signals: (signalsRes.rows || []).filter((r: any) => !r.deleted_at),
        verifications: (verificationsRes.rows || []).filter((r: any) => !r.deleted_at),
      });
    }

    const [profilesRes, pendingVerificationsRes] = await Promise.all([
      queryTable("sheetbot_contact_profiles", {
        filters: { user_email: userEmail },
        orderBy: "id",
        orderDirection: "DESC",
        limit: 100,
      }).catch(() => ({ rows: [] })),
      queryTable("sheetbot_contact_verifications", {
        filters: { user_email: userEmail, status: "PENDING" },
        orderBy: "id",
        orderDirection: "DESC",
        limit: 30,
      }).catch(() => ({ rows: [] })),
    ]);

    return NextResponse.json({
      success: true,
      profiles: (profilesRes.rows || []).filter((r: any) => !r.deleted_at),
      pendingVerifications: (pendingVerificationsRes.rows || []).filter(
        (r: any) => !r.deleted_at
      ),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "관계 인텔리전스 조회 실패" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user/relationship
 * action:
 *  1) "ingest_signal"         : 시그널 이벤트 적재 + 프로필 자동 재계산
 *  2) "generate_verification" : AI 상대방 의심 포인트 포착 + 맞춤 체크리스트·테스트 질문·자가 평가 질의 생성
 *  3) "submit_self_check"     : 이용자 자가 체크 응답 제출 + 동적 재평가(Re-Scoring)
 *  4) "lock_labels"           : 사용자 수동 관계 태그 확정·잠금(Override Lock)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userEmail = await resolveAuthenticatedEmail(req, body?.userEmail);
    if (!userEmail) {
      return NextResponse.json(
        { success: false, error: "인증된 사용자 이메일이 필요합니다." },
        { status: 401 }
      );
    }

    const action = String(body?.action || "");

    if (action === "ingest_signal") {
      if (!body.contactName) {
        return NextResponse.json(
          { success: false, error: "contactName이 필요합니다." },
          { status: 400 }
        );
      }
      const result = await ingestContactSignal({
        userEmail,
        contactName: String(body.contactName),
        phoneNumber: body.phoneNumber || null,
        sourceType: body.sourceType || "MANUAL",
        sourceRef: body.sourceRef || "",
        multiLabels: Array.isArray(body.multiLabels) ? body.multiLabels : [],
        emotion: body.emotion || null,
        closeness: body.closeness,
        favorability: body.favorability,
        interest: body.interest,
        riskUrgency: body.riskUrgency,
        fraudRisk: body.fraudRisk,
        authenticityConsistency: body.authenticityConsistency,
        flatteryDetected: Boolean(body.flatteryDetected),
        insincerityDetected: Boolean(body.insincerityDetected),
        detectedRedFlags: Array.isArray(body.detectedRedFlags)
          ? body.detectedRedFlags
          : [],
        evidenceText: body.evidenceText || "",
        confidence: body.confidence,
      });

      return NextResponse.json({ success: true, ...result });
    }

    if (action === "generate_verification") {
      if (!body.contactName) {
        return NextResponse.json(
          { success: false, error: "contactName이 필요합니다." },
          { status: 400 }
        );
      }
      const kit = await generateCounterpartyVerificationKit({
        userEmail,
        contactName: String(body.contactName),
        phoneNumber: body.phoneNumber || null,
        recentContextText: body.recentContextText || "",
        persist: body.persist !== false,
      });
      return NextResponse.json({ success: true, kit });
    }

    if (action === "submit_self_check") {
      if (!body.verificationUuid || !body.responses) {
        return NextResponse.json(
          { success: false, error: "verificationUuid와 responses가 필요합니다." },
          { status: 400 }
        );
      }
      const evaluation = await submitVerificationSelfCheck({
        userEmail,
        verificationUuid: String(body.verificationUuid),
        responses: body.responses,
      });
      return NextResponse.json({ success: true, evaluation });
    }

    if (action === "lock_labels") {
      const contactKey = normalizeContactKey(body.contactKey || body.contactName || "");
      const lockedLabels: string[] = Array.isArray(body.lockedLabels)
        ? body.lockedLabels.map(String).filter(Boolean)
        : [];
      const existingRes = await queryTable("sheetbot_contact_profiles", {
        filters: { user_email: userEmail, contact_key: contactKey },
        orderBy: "id",
        orderDirection: "DESC",
        limit: 1,
      });
      const existing = (existingRes.rows || []).find((r: any) => !r.deleted_at);
      if (existing?.id) {
        await updateRows(
          "sheetbot_contact_profiles",
          {
            locked_labels_json: JSON.stringify(lockedLabels),
            updated_at: getKoreanTimeString(),
            updated_by: userEmail,
          },
          { ids: [Number(existing.id)] }
        );
      }
      const profile = await recomputeContactProfile(
        userEmail,
        contactKey,
        body.contactName
      );
      return NextResponse.json({ success: true, profile });
    }

    if (action === "sync_sheet") {
      const sheetRes = await syncRelationshipLedgerToSheet(userEmail);
      return NextResponse.json(sheetRes);
    }

    if (action === "ingest_contacts_metadata") {
      const contacts = Array.isArray(body.contacts) ? body.contacts.slice(0, 150) : [];
      let classifiedCount = 0;
      for (const c of contacts) {
        const inferred = inferContactLabelsFromMetadata(c);
        if (inferred.labels.length === 0) continue;
        await ingestContactSignal({
          userEmail,
          contactName: String(c.name || c.mobile || "연락처"),
          phoneNumber: c.mobile || null,
          sourceType: "BUSINESS_CARD",
          sourceRef: "PHONE_CONTACTS_METADATA",
          multiLabels: inferred.labels,
          closeness: inferred.labels.includes("가족") ? 80 : inferred.labels.includes("지인") ? 60 : 25,
          favorability: inferred.labels.includes("가족") ? 50 : 15,
          interest: 40,
          riskUrgency: 10,
          fraudRisk: 0,
          authenticityConsistency: 80,
          evidenceText: inferred.evidence,
          confidence: 0.65,
        }).catch(() => {});
        classifiedCount++;
      }
      return NextResponse.json({
        success: true,
        totalReceived: contacts.length,
        classifiedCount,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error:
          "지원하지 않는 action입니다. (ingest_signal | generate_verification | submit_self_check | lock_labels | sync_sheet | ingest_contacts_metadata)",
      },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "관계 인텔리전스 처리 실패" },
      { status: 500 }
    );
  }
}
