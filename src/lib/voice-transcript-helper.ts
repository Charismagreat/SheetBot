/**
 * 이지데스크 서버 API 기본 URL 반환
 */
export function getEgdeskApiUrl(): string {
  return process.env.NEXT_PUBLIC_EGDESK_API_URL || 'http://localhost:8080';
}

/**
 * 이지데스크 표준 Voice Transcript MCP 도구 호출 함수
 * 2중 언래핑(unwrapAiCallerText / json.result.content[0].text)을 안전하게 적용
 */
export async function callVoiceTranscriptTool(
  toolName: string,
  args: Record<string, any> = {}
): Promise<any> {
  const apiUrl = getEgdeskApiUrl();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Api-Key': 'a67ddc0f-7e2b-4997-9a0b-9667a74c89d0',
  };

  const response = await fetch(`${apiUrl}/voice-transcript/tools/call`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      tool: toolName,
      arguments: args,
    }),
  });

  const json = await response.json().catch(() => null);
  if (!response.ok || !json) {
    const errorDetail = json?.error || json?.message || response.statusText;
    throw new Error(`Voice Transcript 도구 호출 실패 (HTTP ${response.status}): ${errorDetail}`);
  }

  // MCP 표준 결과 언래핑
  const textContent = json.result?.content?.[0]?.text;
  if (!textContent) {
    return json.result || json;
  }

  try {
    return JSON.parse(textContent);
  } catch {
    return textContent;
  }
}

/**
 * Voice Transcript 엔진 준비 상태 (Whisper Large v3 Turbo, Pyannote 3.1) 확인
 */
export async function getVoiceTranscriptStatus(): Promise<{
  whisper: { ready: boolean; model?: string };
  pyannote: { ready: boolean; pipeline?: string };
  ffmpeg: { ready: boolean; path?: string | null };
  transcriptionMode?: string;
  queue?: { idle: boolean; active?: string | null; pendingCount: number };
  allowlist?: { uploadsDir: string; roots: string[] };
}> {
  return await callVoiceTranscriptTool('voice_transcript_status', {});
}

/**
 * 등록된 성문 화자(Voice Profiles) 목록 조회
 */
export async function listEnrolledSpeakers(): Promise<{
  count: number;
  speakers: Array<{
    id: string;
    name: string;
    sampleCount?: number;
    matchCount?: number;
    lastMatchedAt?: string;
  }>;
}> {
  return await callVoiceTranscriptTool('voice_transcript_speakers_list', {});
}

/**
 * 사용자 목소리 성문 등록 (Voice Enrollment)
 * pyannote + wespeaker-voxceleb-resnet34-LM 임베딩 모델을 통해 Centroid 벡터 추출 및 등록
 */
export async function enrollSpeakerVoice(params: {
  name: string;
  filePath: string;
  speakerId?: string;
  startSec?: number;
  endSec?: number;
  segments?: Array<{ start_sec: number; end_sec: number }>;
  verifyReferenceSegments?: Array<{ start_sec: number; end_sec: number }>;
  force?: boolean;
}): Promise<any> {
  const args: Record<string, any> = {
    name: params.name,
    file_path: params.filePath,
    force: params.force ?? true, // 온보딩 짧은 클립 안전 통과를 위해 force 기본 true
  };

  if (params.speakerId) args.speaker_id = params.speakerId;
  if (params.startSec !== undefined) args.start_sec = params.startSec;
  if (params.endSec !== undefined) args.end_sec = params.endSec;
  if (params.segments && params.segments.length > 0) args.segments = params.segments;
  if (params.verifyReferenceSegments && params.verifyReferenceSegments.length > 0) {
    args.verify_reference_segments = params.verifyReferenceSegments;
  }

  return await callVoiceTranscriptTool('voice_transcript_speakers_enroll', args);
}

/**
 * 등록된 화자 이름 변경
 */
export async function renameSpeakerVoice(speakerId: string, name: string): Promise<any> {
  return await callVoiceTranscriptTool('voice_transcript_speakers_rename', {
    speaker_id: speakerId,
    name,
  });
}

/**
 * 등록된 화자 성문 삭제
 */
export async function deleteSpeakerVoice(speakerId: string): Promise<any> {
  return await callVoiceTranscriptTool('voice_transcript_speakers_delete', {
    speaker_id: speakerId,
  });
}

/**
 * 로컬 온디바이스 화자 분리 전사 (Whisper.cpp + Pyannote 3.1)
 * 기등록된 화자 성문(Enrolled Voices)과 자동 대조하여 '화자 1' 대신 실제 이름으로 자동 치환
 */
export async function transcribeAudioFile(params: {
  filePath: string;
  sessionType?: 'call' | 'meeting';
  numSpeakers?: number;
  speakerIds?: string[];
  summarize?: boolean;
  summaryModel?: string;
  background?: boolean;
  language?: string;
}): Promise<{
  job_id?: string;
  transcript?: string;
  turns?: Array<{ speaker: string; startSec: number; endSec: number; text?: string }>;
  summary?: { done?: string[]; todo?: string[] } | string;
  clustering?: any;
  enrolled?: any;
}> {
  const args: Record<string, any> = {
    file_path: params.filePath,
    session_type: params.sessionType || 'call',
    language: params.language || 'ko',
    summarize: params.summarize ?? false,
    background: params.background ?? false,
  };

  if (params.numSpeakers !== undefined) args.num_speakers = params.numSpeakers;
  if (params.speakerIds && params.speakerIds.length > 0) args.speaker_ids = params.speakerIds;
  if (params.summaryModel) args.summary_model = params.summaryModel;

  return await callVoiceTranscriptTool('voice_transcript_transcribe', args);
}

/**
 * 백그라운드 전사 작업 상태 폴링
 */
export async function getTranscribeJobStatus(jobId: string): Promise<any> {
  return await callVoiceTranscriptTool('voice_transcript_transcribe_job', {
    job_id: jobId,
  });
}

/**
 * 로컬 Gemma 모델을 통한 통화 전사 텍스트 요약 (Done / Todo 추출)
 */
export async function summarizeTranscriptText(
  transcript: string,
  options?: { summaryModel?: string; language?: string }
): Promise<{ done: string[]; todo: string[] }> {
  return await callVoiceTranscriptTool('voice_transcript_summarize', {
    transcript,
    summary_model: options?.summaryModel || 'gemma4:e4b-it-qat',
    language: options?.language || 'ko',
  });
}
