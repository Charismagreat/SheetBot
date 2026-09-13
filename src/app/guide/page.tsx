"use client";

import React, { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import {
  BookOpen,
  Sparkles,
  Play,
  FileSpreadsheet,
  Clock,
  Zap,
  ArrowRight,
  ShieldCheck,
  Code,
  FileCode,
  CheckCircle2,
  HelpCircle,
  Copy,
  ChevronRight,
  Smartphone,
  Bot,
  MessageSquare,
  Move,
  Coins,
  QrCode,
  Send,
  Layers,
  UploadCloud,
  FileUp,
  RefreshCw,
  FolderPlus,
  KeyRound,
  Terminal,
  Database,
  Search,
} from "lucide-react";

export default function GuidePage() {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 5단계 핵심 시작 가이드
  const steps = [
    {
      step: "01",
      title: "구글 계정 최소 권한 로그인 & 3대 프로젝트 시작 모드 선택",
      desc: "보안을 위해 초기 가입/로그인 시에는 최소 권한(이메일·기본 프로필)만 요청하므로 안심하고 로그인할 수 있습니다. 20,000 웰컴 토큰과 개인 에이전트 API 키가 자동 발급되며, [새 프로젝트 추가]에서 스프레드시트/드라이브 권한을 필요 시점에만 점진적으로 안전하게 부여할 수 있습니다. ① '✨ 새 시트 자동 생성', ② '📁 엑셀 파일 업로드 변환', ③ '🔗 기존 시트 URL' 중 원하는 방식을 자유롭게 선택하세요.",
      tip: "초기 가입 시 불필요한 드라이브 전체 권한을 요구하지 않는 구글 최소 권한 원칙(Least Privilege)을 준수합니다.",
      badge: "최소 권한 가입",
    },
    {
      step: "02",
      title: "AI 시트 정밀 분석 & 대화형 실행 계획 조율 (HITL)",
      desc: "시트 URL 또는 업로드된 엑셀 데이터를 바탕으로 AI 아키텍트가 시트 구조(헤더 열, 데이터 샘플, 양식 유형)와 실행 계획을 브리핑합니다. 최대 5회까지 AI와 한국어로 편하게 대화하며 컬럼 매핑과 로직을 사전 조율할 수 있습니다.",
      tip: "예: 'D열 품번은 없으면 빈칸으로 두고 E열 품명만 필수로 넣어줘' 등 편하게 피드백하세요.",
      badge: "대화형 조율",
    },
    {
      step: "03",
      title: "기존 코드 안전 보존(Merge) & Apps Script 자동 배포",
      desc: "시트에 이미 작성된 코드가 있어도 걱정 마세요! AI가 기존 스크립트를 자동 감지하여 '🛡️ 안전 보존 병합(Merge)' 모드로 기존 함수와 메뉴를 100% 보존하면서 새 기능만 안전하게 주입합니다. 구글 클라우드에 원클릭으로 안전 배포됩니다.",
      tip: "구글 시트 에디터에서 직접 수정한 최신 코드는 대시보드의 [코드 동기화] 버튼으로 1초 만에 가져올 수 있습니다.",
      badge: "안전 보존 배포",
    },
    {
      step: "04",
      title: "구글 시트 '🚀 SheetBot 메뉴' & 시트 내장 AI 코파일럿·원스톱 문자 발송",
      desc: "구글 시트를 열면 상단에 '🚀 SheetBot 메뉴'가 자동 생성됩니다. [📱 [발송] 선택 행 문자 일괄 발송](발송 전 실시간 장치 점검 & 원스톱 승인), [⚡ 터널 연결 상태 점검], [📤 SQLite 3종 동기화] 외에도, [🤖 SheetBot AI 코파일럿] 사이드바를 열어 자연어 요청이나 직접 짠 코드를 시트 안에서 즉시 주입·배포할 수 있으며, 최하단 [📖 SheetBot 사용법 및 활용사례]를 누르면 언제든 공식 가이드가 열립니다.",
      tip: "문자 발송 시 헛발송 방지를 위해 발송 직전 회원 스마트폰 연결 상태를 실시간 점검하고, [점검 완료 및 발송 확인] 알림창을 통해 안전하게 승인 후 발송됩니다.",
      badge: "시트 메뉴 & AI 코파일럿",
    },
    {
      step: "05",
      title: "스마트 알림(내 폰 문자 0원) & 클라우드 터널 실시간 관제",
      desc: "시트봇 대시보드의 [스마트 알림 센터]에서 본인의 안드로이드 스마트폰(구글 메시지)을 1회 QR 연동해 두면, 추가 통신 비용 0원(무료)으로 시트의 고객들에게 실제 문자를 자동 또는 선택 일괄 발송할 수 있습니다. 상용 통신사 API Key 폴백도 함께 지원되며, [⚡ 터널 연결 상태 점검]으로 통신 상태를 상시 진단할 수 있습니다.",
      tip: "내 워크스페이스 [당월 AI 사용량] 요약 카드에서 모든 AI 호출 목적과 토큰 소비 내역을 실시간 감사 로그로 확인할 수 있습니다.",
      badge: "스마트 운영",
    },
  ];

  // 실전 프롬프트 레시피 10종
  const examples = [
    {
      id: "ex_sms_batch_dispatch",
      title: "A열 체크박스 선택 행 스마트폰(구글 메시지) 문자 일괄 발송 & 사전 장치 점검",
      tag: "스마트폰 문자 일괄 발송 (NEW)",
      icon: Smartphone,
      color: "border-emerald-200 bg-emerald-50/60 text-emerald-800",
      prompt: "구글 시트 상단 [🚀 SheetBot 메뉴] ➔ [📱 [발송] 선택 행 문자 일괄 발송]을 누르면 A열 체크박스가 선택된 대상자들에게 실제 문자를 일괄 발송해줘. 발송 직전에 내 스마트폰(구글 메시지) 장치 연결 상태를 실시간 점검하여 '점검 완료 및 발송 확인' 알림창을 띄우고, 승인 시 통신비 0원으로 실제 문자를 전송한 뒤 결과메시지 열에 '스마트폰(기기명) 실제 전송 완료'로 기록해줘.",
    },
    {
      id: "ex_copilot_self_update",
      title: "시트 내장 'SheetBot AI 코파일럿' 사이드바를 통한 자가 기능 확장 및 코드 직접 주입",
      tag: "시트 내장 AI 코파일럿 (NEW)",
      icon: Bot,
      color: "border-purple-200 bg-purple-50/60 text-purple-800",
      prompt: "구글 시트 상단 [🚀 SheetBot 메뉴] ➔ [🤖 SheetBot AI 코파일럿] 사이드바를 열고 아래처럼 자연어 요청이나 직접 짠 함수 코드를 입력창에 넣은 후 [⚡ AI 코드 생성 및 시트에 즉시 주입]을 누르세요:\n\n// 자연어 요청 예시:\n'주문금액 50만원 이상인 행은 배경을 연한 노란색으로 강조하는 함수 추가해줘'\n\n// 직접 작성한 함수 코드 예시:\nfunction highlightVipRows() {\n  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();\n  // 직접 짠 로직을 그대로 붙여넣어도 AI가 기존 코드 손실 없이 안전하게 융합 배포합니다.\n}",
    },
    {
      id: "ex_excel",
      title: "엑셀 파일(.xlsx) 업로드 기반 자재 재고관리 시스템 자동 변환",
      tag: "엑셀 업로드 자동 변환",
      icon: UploadCloud,
      color: "border-indigo-200 bg-indigo-50/60 text-indigo-800",
      prompt: "업로드된 엑셀 파일의 품목코드, 품목명, 규격, 현재고, 단가 컬럼 구조를 기반으로 구글 시트 자동화 시스템을 구축해줘. 입출고가 발생할 때마다 현재고를 자동 갱신하고, 재고가 10개 미만으로 떨어지면 행을 주황색으로 하이라이트해줘.",
    },
    {
      id: "ex_new_sheet",
      title: "새 구글 시트 자동 설계 기반 고객 상담 및 견적 요청 접수 대장",
      tag: "새 시트 자동 설계",
      icon: FolderPlus,
      color: "border-emerald-200 bg-emerald-50/60 text-emerald-800",
      prompt: "구글 시트가 아직 없어. 고객 성함, 연락처, 상담분야, 희망일정, 문의내용, 접수일시를 기록하는 최적의 상담 접수 대장 시트 양식을 설계하고, 신규 접수 시 담당자에게 즉시 알림을 주는 자동화 시스템을 만들어줘.",
    },
    {
      id: "ex0",
      title: "발주서/명세서 PDF·이미지 업로드 및 다중 품목 대장 자동 등록",
      tag: "문서 AI OCR 자동화",
      icon: Sparkles,
      color: "border-blue-200 bg-blue-50/60 text-blue-800",
      prompt: "사이드바 메뉴에서 PDF나 이미지 발주서를 업로드하면 자동으로 AI OCR 정밀 분석하여 '발주서 접수대장' 시트에 기록해줘. 1장의 발주서에 여러 품목이 있을 때는 품목별로 1행씩 분리해서 최상단(2행~)에 최근 순으로 삽입해줘.",
    },
    {
      id: "ex1",
      title: "일일 마감 데이터 특정 시트로 누적 복사",
      tag: "정기 스케줄링",
      icon: Clock,
      color: "border-indigo-200 bg-indigo-50/60 text-indigo-700",
      prompt: "매일 밤 11시 50분에 '오늘매출' 탭의 A열부터 F열까지의 데이터를 복사해서 '연간누적' 탭의 마지막 빈 행 아래에 붙여넣고, 오늘매출 탭의 입력칸은 초기화해줘.",
    },
    {
      id: "ex2",
      title: "결제완료 시 고객 휴대폰 감사 문자 자동 발송",
      tag: "구글 메시지 스마트 알림 (SMS)",
      icon: Smartphone,
      color: "border-emerald-200 bg-emerald-50/60 text-emerald-800",
      prompt: "주문관리 시트의 D열(상태)이 '결제완료'로 수정되면, 해당 행의 고객명과 연락처를 읽어서 내 폰(구글메시지)으로 고객에게 '[SheetBot] {{고객명}}님, 결제가 정상 완료되었습니다.' 문자를 자동 발송해줘.",
    },
    {
      id: "ex3",
      title: "품절 임박 재고 감지 시 담당자 긴급 문자 알림",
      tag: "조건 감지 & 본인 알림",
      icon: Zap,
      color: "border-amber-200 bg-amber-50/60 text-amber-800",
      prompt: "재고관리 시트에서 D열(현재고)의 숫자가 5 이하로 떨어지면 해당 행을 빨간색으로 하이라이트하고, 내 휴대폰 번호(010-1234-5678)로 '{{품목명}} 재고 부족 긴급 발주 필요' 문자를 즉시 전송해줘.",
    },
    {
      id: "ex4",
      title: "상담 예약 신청 접수 시 슬랙 & 이메일 웹훅 통보",
      tag: "이벤트 트리거 (onEdit)",
      icon: MessageSquare,
      color: "border-purple-200 bg-purple-50/60 text-purple-700",
      prompt: "신규예약 시트에 새로운 행이 추가되면, 고객명, 예약시간, 상담내용을 포맷팅하여 담당자 이메일(help@company.com)로 보내고 슬랙 웹훅으로 실시간 알림을 쏴줘.",
    },
    {
      id: "ex5",
      title: "두 시트 간 VLOOKUP 매칭 및 차액 자동 계산 수식",
      tag: "구글 시트 고급 수식",
      icon: FileSpreadsheet,
      color: "border-teal-200 bg-teal-50/60 text-teal-700",
      prompt: "A시트의 주문번호를 기준으로 B시트의 결제금액을 VLOOKUP으로 가져와 C열에 넣고, 미납금이 있는 행만 골라내는 ARRAYFORMULA 수식 구조를 작성해줘.",
    },
    {
      id: "ex_api_key_agent",
      title: "안티그라비티 전용 API 키 기반 원스톱 프로젝트 자동 생성 & 배포",
      tag: "개인 API 키 원스톱 (추천)",
      icon: KeyRound,
      color: "border-violet-200 bg-violet-50/60 text-violet-800",
      prompt: "내 시트봇 API 키는 sk_sheetbot_xxxxxxxxxxxx야.\n이 구글 시트 주소(https://docs.google.com/spreadsheets/d/.../edit)로 프로젝트를 만들고, 10행 헤더 기준으로 매일 밤 11시 50분에 일일 매출을 연간누적 탭에 복사하는 자동화 스크립트를 배포해줘.",
    },
    {
      id: "ex_agent_bridge",
      title: "안티그라비티(Antigravity) 브릿지 연동 및 대화형 코드 주입",
      tag: "AI 에이전트 브릿지",
      icon: Bot,
      color: "border-purple-200 bg-purple-50/60 text-purple-800",
      prompt: "아래 웹 주소를 통해 내 구글 시트의 헤더 구조와 기존 코드를 확인하고, 필요한 기능 코드를 주입해줘:\n웹 주소: https://.../api/agent/gas-bridge?token=sec_xxxx\n요구사항: 사이드바에서 발주서 PDF를 올리면 10행 헤더 양식에 맞게 품목별로 1행씩 분리해서 자동으로 채워 넣어줘.",
    },
    {
      id: "ex_estimate_form",
      title: "고정 셀·품목란·합계 수식이 결합된 견적서/발주서 양식 자동 완성",
      tag: "견적서/보고서 양식 완성",
      icon: FileCode,
      color: "border-emerald-200 bg-emerald-50/60 text-emerald-800",
      prompt: "이 견적서 시트의 C4(견적일자), B6(고객사명) 고정 좌표와 14행부터 시작하는 품목란에 입력값을 채워 넣어줘. 하단 G24의 =SUM(G14:G23) 합계 수식은 절대 덮어쓰지 말고 그대로 보존해서 자동 계산되게 해줘.",
    },
    {
      id: "ex_sqlite_sync",
      title: "내 컴퓨터 로컬 SQLite DB 파일 데이터 추출 및 구글 시트 대장 완성",
      tag: "로컬 SQLite DB 연동",
      icon: Code,
      color: "border-blue-200 bg-blue-50/60 text-blue-800",
      prompt: "내 컴퓨터 C:\\data\\erp.sqlite 파일의 orders 테이블에서 '삼전상사'의 이번 달 발주 품목만 SQL로 추출해서, 구글 시트 견적서 양식의 14행부터 차례대로 기입해줘.",
    },
    {
      id: "ex_sqlite_crud_all",
      title: "구글 드라이브 SQLite 양방향 동기화 및 시트/사이드바 수정·삭제(CRUD) 올인원",
      tag: "Google Drive SQLite CRUD (NEW)",
      icon: Database,
      color: "border-emerald-200 bg-emerald-50/60 text-emerald-800",
      prompt: "구글 시트의 주문 데이터를 구글 드라이브 'SheetBot_Databases' 폴더의 SQLite DB 파일로 전송하고, 사이드바에서 조건 및 AI 자연어로 조회하며, 시트 셀에서 직접 편집한 내용이나 사이드바 단건 폼에서 수정·삭제한 내역이 SQLite DB 및 드라이브 파일에 양방향으로 동기화(CRUD)되도록 구현해줘.",
    },
    {
      id: "ex_sqlite_ai_text2sql",
      title: "Gemini AI Text-to-SQL 자연어 주문 조회 및 즐겨찾기 보관함",
      tag: "AI 자연어 Text-to-SQL",
      icon: Search,
      color: "border-indigo-200 bg-indigo-50/60 text-indigo-800",
      prompt: "사이드바의 AI 검색 탭에서 '주문금액 상위 5건', '수량 100개 이상'처럼 자연어로 질문하면 Gemini AI가 SELECT SQL로 즉시 변환하여 시트에 자동 서식과 함께 추출하고, 최근 성공한 질문을 보관함과 즐겨찾기(⭐)로 관리할 수 있도록 해줘.",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-100/60 to-white text-slate-800 pb-20 text-left">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-14">
        {/* 상단 타이틀 배너 */}
        <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 rounded-3xl p-8 sm:p-12 text-white shadow-xl relative overflow-hidden">
          <div className="absolute right-0 bottom-0 translate-x-10 translate-y-10 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-emerald-300 text-xs font-bold border border-white/10">
              <BookOpen className="w-3.5 h-3.5" />
              <span>사용 가이드 &amp; 업무 자동화 마스터 레시피</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight">
              SheetBot 완벽 가이드:<br />
              구글 시트 자동화부터 통신비 0원 문자 발송까지
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
              복잡한 코딩이나 통신사 유료 API 계약 없이도 충분합니다.
              Google Apps Script(GAS) 자동 생성, 정기 스케줄 실행, 내 폰을 통한 무료 문자 자동 발송, 
              그리고 이전 대화를 기억하는 시트봇 AI까지 누구나 3분 만에 시작할 수 있는 실전 가이드를 확인하세요.
            </p>
            <div className="pt-3 flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs rounded-xl flex items-center gap-2 transition-all shadow-md active:scale-95"
              >
                <span>내 워크스페이스 시작하기</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/dashboard/notifications"
                className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl border border-white/10 transition-all flex items-center gap-1.5"
              >
                <Smartphone className="w-4 h-4 text-emerald-300" />
                <span>스마트폰 연동 &amp; 무료 문자 설정</span>
              </Link>
            </div>
          </div>
        </div>

        {/* 5단계 시작 가이드 */}
        <section className="space-y-6">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-xs font-extrabold text-emerald-600 uppercase tracking-wider">Step-by-Step Roadmap</span>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              누구나 3분 만에 마스터하는 5단계 자동화 여정
            </h2>
            <p className="text-xs text-slate-500">
              구글 계정 로그인부터 스마트폰 연동, AI 비서 협업까지 직관적인 단계로 구성되어 있습니다.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {steps.map((s, idx) => (
              <div
                key={idx}
                className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-3 relative"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 font-black text-xs flex items-center justify-center border border-emerald-200/60">
                      {s.step}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-extrabold">
                      {s.badge}
                    </span>
                  </div>
                  <h3 className="text-xs font-extrabold text-slate-900 leading-snug">{s.title}</h3>
                  <p className="text-[11px] text-slate-500 leading-relaxed">{s.desc}</p>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-[10.5px] text-slate-600">
                  <strong className="text-slate-800">💡 팁:</strong> {s.tip}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 스마트 알림(SMS) 심층 가이드 섹션 */}
        <section className="bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 rounded-3xl p-6 sm:p-10 border border-emerald-200/80 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-600 text-white rounded-full text-xs font-black">
                <Smartphone className="w-3.5 h-3.5" />
                <span>신규 기능: 통신 비용 0원 문자 자동화</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                내 안드로이드 폰을 Google 메시지로 연동하는 방법
              </h2>
              <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
                시중의 알림톡/문자 대행 서비스(건당 15~40원) 대신, 내가 사용하는 안드로이드 스마트폰(요금제 기본 제공 무제한 문자)을 
                게이트웨이로 연동하여 구글 시트 이벤트 발생 시 무료로 문자를 자동 발송할 수 있습니다.
              </p>
            </div>

            <Link
              href="/dashboard/notifications"
              className="px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold rounded-xl shadow-md transition-all flex items-center gap-1.5 shrink-0 self-start md:self-auto"
            >
              <span>스마트 알림 센터 바로가기</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-2xs space-y-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                1
              </div>
              <h4 className="font-extrabold text-xs text-slate-900">10초 QR코드 스캔 페어링</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                스마트폰의 <strong>구글 메시지 앱 ➔ 우측 상단 프로필 ➔ [기기 페어링]</strong>을 누르고, 화면의 QR코드를 스캔하면 즉시 연동됩니다.
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-indigo-100 shadow-2xs space-y-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                2
              </div>
              <h4 className="font-extrabold text-xs text-slate-900">자연어 규칙 한 줄 입력</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                "입금완료로 바뀌면 고객 연락처로 안내 문자 발송"이라고 입력하면, AI가 발송 조건과 메시지 템플릿을 자동으로 구조화해 등록합니다.
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-teal-100 shadow-2xs space-y-2">
              <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-xs">
                3
              </div>
              <h4 className="font-extrabold text-xs text-slate-900">스프레드시트 실시간 발송</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                시트에서 행 데이터가 수정되거나 추가되면 AI가 조건을 판별하여 내 스마트폰을 통해 고객 또는 나에게 문자를 실시간 발송합니다.
              </p>
            </div>
          </div>
        </section>

        {/* 신규 기능: AI 에이전트 원격 브릿지 & 견적서·보고서 양식 완성 가이드 */}
        <section className="bg-gradient-to-r from-violet-50 via-slate-50 to-indigo-50 rounded-3xl p-6 sm:p-10 border border-violet-200/80 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-violet-700 text-white rounded-full text-xs font-black">
                <Bot className="w-3.5 h-3.5" />
                <span>핵심 업그레이드: 개인 API 키 기반 원스톱 자동화 &amp; 안티그라비티 연동</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                안티그라비티(Antigravity)와 시트봇의 100% 완전 자동화 연동
              </h2>
              <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
                시트봇 대시보드에 일일이 들어와 프로젝트를 만들지 않아도 됩니다. 
                로그인 즉시 자동 발급된 <strong>내 개인 API 키(sk_sheetbot_...)</strong>와 구글 시트 주소만 안티그라비티에 던지면, 
                프로젝트 생성부터 10행 헤더/데이터 분석, Apps Script 코드 작성, 구글 클라우드 원클릭 배포까지 단 한 번의 대화로 완성됩니다.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start md:self-auto">
              <Link
                href="/dashboard"
                className="px-5 py-3 bg-violet-900 hover:bg-violet-800 text-white text-xs font-extrabold rounded-xl shadow-md transition-all flex items-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5 text-violet-300" />
                <span>대시보드에서 내 API 키 확인</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* 2가지 연동 방식 비교 배너 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div className="p-4 rounded-2xl bg-white/90 border border-violet-200 shadow-2xs space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-violet-100 text-violet-800 font-extrabold text-[10px]">
                  방식 A (강력 추천!)
                </span>
                <h4 className="font-extrabold text-xs text-slate-900">개인 API 키 원스톱 자동 생성 &amp; 배포</h4>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                대시보드 상단 <strong>[🔑 에이전트 API 키]</strong>를 복사한 후, 안티그라비티에게 "내 API 키는 sk_...이고, 이 시트 주소로 프로젝트 만들어서 배포해줘"라고만 하세요. 프로젝트 생성부터 배포까지 알아서 끝냅니다.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white/90 border border-slate-200 shadow-2xs space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-extrabold text-[10px]">
                  방식 B
                </span>
                <h4 className="font-extrabold text-xs text-slate-900">프로젝트별 브릿지 URL 복사 &amp; 주입</h4>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                이미 생성된 프로젝트가 있다면 카드 우측의 <strong>[🤖 AI 연동 주소 복사]</strong>를 눌러 고유 브릿지 웹 주소(gas-bridge?token=...)를 AI 채팅창에 전달하여 대화형으로 코드를 수정하고 주입할 수 있습니다.
              </p>
            </div>
          </div>

          {/* 4단계 프로세스 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
            <div className="bg-white p-5 rounded-2xl border border-violet-100 shadow-2xs space-y-2">
              <div className="w-8 h-8 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center font-bold text-xs">
                1
              </div>
              <h4 className="font-extrabold text-xs text-slate-900">개인 API 키 자동 확인</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                시트봇 회원가입 즉시 20,000 웰컴 토큰과 함께 고유 개인 API 키(sk_sheetbot_...)가 자동 발급됩니다. 워크스페이스 상단에서 클릭 한 번으로 복사할 수 있습니다.
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-indigo-100 shadow-2xs space-y-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                2
              </div>
              <h4 className="font-extrabold text-xs text-slate-900">안티그라비티 원격 프로젝트 생성</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                안티그라비티에게 키와 시트 주소만 주면 AI가 시트봇 API를 호출하여 시트 구조(탭, 10행 헤더, 샘플 데이터)를 자동 분석하고 프로젝트를 원격 등록합니다.
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-2xs space-y-2">
              <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                3
              </div>
              <h4 className="font-extrabold text-xs text-slate-900">10행 헤더 &amp; SQLite DB 연동</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                견적서 고정 셀/하단 =SUM 수식 보존은 물론, "내 PC의 SQLite DB에서 발주 내역 뽑아서 시트에 채워줘"와 같은 복합 자동화 로직도 Apps Script로 완성합니다.
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-2xs space-y-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                4
              </div>
              <h4 className="font-extrabold text-xs text-slate-900">구글 클라우드 원클릭 배포</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                안티그라비티가 완성된 코드를 브릿지 URL로 전송하면 구글 스프레드시트에 즉시 자동 배포되며, 상단 메뉴 등록 및 주기적 정기 스케줄까지 자율 가동됩니다.
              </p>
            </div>
          </div>
        </section>

        {/* 신규 기능: Google Drive SQLite 양방향 연동 & 시트/사이드바 수정·삭제(CRUD) & AI 자연어 검색 가이드 */}
        <section className="bg-gradient-to-r from-emerald-50 via-teal-50 to-slate-50 rounded-3xl p-6 sm:p-10 border border-emerald-200/80 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-700 text-white rounded-full text-xs font-black">
                <Database className="w-3.5 h-3.5" />
                <span>엔터프라이즈 신기능: Google Drive SQLite 양방향 동기화 &amp; 풀 CRUD</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                구글 드라이브 SQLite 연동: 데이터 전송·조회·수정·삭제(CRUD)
              </h2>
              <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
                스프레드시트의 방대한 데이터를 구글 드라이브의 SQLite DB 파일(<strong>SheetBot_Databases/파일명.sqlite</strong>)로 안전하게 아카이빙하고,
                정밀 조건 검색과 <strong>Gemini AI 자연어(Text-to-SQL)</strong>를 통해 원하는 데이터만 시트에 즉시 추출합니다.
                추출된 데이터는 시트에서 직접 수정하거나 사이드바 폼을 통해 SQLite DB와 양방향으로 실시간 동기화할 수 있습니다.
              </p>
            </div>
          </div>

          {/* 3대 핵심 메뉴 및 CRUD 아키텍처 안내 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            <div className="p-5 rounded-2xl bg-white border border-emerald-100 shadow-2xs space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-extrabold text-[10px]">
                  메뉴 [1] 데이터 전송
                </span>
              </div>
              <h4 className="font-extrabold text-xs text-slate-900">구글 드라이브 SQLite 자동 동기화</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                시트에서 미전송 상태인 주문/거래 내역을 원클릭으로 구글 드라이브 지정 폴더의 SQLite DB 파일로 안전하게 전송합니다. 전송된 행은 초록색 완료 라벨이 마킹되어 중복 전송이 방지됩니다.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-indigo-100 shadow-2xs space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 font-extrabold text-[10px]">
                  메뉴 [2] 데이터 조회
                </span>
              </div>
              <h4 className="font-extrabold text-xs text-slate-900">조건 필터 &amp; AI 자연어 (Text-to-SQL)</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                기간, 상호, 금액 등 상세 조건 검색뿐만 아니라, "지난달 주문금액 상위 5건"처럼 일상어로 질문하면 AI가 SQL로 즉시 변환하여 시트에 자동 서식과 합계 행을 구성해 추출합니다.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-teal-100 shadow-2xs space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-teal-100 text-teal-800 font-extrabold text-[10px]">
                  메뉴 [3] 수정·삭제 (CRUD)
                </span>
              </div>
              <h4 className="font-extrabold text-xs text-slate-900">시트 직접 편집 &amp; 사이드바 폼 제어</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                'SQLite_조회결과' 탭에서 수량/금액을 바꾸거나 상태를 '삭제'로 변경한 뒤 메뉴 [3]을 누르면 DB에 일괄 반영됩니다. 사이드바 [행 수정/삭제] 탭에서 개별 건을 불러와 정밀 수정·삭제도 가능합니다.
              </p>
            </div>
          </div>

          {/* 2중 안전장치 배너 */}
          <div className="bg-white/80 border border-emerald-200/80 rounded-2xl p-4 flex items-center justify-between text-xs text-slate-700">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span><strong>A열 SQLite ID 완벽 보호:</strong> 시트 날짜 서식 오염을 방지하는 정수 서식 강제 및 날짜 오인식 역산 2중 방어 코드가 적용되어 대량 데이터도 안전하게 동기화됩니다.</span>
            </div>
          </div>
        </section>

        {/* 실전 업무 자동화 프롬프트 템플릿 6종 */}
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <span className="text-xs font-extrabold text-indigo-600 uppercase tracking-wider">Best Recipes</span>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                복사해서 바로 쓰는 실전 자동화 프롬프트 레시피
              </h2>
            </div>
            <span className="text-xs text-slate-400">클릭 시 프롬프트 문구가 클립보드에 바로 복사됩니다.</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {examples.map((ex) => {
              const IconComp = ex.icon;
              return (
                <div
                  key={ex.id}
                  className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4 flex flex-col justify-between hover:shadow-md transition-all"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-md border flex items-center gap-1 ${ex.color}`}>
                        <IconComp className="w-3 h-3" />
                        <span>{ex.tag}</span>
                      </span>
                      <Sparkles className="w-4 h-4 text-amber-500" />
                    </div>
                    <h3 className="font-extrabold text-sm text-slate-900 leading-snug">{ex.title}</h3>
                    <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 font-mono text-[11px] text-slate-700 leading-relaxed select-all">
                      "{ex.prompt}"
                    </div>
                  </div>

                  <button
                    onClick={() => handleCopy(ex.prompt, ex.id)}
                    className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                  >
                    {copiedId === ex.id ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700 font-extrabold">복사 완료! 생성기/규칙창에 붙여넣으세요</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-500" />
                        <span>프롬프트 복사하기</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* 시트봇 AI 비서 100% 활용 팁 섹션 */}
        <section className="bg-slate-900 text-white rounded-3xl p-8 sm:p-10 shadow-xl space-y-6 relative overflow-hidden">
          <div className="absolute -right-10 -bottom-10 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 text-amber-300 rounded-full text-xs font-bold border border-white/10">
              <Bot className="w-3.5 h-3.5" />
              <span>우측 하단 플로팅 비서</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight">
              시트봇 AI (SheetBot AI) 100% 활용 꿀팁
            </h2>
            <p className="text-slate-300 text-xs sm:text-sm max-w-2xl leading-relaxed">
              화면 우측 하단의 시트봇 AI는 단순한 챗봇이 아닙니다. 내 구글 시트 작업을 옆에서 지켜보며 코드를 작성해 주는 1:1 페어 프로그래머입니다.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative z-10 pt-2 text-xs">
            <div className="bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/10 space-y-2">
              <div className="flex items-center gap-2 text-amber-300 font-bold">
                <Move className="w-4 h-4" />
                <span>마우스 드래그 &amp; 8방향 크기 조절</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                상단 바를 잡고 원하는 위치로 이동하거나 테두리를 당겨 자유롭게 창 크기를 조절할 수 있으며, 설정한 위치와 크기는 브라우저에 자동 기억됩니다.
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/10 space-y-2">
              <div className="flex items-center gap-2 text-emerald-300 font-bold">
                <ShieldCheck className="w-4 h-4" />
                <span>회원별 대화 내용 클라우드 영구 기억</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                로그인된 계정으로 과거 나눈 대화가 안전하게 영구 저장되어, 페이지를 새로고침(F5)하거나 다른 PC에서 접속해도 대화 맥락이 그대로 복원됩니다.
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/10 space-y-2">
              <div className="flex items-center gap-2 text-indigo-300 font-bold">
                <Coins className="w-4 h-4" />
                <span>관리자(ADMIN) 전액 면제 &amp; 토큰 충전</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                관리자 계정은 대화 토큰이 무제한 무료로 제공되며, 일반 회원은 내 워크스페이스 요약 카드의 [토큰 충전] 버튼에서 1회성 선불형으로 부담 없이 이용할 수 있습니다.
              </p>
            </div>
          </div>
        </section>

        {/* 추가 가이드 및 문의 배너 */}
        <div className="p-8 rounded-3xl bg-gradient-to-r from-amber-50 to-indigo-50 border border-amber-200/60 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center sm:text-left">
            <h3 className="text-base font-black text-slate-900">더 궁금한 점이 있으신가요?</h3>
            <p className="text-xs text-slate-600">
              우측 하단 <strong>시트봇 AI</strong>에게 실시간으로 질문하시거나, 1:1 고객 문의 게시판을 통해 언제든 운영팀의 지원을 받으세요!
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/faq"
              className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-all shadow-2xs shrink-0"
            >
              FAQ 둘러보기
            </Link>
            <Link
              href="/contact"
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs shrink-0"
            >
              1:1 운영팀 문의하기
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
