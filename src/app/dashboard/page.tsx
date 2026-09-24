"use client";

import { apiFetch, getEgdeskBasePath } from '@/lib/api';
import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Bot, Plus, FileCode, Clock, Calendar, RefreshCw, CheckCircle2, AlertTriangle,
  X, ArrowRight, ExternalLink, Sparkles, Layers, ShieldCheck, Trash2, Smartphone, Edit3,
  Globe, Star, Coins, Activity, Cpu, Settings, FileSpreadsheet, Copy, Briefcase, Send,
  KeyRound, LogOut
} from "lucide-react";
import Navbar from "@/components/Navbar";
import nextDynamic from "next/dynamic";

// 날짜 및 시각 표시 헬퍼 (YYYY.MM.DD HH:mm)
function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      return String(dateStr).replace("T", " ").slice(0, 16);
    }
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

const NewProjectModal = nextDynamic(() => import("@/components/NewProjectModal"));
const QuickWrapSuccessModal = nextDynamic(() => import("@/components/QuickWrapSuccessModal"));
const EditProjectPromptModal = nextDynamic(() => import("@/components/EditProjectPromptModal"));
const ScheduleManager = nextDynamic(() => import("@/components/ScheduleManager"));
const FeedbackModal = nextDynamic(() => import("@/components/FeedbackModal"));
const ApiKeyModal = nextDynamic(() => import("@/components/ApiKeyModal"));
const WithdrawModal = nextDynamic(() => import("@/components/WithdrawModal"));
const FdeRequestModal = nextDynamic(() => import("@/components/dashboard/FdeRequestModal"), { ssr: false });
const FdeRecruitModal = nextDynamic(() => import("@/components/dashboard/FdeRecruitModal"), { ssr: false });

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // ⚡ SWR 캐시로 이전 방문 데이터 즉시 복원 (0초 렌더링)
  const [projects, setProjects] = useState<any[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = sessionStorage.getItem("sheetbot_cache_projects");
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return [];
  });
  const [trashedProjects, setTrashedProjects] = useState<any[]>([]);
  const [showTrashed, setShowTrashed] = useState(false);
  const [schedules, setSchedules] = useState<any[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = sessionStorage.getItem("sheetbot_cache_schedules");
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return [];
  });
  const [loading, setLoading] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        if (sessionStorage.getItem("sheetbot_cache_projects")) return false;
      } catch {}
    }
    return true;
  });
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [urlSheetParam, setUrlSheetParam] = useState<string>("");
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<any | null>(null);
  const [alertMessage, setAlertMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copyingBridgeProjectId, setCopyingBridgeProjectId] = useState<string | null>(null);

  // 1초 래핑 전용 초심플 모달 상태
  const [quickWrapData, setQuickWrapData] = useState<{
    isOpen: boolean;
    sheetUrl: string;
    bridgeUrl: string;
    promptTemplate: string;
    projectName: string;
    isExisting?: boolean;
  }>({
    isOpen: false,
    sheetUrl: "",
    bridgeUrl: "",
    promptTemplate: "",
    projectName: "",
    isExisting: false,
  });

  // 랜딩페이지에서 ?sheetUrl=... 또는 localStorage로 유입된 경우 1초 래핑 즉시 실행 및 전용 모달 오픈
  useEffect(() => {
    if (status === "loading") return;
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("modal") === "fde" || params.get("fde") === "true") {
        setIsFdeModalOpen(true);
        const fdeSheet = params.get("sheetUrl");
        const fdeReq = params.get("req");
        if (fdeSheet) setFdeInitialSheetUrl(fdeSheet);
        if (fdeReq) setFdeInitialReq(fdeReq);
      }
      if (params.get("modal") === "fde-recruit" || params.get("recruit") === "true") {
        setIsFdeRecruitOpen(true);
        if (params.get("apply") === "true") {
          setIsApplyingFde(true);
        }
      }
      let sheetUrl = params.get("sheetUrl");
      let templateName = params.get("templateName") || "";
      let presetPrompt = params.get("presetPrompt") || "";

      if (!sheetUrl) {
        try {
          sheetUrl = localStorage.getItem("pending_sheet_url");
          if (!templateName) templateName = localStorage.getItem("pending_template_name") || "";
          if (!presetPrompt) presetPrompt = localStorage.getItem("pending_preset_prompt") || "";
        } catch (e) {}
      }

      if (sheetUrl && params.get("modal") !== "fde" && params.get("fde") !== "true") {
        try {
          localStorage.removeItem("pending_sheet_url");
          localStorage.removeItem("pending_template_name");
          localStorage.removeItem("pending_preset_prompt");
          window.history.replaceState({}, "", "/dashboard");
        } catch (e) {}

        // 백엔드에 1초 래핑 등록 요청 후 심플 전용 화면 팝업
        (async () => {
          try {
            const res = await apiFetch("/api/projects/quick-wrap", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sheetUrl, templateName, presetPrompt }),
            });
            const data = await res.json();
            if (data.success) {
              setQuickWrapData({
                isOpen: true,
                sheetUrl: data.sheetUrl || sheetUrl,
                bridgeUrl: data.bridgeUrl,
                promptTemplate: data.promptTemplate,
                projectName: data.projectName || templateName || "시트봇 자동화 프로젝트",
                isExisting: Boolean(data.isExisting),
              });
              // 프로젝트 목록 리로드
              void fetchData();
            } else {
              showAlert({ type: "error", text: data.error || "1초 래핑 처리에 실패했습니다." });
            }
          } catch (err: any) {
            console.error("1초 래핑 처리 오류:", err);
            showAlert({ type: "error", text: err?.message || "1초 래핑 처리 중 오류가 발생했습니다." });
          }
        })();
      }
    }
  }, [status]);

  // 요약 카드용 실시간 계정 자원 상태 (SWR 캐시 복원)
  const [wallet, setWallet] = useState<{
    balanceTokens: number;
    totalPurchasedTokens?: number;
    totalUsedTokens?: number;
    tier: string;
  } | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = sessionStorage.getItem("sheetbot_cache_wallet");
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return null;
  });
  const [usageCostKrw, setUsageCostKrw] = useState<number>(0);
  const [usageTokens, setUsageTokens] = useState<number>(0);
  const [usageCalls, setUsageCalls] = useState<number>(0);
  const [isAdminUser, setIsAdminUser] = useState<boolean>(false);
  const [deviceCount, setDeviceCount] = useState<number>(0);
  const [ruleCount, setRuleCount] = useState<number>(0);
  const [currentModel, setCurrentModel] = useState<string>("Gemini 3.8 Flash");

  // 피드백 모달 상태
  const [feedbackTargetProject, setFeedbackTargetProject] = useState<any | null>(null);

  // 전문가(FDE) 맞춤 의뢰 모달 상태
  const [isFdeModalOpen, setIsFdeModalOpen] = useState(false);
  const [fdeInitialSheetUrl, setFdeInitialSheetUrl] = useState("");
  const [fdeInitialReq, setFdeInitialReq] = useState("");

  // FDE 파트너 모집 팝업 & 지원 모달 상태
  const [isFdeRecruitOpen, setIsFdeRecruitOpen] = useState(false);
  const [isApplyingFde, setIsApplyingFde] = useState(false);

  // 접속 시 오늘 하루 보지 않기 여부 체크 후 팝업 오픈
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hideUntil = localStorage.getItem("sheetbot_fde_recruit_hide_until");
      if (!hideUntil || Date.now() > Number(hideUntil)) {
        const timer = setTimeout(() => {
          setIsFdeRecruitOpen(true);
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  // 데이터 로드 (1단계: 필수 핵심 데이터 즉시 로드 -> 2단계: 보조 메트릭 백그라운드 지연 로드)
  const fetchData = useCallback(async () => {
    // SWR 캐시가 없는 경우에만 로딩 스피너 표출
    if (!projects.length && !wallet) {
      setLoading(true);
    }

    // 다층 신분증 식별: NextAuth 세션 이메일 1순위, 브라우저 localStorage 캐시 2순위
    let effectiveEmail = session?.user?.email ? session.user.email.toLowerCase().trim() : "";
    if (!effectiveEmail && typeof window !== "undefined") {
      try {
        effectiveEmail = (localStorage.getItem("sheetbot_user_email") || "").toLowerCase().trim();
      } catch {}
    }

    const localSessionId = typeof window !== "undefined" ? localStorage.getItem("egdesk_visitor_session") : null;

    const userParam = effectiveEmail ? `&userEmail=${encodeURIComponent(effectiveEmail)}` : "";
    const fetchHeaders: Record<string, string> = {};
    if (effectiveEmail) {
      fetchHeaders["x-sheetbot-user-email"] = effectiveEmail;
    }
    if (localSessionId) {
      fetchHeaders["x-visitor-session-id"] = localSessionId;
      fetchHeaders["Authorization"] = `Bearer ${localSessionId}`;
    }

    try {
      const fetchPromise = Promise.all([
        apiFetch(`/api/projects?${userParam}`, { headers: fetchHeaders }).then((r) => r.json()).catch(() => ({})),
        apiFetch(`/api/schedules?${userParam}`, { headers: fetchHeaders }).then((r) => r.json()).catch(() => ({})),
        apiFetch(`/api/wallet?${userParam}`, { headers: fetchHeaders }).then((r) => r.json()).catch(() => ({})),
      ]);

      // ⚡ 비동기 보장: 타임아웃과 상관없이 실제 응답이 도착하는 즉시 상태 갱신
      fetchPromise.then(([projRes, schedRes, walletRes]) => {
        if (projRes?.success && Array.isArray(projRes.projects)) {
          setProjects(projRes.projects);
          try { sessionStorage.setItem("sheetbot_cache_projects", JSON.stringify(projRes.projects)); } catch {}
        }
        if (schedRes?.success && Array.isArray(schedRes.schedules)) {
          setSchedules(schedRes.schedules);
          try { sessionStorage.setItem("sheetbot_cache_schedules", JSON.stringify(schedRes.schedules)); } catch {}
        }
        if (walletRes?.success && walletRes.wallet) {
          setWallet(walletRes.wallet);
          try { sessionStorage.setItem("sheetbot_cache_wallet", JSON.stringify(walletRes.wallet)); } catch {}
        }
      }).catch((err) => console.warn("Dashboard async primary update note:", err));

      // 🚀 [1단계: 즉각 렌더링] 6초 타임아웃 가드로 스피너 해제
      const timeoutGuard = new Promise<any>((resolve) =>
        setTimeout(() => resolve([{ success: false }, { success: false }, { success: false }]), 6000)
      );

      const [projRes, schedRes, walletRes] = await Promise.race([fetchPromise, timeoutGuard]);

      if (projRes?.success && Array.isArray(projRes.projects)) {
        setProjects(projRes.projects);
        try { sessionStorage.setItem("sheetbot_cache_projects", JSON.stringify(projRes.projects)); } catch {}
      }
      if (schedRes?.success && Array.isArray(schedRes.schedules)) {
        setSchedules(schedRes.schedules);
        try { sessionStorage.setItem("sheetbot_cache_schedules", JSON.stringify(schedRes.schedules)); } catch {}
      }
      if (walletRes?.success && walletRes.wallet) {
        setWallet(walletRes.wallet);
        try { sessionStorage.setItem("sheetbot_cache_wallet", JSON.stringify(walletRes.wallet)); } catch {}
      }
    } catch (err) {
      console.error("Dashboard primary fetch error:", err);
    } finally {
      // 1단계 핵심 데이터 로드 즉시 화면 스켈레톤/스피너 해제!
      setLoading(false);
    }

    // ⚡ [2단계: 백그라운드 병렬 수신] 보조 배지 및 세부 통계 (AI 사용량, 디바이스, 스마트 규칙, 설정, 휴지통)
    void Promise.all([
      apiFetch(`/api/admin/ai-usage?range=month&limit=1${userParam}`, { headers: fetchHeaders }).then((r) => r.json()).catch(() => ({})),
      apiFetch(`/api/user/devices?${userParam}`, { headers: fetchHeaders }).then((r) => r.json()).catch(() => ({})),
      apiFetch(`/api/user/smart-rules?${userParam}`, { headers: fetchHeaders }).then((r) => r.json()).catch(() => ({})),
      apiFetch(`/api/admin/settings`, { headers: fetchHeaders }).then((r) => r.json()).catch(() => ({})),
      apiFetch(`/api/projects?includeTrashed=true${userParam}`, { headers: fetchHeaders }).then((r) => r.json()).catch(() => ({})),
    ]).then(([usageRes, devRes, ruleRes, settingsRes, trashedProjRes]) => {
      if (trashedProjRes?.success) setTrashedProjects(trashedProjRes.projects || []);
      if (usageRes?.success) {
        setIsAdminUser(!!usageRes.isAdmin);
        if (usageRes.summary) {
          setUsageCostKrw(usageRes.summary.totalCostKrw ?? usageRes.summary.costKrw ?? 0);
          setUsageTokens(usageRes.summary.totalTokens ?? 0);
          setUsageCalls(usageRes.summary.totalCalls ?? 0);
        }
      }
      if (devRes?.success) setDeviceCount((devRes.devices || []).length);
      if (ruleRes?.success) setRuleCount((ruleRes.rules || []).length);
      if (settingsRes?.success && settingsRes.settings?.defaultModel) {
        const m = settingsRes.settings.defaultModel;
        setCurrentModel(
          m === "gemini-3.8-flash" ? "Gemini 3.8 Flash" :
          m === "gemini-3.5-flash" ? "Gemini 3.5 Flash" :
          m === "gemini-2.5-flash" ? "Gemini 2.5 Flash" : m
        );
      }
    }).catch((err) => console.warn("Dashboard secondary metrics load note:", err));
  }, [session?.user?.email]);

  useEffect(() => {
    let isMounted = true;

    // 🚀 세션 확인 또는 로컬스토리지 토큰이 있으면 터널 점검 대기 없이 '즉시' 데이터 로드 시작
    void fetchData();

    const checkAuth = async () => {
      const localSessionId = typeof window !== "undefined" ? localStorage.getItem("egdesk_visitor_session") : null;
      let currentEmail = session?.user?.email ? session.user.email.toLowerCase().trim() : null;

      if (currentEmail) {
        try { localStorage.setItem("sheetbot_user_email", currentEmail); } catch {}
      } else if (typeof window !== "undefined") {
        currentEmail = localStorage.getItem("sheetbot_user_email");
      }

      // 0. 브라우저 localStorage에 저장된 최신 visitorSessionId를 서버 DB에 백그라운드 동기화
      try {
        if (localSessionId && currentEmail) {
          void apiFetch("/api/auth/google/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: currentEmail,
              name: session?.user?.name || currentEmail.split("@")[0],
              visitorSessionId: localSessionId,
            }),
          }).catch(() => {});
        }
      } catch {}

      // 1. 미로그인 상태이거나 세션 이메일이 없는 경우 Visitor Google 계정 상태 검사 및 세션 복구 수행
      if (status === "unauthenticated" || !session?.user?.email) {
        try {
          const { getVisitorGoogleStatus } = await import("@/egdesk-visitor-google");
          const visitorStatus = await getVisitorGoogleStatus();

          if (visitorStatus?.connected && visitorStatus?.email) {
            const vEmail = visitorStatus.email.toLowerCase().trim();
            try { localStorage.setItem("sheetbot_user_email", vEmail); } catch {}

            const syncRes = await apiFetch("/api/auth/google/session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: vEmail,
                name: visitorStatus.email.split("@")[0],
                visitorSessionId: localSessionId || undefined,
              }),
            });
            if (syncRes.ok) {
              void fetchData();
              return;
            }
          }
        } catch (err) {
          console.warn("Visitor session auto-recovery error:", err);
        }

        // Visitor 세션조차 없을 때만 /login으로 안전하게 이동
        if (isMounted && !localSessionId) {
          const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
          const match = currentPath.match(/^(\/t\/[^\/]+\/p\/[^\/]+)/);
          const prefix = match ? match[1] : "";
          window.location.href = `${prefix}/login`;
        }
      }
    };

    void checkAuth();

    return () => {
      isMounted = false;
    };
  }, [status, session?.user?.email, fetchData]);

  // ⚡ [0초 실시간 감시] 이지데스크 DB 왓처 실시간 스트림 연동 (프로젝트/스케줄/토큰)
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
      const streamUrl = `${basePath}/api/realtime/stream?topic=all&userEmail=${encodeURIComponent(email)}`;

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
              if (
                payload.tableName === "sheetbot_projects" ||
                payload.tableName === "sheetbot_schedules" ||
                payload.tableName === "sheetbot_users" ||
                payload.tableName === "sheetbot_deposit_requests"
              ) {
                fetchData();
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
  }, [status, session?.user?.email, fetchData]);

  const [syncingProjectId, setSyncingProjectId] = useState<string | null>(null);
  const [syncingCodeProjectId, setSyncingCodeProjectId] = useState<string | null>(null);

  const showAlert = (msg: { type: "success" | "error"; text: string }) => {
    setAlertMessage(msg);
    setTimeout(() => setAlertMessage(null), 5000);
  };

  // 구글 시트에서 직접 수정한 최신 Apps Script 코드를 SheetBot DB로 동기화하는 핸들러
  const handleSyncProjectCode = async (p: any) => {
    setSyncingCodeProjectId(p.id);
    try {
      const res = await apiFetch("/api/projects/sync-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: p.id }),
      });
      const data = await res.json().catch(() => ({}));

      if (!data?.success) {
        throw new Error(data?.error || "구글 시트 코드 동기화에 실패했습니다.");
      }

      // 로컬 프로젝트 목록의 scriptCode 즉시 갱신
      setProjects((prev) =>
        prev.map((proj) =>
          proj.id === p.id
            ? {
                ...proj,
                scriptCode: data.scriptCode,
                script_code: data.scriptCode,
                updatedAt: data.syncedAt,
                updated_at: data.syncedAt,
              }
            : proj
        )
      );

      showAlert({
        type: "success",
        text: `'${p.name}' 구글 시트의 최신 Apps Script 코드(${data.functionNames?.length || 0}개 함수)가 SheetBot DB에 동기화되었습니다.`,
      });
    } catch (err: any) {
      showAlert({ type: "error", text: err.message || "코드 동기화 중 오류가 발생했습니다." });
    } finally {
      setSyncingCodeProjectId(null);
    }
  };

  // 구글 시트 원본 제목으로 프로젝트 이름 동기화 핸들러
  const handleSyncProjectTitle = async (p: any) => {
    const urlOrId = p.spreadsheetUrl || p.spreadsheet_url || p.spreadsheetId || p.spreadsheet_id;
    if (!urlOrId) {
      showAlert({ type: "error", text: "연결된 구글 시트 URL 또는 ID 정보가 없습니다." });
      return;
    }

    setSyncingProjectId(p.id);
    try {
      // 1. 최신 시트 원본 제목 조회
      const titleRes = await apiFetch(`/api/sheets/title?url=${encodeURIComponent(urlOrId)}`);
      const titleData = await titleRes.json().catch(() => ({}));

      if (!titleData?.success || !titleData?.title) {
        throw new Error(titleData?.error || "구글 시트 제목을 가져오지 못했습니다.");
      }

      const newTitle = titleData.title.trim();

      // 2. DB 프로젝트 이름 업데이트 및 Apps Script 코드 구글 클라우드 재배포 (PATCH)
      const updateRes = await apiFetch("/api/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, name: newTitle, redeploy: true }),
      });
      const updateData = await updateRes.json().catch(() => ({}));

      if (!updateData?.success) {
        throw new Error(updateData?.error || "프로젝트 이름 업데이트에 실패했습니다.");
      }

      // 3. 로컬 프로젝트 목록 즉시 갱신
      setProjects((prev) =>
        prev.map((proj) => (proj.id === p.id ? { ...proj, name: newTitle } : proj))
      );

      showAlert({
        type: "success",
        text: `'${newTitle}' 시트명 동기화 및 자동화 코드 클라우드 배포가 완료되었습니다.`,
      });
    } catch (err: any) {
      showAlert({ type: "error", text: err.message || "시트 이름 동기화에 실패했습니다." });
    } finally {
      setSyncingProjectId(null);
    }
  };

  // AI 에이전트 연동 주소 및 프롬프트 복사 핸들러
  const handleCopyAgentBridgeUrl = async (p: any) => {
    setCopyingBridgeProjectId(p.id);
    try {
      const res = await apiFetch("/api/projects/bridge-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: p.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data?.success) {
        throw new Error(data?.error || "AI 연동 주소 발급에 실패했습니다.");
      }

      await navigator.clipboard.writeText(data.promptTemplate);
      showAlert({
        type: "success",
        text: `🤖 AI 연동 프롬프트가 복사되었습니다! 안티그라비티나 AI 채팅창에 붙여넣어 코드를 자동 주입하세요.`,
      });
    } catch (err: any) {
      showAlert({ type: "error", text: err.message || "주소 복사 중 오류가 발생했습니다." });
    } finally {
      setCopyingBridgeProjectId(null);
    }
  };

  const handleDeleteProject = async (p: any) => {
    if (
      !window.confirm(
        `'${p.name}' 프로젝트를 삭제하시겠습니까?\n\n[안내]\n1. 삭제 즉시 구글 시트 및 외부 AI(안티그라비티 등) 연동이 즉시 차단(HTTP 410)됩니다.\n2. 삭제 후 14일 복구 유예 기간 내에는 휴지통에서 언제든 1클릭 복원할 수 있습니다.`
      )
    ) {
      return;
    }

    const targetId = p.id || p.gasProjectId || p.spreadsheetId;
    if (!targetId) {
      showAlert({ type: "error", text: "삭제할 프로젝트의 식별자(ID)를 찾을 수 없습니다." });
      return;
    }

    try {
      const res = await apiFetch(`/api/projects?id=${encodeURIComponent(targetId)}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        showAlert({ type: "success", text: "프로젝트가 성공적으로 삭제되었습니다. (14일 내 휴지통에서 복원 가능)" });
        fetchData();
      } else {
        showAlert({ type: "error", text: data.error || "삭제 실패" });
      }
    } catch (err: any) {
      showAlert({ type: "error", text: err.message || "통신 오류" });
    }
  };

  const handleRestoreProject = async (p: any) => {
    if (!window.confirm(`'${p.name}' 프로젝트를 복원하시겠습니까?\n복원 즉시 외부 AI 에이전트 연동 및 서비스가 다시 활성화됩니다.`)) {
      return;
    }

    try {
      const res = await apiFetch("/api/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, restore: true }),
      });
      const data = await res.json();
      if (data.success) {
        showAlert({ type: "success", text: "프로젝트가 성공적으로 복원되었습니다!" });
        fetchData();
      } else {
        showAlert({ type: "error", text: data.error || "복원 실패" });
      }
    } catch (err: any) {
      showAlert({ type: "error", text: err.message || "통신 오류" });
    }
  };

  if (status === "loading" || (!session?.user && status !== "unauthenticated")) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-500 text-sm font-bold">
          <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
          <span>구글 계정 세션 확인 중...</span>
        </div>
      </div>
    );
  }

  const activeSchedulesCount = schedules.filter((s) => s.status === "ACTIVE").length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800 text-left">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* 알림 토스트 */}
        {alertMessage && (
          <div
            className={`p-4 rounded-2xl flex items-center justify-between gap-3 text-xs font-bold animate-fade-in ${
              alertMessage.type === "success"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : "bg-rose-50 text-rose-800 border border-rose-200"
            }`}
          >
            <div className="flex items-center gap-2">
              {alertMessage.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{alertMessage.text}</span>
            </div>
            <button onClick={() => setAlertMessage(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 1. 상단 웰컴 & 통계 헤더 */}
        <div
          className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-5"
          data-easybot-hint="워크스페이스 개요: 로그인된 회원의 Apps Script 자동화 프로젝트와 스케줄 전반의 현황을 요약 표시합니다."
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-extrabold text-slate-800 text-base flex items-center gap-2">
                  <span>{session?.user?.name || "구글 회원"}님의 자동화 워크스페이스</span>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black rounded-md flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    <span>회원 전용 보관</span>
                  </span>
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
              {/* 실시간 DB 왓처 동기화 뱃지 */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200/90 rounded-xl text-xs font-bold whitespace-nowrap shadow-2xs">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isRealtimeLive ? "bg-emerald-500 animate-pulse ring-4 ring-emerald-500/20" : "bg-slate-300"}`} />
                <span className={isRealtimeLive ? "text-emerald-700 font-extrabold" : "text-slate-400"}>
                  {isRealtimeLive ? "⚡ DB 왓처 실시간 동기화" : "스트림 연결 중..."}
                </span>
              </div>

              {/* 새로고침 버튼 */}
              <button
                onClick={fetchData}
                disabled={loading}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shadow-2xs"
                data-easybot-hint="새로고침: 최신 프로젝트 목록 및 스케줄 실행 상태를 My DB에서 다시 동기화합니다."
              >
                <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${loading ? "animate-spin text-emerald-600" : ""}`} />
                <span>새로고침</span>
              </button>

              {/* 에이전트 API 키 */}
              <button
                onClick={() => setIsApiKeyModalOpen(true)}
                className="px-3.5 py-1.5 bg-gradient-to-r from-violet-600 via-indigo-600 to-indigo-700 hover:opacity-95 text-white text-xs font-extrabold rounded-xl flex items-center gap-1.5 transition-all shadow-sm shadow-indigo-500/20 cursor-pointer whitespace-nowrap"
                data-easybot-hint="에이전트 API 키: 안티그라비티 등 외부 AI 에이전트가 내 시트에 자동 접근할 수 있는 개인 API 키를 조회하고 관리합니다."
              >
                <KeyRound className="w-3.5 h-3.5 text-violet-200 shrink-0" />
                <span>에이전트 API 키</span>
              </button>

              {/* 회원 탈퇴 */}
              <button
                onClick={() => setIsWithdrawModalOpen(true)}
                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer border border-transparent hover:border-rose-200 shrink-0"
                title="회원 탈퇴 및 서비스 즉각 차단"
                data-easybot-hint="회원 탈퇴: 계정을 탈퇴하고 모든 API 키, 연동 주소, 스케줄을 즉시 100% 영구 차단합니다."
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 4대 핵심 자원 & 현황 요약 카드 그리드 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 카드 1: 연동 프로젝트 & 스케줄 */}
            <div
              className="bg-slate-50/80 hover:bg-slate-50 p-4 rounded-2xl border border-slate-200/80 transition-all flex flex-col justify-between"
              data-easybot-hint="내 연동 프로젝트: 현재 내 구글 계정에 등록되어 스프레드시트에 바인딩된 Apps Script 프로젝트와 가동 중인 스케줄 현황입니다."
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-bold text-slate-500">내 연동 프로젝트</span>
                  <div className="w-7 h-7 rounded-xl bg-emerald-100/80 text-emerald-700 flex items-center justify-center">
                    <FileCode className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-black text-slate-800 tracking-tight">{projects.length}</span>
                  <span className="text-xs font-bold text-slate-500">개 시트</span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                  <span>활성 스케줄 <strong className="text-amber-700 font-bold">{activeSchedulesCount}개</strong> 가동</span>
                </p>
              </div>

              <div className="pt-3 mt-3 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-medium">자동화 관리</span>
                <button
                  onClick={() => setIsNewProjectModalOpen(true)}
                  className="text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-0.5 hover:underline cursor-pointer"
                >
                  <span>+ 새 프로젝트</span>
                </button>
              </div>
            </div>

            {/* 카드 2: AI 토큰 지갑 & 충전 */}
            <div
              className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                wallet && wallet.balanceTokens < 0
                  ? "bg-rose-50/60 hover:bg-rose-50/80 border-rose-300"
                  : "bg-amber-50/40 hover:bg-amber-50/60 border-amber-200/70"
              }`}
              data-easybot-hint="AI 토큰 잔여량: Apps Script 코드 생성 및 AI 대화에 사용되는 보유 크레딧 잔액입니다. 마이너스 잔액 시 다음 충전 시 자동 차감 정산됩니다."
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span
                    className={`text-xs font-bold ${
                      wallet && wallet.balanceTokens < 0 ? "text-rose-900" : "text-amber-900"
                    }`}
                  >
                    {wallet && wallet.balanceTokens < 0 ? "AI 토큰 (초과 사용)" : "AI 토큰 지갑"}
                  </span>
                  <div
                    className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                      wallet && wallet.balanceTokens < 0
                        ? "bg-rose-200/80 text-rose-800"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    <Coins className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span
                    className={`text-2xl font-black tracking-tight ${
                      wallet && wallet.balanceTokens < 0 ? "text-rose-700" : "text-amber-900"
                    }`}
                  >
                    {(wallet?.balanceTokens ?? 20000).toLocaleString()}
                  </span>
                  <span
                    className={`text-xs font-bold ${
                      wallet && wallet.balanceTokens < 0 ? "text-rose-600" : "text-amber-700"
                    }`}
                  >
                    Token
                  </span>
                </div>
                <p
                  className={`text-[11px] font-medium mt-1 flex flex-wrap items-center gap-1.5 ${
                    wallet && wallet.balanceTokens < 0 ? "text-rose-800/90" : "text-amber-800/80"
                  }`}
                >
                  {wallet && wallet.balanceTokens < 0 ? (
                    <span className="px-1.5 py-0.2 bg-rose-200/80 text-rose-900 rounded font-bold text-[10px]">
                      ⚠️ 초과 사용분 (다음 충전 시 자동 상계)
                    </span>
                  ) : (
                    <>
                      <span className="px-1.5 py-0.2 bg-amber-200/60 text-amber-900 rounded font-bold text-[10px]">
                        {wallet?.tier || "FREE"} 플랜
                      </span>
                      <span>보유 중</span>
                    </>
                  )}
                  {wallet?.totalPurchasedTokens ? (
                    <span className="text-[10px] opacity-80 font-semibold">
                      (총 적립 {wallet.totalPurchasedTokens.toLocaleString()})
                    </span>
                  ) : null}
                </p>
              </div>

              <div
                className={`pt-3 mt-3 border-t flex items-center justify-between text-[11px] ${
                  wallet && wallet.balanceTokens < 0 ? "border-rose-200/80" : "border-amber-200/60"
                }`}
              >
                <span
                  className={`font-medium ${
                    wallet && wallet.balanceTokens < 0 ? "text-rose-700" : "text-amber-700/80"
                  }`}
                >
                  {wallet && wallet.balanceTokens < 0 ? "정산 필요" : "선불형 크레딧"}
                </span>
                <Link
                  href="/dashboard/pricing"
                  className={`font-bold flex items-center gap-0.5 hover:underline ${
                    wallet && wallet.balanceTokens < 0
                      ? "text-rose-900 hover:text-rose-950 font-black"
                      : "text-amber-800 hover:text-amber-950"
                  }`}
                >
                  <span>{wallet && wallet.balanceTokens < 0 ? "정산 및 충전 ➔" : "토큰 충전 ➔"}</span>
                </Link>
              </div>
            </div>

            {/* 카드 3: AI 사용량 관제 */}
            <div
              className="bg-indigo-50/40 hover:bg-indigo-50/60 p-4 rounded-2xl border border-indigo-200/70 transition-all flex flex-col justify-between"
              data-easybot-hint={
                isAdminUser
                  ? `AI 사용량 관제: 이번 달 호출된 총 AI 토큰과 구글 클라우드에 납부될 순수 API 원가(실비용 ₩${usageCostKrw.toLocaleString()}원)를 모니터링합니다.`
                  : "AI 사용량 관제: 이번 달 스프레드시트 자동화 코드 생성 및 어시스턴트에 사용된 총 AI 토큰과 호출 횟수입니다."
              }
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-bold text-indigo-900">당월 AI 사용량</span>
                  <div className="w-7 h-7 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                    <Activity className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-black text-indigo-900 tracking-tight">
                    {usageTokens.toLocaleString()}
                  </span>
                  <span className="text-xs font-bold text-indigo-700">Token</span>
                </div>
                <div className="text-[11px] text-indigo-800/80 font-medium mt-1 flex flex-wrap items-center gap-1.5">
                  <span>총 <strong>{usageCalls}회</strong> 자동화 호출</span>
                  {isAdminUser && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-200/60 text-indigo-950 font-bold border border-indigo-300/60">
                      API 원가 ₩{usageCostKrw.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>

              <div className="pt-3 mt-3 border-t border-indigo-200/60 flex items-center justify-between text-[11px]">
                <span className="text-indigo-700/80 font-medium">사용량 분석</span>
                <Link
                  href="/dashboard/ai-usage"
                  className="text-indigo-800 hover:text-indigo-950 font-bold flex items-center gap-0.5 hover:underline"
                >
                  <span>사용량 관제 ➔</span>
                </Link>
              </div>
            </div>

            {/* 카드 4: AI 모델 환경 설정 */}
            <div
              className="bg-slate-50/80 hover:bg-slate-50 p-4 rounded-2xl border border-slate-200/80 transition-all flex flex-col justify-between"
              data-easybot-hint="AI 모델 환경 설정: 코드 생성 및 어시스턴트에 적용되는 Google Gemini 모델과 파라미터를 변경합니다."
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-bold text-slate-700">적용 AI 모델</span>
                  <div className="w-7 h-7 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center">
                    <Cpu className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-base sm:text-lg font-black text-slate-800 tracking-tight truncate max-w-full">
                    {currentModel}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium mt-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="truncate">Apps Script 코드 특화</span>
                </p>
              </div>

              <div className="pt-3 mt-3 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-medium">파라미터 설정</span>
                <Link
                  href="/dashboard/settings"
                  className="text-slate-700 hover:text-indigo-600 font-bold flex items-center gap-0.5 hover:underline"
                >
                  <span>모델 설정 ➔</span>
                </Link>
              </div>
            </div>
          </div>

          {/* 구글 메시지 스마트 알림 & 인프라 연결 통합 배너 */}
          <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 rounded-2xl p-4 sm:p-5 border border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-extrabold text-sm text-slate-800">
                    스마트 알림 센터 (내 안드로이드 폰 연동)
                  </h4>
                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-black">
                    통신비 0원
                  </span>
                  <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold">
                    연동 폰 {deviceCount}대 · 발송 규칙 {ruleCount}개
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  스마트폰을 10초 만에 연동하고, "D열 입금완료 시 고객 감사 문자 발송" 같은 자연어 규칙을 설정해 보세요.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
              <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-slate-500 bg-white/80 px-2.5 py-1.5 rounded-xl border border-emerald-200/60">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-bold text-emerald-700">인프라 연동 완료</span>
              </div>

              <Link
                href="/dashboard/notifications"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all shrink-0 active:scale-95"
                data-easybot-hint="스마트 알림 센터: 내 안드로이드 스마트폰을 연동하고 구글 시트 자동 문자 발송 규칙을 관리합니다."
              >
                <span>스마트 알림 센터 열기</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* 마켓플레이스 3대 핵심 템플릿 추천 배너 */}
          <div className="bg-gradient-to-r from-violet-600 via-indigo-600 to-slate-900 rounded-2xl p-4 sm:p-5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-md shadow-indigo-500/10">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-amber-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-amber-400 text-slate-900 text-[10px] font-black">
                    100% 무료 제공
                  </span>
                  <h4 className="font-black text-sm text-white">
                    SheetBot 공식 검증 4대 킬러 자동화 템플릿
                  </h4>
                </div>
                <p className="text-xs text-indigo-100 mt-0.5 leading-relaxed">
                  문자 대량 발송 · Gmail 일괄 발송 · 명함/영수증 AI OCR · 통화 녹음 AI 분석 시트를 클릭 1번에 내 구글 드라이브로 복제하세요.
                </p>
              </div>
            </div>

            <Link
              href="/marketplace"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-50 text-indigo-950 text-xs font-black rounded-xl shadow-md transition-all shrink-0 active:scale-95 self-end sm:self-center"
              data-easybot-hint="템플릿 마켓플레이스: 실무 검증 4대 시트를 즉시 내 구글 드라이브로 복제합니다."
            >
              <span>템플릿 둘러보기</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* 2. 연동된 Apps Script 프로젝트 목록 */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <h4 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                <FileCode className="w-4 h-4 text-emerald-600" />
                <span>Apps Script 프로젝트</span>
              </h4>

              {/* 활성 vs 휴지통(14일 유예) 탭 스위처 */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setShowTrashed(false)}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    !showTrashed
                      ? "bg-white text-emerald-800 shadow-2xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  활성 ({projects.length})
                </button>
                <button
                  type="button"
                  onClick={() => setShowTrashed(true)}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                    showTrashed
                      ? "bg-white text-rose-700 shadow-2xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                  title="삭제된 프로젝트 (14일 복구 유예)"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>휴지통 ({trashedProjects.length})</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href="/marketplace"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-gradient-to-r from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100 text-amber-900 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all border border-amber-200/80 cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap"
                data-easybot-hint="템플릿 마켓: 검증된 시트 사본을 즉시 복제합니다."
              >
                <Copy className="w-3.5 h-3.5 text-amber-600" />
                <span>🛍️ 템플릿 마켓</span>
              </Link>


              <button
                type="button"
                onClick={() => setIsFdeModalOpen(true)}
                className="px-3 py-1.5 bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 text-indigo-900 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all border border-indigo-200/80 cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap"
                data-easybot-hint="전문가(FDE)에게 의뢰: 복잡한 수식이나 프로세스를 SheetBot 전담 엔지니어에게 1:1 맞춤 제작으로 의뢰합니다."
              >
                <Briefcase className="w-3.5 h-3.5 text-indigo-600" />
                <span>👔 전문가(FDE)에게 의뢰</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsApplyingFde(false);
                  setIsFdeRecruitOpen(true);
                }}
                className="px-2.5 py-1.5 bg-gradient-to-r from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100 text-purple-900 text-xs font-bold rounded-xl flex items-center gap-1 transition-all border border-purple-200/80 cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap"
                data-easybot-hint="FDE 파트너 모집: SheetBot 공인 FDE로 활동하여 시트 자동화 외주를 수주하고 고수익을 창출할 개발자를 모십니다."
                title="FDE 1기 파트너 모집 안내"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                <span>🤝 FDE 파트너 모집</span>
              </button>

              {!showTrashed && (
                <button
                  onClick={() => setIsNewProjectModalOpen(true)}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95 whitespace-nowrap"
                  data-easybot-hint="새 스프레드시트 생성: 새 구글 스프레드시트를 생성하거나 기존 시트를 연동하여 AI 자동화 코드를 주입합니다."
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>새 스프레드시트 생성</span>
                </button>
              )}
            </div>
          </div>

          {showTrashed ? (
            trashedProjects.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-2">
                <Trash2 className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-600">휴지통에 보관된 삭제 프로젝트가 없습니다.</p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  삭제된 프로젝트는 방치된 트리거 차단(HTTP 410) 후 14일간 유예 보관되며 언제든 복원할 수 있습니다.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {trashedProjects.map((p) => {
                  const deletedTime = p.deleted_at ? new Date(p.deleted_at).getTime() : Date.now();
                  const daysLeft = Math.max(0, Math.ceil(14 - (Date.now() - deletedTime) / (1000 * 60 * 60 * 24)));

                  return (
                    <div
                      key={p.id}
                      className="p-4 rounded-2xl border border-rose-200 bg-rose-50/20 shadow-xs flex flex-col justify-between gap-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 flex-1 min-w-0">
                          <h5 className="font-bold text-xs text-slate-800 truncate" title={p.name}>
                            {p.name}
                          </h5>
                          <div className="text-[10px] text-slate-400 font-mono truncate">
                            ID: {p.scriptId || p.gasProjectId || p.id}
                          </div>
                          {/* 📅 생성일자 및 삭제일시 */}
                          <div className="flex items-center gap-2.5 text-[10px] text-slate-400 pt-0.5 flex-wrap">
                            {(p.created_at || p.createdAt) && (
                              <span>생성: {formatDateTime(p.created_at || p.createdAt)}</span>
                            )}
                            {(p.deleted_at || p.updated_at) && (
                              <span className="text-rose-500">삭제: {formatDateTime(p.deleted_at || p.updated_at)}</span>
                            )}
                          </div>
                        </div>
                        <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-bold rounded-md flex items-center gap-1 shrink-0">
                          <span>차단됨 (D-{daysLeft})</span>
                        </span>
                      </div>

                      <div className="p-2.5 bg-white rounded-xl border border-rose-100 text-[11px] text-slate-600 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-rose-700">⚠️ 외부 호출 즉시 차단 (HTTP 410)</span>
                          <span className="text-[10px] text-slate-400">유예 기간: {daysLeft}일 남음</span>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-snug">
                          삭제되어 외부 AI 및 구글 시트에서의 호출이 차단된 상태입니다. 복원 시 모든 연동이 다시 활성화됩니다.
                        </p>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-rose-100/60">
                        <button
                          type="button"
                          onClick={() => handleRestoreProject(p)}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>프로젝트 복원하기</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* 새 프로젝트 추가 점선 카드 */}
              <div
                onClick={() => setIsNewProjectModalOpen(true)}
                className="p-5 rounded-2xl border-2 border-dashed border-emerald-200/80 bg-emerald-50/40 hover:bg-emerald-50 hover:border-emerald-400/90 transition-all cursor-pointer flex flex-col justify-between gap-3 group text-left min-h-[110px]"
                data-easybot-hint="새 프로젝트 생성 카드: 클릭하여 새 구글 시트 자동화 프로젝트 마법사를 시작합니다."
              >
              <div className="flex items-start gap-3">
                <div className="p-2 bg-white text-emerald-600 rounded-xl shadow-xs group-hover:scale-110 group-hover:bg-emerald-600 group-hover:text-white transition-all shrink-0">
                  <Plus className="w-4 h-4" />
                </div>
                <div className="space-y-0.5">
                  <h5 className="font-extrabold text-xs text-emerald-950 group-hover:text-emerald-700 transition-colors flex items-center gap-1.5">
                    <span>새 프로젝트 추가</span>
                    <Sparkles className="w-3 h-3 text-emerald-500" />
                  </h5>
                  <p className="text-[11px] text-emerald-900/70 leading-relaxed">
                    구글 시트 URL을 입력하고 자연어로 Apps Script 코드를 자동 주입합니다.
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-emerald-100/60 flex items-center justify-between text-[11px] font-bold text-emerald-600">
                <span>원스톱 AI 생성 시작하기</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* 기존 프로젝트 목록 */}
            {projects.map((p) => {
              const isSyncing = Boolean(syncingProjectId && p.id && syncingProjectId === p.id);
              return (
                <div
                  key={p.id || p.gasProjectId || p.spreadsheetId}
                  className="p-4 rounded-2xl border border-emerald-100 shadow-xs hover:border-emerald-300 bg-white transition-all flex flex-col justify-between gap-3"
                  data-easybot-hint={`프로젝트 카드: '${p.name}' 자동화 프로젝트입니다. 구글 시트 바인딩 및 코드 배포 상태를 확인합니다.`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h5 className="font-bold text-xs text-slate-800 truncate max-w-[180px] sm:max-w-[240px]" title={p.name}>
                          {p.name}
                        </h5>
                        <button
                          type="button"
                          onClick={() => handleSyncProjectTitle(p)}
                          disabled={isSyncing}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 text-slate-600 rounded-md text-[10px] font-bold transition-all border border-slate-200 cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50"
                          title="구글 시트의 원래 최신 제목으로 프로젝트 이름을 동기화합니다."
                          data-easybot-hint="시트명 동기화: 구글 스프레드시트의 원본 제목을 조회하여 이 카드의 프로젝트 이름을 즉시 일치시킵니다."
                        >
                          <RefreshCw className={`w-2.5 h-2.5 ${isSyncing ? "animate-spin text-emerald-600" : "text-slate-500"}`} />
                          <span>{isSyncing ? "동기화 중..." : "동기화"}</span>
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                        <span className="shrink-0 font-bold text-slate-500">ID:</span>
                        <span
                          className="truncate max-w-[200px] sm:max-w-[280px] select-all cursor-pointer hover:text-slate-600 transition-colors"
                          title={`전체 ID: ${p.scriptId || p.gasProjectId || p.id} (클릭 시 복사)`}
                          onClick={() => {
                            const fullId = p.scriptId || p.gasProjectId || p.id;
                            if (fullId) {
                              navigator.clipboard.writeText(fullId);
                              showAlert({ type: "success", text: "프로젝트 ID가 클립보드에 복사되었습니다." });
                            }
                          }}
                        >
                          {p.scriptId || p.gasProjectId || p.id}
                        </span>
                      </div>

                      {/* 📅 생성일자 및 최종수정일시 */}
                      <div className="flex items-center gap-3 text-[10px] text-slate-400 pt-0.5 flex-wrap">
                        {(p.created_at || p.createdAt) && (
                          <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                            <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>생성: {formatDateTime(p.created_at || p.createdAt)}</span>
                          </span>
                        )}
                        {(p.updated_at || p.updatedAt) && (
                          <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                            <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>수정: {formatDateTime(p.updated_at || p.updatedAt)}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {p.scriptId || p.gasProjectId ? (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-md flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span>연결 완료</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-violet-100 text-violet-800 text-[10px] font-bold rounded-md flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
                          <span>래핑 완료</span>
                        </span>
                      )}

                      <button
                        onClick={() => handleDeleteProject(p)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                        title="프로젝트 삭제"
                        data-easybot-hint="프로젝트 삭제: 프로젝트를 안전하게 소프트 삭제(휴지통 처리)합니다."
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                {p.summary && (
                  <p className="text-[11px] text-slate-500 line-clamp-1">{p.summary}</p>
                )}

                {/* 프로젝트 카드 하단 액션 영역 (2단 논리 분할 구조로 정돈) */}
                <div className="pt-2.5 border-t border-slate-100 space-y-2 text-[11px]">
                  {/* 1단: 구글 시트 / Apps Script 바로가기 링크 그룹 */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* 구글 시트 열기 링크 버튼 */}
                      {p.spreadsheetUrl && (
                        <a
                          href={p.spreadsheetUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold rounded-lg transition-colors border border-emerald-200/80 shadow-2xs whitespace-nowrap text-xs"
                          data-easybot-hint="구글 시트 열기: 연결된 실제 구글 스프레드시트 웹 페이지를 새 창에서 엽니다."
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>구글 시트 열기</span>
                          <ExternalLink className="w-3 h-3 text-emerald-600/70 shrink-0" />
                        </a>
                      )}

                      {/* 스크립트 편집기 직접 열기 버튼 (미생성 시 '코드 주입 대기 중' 안내 버튼 제공) */}
                      {(() => {
                        const editorUrl =
                          p.scriptUrl ||
                          (p.scriptId ? `https://script.google.com/d/${p.scriptId}/edit` : (p.gasProjectId ? `https://script.google.com/d/${p.gasProjectId}/edit` : ""));
                        return editorUrl ? (
                          <a
                            href={editorUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg transition-colors border border-indigo-200/60 shadow-2xs whitespace-nowrap text-xs"
                            data-easybot-hint="스크립트 편집기 열기: 구글 시트의 프로젝트 선택창을 거치지 않고 이 Apps Script 코드 편집 화면으로 1초 만에 바로 진입합니다."
                          >
                            <FileCode className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            <span>스크립트 편집기</span>
                            <ExternalLink className="w-3 h-3 text-indigo-600/70 shrink-0" />
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleCopyAgentBridgeUrl(p)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 hover:bg-violet-50 text-slate-500 hover:text-violet-700 font-bold rounded-lg transition-all border border-slate-200/80 hover:border-violet-200 shadow-2xs whitespace-nowrap text-xs cursor-pointer group"
                            title="안티그라비티/AI에 래핑 주소를 전달해 첫 코드를 주입하면 스크립트 편집기가 활성화됩니다. (클릭 시 래핑 주소 복사)"
                            data-easybot-hint="코드 주입 대기: 래핑 주소는 발급되었으나 아직 AI가 첫 코드를 주입하기 전 상태입니다. 클릭하면 AI 연동 주소가 복사됩니다."
                          >
                            <Sparkles className="w-3.5 h-3.5 text-amber-500 group-hover:scale-110 transition-transform shrink-0" />
                            <span>코드 주입 대기 중</span>
                          </button>
                        );
                      })()}

                      {/* 🌐 공개 웹페이지 바로가기 (Web App인 경우) */}
                      {(p.webapp_url || p.webappUrl) && (
                        <a
                          href={p.webapp_url || p.webappUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 font-bold rounded-lg transition-colors border border-sky-200/80 shadow-2xs whitespace-nowrap text-xs"
                          data-easybot-hint="공개 웹페이지 열기: 일반 대중에게 배포할 수 있는 실시간 독립 접수/설문 웹페이지를 새 창에서 엽니다."
                          title="일반 대중 배포용 독립 웹페이지 바로가기"
                        >
                          <Globe className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                          <span>공개 웹 폼</span>
                          <ExternalLink className="w-3 h-3 text-sky-600/70 shrink-0" />
                        </a>
                      )}

                      {/* 🤖 AI 에이전트 연동 주소 복사 버튼 */}
                      <button
                        type="button"
                        onClick={() => handleCopyAgentBridgeUrl(p)}
                        disabled={Boolean(copyingBridgeProjectId && p.id && copyingBridgeProjectId === p.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold rounded-lg transition-colors border border-purple-200/80 shadow-2xs whitespace-nowrap text-xs cursor-pointer active:scale-95 disabled:opacity-50"
                        data-easybot-hint="AI 에이전트 연동: 안티그라비티나 외부 AI에 전달할 원격 코드 주입용 웹 주소와 프롬프트를 원클릭 복사합니다."
                        title="안티그라비티/외부 AI에 전달하여 코드를 자동 주입할 웹 주소를 복사합니다."
                      >
                        <Bot className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                        <span>{Boolean(copyingBridgeProjectId && p.id && copyingBridgeProjectId === p.id) ? "주소 생성 중..." : "AI 연동 주소 복사"}</span>
                        <Copy className="w-3 h-3 text-purple-600/70 shrink-0" />
                      </button>
                    </div>
                  </div>

                  {/* 2단: 관리 도구 (코드 동기화 / 요구사항 수정 / 만족도 평가) */}
                  <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-slate-100/80 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* 🔄 최신 코드 동기화 버튼 */}
                      <button
                        type="button"
                        onClick={() => handleSyncProjectCode(p)}
                        disabled={Boolean(syncingCodeProjectId && p.id && syncingCodeProjectId === p.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 text-slate-600 font-bold rounded-lg transition-all border border-slate-200 cursor-pointer shadow-2xs text-[11px] whitespace-nowrap disabled:opacity-50"
                        title="구글 시트에서 직접 수정한 최신 Apps Script 코드를 SheetBot DB로 가져옵니다."
                        data-easybot-hint="최신 코드 동기화: 사용자가 구글 시트에서 직접 수정한 Apps Script 최신 코드를 즉시 읽어와 SheetBot에 일치시킵니다."
                      >
                        <RefreshCw className={`w-3 h-3 ${Boolean(syncingCodeProjectId && p.id && syncingCodeProjectId === p.id) ? "animate-spin text-emerald-600" : "text-slate-500"}`} />
                        <span>{Boolean(syncingCodeProjectId && p.id && syncingCodeProjectId === p.id) ? "동기화 중..." : "코드 동기화"}</span>
                      </button>

                      {/* ✏️ 자연어 요구사항 수정 및 AI 코드 재배포 버튼 */}
                      <button
                        type="button"
                        onClick={() => setEditingProject(p)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 text-slate-600 font-bold rounded-lg transition-all border border-slate-200 cursor-pointer shadow-2xs text-[11px] whitespace-nowrap active:scale-95"
                        data-easybot-hint="요구사항 수정: 기존 프롬프트를 확인하고 수정/추가하여 새 코드를 AI로 재작성 및 구글 시트에 재배포합니다."
                        title="자연어 요구사항을 수정하거나 추가하여 새 코드로 재배포합니다."
                      >
                        <Edit3 className="w-3 h-3 text-slate-500" />
                        <span>요구사항 수정</span>
                      </button>
                    </div>

                    {/* ⭐ 만족도 평가 및 AI 자가 학습 피드백 버튼 */}
                    <button
                      type="button"
                      onClick={() => setFeedbackTargetProject(p)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold rounded-lg transition-all border border-amber-200/80 cursor-pointer shadow-2xs text-[11px] whitespace-nowrap ml-auto"
                      data-easybot-hint="만족도 평가: AI 생성 코드에 대한 별점과 피드백을 제출하여 AI가 자가 학습하도록 합니다."
                      title="AI 코드 만족도 평가 및 자가 학습 피드백"
                    >
                      <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
                      <span>만족도 평가</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

          {/* 전문가(FDE) 맞춤 제작 안내 슬림 배너 */}
          <div className="pt-3 mt-1 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs bg-gradient-to-r from-indigo-50/60 via-purple-50/40 to-slate-50 p-3.5 rounded-2xl border border-indigo-100/80">
            <div className="flex items-center gap-2.5 text-slate-700">
              <div className="w-7 h-7 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                <Briefcase className="w-4 h-4" />
              </div>
              <div>
                <span className="font-extrabold text-indigo-950">혼자 제작하기 복잡하거나 시간이 부족하신가요?</span>
                <span className="text-slate-500 block sm:inline sm:ml-1.5 text-[11px]">
                  SheetBot 전담 엔지니어(FDE)가 귀사 시트 양식에 맞춰 100% 동작하는 자동화 코드를 직접 구축해 드립니다.
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsFdeModalOpen(true)}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-1 transition-all shadow-2xs shrink-0 whitespace-nowrap cursor-pointer active:scale-95"
            >
              <span>FDE 1:1 맞춤 의뢰</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 3. 자동화 스케줄 & 트리거 관리 섹션 */}
        <ScheduleManager
          schedules={schedules}
          projects={projects}
          onRefresh={fetchData}
          onShowAlert={showAlert}
        />
      </main>

      {/* 🌟 1초 래핑 전용 초심플 안티그라비티 연동 모달 */}
      <QuickWrapSuccessModal
        isOpen={quickWrapData.isOpen}
        sheetUrl={quickWrapData.sheetUrl}
        bridgeUrl={quickWrapData.bridgeUrl}
        promptTemplate={quickWrapData.promptTemplate}
        projectName={quickWrapData.projectName}
        isExisting={quickWrapData.isExisting}
        onClose={() => setQuickWrapData((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* 새 프로젝트 생성 모달 */}
      <NewProjectModal
        isOpen={isNewProjectModalOpen}
        initialSheetUrl={urlSheetParam || undefined}
        onClose={() => {
          setIsNewProjectModalOpen(false);
          setUrlSheetParam("");
        }}
        onSuccess={() => {
          fetchData();
          showAlert({ type: "success", text: "새 Apps Script 프로젝트가 성공적으로 생성되었습니다!" });
        }}
      />

      {/* 기존 프로젝트 자연어 요구사항 수정 및 재배포 모달 */}
      <EditProjectPromptModal
        isOpen={!!editingProject}
        project={editingProject}
        onClose={() => setEditingProject(null)}
        onSuccess={() => {
          fetchData();
          showAlert({ type: "success", text: "수정된 요구사항을 바탕으로 스크립트 코드가 성공적으로 갱신 및 재배포되었습니다!" });
        }}
      />


      {/* 프로젝트 만족도 평가 및 AI 자가 학습 모달 */}
      {feedbackTargetProject && (
        <FeedbackModal
          isOpen={!!feedbackTargetProject}
          project={feedbackTargetProject}
          onClose={() => setFeedbackTargetProject(null)}
          onSuccess={() => {
            showAlert({ type: "success", text: "소중한 만족도 평가가 AI 자가 학습 시스템에 성공적으로 반영되었습니다!" });
          }}
        />
      )}

      {/* 전문가(FDE) 맞춤 의뢰 모달 */}
      <FdeRequestModal
        isOpen={isFdeModalOpen}
        initialSheetUrl={fdeInitialSheetUrl}
        initialRequirement={fdeInitialReq}
        userEmail={session?.user?.email}
        userName={session?.user?.name}
        onClose={() => {
          setIsFdeModalOpen(false);
          setFdeInitialSheetUrl("");
          setFdeInitialReq("");
        }}
      />

      {/* 🌟 FDE 파트너 모집 팝업 & 간편 지원 모달 */}
      <FdeRecruitModal
        isOpen={isFdeRecruitOpen}
        initialApply={isApplyingFde}
        userEmail={session?.user?.email}
        userName={session?.user?.name}
        onClose={() => {
          setIsFdeRecruitOpen(false);
          setIsApplyingFde(false);
        }}
      />

      {/* 에이전트 개인 API 키 모달 */}
      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
      />

      {/* 회원 탈퇴 (전역 킬스위치) 모달 */}
      <WithdrawModal
        isOpen={isWithdrawModalOpen}
        onClose={() => setIsWithdrawModalOpen(false)}
        userEmail={session?.user?.email || ""}
      />
    </div>
  );
}
