"use client";

import { apiFetch } from '@/lib/api';
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
  ArrowRight
} from "lucide-react";
import Navbar from "@/components/Navbar";

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
    }
  }, [status, router, fetchDevices, fetchRules, fetchLogs]);

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
              <span>SheetBot Agent2 스마트 알림 & 0원 문자 센터</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              SheetBot Agent2 연동 & 구글 시트 양방향 문자 자동화
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm max-w-2xl leading-relaxed">
              본인의 스마트폰에 <strong>SheetBot Agent2</strong>를 설치하고 0초 QR 연동하면,
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
              <span>SheetBot Agent2 기기 ({devices.length})</span>
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
          </div>
        </div>

        {/* 탭 1: 내 기기 연동 */}
        {activeTab === "devices" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-900">등록된 SheetBot Agent2 기기</h2>
                <p className="text-xs text-slate-500">문자를 0원에 발송하고 시트로 수신할 안드로이드 스마트폰(SheetBot Agent2)을 관리합니다.</p>
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
                  <span>새 SheetBot Agent2 연동</span>
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
              <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/80 space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
                  <Smartphone className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-800">등록된 디바이스가 없습니다</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    사용 중인 안드로이드 스마트폰을 등록하면, 구글 스프레드시트의 자동화 알림 문자가 회원님의 폰을 통해 무료로 발송됩니다.
                  </p>
                </div>
                <button
                  onClick={() => setIsAddDeviceOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md"
                >
                  <Plus className="w-4 h-4" />
                  <span>지금 스마트폰 연동하기</span>
                </button>
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

                        <span className="text-[10px] text-slate-400">
                          {dev.pairingMode === "google_account" ? "구글 계정 연동" : "QR코드 페어링"}
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
          <div className="space-y-6">
            {/* 자연어 규칙 생성 폼 */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">자연어 발송 템플릿 &amp; 자동 발송 규칙</h3>
                  <p className="text-xs text-slate-500">
                    발송 조건과 문자 문구를 자연어로 입력하면, AI가 치환 변수(예: &#123;&#123;고객명&#125;&#125;, &#123;&#123;주문금액&#125;&#125;)와 트리거를 자동 분석해 등록합니다.
                  </p>
                </div>
              </div>

              <form onSubmit={handleCreateRule} className="space-y-3">
                <div className="relative">
                  <textarea
                    value={promptInput}
                    onChange={(e) => setPromptInput(e.target.value)}
                    placeholder="예: D열의 주문상태가 '결제완료'로 바뀌면 고객 연락처로 감사 문자를 보내줘"
                    rows={3}
                    className="w-full p-4 rounded-2xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-xs sm:text-sm resize-none"
                  />
                  <button
                    type="submit"
                    disabled={creatingRule || !promptInput.trim()}
                    className="absolute right-3 bottom-3.5 px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {creatingRule ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>AI 분석 및 등록 중...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        <span>규칙 생성</span>
                      </>
                    )}
                  </button>
                </div>

                {/* 예시 프롬프트 칩 */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] text-slate-400 font-bold mr-1">추천 예시:</span>
                  {SAMPLE_PROMPTS.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setPromptInput(p)}
                      className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] transition-colors cursor-pointer"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </form>
            </div>

            {/* 규칙 목록 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-slate-900">등록된 발송 템플릿 &amp; 규칙 목록</h3>
                <button
                  onClick={fetchRules}
                  disabled={loadingRules}
                  className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 transition-all cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingRules ? "animate-spin" : ""}`} />
                </button>
              </div>

              {loadingRules ? (
                <div className="bg-white rounded-2xl p-8 text-center border border-slate-200">
                  <RefreshCw className="w-5 h-5 animate-spin text-indigo-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-500 font-bold">규칙을 불러오는 중...</p>
                </div>
              ) : rules.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 text-slate-500 text-xs">
                  등록된 스마트 알림 규칙이 없습니다. 위 입력창에서 자연어로 새 규칙을 생성해 보세요!
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {rules.map((rule) => (
                    <div
                      key={rule.id}
                      className={`bg-white rounded-2xl p-5 border transition-all flex flex-col justify-between space-y-3 ${
                        rule.is_active === 1 ? "border-slate-200 shadow-sm" : "border-slate-200 opacity-60 bg-slate-50/50"
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-black border border-indigo-100">
                            {rule.trigger_event === "row_added" ? "새 행 추가" : "시트 셀 수정"}
                          </span>
                          <button
                            onClick={() => handleToggleRule(rule)}
                            className="flex items-center gap-1 text-xs font-extrabold cursor-pointer"
                          >
                            {rule.is_active === 1 ? (
                              <span className="text-emerald-600 flex items-center gap-1">
                                <ToggleRight className="w-5 h-5" /> 활성
                              </span>
                            ) : (
                              <span className="text-slate-400 flex items-center gap-1">
                                <ToggleLeft className="w-5 h-5" /> 꺼짐
                              </span>
                            )}
                          </button>
                        </div>

                        <h4 className="font-black text-sm text-slate-900">{rule.name}</h4>
                        <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          {rule.prompt}
                        </p>

                        <div className="text-[11px] text-slate-500 space-y-1 pt-1">
                          <div>
                            <strong>수신 대상:</strong>{" "}
                            {rule.target_recipient === "self"
                              ? "회원 본인 휴대폰"
                              : `시트의 '${rule.recipient_column || "연락처"}' 열 고객 번호`}
                          </div>
                          <div className="truncate">
                            <strong>메시지 내용:</strong> {rule.message_template}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-end pt-2 border-t border-slate-100">
                        <button
                          onClick={() => handleDeleteRule(rule)}
                          className="text-slate-400 hover:text-rose-600 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>삭제</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 탭 3: 알림 발송 이력 */}
        {activeTab === "logs" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">최근 문자 발송 이력</h3>
                <p className="text-xs text-slate-500">회원님의 폰을 통해 발송된 알림 문자의 성공 및 실패 기록입니다.</p>
              </div>
              <button
                onClick={fetchLogs}
                disabled={loadingLogs}
                className="p-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 transition-all cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${loadingLogs ? "animate-spin" : ""}`} />
              </button>
            </div>

            {loadingLogs ? (
              <div className="bg-white rounded-2xl p-8 text-center border border-slate-200">
                <RefreshCw className="w-5 h-5 animate-spin text-amber-600 mx-auto mb-2" />
                <p className="text-xs text-slate-500 font-bold">발송 기록을 조회하는 중...</p>
              </div>
            ) : logs.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 text-slate-500 text-xs">
                아직 발송된 알림 이력이 없습니다.
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 font-extrabold border-b border-slate-200">
                        <th className="p-3.5">발송 일시</th>
                        <th className="p-3.5">규칙 / 이벤트</th>
                        <th className="p-3.5">수신 번호</th>
                        <th className="p-3.5">발송 내용</th>
                        <th className="p-3.5">상태</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {logs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/50">
                          <td className="p-3.5 text-slate-500 whitespace-nowrap">
                            {log.created_at ? log.created_at.replace("T", " ").slice(0, 19) : "-"}
                          </td>
                          <td className="p-3.5 font-bold text-slate-800 whitespace-nowrap">
                            {log.rule_name || "스마트 알림"}
                          </td>
                          <td className="p-3.5 text-indigo-600 font-mono font-bold whitespace-nowrap">
                            {log.recipient}
                          </td>
                          <td className="p-3.5 text-slate-700 max-w-xs truncate" title={log.content}>
                            {log.content}
                          </td>
                          <td className="p-3.5 whitespace-nowrap">
                            {log.status === "SUCCESS" ? (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-black border border-emerald-200 text-[10px]">
                                발송 성공
                              </span>
                            ) : (
                              <span
                                className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-black border border-rose-200 text-[10px]"
                                title={log.error_message}
                              >
                                실패: {log.error_message || "오류"}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 탭 4: 실전 활용 가이드 */}
        {activeTab === "guide" && (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-800 text-xs font-black rounded-full border border-emerald-200">
                <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                <span>SheetBot Agent2 양방향 자동화 매뉴얼</span>
              </div>
              <h3 className="text-xl font-black text-slate-900">
                내 스마트폰을 24시간 0원 문자 발송 &amp; 시트 수신 서버로 활용하기
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed max-w-3xl">
                복잡한 코드를 복사하거나 붙여넣을 필요가 없습니다. 
                스마트폰에 <strong>SheetBot Agent2</strong> 앱을 설치하고 QR 코드를 1초 만에 스캔하면,
                구글 스프레드시트와 스마트폰이 안전하게 1:1로 결합되어 완벽한 양방향 문자 자동화가 시작됩니다.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* 카드 1: 발신 (시트 -> 고객) */}
              <div className="bg-white rounded-3xl p-6 sm:p-7 border border-emerald-200 shadow-sm space-y-4 relative overflow-hidden">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-xs">
                    1
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold text-emerald-600 uppercase tracking-wider">Outbound • 발신</span>
                    <h4 className="text-sm font-extrabold text-slate-900">구글 시트 ➔ 고객 알림 0원 일괄 발송</h4>
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  시중 유료 알림톡/문자 서비스(건당 20~40원) 대신, 스마트폰 요금제의 <strong>무제한 무료 문자</strong>를 사용하여 시트 고객들에게 대량 문자를 자동 발송합니다.
                </p>

                <div className="space-y-2.5 pt-1 text-xs text-slate-700">
                  <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-900">A열 체크박스 선택:</strong>
                      <div className="text-[11px] text-slate-500 mt-0.5">시트에서 문자를 보낼 고객 행의 체크박스를 선택합니다.</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-900">[📱 선택 행 문자 일괄 발송] 메뉴 클릭:</strong>
                      <div className="text-[11px] text-slate-500 mt-0.5">시트 상단 🚀 SheetBot 메뉴에서 원클릭으로 발송을 실행합니다.</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-900">기기 점검 &amp; 원스톱 승인:</strong>
                      <div className="text-[11px] text-slate-500 mt-0.5">기기 연결 상태와 대상 건수를 확인 후 승인 시 즉시 0원으로 전송됩니다.</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 카드 2: 수신 (스마트폰 -> 시트) */}
              <div className="bg-white rounded-3xl p-6 sm:p-7 border border-indigo-200 shadow-sm space-y-4 relative overflow-hidden">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xs">
                    2
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold text-indigo-600 uppercase tracking-wider">Inbound • 수신</span>
                    <h4 className="text-sm font-extrabold text-slate-900">스마트폰 수신 문자 ➔ 구글 시트 자동 기록</h4>
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  스마트폰으로 들어온 <strong>쇼핑몰 결제 문자, 법인카드 승인 SMS, 고객의 회신 답장</strong>을 실시간 감지하여 구글 시트에 1초 만에 자동 기록합니다.
                </p>

                <div className="space-y-2.5 pt-1 text-xs text-slate-700">
                  <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                    <CheckCircle2 className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-900">키워드 자동 필터링:</strong>
                      <div className="text-[11px] text-slate-500 mt-0.5">[입금완료], [결제], 은행명 등 지정한 조건의 SMS만 정확히 수집합니다.</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                    <CheckCircle2 className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-900">구글 시트 1행 추가 (Realtime):</strong>
                      <div className="text-[11px] text-slate-500 mt-0.5">일시, 발신번호, 결제금액, 주문내역을 분리하여 다음 빈 행에 자동 기입합니다.</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                    <CheckCircle2 className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-900">스마트 후속 자동화 연계:</strong>
                      <div className="text-[11px] text-slate-500 mt-0.5">기록과 동시에 재고 차감이나 감사 이메일 발송 등 연쇄 파이프라인이 즉시 작동합니다.</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 원클릭 AI 자동 주입 안내 배너 */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-7 text-white border border-indigo-500/20 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
                  <Sparkles className="w-4 h-4" />
                  <span>수동 복붙 없이 0초 만에 시트에 기능 주입</span>
                </div>
                <h4 className="text-base font-extrabold text-white">
                  새 시트에 문자 발송 기능을 넣고 싶으신가요?
                </h4>
                <p className="text-slate-300 text-xs leading-relaxed max-w-2xl">
                  시트 상단 <strong>[🚀 SheetBot 메뉴] ➔ [🤖 SheetBot AI 코파일럿]</strong>을 열고 
                  <em>"A열 체크박스 선택 행으로 고객에게 문자 발송하는 메뉴 만들어줘"</em>라고 말씀만 하시면, 
                  시트봇 AI가 필요한 Apps Script 코드를 구글 클라우드에 원클릭으로 직접 주입합니다.
                </p>
              </div>

              <a
                href="/dashboard"
                className="px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 flex-shrink-0 active:scale-95"
              >
                <span>내 워크스페이스 바로가기</span>
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        )}
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
                  <h3 className="text-base font-extrabold text-slate-900">SheetBot Agent2 기기 연동</h3>
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
                <span>SheetBot Agent2 (0초)</span>
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
                    <div className="text-[11px] text-slate-500 mt-0.5">안드로이드 스마트폰에 SheetBot Agent2를 설치하세요.</div>
                  </div>
                  <a
                    href="https://sheetbot.cloud/download/SheetBotAgent2.apk"
                    target="_blank"
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1 flex-shrink-0"
                  >
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
