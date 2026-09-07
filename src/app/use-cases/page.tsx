"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Sparkles,
  Search,
  Copy,
  CheckCircle2,
  ArrowRight,
  Smartphone,
  Clock,
  Zap,
  Bot,
  MessageSquare,
  FileSpreadsheet,
  Building2,
  ShoppingBag,
  GraduationCap,
  Briefcase,
  Users,
  Home,
  Activity,
  Truck,
  Dumbbell,
  Server,
  RotateCcw,
} from "lucide-react";
import Navbar from "@/components/Navbar";

interface UseCase {
  id: string;
  category: string;
  categoryIcon: any;
  title: string;
  target: string;
  triggerType: "schedule" | "onEdit" | "onFormSubmit" | "menu" | "bridge";
  triggerLabel: string;
  painPoint: string;
  solution: string;
  smsPreview?: {
    sender: string;
    message: string;
  };
  prompt: string;
  badgeColor: string;
}

const USE_CASES: UseCase[] = [
  {
    id: "uc-1",
    category: "쇼핑몰·유통",
    categoryIcon: ShoppingBag,
    title: "매일 아침 재고 부족 자동 감지 & 긴급 발주 알림",
    target: "온라인 쇼핑몰, 창고 관리자, 도소매 유통업체",
    triggerType: "schedule",
    triggerLabel: "매일 오전 09:00 정기 스케줄",
    painPoint: "바쁜 아침마다 재고 장부를 일일이 확인하지 못해 인기 품목이 품절되어 매출 기회를 놓침.",
    solution: "시트의 [현재고]가 [안전재고] 미만인 품목을 9시에 자동 취합하여 담당자에게 0원 문자로 즉시 전송.",
    smsPreview: {
      sender: "재고관리 봇",
      message: "📢 [긴급 발주 필요]\n현재 'A4 복사용지' 외 2건이 안전재고 미만입니다.\n- A4 복사용지 (현재고: 3박스 / 안전재고: 10박스)\n- 무소음 마우스 (현재고: 1개 / 안전재고: 5개)\n발주 확인을 부탁드립니다.",
    },
    prompt:
      "매일 오전 9시에 '재고현황' 탭에서 [현재고] 열의 수량이 [안전재고] 열보다 작은 행들을 모두 검색해줘. 부족한 품목명과 수량을 보기 좋게 정리해서 담당자 휴대폰 번호(010-XXXX-XXXX)로 구글 메시지 0원 문자를 자동 발송하고, 시트 상단에 [최근알림일시]를 기록해줘.",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
  },
  {
    id: "uc-2",
    category: "학원·교육",
    categoryIcon: GraduationCap,
    title: "등원·하원 출결 상태 변경 즉시 학부모 안심 귀가 문자",
    target: "학원, 공부방, 예체능 교습소, 키즈 카페",
    triggerType: "onEdit",
    triggerLabel: "onEdit (출결 셀 변경 감지)",
    painPoint: "학생들이 올 때마다 카카오톡이나 문자를 손으로 복사해 보내느라 수업 준비 시간이 부족함.",
    solution: "시트에서 학생 출결 상태를 '등원완료'로 바꾸는 순간 0.1초 만에 학부모 번호로 안심 문자 자동 발송.",
    smsPreview: {
      sender: "스마트 출결 알림",
      message: "안녕하세요. 이투스 수학학원입니다.\n김민수 학생이 [16시 30분]에 학원에 안전하게 등원하였습니다.\n열심히 지도하겠습니다.",
    },
    prompt:
      "선생님이 '출결대장' 시트의 '출결상태' 열을 '등원완료'로 수정하면, 해당 행의 [학부모연락처]와 [학생이름]을 읽어 '{{학생이름}} 학생이 방금 안전하게 등원하였습니다.' 문자를 자동 발송해줘. 동시에 '등원시각' 열에 현재 시간을 자동으로 기록해줘.",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  {
    id: "uc-3",
    category: "경영·자영업",
    categoryIcon: Briefcase,
    title: "매일 저녁 7시 대표님 스마트폰 '퇴근길 일일 결산 브리핑'",
    target: "스타트업 대표, 음식점/카페 점주, 소상공인",
    triggerType: "schedule",
    triggerLabel: "매일 저녁 19:00 정기 스케줄",
    painPoint: "퇴근할 때마다 엑셀을 켜서 마감 정산을 하거나, 직원에게 매출 보고를 따로 받아야 하는 비효율.",
    solution: "하단 수식(=SUM)을 안전하게 우회하여 당일 매출액, 최다 판매 품목, 미결제 건수를 요약해 대표님께 0원 문자 전송.",
    smsPreview: {
      sender: "경영 일일 보고",
      message: "📊 [오늘의 마감 브리핑]\n- 당일 총 매출: 4,850,000원 (전일 대비 +15%)\n- 최다 판매: 시그니처 세트 (42건)\n- 미결제 건수: 1건 (300,000원)\n오늘 하루도 정말 수고 많으셨습니다!",
    },
    prompt:
      "매일 저녁 7시에 '일일판매' 탭에서 오늘 날짜로 등록된 행들을 필터링해줘. 총 판매금액 합계와 가장 많이 팔린 품목명, 그리고 아직 결제되지 않은 미수금 건수를 집계해서 대표님 휴대폰(010-XXXX-XXXX)으로 일일 마감 요약 문자를 전송해줘. 시트 하단에 위치한 기존 =SUM 수식 셀은 절대 수정하지 마.",
    badgeColor: "bg-purple-50 text-purple-700 border-purple-200",
  },
  {
    id: "uc-4",
    category: "AI·개발",
    categoryIcon: Bot,
    title: "AI 에이전트(Antigravity/Cursor) 원격 노코드 배포",
    target: "1인 창업가, 자동화 엔지니어, 노코드 실무자",
    triggerType: "bridge",
    triggerLabel: "Agent Bridge API (양방향)",
    painPoint: "Apps Script 개발 문법과 GCP 클라우드 콘솔 설정이 어려워 고난도 자동화 기능을 직접 만들지 못함.",
    solution: "안티그라비티나 Cursor에 브릿지 URL만 주면, AI가 시트 10행 헤더와 다중 탭을 읽어 원격으로 클라우드에 즉시 배포.",
    smsPreview: {
      sender: "Agent Bridge",
      message: "🤖 [SheetBot 배포 완료]\n프로젝트 '견적서 자동 발행기'에 새 Apps Script 코드가 구글 클라우드에 성공적으로 배포되었습니다.\n- 등록 함수: 3개\n- 메뉴: [견적서 관리] 추가됨",
    },
    prompt:
      "SheetBot 브릿지 주소(https://sheetbot.io/api/agent/gas-bridge?token=YOUR_TOKEN)의 시트 정보를 읽어서, 14행부터 시작되는 견적서 품목들을 기반으로 상단에 [📄 PDF 견적서 발행 및 고객 발송] 메뉴를 생성하고 구글 클라우드에 자동 배포해줘.",
    badgeColor: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  {
    id: "uc-5",
    category: "경리·회계",
    categoryIcon: Building2,
    title: "미수금·미결제 장기 연체 정중한 입금 요청 봇",
    target: "경리 실무자, 세무/회계 담당자, B2B 납품 업체",
    triggerType: "schedule",
    triggerLabel: "매주 월요일 10:00 정기 스케줄",
    painPoint: "월말마다 미입금 거래처를 일일이 대조하고 전화로 독촉하는 심리적 스트레스와 업무 낭비.",
    solution: "입금예정일이 3일 초과된 미입금 건을 자동 추출하여 예의 바른 확인 문자를 0원으로 자동 전송.",
    smsPreview: {
      sender: "정산 안내",
      message: "안녕하세요, (주)한국유통 대표님.\n9월분 납품대금(1,500,000원) 입금 예정일(9/5)이 경과되어 확인차 연락드립니다.\n- 입금계좌: 기업은행 123-456-78901\n확인 후 입금 부탁드리겠습니다. 감사합니다.",
    },
    prompt:
      "매주 월요일 오전 10시에 '매출수금대장' 시트에서 [입금상태]가 '미입금'이고 [입금예정일]이 오늘 기준 3일 이상 지난 행들을 검색해줘. 거래처 담당자 연락처로 입금 확인 요청 안내 문자를 0원으로 발송하고, 시트의 [안내발송일] 열에 오늘 날짜를 찍어줘.",
    badgeColor: "bg-rose-50 text-rose-700 border-rose-200",
  },
  {
    id: "uc-6",
    category: "인사·총무",
    categoryIcon: Users,
    title: "임직원 생일 및 입사 N주년 축하 & 사내 복지 자동화",
    target: "스타트업 총무팀, 인사(HR) 담당자, 팀 리더",
    triggerType: "schedule",
    triggerLabel: "매일 아침 08:30 정기 스케줄",
    painPoint: "팀원이 늘어나면서 생일이나 1주년/3주년 입사기념일을 깜빡해 챙기지 못하는 일 발생.",
    solution: "매일 아침 명부를 스캔하여 당일 주인공에게 따뜻한 축하 문자를 발송하고 인사팀에 선물 지급 알림.",
    smsPreview: {
      sender: "사내 복지 봇",
      message: "🎉 민수 님, 입사 2주년을 진심으로 축하합니다!\n지난 2년간 우리 팀과 함께 멋진 성장을 이루어 주셔서 감사드립니다. 오늘 하루 가장 행복한 시간 보내세요!",
    },
    prompt:
      "매일 오전 8시 30분에 '임직원명부' 탭에서 오늘 날짜와 [생년월일(월일)]이 일치하는 생일자, 그리고 [입사일자(월일)]가 일치하는 입사 N주년 직원을 찾아줘. 주인공 휴대폰으로 맞춤 축하 문자를 발송하고, 인사담당자(010-XXXX-XXXX)에게 '오늘 커피 쿠폰 지급 대상자: 홍길동(생일)' 안내 문자를 보내줘.",
    badgeColor: "bg-amber-50 text-amber-700 border-amber-200",
  },
  {
    id: "uc-7",
    category: "부동산·시설",
    categoryIcon: Home,
    title: "월세 납부일 D-2 사전 안내 & 임대차 계약 만료 D-60 리마인더",
    target: "원룸/오피스텔 임대인, 빌딩 시설관리자, 공유오피스 매니저",
    triggerType: "schedule",
    triggerLabel: "매일 오전 10:00 정기 스케줄",
    painPoint: "수십 개 호실의 세입자마다 다른 월세 납부일과 재계약 의사 타진 시기를 놓쳐 연체와 공실 발생.",
    solution: "납부 2일 전 계좌 정보와 함께 사전 알림을 보내고, 60일 전 만료 호실 세입자에게 갱신 의사 타진 문자 발송.",
    smsPreview: {
      sender: "임대 관리 센터",
      message: "안녕하세요. 행복빌딩 302호 입주자님.\n9월분 임대료 납부일(9/10) 2일 전입니다.\n- 납부계좌: 국민은행 987-654-3210 (예금주: 김대표)\n기한 내 납부 부탁드립니다. 감사합니다.",
    },
    prompt:
      "매일 오전 10시에 '호실별계약대장' 시트를 검사해줘. [매월납부일] 이틀 전인 호실의 세입자에게 계좌번호와 함께 월세 납부 사전 알림 문자를 보내고, [계약종료일]이 60일 남은 호실 세입자에게는 '임대차 계약 만료 60일 전 안내' 문자를 발송해줘.",
    badgeColor: "bg-teal-50 text-teal-700 border-teal-200",
  },
  {
    id: "uc-8",
    category: "영업·CS",
    categoryIcon: MessageSquare,
    title: "구글 폼 상담 신청 즉시 '고객 웰컴' & '영업 담당자 알림'",
    target: "B2B 영업팀, 맞춤 제작/인테리어 업체, 렌탈 상담 센터",
    triggerType: "onFormSubmit",
    triggerLabel: "onFormSubmit (설문지 제출 즉시)",
    painPoint: "고객이 상담 신청서를 남겼으나 담당자가 몇 시간 뒤에야 확인하여 경쟁사로 고객이 이탈함.",
    solution: "폼 제출 즉시 고객에게는 신뢰감 주는 접수 문자를, 영업 사원에게는 고객 번호와 문의 요약을 초고속 토스.",
    smsPreview: {
      sender: "상담 접수 센터",
      message: "안녕하세요 {{고객명}}님, SheetBot 도입 문의가 정상 접수되었습니다.\n담당 컨설턴트가 1시간 이내에 기재해주신 번호로 연락드리겠습니다. 감사합니다.",
    },
    prompt:
      "구글 설문지에 새로운 응답이 들어오면(onFormSubmit), 방금 입력된 고객 휴대폰 번호로 '상담 신청이 접수되었습니다' 웰컴 문자를 즉시 보내줘. 동시에 영업팀장(010-XXXX-XXXX)에게 '🚨 신규 고객 문의 인입: [{{고객명}}] {{문의분야}} (연락처: {{연락처}})' 문자를 실시간으로 전송해줘.",
    badgeColor: "bg-cyan-50 text-cyan-700 border-cyan-200",
  },
  {
    id: "uc-9",
    category: "의료·뷰티",
    categoryIcon: Activity,
    title: "진료·시술 완료 체크 시 '고객 맞춤 회복 주의사항' 자동 케어",
    target: "치과, 피부과, 한의원, 왁싱/속눈썹 샵, 미용실",
    triggerType: "onEdit",
    triggerLabel: "onEdit (체크박스 클릭 즉시)",
    painPoint: "시술 후 안내문 종이를 줘도 분실하고 부작용이나 주의사항에 대한 단순 전화 문의가 빗발침.",
    solution: "차트 시트에서 '완료' 체크박스를 누르는 즉시 시술 종류(스케일링, 보톡스 등)에 맞는 주의사항 문자 발송.",
    smsPreview: {
      sender: "맑은미소 치과",
      message: "안녕하세요. 오늘 스케일링을 받으신 {{환자명}}님,\n시술 후 24시간 동안은 너무 뜨겁거나 자극적인 음식을 피해주시고 일시적인 잇몸 시림은 자연스러운 회복 과정입니다. 빠른 쾌유를 바랍니다.",
    },
    prompt:
      "치과 실장님이 '당일진료환자' 탭의 [시술완료] 체크박스를 TRUE로 체크하면, 해당 행의 [진료과목]을 확인하여 그에 맞는 사후 주의사항 문자를 환자 휴대폰으로 0원 자동 발송해줘. 이미 발송된 행은 [발송완료] 열에 완료 표시를 남겨 중복 발송을 방지해줘.",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  {
    id: "uc-10",
    category: "물류·배송",
    categoryIcon: Truck,
    title: "현장 기사님 출발 시 당일 고객 일괄 '도착 예정 시간' 안내",
    target: "가구/가전 설치 기사, 에어컨 청소, 용달/이사, 출장 정비",
    triggerType: "menu",
    triggerLabel: "구글 시트 상단 전용 메뉴 클릭",
    painPoint: "방문 전에 고객 10~20명에게 일일이 전화하다가 오전에 진이 빠지고, 부재중이라 헛걸음하는 일 다반사.",
    solution: "스마트폰 시트 앱에서 상단 [출발 문자 전송] 버튼을 한 번만 누르면 당일 방문 고객에게 순차적으로 안내 문자 일괄 발송.",
    smsPreview: {
      sender: "클린에어 방문 기사",
      message: "안녕하세요, 에어컨 케어 기사 홍길동입니다.\n금일 고객님 댁(방문 예정: 14시~15시)에 방문드릴 예정입니다. 부재 중이시거나 일정 변경이 필요하시면 본 번호로 회신 부탁드립니다.",
    },
    prompt:
      "구글 시트 상단 메뉴에 '🚚 [출장 배송] -> [오늘 방문 고객 일괄 출발 안내 발송]' 메뉴를 등록해줘. 기사님이 이 메뉴를 누르면 '오늘배송' 탭에서 [상태]가 '출발대기'인 모든 고객들에게 방문 예정 시간과 기사 연락처가 포함된 안내 문자를 순차적으로 발송하고 [발송완료]로 상태를 갱신해줘.",
    badgeColor: "bg-orange-50 text-orange-700 border-orange-200",
  },
  {
    id: "uc-11",
    category: "피트니스·체육",
    categoryIcon: Dumbbell,
    title: "PT 세션 2회 미만 / 회원권 만료 D-7 선제적 재등록 프로모션",
    target: "헬스장, 필라테스/요가 스튜디오, 개인 PT 샵, 테니스 아카데미",
    triggerType: "schedule",
    triggerLabel: "매일 오후 14:00 정기 스케줄",
    painPoint: "회원권이 다 끝난 뒤에 연락하면 이미 이탈하여 재등록률이 떨어짐.",
    solution: "잔여 횟수가 2회 남았거나 만료 7일 전인 회원을 미리 감지하여 맞춤 프로모션 혜택 문자를 자동 발송.",
    smsPreview: {
      sender: "바디핏 피트니스",
      message: "회원님, 현재 남은 PT 세션이 [2회] 남았습니다! 💪\n이번 주 내로 재등록을 진행하시면 1회 추가 세션 혜택을 드리고 있으니 담당 트레이너에게 편하게 말씀해 주세요 :)",
    },
    prompt:
      "매일 오후 2시에 '회원관리' 시트에서 [잔여세션]이 2회 이하이거나 [만료예정일]이 오늘 기준 7일 이내인 활성 회원을 찾아줘. 해당 회원들에게 친절한 재등록 안내 및 프로모션 문자를 0원으로 발송해줘. 최근 14일 이내에 이미 안내 문자를 받은 회원은 제외해줘.",
    badgeColor: "bg-lime-50 text-lime-700 border-lime-200",
  },
  {
    id: "uc-12",
    category: "IT·개발",
    categoryIcon: Server,
    title: "24시간 웹서버/쇼핑몰 장애 감지 및 당직자 비상 SMS 싸이렌",
    target: "스타트업 개발팀, 쇼핑몰 인프라 관리자, 시스템 엔지니어",
    triggerType: "schedule",
    triggerLabel: "매 10분 주기 정기 스케줄",
    painPoint: "야간이나 주말에 자사 웹페이지가 다운되었는데 아무도 몰라 광고비와 소중한 주문이 날아감.",
    solution: "SheetBot 스크립트가 10분마다 웹 서버 핑(Ping)을 체크하여 에러 발생 시 등록된 당직자 3명에게 비상 문자 즉시 전송.",
    smsPreview: {
      sender: "Server Alert",
      message: "🚨 [긴급] 쇼핑몰 웹서버 응답 없음 (HTTP 502 Bad Gateway)!\n장애 감지 시각: 03:20\nURL: https://myshop.com\n즉시 서버 점검 및 재시작이 필요합니다.",
    },
    prompt:
      "매 10분마다 등록된 타겟 URL(https://myshop.com)로 UrlFetchApp.fetch를 실행해서 HTTP 응답 코드를 확인해줘. 응답 코드가 200이 아니거나 예외(타임아웃)가 발생하면 '서버장애기록' 탭에 에러 로그를 남기고, 당직자 휴대폰 번호(010-XXXX-XXXX)로 긴급 비상 경보 문자를 즉시 전송해줘.",
    badgeColor: "bg-red-50 text-red-700 border-red-200",
  },
];

const CATEGORIES = [
  { id: "all", label: "전체 보기" },
  { id: "쇼핑몰·유통", label: "쇼핑몰·유통" },
  { id: "학원·교육", label: "학원·교육" },
  { id: "경영·자영업", label: "경영·자영업" },
  { id: "경리·회계", label: "경리·회계" },
  { id: "인사·총무", label: "인사·총무" },
  { id: "부동산·시설", label: "부동산·시설" },
  { id: "영업·CS", label: "영업·CS" },
  { id: "의료·뷰티", label: "의료·뷰티" },
  { id: "물류·배송", label: "물류·배송" },
  { id: "피트니스·체육", label: "피트니스·체육" },
  { id: "IT·개발", label: "AI & IT" },
];

export default function UseCasesPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const filteredUseCases = useMemo(() => {
    return USE_CASES.filter((item) => {
      // 카테고리 필터
      const matchesCategory =
        selectedCategory === "all" ||
        item.category === selectedCategory ||
        (selectedCategory === "IT·개발" &&
          (item.category === "IT·개발" || item.category === "AI·개발"));

      // 검색어 필터
      const query = searchQuery.trim().toLowerCase();
      if (!query) return matchesCategory;

      const matchesQuery =
        item.title.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        item.target.toLowerCase().includes(query) ||
        item.painPoint.toLowerCase().includes(query) ||
        item.solution.toLowerCase().includes(query) ||
        item.prompt.toLowerCase().includes(query) ||
        item.triggerLabel.toLowerCase().includes(query);

      return matchesCategory && matchesQuery;
    });
  }, [selectedCategory, searchQuery]);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <Navbar />

      {/* 헤더 섹션 */}
      <section className="bg-white border-b border-slate-200/80 pt-12 pb-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-teal-50 border border-teal-200/80 text-teal-800 text-xs font-bold shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-teal-600" />
            <span>실전 비즈니스 자동화 레시피 12종</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 tracking-tight">
            내 업무에 딱 맞는{" "}
            <span className="bg-gradient-to-r from-teal-600 via-emerald-600 to-indigo-600 bg-clip-text text-transparent">
              스프레드시트 자동화
            </span>
            를 찾아보세요
          </h1>

          <p className="text-sm sm:text-base text-slate-500 max-w-2xl mx-auto leading-relaxed">
            복잡한 코딩이나 외부 개발 외주 없이, 마음에 드는 사례의 프롬프트를 복사하여 대시보드에 붙여넣기만 하세요. 구글 클라우드에 3초 만에 배포됩니다.
          </p>

          {/* 검색창 */}
          <div className="max-w-xl mx-auto pt-4">
            <div className="relative flex items-center">
              <Search className="w-5 h-5 text-slate-400 absolute left-4 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="검색어를 입력하세요 (예: 재고, 출결, 미수금, 문자, 월세...)"
                className="w-full pl-11 pr-10 py-3.5 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 rounded-2xl text-sm font-medium text-slate-800 transition-all outline-none placeholder:text-slate-400 shadow-xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                  title="검색어 초기화"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>

            {searchQuery && (
              <div className="flex items-center justify-between text-xs text-slate-500 px-2 pt-2">
                <span>
                  '<strong className="text-teal-700 font-bold">{searchQuery}</strong>' 검색 결과: 총{" "}
                  <strong>{filteredUseCases.length}</strong>건
                </span>
                <button
                  onClick={() => setSearchQuery("")}
                  className="text-teal-600 hover:underline font-bold"
                >
                  전체 보기
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 카테고리 탭 (가로 스크롤 대응) */}
        <div className="max-w-6xl mx-auto mt-8 flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
          {CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  isActive
                    ? "bg-slate-900 text-white shadow-sm shadow-slate-900/20"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-800"
                }`}
              >
                <span>{cat.label}</span>
                {cat.id === "all" && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                      isActive ? "bg-teal-400 text-slate-900" : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {USE_CASES.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* 활용사례 카드 그리드 */}
      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
        {filteredUseCases.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-12 text-center max-w-md mx-auto space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Search className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-800 text-base">검색 결과가 없습니다</h3>
              <p className="text-xs text-slate-500 mt-1">
                다른 검색어를 입력하시거나 카테고리 필터를 '전체 보기'로 변경해 보세요.
              </p>
            </div>
            <button
              onClick={() => {
                setSelectedCategory("all");
                setSearchQuery("");
              }}
              className="px-4 py-2 bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs font-bold rounded-xl transition-all"
            >
              필터 초기화
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {filteredUseCases.map((uc) => {
              const CategoryIcon = uc.categoryIcon;
              const isCopied = copiedId === uc.id;

              return (
                <div
                  key={uc.id}
                  className="bg-white rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all p-6 sm:p-7 flex flex-col justify-between space-y-6"
                >
                  {/* 상단 태그 & 트리거 정보 */}
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${uc.badgeColor}`}
                      >
                        <CategoryIcon className="w-3.5 h-3.5" />
                        <span>{uc.category}</span>
                      </span>

                      <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
                        {uc.triggerType === "schedule" && <Clock className="w-3.5 h-3.5 text-indigo-500" />}
                        {uc.triggerType === "onEdit" && <Zap className="w-3.5 h-3.5 text-amber-500" />}
                        {uc.triggerType === "onFormSubmit" && <MessageSquare className="w-3.5 h-3.5 text-teal-500" />}
                        {uc.triggerType === "menu" && <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />}
                        {uc.triggerType === "bridge" && <Bot className="w-3.5 h-3.5 text-purple-500" />}
                        <span className="font-semibold text-slate-700">{uc.triggerLabel}</span>
                      </div>
                    </div>

                    <div>
                      <h2 className="text-xl font-black text-slate-900 leading-snug tracking-tight">
                        {uc.title}
                      </h2>
                      <p className="text-xs text-slate-400 font-medium mt-1">
                        🎯 추천 대상: {uc.target}
                      </p>
                    </div>

                    {/* Before & After 비교 박스 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div className="bg-rose-50/50 border border-rose-100 rounded-2xl p-3.5 space-y-1">
                        <div className="flex items-center gap-1.5 text-rose-800 text-xs font-extrabold">
                          <span className="text-[11px] px-1.5 py-0.2 bg-rose-200/80 rounded text-rose-900">
                            기존 고통
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed pt-0.5">
                          {uc.painPoint}
                        </p>
                      </div>

                      <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-3.5 space-y-1">
                        <div className="flex items-center gap-1.5 text-emerald-800 text-xs font-extrabold">
                          <span className="text-[11px] px-1.5 py-0.2 bg-emerald-200/80 rounded text-emerald-900">
                            시트봇 도입 후
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed pt-0.5">
                          {uc.solution}
                        </p>
                      </div>
                    </div>

                    {/* 스마트폰 문자 프리뷰 (SMS가 있는 경우) */}
                    {uc.smsPreview && (
                      <div className="bg-slate-900 rounded-2xl p-4 text-white space-y-2 shadow-inner">
                        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                          <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                            <Smartphone className="w-3.5 h-3.5" />
                            <span>0원 문자 발송 프리뷰 ({uc.smsPreview.sender})</span>
                          </div>
                          <span>무제한 무료</span>
                        </div>
                        <div className="bg-slate-800 rounded-xl p-3 text-xs font-sans text-slate-100 leading-relaxed whitespace-pre-line border border-slate-700/60">
                          {uc.smsPreview.message}
                        </div>
                      </div>
                    )}

                    {/* AI 프롬프트 미리보기 */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                          <span>시트봇 전용 프롬프트</span>
                        </span>
                        <span className="text-[11px] text-slate-400 font-normal">
                          대시보드에 복사해 넣기만 하세요
                        </span>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl text-xs text-slate-700 font-mono leading-relaxed max-h-24 overflow-y-auto">
                        "{uc.prompt}"
                      </div>
                    </div>
                  </div>

                  {/* 하단 버튼 그룹 */}
                  <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5 border-t border-slate-100">
                    <button
                      onClick={() => handleCopy(uc.prompt, uc.id)}
                      className={`w-full sm:flex-1 py-2.5 px-3.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        isCopied
                          ? "bg-emerald-600 text-white shadow-xs"
                          : "bg-slate-100 hover:bg-slate-200 text-slate-800"
                      }`}
                    >
                      {isCopied ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                          <span>프롬프트 복사 완료!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-500" />
                          <span>프롬프트 1초 복사</span>
                        </>
                      )}
                    </button>

                    <Link
                      href="/dashboard"
                      className="w-full sm:w-auto py-2.5 px-4 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs shrink-0 whitespace-nowrap"
                    >
                      <span>이 사례로 시작</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 하단 안내 배너 */}
        <section className="mt-16 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-8 sm:p-10 text-white text-center space-y-5 shadow-lg">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 text-emerald-300 text-xs font-bold backdrop-blur-xs">
            <Sparkles className="w-3.5 h-3.5" />
            <span>원하는 업무 양식이 따로 있으신가요?</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
            어떤 복잡한 수식이나 프로세스도 자연어로 말만 하세요
          </h2>

          <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto leading-relaxed">
            SheetBot은 10행 헤더, 고정 좌표 셀(C4, B6), 가변 데이터 행, =SUM 수식까지 스스로 인식하여 기존 양식을 해치지 않고 안전하게 자동화 코드를 주입합니다.
          </p>

          <div className="pt-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm rounded-2xl transition-all shadow-md active:scale-95"
            >
              <span>내 구글 시트로 지금 시작하기</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
