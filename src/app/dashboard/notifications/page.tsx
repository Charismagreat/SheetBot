"use client";

import { apiFetch, getEgdeskBasePath } from '@/lib/api';
import React, { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
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
  Download
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
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"devices" | "rules" | "logs" | "guide">("devices");

  // 디바이스 상태
  const [devices, setDevices] = useState<any[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [isAddDeviceOpen, setIsAddDeviceOpen] = useState(false);
  const [newDeviceLabel, setNewDeviceLabel] = useState("");
  const [pairingMode, setPairingMode] = useState<"agent2" | "qr" | "google_account">("agent2");
  const [newPhoneNumber, setNewPhoneNumber] = useState("");
  const [pairingData, setPairingData] = useState<any>(null);
  const [agent2PairData, setAgent2PairData] = useState<any>(null);
  const [loadingAgent2Pair, setLoadingAgent2Pair] = useState(false);
  const [submittingDevice, setSubmittingDevice] = useState(false);

  // SheetBot Agent2 실시간 페어링 정보 로드
  const fetchAgent2Pairing = useCallback(async () => {
    setLoadingAgent2Pair(true);
    try {
      const res = await apiFetch("/api/user/agent2/pair");
      const data = await res.json();
      if (data.success) {
        setAgent2PairData(data);
      }
    } catch (err: any) {
      console.error("[Notifications] Agent2 pair error:", err);
    } finally {
      setLoadingAgent2Pair(false);
    }
  }, []);

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

  const showAlert = (type: "success" | "error", text: string) => {
    setAlert({ type, text });
    setTimeout(() => setAlert(null), 5000);
  };

  // 1. 디바이스 목록 로드
  const fetchDevices = useCallback(async () => {
    setLoadingDevices(true);
    try {
      const res = await apiFetch("/api/user/devices");
      const data = await res.json();
      if (data.success) {
        setDevices(data.devices || []);
      }
    } catch (err: any) {
      console.error("Fetch devices error:", err);
    } finally {
      setLoadingDevices(false);
    }
  }, []);

  // 2. 스마트 규칙 목록 로드
  const fetchRules = useCallback(async () => {
    setLoadingRules(true);
    try {
      const res = await apiFetch("/api/user/smart-rules");
      const data = await res.json();
      if (data.success) {
        setRules(data.rules || []);
      }
    } catch (err: any) {
      console.error("Fetch rules error:", err);
    } finally {
      setLoadingRules(false);
    }
  }, []);

  // 3. 발송 로그 로드
  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await apiFetch("/api/user/dispatch-logs");
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs || []);
      }
    } catch (err: any) {
      console.error("Fetch logs error:", err);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      fetchDevices();
      fetchRules();
      fetchLogs();
      fetchAgent2Pairing();
    }
  }, [status, router, fetchDevices, fetchRules, fetchLogs, fetchAgent2Pairing]);

  // ⚡ [0초 실시간 감시] 이지데스크 DB 왓처 실시간 스트림 연동 (SMS 및 기기 변경 자동 감지)
  const [isRealtimeLive, setIsRealtimeLive] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;

    let eventSource: EventSource | null = null;
    let reconnectTimer: any = null;

    const connectStream = () => {
      if (eventSource) {
        try {
          eventSource.close();
        } catch {}
      }

      const email = session?.user?.email || "";
      const basePath = getEgdeskBasePath();
      const streamUrl = `${basePath}/api/realtime/stream?topic=sms&userEmail=${encodeURIComponent(email)}`;

      try {
        eventSource = new EventSource(streamUrl);

        eventSource.onopen = () => {
          setIsRealtimeLive(true);
        };

        eventSource.onmessage = (event) => {
          setIsRealtimeLive(true);
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === "CONNECTED" || payload.type === "UPSTREAM_STATUS") {
              setIsRealtimeLive(true);
              return;
            }
            if (payload.type === "DATA_CHANGED") {
              if (payload.tableName === "sheetbot_sms_logs") {
                fetchLogs();
              } else if (payload.tableName === "sheetbot_user_devices") {
                fetchDevices();
              } else if (payload.tableName === "sheetbot_smart_rules") {
                fetchRules();
              }
            }
          } catch {}
        };

        eventSource.onerror = () => {
          setIsRealtimeLive(false);
          if (eventSource) {
            try {
              eventSource.close();
            } catch {}
          }
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(connectStream, 3000);
        };
      } catch {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connectStream, 5000);
      }
    };

    connectStream();

    return () => {
      if (eventSource) {
        try {
          eventSource.close();
        } catch {}
      }
      clearTimeout(reconnectTimer);
    };
  }, [status, session?.user?.email, fetchLogs, fetchDevices, fetchRules]);

  // 새 기기 등록
  const handleCreateDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeviceLabel.trim()) {
      showAlert("error", "디바이스 별칭(예: 내 스마트폰)을 입력해 주세요.");
      return;
    }

    setSubmittingDevice(true);
    try {
      const res = await apiFetch("/api/user/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newDeviceLabel.trim(),
          pairingMode,
          phoneNumber: newPhoneNumber.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        showAlert("success", data.message || "디바이스가 등록되었습니다.");
        setPairingData(data.pairingData || null);
        fetchDevices();
      } else {
        showAlert("error", data.error || "디바이스 등록에 실패했습니다.");
      }
    } catch (err: any) {
      showAlert("error", err.message || "통신 오류가 발생했습니다.");
    } finally {
      setSubmittingDevice(false);
    }
  };

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
      userEmail: "${session?.user?.email || "user@example.com"}",
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

            {/* 실시간 DB 왓처 연결 뱃지 */}
            <div className="ml-auto hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-bold transition-all bg-white/5 border-white/10">
              <span className={`w-2 h-2 rounded-full ${isRealtimeLive ? "bg-emerald-400 animate-pulse" : "bg-slate-400"}`} />
              <span className={isRealtimeLive ? "text-emerald-300" : "text-slate-400"}>
                {isRealtimeLive ? "⚡ DB 왓처 0초 실시간 감시 중" : "스트림 연결 중..."}
              </span>
            </div>
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
                  onClick={fetchDevices}
                  disabled={loadingDevices}
                  className="p-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 transition-all cursor-pointer"
                  title="새로고침"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingDevices ? "animate-spin" : ""}`} />
                </button>
                <button
                  onClick={() => {
                    setIsAddDeviceOpen(true);
                    setPairingData(null);
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
            {loadingDevices ? (
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
                  {/* 1단계: 이용자용 APK 다운로드 */}
                  <div className="bg-slate-50/70 rounded-2xl p-5 border border-slate-200 flex flex-col justify-between text-left space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white text-xs font-black flex items-center justify-center shrink-0">
                          1
                        </span>
                        <h4 className="text-sm font-black text-slate-800">이용자용 앱 다운로드</h4>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        안드로이드 스마트폰에 <strong>시트봇 에이전트</strong> 전용 APK를 다운로드하여 설치합니다.
                      </p>
                    </div>
                    <div className="pt-2">
                      <a
                        href="/downloads/SheetBotAgent.apk"
                        download="SheetBotAgent.apk"
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        <span>시트봇 에이전트 APK 받기</span>
                      </a>
                      <p className="text-[10px] text-slate-400 text-center mt-1.5 font-medium">
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
                        onClick={fetchAgent2Pairing}
                        disabled={loadingAgent2Pair}
                        className="p-1 text-slate-400 hover:text-emerald-700 transition-colors cursor-pointer"
                        title="QR 새로고침"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingAgent2Pair ? "animate-spin" : ""}`} />
                      </button>
                    </div>

                    <div className="py-1">
                      {loadingAgent2Pair ? (
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
                              {agent2PairData.pinCode || "SA2-123456"}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={fetchAgent2Pairing}
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

                {/* 하단 보조 액션 */}
                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-center gap-4 text-xs">
                  <span className="text-slate-400">카메라 스캔이 어렵거나 수동 등록을 원하시나요?</span>
                  <button
                    onClick={() => {
                      setIsAddDeviceOpen(true);
                      setPairingMode("qr");
                    }}
                    className="font-bold text-slate-700 hover:text-emerald-700 underline cursor-pointer"
                  >
                    수동 기기 등록 팝업 열기
                  </button>
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

                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                          {dev.pairingMode === "agent2"
                            ? "📱 시트봇 에이전트 앱"
                            : dev.pairingMode === "google_account"
                            ? "구글 계정 연동"
                            : "구글 메시지 QR"}
                        </span>
                      </div>

                      <div>
                        <h3 className="font-extrabold text-sm text-slate-900 truncate">{dev.label}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {dev.phoneNumber ? dev.phoneNumber : "발신 번호 등록됨"}
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
                        className="p-2 rounded-xl bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-all cursor-pointer"
                        title="연동 해제"
                      >
                        <Trash2 className="w-4 h-4" />
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
                onClick={() => {
                  setIsAddDeviceOpen(false);
                  setPairingData(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* 연동 방식 선택 탭 */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setPairingMode("agent2");
                  if (!agent2PairData) fetchAgent2Pairing();
                }}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  pairingMode === "agent2"
                    ? "bg-white text-emerald-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-emerald-600" />
                <span>시트봇 에이전트 (0초)</span>
              </button>
              <button
                type="button"
                onClick={() => setPairingMode("qr")}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  pairingMode === "qr"
                    ? "bg-white text-indigo-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <QrCode className="w-3.5 h-3.5 text-indigo-600" />
                <span>수동 기기 등록</span>
              </button>
            </div>

            {pairingMode === "agent2" ? (
              <div className="space-y-4">
                {/* 1단계: APK 다운로드 안내 */}
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-slate-800">1. 스마트폰에 앱 설치</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">안드로이드 스마트폰에 시트봇 에이전트(SheetBot Agent)를 설치하세요.</div>
                  </div>
                  <a
                    href="/downloads/SheetBotAgent.apk"
                    download="SheetBotAgent.apk"
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1 flex-shrink-0 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>📥 APK 받기</span>
                  </a>
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
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(agent2PairData.qrData)}`}
                        alt="Agent2 Pairing QR"
                        className="w-40 h-40 mx-auto"
                      />
                      <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-center gap-1.5 text-xs font-mono font-bold text-slate-700">
                        <span className="text-slate-400 font-sans text-[10px]">PIN:</span>
                        <span className="text-emerald-700 font-black tracking-wider">{agent2PairData.pinCode || "SA2-123456"}</span>
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
            ) : !pairingData ? (
              <form onSubmit={handleCreateDevice} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">디바이스 별칭</label>
                  <input
                    type="text"
                    value={newDeviceLabel}
                    onChange={(e) => setNewDeviceLabel(e.target.value)}
                    placeholder="예: 내 갤럭시 S24, 업무용 폰"
                    required
                    className="w-full p-3 rounded-xl border border-slate-300 text-xs outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">발신 전화번호 (선택)</label>
                  <input
                    type="tel"
                    value={newPhoneNumber}
                    onChange={(e) => setNewPhoneNumber(e.target.value)}
                    placeholder="예: 010-1234-5678"
                    className="w-full p-3 rounded-xl border border-slate-300 text-xs outline-none focus:border-emerald-600"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddDeviceOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 cursor-pointer"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={submittingDevice}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50"
                  >
                    {submittingDevice ? "연동 준비 중..." : "페어링 시작 ➔"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 text-center">
                <div className="space-y-3">
                  <p className="text-xs text-slate-600">
                    스마트폰의 카메라 또는 기기 페어링 화면에서 아래 QR 코드를 스캔하세요.
                  </p>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 inline-block">
                    <img
                      src={pairingData.qrCodeUrl}
                      alt="Pairing QR"
                      className="w-44 h-44 mx-auto rounded-lg shadow-sm"
                    />
                  </div>
                </div>

                <button
                  onClick={() => {
                    setIsAddDeviceOpen(false);
                    fetchDevices();
                  }}
                  className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                >
                  완료 및 닫기
                </button>
              </div>
            )}
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
    </div>
  );
}
