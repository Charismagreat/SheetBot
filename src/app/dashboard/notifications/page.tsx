"use client";

import { apiFetch, getEgdeskBasePath } from '@/lib/api';
import { queryTable, onUserDataChanged } from '@/lib/egdesk-helpers';
import React, { useState, useEffect, useCallback, useRef } from "react";

function mapNotificationDevice(d: any) {
  const rawLast = d.last_connected_at || d.updated_at || d.created_at;
  let computedStatus: "CONNECTED" | "DISCONNECTED" = "DISCONNECTED";
  if (d.status === "DISCONNECTED") {
    computedStatus = "DISCONNECTED";
  } else if (rawLast) {
    const norm = rawLast.includes("T") ? rawLast : rawLast.replace(" ", "T") + (rawLast.endsWith("Z") ? "" : "Z");
    const lastTime = new Date(norm).getTime();
    const secondsAgo = isNaN(lastTime) ? 999999 : Math.floor((Date.now() - lastTime) / 1000);
    computedStatus = secondsAgo <= 1800 ? "CONNECTED" : "DISCONNECTED";
  }

  const batteryVal = d.battery_level ?? null;
  const isChargingVal = d.is_charging === 1;

  return {
    id: d.id,
    deviceId: d.device_id || d.id,
    label: d.label || "시트봇 에이전트 폰",
    phoneNumber: d.phone_number || "",
    pairingMode: "agent2",
    status: computedStatus,
    battery: batteryVal,
    battery_level: batteryVal,
    isCharging: isChargingVal,
    is_charging: isChargingVal ? 1 : 0,
    networkType: d.network_type || "Wi-Fi",
    lastConnectedAt: rawLast,
    last_connected_at: rawLast,
    createdAt: d.created_at,
  };
}
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import {
  Smartphone,
  Sparkles,
  Zap,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Plus,
  Trash2,
  Send,
  QrCode,
  Globe,
  Battery,
  Wifi,
  ExternalLink,
  Copy,
  Check,
  ToggleLeft,
  ToggleRight,
  HelpCircle,
  FileText,
  ShieldCheck,
  Radio,
  ArrowRight,
  Download,
  Share2
} from "lucide-react";
import Navbar from "@/components/Navbar";
import dynamic from "next/dynamic";

const NotificationsRulesTab = dynamic(
  () => import("@/components/notifications/NotificationsRulesTab"),
  { ssr: false }
);
const NotificationsLogsTab = dynamic(
  () => import("@/components/notifications/NotificationsLogsTab"),
  { ssr: false }
);
const NotificationsGuideTab = dynamic(
  () => import("@/components/notifications/NotificationsGuideTab"),
  { ssr: false }
);

export default function NotificationsPage() {
  const { data: session, status } = useSession();
  const { user, isLoggedIn, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();

  const effectiveEmail =
    user?.email ||
    session?.user?.email ||
    (typeof window !== "undefined" ? localStorage.getItem("sheetbot_user_email") || "" : "");

  const [activeTab, setActiveTab] = useState<"devices" | "rules" | "logs" | "guide">("devices");

  // 디바이스 상태 (시트봇 에이전트 전용)
  const [devices, setDevices] = useState<any[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [hasInitialLoaded, setHasInitialLoaded] = useState(false);
  const [isAddDeviceOpen, setIsAddDeviceOpen] = useState(false);
  const [agent2PairData, setAgent2PairData] = useState<any>(null);
  const [loadingAgent2Pair, setLoadingAgent2Pair] = useState(false);

  const agent2PairDataRef = useRef<any>(null);
  useEffect(() => {
    agent2PairDataRef.current = agent2PairData;
  }, [agent2PairData]);

  // SheetBot Agent2 페어링 정보 클라이언트 즉시 생성 (네트워크 왕복 및 지연 0초)
  const fetchAgent2Pairing = useCallback(async () => {
    const email = effectiveEmail;
    if (!email) return;
    try {
      const cleanEmail = email.toLowerCase().trim();
      const todayStr = new Date().toISOString().slice(0, 10);
      let token = "sb2_" + Math.random().toString(36).substring(2, 10);
      let pinNum = 777777;

      if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
        try {
          const enc = new TextEncoder();
          const keyData = enc.encode("sheetbot-agent2-secret-key-2026");
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
      const qrUri = `sheetbot://pair?email=${encodeURIComponent(cleanEmail)}&token=${encodeURIComponent(token)}&pin=${encodeURIComponent(pinCode)}`;

      setAgent2PairData({
        success: true,
        userEmail: cleanEmail,
        token,
        pinCode,
        qrData: qrUri,
        webhookUrl: "https://sheetbot.cloud/api/webhooks/dispatch",
        fallbackWebhookUrl: "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/SheetBot/api/webhooks/dispatch",
      });
    } catch (err: any) {
      console.warn("[Notifications] Agent2 pair generate warning:", err.message);
    } finally {
      setLoadingAgent2Pair(false);
    }
  }, [effectiveEmail]);

  // 테스트 발송 모달
  const [testModalDevice, setTestModalDevice] = useState<any>(null);
  const [testRecipient, setTestRecipient] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  // 스마트 규칙 상태
  const [rules, setRules] = useState<any[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [promptInput, setPromptInput] = useState("");
  const [creatingRule, setCreatingRule] = useState(false);

  // 발송 로그 상태
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // 알림 토스트
  const [alert, setAlert] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // 이용자용 앱(APK) 공유 및 다운로드 QR 모달 상태
  const [isApkQrModalOpen, setIsApkQrModalOpen] = useState(false);
  const [apkCopied, setApkCopied] = useState(false);

  const getApkDownloadUrl = useCallback(() => {
    return "https://github.com/Charismagreat/SheetBot/releases/download/user-v1.0.0/SheetBotAgent.apk";
  }, []);

  const handleCopyApkLink = useCallback(async () => {
    const url = getApkDownloadUrl();
    try {
      await navigator.clipboard.writeText(url);
      setApkCopied(true);
      showAlert("success", "📋 시트봇 에이전트 APK 다운로드 링크가 복사되었습니다! 카카오톡이나 메시지로 전달하세요.");
      setTimeout(() => setApkCopied(false), 3000);
    } catch {
      showAlert("error", "링크 복사에 실패했습니다. 수동으로 복사해 주세요: " + url);
    }
  }, [getApkDownloadUrl]);

  const handleShareApk = useCallback(async () => {
    const url = getApkDownloadUrl();
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({
          title: "시트봇 에이전트(SheetBot Agent) 다운로드",
          text: "구글 시트 0원 알림 문자 발송을 위한 시트봇 에이전트 전용 앱을 스마트폰에 설치하세요.",
          url: url,
        });
        return;
      } catch (err: any) {
        if (err.name !== "AbortError") {
          await handleCopyApkLink();
        }
        return;
      }
    }
    // Web Share 미지원 브라우저/PC에서는 다운로드 전용 QR 모달 오픈
    setIsApkQrModalOpen(true);
  }, [getApkDownloadUrl, handleCopyApkLink]);

  const showAlert = (type: "success" | "error", text: string) => {
    setAlert({ type, text });
    setTimeout(() => setAlert(null), 5000);
  };

  // 1. 디바이스 목록 로드 (이지데스크 queryTable 직통 조회)
  const fetchDevices = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoadingDevices(true);
    try {
      const email = effectiveEmail;
      if (!email) return;
      const res = await queryTable("sheetbot_user_devices", {
        filters: { user_email: email },
        limit: 50,
        orderBy: "id",
        orderDirection: "DESC",
      }).catch(() => ({ rows: [] }));

      const rawRows = (res.rows || []).filter((r: any) => !r.deleted_at);
      // 이용자용 시트봇 에이전트(agent2, agent)만 필터링 (관리자 전용 입금 에이전트 M인 android_agent는 배제)
      const agentDevices = rawRows
        .filter((r: any) => r.pairing_mode === "agent2" || r.pairing_mode === "agent")
        .map(mapNotificationDevice);

      setDevices(agentDevices);
    } catch (err: any) {
      console.warn("[Notifications] Fetch devices warning:", err.message);
    } finally {
      setLoadingDevices(false);
      setHasInitialLoaded(true);
    }
  }, [effectiveEmail]);

  // 2. 스마트 규칙 목록 로드 (이지데스크 queryTable 직통 조회)
  const fetchRules = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoadingRules(true);
    try {
      const email = effectiveEmail;
      if (!email) return;
      const res = await queryTable("sheetbot_user_smart_rules", {
        filters: { user_email: email },
        limit: 100,
        orderBy: "id",
        orderDirection: "DESC",
      }).catch(() => ({ rows: [] }));

      const validRules = (res.rows || []).filter((r: any) => !r.deleted_at);
      setRules(validRules);
    } catch (err: any) {
      console.warn("[Notifications] Fetch rules warning:", err.message);
    } finally {
      setLoadingRules(false);
    }
  }, [effectiveEmail]);

  // 3. 발송 로그 로드 (이지데스크 queryTable 직통 조회)
  const fetchLogs = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoadingLogs(true);
    try {
      const email = effectiveEmail;
      if (!email) return;
      const res = await queryTable("sheetbot_user_dispatch_logs", {
        filters: { user_email: email },
        limit: 100,
        orderBy: "id",
        orderDirection: "DESC",
      }).catch(() => ({ rows: [] }));

      const validRows = (res.rows || []).filter((r: any) => !r.deleted_at);
      setLogs(validRows);
    } catch (err: any) {
      console.warn("[Notifications] Fetch logs warning:", err.message);
    } finally {
      setLoadingLogs(false);
    }
  }, [effectiveEmail]);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!isLoggedIn && status === "unauthenticated" && !effectiveEmail) {
      router.push("/login");
    } else if (effectiveEmail || isLoggedIn) {
      fetchDevices();
      fetchRules();
      fetchLogs();
      fetchAgent2Pairing();
    }
  }, [isLoggedIn, isAuthLoading, status, effectiveEmail, router, fetchDevices, fetchRules, fetchLogs, fetchAgent2Pairing]);

  // ⚡ [0초 실시간 감시] 이지데스크 DB 왓처 실시간 스트림 연동 (SMS 및 기기 변경 자동 감지)
  const [isRealtimeLive, setIsRealtimeLive] = useState(false);

  // 리렌더링 시 EventSource 연결이 불필요하게 끊어지지 않도록 최신 콜백을 ref로 격리
  const fetchLogsRef = useRef(fetchLogs);
  const fetchDevicesRef = useRef(fetchDevices);
  const fetchRulesRef = useRef(fetchRules);
  useEffect(() => {
    fetchLogsRef.current = fetchLogs;
    fetchDevicesRef.current = fetchDevices;
    fetchRulesRef.current = fetchRules;
  });

  // ⚡ [0초 실시간 감시] 이지데스크 공식 onUserDataChanged 연동 (SMS 알림 및 기기 변경 감시)
  useEffect(() => {
    if (typeof window === "undefined" || !effectiveEmail) return;

    const unsub = onUserDataChanged((event) => {
      setIsRealtimeLive(true);
      if (!event.tableName || event.tableName === "sheetbot_sms_logs") {
        fetchLogsRef.current?.(true);
      }
      if (!event.tableName || event.tableName === "sheetbot_user_devices") {
        fetchDevicesRef.current?.(true);
      }
      if (!event.tableName || event.tableName === "sheetbot_smart_rules") {
        fetchRulesRef.current?.(true);
      }
    });

    setIsRealtimeLive(true);

    return () => {
      unsub();
    };
  }, [effectiveEmail]);


  // 기기 삭제
  const handleDeleteDevice = async (dev: any) => {
    if (!window.confirm(`'${dev.label}' 디바이스 연동을 해제하시겠습니까?`)) return;

    try {
      const res = await apiFetch(`/api/user/devices?id=${dev.id}&deviceId=${dev.deviceId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        showAlert("success", "디바이스 연동이 해제되었습니다.");
        fetchDevices();
      } else {
        showAlert("error", data.error || "해제 실패");
      }
    } catch (err: any) {
      showAlert("error", err.message || "통신 오류");
    }
  };

  // 테스트 문자 발송
  const handleSendTestSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testRecipient.trim()) {
      showAlert("error", "수신할 휴대폰 번호를 입력해 주세요.");
      return;
    }

    setSendingTest(true);
    try {
      const res = await apiFetch("/api/user/devices/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: testRecipient.trim(),
          message: testMessage.trim() || undefined,
          deviceId: testModalDevice?.deviceId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showAlert("success", data.message || "테스트 문자가 발송되었습니다.");
        setTestModalDevice(null);
        fetchLogs();
      } else {
        showAlert("error", data.error || "발송 실패");
      }
    } catch (err: any) {
      showAlert("error", err.message || "통신 오류");
    } finally {
      setSendingTest(false);
    }
  };

  // 자연어 스마트 규칙 등록
  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptInput.trim()) {
      showAlert("error", "원하시는 알림 규칙을 자연어로 입력해 주세요.");
      return;
    }

    setCreatingRule(true);
    try {
      const res = await apiFetch("/api/user/smart-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptInput.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        showAlert("success", data.message || "스마트 알림 규칙이 등록되었습니다.");
        setPromptInput("");
        fetchRules();
      } else {
        showAlert("error", data.error || "규칙 등록 실패");
      }
    } catch (err: any) {
      showAlert("error", err.message || "통신 오류");
    } finally {
      setCreatingRule(false);
    }
  };

  // 규칙 활성/비활성 토글
  const handleToggleRule = async (rule: any) => {
    const nextActive = rule.is_active === 1 ? false : true;
    try {
      const res = await apiFetch("/api/user/smart-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, isActive: nextActive }),
      });
      const data = await res.json();
      if (data.success) {
        setRules((prev) =>
          prev.map((r) => (r.id === rule.id ? { ...r, is_active: nextActive ? 1 : 0 } : r))
        );
        showAlert("success", `'${rule.name}' 규칙이 ${nextActive ? "활성화" : "비활성화"}되었습니다.`);
      }
    } catch (err: any) {
      showAlert("error", "상태 변경 실패");
    }
  };

  // 규칙 삭제
  const handleDeleteRule = async (rule: any) => {
    if (!window.confirm(`'${rule.name}' 규칙을 삭제하시겠습니까?`)) return;

    try {
      const res = await apiFetch(`/api/user/smart-rules?id=${rule.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        showAlert("success", "규칙이 삭제되었습니다.");
        fetchRules();
      } else {
        showAlert("error", data.error || "삭제 실패");
      }
    } catch (err: any) {
      showAlert("error", err.message || "통신 오류");
    }
  };

  const copyWebhookCode = () => {
    const code = `function onEdit(e) {
  var range = e.range;
  var sheet = range.getSheet();
  var row = range.getRow();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var rowValues = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  var rowData = {};
  for (var i = 0; i < headers.length; i++) {
    rowData[headers[i]] = rowValues[i];
  }

  UrlFetchApp.fetch("${typeof window !== "undefined" ? window.location.origin : "https://sheetbot.io"}/api/webhooks/dispatch", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      userEmail: "${effectiveEmail || "user@example.com"}",
      eventType: "sheet_edit",
      sheetName: sheet.getName(),
      rowData: rowData
    }),
    muteHttpExceptions: true
  });
}`;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const SAMPLE_PROMPTS = [
    "D열의 입금상태가 '완료'로 변경되면 고객 연락처로 감사 문자 발송",
    "재고수량이 5개 이하로 떨어지면 내 휴대폰 번호로 긴급 발주 알림 문자 전송",
    "새로운 상담 예약 행이 추가되면 고객에게 예약 확정 문자 자동 발송",
    "매일 마감 시점 특정 시트의 일일 매출 합계를 내 폰으로 요약 발송",
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800 text-left">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* 알림 토스트 */}
        {alert && (
          <div
            className={`p-4 rounded-2xl flex items-center justify-between gap-3 text-xs font-bold animate-fade-in ${
              alert.type === "success"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : "bg-rose-50 text-rose-800 border border-rose-200"
            }`}
          >
            <div className="flex items-center gap-2">
              {alert.type === "success" ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-rose-600" />}
              <span>{alert.text}</span>
            </div>
          </div>
        )}

        {/* 상단 헤더 카드 */}
        <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden border border-indigo-500/20">
          <div className="absolute right-0 top-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-400/20 text-emerald-300 text-xs font-bold border border-emerald-400/30">
              <Smartphone className="w-3.5 h-3.5" />
              <span>시트봇 에이전트 스마트 알림 & 0원 문자 센터</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              시트봇 에이전트(SheetBot Agent) 연동 & 구글 시트 양방향 문자 자동화
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm max-w-2xl leading-relaxed">
              본인의 스마트폰에 <strong>시트봇 에이전트(SheetBot Agent)</strong>를 설치하고 0초 QR 연동하면,
              <strong>통신 비용 0원</strong>으로 고객 알림 문자를 자동 발송하고 수신 문자를 시트에 실시간 자동 기록할 수 있습니다.
            </p>
          </div>

          {/* 4개 탭 네비게이션 */}
          <div className="flex flex-wrap items-center gap-2 mt-6 pt-4 border-t border-white/10 text-xs font-bold">
            <button
              onClick={() => setActiveTab("devices")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all cursor-pointer ${
                activeTab === "devices"
                  ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/30"
                  : "bg-white/10 text-slate-200 hover:bg-white/20"
              }`}
            >
              <Smartphone className="w-4 h-4" />
              <span>시트봇 에이전트 기기 ({devices.length})</span>
            </button>

            <button
              onClick={() => setActiveTab("logs")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all cursor-pointer ${
                activeTab === "logs"
                  ? "bg-amber-600 text-white shadow-md shadow-amber-600/30"
                  : "bg-white/10 text-slate-200 hover:bg-white/20"
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>알림 발송 이력 ({logs.length})</span>
            </button>

            <button
              onClick={() => setActiveTab("rules")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all cursor-pointer ${
                activeTab === "rules"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "bg-white/10 text-slate-200 hover:bg-white/20"
              }`}
            >
              <Zap className="w-4 h-4" />
              <span>자동 발송 규칙 & 템플릿 ({rules.length})</span>
            </button>

            <button
              onClick={() => setActiveTab("guide")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all cursor-pointer ${
                activeTab === "guide"
                  ? "bg-teal-600 text-white shadow-md shadow-teal-600/30"
                  : "bg-white/10 text-slate-200 hover:bg-white/20"
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>실전 활용 가이드</span>
            </button>

            {/* 실시간 DB 왓처 연결 뱃지 (클릭 시 수동 새로고침 겸용) */}
            <button
              onClick={() => {
                fetchDevices();
                fetchRules();
                fetchLogs();
                fetchAgent2Pairing();
              }}
              className="ml-auto hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-bold transition-all bg-white/10 hover:bg-white/20 active:scale-95 border-white/20 text-white cursor-pointer shadow-xs"
              title="클릭 시 즉시 데이터 동기화 및 스트림 상태 확인"
            >
              <span className={`w-2 h-2 rounded-full ${isRealtimeLive ? "bg-emerald-400 animate-pulse ring-2 ring-emerald-400/40" : "bg-slate-400"}`} />
              <span className={isRealtimeLive ? "text-emerald-300 font-extrabold" : "text-slate-300"}>
                {isRealtimeLive ? "⚡ DB 왓처 0초 실시간 감시 중" : "스트림 연결 중..."}
              </span>
              <RefreshCw className={`w-3 h-3 text-white/70 transition-transform ${loadingDevices || loadingRules || loadingLogs ? "animate-spin text-emerald-300" : ""}`} />
            </button>
          </div>
        </div>

        {/* 탭 1: 내 기기 연동 */}
        {activeTab === "devices" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-900">등록된 시트봇 에이전트 기기</h2>
                <p className="text-xs text-slate-500">문자를 0원에 발송하고 시트로 수신할 안드로이드 스마트폰(시트봇 에이전트)을 관리합니다.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchDevices()}
                  disabled={loadingDevices}
                  className="p-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 transition-all cursor-pointer"
                  title="새로고침"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingDevices ? "animate-spin" : ""}`} />
                </button>
                <button
                  onClick={() => {
                    setIsAddDeviceOpen(true);
                    fetchAgent2Pairing();
                  }}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>새 시트봇 에이전트 연동</span>
                </button>
              </div>
            </div>

            {/* 디바이스 목록 */}
            {loadingDevices && !hasInitialLoaded ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/80">
                <RefreshCw className="w-6 h-6 animate-spin text-emerald-600 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-500">디바이스 정보를 불러오는 중...</p>
              </div>
            ) : devices.length === 0 ? (
              <div className="bg-white rounded-3xl p-6 sm:p-10 border border-slate-200/80 shadow-sm space-y-8">
                {/* 헤더 안내 */}
                <div className="text-center max-w-xl mx-auto space-y-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>시트봇 에이전트 (이용자 전용) 3단계 초간편 빠른 연동</span>
                  </div>
                  <h3 className="text-xl font-black text-slate-900">
                    스마트폰을 연동하여 0원 고객 알림 문자를 시작하세요
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                    회원님의 스마트폰에 시트봇 에이전트 앱을 설치하고 아래 QR코드를 스캔하면, 구글 스프레드시트의 주문·입금·예약 알림 문자가 통신비 0원으로 즉시 자동 발송됩니다.
                  </p>
                </div>

                {/* 3단계 가이드 그리드 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto items-stretch">
                  {/* 1단계: 이용자용 APK 다운로드 & 공유 */}
                  <div className="bg-slate-50/70 rounded-2xl p-5 border border-slate-200 flex flex-col justify-between text-left space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white text-xs font-black flex items-center justify-center shrink-0">
                            1
                          </span>
                          <h4 className="text-sm font-black text-slate-800">이용자용 앱 다운로드</h4>
                        </div>
                        <button
                          type="button"
                          onClick={handleShareApk}
                          className="px-2 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-all cursor-pointer text-[11px] font-bold flex items-center gap-1 shadow-2xs shrink-0"
                          title="스마트폰으로 공유 및 다운로드 QR 보기"
                        >
                          <Share2 className="w-3 h-3 text-emerald-600" />
                          <span>공유</span>
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        안드로이드 스마트폰에 <strong>시트봇 에이전트</strong> 전용 APK를 다운로드하여 설치합니다.
                      </p>
                    </div>

                    <div className="space-y-2 pt-1">
                      {/* 메인 다운로드 버튼 */}
                      <a
                        href={getApkDownloadUrl()}
                        download="SheetBotAgent.apk"
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        <span>시트봇 에이전트 APK 받기</span>
                      </a>

                      {/* 보조 공유: 링크 복사 및 폰으로 받기(QR) 버튼 */}
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={handleCopyApkLink}
                          className="flex items-center justify-center gap-1 py-1.5 px-2 bg-white hover:bg-slate-100 text-slate-700 text-[11px] font-bold rounded-lg border border-slate-200 transition-all cursor-pointer shadow-2xs"
                          title="다운로드 URL 클립보드 복사"
                        >
                          {apkCopied ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span className="text-emerald-700">복사됨!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3 text-slate-500" />
                              <span>링크 복사</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => setIsApkQrModalOpen(true)}
                          className="flex items-center justify-center gap-1 py-1.5 px-2 bg-white hover:bg-slate-100 text-slate-700 text-[11px] font-bold rounded-lg border border-slate-200 transition-all cursor-pointer shadow-2xs"
                          title="스마트폰 카메라로 찍어 바로 받기"
                        >
                          <QrCode className="w-3 h-3 text-emerald-600" />
                          <span>폰으로 받기</span>
                        </button>
                      </div>

                      <p className="text-[10px] text-slate-400 text-center font-medium">
                        버전 1.0.0 (약 5.2MB, 안드로이드 전용)
                      </p>
                    </div>
                  </div>

                  {/* 2단계: 실시간 QR 페어링 코드 */}
                  <div className="bg-emerald-50/50 rounded-2xl p-5 border border-emerald-200 flex flex-col items-center justify-between text-center space-y-3">
                    <div className="w-full text-left flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white text-xs font-black flex items-center justify-center shrink-0">
                          2
                        </span>
                        <h4 className="text-sm font-black text-emerald-950">페어링 QR 코드</h4>
                      </div>
                      <button
                        onClick={() => fetchAgent2Pairing()}
                        disabled={loadingAgent2Pair}
                        className="p-1 text-slate-400 hover:text-emerald-700 transition-colors cursor-pointer"
                        title="QR 새로고침"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingAgent2Pair ? "animate-spin" : ""}`} />
                      </button>
                    </div>

                    <div className="py-1">
                      {loadingAgent2Pair && !agent2PairData ? (
                        <div className="w-36 h-36 flex flex-col items-center justify-center text-emerald-600 bg-white rounded-xl border border-emerald-200 mx-auto">
                          <RefreshCw className="w-6 h-6 animate-spin mb-1" />
                          <span className="text-[10px] font-bold">생성 중...</span>
                        </div>
                      ) : agent2PairData?.qrData ? (
                        <div className="p-2 bg-white rounded-xl shadow-xs border border-emerald-200 inline-block">
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                              agent2PairData.qrData
                            )}`}
                            alt="SheetBot Agent Pairing QR"
                            className="w-32 h-32 mx-auto"
                          />
                          <div className="mt-1 pt-1 border-t border-slate-100 text-center">
                            <span className="text-[10px] text-slate-400 mr-1 font-bold">PIN:</span>
                            <span className="text-xs font-mono font-black text-emerald-700 tracking-wider">
                              {agent2PairData.pinCode || "SB-777777"}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => fetchAgent2Pairing()}
                          className="px-3 py-2 bg-white border border-rose-200 text-rose-600 text-xs font-bold rounded-xl cursor-pointer"
                        >
                          QR코드 생성하기
                        </button>
                      )}
                    </div>

                    <p className="text-[10.5px] text-emerald-800 leading-snug font-medium">
                      화면의 QR 코드는 로그인된 회원님 계정과 1:1로 암호화 연결됩니다.
                    </p>
                  </div>

                  {/* 3단계: 앱 실행 및 0초 연결 */}
                  <div className="bg-slate-50/70 rounded-2xl p-5 border border-slate-200 flex flex-col justify-between text-left space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white text-xs font-black flex items-center justify-center shrink-0">
                          3
                        </span>
                        <h4 className="text-sm font-black text-slate-800">앱에서 [QR 페어링] 스캔</h4>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        스마트폰에서 <strong>시트봇 에이전트</strong> 앱을 실행한 후 <strong>[QR 페어링]</strong>을 눌러 위 QR 코드를 비추면 <strong>0초 만에 실시간으로 연동이 완료</strong>됩니다.
                      </p>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-slate-200 text-[11px] text-slate-600 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-emerald-700">
                        <Zap className="w-3.5 h-3.5" />
                        <span>DB 왓처 0초 실시간 감지</span>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        스캔 즉시 화면이 자동으로 새로고침 없이 기기 연결 상태로 전환됩니다.
                      </p>
                    </div>
                  </div>
                </div>

                {/* 하단 보조 안내 */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-center gap-2 text-xs text-slate-400">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>스마트폰 시트봇 에이전트 앱으로 위 QR 코드를 비추면 통신비 0원 자동화가 즉시 활성화됩니다.</span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {devices.map((dev) => (
                  <div
                    key={dev.id}
                    className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black border flex items-center gap-1 ${
                            dev.status === "CONNECTED"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : dev.status === "PAIRING"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-slate-100 text-slate-500 border-slate-200"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              dev.status === "CONNECTED"
                                ? "bg-emerald-500 animate-pulse"
                                : dev.status === "PAIRING"
                                ? "bg-amber-500"
                                : "bg-slate-400"
                            }`}
                          />
                          {dev.status === "CONNECTED" ? "연결됨 (정상)" : dev.status === "PAIRING" ? "페어링 대기" : "연결 끊김"}
                        </span>

                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                          📱 시트봇 에이전트 앱
                        </span>
                      </div>

                      <div>
                        <h3 className="font-extrabold text-sm text-slate-900 truncate">{dev.label}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {dev.phoneNumber ? dev.phoneNumber : "0원 문자 발송 준비 완료"}
                        </p>
                      </div>

                      {/* 배터리 / 네트워크 뱃지 */}
                      <div className="flex items-center gap-2 text-[11px] text-slate-600 pt-1">
                        <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                          <Battery className="w-3.5 h-3.5 text-slate-500" />
                          <span>{dev.battery !== null ? `${dev.battery}%` : "배터리 양호"}</span>
                        </div>
                        <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                          <Wifi className="w-3.5 h-3.5 text-indigo-500" />
                          <span>{dev.networkType || "Wi-Fi"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                      <button
                        onClick={() => {
                          setTestModalDevice(dev);
                          setTestRecipient(dev.phoneNumber || "");
                          setTestMessage(`[SheetBot] ${dev.label} 기기에서 발송된 테스트 문자입니다.`);
                        }}
                        className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-all cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>테스트 발송</span>
                      </button>

                      <button
                        onClick={() => handleDeleteDevice(dev)}
                        className="px-2.5 py-2 rounded-xl bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200/60 hover:border-rose-200 transition-all cursor-pointer flex items-center gap-1 text-xs font-bold"
                        title="연동 해제 (기기 삭제)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="text-[11px]">해제</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 탭 2: 자연어 스마트 알림 규칙 */}
        {activeTab === "rules" && (
          <NotificationsRulesTab
            rules={rules}
            loadingRules={loadingRules}
            promptInput={promptInput}
            setPromptInput={setPromptInput}
            creatingRule={creatingRule}
            onCreateRule={handleCreateRule}
            onToggleRule={handleToggleRule}
            onDeleteRule={handleDeleteRule}
            onRefresh={fetchRules}
            samplePrompts={SAMPLE_PROMPTS}
          />
        )}

        {/* 탭 3: 알림 발송 이력 */}
        {activeTab === "logs" && (
          <NotificationsLogsTab
            logs={logs}
            loadingLogs={loadingLogs}
            onRefresh={fetchLogs}
          />
        )}

        {/* 탭 4: 실전 활용 가이드 */}
        {activeTab === "guide" && <NotificationsGuideTab />}
      </main>

      {/* 모달 1: SheetBot Agent2 기기 연동 */}
      {isAddDeviceOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full border border-slate-200 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-150 text-left">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">시트봇 에이전트 기기 연동</h3>
                  <p className="text-[11px] text-slate-500">스마트폰 요금제로 0원 발송 & 수신 문자 시트 자동 기록</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddDeviceOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* 시트봇 에이전트 2단계 연동 화면 */}
            <div className="space-y-4">
              {/* 1단계: APK 다운로드 안내 & 공유 */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <span>1. 스마트폰에 앱 설치</span>
                    <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">무료</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">안드로이드 스마트폰에 시트봇 에이전트(SheetBot Agent)를 설치하세요.</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={handleCopyApkLink}
                    className="p-1.5 bg-white hover:bg-slate-100 text-slate-700 text-[11px] font-bold rounded-lg border border-slate-200 transition-all cursor-pointer shadow-2xs flex items-center gap-1"
                    title="다운로드 링크 복사"
                  >
                    {apkCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-slate-500" />}
                    <span>{apkCopied ? "복사됨" : "링크 복사"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsApkQrModalOpen(true)}
                    className="p-1.5 bg-white hover:bg-slate-100 text-slate-700 text-[11px] font-bold rounded-lg border border-slate-200 transition-all cursor-pointer shadow-2xs flex items-center gap-1"
                    title="폰 카메라로 QR 찍어 바로 받기"
                  >
                    <QrCode className="w-3 h-3 text-emerald-600" />
                    <span>QR 받기</span>
                  </button>
                  <a
                    href={getApkDownloadUrl()}
                    download="SheetBotAgent.apk"
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1 shrink-0 cursor-pointer shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>APK 다운</span>
                  </a>
                </div>
              </div>

              {/* 2단계: QR 페어링 */}
              <div className="p-4 bg-emerald-50/70 rounded-2xl border border-emerald-200 text-center space-y-3">
                <div className="text-xs font-extrabold text-emerald-900">2. 앱에서 아래 QR 코드를 스캔하세요</div>
                {loadingAgent2Pair ? (
                  <div className="py-12 text-center text-emerald-600">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                    <p className="text-xs font-bold">페어링 QR코드 생성 중...</p>
                  </div>
                ) : agent2PairData?.qrData ? (
                  <div className="inline-block p-3 bg-white rounded-xl shadow-xs border border-emerald-200">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(agent2PairData.qrData || `sheetbot://pair?email=${encodeURIComponent(effectiveEmail || "")}&pin=SB-777777`)}`}
                      alt="SheetBot Agent Pairing QR"
                      className="w-40 h-40 mx-auto"
                    />
                    <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-center gap-1.5 text-xs font-mono font-bold text-slate-700">
                      <span className="text-slate-400 font-sans text-[10px]">PIN:</span>
                      <span className="text-emerald-700 font-black tracking-wider">{agent2PairData.pinCode || "SB-777777"}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-rose-600">페어링 정보를 불러오지 못했습니다.</p>
                )}
                <p className="text-[11px] text-emerald-800 leading-relaxed max-w-sm mx-auto">
                  앱 실행 ➔ [QR 페어링] 스캔 즉시 회원님의 구글 계정과 스마트폰이 1:1 결합되어 0원 문자 발송이 활성화됩니다.
                </p>
              </div>

              <div className="pt-1 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddDeviceOpen(false);
                    fetchDevices();
                  }}
                  className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all cursor-pointer"
                >
                  스캔 완료 및 닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 모달 2: 테스트 문자 발송 */}
      {testModalDevice && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full border border-slate-200 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-150 text-left">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-indigo-600" />
                <h3 className="text-base font-extrabold text-slate-900">테스트 문자 발송</h3>
              </div>
              <button
                onClick={() => setTestModalDevice(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              선택한 기기 [<strong>{testModalDevice.label}</strong>]를 통해 지정한 휴대폰으로 테스트 문자를 보냅니다.
            </p>

            <form onSubmit={handleSendTestSms} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">수신자 전화번호</label>
                <input
                  type="tel"
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  placeholder="예: 010-1234-5678"
                  required
                  className="w-full p-3 rounded-xl border border-slate-300 text-xs outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">메시지 본문</label>
                <textarea
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  rows={3}
                  className="w-full p-3 rounded-xl border border-slate-300 text-xs outline-none focus:border-indigo-600 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setTestModalDevice(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={sendingTest}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {sendingTest ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>{sendingTest ? "발송 중..." : "즉시 발송"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 모달 3: 이용자용 앱(APK) 다운로드 전용 QR & 공유 모달 */}
      {isApkQrModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-sm w-full border border-slate-200 shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150 text-left">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">시트봇 에이전트 앱 다운로드</h3>
                  <p className="text-[10.5px] text-slate-500">스마트폰 카메라로 비추면 바로 다운로드</p>
                </div>
              </div>
              <button
                onClick={() => setIsApkQrModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* 다운로드 직통 QR 코드 */}
            <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-200 text-center space-y-3">
              <div className="inline-block p-2.5 bg-white rounded-xl shadow-xs border border-emerald-200">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                    getApkDownloadUrl()
                  )}`}
                  alt="SheetBot Agent APK Download QR"
                  className="w-36 h-36 mx-auto"
                />
              </div>
              <p className="text-[11px] text-emerald-900 font-medium leading-relaxed">
                스마트폰 기본 <strong>카메라 앱</strong>으로 위 QR코드를 비추면<br />
                <strong>SheetBotAgent.apk</strong>가 폰에서 즉시 다운로드됩니다.
              </p>
            </div>

            {/* 다운로드 링크 & 복사 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <input
                  type="text"
                  readOnly
                  value={getApkDownloadUrl()}
                  className="flex-1 bg-transparent text-slate-600 text-[11px] font-mono outline-hidden select-all"
                />
                <button
                  onClick={handleCopyApkLink}
                  className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[10.5px] font-bold shrink-0 cursor-pointer"
                >
                  {apkCopied ? "복사됨!" : "복사"}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCopyApkLink}
                  className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>링크 복사</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsApkQrModalOpen(false)}
                  className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all cursor-pointer"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
