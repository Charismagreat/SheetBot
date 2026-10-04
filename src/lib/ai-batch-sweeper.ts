/**
 * 🎙️ Gemini Batch 비동기 수거 워커 (Async AI Batch Sweeper)
 * 
 * 구글 Gemini Batch API의 지연(2분~10분 이상)에 대응하여,
 * 서버 프로세스를 블로킹하지 않고 주기적으로 완료 여부를 점검하여
 * 구글 시트에 0초 만에 비동기로 전사/요약 결과를 채워넣는 전용 백그라운드 엔진입니다.
 */

import { queryTable, insertRows } from './setup-db';
import { callAiBatchGet, callAiBatchList, callSheetsTool, updateRows } from './egdesk-helpers';
import { deductTokens } from './token-wallet';
import { recordAiUsageLog } from './ai-usage';
import { getKoreanTimeString } from './date-utils';
import { resolveSafeTargetRow } from './sheet-fingerprint-guard';

function formatBusinessNumber(raw: any): string {
  if (!raw) return "미기재";
  const str = String(raw).trim();
  const digits = str.replace(/[^0-9]/g, "");
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  }
  return str.length > 0 ? str : "미기재";
}

let isSweeperRunning = false;
let sweeperInterval: NodeJS.Timeout | null = null;

export function ensureBatchSweeperLoop(): void {
  if (typeof window !== "undefined") return;
  if (sweeperInterval) return;

  // 45초 주기 백그라운드 PENDING 잡 자생적 자동 점검
  sweeperInterval = setInterval(() => {
    void processPendingBatchJobs().catch((err) => {
      console.warn("[BatchSweeper] Background loop error:", err?.message);
    });
  }, 45000);

  if (typeof (sweeperInterval as any)?.unref === "function") {
    (sweeperInterval as any).unref();
  }
}

export async function processPendingBatchJobs(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  pending: number;
}> {
  ensureBatchSweeperLoop();

  if (isSweeperRunning) {
    return { processed: 0, succeeded: 0, failed: 0, pending: 0 };
  }

  isSweeperRunning = true;
  let succeeded = 0;
  let failed = 0;
  let pending = 0;

  try {
    // 1. 미완료(PENDING) 상태의 배치 잡 조회
    const jobsRes = await queryTable('sheetbot_ai_batch_jobs', {
      filters: { status: 'PENDING' },
      limit: 20,
      orderBy: 'id',
      orderDirection: 'ASC',
    }).catch(() => ({ rows: [] }));

    let jobs = (jobsRes.rows || []).filter((r: any) => !r.deleted_at);

    // 🛡️ [자가 복구 안전망 (Auto-Healing Fallback)]
    // DB 티켓 등록이 누락되었더라도 최근 구글 클라우드 배치 목록에서 성공한 작업이 있으면 자동 복구
    if (jobs.length === 0) {
      try {
        const cloudBatchList = await callAiBatchList();
        const recentSucceeded = (cloudBatchList.jobs || []).filter(
          (j: any) => j.state === 'JOB_STATE_SUCCEEDED' && j.name?.startsWith('batches/')
        );
        for (const cj of recentSucceeded.slice(0, 3)) {
          const disp = String(cj.displayName || '');
          let inferredFile = '통화녹음';
          if (disp.includes('CallRecording-')) {
            inferredFile = disp.replace('CallRecording-', '').trim();
          }
          jobs.push({
            id: `auto-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            job_name: cj.name,
            job_type: disp.includes('Receipt') ? 'RECEIPT' : disp.includes('Card') ? 'BUSINESS_CARD' : disp.includes('Link') ? 'LINK_BOOKMARK' : 'RECORDING',
            user_email: 'chachogreat@gmail.com',
            file_name: inferredFile,
            spreadsheet_id: '1bHtvSdmqfHJ-1WkgPv9hMlaUjqbMxEBnkHQpk1kIiOQ',
            row_index: 0,
            model: cj.model || 'gemini-2.5-flash',
            status: 'PENDING',
          });
        }
      } catch {}
    }

    if (jobs.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0, pending: 0 };
    }

    console.log(`[BatchSweeper] 🔍 Checking ${jobs.length} pending batch job(s)...`);

    for (const job of jobs) {
      const jobId = String(job.id);
      const jobName = String(job.job_name || '');
      const userEmail = String(job.user_email || '');
      const spreadsheetId = String(job.spreadsheet_id || '');
      const rowIndex = Number(job.row_index) || 0;
      const fileName = String(job.file_name || '통화녹음');
      const targetModel = String(job.model || 'gemini-2.5-flash');

      if (!jobName || !jobName.startsWith('batches/')) {
        continue;
      }

      // 2. 단일 0초 상태 조회 (waitMs: 0)
      try {
        const batchRes = await callAiBatchGet(jobName, { waitMs: 0 });

        if (batchRes.success && batchRes.state === 'JOB_STATE_SUCCEEDED') {
          console.log(`[BatchSweeper] ✅ Job ${jobName} SUCCEEDED! Updating Sheet...`);

          const rawItem = (batchRes.results && batchRes.results[0]) || {};
          let rawText = (rawItem.text || rawItem.content || rawItem.response || '').trim();

          if (rawText.startsWith('```json')) {
            rawText = rawText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
          } else if (rawText.startsWith('```')) {
            rawText = rawText.replace(/^```\s*/, '').replace(/\s*```$/, '');
          }

          const jobType = String(job.job_type || (job.file_name?.startsWith('[LINK_BOOKMARK]') || !job.file_name?.match(/\.(m4a|mp3|wav|ogg)$/i) ? 'LINK_BOOKMARK' : 'RECORDING'));

          // 🛡️ 지능형 행 핑거프린트 가드: 시트 쓰기 전 사용자 행 삭제/이동 점검 및 동적 행 탐색
          let targetRow: number | null = rowIndex > 1 ? rowIndex : null;
          if (spreadsheetId) {
            const guardRes = await resolveSafeTargetRow({
              spreadsheetId,
              expectedRow: rowIndex > 1 ? rowIndex : undefined,
              fileName,
            });

            targetRow = guardRes.safeRow;
            if (!targetRow) {
              console.warn(`[BatchSweeper] 🛑 Row for job ${jobName} was deleted by user or not found (${guardRes.reason}). Skipping sheet write.`);
              if (!jobId.startsWith('auto-')) {
                const nowStr = getKoreanTimeString();
                await updateRows('sheetbot_ai_batch_jobs', {
                  status: 'CANCELLED_USER_DELETED',
                  error_message: '사용자가 구글 시트에서 해당 행을 삭제하여 시트 덮어쓰기를 안전하게 취소함',
                  completed_at: nowStr,
                  updated_at: nowStr,
                }, { ids: [Number(jobId)] }).catch(() => {});
              }
              succeeded++;
              continue;
            }
          }

          if (jobType === 'RECEIPT') {
            // [RECEIPT] 영수증 13대 표준 컬럼 수거 (B~K열 핀포인트 갱신)
            let ocrData: any = {};
            try {
              ocrData = JSON.parse(rawText);
            } catch {
              ocrData = { merchantName: '영수증', details: rawText.slice(0, 300) };
            }

            const bNum = formatBusinessNumber(ocrData.businessNumber);
            const amtNum = ocrData.amount ? Number(String(ocrData.amount).replace(/[^0-9]/g, '')) : 0;
            const vatNum = ocrData.vat ? Number(String(ocrData.vat).replace(/[^0-9]/g, '')) : 0;
            const supplyNum = Math.max(0, amtNum - vatNum);
            const amt = amtNum.toLocaleString('ko-KR');
            const vat = vatNum.toLocaleString('ko-KR');
            const supplyAmt = supplyNum.toLocaleString('ko-KR');
            const paymentMethod = [ocrData.cardIssuer, ocrData.cardNumber].filter(Boolean).join(' ') || (ocrData.receiptType?.includes('카드') ? '신용카드' : '현금/기타');

            // 시트 A열~J열 핀포인트 갱신 (A:승인일시, B:영수증구분, C:가맹점명, D:사업자번호, E:합계금액, F:공급가액, G:부가세, H:품목/적요, I:결제수단, J:승인번호) 및 L열(분석상태)
            if (spreadsheetId && targetRow && targetRow > 1) {
              await callSheetsTool('sheets_update_range', {
                spreadsheetId,
                range: `시트1!A${targetRow}:J${targetRow}`,
                values: [[
                  ocrData.paidAt || getKoreanTimeString(),
                  ocrData.receiptType || '신용카드 영수증',
                  ocrData.merchantName || '확인 불가',
                  bNum || '-',
                  amt,
                  supplyAmt,
                  vat,
                  ocrData.details || '-',
                  paymentMethod,
                  ocrData.approvalNumber || '-',
                ]],
                preferOAuth: true,
              }).catch((err: any) => console.warn(`[BatchSweeper] Sheet update warning: ${err.message}`));

              await callSheetsTool('sheets_update_range', {
                spreadsheetId,
                range: `시트1!L${targetRow}`,
                values: [['✅ 분석 완료']],
                preferOAuth: true,
              }).catch(() => {});
            }

            const usedTokens = Math.round(1200 * 0.5); // 50% 배치 할인
            await deductTokens(userEmail, usedTokens).catch(() => {});

            void recordAiUsageLog({
              userEmail,
              caller: 'sheetbot-receipt-batch-sweeper',
              purpose: `영수증 AI 장부화 [AI 배치(50% 절감)] (${targetModel} / 0.5x)`,
              model: targetModel,
              promptTokens: 400,
              completionTokens: 200,
              totalTokens: usedTokens,
              promptText: `비동기 영수증 분석: ${fileName}`,
              responseText: JSON.stringify(ocrData).slice(0, 300),
            });
          } else if (jobType === 'BUSINESS_CARD') {
            // [BUSINESS_CARD] 명함 11대 표준 컬럼 수거 (B~I열 핀포인트 갱신)
            let ocrData: any = {};
            try {
              ocrData = JSON.parse(rawText);
            } catch {
              ocrData = { name: '명함', details: rawText.slice(0, 300) };
            }

            // 시트 B열~I열 핀포인트 갱신 (B:성함, C:직함, D:회사명, E:휴대폰, F:이메일, G:유선전화, H:회사주소, I:상세정보)
            if (spreadsheetId && targetRow && targetRow > 1) {
              await callSheetsTool('sheets_update_range', {
                spreadsheetId,
                range: `시트1!B${targetRow}:I${targetRow}`,
                values: [[
                  ocrData.name || '확인 불가',
                  ocrData.title || '미기재',
                  ocrData.company || '미기재',
                  ocrData.mobile || '미기재',
                  ocrData.email || '미기재',
                  ocrData.tel || '미기재',
                  ocrData.address || '미기재',
                  ocrData.details || '-',
                ]],
                preferOAuth: true,
              }).catch((err: any) => console.warn(`[BatchSweeper] Sheet update warning: ${err.message}`));
            }

            const usedTokens = Math.round(1000 * 0.5); // 50% 배치 할인
            await deductTokens(userEmail, usedTokens).catch(() => {});

            void recordAiUsageLog({
              userEmail,
              caller: 'sheetbot-card-batch-sweeper',
              purpose: `명함 AI 인맥화 [AI 배치(50% 절감)] (${targetModel} / 0.5x)`,
              model: targetModel,
              promptTokens: 350,
              completionTokens: 150,
              totalTokens: usedTokens,
              promptText: `비동기 명함 분석: ${fileName}`,
              responseText: JSON.stringify(ocrData).slice(0, 300),
            });
          } else if (jobType === 'LINK_BOOKMARK') {
            // [LINK_BOOKMARK] 웹 링크 및 유튜브 3줄 요약 수거
            let finalSummary = rawText;
            try {
              const parsed = JSON.parse(rawText);
              if (parsed.summary) finalSummary = parsed.summary;
            } catch {}
            if (finalSummary.length < 5) {
              finalSummary = '1. 원본 링크 참조\n2. 주요 콘텐츠 확인 완료\n3. 후속 검토 요망';
            }

            // 구글 시트 F열 핀포인트 갱신
            if (spreadsheetId && targetRow && targetRow > 1) {
              await callSheetsTool('sheets_update_range', {
                spreadsheetId,
                range: `시트1!F${targetRow}:F${targetRow}`,
                values: [[finalSummary]],
                preferOAuth: true,
              }).catch((err: any) => console.warn(`[BatchSweeper] Sheet update warning: ${err.message}`));
            }

            // 50% 반값 할인 토큰 정산
            const promptLen = 1200;
            const respLen = finalSummary.length;
            const rawTokens = Math.max(300, Math.ceil((promptLen + respLen) / 2.5));
            const usedTokens = Math.round(rawTokens * 0.5); // 50% 배치 할인

            await deductTokens(userEmail, usedTokens).catch(() => {});

            void recordAiUsageLog({
              userEmail,
              caller: 'sheetbot-link-batch-sweeper',
              purpose: `웹 링크/유튜브 AI 3줄 요약 [AI 배치(50% 절감)] (${targetModel} / 0.5x)`,
              model: targetModel,
              promptTokens: Math.ceil(promptLen / 2.5),
              completionTokens: Math.ceil(respLen / 2.5),
              totalTokens: usedTokens,
              promptText: `비동기 수거 링크 분석: ${fileName}`,
              responseText: finalSummary,
            });
          } else {
            // [RECORDING] 통화 녹음 대장 수거 (E: 요약, F: Action Items, G: 전사문)
            let summary = '1. 통화 확인 완료\n2. 후속 조치 요망\n3. 상세 내용 녹음 참조';
            let actionItems = '• 담당자 확인 필요';
            let transcript = '음성 분석 완료';

            try {
              const parsed = JSON.parse(rawText);
              if (parsed.summary) summary = parsed.summary;
              if (parsed.actionItems) actionItems = parsed.actionItems;
              if (parsed.transcript) transcript = parsed.transcript;
            } catch {
              if (rawText.length > 0) {
                summary = rawText.slice(0, 300);
                transcript = rawText;
              }
            }

            if (spreadsheetId && targetRow && targetRow > 1) {
              await callSheetsTool('sheets_update_range', {
                spreadsheetId,
                range: `시트1!E${targetRow}:G${targetRow}`,
                values: [[summary, actionItems, transcript]],
                preferOAuth: true,
              }).catch((err: any) => console.warn(`[BatchSweeper] Sheet update warning: ${err.message}`));

              // 파일명에서 상대방 이름 복원하여 B열 보정
              try {
                const cleanName = fileName.replace(/^\[SheetBot\]\s*/i, '').replace(/\.[^.]+$/, '');
                const m = cleanName.match(/^([^_]+)_(\d{9,12})_(\d{8,14})$/);
                if (m) {
                  const rawName = m[1].trim();
                  const phone = m[2].trim();
                  const fPhone = phone.length === 11 ? `${phone.slice(0, 3)}-${phone.slice(3, 7)}-${phone.slice(7)}` : phone;
                  const fullContact = `${rawName} (${fPhone})`;
                  await callSheetsTool('sheets_update_range', {
                    spreadsheetId,
                    range: `시트1!B${targetRow}`,
                    values: [[fullContact]],
                    preferOAuth: true,
                  }).catch(() => {});
                }
              } catch {}
            }

            const promptLen = 4500;
            const respLen = rawText.length;
            const rawTokens = Math.max(800, Math.ceil((promptLen + respLen) / 2.5) + 500);
            const usedTokens = Math.round(rawTokens * 0.5); // 50% 배치 할인

            await deductTokens(userEmail, usedTokens).catch(() => {});

            void recordAiUsageLog({
              userEmail,
              caller: 'sheetbot-voice-batch-sweeper',
              purpose: `통화 녹음 AI STT 및 3줄 요약/Action Items [AI 배치(50% 절감)] (${targetModel} / 0.5x)`,
              model: targetModel,
              promptTokens: Math.ceil(promptLen / 2.5),
              completionTokens: Math.ceil(respLen / 2.5),
              totalTokens: usedTokens,
              promptText: `비동기 수거 음성 분석: ${fileName}`,
              responseText: summary,
            });
          }

          // 공통: 잡 상태 SUCCEEDED로 마감
          if (!jobId.startsWith('auto-')) {
            const nowStr = getKoreanTimeString();
            await updateRows('sheetbot_ai_batch_jobs', {
              status: 'SUCCEEDED',
              completed_at: nowStr,
              updated_at: nowStr,
            }, { ids: [Number(jobId)] }).catch(() => {});
          }

          succeeded++;
        } else if (batchRes.state === 'JOB_STATE_FAILED' || batchRes.state === 'JOB_STATE_CANCELLED') {
          console.warn(`[BatchSweeper] ❌ Job ${jobName} FAILED (${batchRes.error || batchRes.state})`);
          const nowStr = getKoreanTimeString();
          await updateRows('sheetbot_ai_batch_jobs', {
            status: 'FAILED',
            error_message: batchRes.error || 'Gemini Batch failed',
            completed_at: nowStr,
            updated_at: nowStr,
          }, { ids: [Number(jobId)] }).catch(() => {});

          // 실패 문구 기입 시에도 핑거프린트 가드 적용
          let failTargetRow: number | null = rowIndex;
          if (spreadsheetId && rowIndex > 1) {
            const guardRes = await resolveSafeTargetRow({
              spreadsheetId,
              expectedRow: rowIndex,
              fileName,
            });
            failTargetRow = guardRes.safeRow;
          }

          const jobType = String(job.job_type || (job.file_name?.startsWith('[LINK_BOOKMARK]') || !job.file_name?.match(/\.(m4a|mp3|wav|ogg)$/i) ? 'LINK_BOOKMARK' : 'RECORDING'));
          if (spreadsheetId && failTargetRow && failTargetRow > 1) {
            if (jobType === 'LINK_BOOKMARK') {
              await callSheetsTool('sheets_update_range', {
                spreadsheetId,
                range: `시트1!F${failTargetRow}:F${failTargetRow}`,
                values: [['⚠️ AI 배치 요약 실패 (재시도 요망)']],
                preferOAuth: true,
              }).catch(() => {});
            } else {
              await callSheetsTool('sheets_update_range', {
                spreadsheetId,
                range: `시트1!E${failTargetRow}:G${failTargetRow}`,
                values: [['⚠️ AI 배치 분석 실패 (재분석 지원)', '-', '-']],
                preferOAuth: true,
              }).catch(() => {});
            }
          }
          failed++;
        } else {
          // 아직 구글에서 처리 중 (JOB_STATE_RUNNING / JOB_STATE_PENDING)
          pending++;
        }
      } catch (err: any) {
        console.warn(`[BatchSweeper] Check error for job ${jobName}:`, err.message);
        pending++;
      }
    }
  } catch (globalErr: any) {
    console.error('[BatchSweeper] Fatal error in sweeper:', globalErr.message);
  } finally {
    isSweeperRunning = false;
  }

  return {
    processed: succeeded + failed + pending,
    succeeded,
    failed,
    pending,
  };
}
