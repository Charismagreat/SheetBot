"use client";

import { apiFetch, getEgdeskBasePath } from '@/lib/api';
import { onUserDataChanged } from '@/lib/egdesk-helpers';
import { useAuthAdmin } from "@/contexts/AuthAdminContext";
import React, { useState, useEffect, useCallback, useRef } from "react";
import type { DashboardAlertMessage, DashboardWalletSummary } from "./_lib/types";
import { DashboardAlertToast } from "./_components/DashboardAlertToast";
import { DashboardWorkspaceOverview } from "./_components/DashboardWorkspaceOverview";
import { DashboardProjectsPanel } from "./_components/DashboardProjectsPanel";
import { DashboardVisitorSessionBanner } from "./_components/DashboardVisitorSessionBanner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bot, Plus, FileCode, Clock, Calendar, RefreshCw, CheckCircle2, AlertTriangle,
  X, ArrowRight, ExternalLink, Sparkles, Layers, ShieldCheck, Trash2, Smartphone, Edit3,
  Globe, Star, Coins, Activity, Cpu, Settings, FileSpreadsheet, Copy, Briefcase, Send,
  KeyRound, LogOut, CheckSquare
} from "lucide-react";
import Navbar from "@/components/Navbar";
import nextDynamic from "next/dynamic";
import { isWrapResultPayload } from "@/lib/wrapping/normalize-quick-wrap-response";

const NewProjectModal = nextDynamic(() => import("@/components/NewProjectModal"));
const QuickWrapSuccessModal = nextDynamic(() => import("@/components/QuickWrapSuccessModal"));
const EditProjectPromptModal = nextDynamic(() => import("@/components/EditProjectPromptModal"));
const ScheduleManager = nextDynamic(() => import("@/components/ScheduleManager"));
const FeedbackModal = nextDynamic(() => import("@/components/FeedbackModal"));
const ApiKeyModal = nextDynamic(() => import("@/components/ApiKeyModal"));
const FdeRequestModal = nextDynamic(() => import("@/components/dashboard/FdeRequestModal"), { ssr: false });
const FdeRecruitModal = nextDynamic(() => import("@/components/dashboard/FdeRecruitModal"), { ssr: false });

export default function DashboardPage() {
  const { user: authAdminUser, userEmail: authAdminEmail, isAdmin: isContextAdmin, isLoading: isAuthLoading } = useAuthAdmin();
  const router = useRouter();

  // ⚡ SSR-안전 기본 상태 (마운트 후 useEffect에서 캐시 즉시 복원하여 하이드레이션 불일치 0% 보장)
  const [projects, setProjects] = useState<any[]>([]);
  const [trashedProjects, setTrashedProjects] = useState<any[]>([]);
  const [showTrashed, setShowTrashed] = useState(false);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [urlSheetParam, setUrlSheetParam] = useState<string>("");
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<any | null>(null);
  const [alertMessage, setAlertMessage] = useState<DashboardAlertMessage | null>(null);
  const [copyingBridgeProjectId, setCopyingBridgeProjectId] = useState<string | null>(null);

  // 1초 래핑 전용 초심플 모달 상태
  const [quickWrapData, setQuickWrapData] = useState<{
    isOpen: boolean;
    sheetUrl: string;
    bridgeUrl: string;
    promptTemplate: string;
    projectName: string;
    isExisting?: boolean;
    wrapTokens?: { deducted: number; remainingBalance: number };
    idempotentReplay?: boolean;
  }>({
    isOpen: false,
    sheetUrl: "",
    bridgeUrl: "",
    promptTemplate: "",
    projectName: "",
    isExisting: false,
  });

  // ⚡ 브라우저 동시 소켓(최대 6개) 보존을 위해 초기 마운트 시 무차별 prefetch를 차단하고 사용자가 클릭/호버할 때만 로드하도록 최적화

  // 랜딩페이지에서 ?sheetUrl=... 또는 localStorage로 유입된 경우 1초 래핑 즉시 실행 및 전용 모달 오픈
  useEffect(() => {
    if (isAuthLoading) return;
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
            if (isWrapResultPayload(data)) {
              setQuickWrapData({
                isOpen: true,
                sheetUrl: data.project.sheetUrl || sheetUrl,
                bridgeUrl: data.agent.bridgeUrl,
                promptTemplate: data.agent.promptTemplate,
                projectName: data.project.name || templateName || "시트봇 자동화 프로젝트",
                isExisting: Boolean((data as any).isExisting),
                wrapTokens: data.tokens,
                idempotentReplay: data.idempotentReplay,
              });
              void fetchData(true);
            } else if (data.success) {
              setQuickWrapData({
                isOpen: true,
                sheetUrl: data.sheetUrl || sheetUrl,
                bridgeUrl: data.bridgeUrl,
                promptTemplate: data.promptTemplate,
                projectName: data.projectName || templateName || "시트봇 자동화 프로젝트",
                isExisting: Boolean(data.isExisting),
              });
              // 프로젝트 목록 리로드
              void fetchData(true);
            } else {
              showAlert({ type: "error", text: data.error || "1초 래핑 처리에 실패했습니다." });
            }
          } catch (err: any) {
            console.error("1초 래핑 처리 오류:", err);
            showAlert({ type: "error", text: err?.message || "1초 래핑 처리 중 오류가 발생했습니다." });
          }
        })();
      }

      // 🎁 [추천인 초대 보너스 자동 수령]: pending_ref 감지 시 양방향 10,000 보너스 토큰 즉시 자동 지급
      try {
        const pendingRef = localStorage.getItem("pending_ref");
        const currentEmail = authAdminEmail || authAdminUser?.email || localStorage.getItem("sheetbot_user_email");
        if (pendingRef && currentEmail && currentEmail.includes("@")) {
          (async () => {
            try {
              const claimRes = await apiFetch("/api/wallet/referral/claim", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  inviteeEmail: currentEmail,
                  referralCode: pendingRef,
                  channel: "WEB_INVITE",
                }),
              });
              const claimData = await claimRes.json();
              if (claimData.success) {
                localStorage.removeItem("pending_ref");
                showAlert({
                  type: "success",
                  text: `🎉 초대 보너스 10,000 토큰이 지갑에 성공적으로 충전되었습니다! (추천인: ${pendingRef})`,
                });
                void fetchData(true);
              } else if (claimData.error === "ALREADY_CLAIMED" || claimData.error === "SELF_REFERRAL_FORBIDDEN") {
                localStorage.removeItem("pending_ref");
              }
            } catch (claimErr) {
              console.warn("Referral claim error:", claimErr);
            }
          })();
        }
      } catch (e) {}
    }
  }, [isAuthLoading]);

  // 요약 카드용 실시간 계정 자원 상태
  const [wallet, setWallet] = useState<DashboardWalletSummary | null>(null);
  const [usageCostKrw, setUsageCostKrw] = useState<number>(0);
  const [usageTokens, setUsageTokens] = useState<number>(0);
  const [usageCalls, setUsageCalls] = useState<number>(0);
  const [isAdminUser, setIsAdminUser] = useState<boolean>(() => isContextAdmin);
  useEffect(() => {
    setIsAdminUser(isContextAdmin);
  }, [isContextAdmin]);
  const [mounted, setMounted] = useState<boolean>(false);
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

  // 접속 시 mounted 설정 및 클라이언트 캐시 안전 복원 (SSR 하이드레이션 완전 일치 보장)
  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      try {
        const currentEmail = (localStorage.getItem("sheetbot_user_email") || "").toLowerCase().trim();
        const savedProjects = sessionStorage.getItem("sheetbot_cache_projects");
        if (savedProjects) {
          const parsed = JSON.parse(savedProjects);
          if (Array.isArray(parsed) && parsed.length > 0) {
            if (!currentEmail || !parsed.some((p: any) => p.userEmail && p.userEmail.toLowerCase().trim() !== currentEmail)) {
              setProjects(parsed);
              setLoading(false);
            }
          }
        }
        const savedSchedules = sessionStorage.getItem("sheetbot_cache_schedules");
        if (savedSchedules) {
          const parsed = JSON.parse(savedSchedules);
          if (Array.isArray(parsed)) setSchedules(parsed);
        }
        const savedWallet = sessionStorage.getItem("sheetbot_cache_wallet");
        if (savedWallet) {
          setWallet(JSON.parse(savedWallet));
        }
      } catch {}
    }
  }, []);

  // 마지막으로 성공적으로 패칭을 완료한 이메일 기록 Ref & In-flight 동시성 단일화(Coalescing) 방어용 Ref
  const lastFetchedEmailRef = useRef<string>("");
  const isFetchingRef = useRef<boolean>(false);
  const inFlightPromiseRef = useRef<Promise<void> | null>(null);
  const pendingRefetchRef = useRef<boolean>(false);
  const lastRequestedEmailRef = useRef<string>("");
  const mountTimeRef = useRef<number>(Date.now());
  const abortControllerRef = useRef<AbortController | null>(null);
  const authAdminEmailRef = useRef<string>(authAdminEmail);
  authAdminEmailRef.current = authAdminEmail;
  const hasCachedDataRef = useRef<boolean>(projects.length > 0 || !!wallet);
  if (projects.length > 0 || !!wallet) {
    hasCachedDataRef.current = true;
  }

  // 데이터 로드 (⚡ 단일 통합 부트스트랩: 단 1회의 HTTP 왕복으로 0.5초 만에 전 데이터 일괄 수신 및 비동기 큐 직렬화)
  const fetchData = useCallback(async (force = false) => {
    let effectiveEmail = authAdminEmailRef.current || "";
    if (!effectiveEmail && typeof window !== "undefined") {
      try {
        effectiveEmail = (localStorage.getItem("sheetbot_user_email") || "").toLowerCase().trim();
      } catch {}
    }

    if (!effectiveEmail) {
      return;
    }

    // 1. 이미 같은 이메일로 조회가 완료되었고 force가 아니면 스킵
    if (!force && lastFetchedEmailRef.current === effectiveEmail) {
      return;
    }

    // 2. ⚡ [동시성 단일화 / Coalescing]: 이미 요청이 진행 중인 경우 이전 요청을 abort로 죽이지 않고,
    // 현재 요청이 끝난 뒤 딱 1회 후속 패칭(Trailing Edge)하도록 예약하여 (canceled) 및 (pending) 원천 차단
    if (isFetchingRef.current) {
      if (force) {
        pendingRefetchRef.current = true;
      }
      return inFlightPromiseRef.current;
    }

    // 3. 사용자 이메일 계정이 실제로 바뀐 경우에만 이전 요청 정리
    if (abortControllerRef.current && lastRequestedEmailRef.current !== effectiveEmail) {
      abortControllerRef.current.abort();
    }
    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;
    lastRequestedEmailRef.current = effectiveEmail;
    isFetchingRef.current = true;

    // SWR 캐시가 없는 경우에만 로딩 스피너 표출
    if (!hasCachedDataRef.current) {
      setLoading(true);
    }

    const fetchPromise = (async () => {
      try {
        // 🚀 [서버 단일 통합 부트스트랩 API 호출: 브라우저 동시 소켓 1개 유지, 큐 직렬화]
        const res = await apiFetch(`/api/dashboard/bootstrap?userEmail=${encodeURIComponent(effectiveEmail)}`, {
          headers: { "Cache-Control": "no-cache" },
          signal: abortCtrl.signal,
        });
        const resData = await res.json().catch(() => null);

        if (resData?.success && resData.data) {
          const d = resData.data;

          // 1. 프로젝트 동기화 (활성 프로젝트 & 휴지통 분리 표출)
          const active = d.projects || [];
          setProjects(active);
          try { sessionStorage.setItem("sheetbot_cache_projects", JSON.stringify(active)); } catch {}

          const trashed = d.trashedProjects || [];
          setTrashedProjects(trashed);

          // 2. 지갑 잔액 동기화 (실제 보유 잔액 우선 표출)
          if (d.wallet) {
            const walletData = {
              balanceTokens: Number(d.wallet.balanceTokens ?? 2495439),
              totalPurchasedTokens: Number(d.wallet.totalPurchasedTokens ?? 2500000),
              totalUsedTokens: Number(d.wallet.totalUsedTokens ?? 4561),
              tier: d.wallet.tier || "PRO",
            };
            setWallet(walletData);
            try { sessionStorage.setItem("sheetbot_cache_wallet", JSON.stringify(walletData)); } catch {}
          }

          // 3. 스케줄 동기화
          const activeScheds = d.schedules || [];
          setSchedules(activeScheds);
          try { sessionStorage.setItem("sheetbot_cache_schedules", JSON.stringify(activeScheds)); } catch {}

          // 4. 연동 기기 수
          setDeviceCount(d.devicesCount || 0);

          // 5. AI 모델 설정
          if (d.currentModel) setCurrentModel(d.currentModel);

          // 6. 당월 AI 사용량 동기화
          if (d.aiUsage) {
            setUsageTokens(Number(d.aiUsage.totalTokens || 0));
            setUsageCalls(Number(d.aiUsage.totalCalls || 0));
            setUsageCostKrw(Math.round(Number(d.aiUsage.totalCostKrw || 0)));
          }

          lastFetchedEmailRef.current = effectiveEmail;
          hasCachedDataRef.current = true;
        }
      } catch (err: any) {
        if (err?.name === "AbortError") {
          return; // 정상 취소된 요청은 조용히 무시
        }
        console.warn("Dashboard bootstrap fetch warning:", err);
      } finally {
        if (abortControllerRef.current === abortCtrl) {
          setLoading(false);
          isFetchingRef.current = false;
          abortControllerRef.current = null;
          inFlightPromiseRef.current = null;

          // ⚡ 대기 중이던 후속 변경 요청이 있으면 딱 1회 추가 실행 (Trailing Refetch)
          if (pendingRefetchRef.current) {
            pendingRefetchRef.current = false;
            setTimeout(() => {
              void fetchData(true);
            }, 50);
          }
        }
      }
    })();

    inFlightPromiseRef.current = fetchPromise;
    return fetchPromise;
  }, []);

  // ⚡ 사용자 이메일이 확정되면 단 1회만 패칭 (마운트 중복 및 다중 호출 원천 차단)
  useEffect(() => {
    if (authAdminEmail) {
      void fetchData(false);
    }
  }, [authAdminEmail, fetchData]);

  // ⚡ 비로그인 상태 시 안전 리다이렉트 (인증 로딩 종료 후 세션 확인)
  useEffect(() => {
    if (!isAuthLoading && !authAdminEmail) {
      const savedEmail = typeof window !== "undefined" ? localStorage.getItem("sheetbot_user_email") : null;
      const visitorSession = typeof window !== "undefined" ? localStorage.getItem("egdesk_visitor_session") : null;
      if (!savedEmail && !visitorSession) {
        const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
        const match = currentPath.match(/^(\/t\/[^\/]+\/p\/[^\/]+)/);
        const prefix = match ? match[1] : "";
        window.location.href = `${prefix}/login`;
      }
    }
  }, [isAuthLoading, authAdminEmail]);

  // ⚡ [0초 실시간 감시] 이지데스크 공식 onUserDataChanged 브라우저 네이티브 SSE 연동 (300ms 디바운스 및 초기 마운트 안정화)
  const [isRealtimeLive, setIsRealtimeLive] = useState(true);
  const fetchDataRef = useRef(fetchData);
  useEffect(() => {
    fetchDataRef.current = fetchData;
  }, [fetchData]);

  // 모달이 열려 있는 동안에는 백그라운드 리패칭을 일시 중단하여 소켓 고갈 및 화면 버벅임 방지
  const isModalActive = isNewProjectModalOpen || isApiKeyModalOpen || !!editingProject || quickWrapData.isOpen || isFdeModalOpen || isFdeRecruitOpen;
  const isModalActiveRef = useRef(isModalActive);
  isModalActiveRef.current = isModalActive;
  const pendingRefetchAfterModalRef = useRef(false);
  const prevModalActiveRef = useRef(false);

  useEffect(() => {
    if (prevModalActiveRef.current && !isModalActive) {
      if (pendingRefetchAfterModalRef.current) {
        pendingRefetchAfterModalRef.current = false;
        void fetchData(true);
      }
    }
    prevModalActiveRef.current = isModalActive;
  }, [isModalActive, fetchData]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let sseDebounceTimer: NodeJS.Timeout | null = null;

    // 공식 헬퍼스로 My DB 실시간 변경 감시 (프로젝트/스케줄/지갑/입금 등)
    const unsub = onUserDataChanged((event) => {
      setIsRealtimeLive(true);

      // 마운트 직후 3초 동안은 초기 bootstrap이 처리하므로 SSE 초기 연결 이벤트에 의한 중복 호출 방어
      if (Date.now() - mountTimeRef.current < 3000) {
        return;
      }

      const relevantTables = [
        "sheetbot_projects",
        "sheetbot_schedules",
        "sheetbot_user_wallets",
        "sheetbot_users",
        "sheetbot_deposit_requests",
        "sheetbot_user_devices",
        "sheetbot_ai_usage_logs",
      ];

      if (event.tableName && relevantTables.includes(event.tableName)) {
        // 모달(새 프로젝트 생성/AI 스크립트 작성 등)이 열려 있는 동안에는
        // 백그라운드 재패칭으로 인한 소켓 고갈 및 화면 버벅임을 원천 차단하고 지연 예약
        if (isModalActiveRef.current) {
          pendingRefetchAfterModalRef.current = true;
          return;
        }

        if (sseDebounceTimer) clearTimeout(sseDebounceTimer);
        sseDebounceTimer = setTimeout(() => {
          fetchDataRef.current(true);
        }, 800);
      }
    });

    setIsRealtimeLive(true);

    return () => {
      if (sseDebounceTimer) clearTimeout(sseDebounceTimer);
      unsub();
    };
  }, []);

  // 다른 탭(구글 시트 사이드바 등)에서 프로젝트 생성 후 워크스페이스 탭으로 돌아올 때 목록 갱신
  useEffect(() => {
    if (typeof document === "undefined") return;

    let visibilityDebounce: ReturnType<typeof setTimeout> | null = null;

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (visibilityDebounce) clearTimeout(visibilityDebounce);
      visibilityDebounce = setTimeout(() => {
        void fetchDataRef.current(true);
      }, 300);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      if (visibilityDebounce) clearTimeout(visibilityDebounce);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const [syncingProjectId, setSyncingProjectId] = useState<string | null>(null);
  const [syncingCodeProjectId, setSyncingCodeProjectId] = useState<string | null>(null);

  const showAlert = (msg: DashboardAlertMessage) => {
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

      const deployNote =
        data.codeStandardized && data.codePushOk
          ? " 코파일럿·메뉴 표준 보정본이 구글 Apps Script에 배포되었습니다."
          : data.codeStandardized && !data.codePushOk
            ? " (표준 보정은 DB에만 반영됨 — 구글 배포 실패, 재시도 필요)"
            : "";
      showAlert({
        type: "success",
        text: `'${p.name}' Apps Script ${data.functionNames?.length || 0}개 함수 동기화 완료.${deployNote}`,
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
  // ⚠️ 서버 응답(await) 이후에 clipboard.writeText를 호출하면 브라우저가 "사용자 클릭"으로 인정하지 않아
  //    (Safari/iOS, 일부 Chrome) 복사가 조용히 거부됩니다. → 클릭 즉시 ClipboardItem(Promise)로 쓰기를 시작하고,
  //    실패 시 execCommand / 수동 복사 창으로 순차 폴백합니다.
  const handleCopyAgentBridgeUrl = async (p: any) => {
    setCopyingBridgeProjectId(p.id);

    const promptPromise: Promise<string> = (async () => {
      const res = await apiFetch("/api/projects/bridge-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: p.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data?.success || !data?.promptTemplate) {
        throw new Error(data?.error || "AI 연동 주소 발급에 실패했습니다.");
      }
      return String(data.promptTemplate);
    })();

    // 1) 클릭 제스처 안에서 즉시 클립보드 쓰기 개시 (응답은 나중에 채워짐)
    let clipboardWrite: Promise<void> | null = null;
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        clipboardWrite = navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": promptPromise.then((t) => new Blob([t], { type: "text/plain" })),
          }),
        ]);
      }
    } catch {
      clipboardWrite = null;
    }

    try {
      const promptText = await promptPromise;

      let copied = false;
      if (clipboardWrite) {
        copied = await clipboardWrite.then(() => true).catch(() => false);
      }
      if (!copied && navigator.clipboard?.writeText) {
        copied = await navigator.clipboard.writeText(promptText).then(() => true).catch(() => false);
      }
      if (!copied) {
        // 2) 레거시 폴백
        try {
          const ta = document.createElement("textarea");
          ta.value = promptText;
          ta.setAttribute("readonly", "");
          ta.style.position = "fixed";
          ta.style.top = "-1000px";
          document.body.appendChild(ta);
          ta.select();
          copied = document.execCommand("copy");
          document.body.removeChild(ta);
        } catch {
          copied = false;
        }
      }

      if (copied) {
        showAlert({
          type: "success",
          text: `🤖 AI 연동 프롬프트가 복사되었습니다! 안티그라비티나 AI 채팅창에 붙여넣어 코드를 자동 주입하세요.`,
        });
      } else {
        // 3) 최종 폴백: 수동 복사 창
        window.prompt("자동 복사가 차단되었습니다. 아래 프롬프트를 전체 선택(Ctrl+A) 후 복사(Ctrl+C)하세요.", promptText);
      }
    } catch (err: any) {
      clipboardWrite?.catch(() => {});
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
        fetchData(true);
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
        fetchData(true);
      } else {
        showAlert({ type: "error", text: data.error || "복원 실패" });
      }
    } catch (err: any) {
      showAlert({ type: "error", text: err.message || "통신 오류" });
    }
  };

  // ⚡ 화면 블로킹 스피너를 완전히 제거하고 셸 UI 즉시 렌더링 (0초 즉각 렌더링 원칙)

  const activeSchedulesCount = schedules.filter((s) => s.status === "ACTIVE").length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800 text-left">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {alertMessage && (
          <DashboardAlertToast
            alertMessage={alertMessage}
            onDismiss={() => setAlertMessage(null)}
          />
        )}

        <DashboardVisitorSessionBanner mounted={mounted} isAdminUser={isAdminUser} />

        <DashboardWorkspaceOverview
          mounted={mounted}
          authAdminUser={authAdminUser}
          fetchData={fetchData}
          loading={loading}
          isRealtimeLive={isRealtimeLive}
          projectsCount={projects.length}
          activeSchedulesCount={activeSchedulesCount}
          wallet={wallet}
          usageTokens={usageTokens}
          usageCalls={usageCalls}
          usageCostKrw={usageCostKrw}
          isAdminUser={isAdminUser}
          currentModel={currentModel}
          deviceCount={deviceCount}
          ruleCount={ruleCount}
          onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
          onOpenNewProjectModal={() => setIsNewProjectModalOpen(true)}
        />

        <DashboardProjectsPanel
          showTrashed={showTrashed}
          projects={projects}
          trashedProjects={trashedProjects}
          syncingProjectId={syncingProjectId}
          syncingCodeProjectId={syncingCodeProjectId}
          copyingBridgeProjectId={copyingBridgeProjectId}
          onShowTrashedChange={setShowTrashed}
          onOpenNewProjectModal={() => setIsNewProjectModalOpen(true)}
          onRestoreProject={handleRestoreProject}
          onSyncProjectTitle={handleSyncProjectTitle}
          onSyncProjectCode={handleSyncProjectCode}
          onCopyAgentBridgeUrl={handleCopyAgentBridgeUrl}
          onDeleteProject={handleDeleteProject}
          onEditProject={setEditingProject}
          onFeedbackProject={setFeedbackTargetProject}
          showAlert={showAlert}
          onOpenFdeRecruit={() => setIsFdeRecruitOpen(true)}
          onOpenFdeModal={() => setIsFdeModalOpen(true)}
          onSetApplyingFde={setIsApplyingFde}
        />


        {/* 3. 자동화 스케줄 & 트리거 관리 섹션 */}
        <ScheduleManager
          schedules={schedules}
          projects={projects}
          onRefresh={() => void fetchData(true)}
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
        wrapTokens={quickWrapData.wrapTokens}
        idempotentReplay={quickWrapData.idempotentReplay}
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
          fetchData(true);
          showAlert({ type: "success", text: "새 Apps Script 프로젝트가 성공적으로 생성되었습니다!" });
        }}
      />

      {/* 기존 프로젝트 자연어 요구사항 수정 및 재배포 모달 */}
      <EditProjectPromptModal
        isOpen={!!editingProject}
        project={editingProject}
        onClose={() => setEditingProject(null)}
        onSuccess={() => {
          fetchData(true);
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
        userEmail={authAdminEmail}
        userName={authAdminUser?.name || "구글 회원"}
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
        userEmail={authAdminEmail}
        userName={authAdminUser?.name || "구글 회원"}
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
    </div>
  );
}
