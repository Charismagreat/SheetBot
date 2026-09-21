"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Smartphone,
  Download,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
  ArrowRight,
  Zap,
  BatteryCharging,
  Radio,
  Clock,
  Sparkles,
  ExternalLink,
  ChevronRight,
  FileCode,
  Send,
  HelpCircle,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import { apiFetch } from "@/lib/api";

function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr).replace("T", " ").slice(0, 16);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${yyyy}.${mm}.${dd} ${hh}:${min}`;
  } catch {
    return String(dateStr).slice(0, 16);
  }
}

export default function DepositAgentPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // 페어링 상태
  const [pairingData, setPairingData] = useState<any>(null);
  const [loadingPairing, setLoadingPairing] = useState(true);
  const [copiedPin, setCopiedPin] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  // 등록된 디바이스 상태
  const [device, setDevice] = useState<any>(null);
  const [loadingDevice, setLoadingDevice] = useState(true);

  // 최근 입금 대장 상태
  const [depositLogs, setDepositLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  // 가상 테스트 상태
  const [testingSms, setTestingSms] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  // 알림 토스트
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // 1. 페어링 정보(QR & 핀코드) 로드
  const fetchPairingInfo = useCallback(async () => {
    setLoadingPairing(true);
    try {
      const res = await apiFetch("/api/wallet/agent/pair");
      const data = await res.json();
      if (data.success) {
        setPairingData(data);
      }
    } catch (err: any) {
      console.error("Fetch pairing error:", err);
    } finally {
      setLoadingPairing(false);
    }
  }, []);

  // 2. 등록된 에이전트 기기 상태 로드
  const fetchDeviceStatus = useCallback(async () => {
    setLoadingDevice(true);
    try {
      const res = await apiFetch("/api/user/devices");
      const data = await res.json();
      if (data.success && data.devices) {
        const agentDev = data.devices.find(
          (d: any) => d.pairingMode === "android_agent" || d.pairing_mode === "android_agent"
        );
        setDevice(agentDev || null);
      }
    } catch (err: any) {
      console.error("Fetch device error:", err);
    } finally {
      setLoadingDevice(false);
    }
  }, []);

  // 3. 최근 입금 대장 조회
  const fetchDepositLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await apiFetch("/api/wallet/direct-deposit?limit=10");
      const data = await res.json();
      if (data.success && data.requests) {
        setDepositLogs(data.requests);
      }
    } catch (err: any) {
      console.error("Fetch logs error:", err);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
      return;
    }
    if (status === "authenticated") {
      // 관리자 권한 확인
      apiFetch("/api/admin/check")
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.isAdmin) {
            setIsAdmin(true);
            fetchPairingInfo();
            fetchDeviceStatus();
            fetchDepositLogs();
          } else {
            setIsAdmin(false);
            router.push("/dashboard");
          }
        })
        .catch(() => {
          setIsAdmin(false);
          router.push("/dashboard");
        });

      const interval = setInterval(() => {
        fetchDeviceStatus();
        fetchDepositLogs();
      }, 15000);
      return () => clearInterval(interval);
    }
  }, [status, router, fetchPairingInfo, fetchDeviceStatus, fetchDepositLogs]);

  // 가상 카카오뱅크 입금 테스트 실행
  const handleTestSms = async () => {
    setTestingSms(true);
    setTestResult(null);
    try {
      const res = await apiFetch("/api/wallet/agent/test-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: 5000,
          depositor: "차호석",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult(data);
        showToast("success", "가상 카카오뱅크 입금 테스트가 성공적으로 전송되었습니다!");
        fetchDepositLogs();
      } else {
        showToast("error", data.error || "테스트 전송에 실패했습니다.");
      }
    } catch (err: any) {
      showToast("error", err.message || "통신 오류가 발생했습니다.");
    } finally {
      setTestingSms(false);
    }
  };

  // 핀코드 복사
  const handleCopyPin = () => {
    if (!pairingData?.pinCode) return;
    navigator.clipboard.writeText(pairingData.pinCode);
    setCopiedPin(true);
    setTimeout(() => setCopiedPin(false), 2000);
    showToast("success", "6자리 핀코드가 클립보드에 복사되었습니다.");
  };

  // 웹훅 주소 복사
  const handleCopyWebhook = () => {
    const url = "https://sheetbot.cloud/api/wallet/bank-webhook";
    navigator.clipboard.writeText(url);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
    showToast("success", "웹훅 주소가 복사되었습니다.");
  };

  // MacroDroid 원클릭 프리셋 JSON 다운로드
  const handleDownloadMacroPreset = () => {
    const userEmail = session?.user?.email || "chachogreat@gmail.com";
    const preset = {
      name: "SheetBot_자동입금감지_웹훅",
      version: 1,
      targetUrl: "https://sheetbot.cloud/api/wallet/bank-webhook",
      userEmail: userEmail,
      trigger: "SMS_RECEIVED",
      senderFilter: "1599-3333",
      contentKeyword: "입금",
      httpMethod: "POST",
      httpHeader: { "Content-Type": "application/json" },
      httpBody: JSON.stringify({
        sender: "[sms_number]",
        smsText: "[sms_message]",
        userEmail: userEmail,
      }),
    };
    const blob = new Blob([JSON.stringify(preset, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `SheetBot_Deposit_Webhook_${userEmail.split("@")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("success", "MacroDroid용 설정 파일이 다운로드되었습니다.");
  };

  const qrImageUrl = pairingData?.qrData
    ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=8&data=${encodeURIComponent(
        pairingData.qrData
      )}`
    : "";

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      {/* 토스트 알림 */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg border text-sm font-bold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-3 ${
            toast.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {toast.type === "success" ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertTriangle className="w-5 h-5 text-rose-600" />}
          <span>{toast.message}</span>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* 상단 브레드크럼 및 헤더 */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-2">
            <Link href="/dashboard/admin" className="hover:text-rose-600 transition-colors flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-rose-600" />
              <span>관리자 센터</span>
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-slate-800 font-bold">무통장 입금 자동확인기 (관리자 전용)</span>
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-md">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                    SheetBot 무통장 입금 자동확인기
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 font-extrabold border border-rose-200">
                      운영자 전용 v1.0
                    </span>
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    대표님(운영자) 스마트폰에 앱을 1대 설치하고 모니터의 QR코드만 비추면, 전국 회원이 무통장 입금할 때마다 은행 문자를 24시간 실시간 감지하여 0초 만에 자동 충전합니다.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  fetchPairingInfo();
                  fetchDeviceStatus();
                  fetchDepositLogs();
                  showToast("success", "실시간 상태를 동기화했습니다.");
                }}
                className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                새로고침
              </button>
              <a
                href="/downloads/sheetbot-deposit-agent.apk"
                download
                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-black rounded-xl shadow-sm flex items-center gap-2 transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                APK 다운로드 (v1.0)
              </a>
            </div>
          </div>
        </div>

        {/* 1단계: 실시간 연동 상태 & 다운로드 배너 그리드 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* 카드 1: 연동 기기 실시간 상태 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">내 스마트폰 연동 상태</span>
                {device && device.status === "CONNECTED" ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    실시간 감지 중
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-800 border border-amber-200">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    연동 대기 중
                  </span>
                )}
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2.5 mb-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-semibold">연동 기기</span>
                  <span className="font-extrabold text-slate-800">{device?.label || "스마트폰 (연결 대기)"}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-semibold">최근 생존 신호</span>
                  <span className="font-mono text-slate-700 font-bold">
                    {device?.lastConnectedAt || device?.last_connected_at ? formatDateTime(device.lastConnectedAt || device.last_connected_at) : "미연결"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-semibold">지원 은행 프리셋</span>
                  <span className="font-bold text-indigo-600">카카오뱅크, 토스, 국민, 신한 등</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={handleTestSms}
                disabled={testingSms}
                className="w-full py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-extrabold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                <Zap className="w-3.5 h-3.5 text-indigo-600" />
                {testingSms ? "가상 입금 테스트 전송 중..." : "🧪 가상 카카오뱅크 입금 테스트 (5,000원)"}
              </button>
              {testResult && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] text-emerald-800">
                  <b>✅ 테스트 완료:</b> 웹훅 수신 성공 (상태코드: 200)
                </div>
              )}
            </div>
          </div>

          {/* 카드 2: 0초 연동 QR코드 & 6자리 핀코드 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col items-center text-center">
            <div className="w-full flex items-center justify-between mb-2">
              <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">내 전용 연동 QR코드</span>
              <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                0초 페어링
              </span>
            </div>

            <div className="p-2.5 bg-white border border-slate-200 rounded-2xl shadow-inner mb-3">
              {loadingPairing ? (
                <div className="w-[180px] h-[180px] flex items-center justify-center text-xs text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : qrImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrImageUrl}
                  alt="SheetBot Pairing QR"
                  className="w-[180px] h-[180px] rounded-lg object-contain"
                />
              ) : (
                <div className="w-[180px] h-[180px] flex items-center justify-center text-xs text-slate-400">
                  QR 생성 불가
                </div>
              )}
            </div>

            <div className="w-full bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center justify-between">
              <div className="text-left">
                <div className="text-[10px] text-slate-400 font-semibold">수동 입력 6자리 핀코드</div>
                <div className="text-base font-black font-mono text-slate-800 tracking-wider">
                  {pairingData?.pinCode || "SB-••••••"}
                </div>
              </div>
              <button
                onClick={handleCopyPin}
                className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-lg shadow-xs flex items-center gap-1 transition-all cursor-pointer"
              >
                {copiedPin ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedPin ? "복사됨" : "복사"}
              </button>
            </div>
          </div>

          {/* 카드 3: 초간단 3단계 시작 가이드 */}
          <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 rounded-2xl p-5 text-white shadow-md flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-black uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  초간단 3단계 설치법
                </span>
                <span className="text-[10px] bg-indigo-800/60 text-indigo-200 px-2 py-0.5 rounded-full font-bold">
                  1분 소요
                </span>
              </div>

              <div className="space-y-3 mb-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-black shrink-0">
                    1
                  </div>
                  <div>
                    <div className="text-xs font-extrabold text-white">APK 다운로드 및 설치 허용</div>
                    <div className="text-[11px] text-slate-300 leading-snug">
                      스마트폰에서 APK를 다운로드한 후 &apos;출처를 알 수 없는 앱 설치&apos;를 1회 승인합니다.
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-black shrink-0">
                    2
                  </div>
                  <div>
                    <div className="text-xs font-extrabold text-white">SMS 권한 & 배터리 최적화 해제</div>
                    <div className="text-[11px] text-slate-300 leading-snug">
                      앱을 켜고 화면에 나타나는 &apos;SMS 읽기 허용&apos;과 &apos;배터리 제한 없음&apos;을 허용합니다.
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-black shrink-0">
                    3
                  </div>
                  <div>
                    <div className="text-xs font-extrabold text-white">왼쪽 QR코드 찰칵 비추기</div>
                    <div className="text-[11px] text-slate-300 leading-snug">
                      앱의 [QR 스캔] 버튼을 누르고 화면의 QR을 비추면 즉시 24시간 자동 감지가 시작됩니다!
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <a
              href="/downloads/sheetbot-deposit-agent.apk"
              download
              className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white text-xs font-black rounded-xl shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              스마트폰에 APK 직접 다운로드
            </a>
          </div>
        </div>

        {/* 2단계: 최근 실시간 입금 감지 대장 */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden mb-8">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                실시간 무통장 입금 감지 및 토큰 적립 내역
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                스마트폰 앱이 은행 SMS를 감지하여 서버와 매칭한 실시간 대장입니다.
              </p>
            </div>
            <button
              onClick={fetchDepositLogs}
              className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
              title="새로고침"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-extrabold">
                <tr>
                  <th className="py-3 px-4">입금 번호 / 식별코드</th>
                  <th className="py-3 px-4">입금자명</th>
                  <th className="py-3 px-4 text-right">입금 금액</th>
                  <th className="py-3 px-4 text-right">적립 토큰</th>
                  <th className="py-3 px-4 text-center">처리 상태</th>
                  <th className="py-3 px-4">감지 및 완료 일시</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {loadingLogs ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      입금 감지 내역을 불러오는 중...
                    </td>
                  </tr>
                ) : depositLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      아직 감지된 무통장 입금 내역이 없습니다.
                    </td>
                  </tr>
                ) : (
                  depositLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-800">
                        {log.deposit_code || log.depositCode || log.id}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        {log.depositor_name || log.depositorName || "-"}
                      </td>
                      <td className="py-3.5 px-4 text-right font-extrabold text-slate-900 font-mono">
                        {Number(log.amount_krw || log.amountKrw || 0).toLocaleString()}원
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-indigo-600 font-mono">
                        +{Number(log.tokens_to_credit || log.tokensToCredit || 50000).toLocaleString()} T
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {log.status === "COMPLETED" || log.status === "APPROVED" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            충전 완료
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200">
                            <Clock className="w-3 h-3" />
                            입금 대기
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-500">
                        {formatDateTime(log.completed_at || log.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 3단계: 보조 옵션 - MacroDroid 원클릭 프리셋 다운로드 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 shrink-0">
              <FileCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                MacroDroid 앱을 계속 사용하고 싶으신가요?
                <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-bold">
                  원클릭 프리셋
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                사용자의 웹훅 주소와 JSON 규격이 이미 완벽히 입력된 설정 파일을 다운로드받아 MacroDroid에서 &apos;가져오기&apos;만 하시면 됩니다.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopyWebhook}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
            >
              {copiedWebhook ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              웹훅 URL 복사
            </button>
            <button
              onClick={handleDownloadMacroPreset}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              설정 파일 (.json) 다운로드
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
