"use client";

import { apiFetch } from '@/lib/api';
import React, { useState, useEffect } from "react";
import {
  X,
  Sparkles,
  FileSpreadsheet,
  Code,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  Layers,
  Cpu,
  MessageSquare,
  Send,
  Table,
  ShieldCheck,
  ChevronLeft,
  HelpCircle,
  Wrench,
  Globe,
  ExternalLink,
  Copy,
  Star,
  ThumbsUp,
  UploadCloud,
  FileUp,
  Link2,
  FileCheck,
  ArrowUpRight,
  FolderPlus,
  FileText,
} from "lucide-react";
import {
  startVisitorGoogleLogin,
  getVisitorGoogleStatus,
  listVisitorDriveFiles,
  getVisitorSheetRange,
  VISITOR_WORKSPACE_SCOPES,
  VISITOR_GOOGLE_OAUTH_SCOPES,
} from "@/egdesk-visitor-google";
import PromptGalleryModal from "./PromptGalleryModal";

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function NewProjectModal({ isOpen, onClose, onSuccess }: NewProjectModalProps) {
  // 생성 모드: NEW_SHEET (새 시트 자동 설계), EXCEL_UPLOAD (엑셀 업로드 변환), EXISTING_URL (기존 구글 시트 URL)
  const [sourceMode, setSourceMode] = useState<"NEW_SHEET" | "EXCEL_UPLOAD" | "EXISTING_URL">("NEW_SHEET");

  // 1: 기본 정보 입력, 2: AI 분석 브리핑 및 조율(HITL), 3: 생성 및 배포 완료
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sheetUrl, setSheetUrl] = useState("");
  const [projectName, setProjectName] = useState("");
  const [isFetchingTitle, setIsFetchingTitle] = useState(false);
  const [autoDetectedTitle, setAutoDetectedTitle] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedResult, setGeneratedResult] = useState<any>(null);

  // 엑셀 업로드 및 파싱 관련 상태
  const [isUploadingExcel, setIsUploadingExcel] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [parsedExcel, setParsedExcel] = useState<{
    fileName: string;
    sheets: string[];
    activeSheet: string;
    headers: string[];
    sampleRows: any[][];
    totalRows: number;
    dataRowCount: number;
    previewGrid: any[][];
    allRows?: any[][];
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // 새 시트 자동 생성 상태
  const [isCreatingSheet, setIsCreatingSheet] = useState(false);
  const [autoCreatedSheet, setAutoCreatedSheet] = useState<{ id: string; url: string } | null>(null);

  // 추천 프롬프트 갤러리 모달 상태
  const [showPromptGallery, setShowPromptGallery] = useState(false);

  // 기존 Apps Script 안전 감지 및 보존(Merge) / 덮어쓰기(Overwrite) 상태
  const [isDetectingGas, setIsDetectingGas] = useState(false);
  const [existingGasInfo, setExistingGasInfo] = useState<{
    hasExistingScript: boolean;
    projectId?: string;
    filesCount?: number;
    files?: Array<{ name: string; type: string }>;
    functionNames?: string[];
    existingCode?: string;
    scriptUrl?: string;
  } | null>(null);
  const [mergeMode, setMergeMode] = useState<"MERGE" | "OVERWRITE">("MERGE");
  const [showCodePreview, setShowCodePreview] = useState(false);

  // Step 3 완료 화면 관련 상태 (URL 복사 및 즉시 별점 피드백)
  const [copiedWebappUrl, setCopiedWebappUrl] = useState(false);
  const [inlineRating, setInlineRating] = useState(5);
  const [inlineFeedbackSent, setInlineFeedbackSent] = useState(false);
  const [inlineComment, setInlineComment] = useState("");
  const [inlineSubmitting, setInlineSubmitting] = useState(false);

  // AI 분석 결과 및 조율(HITL) 관련 상태
  const [analyzedSchema, setAnalyzedSchema] = useState<any>(null);
  const [turnCount, setTurnCount] = useState(0); // 0부터 시작, 최대 5회
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackHistory, setFeedbackHistory] = useState<Array<{ role: "user" | "ai"; message: string }>>([]);

  // 관리자 1:1 맞춤 제작 문의 관련 상태
  const [isInquiryOpen, setIsInquiryOpen] = useState(false);
  const [inquiryMemo, setInquiryMemo] = useState("");
  const [submittingInquiry, setSubmittingInquiry] = useState(false);
  const [inquirySuccess, setInquirySuccess] = useState(false);

  // AI 엔진 모델 선택 관련 상태
  const [selectedModel, setSelectedModel] = useState("gemini-3.8-flash");
  const [pricingModels, setPricingModels] = useState<any[]>([]);
  const [allowUserSelection, setAllowUserSelection] = useState(true);

  // 구글 드라이브/시트 권한 상태 및 안내 팝업 상태
  const [scopeStatus, setScopeStatus] = useState<"loading" | "granted" | "needed">("loading");
  const [showScopePrompt, setShowScopePrompt] = useState(false);
  const [isGrantingScope, setIsGrantingScope] = useState(false);
  const [titleSyncFeedback, setTitleSyncFeedback] = useState<{
    type: "success" | "error" | "info";
    source?: "file" | "tab" | "web";
    message: string;
  } | null>(null);
  const [titleSource, setTitleSource] = useState<"file" | "tab" | "web" | null>(null);

  const checkGoogleScopes = async () => {
    try {
      const status = await getVisitorGoogleStatus();
      if (status?.connected && status?.email) {
        // 실제 드라이브 파일 목록을 1건 조회하여 Workspace(시트/드라이브) 권한 보유 여부 실시간 확인
        const testRes = await listVisitorDriveFiles({ pageSize: 1 }).catch(() => null);
        if (testRes && (Array.isArray(testRes.files) || Array.isArray(testRes))) {
          setScopeStatus("granted");
          setShowScopePrompt(false);
        } else {
          setScopeStatus("needed");
        }
      } else {
        setScopeStatus("needed");
      }
    } catch {
      setScopeStatus("needed");
    }
  };

  const handleGrantWorkspaceScopes = async () => {
    setIsGrantingScope(true);
    try {
      await startVisitorGoogleLogin({
        next: "/dashboard",
        forceConsent: true,
        scopes: VISITOR_WORKSPACE_SCOPES,
      });
    } catch (err: any) {
      setIsGrantingScope(false);
      alert("권한 요청 중 오류가 발생했습니다: " + (err?.message || "네트워크 오류"));
    }
  };

  useEffect(() => {
    if (isOpen) {
      void checkGoogleScopes();

      // 원가 및 사용 가능 모델 설정 로드
      apiFetch("/api/admin/pricing-cost")
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.config) {
            setPricingModels(data.config.models || []);
            setAllowUserSelection(data.config.allowUserModelSelection !== false);
            const targetDefault = data.config.defaultModel || "gemini-3.8-flash";
            const def = data.config.models?.find((m: any) => m.id === targetDefault) || data.config.models?.[0];
            if (def) setSelectedModel(def.id);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 구글 시트 URL 입력 시 시트 원본 제목 자동 조회 및 채우기
  const fetchSheetTitle = async (url: string, forceOverwrite = false) => {
    const trimmed = url.trim();
    if (!trimmed || trimmed.length < 20) return;

    setIsFetchingTitle(true);
    setTitleSyncFeedback(null);
    let resolvedTitle = "";
    let detectedSource: "file" | "tab" | "web" = "file";

    try {
      const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      const targetId = match ? match[1] : trimmed;

      // 1-1. 사용자 방문자 드라이브: 스프레드시트 쿼리 검색 (최대 100건)
      try {
        const driveRes = await listVisitorDriveFiles({
          pageSize: 100,
          query: "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
        }).catch(() => null);
        const files = driveRes?.files || (Array.isArray(driveRes) ? driveRes : []);
        const found = files.find((f: any) => f.id === targetId);
        if (found?.name) {
          resolvedTitle = found.name;
          detectedSource = "file";
        }
      } catch (err) {
        console.warn("Drive mime list warning:", err);
      }

      // 1-2. 사용자 방문자 드라이브: 전체 파일 목록 검색 폴백 (최대 100건)
      if (!resolvedTitle) {
        try {
          const driveRes = await listVisitorDriveFiles({ pageSize: 100 }).catch(() => null);
          const files = driveRes?.files || (Array.isArray(driveRes) ? driveRes : []);
          const found = files.find((f: any) => f.id === targetId);
          if (found?.name) {
            resolvedTitle = found.name;
            detectedSource = "file";
          }
        } catch (err) {
          console.warn("Drive all list warning:", err);
        }
      }

      // 1-3. 서버 사이드 메타데이터 조회 시도 (공개 시트 또는 웹 접근 가능 시트)
      if (!resolvedTitle) {
        try {
          const res = await apiFetch(`/api/sheets/title?url=${encodeURIComponent(trimmed)}`);
          const data = await res.json().catch(() => ({}));
          if (data?.success && data?.title) {
            resolvedTitle = data.title;
            detectedSource = "web";
          }
        } catch (err) {
          console.warn("Server title API warning:", err);
        }
      }

      // 1-4. 구글 시트 API를 통한 시트 내부 탭명 조회 폴백 (비공개 시트 안전망)
      if (!resolvedTitle) {
        try {
          const rangeRes = await getVisitorSheetRange(targetId, "A1:A1").catch(() => null);
          if (rangeRes?.range) {
            // '시트1'!A1:A1 또는 Sheet1!A1:A1 형식에서 시트 탭 이름 추출
            const rawTabName = rangeRes.range.split("!")[0].replace(/^['"]|['"]$/g, "").trim();
            if (rawTabName) {
              resolvedTitle = rawTabName;
              detectedSource = "tab";
            }
          }
        } catch (err) {
          console.warn("Sheet range fetch warning:", err);
        }
      }

      if (resolvedTitle) {
        setProjectName(resolvedTitle);
        setAutoDetectedTitle(resolvedTitle);
        setTitleSource(detectedSource);

        if (detectedSource === "tab") {
          setTitleSyncFeedback({
            type: "info",
            source: "tab",
            message: `'${resolvedTitle}' 시트 탭명이 채워졌습니다. 전체 시트 문서명으로 쓰시려면 직접 수정해 주세요.`,
          });
        } else {
          setTitleSyncFeedback({
            type: "success",
            source: detectedSource,
            message: `'${resolvedTitle}' 구글 시트 원본 제목이 성공적으로 동기화되었습니다!`,
          });
        }
      } else if (forceOverwrite) {
        if (scopeStatus === "needed") {
          setShowScopePrompt(true);
          setTitleSyncFeedback({
            type: "error",
            message: "구글 시트 접근 권한이 필요합니다. 상단의 '권한 승인' 버튼을 먼저 눌러주세요.",
          });
        } else {
          setTitleSyncFeedback({
            type: "error",
            message: "시트 정보를 자동으로 가져오지 못했습니다. 프로젝트 이름을 직접 입력해 주세요.",
          });
        }
      }
    } catch (e: any) {
      if (forceOverwrite) {
        setTitleSyncFeedback({
          type: "error",
          message: e?.message || "시트 제목 동기화 중 오류가 발생했습니다. 프로젝트 이름을 직접 입력해 주세요.",
        });
      }
    } finally {
      setIsFetchingTitle(false);
    }
  };

  // 구글 시트에 기존 Apps Script가 있는지 실시간 안전 감지
  const detectExistingGas = async (url: string) => {
    const trimmed = url.trim();
    if (!trimmed || trimmed.length < 20) {
      setExistingGasInfo(null);
      return;
    }

    setIsDetectingGas(true);
    try {
      const res = await apiFetch(`/api/projects/detect-gas?sheetUrl=${encodeURIComponent(trimmed)}`);
      const data = await res.json().catch(() => ({}));
      if (data?.success && data?.hasExistingScript) {
        setExistingGasInfo({
          hasExistingScript: true,
          projectId: data.projectId,
          filesCount: data.filesCount,
          files: data.files,
          functionNames: data.functionNames,
          existingCode: data.existingCode,
          scriptUrl: data.scriptUrl,
        });
        setMergeMode("MERGE"); // 기본값을 안전 병합으로 설정
      } else {
        setExistingGasInfo(null);
      }
    } catch (e) {
      // 오류 시 침묵
      setExistingGasInfo(null);
    } finally {
      setIsDetectingGas(false);
    }
  };

  // 구글 시트 원본 이름으로 동기화 버튼 클릭 핸들러
  const handleSyncTitle = () => {
    if (!sheetUrl.trim()) {
      setTitleSyncFeedback({
        type: "error",
        message: "연결할 구글 스프레드시트 URL을 먼저 입력해 주세요.",
      });
      return;
    }
    fetchSheetTitle(sheetUrl, true);
  };

  const handleApplyTemplate = (text: string) => {
    setPrompt(text);
  };

  // 엑셀 파일 업로드 및 구조 파싱 핸들러
  const handleExcelFile = async (file: File, selectedSheet?: string) => {
    if (!file) return;
    setIsUploadingExcel(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (selectedSheet) {
        formData.append("sheetName", selectedSheet);
      }

      const res = await apiFetch("/api/sheets/parse-excel", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "엑셀 파일 파싱에 실패했습니다.");
      }

      setParsedExcel(data);
      setExcelFile(file);

      // 프로젝트 이름이 비어있으면 파일명(확장자 제거)으로 자동 추천
      if (!projectName.trim()) {
        const cleanName = file.name.replace(/\.[^/.]+$/, "");
        setProjectName(cleanName);
      }

      // 프롬프트가 비어있으면 맞춤 추천 문구 자동 주입
      if (!prompt.trim()) {
        setPrompt(
          `업로드된 [${file.name}]의 '${data.activeSheet}' 시트 구조(${data.headers.join(", ")})를 기반으로 데이터를 관리하고 자동화하는 시스템을 구축해 주세요.`
        );
      }
    } catch (err: any) {
      setError(err.message || "엑셀 파일 분석 중 오류가 발생했습니다.");
    } finally {
      setIsUploadingExcel(false);
    }
  };

  // 구글 시트 원클릭 신규 생성 헬퍼
  const handleQuickOpenNewSheet = () => {
    window.open("https://docs.google.com/spreadsheets/create", "_blank");
  };

  // 1단계: AI 시트 사전 정밀 분석 실행 (무료)
  const handleStartAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();

    if (sourceMode === "EXISTING_URL" && !sheetUrl.trim()) {
      setError("연결할 구글 스프레드시트 URL 또는 ID를 입력해 주세요.");
      return;
    }
    if (sourceMode === "EXCEL_UPLOAD" && !parsedExcel) {
      setError("변환할 엑셀 파일(.xlsx, .xls, .csv)을 먼저 업로드해 주세요.");
      return;
    }
    if (!projectName.trim()) {
      setError("프로젝트 이름을 입력해 주세요.");
      return;
    }
    if (!prompt.trim()) {
      setError("자동화 요구사항을 자연어로 입력해 주세요.");
      return;
    }

    setAnalyzing(true);
    setError(null);

    try {
      const res = await apiFetch("/api/sheets/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: sourceMode === "EXCEL_UPLOAD" ? "EXCEL_UPLOAD" : sourceMode === "NEW_SHEET" ? "NEW_SHEET" : "URL",
          sheetUrl: sheetUrl.trim(),
          excelData: parsedExcel
            ? {
                fileName: parsedExcel.fileName,
                sheets: parsedExcel.sheets,
                activeSheet: parsedExcel.activeSheet,
                headers: parsedExcel.headers,
                sampleRows: parsedExcel.sampleRows,
              }
            : undefined,
          prompt: prompt.trim(),
          model: selectedModel,
        }),
      });
      const data = await res.json();
      if (!data.success || !data.schema) {
        throw new Error(data.error || "시트 구조 분석에 실패했습니다.");
      }

      setAnalyzedSchema(data.schema);
      setTurnCount(1);
      setFeedbackHistory([
        {
          role: "ai",
          message:
            data.schema.planSummary ||
            (sourceMode === "EXCEL_UPLOAD"
              ? `엑셀 파일 '${parsedExcel?.fileName}'의 컬럼 분석이 완료되었습니다. 아래 양식 구조와 실행 계획을 확인해 주세요.`
              : sourceMode === "NEW_SHEET"
              ? "요구사항에 맞춘 최적의 스프레드시트 양식 설계가 완료되었습니다. 아래 컬럼 구조를 확인해 주세요."
              : "스프레드시트 분석이 완료되었습니다. 아래 실행 계획을 검토해 주세요."),
        },
      ]);
      setStep(2); // 2단계 브리핑 화면으로 전환
    } catch (err: any) {
      setError(err.message || "시트 분석 중 오류가 발생했습니다.");
    } finally {
      setAnalyzing(false);
    }
  };

  // 2단계: 사용자 피드백 조율 전송 (최대 5회)
  const handleSendFeedback = async () => {
    if (!feedbackText.trim() || turnCount >= 5 || analyzing) return;

    setAnalyzing(true);
    setError(null);
    const userMsg = feedbackText.trim();
    setFeedbackText("");

    // 히스토리에 사용자 메시지 즉시 추가
    setFeedbackHistory((prev) => [...prev, { role: "user", message: userMsg }]);

    try {
      const res = await apiFetch("/api/sheets/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetUrl: sheetUrl.trim(),
          prompt: prompt.trim(),
          model: selectedModel,
          feedback: userMsg,
          previousSchema: analyzedSchema,
          turn: turnCount + 1,
        }),
      });
      const data = await res.json();
      if (!data.success || !data.schema) {
        throw new Error(data.error || "피드백 반영 중 오류가 발생했습니다.");
      }

      setAnalyzedSchema(data.schema);
      setTurnCount((prev) => prev + 1);
      setFeedbackHistory((prev) => [
        ...prev,
        {
          role: "ai",
          message: data.schema.planSummary || "피드백을 반영하여 계획을 업데이트했습니다.",
        },
      ]);
    } catch (err: any) {
      setError(err.message || "피드백 조율 중 오류가 발생했습니다.");
    } finally {
      setAnalyzing(false);
    }
  };

  // 관리자 1:1 맞춤 제작 문의 접수 핸들러
  const handleSubmitInquiry = async () => {
    setSubmittingInquiry(true);
    setError(null);

    try {
      const historyStr = feedbackHistory
        .map((h) => `${h.role === "user" ? "사용자" : "AI"}: ${h.message}`)
        .join("\n");

      const inquiryContent = `[대상 구글 스프레드시트]
${sheetUrl}

[프로젝트 명칭]
${projectName || "스마트 시트 자동화"}

[사용자 원본 요구사항]
${prompt}

[AI가 분석한 시트 스키마]
- 양식 유형: ${analyzedSchema?.archetypeName || analyzedSchema?.archetype || "누적 대장형"}
- 대상 탭: ${analyzedSchema?.targetTab || "기본 시트"}
- 감지된 헤더 및 컬럼 수: ${analyzedSchema?.columns?.length || 0}개 열
${(analyzedSchema?.columns || []).map((c: any) => `  * ${c.letter || c.index}열: ${c.name}`).join("\n")}

[조율 대화 내역 (${turnCount}/5회 진행)]
${historyStr || "(조율 내역 없음)"}

[고객 추가 전달 메모]
${inquiryMemo.trim() || "(추가 메모 없음)"}`;

      const res = await apiFetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "AUTOMATION_REQUEST",
          title: `[맞춤 제작 문의] ${projectName || "스마트 시트 자동화"}`,
          content: inquiryContent,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "문의 접수에 실패했습니다.");
      }

      setInquirySuccess(true);
    } catch (err: any) {
      setError(err.message || "문의 접수 중 오류가 발생했습니다.");
    } finally {
      setSubmittingInquiry(false);
    }
  };

  // 2단계 -> 3단계: 최종 승인 및 코드 생성/배포 (정규 토큰 1회 일괄 차감)
  const handleFinalDeploy = async () => {
    setLoading(true);
    setError(null);

    try {
      let targetSheetUrl = sheetUrl.trim();

      // 만약 구글 시트 URL이 비어있다면, 서버에서 sheets_create_spreadsheet로 자동 생성 시도
      if (!targetSheetUrl) {
        setIsCreatingSheet(true);
        try {
          const createRes = await apiFetch("/api/sheets/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: projectName.trim() || "새 스프레드시트",
              data: parsedExcel?.previewGrid || (analyzedSchema?.columns ? [analyzedSchema.columns.map((c: any) => c.name)] : []),
            }),
          });
          const createData = await createRes.json();
          if (createData.success && createData.spreadsheetUrl) {
            targetSheetUrl = createData.spreadsheetUrl;
            setSheetUrl(targetSheetUrl);
            setAutoCreatedSheet({ id: createData.spreadsheetId, url: createData.spreadsheetUrl });
          } else {
            throw new Error(
              "바인딩할 구글 스프레드시트 URL이 필요합니다. 아래 입력란에 구글 시트 URL을 입력해 주시거나 'Google Sheets 새 시트 열기' 버튼을 눌러 새 시트를 생성해 주세요."
            );
          }
        } finally {
          setIsCreatingSheet(false);
        }
      }

      // 1. AI 코드 생성 (사전 분석된 스키마 및 기존 코드 병합 옵션 주입)
      const genRes = await apiFetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          sheetUrl: targetSheetUrl,
          customTitle: projectName,
          model: selectedModel,
          analyzedSchema, // 검증 및 조율된 시트 구조 주입
          existingScriptCode: existingGasInfo?.existingCode || undefined,
          mergeMode: existingGasInfo?.hasExistingScript ? mergeMode : "OVERWRITE",
        }),
      });
      const genJson = await genRes.json();
      if (!genJson.success || !genJson.data) {
        throw new Error(genJson.error || "AI 코드 생성에 실패했습니다.");
      }

      const scriptData = genJson.data;

      // 2. 프로젝트 등록 및 배포 (My DB 정규 테이블 저장)
      const projRes = await apiFetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectName.trim(),
          spreadsheetUrl: targetSheetUrl,
          scriptCode: scriptData.scriptCode,
          manifest: scriptData.manifest,
          summary: scriptData.summary,
          features: scriptData.features,
          triggers: scriptData.triggers,
          prompt,
        }),
      });

      const projJson = await projRes.json();
      if (!projJson.success) {
        throw new Error(projJson.error || "프로젝트 저장에 실패했습니다.");
      }

      setGeneratedResult({
        ...scriptData,
        project: projJson.project,
      });
      setStep(3);
    } catch (err: any) {
      const msg = err.message || "처리 중 오류가 발생했습니다.";
      setError(msg);
      if (
        msg.includes("권한") ||
        msg.includes("permission") ||
        msg.includes("403") ||
        msg.includes("scope") ||
        msg.includes("인증") ||
        msg.includes("Drive") ||
        msg.includes("Sheets")
      ) {
        setShowScopePrompt(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = () => {
    onSuccess();
    onClose();
    setStep(1);
    setSourceMode("NEW_SHEET");
    setSheetUrl("");
    setProjectName("");
    setAutoDetectedTitle(null);
    setPrompt("");
    setParsedExcel(null);
    setExcelFile(null);
    setAutoCreatedSheet(null);
    setAnalyzedSchema(null);
    setTurnCount(0);
    setFeedbackHistory([]);
    setIsInquiryOpen(false);
    setInquiryMemo("");
    setInquirySuccess(false);
    setGeneratedResult(null);
    setExistingGasInfo(null);
    setMergeMode("MERGE");
    setShowCodePreview(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        {/* 모달 헤더 */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-sm text-slate-800">
                  {step === 1 && "새 Apps Script 자동화 프로젝트 추가"}
                  {step === 2 && "🔍 AI 시트 분석 브리핑 및 사전 동의 (HITL)"}
                  {step === 3 && "🎉 자동화 코드 배포 완료!"}
                </h3>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {step === 1 && "1단계: 정보 입력"}
                  {step === 2 && `2단계: 계획 검토 (${turnCount}/5회 조율)`}
                  {step === 3 && "3단계: 배포 완료"}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {step === 1 && "구글 시트 URL과 원하는 기능을 입력하면 AI가 시트 구조를 먼저 정밀 분석합니다."}
                {step === 2 && "AI가 파악한 시트 양식과 실행 계획을 확인하고, 필요한 경우 자유롭게 수정 조율할 수 있습니다."}
                {step === 3 && "Google Apps Script가 구글 시트에 안전하게 바인딩되었습니다."}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading || analyzing}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Google Workspace 권한 상태 실시간 인디케이터 */}
        {scopeStatus === "granted" ? (
          <div className="px-3.5 py-2 bg-emerald-50 border border-emerald-200/80 rounded-2xl flex items-center justify-between gap-2 text-emerald-800 text-xs font-bold shadow-2xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Google 드라이브·스프레드시트 연동 권한: 정상 승인됨 (생성 및 배포 준비 완료)</span>
            </div>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-200/70 text-emerald-800">
              Workspace 연동 완료
            </span>
          </div>
        ) : scopeStatus === "needed" ? (
          <div className="px-3.5 py-2 bg-amber-50 border border-amber-200/80 rounded-2xl flex items-center justify-between gap-2 text-amber-900 text-xs font-bold shadow-2xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>구글 시트 연동 권한 승인이 필요합니다.</span>
            </div>
            <button
              type="button"
              onClick={handleGrantWorkspaceScopes}
              disabled={isGrantingScope}
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[11px] font-black transition-all shadow-xs cursor-pointer flex items-center gap-1 shrink-0"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{isGrantingScope ? "이동 중..." : "1초 권한 승인하기"}</span>
            </button>
          </div>
        ) : null}

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2 text-rose-700 text-xs font-bold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 🔐 권한 안내 및 추가 요청 배너 (점진적 권한 요청 UX) */}
        {showScopePrompt && (
          <div className="p-4 bg-gradient-to-r from-indigo-50 via-purple-50 to-emerald-50 border-2 border-indigo-200/80 rounded-2xl space-y-2.5 animate-in fade-in duration-200 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-xs shrink-0 mt-0.5">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-extrabold text-xs text-indigo-950 flex items-center gap-1.5">
                    <span>Google 스프레드시트 및 드라이브 연동 권한 안내</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-200/80 text-indigo-800">
                      최소 권한 보호
                    </span>
                  </h4>
                  <p className="text-[11px] text-indigo-900/80 leading-relaxed">
                    회원가입 시점에는 보안을 위해 최소 권한(이메일)만 수집되었습니다.<br />
                    내 구글 시트와 직접 연동하거나 자동 생성된 시트에 Apps Script 코드를 배포하기 위해 <strong>스프레드시트/드라이브 파일 권한</strong>을 추가로 승인해 주세요.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowScopePrompt(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1 border-t border-indigo-100/80">
              <button
                type="button"
                onClick={() => setShowScopePrompt(false)}
                className="px-3 py-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-700 hover:bg-white/60 rounded-xl transition-all cursor-pointer"
              >
                나중에 하기
              </button>
              <button
                type="button"
                onClick={handleGrantWorkspaceScopes}
                disabled={isGrantingScope}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-extrabold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isGrantingScope ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Google 동의창 이동 중...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Google 드라이브·시트 권한 승인하기</span>
                    <ArrowRight className="w-3 h-3" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 1: 기본 정보 입력 */}
        {step === 1 && (
          <form onSubmit={handleStartAnalysis} className="space-y-4 text-xs">
            {/* 상단 3대 생성 방식 선택 세그먼트 */}
            <div className="p-1 bg-slate-100 rounded-2xl grid grid-cols-3 gap-1 shadow-inner border border-slate-200/60">
              <button
                type="button"
                onClick={() => setSourceMode("NEW_SHEET")}
                className={`py-2 px-2.5 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  sourceMode === "NEW_SHEET"
                    ? "bg-white text-emerald-700 shadow-sm ring-1 ring-slate-200/80"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="truncate">✨ 새 시트 자동 생성</span>
              </button>

              <button
                type="button"
                onClick={() => setSourceMode("EXCEL_UPLOAD")}
                className={`py-2 px-2.5 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  sourceMode === "EXCEL_UPLOAD"
                    ? "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/80"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <UploadCloud className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span className="truncate">📁 엑셀 업로드 변환</span>
              </button>

              <button
                type="button"
                onClick={() => setSourceMode("EXISTING_URL")}
                className={`py-2 px-2.5 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  sourceMode === "EXISTING_URL"
                    ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/80"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Link2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="truncate">🔗 기존 시트 URL</span>
              </button>
            </div>

            {/* 모드 1: 새 구글 시트 자동 생성 모드 */}
            {sourceMode === "NEW_SHEET" && (
              <div className="p-4 bg-gradient-to-br from-emerald-50/90 to-teal-50/60 border border-emerald-200 rounded-2xl space-y-3 animate-in fade-in duration-150">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-emerald-500 text-white rounded-xl shadow-xs shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-extrabold text-slate-800 text-xs">
                      기존 구글 시트가 없어도 바로 시작할 수 있습니다!
                    </h4>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      원하시는 업무 요구사항을 자연어로 입력하시면, AI가 최적의 시트 구조(컬럼 A, B, C, D... 및 양식 유형)를 자동으로 설계하고 완성형 Apps Script를 바인딩해 드립니다.
                    </p>
                  </div>
                </div>

                <div className="pt-1 border-t border-emerald-200/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 text-[11px]">
                  <span className="text-slate-500 font-medium">
                    💡 빈 구글 시트가 필요하신가요? 1초 만에 새 시트를 열 수 있습니다.
                  </span>
                  <button
                    type="button"
                    onClick={handleQuickOpenNewSheet}
                    className="inline-flex items-center justify-center gap-1 font-bold text-emerald-700 bg-white hover:bg-emerald-50 border border-emerald-300 px-3 py-1.5 rounded-xl shadow-2xs transition-all cursor-pointer shrink-0"
                  >
                    <span>Google Sheets 새 시트 열기</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* 선택적 시트 URL 사전 연결 입력란 */}
                <div className="pt-2 space-y-1">
                  <label className="font-bold text-slate-700 text-[11px] flex items-center justify-between">
                    <span>바인딩할 새 구글 시트 URL (선택 사항)</span>
                    <span className="text-[10px] text-emerald-600 font-semibold">지금 비워두셔도 됩니다</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={sheetUrl}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSheetUrl(val);
                        if (val.includes("/spreadsheets/d/") || val.length >= 25) {
                          fetchSheetTitle(val);
                        }
                      }}
                      placeholder="https://docs.google.com/spreadsheets/d/... (열린 새 시트의 주소를 복사해 넣으시면 연결됩니다)"
                      className="w-full pl-9 pr-3 py-2 bg-white/90 border border-emerald-200 rounded-xl text-xs font-mono font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                    <FileSpreadsheet className="w-4 h-4 text-emerald-500 absolute left-3 top-2.5" />
                  </div>
                </div>
              </div>
            )}

            {/* 모드 2: 엑셀 파일 업로드 변환 모드 */}
            {sourceMode === "EXCEL_UPLOAD" && (
              <div className="space-y-3 animate-in fade-in duration-150">
                {/* 엑셀 파일 드롭존 */}
                {!parsedExcel ? (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleExcelFile(file);
                    }}
                    className={`p-6 border-2 border-dashed rounded-2xl text-center transition-all cursor-pointer ${
                      isDragging
                        ? "border-indigo-500 bg-indigo-50/80"
                        : "border-slate-300 hover:border-indigo-400 bg-slate-50/60 hover:bg-slate-50"
                    }`}
                    onClick={() => {
                      const input = document.getElementById("excel-file-input") as HTMLInputElement;
                      if (input) input.click();
                    }}
                  >
                    <input
                      id="excel-file-input"
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleExcelFile(file);
                      }}
                    />
                    <div className="flex flex-col items-center gap-2">
                      <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl">
                        {isUploadingExcel ? (
                          <RefreshCw className="w-6 h-6 animate-spin" />
                        ) : (
                          <FileUp className="w-6 h-6" />
                        )}
                      </div>
                      <div>
                        <span className="font-extrabold text-xs text-slate-800 block">
                          {isUploadingExcel
                            ? "엑셀 파일의 시트 구조 및 데이터를 정밀 분석하고 있습니다..."
                            : "PC의 엑셀 파일(.xlsx, .xls, .csv)을 끌어다 놓거나 클릭하여 선택하세요"}
                        </span>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          시트 탭 목록, 헤더 열(컬럼명), 실제 데이터 행을 AI가 즉시 자동 추출합니다.
                        </p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 border border-indigo-200">
                        지원 형식: .xlsx, .xls, .csv (최대 50MB)
                      </span>
                    </div>
                  </div>
                ) : (
                  /* 엑셀 파일 분석 완료 카드 및 데이터 미리보기 */
                  <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-2xl space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-xs shrink-0">
                          <FileCheck className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-xs text-slate-900">{parsedExcel.fileName}</span>
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-200/80 text-indigo-800">
                              분석 완료
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-600 mt-0.5">
                            <span>전체 {parsedExcel.totalRows}행</span>
                            <span>•</span>
                            <span>컬럼 {parsedExcel.headers.length}개</span>
                            {parsedExcel.sheets.length > 1 && (
                              <>
                                <span>•</span>
                                <span className="font-semibold text-indigo-700">시트 {parsedExcel.sheets.length}개 감지</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setParsedExcel(null);
                          setExcelFile(null);
                        }}
                        className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 bg-white border border-indigo-200 hover:border-indigo-300 px-2.5 py-1 rounded-lg transition-all cursor-pointer shrink-0"
                      >
                        파일 변경
                      </button>
                    </div>

                    {/* 복수 시트일 경우 시트 선택 셀렉트 */}
                    {parsedExcel.sheets.length > 1 && excelFile && (
                      <div className="flex items-center gap-2 pt-1">
                        <label className="text-[11px] font-bold text-slate-700 shrink-0">변환할 시트 탭 선택:</label>
                        <select
                          value={parsedExcel.activeSheet}
                          onChange={(e) => handleExcelFile(excelFile, e.target.value)}
                          className="bg-white border border-indigo-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          {parsedExcel.sheets.map((s, idx) => (
                            <option key={idx} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* 추출된 헤더 뱃지 리스트 */}
                    {parsedExcel.headers.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <span className="text-[11px] font-bold text-slate-700 block">감지된 컬럼 헤더 목록:</span>
                        <div className="flex flex-wrap gap-1">
                          {parsedExcel.headers.map((h, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 bg-white border border-indigo-200 rounded-md font-mono text-[10px] font-bold text-indigo-900 shadow-2xs"
                            >
                              {String.fromCharCode(65 + idx)}열: {h}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 엑셀 데이터 미리보기 테이블 */}
                    {parsedExcel.previewGrid && parsedExcel.previewGrid.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <span className="text-[11px] font-bold text-slate-700 block">데이터 미리보기 (상위 샘플):</span>
                        <div className="border border-indigo-200 rounded-xl overflow-x-auto max-h-32 bg-white">
                          <table className="w-full text-[10px] text-left border-collapse">
                            <thead>
                              <tr className="bg-indigo-100/70 border-b border-indigo-200 text-indigo-950 font-bold">
                                {parsedExcel.headers.map((h, idx) => (
                                  <th key={idx} className="px-2 py-1.5 whitespace-nowrap border-r border-indigo-200 last:border-r-0">
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {parsedExcel.sampleRows.slice(0, 3).map((row, rIdx) => (
                                <tr key={rIdx} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                                  {parsedExcel.headers.map((_, cIdx) => (
                                    <td key={cIdx} className="px-2 py-1 whitespace-nowrap text-slate-700 border-r border-slate-100 last:border-r-0">
                                      {row[cIdx] !== undefined && row[cIdx] !== null ? String(row[cIdx]) : ""}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* 연결할 대상 시트 URL 및 퀵 생성 안내 */}
                    <div className="pt-2 border-t border-indigo-200/60 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="font-bold text-slate-700 text-[11px] block">
                          데이터를 복원할 구글 시트 URL (선택 사항)
                        </label>
                        <button
                          type="button"
                          onClick={handleQuickOpenNewSheet}
                          className="text-[10px] font-bold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-0.5 cursor-pointer"
                        >
                          <span>새 시트 열기</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          value={sheetUrl}
                          onChange={(e) => setSheetUrl(e.target.value)}
                          placeholder="https://docs.google.com/spreadsheets/d/... (비워두셔도 분석 및 설계 가능)"
                          className="w-full pl-9 pr-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs font-mono font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                        <FileSpreadsheet className="w-4 h-4 text-indigo-500 absolute left-3 top-2.5" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 모드 3: 기존 구글 시트 URL 직접 연결 모드 */}
            {sourceMode === "EXISTING_URL" && (
              <div className="space-y-1 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700 block">연결할 구글 스프레드시트 URL 또는 ID *</label>
                  <div className="flex items-center gap-2 text-[11px] font-semibold">
                    <button
                      type="button"
                      onClick={() => setShowScopePrompt(true)}
                      className="text-[10px] text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                    >
                      <ShieldCheck className="w-3 h-3 text-indigo-500" />
                      <span>드라이브·시트 권한 확인</span>
                    </button>
                    {isFetchingTitle && (
                      <span className="flex items-center gap-1 text-emerald-600 animate-pulse">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        시트 제목 조회 중...
                      </span>
                    )}
                    {isDetectingGas && (
                      <span className="flex items-center gap-1 text-indigo-600 animate-pulse">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        기존 스크립트 검사 중...
                      </span>
                    )}
                  </div>
                </div>
                <div
                  className="relative"
                  data-easybot-hint="스프레드시트 URL: Apps Script 코드가 바인딩될 대상 구글 시트의 전체 URL 또는 스프레드시트 ID를 입력합니다."
                >
                  <input
                    type="text"
                    value={sheetUrl}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSheetUrl(val);
                      if (val.includes("/spreadsheets/d/") || val.length >= 25) {
                        fetchSheetTitle(val);
                        detectExistingGas(val);
                      }
                    }}
                    onPaste={(e) => {
                      const pasted = e.clipboardData.getData("text");
                      if (pasted && (pasted.includes("/spreadsheets/d/") || pasted.length >= 25)) {
                        setSheetUrl(pasted);
                        fetchSheetTitle(pasted, true);
                        detectExistingGas(pasted);
                      }
                    }}
                    onBlur={() => {
                      if (sheetUrl) {
                        fetchSheetTitle(sheetUrl);
                        detectExistingGas(sheetUrl);
                      }
                    }}
                    placeholder="https://docs.google.com/spreadsheets/d/1vVmz56s0QrknZfhaOod_EX6-eoiYlXGW220inT5qXME/edit"
                    className="w-full pl-9 pr-24 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    required={sourceMode === "EXISTING_URL"}
                  />
                  <FileSpreadsheet className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  {sheetUrl.trim() && (
                    <button
                      type="button"
                      onClick={handleSyncTitle}
                      disabled={isFetchingTitle}
                      className="absolute right-2 top-1.5 px-2.5 py-1 text-[10px] font-extrabold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      title="입력된 구글 시트의 이름 정보를 읽어와 프로젝트 이름에 채웁니다."
                    >
                      <RefreshCw className={`w-3 h-3 ${isFetchingTitle ? "animate-spin" : ""}`} />
                      <span>{isFetchingTitle ? "조회 중..." : "시트명 가져오기"}</span>
                    </button>
                  )}
                </div>

                {/* 🛡️ 기존 Apps Script 코드 안전 감지 배너 및 모드 선택 카드 */}
                {existingGasInfo && existingGasInfo.hasExistingScript && (
                  <div className="mt-2 p-3 bg-amber-50/90 border border-amber-200 rounded-2xl space-y-2.5 animate-in fade-in duration-150">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-amber-100 text-amber-700 rounded-lg">
                          <ShieldCheck className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-xs text-amber-950">
                              기존 Apps Script 코드가 감지되었습니다!
                            </span>
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-800">
                              안전 보호 작동 중
                            </span>
                          </div>
                          <p className="text-[11px] text-amber-800 mt-0.5 leading-snug">
                            해당 구글 시트에 이미 작성된 스크립트 파일({existingGasInfo.filesCount || 0}개) 및 함수({existingGasInfo.functionNames?.length || 0}개)가 있습니다.
                          </p>
                        </div>
                      </div>

                      {existingGasInfo.existingCode && (
                        <button
                          type="button"
                          onClick={() => setShowCodePreview((prev) => !prev)}
                          className="text-[11px] font-bold text-amber-800 hover:text-amber-900 bg-white/80 hover:bg-white border border-amber-300 px-2.5 py-1 rounded-lg transition-all cursor-pointer shrink-0 flex items-center gap-1"
                        >
                          <Code className="w-3 h-3" />
                          <span>{showCodePreview ? "코드 접기" : "기존 코드 보기"}</span>
                        </button>
                      )}
                    </div>

                    {/* 감지된 함수 배지 리스트 */}
                    {existingGasInfo.functionNames && existingGasInfo.functionNames.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 text-[10px] pt-0.5">
                        <span className="font-bold text-amber-900">감지된 함수:</span>
                        {existingGasInfo.functionNames.slice(0, 6).map((fn, idx) => (
                          <span
                            key={idx}
                            className="font-mono font-bold px-1.5 py-0.5 bg-white/90 border border-amber-200 text-amber-900 rounded"
                          >
                            {fn}()
                          </span>
                        ))}
                        {existingGasInfo.functionNames.length > 6 && (
                          <span className="text-amber-700 font-bold">
                            외 {existingGasInfo.functionNames.length - 6}개
                          </span>
                        )}
                      </div>
                    )}

                    {/* 기존 소스코드 미리보기 토글 */}
                    {showCodePreview && existingGasInfo.existingCode && (
                      <div className="p-2.5 bg-slate-900 text-slate-100 rounded-xl font-mono text-[11px] max-h-40 overflow-y-auto border border-slate-700 leading-relaxed">
                        <pre className="whitespace-pre-wrap">{existingGasInfo.existingCode}</pre>
                      </div>
                    )}

                    {/* 안전 병합(Merge) vs 덮어쓰기(Overwrite) 선택 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <label
                        className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                          mergeMode === "MERGE"
                            ? "bg-white border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs"
                            : "bg-white/60 border-amber-200 hover:bg-white text-slate-600"
                        }`}
                      >
                        <input
                          type="radio"
                          name="mergeMode"
                          value="MERGE"
                          checked={mergeMode === "MERGE"}
                          onChange={() => setMergeMode("MERGE")}
                          className="mt-0.5 accent-emerald-600"
                        />
                        <div>
                          <div className="flex items-center gap-1">
                            <span className="font-extrabold text-xs text-slate-800">
                              🛡️ 기존 코드 보존 & 새 기능 추가
                            </span>
                            <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                              권장
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                            기존 함수와 메뉴를 100% 보존하면서 새 자동화 기능을 덧붙여 안전하게 병합합니다.
                          </p>
                        </div>
                      </label>

                      <label
                        className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                          mergeMode === "OVERWRITE"
                            ? "bg-white border-rose-500 ring-2 ring-rose-500/20 shadow-xs"
                            : "bg-white/60 border-amber-200 hover:bg-white text-slate-600"
                        }`}
                      >
                        <input
                          type="radio"
                          name="mergeMode"
                          value="OVERWRITE"
                          checked={mergeMode === "OVERWRITE"}
                          onChange={() => setMergeMode("OVERWRITE")}
                          className="mt-0.5 accent-rose-600"
                        />
                        <div>
                          <div className="flex items-center gap-1">
                            <span className="font-extrabold text-xs text-slate-800">
                              ⚠️ 기존 코드 덮어쓰기
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                            기존 코드를 지우고 새 요구사항에 맞춰 완전히 새롭게 작성합니다.
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 프로젝트 이름 */}
            <div
              className="space-y-1"
              data-easybot-hint="프로젝트 명칭: 대시보드에서 식별할 수 있는 직관적인 자동화 프로젝트 이름을 입력합니다."
            >
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-700 block">프로젝트 이름 *</label>
                {sheetUrl.trim() && (
                  isFetchingTitle ? (
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                      <RefreshCw className="w-3 h-3 animate-spin text-slate-500" />
                      <span>동기화 중...</span>
                    </span>
                  ) : autoDetectedTitle && projectName === autoDetectedTitle ? (
                    titleSource === "tab" ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-300">
                        <CheckCircle2 className="w-3 h-3 text-amber-600" />
                        <span>시트 탭명 반영됨 (직접 수정 가능)</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>시트 파일명 동기화됨</span>
                      </span>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={handleSyncTitle}
                      className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-all cursor-pointer"
                      title="클릭 시 구글 스프레드시트의 이름으로 다시 동기화합니다."
                    >
                      <RefreshCw className="w-3 h-3 text-indigo-600" />
                      <span>시트명 동기화</span>
                    </button>
                  )
                )}
              </div>
              <input
                type="text"
                value={projectName}
                onChange={(e) => {
                  setProjectName(e.target.value);
                  if (titleSyncFeedback) setTitleSyncFeedback(null);
                }}
                placeholder="예: 일일 마감 및 매출 자동 집계"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                required
              />
              {titleSyncFeedback && (
                titleSyncFeedback.source === "tab" ? (
                  <div className="mt-1.5 p-2.5 rounded-xl text-xs bg-amber-50/90 text-amber-900 border border-amber-200/90 space-y-1 animate-in fade-in duration-200">
                    <div className="flex items-center gap-2 font-bold">
                      <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>{titleSyncFeedback.message}</span>
                    </div>
                    <p className="text-[11px] text-amber-700 pl-6 leading-relaxed">
                      💡 비공개 시트는 Google 보안 정책상 내부 탭명이 먼저 반영됩니다. 전체 스프레드시트 이름으로 사용하시려면 위 입력창에서 자유롭게 직접 수정해 주세요.
                    </p>
                  </div>
                ) : titleSyncFeedback.type === "success" ? (
                  <div className="mt-1.5 px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-200 animate-in fade-in duration-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{titleSyncFeedback.message}</span>
                  </div>
                ) : (
                  <div className="mt-1.5 px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between gap-2 bg-rose-50 text-rose-800 border border-rose-200 animate-in fade-in duration-200">
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                      <span className="truncate">{titleSyncFeedback.message}</span>
                    </div>
                    {scopeStatus === "needed" && (
                      <button
                        type="button"
                        onClick={() => setShowScopePrompt(true)}
                        className="px-2 py-0.5 text-[11px] font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg shrink-0 transition-colors cursor-pointer"
                      >
                        권한 승인
                      </button>
                    )}
                  </div>
                )
              )}
            </div>

            {/* 템플릿 추천 버튼 */}
            <div
              className="space-y-1.5 pt-1"
              data-easybot-hint="추천 템플릿: 자주 사용되는 자동화 시나리오를 원클릭으로 프롬프트에 채웁니다."
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400 block">⚡ 추천 프롬프트 빠른 채우기:</span>
                <button
                  type="button"
                  onClick={() => setShowPromptGallery(true)}
                  className="text-[11px] font-extrabold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200/80 px-2.5 py-0.5 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 text-emerald-600" />
                  <span>✨ 실무 추천 프롬프트 갤러리 둘러보기 ↗</span>
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleApplyTemplate(
                      "구글 시트 사이드바에서 PDF 발주서 파일을 업로드하면 AI가 분석하여 발주서 접수대장에 품목별로 1행씩 분리하여 최신순으로 자동 등록하는 시스템을 만들어줘."
                    )
                  }
                  className="p-2 text-left bg-slate-50 hover:bg-emerald-50/70 border border-slate-200/80 hover:border-emerald-300 rounded-xl text-[11px] font-bold text-slate-700 transition-all cursor-pointer flex flex-col gap-0.5"
                >
                  <span className="text-emerald-700">📄 PDF 발주서 AI 자동 접수</span>
                  <span className="text-[10px] text-slate-400 line-clamp-1">사이드바 업로드 & 품목 분리</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleApplyTemplate(
                      "일반 대중 및 고객에게 배포할 수 있는 모바일 반응형 설문 및 신청 접수 웹페이지(doGet Web App)를 만들어줘. 성함, 연락처, 신청내용을 깔끔한 폼으로 입력받아 이 구글 시트에 실시간으로 기록하고, 제출 완료 화면을 띄워줘."
                    )
                  }
                  className="p-2 text-left bg-slate-50 hover:bg-sky-50/70 border border-slate-200/80 hover:border-sky-300 rounded-xl text-[11px] font-bold text-slate-700 transition-all cursor-pointer flex flex-col gap-0.5"
                >
                  <span className="text-sky-700">🌐 설문/접수 공개 웹페이지</span>
                  <span className="text-[10px] text-slate-400 line-clamp-1">독립 웹 폼 & 실시간 시트 기록</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleApplyTemplate(
                      "매일 자정에 당일 입력된 대장 데이터를 '일일_마감' 시트로 자동 복사 백업하고 총 수량과 합계 금액을 자동 계산하는 시간 기반 일일 자동 마감 기능을 만들어줘."
                    )
                  }
                  className="p-2 text-left bg-slate-50 hover:bg-indigo-50/70 border border-slate-200/80 hover:border-indigo-300 rounded-xl text-[11px] font-bold text-slate-700 transition-all cursor-pointer flex flex-col gap-0.5"
                >
                  <span className="text-indigo-700">🕒 일일 대장 자동 마감</span>
                  <span className="text-[10px] text-slate-400 line-clamp-1">매일 자정 백업 및 합계 산출</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleApplyTemplate(
                      "시트 데이터가 수정될 때마다 변경 이력을 '로그' 시트에 자동으로 남기고, 특정 셀 값이 '승인'으로 변경되면 실시간 알림을 띄우는 onEdit 트리거를 작성해줘."
                    )
                  }
                  className="p-2 text-left bg-slate-50 hover:bg-amber-50/70 border border-slate-200/80 hover:border-amber-300 rounded-xl text-[11px] font-bold text-slate-700 transition-all cursor-pointer flex flex-col gap-0.5"
                >
                  <span className="text-amber-700">⚡ 실시간 변경 이력 로깅</span>
                  <span className="text-[10px] text-slate-400 line-clamp-1">셀 수정 시 자동 이력 적재</span>
                </button>
              </div>
            </div>

            {/* AI 엔진 모델 선택 */}
            {allowUserSelection && pricingModels.length > 0 && (
              <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
                    <Cpu className="w-3.5 h-3.5 text-indigo-600" />
                    <span>사용할 Gemini AI 엔진 선택</span>
                  </div>
                  {pricingModels.find((m) => m.id === selectedModel) && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                      토큰 차감 {pricingModels.find((m) => m.id === selectedModel)?.tokenMultiplier}배
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-indigo-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    {pricingModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.tokenMultiplier}x 차감)
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-indigo-700/80 flex items-center leading-tight">
                    {pricingModels.find((m) => m.id === selectedModel)?.description || "선택한 모델의 스펙으로 정밀 코드가 생성됩니다."}
                  </p>
                </div>
              </div>
            )}

            {/* 자연어 프롬프트 입력 */}
            <div
              className="space-y-1"
              data-easybot-hint="요구사항 기술: 구현하고자 하는 자동화 기능을 자유롭게 작성합니다."
            >
              <label className="font-bold text-slate-700 block">자동화 기능 요구사항 (자연어로 자유롭게 기술) *</label>
              <textarea
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="예: 구글 시트 사이드바에서 PDF 발주서를 업로드하면 AI가 분석하여 '발주서 접수대장'에 품목별로 최신순 등록해줘."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none leading-relaxed"
                required
              />
            </div>

            {/* 1단계 액션 버튼 */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-bold">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>사전 분석 & 5회 조율 무료 제공 (최종 승인 시에만 토큰 차감)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={analyzing}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={analyzing}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white transition-all shadow-md shadow-emerald-500/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {analyzing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>시트 2차원 구조 및 수식 정밀 분석 중...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>🔍 AI 시트 정밀 분석 및 계획 수립</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Step 2: AI 분석 브리핑 및 대화형 조율(HITL) */}
        {step === 2 && analyzedSchema && (
          <div className="space-y-4 text-xs">
            {/* 연결 대상 구글 시트 확인 및 입력 카드 */}
            <div className={`p-3 rounded-2xl border transition-all ${
              sheetUrl.trim()
                ? "bg-slate-50 border-slate-200"
                : "bg-emerald-50/80 border-emerald-300 ring-2 ring-emerald-500/10"
            }`}>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className={`w-4 h-4 ${sheetUrl.trim() ? "text-emerald-600" : "text-emerald-700 animate-bounce"}`} />
                  <span className="font-extrabold text-slate-800 text-xs">
                    {sheetUrl.trim() ? "연결된 구글 스프레드시트" : "📌 바인딩할 구글 스프레드시트 지정"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleQuickOpenNewSheet}
                  className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-0.5 bg-white border border-emerald-300 px-2 py-0.5 rounded-lg shadow-2xs cursor-pointer"
                >
                  <span>새 구글 시트 열기</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={sheetUrl}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSheetUrl(val);
                    if (val.includes("/spreadsheets/d/") || val.length >= 25) {
                      fetchSheetTitle(val);
                      detectExistingGas(val);
                    }
                  }}
                  placeholder="https://docs.google.com/spreadsheets/d/... (새 시트 주소를 여기에 붙여넣으세요)"
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-mono font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
                <Link2 className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              </div>
            </div>

            {/* 시트 분석 요약 카드 */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Table className="w-4 h-4 text-indigo-600" />
                  <span className="font-extrabold text-slate-800 text-xs">
                    분석된 시트: <span className="text-indigo-600 font-mono font-bold">'{analyzedSchema.targetTab || "기본 시트"}'</span>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {existingGasInfo?.hasExistingScript && (
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                      mergeMode === "MERGE"
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        : "bg-rose-100 text-rose-800 border border-rose-300"
                    }`}>
                      {mergeMode === "MERGE"
                        ? `🛡️ 기존 코드 ${existingGasInfo.functionNames?.length || 0}개 함수 보존 병합`
                        : "⚠️ 기존 코드 덮어쓰기 모드"}
                    </span>
                  )}
                  <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                    {analyzedSchema.archetypeName || analyzedSchema.archetype || "📊 누적 대장형"}
                  </span>
                </div>
              </div>

              {/* 컬럼/셀 구조 배지 */}
              {analyzedSchema.columns && analyzedSchema.columns.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold">
                    <span>
                      감지된 헤더 ({analyzedSchema.headerRow || 1}행, 총 {analyzedSchema.columns.length}개 열):
                    </span>
                    <span className="text-[10px] text-emerald-600 font-bold">
                      삽입 기준행: {analyzedSchema.dataStartRow || 2}행
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 bg-white border border-slate-200/80 rounded-xl">
                    {analyzedSchema.columns.map((c: any, i: number) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200"
                        title={c.purpose || c.name}
                      >
                        <span className="font-mono text-indigo-600 font-black">{c.letter || String.fromCharCode(65 + i)}</span>
                        <span>{c.name}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 고정 셀 또는 수식 보존 안내 (견적서/보고서 양식인 경우) */}
              {analyzedSchema.formCoordinates?.preservedFormulas && analyzedSchema.formCoordinates.preservedFormulas.length > 0 && (
                <div className="p-2 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 font-medium">
                  🔒 <strong>보존 대상 수식 감지:</strong>{" "}
                  {analyzedSchema.formCoordinates.preservedFormulas.map((f: any) => `${f.cell}(${f.formula})`).join(", ")} (덮어쓰지 않고 자동 보존됩니다)
                </div>
              )}

              {/* 핵심 실행 전략 */}
              {analyzedSchema.keyStrategies && analyzedSchema.keyStrategies.length > 0 && (
                <div className="space-y-1 pt-1">
                  <span className="font-bold text-slate-600 text-[11px] block">AI 실행 계획 요약:</span>
                  <ul className="space-y-1">
                    {analyzedSchema.keyStrategies.map((s: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-1.5 text-slate-700 font-medium text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* 대화형 조율 피드백 루프 (최대 5회) */}
            <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-indigo-950 text-[11px]">
                  <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                  <span>AI 계획 보완 및 사전 조율 대화</span>
                </div>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                  turnCount >= 5 ? "bg-rose-100 text-rose-700" : "bg-indigo-100 text-indigo-700"
                }`}>
                  잔여 조율 기회: {Math.max(0, 5 - turnCount)}/5회
                </span>
              </div>

              {/* 대화 히스토리 */}
              <div className="space-y-1.5 max-h-32 overflow-y-auto p-2 bg-white rounded-xl border border-indigo-100 text-[11px]">
                {feedbackHistory.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-2 rounded-lg leading-relaxed ${
                      msg.role === "user"
                        ? "bg-indigo-50 text-indigo-900 ml-6 font-bold"
                        : "bg-slate-50 text-slate-800 mr-6"
                    }`}
                  >
                    <span className="text-[10px] font-black text-slate-400 block mb-0.5">
                      {msg.role === "user" ? "🙋 내 요청" : "🤖 AI 아키텍트 브리핑"}
                    </span>
                    <span>{msg.message}</span>
                  </div>
                ))}
              </div>

              {/* 피드백 입력창 */}
              {turnCount < 5 ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendFeedback();
                      }
                    }}
                    placeholder="계획에 수정할 점이 있다면 입력하세요 (예: 5행 대신 6행부터 넣어줘, 품목별 단가 포함해줘)"
                    className="flex-1 px-3 py-1.5 bg-white border border-indigo-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    disabled={analyzing}
                  />
                  <button
                    type="button"
                    onClick={handleSendFeedback}
                    disabled={analyzing || !feedbackText.trim()}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"
                  >
                    {analyzing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>조율</span>
                  </button>
                </div>
              ) : (
                <p className="text-[10px] text-slate-400 text-center py-1">
                  ✓ 최대 5회 조율이 완료되었습니다. 계획을 확인하시고 아래 승인 버튼을 눌러주세요.
                </p>
              )}
            </div>

            {/* 관리자 1:1 맞춤 제작 문의 영역 */}
            {inquirySuccess ? (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <span className="font-extrabold text-emerald-900 block">
                    관리자 1:1 맞춤 제작 문의가 성공적으로 접수되었습니다!
                  </span>
                  <p className="text-emerald-800 text-[11px] leading-relaxed">
                    연결된 구글 시트 정보와 분석 내역이 엔지니어에게 안전하게 전달되었습니다. 스마트 알림(SMS/Email)을 통해 영업일 기준 24시간 내에 신속히 답변해 드립니다.
                  </p>
                </div>
              </div>
            ) : isInquiryOpen ? (
              <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-3 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-extrabold text-amber-950 text-xs">
                    <Wrench className="w-4 h-4 text-amber-600" />
                    <span>🛠️ 전문 엔지니어에게 1:1 맞춤 제작 의뢰</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsInquiryOpen(false)}
                    className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer font-bold"
                  >
                    ✕ 닫기
                  </button>
                </div>

                <div className="p-2.5 bg-white/90 border border-amber-200/80 rounded-xl space-y-1 text-[11px]">
                  <div className="text-slate-600 leading-snug">
                    <span className="font-bold text-slate-800">📌 자동 첨부 컨텍스트:</span> 스프레드시트 링크, 초기 요구사항, AI 시트 분석 스키마({analyzedSchema.columns?.length || 0}개 열), 최근 조율 내역이 문의서에 100% 자동 포함됩니다.
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 text-[11px] block">
                    엔지니어에게 전달할 추가 메모 또는 특수 요구사항 (선택)
                  </label>
                  <textarea
                    rows={3}
                    value={inquiryMemo}
                    onChange={(e) => setInquiryMemo(e.target.value)}
                    placeholder="예: AI가 인식하지 못한 특수한 사내 채번 규칙이 있거나, 특정 열에 수식을 넣어야 하는 경우 자유롭게 작성해 주세요."
                    className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 resize-none leading-relaxed"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsInquiryOpen(false)}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-amber-100/50 cursor-pointer"
                    disabled={submittingInquiry}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitInquiry}
                    disabled={submittingInquiry}
                    className="px-4 py-1.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {submittingInquiry ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>문의 접수 중...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>관리자에게 원클릭 문의 접수</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-2xl flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 font-bold text-amber-900 text-xs">
                    <HelpCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>AI로 원하는 기능이 잘 풀리지 않나요?</span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-snug">
                    현재 시트 구조와 대화 내역을 그대로 첨부하여 전문 엔지니어에게 1:1 맞춤 제작을 문의할 수 있습니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsInquiryOpen(true)}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shrink-0 transition-all shadow-xs cursor-pointer flex items-center gap-1"
                >
                  <Wrench className="w-3 h-3" />
                  <span>관리자 1:1 문의</span>
                </button>
              </div>
            )}

            {/* 2단계 액션 버튼 */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={loading || analyzing}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>처음으로 (0원 취소)</span>
              </button>

              <button
                type="button"
                onClick={handleFinalDeploy}
                disabled={loading || analyzing}
                className="px-6 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white transition-all shadow-md shadow-emerald-500/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>정밀 코드 생성 및 구글 시트 배포 중...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>🚀 확인 및 자동화 코드 생성 승인</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: 배포 완료 화면 */}
        {step === 3 && (
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-emerald-800 font-extrabold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Google 스프레드시트 바인딩 및 스크립트 배포 완료!</span>
              </div>
              <p className="text-emerald-950 font-medium leading-relaxed">
                구글 클라우드에 <code className="font-mono bg-white px-1.5 py-0.5 rounded text-emerald-700">Code.gs</code>와 <code className="font-mono bg-white px-1.5 py-0.5 rounded text-emerald-700">appsscript.json</code> 매니페스트가 성공적으로 푸시되었습니다.
              </p>
            </div>

            {generatedResult?.summary && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <span className="font-bold text-slate-400 text-[10px] block">구현 기능 요약</span>
                <p className="font-bold text-slate-800">{generatedResult.summary}</p>
              </div>
            )}

            {generatedResult?.features && generatedResult.features.length > 0 && (
              <div className="space-y-1.5">
                <span className="font-bold text-slate-400 text-[10px] block">주요 탑재 기능 목록</span>
                <ul className="space-y-1">
                  {generatedResult.features.map((feat: string, i: number) => (
                    <li key={i} className="flex items-center gap-2 text-slate-700 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 스크립트 코드 미리보기 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-400 text-[10px] flex items-center gap-1">
                  <Code className="w-3.5 h-3.5 text-slate-500" />
                  <span>생성된 Code.gs 소스코드 미리보기</span>
                </span>
                {generatedResult?.project?.scriptUrl && (
                  <a
                    href={generatedResult.project.scriptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-600 hover:underline text-[11px] font-bold"
                  >
                    Google 스크립트 에디터에서 보기 →
                  </a>
                )}
              </div>
              <pre className="p-3 bg-slate-900 text-emerald-300 font-mono text-[11px] rounded-2xl max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed border border-slate-800">
                {generatedResult?.scriptCode}
              </pre>
            </div>

            {/* 🌐 일반 대중 배포용 독립 웹페이지 URL 카드 */}
            {generatedResult?.project?.webappUrl && (
              <div className="p-3.5 bg-sky-50/90 border border-sky-200 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-sky-600 text-white flex items-center justify-center shadow-sm">
                      <Globe className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-extrabold text-sky-900 text-xs">🌐 일반 대중 배포용 독립 웹페이지 발급 완료!</span>
                  </div>
                  <span className="text-[10px] font-bold text-sky-700 bg-sky-100/80 px-2 py-0.5 rounded-full border border-sky-200/60">
                    Web App 실시간 연결됨
                  </span>
                </div>
                <p className="text-[11px] text-sky-800 font-medium leading-relaxed">
                  일반 대중이나 고객이 별도 구글 로그인 없이 스마트폰 및 PC에서 바로 접속해 폼을 제출할 수 있는 고유 배포 주소입니다. 제출된 데이터는 스프레드시트에 실시간 적재됩니다.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    readOnly
                    value={generatedResult.project.webappUrl}
                    className="flex-1 px-2.5 py-1.5 bg-white border border-sky-200 rounded-xl text-xs font-mono text-slate-800 select-all focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedResult.project.webappUrl);
                      setCopiedWebappUrl(true);
                      setTimeout(() => setCopiedWebappUrl(false), 2000);
                    }}
                    className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shrink-0 shadow-sm"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedWebappUrl ? "복사됨!" : "URL 복사"}</span>
                  </button>
                  <a
                    href={generatedResult.project.webappUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 bg-white border border-sky-300 hover:bg-sky-100 text-sky-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>새 탭 열기</span>
                  </a>
                </div>
              </div>
            )}

            {/* ⭐ AI 생성 결과 만족도 평가 카드 (AI 자가 학습 연동) */}
            <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                  <span className="font-extrabold text-slate-800 text-xs">AI 생성 결과 만족도 평가 (자가 학습 반영)</span>
                </div>
                <span className="text-[10px] font-bold text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded-full border border-amber-200/60">
                  Self-improving AI
                </span>
              </div>

              {inlineFeedbackSent ? (
                <div className="p-2.5 bg-white rounded-xl border border-emerald-200 text-center text-xs font-bold text-emerald-700 flex items-center justify-center gap-1.5 shadow-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>소중한 평가가 AI 자가 학습 시스템에 성공적으로 반영되었습니다!</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between bg-white p-2 rounded-xl border border-amber-100">
                    <span className="text-[11px] font-bold text-slate-600">완성된 코드와 기능에 만족하시나요?</span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setInlineRating(star)}
                          className="p-0.5 hover:scale-110 transition-transform cursor-pointer"
                        >
                          <Star
                            className={`w-4 h-4 ${
                              inlineRating >= star
                                ? "text-amber-400 fill-amber-400 drop-shadow-sm"
                            : "text-slate-200"
                            }`}
                          />
                        </button>
                      ))}
                      <span className="text-xs font-black text-amber-700 ml-1.5">{inlineRating}점</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={inlineComment}
                      onChange={(e) => setInlineComment(e.target.value)}
                      placeholder={
                        inlineRating >= 4
                          ? "칭찬이나 좋았던 점을 남겨주시면 AI가 모범 사례로 학습합니다."
                          : "아쉬웠던 부분이나 개선사항을 남겨주시면 AI가 보완 지침으로 학습합니다."
                      }
                      className="flex-1 px-2.5 py-1.5 bg-white border border-amber-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    <button
                      type="button"
                      disabled={inlineSubmitting}
                      onClick={async () => {
                        const targetProjId = generatedResult?.project?.id || "temp_proj";
                        setInlineSubmitting(true);
                        try {
                          await apiFetch("/api/feedback", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              projectId: targetProjId,
                              projectName: projectName || "신규 프로젝트",
                              rating: inlineRating,
                              comment: inlineComment,
                              scriptCodeSnapshot: generatedResult?.scriptCode,
                            }),
                          });
                          setInlineFeedbackSent(true);
                        } catch {
                        } finally {
                          setInlineSubmitting(false);
                        }
                      }}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer disabled:opacity-50 shadow-sm"
                    >
                      {inlineSubmitting ? "반영 중..." : "AI 학습 반영"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
              <button
                onClick={handleComplete}
                className="px-6 py-2.5 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
              >
                워크스페이스로 돌아가기
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 추천 프롬프트 갤러리 모달 */}
      <PromptGalleryModal
        isOpen={showPromptGallery}
        onClose={() => setShowPromptGallery(false)}
        onSelectPrompt={(tpl) => {
          setPrompt(tpl.prompt_text);
          if (!projectName) {
            setProjectName(tpl.title);
          }
          setShowPromptGallery(false);
        }}
      />
    </div>
  );
}
