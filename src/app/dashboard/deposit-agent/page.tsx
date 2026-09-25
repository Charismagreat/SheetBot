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
  ChevronLeft,
  Search,
  X,
  Inbox,
  Radio,
  ArrowRight,
  Share2,
  Trash2,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import { apiFetch, getEgdeskBasePath } from "@/lib/api";
import { onUserDataChanged, queryTable } from "@/lib/egdesk-helpers";

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

  // 최근 입금 대장 상태 및 Phase 4 스마트 예외 필터
  const [depositLogs, setDepositLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [selectedTab, setSelectedTab] = useState<"ALL" | "COMPLETED" | "HOLD" | "DELAYED">("ALL");
  const [processingId, setProcessingId] = useState<string | number | null>(null);
  const [isRealtimeLive, setIsRealtimeLive] = useState(false);

  // 🔍 입금 대장 실시간 검색 및 페이지네이션 상태
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Phase 4: 관리자 수동 승인 및 취소 핸들러
  const handleApproveDeposit = async (reqId: string | number, actualAmount?: number) => {
    if (!window.confirm("해당 건의 입금을 수동 승인하여 회원 토큰을 즉시 지급하시겠습니까?")) return;
    setProcessingId(reqId);
    try {
      const res = await apiFetch("/api/wallet/direct-deposit/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reqId, action: "APPROVE", customAmount: actualAmount }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", data.message || "토큰이 성공적으로 지급되었습니다.");
        await fetchDepositLogs();
      } else {
        showToast("error", data.error || "승인 처리에 실패했습니다.");
      }
    } catch (e: any) {
      showToast("error", "오류 발생: " + e.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectDeposit = async (reqId: string | number) => {
    const reason = window.prompt("입금 취소/환불 사유를 입력해 주세요:", "고객 요청에 의한 입금 취소 및 반환 완료");
    if (reason === null) return;
    setProcessingId(reqId);
    try {
      const res = await apiFetch("/api/wallet/direct-deposit/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reqId, action: "REJECT", reason }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", "입금건이 취소 처리되었습니다.");
        await fetchDepositLogs();
      } else {
        showToast("error", data.error || "취소 처리에 실패했습니다.");
      }
    } catch (e: any) {
      showToast("error", "오류 발생: " + e.message);
    } finally {
      setProcessingId(null);
    }
  };

  // 가상 테스트 상태
  const [testingSms, setTestingSms] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  // 알림 토스트
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // 1. 페어링 정보(QR & 핀코드) 클라이언트 즉시 생성 (서버 왕복 지연 0초)
  const fetchPairingInfo = useCallback(async () => {
    setLoadingPairing(true);
    try {
      const email = session?.user?.email || "chachogreat@gmail.com";
      const cleanEmail = email.toLowerCase().trim();
      const todayStr = new Date().toISOString().slice(0, 10);
      let token = "sb_dep_" + Math.random().toString(36).substring(2, 10);
      let pinNum = 777777;

      if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
        try {
          const enc = new TextEncoder();
          const keyData = enc.encode("sheetbot-agent-secret-key-2026");
          const msgData = enc.encode(`${cleanEmail}-${todayStr}`);
          const cryptoKey = await window.crypto.subtle.importKey(
            "raw",
            keyData,
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"]
          );
          const signature = await window.crypto.subtle.sign("HMAC", cryptoKey, msgData);
          const hashArray = Array.from(new Uint8Array(signature));
          token = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
          const pinSum = hashArray.slice(0, 4).reduce((acc, b) => (acc << 8) + b, 0);
          pinNum = (Math.abs(pinSum) % 900000) + 100000;
        } catch {
          pinNum = 777777;
        }
      }

      const pinCode = `SB-${pinNum}`;
      const qrPayload = {
        app: "SheetBotDepositAgent",
        version: "1.0",
        userEmail: cleanEmail,
        token,
        pinCode,
        webhookUrl: "https://sheetbot.cloud/api/wallet/bank-webhook",
        fallbackWebhookUrl: "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/SheetBot/api/wallet/bank-webhook",
        heartbeatUrl: "https://sheetbot.cloud/api/wallet/agent/heartbeat",
        fallbackHeartbeatUrl: "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/SheetBot/api/wallet/agent/heartbeat",
        createdAt: new Date().toISOString(),
      };

      setPairingData({
        success: true,
        userEmail: cleanEmail,
        token,
        pinCode,
        qrData: JSON.stringify(qrPayload),
        webhookUrl: qrPayload.webhookUrl,
        fallbackWebhookUrl: qrPayload.fallbackWebhookUrl,
      });
    } catch (err: any) {
      console.error("Fetch pairing error:", err);
    } finally {
      setLoadingPairing(false);
    }
  }, [session?.user?.email]);

  // 2. 등록된 에이전트 기기 상태 로드 (이지데스크 queryTable 직통 조회)
  const fetchDeviceStatus = useCallback(async (silent = false) => {
    if (!silent) setLoadingDevice(true);
    try {
      const res = await queryTable<any>("sheetbot_user_devices", {
        limit: 50,
        orderBy: "id",
        orderDirection: "DESC",
      }).catch(() => ({ rows: [] }));

      const rawRows = (res.rows || []).filter((r: any) => !r.deleted_at);
      const agentDevices = rawRows.filter(
        (r: any) => r.pairing_mode === "android_agent" || r.pairingMode === "android_agent"
      );

      agentDevices.sort((a: any, b: any) => {
        const tA = new Date(a.last_connected_at || a.lastConnectedAt || a.updated_at || a.created_at || 0).getTime();
        const tB = new Date(b.last_connected_at || b.lastConnectedAt || b.updated_at || b.created_at || 0).getTime();
        return tB - tA;
      });

      const uniqueDevices: any[] = [];
      const seenLabels = new Set<string>();
      for (const dev of agentDevices) {
        const key = (dev.label || dev.device_id || "").trim().toLowerCase();
        if (key && !seenLabels.has(key)) {
          seenLabels.add(key);
          uniqueDevices.push(dev);
        } else if (!key) {
          uniqueDevices.push(dev);
        }
      }

      setDevices(uniqueDevices);
      setDevice(uniqueDevices[0] || null);
    } catch (err: any) {
      console.error("Fetch device error:", err);
    } finally {
      if (!silent) setLoadingDevice(false);
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

  // 3. 최근 입금 대장 조회 (이지데스크 queryTable 직통 조회)
  const fetchDepositLogs = useCallback(async (silent = false) => {
    if (!silent) setLoadingLogs(true);
    try {
      const res = await queryTable<any>("sheetbot_deposit_requests", {
        limit: 50,
        orderBy: "id",
        orderDirection: "DESC",
      }).catch(() => ({ rows: [] }));

      const validRows = (res.rows || []).filter((r: any) => !r.deleted_at);
      setDepositLogs(validRows);
    } catch (err: any) {
      console.error("Fetch logs error:", err);
    } finally {
      if (!silent) setLoadingLogs(false);
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

      // ⚡ [0초 실시간 감시] 이지데스크 공식 onUserDataChanged 연동 (입금 요청 및 에이전트 기기 실시간 감시)
      const unsub = onUserDataChanged((event) => {
        setIsRealtimeLive(true);
        if (!event.tableName || event.tableName === "sheetbot_deposit_requests") {
          fetchDepositLogs(true);
        }
        if (!event.tableName || event.tableName === "sheetbot_user_devices") {
          fetchDeviceStatus(true);
        }
      });

      setIsRealtimeLive(true);

      return () => {
        unsub();
      };
    }
  }, [status, session, router, fetchPairingInfo, fetchDeviceStatus, fetchDepositLogs]);

  // 🔍 [검색 & 탭 필터링] 메모이제이션
  const filteredLogs = React.useMemo(() => {
    return depositLogs.filter((log) => {
      // 1) 상태 탭 필터
      if (selectedTab === "COMPLETED" && log.status !== "COMPLETED" && log.status !== "APPROVED") return false;
      if (selectedTab === "HOLD" && log.status !== "ON_HOLD" && log.status !== "COLLISION_HOLD") return false;
      if (selectedTab === "DELAYED" && log.status !== "DELAYED_MATCH") return false;

      // 2) 검색어 필터
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const depositor = String(log.depositor_name || log.user_name || log.userName || "").toLowerCase();
        const email = String(log.user_email || log.userEmail || "").toLowerCase();
        const code = String(log.deposit_code || log.depositCode || "").toLowerCase();
        const idStr = String(log.id || "");
        const amtStr = String(log.amount_krw || log.amountKrw || "");
        const tokensStr = String(log.tokens_to_credit || log.tokensToCredit || "");

        const matches =
          depositor.includes(q) ||
          email.includes(q) ||
          code.includes(q) ||
          idStr.includes(q) ||
          `#${idStr}`.includes(q) ||
          amtStr.includes(q) ||
          tokensStr.includes(q);

        if (!matches) return false;
      }

      return true;
    });
  }, [depositLogs, selectedTab, searchQuery]);

  // 📄 [페이지네이션] 계산
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / itemsPerPage));
  const paginatedLogs = React.useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredLogs, currentPage, itemsPerPage]);

  // 탭 또는 검색어 변경 시 1페이지로 자동 리셋
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedTab, searchQuery]);

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
          title: "SheetBot Agent M (관리자용 무통장 입금 감지 APK)",
          text: "스마트폰에 SheetBot Agent M 앱을 설치하세요.",
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
            <span className="text-slate-800 font-bold">SheetBot Agent M</span>
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 shrink-0">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
                  시트봇 에이전트 M (SheetBot Agent M)
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold border border-indigo-200/80">
                    전용 앱 v1.4.0
                  </span>
                </h1>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  24시간 스마트폰 실시간 무통장 입금 감지 및 전역 토큰 지갑 자동 충전 시스템
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start md:self-auto">
              {/* 실시간 DB 왓처 동기화 뱃지 (클릭 시 수동 즉시 동기화 통합) */}
              <button
                type="button"
                onClick={() => {
                  setIsRealtimeLive(true);
                  fetchDeviceStatus(true);
                  fetchDepositLogs(true);
                  showToast("success", "⚡ 실시간 감시 상태를 최신으로 동기화했습니다.");
                }}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer group shadow-2xs ${
                  isRealtimeLive
                    ? "bg-slate-50 text-emerald-800 border-slate-200 hover:bg-slate-100"
                    : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
                }`}
                title="실시간 0초 감시 중 (클릭 시 즉시 수동 동기화)"
              >
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isRealtimeLive ? "bg-emerald-500 animate-pulse ring-4 ring-emerald-500/20" : "bg-slate-400"}`} />
                <span className={isRealtimeLive ? "text-emerald-700 font-extrabold" : "text-slate-500"}>
                  {isRealtimeLive ? "⚡ DB 왓처 실시간 동기화" : "스트림 연결 중..."}
                </span>
                <RefreshCw className="w-3 h-3 text-slate-400 group-hover:text-emerald-600 transition-colors shrink-0" />
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
                  <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[10px] font-black shrink-0 shadow-xs tracking-wider">
                    STEP 1
                  </span>
                  <h3 className="text-sm font-black text-slate-900 tracking-tight">
                    스마트폰에 전용 앱 설치
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
                  <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[10px] font-black shrink-0 shadow-xs tracking-wider">
                    STEP 2
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
                  <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[10px] font-black shrink-0 shadow-xs tracking-wider">
                    STEP 3
                  </span>
                  <h3 className="text-sm font-black text-slate-900 tracking-tight">
                    연동된 에이전트 기기 {devices.length > 0 && `(${devices.length}대)`}
                  </h3>
                </div>
                {devices.filter((d) => d.status === "CONNECTED" || d.status === "ACTIVE").length >= 2 && (
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0"
                    title="2대 이상의 기기가 무중단 이중화 감지 중입니다."
                  >
                    <span>이중화 가동 중</span>
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
                              {isLive ? "🟢 정상 가동 (24H)" : isDisconnected ? "연결 해제됨" : "통신 지연"}
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

              <div className="px-3 py-2 bg-slate-50/80 rounded-xl border border-slate-100 flex items-center justify-between text-[11px]">
                <span className="text-slate-500 font-medium">자동 감지 대상</span>
                <span className="font-extrabold text-indigo-600">국내 전 금융사 (시중·인터넷·우체국)</span>
              </div>
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

        {/* 2단계: 실시간 입금 감지 대장 (Empty State & Phase 4 스마트 예외 제어 센터) */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                실시간 무통장 입금 감지 및 토큰 적립 내역
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                스마트폰 앱이 은행 SMS/푸시를 감지하여 서버와 매칭한 실시간 안전 결제 대장입니다.
              </p>
            </div>
            <button
              onClick={() => fetchDepositLogs(false)}
              disabled={loadingLogs}
              className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors rounded-lg hover:bg-slate-100 cursor-pointer disabled:opacity-50"
              title="새로고침"
            >
              <RefreshCw className={`w-4 h-4 ${loadingLogs ? "animate-spin text-indigo-600" : ""}`} />
            </button>
          </div>

          {/* Phase 4: 스마트 예외 대장 탭 필터 바 */}
          {(() => {
            const holdCount = depositLogs.filter((l) => l.status === "ON_HOLD" || l.status === "COLLISION_HOLD").length;
            const delayedCount = depositLogs.filter((l) => l.status === "DELAYED_MATCH").length;
            const completedCount = depositLogs.filter((l) => l.status === "COMPLETED" || l.status === "APPROVED").length;

            return (
              <div className="px-5 py-2.5 bg-slate-50/70 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                {/* 탭 버튼들 */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
                  <button
                    type="button"
                    onClick={() => setSelectedTab("ALL")}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
                      selectedTab === "ALL"
                        ? "bg-slate-900 text-white shadow-xs"
                        : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                    }`}
                  >
                    전체 ({depositLogs.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTab("COMPLETED")}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                      selectedTab === "COMPLETED"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>정상 충전 ({completedCount})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTab("HOLD")}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                      selectedTab === "HOLD"
                        ? "bg-amber-600 text-white shadow-xs"
                        : holdCount > 0
                        ? "bg-amber-50 text-amber-800 border border-amber-300 font-extrabold animate-pulse"
                        : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    <span>⚠️ 금액불일치/보류 ({holdCount})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTab("DELAYED")}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                      selectedTab === "DELAYED"
                        ? "bg-purple-600 text-white shadow-xs"
                        : delayedCount > 0
                        ? "bg-purple-50 text-purple-800 border border-purple-300 font-extrabold"
                        : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5 text-purple-500" />
                    <span>⏰ 지연 입금 ({delayedCount})</span>
                  </button>
                </div>

                {/* 🔍 실시간 검색 입력창 */}
                <div className="relative flex items-center w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="입금자명, 계정, 코드, 금액 검색..."
                    className="w-full h-8 pl-8 pr-7 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-2xs"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 p-0.5 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                      title="검색어 지우기"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 입금 대장 테이블 */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-extrabold">
                <tr>
                  <th className="py-3.5 px-4">입금 번호 / 식별코드</th>
                  <th className="py-3.5 px-4">입금자명 / 계정</th>
                  <th className="py-3.5 px-4 text-right">신청 / 실입금액</th>
                  <th className="py-3.5 px-4 text-right">적립 토큰</th>
                  <th className="py-3.5 px-4 text-center">처리 상태</th>
                  <th className="py-3.5 px-4">감지 및 완료 일시</th>
                  <th className="py-3.5 px-4 text-center">관리 / 제어</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {loadingLogs && depositLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-300" />
                      입금 감지 내역을 불러오는 중...
                    </td>
                  </tr>
                ) : paginatedLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center">
                      <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                          <Inbox className="w-6 h-6" />
                        </div>
                        <div className="text-sm font-bold text-slate-800">
                          {searchQuery
                            ? `'${searchQuery}' 검색 조건과 일치하는 입금 내역이 없습니다.`
                            : selectedTab === "HOLD"
                            ? "현재 보류 중인 불일치 입금건이 없습니다."
                            : selectedTab === "DELAYED"
                            ? "현재 대기 중인 지연 입금건이 없습니다."
                            : "감지된 무통장 입금 내역이 없습니다."}
                        </div>
                        {searchQuery && (
                          <button
                            type="button"
                            onClick={() => setSearchQuery("")}
                            className="mt-2 text-xs text-indigo-600 font-bold hover:underline cursor-pointer"
                          >
                            검색어 초기화
                          </button>
                        )}
                        {!searchQuery && selectedTab === "ALL" && (
                          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed break-keep">
                            회원이 무통장 입금하거나 상단의 [가상 입금 테스트] 버튼을 누르면 실시간으로 이곳에 자동 기록됩니다.
                          </p>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedLogs.map((log) => {
                    const isCompleted = log.status === "COMPLETED" || log.status === "APPROVED";
                    const isHold = log.status === "ON_HOLD";
                    const isCollision = log.status === "COLLISION_HOLD";
                    const isDelayed = log.status === "DELAYED_MATCH";
                    const isPending = log.status === "PENDING";
                    const isCancelled = log.status === "CANCELLED";
                    const isExpired = log.status === "EXPIRED";

                    const requestedAmount = Number(log.amount_krw || log.amountKrw || 0);
                    const actualAmount = Number(log.actual_amount_krw || log.actualAmountKrw || requestedAmount);
                    const isActionable = isHold || isCollision || isDelayed;

                    return (
                      <tr key={log.id} className={`transition-colors ${isHold ? "bg-amber-50/30 hover:bg-amber-50/50" : isDelayed ? "bg-purple-50/30 hover:bg-purple-50/50" : "hover:bg-slate-50/80"}`}>
                        <td className="py-3.5 px-4 font-mono">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-900">#{log.id}</span>
                            {(log.deposit_code || log.depositCode) && (
                              <span
                                className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[11px] font-semibold border border-slate-200"
                                title="입금 식별코드"
                              >
                                {log.deposit_code || log.depositCode}
                              </span>
                            )}
                          </div>
                          {log.hold_reason && (
                            <div className="text-[10.5px] text-amber-700 font-sans mt-0.5 max-w-[220px] truncate" title={log.hold_reason}>
                              ⚠️ {log.hold_reason}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900">
                            {log.depositor_name || log.user_name || log.userName || log.depositorName || "입금자"}
                          </div>
                          <div className="text-[10.5px] text-slate-400 truncate max-w-[150px]" title={log.user_email || log.userEmail}>
                            {log.user_email || log.userEmail || "-"}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono">
                          <div className="font-extrabold text-slate-900">{requestedAmount.toLocaleString()}원</div>
                          {actualAmount !== requestedAmount && actualAmount > 0 && (
                            <div className="text-[10.5px] font-bold text-rose-600">
                              실입금: {actualAmount.toLocaleString()}원
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right font-black text-indigo-600 font-mono">
                          +{Number(log.tokens_to_credit || log.tokensToCredit || 0).toLocaleString()} T
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {isCompleted ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              충전 완료
                            </span>
                          ) : isHold ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-50 text-amber-700 border border-amber-300">
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                              금액 불일치 보류
                            </span>
                          ) : isCollision ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-orange-50 text-orange-700 border border-orange-300">
                              <AlertTriangle className="w-3 h-3 text-orange-600" />
                              동명이인 충돌 보류
                            </span>
                          ) : isDelayed ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-purple-50 text-purple-700 border border-purple-300">
                              <Clock className="w-3 h-3 text-purple-600" />
                              지연 입금 구제 대기
                            </span>
                          ) : isPending ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-sky-50 text-sky-700 border border-sky-200">
                              <Clock className="w-3 h-3 text-sky-600" />
                              입금 대기
                            </span>
                          ) : isCancelled ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-slate-100 text-slate-500 border border-slate-200">
                              취소 / 환불됨
                            </span>
                          ) : isExpired ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-slate-100 text-slate-400 border border-slate-200">
                              기한 만료
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-slate-100 text-slate-600 border border-slate-200">
                              {log.status}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-500">
                          {formatDateTime(log.completed_at || log.created_at)}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {isActionable ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                disabled={processingId === log.id}
                                onClick={() => handleApproveDeposit(log.id, actualAmount > 0 ? actualAmount : requestedAmount)}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-extrabold rounded-lg shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
                                title="실입금액에 맞춰 토큰을 즉시 승인 지급합니다"
                              >
                                {processingId === log.id ? "처리 중..." : "⚡ 승인"}
                              </button>
                              <button
                                type="button"
                                disabled={processingId === log.id}
                                onClick={() => handleRejectDeposit(log.id)}
                                className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold rounded-lg transition-all disabled:opacity-50 cursor-pointer"
                                title="입금 취소 및 환불 처리"
                              >
                                취소
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* 📄 하단 페이지네이션 바 */}
          {filteredLogs.length > 0 && (
            <div className="px-5 py-3 bg-slate-50/70 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="text-slate-500 font-medium">
                총 <b className="text-slate-900">{filteredLogs.length}</b>건 중{" "}
                <b className="text-indigo-600">
                  {Math.min(filteredLogs.length, (currentPage - 1) * itemsPerPage + 1)}-
                  {Math.min(filteredLogs.length, currentPage * itemsPerPage)}
                </b>건 표시 (페이지 <b>{currentPage}</b> / {totalPages})
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer font-bold flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>이전</span>
                </button>

                {/* 페이지 번호 버튼들 */}
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((page) => {
                      return (
                        page === 1 ||
                        page === totalPages ||
                        Math.abs(page - currentPage) <= 1
                      );
                    })
                    .map((page, idx, arr) => {
                      const prevPage = arr[idx - 1];
                      const showEllipsis = prevPage && page - prevPage > 1;

                      return (
                        <React.Fragment key={page}>
                          {showEllipsis && <span className="px-1 text-slate-400">...</span>}
                          <button
                            type="button"
                            onClick={() => setCurrentPage(page)}
                            className={`w-7 h-7 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                              currentPage === page
                                ? "bg-indigo-600 text-white shadow-xs"
                                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                            }`}
                          >
                            {page}
                          </button>
                        </React.Fragment>
                      );
                    })}
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer font-bold flex items-center gap-1"
                >
                  <span>다음</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
