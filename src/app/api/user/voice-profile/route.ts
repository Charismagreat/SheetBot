export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import {
  getVoiceTranscriptStatus,
  listEnrolledSpeakers,
  enrollSpeakerVoice,
  deleteSpeakerVoice,
} from "@/lib/voice-transcript-helper";
import fs from "fs";
import path from "path";
import os from "os";

/**
 * Voice Transcript 파일 허용 디렉토리에 안전하게 임시 파일 저장하는 헬퍼
 */
async function getSafeVoiceUploadPath(fileName: string): Promise<string> {
  try {
    const status = await getVoiceTranscriptStatus();
    const primaryDir = status?.allowlist?.uploadsDir;
    if (primaryDir && fs.existsSync(primaryDir)) {
      return path.join(primaryDir, `vp_${Date.now()}_${fileName}`);
    }
  } catch {}

  // Fallback: Downloads 폴더 (allowlist에 기본 포함)
  const homeDir = os.homedir();
  const downloadsDir = path.join(homeDir, "Downloads");
  if (fs.existsSync(downloadsDir)) {
    return path.join(downloadsDir, `sb_voice_${Date.now()}_${fileName}`);
  }

  // Final Fallback: 시스템 임시 디렉토리
  return path.join(os.tmpdir(), `sb_voice_${Date.now()}_${fileName}`);
}

/**
 * GET /api/user/voice-profile
 * 현재 로그인 사용자의 '내 목소리' 성문 프로필 등록 여부 및 정보 조회
 */
export async function GET(req: NextRequest) {
  try {
    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");
    const userEmail = (sessionEmail || headerEmail || "").toLowerCase().trim();

    if (!userEmail) {
      return NextResponse.json(
        { success: false, error: "사용자 인증이 필요합니다." },
        { status: 401 }
      );
    }

    const res = await listEnrolledSpeakers();
    const speakers = res?.speakers || [];

    // 사용자 이메일과 일치하는 스피커 프로필 탐색
    const myProfile = speakers.find(
      (s) => s.id === userEmail || s.name === `본인 (${userEmail})` || s.name.includes(userEmail)
    );

    return NextResponse.json({
      success: true,
      isEnrolled: !!myProfile,
      speaker: myProfile || null,
      totalSpeakersCount: res.count || 0,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "성문 프로필 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user/voice-profile
 * 5~10초 사용자 음성 녹음 샘플을 받아 성문(Centroid) 벡터를 이지데스크 Voice Transcript에 영구 등록
 */
export async function POST(req: NextRequest) {
  let targetPath: string | null = null;
  try {
    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");
    let userEmail = (sessionEmail || headerEmail || "").toLowerCase().trim();

    let buffer: Buffer | null = null;
    let fileName = "voice_sample.wav";
    let displayName = "본인";

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json();
      if (!userEmail && body.userEmail) userEmail = body.userEmail.toLowerCase().trim();
      if (body.fileName) fileName = body.fileName;
      if (body.displayName) displayName = body.displayName;

      const rawBase64 = body.audioBase64 || body.fileBase64 || body.base64 || "";
      if (rawBase64) {
        const cleanBase64 = rawBase64.replace(/^data:[^;]+;base64,/, "");
        buffer = Buffer.from(cleanBase64, "base64");
      }
    } else {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const formEmail = formData.get("userEmail") as string | null;
      if (!userEmail && formEmail) userEmail = formEmail.toLowerCase().trim();

      if (file) {
        const arrayBuf = await file.arrayBuffer();
        buffer = Buffer.from(arrayBuf);
        fileName = file.name || fileName;
      }
    }

    if (!userEmail) {
      return NextResponse.json(
        { success: false, error: "사용자 이메일 정보가 누락되었습니다." },
        { status: 401 }
      );
    }

    if (!buffer || buffer.length < 2048) {
      return NextResponse.json(
        { success: false, error: "유효한 음성 데이터가 아닙니다. 최소 2초 이상 명확하게 발화된 음성을 전달해 주세요." },
        { status: 400 }
      );
    }

    // 허용된 디렉토리에 임시 파일 저장
    targetPath = await getSafeVoiceUploadPath(fileName);
    fs.writeFileSync(targetPath, buffer);

    // 기존 등록된 사용자 프로필 확인
    const existingList = await listEnrolledSpeakers().catch(() => null);
    const existingSpeaker = existingList?.speakers?.find(
      (s: any) => s.id === userEmail || s.name === `본인 (${userEmail})` || s.name.includes(userEmail)
    );

    // 이지데스크 Voice Transcript에 성문 등록
    // 신규 등록: speakerId 생략하고 name만 전달 (UUID 자동 발급)
    // 기존 등록: existingSpeaker.id (UUID)를 전달하여 샘플 추가/융합
    const enrollResult = await enrollSpeakerVoice({
      name: `본인 (${userEmail})`,
      filePath: targetPath,
      speakerId: existingSpeaker ? existingSpeaker.id : undefined,
      force: true, // 짧은 온보딩 클립도 안전하게 통과
    });

    const enrolledSpeaker = enrollResult?.speaker || existingSpeaker;

    return NextResponse.json({
      success: true,
      message: "🎉 '내 목소리' 성문 프로필이 안전하게 등록되었습니다! 이제 모든 통화 녹음에서 '나'가 자동으로 식별됩니다.",
      speakerId: enrolledSpeaker?.id || userEmail,
      name: enrolledSpeaker?.name || `본인 (${userEmail})`,
      details: enrollResult,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "성문 등록 중 오류가 발생했습니다." },
      { status: 500 }
    );
  } finally {
    // 등록 완료 후 임시 음성 파일 회수
    if (targetPath && fs.existsSync(targetPath)) {
      try {
        fs.unlinkSync(targetPath);
      } catch {}
    }
  }
}

/**
 * DELETE /api/user/voice-profile
 * 등록된 사용자 성문 프로필 삭제
 */
export async function DELETE(req: NextRequest) {
  try {
    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");
    const userEmail = (sessionEmail || headerEmail || "").toLowerCase().trim();

    if (!userEmail) {
      return NextResponse.json(
        { success: false, error: "사용자 인증이 필요합니다." },
        { status: 401 }
      );
    }

    // 실제 등록된 화자 목록에서 ID 탐색
    const listRes = await listEnrolledSpeakers().catch(() => null);
    const targetSpeaker = listRes?.speakers?.find(
      (s: any) => s.id === userEmail || s.name === `본인 (${userEmail})` || s.name.includes(userEmail)
    );

    if (targetSpeaker?.id) {
      await deleteSpeakerVoice(targetSpeaker.id);
    } else {
      await deleteSpeakerVoice(userEmail).catch(() => null);
    }

    return NextResponse.json({
      success: true,
      message: "등록된 성문 프로필이 안전하게 삭제되었습니다.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "성문 프로필 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
