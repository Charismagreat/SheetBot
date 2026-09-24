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
  Zap,
  Clock,
  Sparkles,
  ChevronRight,
  Inbox,
  Radio,
  ArrowRight,
  Share2,
  Trash2,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import { apiFetch } from "@/lib/api";

function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return "-";
  try {
    const raw = String(dateStr).trim();
    // 타임존(Z 또는 +)이 없으면 UTC 기준 문자열로 보정하여 사용자 로컬 한국 시각(KST)으로 자동 변환
    const normalized = raw.includes("Z") || raw.includes("+")
      ? raw
      : raw.replace(" ", "T") + "Z";
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return raw.replace("T", " ").slice(0, 16);

    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSec >= 0 && diffSec < 60) return "방금 전";
    if (diffSec >= 60 && diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;

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
  const [copiedDownloadUrl, setCopiedDownloadUrl] = useState(false);

  // 등록된 디바이스 상태 (단일 대표 및 전체 목록)
  const [device, setDevice] = useState<any>(null);
  const [devices, setDevices] = useState<any[]>([]);
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
        const agentDevices = data.devices.filter(
          (d: any) => d.pairingMode === "android_agent" || d.pairing_mode === "android_agent"
        );
        // 가장 최근 통신한 기기 우선 정렬 (lastConnectedAt 기준 내림차순)
        agentDevices.sort((a: any, b: any) => {
          const tA = new Date(a.lastConnectedAt || a.last_connected_at || a.updated_at || a.created_at || 0).getTime();
          const tB = new Date(b.lastConnectedAt || b.last_connected_at || b.updated_at || b.created_at || 0).getTime();
          return tB - tA;
        });

        // 💡 동일 기기 모델명 중복 제거 (가장 최근에 통신한 레코드 1대만 보존)
        const uniqueDevices: any[] = [];
        const seenLabels = new Set<string>();
        for (const dev of agentDevices) {
          const key = (dev.label || dev.deviceModel || "").trim().toLowerCase();
          if (key && !seenLabels.has(key)) {
            seenLabels.add(key);
            uniqueDevices.push(dev);
          } else if (!key) {
            uniqueDevices.push(dev);
          }
        }

        setDevices(uniqueDevices);
        setDevice(uniqueDevices[0] || null);
      }
    } catch (err: any) {
      console.error("Fetch device error:", err);
    } finally {
      setLoadingDevice(false);
    }
  }, []);

  const [deletingDeviceId, setDeletingDeviceId] = useState<string | number | null>(null);

  // 기기 연동 해제 및 삭제
  const handleUnlinkDevice = async (devId: string | number, devLabel: string) => {
    if (!window.confirm(`'${devLabel || "선택한 스마트폰"}' 기기의 연동을 해제하시겠습니까?\n해제 후 다시 사용하시려면 QR 코드를 새로 스캔해야 합니다.`)) {
      return;
    }
    setDeletingDeviceId(devId);
    try {
      const res = await apiFetch(`/api/user/devices?id=${devId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        showToast("success", "기기 연동이 성공적으로 해제되었습니다.");
        await fetchDeviceStatus();
      } else {
        showToast("error", data.error || "기기 연동 해제에 실패했습니다.");
      }
    } catch (e: any) {
      showToast("error", "오류가 발생했습니다: " + e.message);
    } finally {
      setDeletingDeviceId(null);
    }
  };

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
      // 페이지 진입 즉시 페어링 정보(QR/핀코드) 및 기기 상태 병렬 로드 (스피너 지연 방지)
      fetchPairingInfo();
      fetchDeviceStatus();
      fetchDepositLogs();

      // 관리자 권한 백그라운드 확인
      apiFetch("/api/admin/check")
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.isAdmin) {
            setIsAdmin(true);
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
          depositor: "테스트입금",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult(data);
        showToast("success", "가상 입금 테스트가 성공적으로 전송되었습니다!");
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

  // 핀코드 복사 (즉시 폴백 보장)
  const activePinCode = pairingData?.pinCode || "SB-777777";
  const handleCopyPin = () => {
    navigator.clipboard.writeText(activePinCode);
    setCopiedPin(true);
    setTimeout(() => setCopiedPin(false), 2000);
    showToast("success", `6자리 핀코드(${activePinCode})가 클립보드에 복사되었습니다.`);
  };

  // APK 다운로드 절대 주소 계산 (터널 및 상용 도메인 자동 적응)
  const getDownloadUrl = () => {
    if (typeof window === "undefined") return "https://sheetbot.cloud/downloads/sheetbot-deposit-agent.apk";
    const pathname = window.location.pathname;
    const basePath = pathname.replace(/\/dashboard\/deposit-agent.*$/, "");
    return `${window.location.origin}${basePath}/downloads/sheetbot-deposit-agent.apk`;
  };

  // APK 다운로드 링크 클립보드 복사
  const handleCopyDownloadUrl = async () => {
    try {
      const url = getDownloadUrl();
      await navigator.clipboard.writeText(url);
      setCopiedDownloadUrl(true);
      setTimeout(() => setCopiedDownloadUrl(false), 2000);
      showToast("success", "APK 다운로드 주소가 복사되었습니다. 스마트폰 카카오톡이나 메시지로 전송하세요.");
    } catch {
      showToast("error", "다운로드 주소 복사에 실패했습니다.");
    }
  };

  // APK 다운로드 링크 공유하기 (Web Share API 지원)
  const handleShareDownloadUrl = async () => {
    const url = getDownloadUrl();
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "SheetBot 무통장 입금 자동확인기 APK",
          text: "스마트폰에 SheetBot 입금확인기 앱을 설치하세요.",
          url,
        });
        return;
      } catch {
        // 취소 시 무시
      }
    } else {
      handleCopyDownloadUrl();
    }
  };

  const userEmail = session?.user?.email || "chachogreat@gmail.com";
  const defaultQrPayload = JSON.stringify({
    app: "SheetBotDepositAgent",
    version: "1.0",
    userEmail,
    pinCode: "SB-777777",
    webhookUrl: "https://sheetbot.cloud/api/wallet/bank-webhook",
    fallbackWebhookUrl: "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/SheetBot/api/wallet/bank-webhook",
    heartbeatUrl: "https://sheetbot.cloud/api/wallet/agent/heartbeat",
    fallbackHeartbeatUrl: "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/SheetBot/api/wallet/agent/heartbeat",
  });

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=8&data=${encodeURIComponent(
    pairingData?.qrData || defaultQrPayload
  )}`;

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-800">
      <Navbar />

      {/* 토스트 알림 */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-xl border text-xs font-bold flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-3 ${
            toast.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-rose-50 border-rose-200 text-rose-900"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* 상단 브레드크럼 및 헤더 */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-2.5">
            <Link href="/dashboard/admin" className="hover:text-rose-600 transition-colors flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-rose-600" />
              <span>관리자 센터</span>
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-800 font-bold">무통장 입금 자동확인기</span>
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 shrink-0">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
                  무통장 입금 자동확인기 시트봇 에이전트 M
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold border border-indigo-200/80">
                    전용 앱 v1.4.0
                  </span>
                </h1>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  스마트폰(1대 또는 이중화용 복수 기기)에 시트봇 에이전트 M 앱을 설치하고 화면의 QR만 비추면, 회원 입금 시 은행 알림 문자를 24시간 실시간 감지하여 0초 만에 토큰을 자동 충전합니다.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start md:self-auto">
              <button
                onClick={() => {
                  fetchPairingInfo();
                  fetchDeviceStatus();
                  fetchDepositLogs();
                  showToast("success", "실시간 상태를 동기화했습니다.");
                }}
                className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-all cursor-pointer hover:border-slate-300"
              >
                <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                새로고침
              </button>
            </div>
          </div>
        </div>

        {/* 1단계: 사용자 온보딩 흐름에 맞춘 상단 3단 위젯 카드 (1.설치 -> 2.연결 -> 3.상태&테스트) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8 items-stretch">
          {/* [Step 1] 카드: 스마트폰에 SheetBot Agent M 앱 설치 */}
          <div className="bg-white rounded-2xl border border-indigo-200/90 p-5 shadow-xs flex flex-col justify-between hover:border-indigo-300 transition-all relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-28 h-28 bg-indigo-50 rounded-full blur-2xl pointer-events-none"></div>

            <div>
              <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-indigo-600 text-white flex items-center justify-center text-[11px] font-black shrink-0 shadow-xs">
                    1
                  </span>
                  <h3 className="text-sm font-black text-slate-900 tracking-tight">
                    스마트폰에 시트봇 에이전트 M 설치
                  </h3>
                </div>
                <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full font-bold border border-indigo-100 shrink-0">
                  1분 소요
                </span>
              </div>

              <div className="space-y-3 mb-4">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[11px] font-black shrink-0 mt-0.5 shadow-2xs">
                    1
                  </div>
                  <div>
                    <div className="text-xs font-extrabold text-slate-800">APK 다운로드 및 설치 허용</div>
                    <div className="text-[11px] text-slate-500 leading-snug mt-0.5">
                      하단 버튼을 눌러 APK를 다운로드하고 스마트폰 설치를 승인합니다.
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[11px] font-black shrink-0 mt-0.5 shadow-2xs">
                    2
                  </div>
                  <div>
                    <div className="text-xs font-extrabold text-slate-800">SMS 읽기 권한 허용</div>
                    <div className="text-[11px] text-slate-500 leading-snug mt-0.5">
                      앱 실행 시 화면에 나타나는 은행 SMS 읽기 권한을 허용합니다.
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[11px] font-black shrink-0 mt-0.5 shadow-2xs">
                    3
                  </div>
                  <div>
                    <div className="text-xs font-extrabold text-slate-800">배터리 최적화 해제</div>
                    <div className="text-[11px] text-slate-500 leading-snug mt-0.5">
                      24시간 무중단 자동 감지를 위해 &apos;배터리 제한 없음&apos;을 설정합니다.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
              <a
                href="/downloads/sheetbot-deposit-agent.apk"
                download
                className="w-full h-11 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-black rounded-xl shadow-sm shadow-indigo-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                스마트폰에 APK 직접 다운로드
              </a>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCopyDownloadUrl}
                  className="flex-1 h-9 bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-[11px] font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-slate-200"
                  title="다운로드 웹 주소를 클립보드에 복사합니다"
                >
                  {copiedDownloadUrl ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700 font-extrabold">주소 복사됨!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>다운로드 주소 복사</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleShareDownloadUrl}
                  className="h-9 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-indigo-200"
                  title="카카오톡, 문자 등으로 다운로드 링크 공유하기"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>공유</span>
                </button>
              </div>
            </div>
          </div>

          {/* [Step 2] 카드: QR 스캔으로 관리자 계정 연결 */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-all">
            <div>
              <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-indigo-600 text-white flex items-center justify-center text-[11px] font-black shrink-0 shadow-xs">
                    2
                  </span>
                  <h3 className="text-sm font-black text-slate-900 tracking-tight">
                    QR 스캔으로 계정 연결
                  </h3>
                </div>
                <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100 shrink-0">
                  0초 페어링
                </span>
              </div>

              <div className="flex flex-col items-center justify-center py-1">
                <div className="p-2 bg-white border border-slate-200 rounded-2xl shadow-inner">
                  {qrImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={qrImageUrl}
                      alt="SheetBot Pairing QR"
                      className="w-[144px] h-[144px] rounded-lg object-contain"
                    />
                  ) : (
                    <div className="w-[144px] h-[144px] flex items-center justify-center text-xs text-slate-400">
                      <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
                    </div>
                  )}
                </div>
                <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100/90 text-slate-600 rounded-full text-[11px] font-medium">
                  <span><b>시트봇 에이전트 M</b> 앱 실행 후 <b>[QR 스캔]</b>으로 화면을 비추세요</span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100">
              <div className="bg-slate-50/80 px-3.5 h-11 rounded-xl border border-slate-100 flex items-center justify-between">
                <div className="text-left flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 font-semibold whitespace-nowrap">수동 핀코드</span>
                  <span className="text-sm font-black font-mono text-indigo-600 tracking-wider">
                    {activePinCode}
                  </span>
                </div>
                <button
                  onClick={handleCopyPin}
                  className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-lg shadow-xs flex items-center gap-1 transition-all cursor-pointer"
                >
                  {copiedPin ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedPin ? "복사됨" : "복사"}
                </button>
              </div>
            </div>
          </div>

          {/* [Step 3] 카드: 실시간 감지 상태 및 작동 테스트 */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-all">
            <div>
              <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-indigo-600 text-white flex items-center justify-center text-[11px] font-black shrink-0 shadow-xs">
                    3
                  </span>
                  <h3 className="text-sm font-black text-slate-900 tracking-tight">
                    실시간 감지 상태 {devices.length > 0 && `(${devices.length}대)`}
                  </h3>
                </div>
                {devices.some((d) => d.status === "CONNECTED" || d.status === "ACTIVE") ? (
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0"
                    title="등록된 스마트폰이 실시간으로 입금 SMS를 감지하고 있습니다."
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    {devices.filter((d) => d.status === "CONNECTED" || d.status === "ACTIVE").length >= 2
                      ? `🟢 ${devices.filter((d) => d.status === "CONNECTED" || d.status === "ACTIVE").length}대 이중화 감지 중`
                      : "24H 감지 중"}
                  </span>
                ) : devices.length > 0 ? (
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-rose-50 text-rose-700 border border-rose-200 shrink-0"
                    title="스마트폰 앱이 꺼졌거나 배터리 절전 상태입니다. 앱을 실행해 주세요."
                  >
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    연결 두절 (앱 확인 필요)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    기기 연동 대기
                  </span>
                )}
              </div>

              {/* 연동된 모든 스마트폰 기기 목록 */}
              {devices.length === 0 ? (
                <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-100 text-center py-6 text-xs text-slate-400 mb-4">
                  아직 연동된 스마트폰이 없습니다.
                </div>
              ) : (
                <div className="space-y-2 mb-3 max-h-[175px] overflow-y-auto pr-1">
                  {devices.map((d: any, idx: number) => {
                    const isLive = d.status === "CONNECTED" || d.status === "ACTIVE";
                    const isDisconnected = d.status === "DISCONNECTED";
                    const lastSignal = d.lastConnectedAt || d.last_connected_at;
                    return (
                      <div
                        key={d.id || idx}
                        className={`p-2.5 rounded-xl border transition-all ${
                          isLive
                            ? "bg-emerald-50/35 border-emerald-200/90 shadow-2xs"
                            : isDisconnected
                            ? "bg-slate-50/70 border-slate-200/80 opacity-70"
                            : "bg-rose-50/40 border-rose-200/80 opacity-75"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                isLive
                                  ? "bg-emerald-500 animate-pulse"
                                  : isDisconnected
                                  ? "bg-slate-400"
                                  : "bg-rose-400"
                              }`}
                            />
                            <span className="text-xs font-black text-slate-800 truncate" title={d.label}>
                              {d.label || `스마트폰 #${idx + 1}`}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-md border ${
                                isLive
                                  ? "bg-emerald-100 text-emerald-800 border-emerald-300/80"
                                  : isDisconnected
                                  ? "bg-slate-100 text-slate-600 border-slate-300"
                                  : "bg-rose-100 text-rose-700 border-rose-200"
                              }`}
                            >
                              {isLive ? "정상 감지" : isDisconnected ? "연결 해제됨" : "통신 지연"}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUnlinkDevice(d.id, d.label)}
                              disabled={deletingDeviceId === d.id}
                              title="기기 연동 해제"
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400">배터리</span>
                            {(() => {
                              const bVal = d.battery_level !== undefined && d.battery_level !== null
                                ? Number(d.battery_level)
                                : d.battery !== undefined && d.battery !== null
                                ? Number(d.battery)
                                : null;
                              const isCharging = !!(d.is_charging || d.isCharging);
                              if (bVal === null) return <span className="text-slate-400 text-[10px]">-</span>;
                              return (
                                <span className={`font-mono font-bold inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] border ${
                                  bVal <= 20
                                    ? "bg-rose-50 text-rose-700 border-rose-200"
                                    : bVal <= 50
                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                }`}>
                                  {isCharging ? <span className="text-amber-500 font-black text-[11px]">⚡</span> : null}
                                  {bVal}%
                                </span>
                              );
                            })()}
                          </div>
                          <span className="font-mono font-bold text-slate-700">
                            {lastSignal ? formatDateTime(lastSignal) : "연결 대기 중"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="px-3 py-2 bg-slate-50/80 rounded-xl border border-slate-100 flex items-center justify-between text-[11px] mb-4">
                <span className="text-slate-500 font-medium">자동 감지 대상</span>
                <span className="font-extrabold text-indigo-600">국내 전 금융사 (시중·인터넷·우체국)</span>
              </div>
            </div>

            <div className="space-y-2 pt-3 border-t border-slate-100">
              <button
                onClick={handleTestSms}
                disabled={testingSms}
                className="w-full h-11 bg-indigo-50 hover:bg-indigo-100/80 text-indigo-700 border border-indigo-200/90 text-xs font-extrabold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
              >
                <Zap className="w-3.5 h-3.5 text-indigo-600 fill-indigo-600" />
                {testingSms ? "가상 입금 테스트 전송 중..." : "🧪 가상 입금 테스트 (5,000원 모의 감지)"}
              </button>
              {testResult && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200/80 rounded-xl text-[11px] text-emerald-800 font-medium flex items-center gap-1.5 animate-in fade-in">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span><b>가상 입금 완료:</b> 웹훅 수신 및 대장 등록 성공</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 💡 2대 이상 다중 기기 무중단 이중화(Fail-over) 안내 배너 */}
        <div className="mb-8 p-4 bg-gradient-to-r from-indigo-50/90 via-slate-50 to-emerald-50/70 rounded-2xl border border-indigo-100/90 shadow-xs flex items-start gap-3.5">
          <div className="p-2 rounded-xl bg-indigo-100/80 text-indigo-700 shrink-0 mt-0.5">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
              <h3 className="text-xs font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>💡 2대 이상의 스마트폰으로 24시간 무중단 이중화(Fail-over) 운영이 가능합니다</span>
                <span className="text-[10px] px-2 py-0.2 rounded-full bg-emerald-100 text-emerald-800 font-extrabold border border-emerald-200">
                  중복 충전 100% 자동 방지
                </span>
              </h3>
            </div>
            <p className="text-[11.5px] text-slate-600 leading-relaxed break-keep">
              동일한 은행 입금 알림 문자를 수신하는 업무용 스마트폰이 여러 대라면, 모든 기기에 <b>시트봇 에이전트 M</b>을 설치하고 위 <b>[2번 QR코드]</b>를 각각 스캔해 두세요. 어느 한 기기의 배터리가 방전되거나 전원이 꺼져도 다른 기기가 즉시 감지하여 365일 24시간 결제 누락을 원천 차단합니다.
            </p>
          </div>
        </div>

        {/* 2단계: 실시간 입금 감지 대장 (Empty State 고도화) */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
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
              className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors rounded-lg hover:bg-slate-100 cursor-pointer"
              title="새로고침"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-extrabold">
                <tr>
                  <th className="py-3.5 px-4">입금 번호 / 식별코드</th>
                  <th className="py-3.5 px-4">입금자명</th>
                  <th className="py-3.5 px-4 text-right">입금 금액</th>
                  <th className="py-3.5 px-4 text-right">적립 토큰</th>
                  <th className="py-3.5 px-4 text-center">처리 상태</th>
                  <th className="py-3.5 px-4">감지 및 완료 일시</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {loadingLogs ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-300" />
                      입금 감지 내역을 불러오는 중...
                    </td>
                  </tr>
                ) : depositLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center">
                      <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                          <Inbox className="w-6 h-6" />
                        </div>
                        <div className="text-sm font-bold text-slate-800">아직 감지된 무통장 입금 내역이 없습니다</div>
                        <p className="text-xs text-slate-400 mt-1.5 leading-relaxed break-keep">
                          회원이 무통장 입금하거나 상단의 <b>[가상 입금 테스트]</b> 버튼을 누르면 실시간으로 이곳에 자동 기록됩니다.
                        </p>
                      </div>
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
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            충전 완료
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-600" />
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
      </main>
    </div>
  );
}
