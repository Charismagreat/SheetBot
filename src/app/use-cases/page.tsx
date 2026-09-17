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
  PanelRight,
  Mail,
  Layers,
  Database,
  Receipt,
  FileCheck,
  Megaphone,
  QrCode,
  Calendar,
  Coins,
  FileText,
  AlertOctagon,
  Scale,
  Landmark,
  PhoneCall,
  Printer,
  TrendingUp,
  Wrench,
} from "lucide-react";
import Navbar from "@/components/Navbar";

interface UseCase {
  id: string;
  category: string;
  categoryIcon: any;
  title: string;
  target: string;
  triggerType: "schedule" | "onEdit" | "onFormSubmit" | "menu" | "bridge" | "sidebar";
  triggerLabel: string;
  painPoint: string;
  solution: string;
  smsPreview?: {
    sender: string;
    message: string;
  };
  emailPreview?: {
    recipient: string;
    subject: string;
    body: string;
  };
  sidebarPreview?: {
    title: string;
    badge: string;
    description: string;
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
  {
    id: "uc-13",
    category: "경리·회계",
    categoryIcon: Receipt,
    title: "사이드바 영수증/명함 파일 업로드 & AI 자동 기입",
    target: "경리 담당자, 세무대리인, 영수증 처리 실무자, 현장 영업직",
    triggerType: "sidebar",
    triggerLabel: "사이드바 UI (파일 업로드)",
    painPoint: "영수증이나 명함 종이를 보고 시트에 날짜, 금액, 상호, 사업자번호를 일일이 손으로 타이핑하는 극심한 시간 낭비.",
    solution: "우측 사이드바에서 사진/PDF를 올리면 AI가 즉시 텍스트를 분석하여 시트 다음 빈 행에 표 규격대로 자동 기입.",
    sidebarPreview: {
      title: "영수증/명함 AI 자동 분석기",
      badge: "사이드바 UI 전용",
      description: "📄 영수증 이미지/PDF 업로드 ➔ AI 핵심 데이터 추출 ➔ [시트에 즉시 행 추가]",
    },
    prompt:
      "구글 시트 우측에 영수증/명함 이미지를 업로드할 수 있는 사이드바 UI를 만들어줘. 사용자가 이미지를 올리면 AI가 일자, 거래처명, 사업자등록번호, 공급가액, 부가세, 합계금액을 추출하여 '경비지출대장' 시트의 다음 빈 행에 자동으로 기입되게 해줘.",
    badgeColor: "bg-purple-50 text-purple-700 border-purple-200",
  },
  {
    id: "uc-14",
    category: "영업·CS",
    categoryIcon: Mail,
    title: "선택 행 고객 정보 프리뷰 & 맞춤 견적·안내 메일 발송 제어기",
    target: "B2B 영업 담당자, 고객 지원팀, 수강생/회원 관리자",
    triggerType: "sidebar",
    triggerLabel: "사이드바 UI (선택 행 제어)",
    painPoint: "시트에서 특정 고객을 선택한 뒤 메일 창을 따로 켜서 고객명과 견적 내용을 복사해 붙여넣느라 번거롭고 오발송 위험.",
    solution: "시트에서 고객 행을 클릭하면 사이드바에 즉시 맞춤 정보가 로드되며, [메일 발송] 버튼 하나로 Gmail 원클릭 전송.",
    emailPreview: {
      recipient: "고객사 담당자 (contact@client.com)",
      subject: "[견적 안내] {{고객사명}} 맞춤 견적서 및 세부 내역입니다.",
      body: "안녕하세요 {{담당자명}}님, 요청하신 9월 납품 견적 상세 내역을 보내드립니다.\n• 총 공급가액: {{공급가액}}원\n• 납기일정: 계약 체결 후 3영업일 이내\n확인 후 회신 부탁드립니다. 감사합니다.",
    },
    prompt:
      "구글 시트에서 특정 행을 클릭했을 때 우측 사이드바에 해당 행의 고객명, 이메일, 견적금액이 자동으로 표시되게 해줘. 사이드바의 [견적 안내 메일 발송] 버튼을 누르면 고객 이메일로 개인화된 HTML 견적 안내 메일을 Gmail로 발송하고, 시트의 [발송상태] 열을 '발송완료'로 갱신해줘.",
    badgeColor: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  {
    id: "uc-15",
    category: "경영·자영업",
    categoryIcon: Briefcase,
    title: "매일 저녁 당일 매출·발주 집계 & Gmail 요약 보고서 자동 발송",
    target: "점주, 스타트업 경영진, 이커머스 셀러, 프랜차이즈 관리자",
    triggerType: "schedule",
    triggerLabel: "매일 저녁 18:00 정기 스케줄",
    painPoint: "마감 때마다 엑셀 시트를 켜서 피벗을 돌리고 숫자를 캡처해 대표님이나 단톡방에 메일로 보고하는 수작업 피로.",
    solution: "매일 18시 정각에 당일 매출 합계, 베스트 판매 품목, 전일 대비 증감율을 깔끔한 HTML 표로 만들어 경영진 이메일로 자동 보고.",
    emailPreview: {
      recipient: "경영진/대표님 (ceo@company.com)",
      subject: "📊 [일일 결산 보고] 당일 매출 요약 리포트",
      body: "오늘의 마감 요약입니다.\n• 당일 총 매출: 3,450,000원 (+12.4% vs 전일)\n• 최다 주문: 프리미엄 패키지 (28건)\n• 미수금 발생: 0건 (전액 결제 완료)\n오늘 하루도 수고 많으셨습니다!",
    },
    prompt:
      "매일 오후 6시에 '당일매출' 탭에서 오늘 날짜로 기록된 판매 데이터를 집계해줘. 총 판매금액, 주문 건수, 베스트 품목 상위 3개를 깔끔한 HTML 테이블로 구성하여 대표님 이메일(ceo@company.com)로 자동 발송해줘. 기존 =SUM 수식 셀은 건드리지 말고 데이터 영역만 읽어줘.",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
  },
  {
    id: "uc-16",
    category: "쇼핑몰·유통",
    categoryIcon: Layers,
    title: "지점·팀별 다중 탭 데이터를 단일 메인 대장으로 자동 병합",
    target: "다지점 매장 관리자, 팀별 실적 집계 담당, 대리점 본사 관리자",
    triggerType: "menu",
    triggerLabel: "구글 시트 상단 메뉴 원클릭 실행",
    painPoint: "강남점, 홍대점, 판교점 등 지점별 탭마다 따로 입력된 수백 건의 판매 내역을 일일이 복사해서 메인 시트에 붙여넣는 노가다.",
    solution: "상단 메뉴의 [지점 데이터 통합]을 누르면 각 탭의 헤더를 자동 매칭하여 메인 대장에 중복 없이 순차적으로 자동 Append.",
    sidebarPreview: {
      title: "다중 탭 원클릭 데이터 통합기",
      badge: "통합 자동화",
      description: "🗂️ 5개 지점 탭 자동 스캔 ➔ [메인통합대장] 중복 방지 병합 완료",
    },
    prompt:
      "구글 시트 상단에 [🚀 SheetBot 메뉴] -> [지점 데이터 메인 대장으로 통합] 메뉴를 만들어줘. 클릭 시 '통합대장' 탭을 제외한 모든 지점별 탭(강남점, 홍대점 등)의 데이터를 순회하여 헤더 열 구조에 맞게 '통합대장' 시트의 마지막 행 아래로 중복 없이 순차 병합해줘.",
    badgeColor: "bg-teal-50 text-teal-700 border-teal-200",
  },
  {
    id: "uc-17",
    category: "IT·개발",
    categoryIcon: Database,
    title: "로컬 SQLite DB / ERP 데이터 시트 원클릭 양방향 동기화 패널",
    target: "사내 전산/ERP 담당자, 데이터 분석가, 물류 관리자",
    triggerType: "sidebar",
    triggerLabel: "사이드바 UI (양방향 DB 동기화)",
    painPoint: "로컬 DB나 사내 시스템에 쌓이는 원천 데이터를 시트로 내보내거나, 시트에서 수정한 내용을 DB에 반영하기 위해 복잡한 쿼리를 매번 실행해야 함.",
    solution: "우측 사이드바에서 [최신 데이터 가져오기] 및 [시트 변경분 DB 반영] 버튼 하나로 안전한 CRUD 양방향 동기화 완벽 지원.",
    sidebarPreview: {
      title: "SQLite / 외부 DB 양방향 패널",
      badge: "실시간 동기화",
      description: "🔄 [1] DB 조회 ➔ [2] 시트 데이터 수정 ➔ [3] DB 일괄 동기화",
    },
    prompt:
      "구글 시트 우측에 사내 데이터베이스(SQLite/ERP)와 연동되는 사이드바 패널을 만들어줘. [DB 최신 데이터 조회]를 누르면 테이블의 신규 주문 내역을 시트에 채우고, 시트에서 수정한 상태값을 [DB 일괄 동기화] 버튼으로 데이터베이스에 안전하게 역반영해줘.",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  {
    id: "uc-18",
    category: "경리·회계",
    categoryIcon: Building2,
    title: "국세청 홈택스 사업자등록상태(휴·폐업) 원클릭 일괄 조회",
    target: "경리/회계 담당자, 세무대리인, B2B 매입/매출 정산팀",
    triggerType: "menu",
    triggerLabel: "구글 시트 상단 메뉴 원클릭 실행",
    painPoint: "세금계산서 발행 전 수십~수백 개 거래처의 사업자번호를 홈택스에서 일일이 대조하느라 반나절 소요 (폐업자에게 오발행 시 가산세 위험).",
    solution: "상단 메뉴 클릭 한 번으로 수백 개 사업자번호를 국세청 API로 3초 만에 일괄 대조하여 상태 자동 기록 및 폐업 업체 행 경고.",
    sidebarPreview: {
      title: "홈택스 사업자 진위 검조",
      badge: "국세청 실시간 연동",
      description: "🏢 사업자번호 일괄 스캔 ➔ [계속/휴업/폐업] 상태 자동 분류 및 셀 색상 표기",
    },
    prompt:
      "구글 시트 상단 메뉴에 [홈택스 사업자 상태 일괄 조회]를 추가해줘. 클릭 시 B열의 사업자등록번호들을 읽어 국세청 API로 상태를 확인하고, C열에 '계속사업자', '폐업(폐업일: YYYY-MM-DD)'으로 기록해줘. 폐업된 행은 셀 배경색을 연한 빨간색으로 칠해줘.",
    badgeColor: "bg-rose-50 text-rose-700 border-rose-200",
  },
  {
    id: "uc-19",
    category: "쇼핑몰·유통",
    categoryIcon: ShoppingBag,
    title: "쇼핑몰 발주서 엑셀 ➔ 택배사 송장 양식 원클릭 자동 변환기",
    target: "온라인 쇼핑몰 운영자, 3PL 물류 대행사, 이커머스 MD",
    triggerType: "sidebar",
    triggerLabel: "사이드바 UI (양식 자동 변환)",
    painPoint: "스마트스토어, 쿠팡 등에서 받은 발주서 엑셀 열(주문자, 주소, 수량)을 택배사 접수 양식 순서로 매일 손으로 복사·잘라내기하는 극심한 노가다.",
    solution: "사이드바에 쇼핑몰 엑셀을 드래그해 올리면, 열 순서를 택배사 접수 양식 규격에 맞게 1초 만에 자동 정렬하여 새 탭에 생성.",
    sidebarPreview: {
      title: "택배 송장 원클릭 변환 패널",
      badge: "사이드바 양식 변환",
      description: "📦 스마트스토어/쿠팡 엑셀 ➔ CJ대한통운/우체국 송장 접수 규격 1초 변환",
    },
    prompt:
      "사이드바에 엑셀/CSV 발주서를 업로드하면, 스마트스토어 주문 양식의 [수취인명], [배송지주소], [연락처] 열을 'CJ택배송장' 탭의 지정된 헤더 규격에 맞춰 1초 만에 자동 정렬하여 채워주는 코드를 배포해줘.",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
  },
  {
    id: "uc-20",
    category: "영업·CS",
    categoryIcon: FileText,
    title: "시트 데이터 기반 PDF 견적서/계약서 자동 생성 & 구글 드라이브 보관",
    target: "B2B 영업팀, 계약/행정 실무자, 프리랜서, 컨설턴트",
    triggerType: "menu",
    triggerLabel: "구글 시트 상단 메뉴 원클릭 실행",
    painPoint: "시트에 정리된 품목과 단가를 워드나 한글에 다시 옮겨 적고 PDF로 변환해 저장한 뒤 고객에게 이메일로 보내는 비효율적인 반복 작업.",
    solution: "상단 메뉴 클릭 한 번으로 직인이 찍힌 완성형 PDF 견적서를 생성하고, 구글 드라이브 전용 폴더에 자동 백업 및 다운로드 링크 생성.",
    sidebarPreview: {
      title: "PDF 견적서 자동 빌더",
      badge: "Google Drive 연동",
      description: "📑 견적 품목 스캔 ➔ 직인 포함 PDF 빌드 ➔ [구글 드라이브 폴더 자동 저장]",
    },
    prompt:
      "현재 시트의 견적 품목(품명, 수량, 단가)과 공급받는자 정보를 바탕으로 회사 직인이 포함된 깔끔한 PDF 견적서를 생성해줘. 생성된 PDF는 구글 드라이브 '견적서_보관함' 폴더에 'YYYYMMDD_고객사명_견적서.pdf'로 저장하고 시트에 다운로드 링크를 남겨줘.",
    badgeColor: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  {
    id: "uc-21",
    category: "마케팅·콘텐츠",
    categoryIcon: Megaphone,
    title: "신규 상품 키워드 기반 AI 마케팅 카피 & SNS 홍보 문구 자동 생성",
    target: "이커머스 셀러, 1인 마케터, SNS 채널 운영자, 크리에이터",
    triggerType: "onEdit",
    triggerLabel: "onEdit (신규 상품명 입력 즉시)",
    painPoint: "신상품 수십 개를 등록할 때마다 인스타그램 문구, 블로그 소개글, 상세페이지 헤드카피를 쥐어짜느라 마케팅 일정이 지연됨.",
    solution: "시트에 상품명과 핵심 특징을 적는 즉시 Gemini AI가 타깃 감성의 인스타그램 홍보 카피와 추천 해시태그(#)를 3개 열에 자동 생성.",
    sidebarPreview: {
      title: "Gemini AI 마케팅 카피라이터",
      badge: "AI 실시간 생성",
      description: "✨ 상품명/특징 입력 ➔ 타깃 맞춤 SNS 카피 + 해시태그 5종 자동 작성",
    },
    prompt:
      "A열(상품명)과 B열(특징)에 새로운 내용이 입력되면, AI Caller를 호출해 20~30대 타깃의 인스타그램 감성 홍보 카피와 해시태그 5개를 작성하여 C열에 자동으로 채워 넣어줘.",
    badgeColor: "bg-pink-50 text-pink-700 border-pink-200",
  },
  {
    id: "uc-22",
    category: "학원·교육",
    categoryIcon: Calendar,
    title: "시트 상담·진료 예약 ➔ 구글 캘린더 자동 등록 & D-1 리마인더",
    target: "학원 상담실장, 병원/치과 코디네이터, 피트니스 트레이너, 공간 대여업",
    triggerType: "onFormSubmit",
    triggerLabel: "onFormSubmit (예약 접수 즉시)",
    painPoint: "고객이 접수한 예약 일정을 캘린더에 따로 옮겨 적느라 일정이 겹치는 더블 부킹이 발생하고, 노쇼(No-Show)로 인한 공실 손해 발생.",
    solution: "시트에 예약이 들어오는 즉시 담당자 구글 캘린더에 일정을 등록하고, 방문 전날(D-1) 오후 2시에 고객 휴대폰으로 리마인더 문자를 자동 발송.",
    smsPreview: {
      sender: "예약 알림 센터",
      message: "안녕하세요 {{고객명}}님, 내일 [15:00]에 예약이 확정되어 있습니다.\n- 오시는 길: 강남역 4번 출구 앞\n변동 사항이 있으시면 미리 연락 부탁드립니다.",
    },
    prompt:
      "구글 폼으로 신규 예약(고객명, 연락처, 예약일시)이 들어오면 담당자 구글 캘린더에 일정을 자동 등록해줘. 또한 매일 오후 2시에 내일 방문 예정인 고객들을 찾아 예약 리마인더 문자를 0원으로 자동 발송해줘.",
    badgeColor: "bg-amber-50 text-amber-700 border-amber-200",
  },
  {
    id: "uc-23",
    category: "물류·배송",
    categoryIcon: QrCode,
    title: "상품 코드별 QR코드/바코드 자동 생성 & 재고 실사 라벨 출력",
    target: "물류/창고 관리자, 자산 관리팀, 도소매 유통업체, 매장 점주",
    triggerType: "menu",
    triggerLabel: "구글 시트 상단 메뉴 원클릭 실행",
    painPoint: "바코드 출력 프로그램을 별도로 구매하고 관리하느라 번거롭고, 시트 데이터와 라벨 번호가 불일치해 재고 실사 시 오류 다발.",
    solution: "상품 일련번호 열을 스캔하여 고해상도 QR코드를 셀 내에 자동 렌더링하고, 클릭 한 번으로 인쇄용 라벨 규격 탭으로 1초 변환.",
    sidebarPreview: {
      title: "QR코드 & 실사 라벨 생성기",
      badge: "인쇄 규격 자동화",
      description: "📱 상품코드 ➔ 고해상도 QR코드 자동 렌더링 ➔ [인쇄용 라벨 탭 변환]",
    },
    prompt:
      "A열의 [상품관리코드]를 기반으로 B열에 즉시 스캔 가능한 QR코드 이미지를 자동 생성해줘. 그리고 상단 메뉴 [인쇄용 라벨 생성]을 누르면 가로 3개 x 세로 6개 규격의 인쇄용 라벨 탭으로 자동 변환해줘.",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  {
    id: "uc-24",
    category: "경영·자영업",
    categoryIcon: Coins,
    title: "매일 아침 글로벌 환율(USD/JPY/EUR) 자동 수집 & 원화 마진 실시간 역산",
    target: "해외 구매대행 셀러, 무역/수출입 기업, 외화 정산 담당자",
    triggerType: "schedule",
    triggerLabel: "매일 평일 아침 09:10 정기 스케줄",
    painPoint: "매일 아침 환율 사이트를 확인하고 엑셀 마진율 계산 수식을 일일이 수정하느라 환율 변동에 따른 마진 손실을 뒤늦게 파악.",
    solution: "매일 평일 오전 9시 10분에 최신 매매기준율을 시트 B2 셀에 자동 업데이트하고, 전 품목의 원화 환산 매입가와 마진율을 실시간 재계산.",
    sidebarPreview: {
      title: "실시간 환율 마진 계산기",
      badge: "매일 아침 자동 업데이트",
      description: "💵 한국은행 환율 API 실시간 연동 ➔ 전 품목 원화 매입가/마진율 자동 역산",
    },
    prompt:
      "매일 평일 오전 9시 10분에 공공 환율 API를 호출하여 오늘자 USD/KRW 환율을 '대시보드' 시트의 B2 셀에 갱신해줘. 환율이 변경되면 해외 원가(USD)가 입력된 행들의 원화 환산 매입가와 권장 소비자가격을 자동으로 재계산해줘.",
    badgeColor: "bg-teal-50 text-teal-700 border-teal-200",
  },
  {
    id: "uc-25",
    category: "영업·CS",
    categoryIcon: AlertOctagon,
    title: "고객 불만/부정 리뷰 AI 감지 시 CS 책임자 비상 핫라인 알림",
    target: "이커머스 CS 팀장, 호텔/숙박/F&B 점주, 서비스 운영 책임자",
    triggerType: "onFormSubmit",
    triggerLabel: "onFormSubmit (고객 설문 접수 즉시)",
    painPoint: "고객이 별점 1점을 주거나 심각한 불만을 남겼는데 며칠 뒤에야 확인하여 악성 리뷰가 확산되고 고객 이탈 발생.",
    solution: "설문 접수 즉시 Gemini AI가 고객 리뷰 감정을 분석하여 부정적인 불만으로 판정 시 10초 만에 CS 책임자에게 비상 알림 문자 긴급 전송.",
    smsPreview: {
      sender: "CS 비상 핫라인",
      message: "🚨 [긴급] 불만 고객 리뷰 감지 (평점 1점)!\n- 고객명: 최영희 (010-XXXX-XXXX)\n- 불만 요약: '배송 상품 파손 및 고객센터 연결 불가'\n즉시 긴급 유선 케어가 필요합니다.",
    },
    prompt:
      "고객 피드백 시트에 새 응답이 들어오면 평점 열이 2점 이하이거나 불만 사항이 포함되어 있는지 검사해줘. 부정적인 리뷰인 경우 CS 팀장(010-XXXX-XXXX)에게 '🚨 긴급 고객 불만 인입: {{고객명}} / {{불만요약}}' 문자를 즉시 전송해줘.",
    badgeColor: "bg-red-50 text-red-700 border-red-200",
  },
  {
    id: "uc-26",
    category: "경리·회계",
    categoryIcon: Landmark,
    title: "홈택스 세금계산서 & 법인통장 실시간 자동 전표화 및 미수금 정산",
    target: "경리 실무자, CFO, 세무 담당자, B2B 도소매 유통사",
    triggerType: "schedule",
    triggerLabel: "매일 아침 08:00 정기 스케줄",
    painPoint: "홈택스와 은행 뱅킹 사이트에 매일 번갈아 들어가 엑셀을 내려받고, 수기로 대조하며 미입금 건을 찾느라 매일 1시간 이상 허비.",
    solution: "FinanceHub를 통해 홈택스 매입·매출 세금계산서와 통장 입출금 내역을 자동 수집하고, 입금액 일치 시 '정산완료' 자동 판정.",
    sidebarPreview: {
      title: "FinanceHub 금융/세무 허브",
      badge: "홈택스 & 은행 연동",
      description: "🏦 세금계산서 + 통장 입출금 자동 수집 ➔ [미수금 대조 및 정산 자동 완료]",
    },
    prompt:
      "매일 아침 8시에 FinanceHub 도구를 호출하여 홈택스 매입/매출 전자세금계산서와 법인통장 거래내역을 수집해줘. 시트 1행 헤더에 맞게 공급가액과 부가세를 분리해 기록하고, 세금계산서와 통장 입금액이 일치하는 거래는 '정산완료'로 자동 마킹해줘.",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  {
    id: "uc-27",
    category: "공공·지원사업",
    categoryIcon: Landmark,
    title: "기업마당(BizInfo) 맞춤 정부지원사업 & R&D 지원금 공고 매일 스크랩",
    target: "중소기업 대표, 스타트업 기획팀, R&D 연구소장",
    triggerType: "schedule",
    triggerLabel: "매일 평일 아침 08:30 정기 스케줄",
    painPoint: "수많은 정부 지원 포털을 일일이 찾아볼 시간이 없어 수억 원 규모의 맞춤 R&D나 수출/마케팅 바우처 지원 마감일을 놓침.",
    solution: "BizInfo 도구가 사내 업종과 지역에 부합하는 최신 공고만 선별해 시트에 수집하고 D-7 이내 건을 강조 표시.",
    sidebarPreview: {
      title: "BizInfo 정부지원금 스캐너",
      badge: "중기부 기업마당 연동",
      description: "🏛️ 맞춤 지원사업 공고 스캔 ➔ [마감임박 R&D/바우처 공고 시트 자동 리포트]",
    },
    prompt:
      "매일 평일 오전 8시 30분에 BizInfo 도구를 이용해 '인공지능', '소프트웨어', '수출바우처' 키워드의 최신 정부지원사업 공고를 조회해줘. 접수 중인 사업들의 사업명, 주관기관, 마감일자, 상세URL을 '정부지원공고' 시트에 자동으로 최신화해줘.",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
  },
  {
    id: "uc-28",
    category: "공공·지원사업",
    categoryIcon: FileText,
    title: "조달청 나라장터(KONEPS) 맞춤 입찰공고 자동 수집 & 낙찰 통계 분석",
    target: "공공조달 납품업체, SI/용역 개발사, 시설관리 전문업체",
    triggerType: "schedule",
    triggerLabel: "매일 아침 09:00 정기 스케줄",
    painPoint: "나라장터에 하루 수천 건씩 쏟아지는 입찰공고를 일일이 검색하느라 시간을 뺏기고 투찰 마감일을 아슬아슬하게 넘김.",
    solution: "KONEPS 도구가 배정예산 및 타깃 키워드에 일치하는 입찰공고를 선별 수집하고 마감 3일 전 긴급 알림.",
    sidebarPreview: {
      title: "조달청 나라장터 입찰 레이더",
      badge: "KONEPS 조달 연동",
      description: "🎯 타깃 입찰 공고 자동 필터링 ➔ [배정예산 및 투찰 마감일 추적]",
    },
    prompt:
      "매일 아침 9시에 KONEPS 도구로 조달청 나라장터에서 배정예산 5천만 원 이상의 '웹 개발' 및 '데이터 분석' 입찰 공고를 검색해줘. 공고번호, 수요기관, 추정가격, 마감일을 시트에 채우고, 마감 3일 전인 건은 비고란에 '긴급'으로 표시해줘.",
    badgeColor: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  {
    id: "uc-29",
    category: "영업·CS",
    categoryIcon: TrendingUp,
    title: "거래처 국민연금(NPS) 고용 인원 추이 & 기업 성장세 자동 진단",
    target: "B2B 영업 리드, 투자 심사역, 여신/신용 평가 담당자",
    triggerType: "menu",
    triggerLabel: "구글 시트 상단 메뉴 원클릭 실행",
    painPoint: "거래처의 재무 상태나 실질 성장세를 파악하기 어렵고, 유료 기업정보 사이트 비용이 부담스러움.",
    solution: "NPS 공공 데이터를 통해 거래처의 최근 12개월 가입자 수(총 직원수) 증감 추이와 추정 평균연봉을 시트에 자동 보강.",
    sidebarPreview: {
      title: "국민연금 기업 분석기",
      badge: "공공데이터 NPS 연동",
      description: "📈 사업자번호 스캔 ➔ 최근 1년 고용인원 증감률 + 추정 평균연봉 자동 분석",
    },
    prompt:
      "구글 시트 상단 메뉴에 [거래처 NPS 기업 성장세 분석]을 추가해줘. B열의 거래처 사업자번호들로 NPS trend를 조회하여 최근 6개월간 직원 수 증가세, 현재 총 인원수, 추정 평균연봉을 C~E열에 기록하고, 퇴사율이 급증한 기업은 주의 표시를 달아줘.",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  {
    id: "uc-30",
    category: "영업·CS",
    categoryIcon: PhoneCall,
    title: "고객 통화 녹음 파일 업로드 ➔ 화자 분리(STT) 및 상담 일지 자동 기입",
    target: "콜센터 상담원, 부동산 중개인, 영업 매니저, 고객 관리팀",
    triggerType: "sidebar",
    triggerLabel: "사이드바 UI (음성 파일 업로드)",
    painPoint: "고객과 긴 통화를 마친 뒤 통화 내용을 기억에 의존해 시트에 수기로 정리하느라 약속 사항 누락 및 분쟁 발생.",
    solution: "사이드바에 통화 녹음(MP3)을 올리면 AI가 상담원과 고객을 분리 전사하고 핵심 불만/요청사항 3줄 요약 후 고객 대장에 즉시 기입.",
    sidebarPreview: {
      title: "Voice Transcript AI 상담 비서",
      badge: "사이드바 음성 전사",
      description: "🎙️ 통화 녹음 파일 업로드 ➔ [상담원 vs 고객] 화자 분리 STT 및 3줄 요약 등록",
    },
    prompt:
      "구글 시트 우측 사이드바에서 고객 통화 녹음 파일(MP3/M4A)을 올리면 Voice Transcript 도구로 화자를 분리해 텍스트를 전사해줘. 통화 내용에서 고객의 핵심 문의사항, 불만 요점, 후속 조치 약속일을 추출해 시트의 고객 행에 자동으로 추가해줘.",
    badgeColor: "bg-violet-50 text-violet-700 border-violet-200",
  },
  {
    id: "uc-31",
    category: "마케팅·콘텐츠",
    categoryIcon: Megaphone,
    title: "시트 상품 기획 ➔ 블로그·인스타·유튜브 쇼츠 다채널 원클릭 자동 배포",
    target: "온라인 쇼핑몰 마케터, 1인 창업가, 콘텐츠 크리에이터",
    triggerType: "menu",
    triggerLabel: "구글 시트 상단 메뉴 원클릭 실행",
    painPoint: "한 개의 상품을 출시할 때마다 블로그, 인스타그램, 유튜브 관리자 페이지를 일일이 열어 복사-붙여넣기 발행하는 번거로움.",
    solution: "시트에 한 줄 기획안을 작성하고 버튼을 누르면 블로그 장문 글, 인스타 피드/해시태그, 유튜브 쇼츠 대본까지 다채널에 동시 자동 발행.",
    sidebarPreview: {
      title: "다채널 SNS 옴니 배포기",
      badge: "소셜 미디어 MCP 연동",
      description: "🚀 [원클릭 다채널 배포] ➔ 네이버/워드프레스 블로그 + 인스타그램 + 유튜브 쇼츠",
    },
    prompt:
      "시트에서 선택한 행의 기획 내용을 바탕으로 blog_publish로 블로그에 포스팅을 등록하고, instagram_create_post로 인스타 피드 게시물을 동시에 예약 발행해줘. 발행 완료된 링크를 시트 E열과 F열에 기록해줘.",
    badgeColor: "bg-pink-50 text-pink-700 border-pink-200",
  },
  {
    id: "uc-32",
    category: "법무·행정",
    categoryIcon: Scale,
    title: "계약서 특약 조항의 법률 리스크 검토 & 대법원 판례 자동 인용",
    target: "기업 법무팀, 계약 담당자, 인사노무 담당자, 가맹본부",
    triggerType: "menu",
    triggerLabel: "구글 시트 상단 메뉴 원클릭 실행",
    painPoint: "외주 계약이나 근로계약서에 작성된 특약이 상법이나 하도급법, 근로기준법에 위반되는지 법무 검토 비용과 시간이 많이 소요됨.",
    solution: "시트에 입력된 계약 조항을 Korean Law 도구로 검토하여 법률 위반 소지 분석 및 관련 법조문과 유사 판례 요약을 자동 인용.",
    sidebarPreview: {
      title: "Korean Law 법률 리스크 진단기",
      badge: "국가법령 & 판례 연동",
      description: "⚖️ 계약서 특약 조항 검토 ➔ 상법/근로기준법 저촉 여부 및 대법원 판례 인용",
    },
    prompt:
      "구글 시트 상단 메뉴에 [계약서 법률 리스크 검토]를 만들어줘. A열에 입력된 계약서 특약 문구를 korean_law_search로 법률 검토하여, 하도급법이나 근로기준법에 저촉될 수 있는 조항이 있는지 분석하고 관련 법조문과 대법원 판례 요약을 B열에 자동으로 채워줘.",
    badgeColor: "bg-amber-50 text-amber-700 border-amber-200",
  },
  {
    id: "uc-33",
    category: "물류·배송",
    categoryIcon: Printer,
    title: "시트 신규 주문 접수 즉시 '매장 카운터/물류창고 프린터' 실물 자동 인쇄",
    target: "식음료 매장, 도소매 배송 창고, 수리 센터, 현장 작업장",
    triggerType: "onEdit",
    triggerLabel: "onEdit (주문 상태 변경 즉시)",
    painPoint: "온라인이나 시트로 주문이 들어왔는데 직원이 화면을 제때 확인하지 않아 주문 접수가 누락되거나 출고가 지연됨.",
    solution: "주문 상태가 '접수'로 바뀌는 즉시 사무실 복합기나 매장 영수증 프린터로 거래명세서와 송장 라벨이 물리적으로 자동 출력.",
    sidebarPreview: {
      title: "Printing 원격 실물 인쇄 엔진",
      badge: "네트워크 프린터 직결",
      description: "🖨️ 시트 주문 상태 변경 ➔ 카운터/창고 프린터로 규격화된 거래명세표 즉시 인쇄",
    },
    prompt:
      "주문관리 시트의 D열(상태)이 '접수완료'로 변경되면, Printing 도구를 호출해 매장 영수증 프린터(또는 창고 프린터)로 주문자 정보와 품목이 정돈된 거래명세서 HTML을 즉시 원격 자동 인쇄해줘.",
    badgeColor: "bg-cyan-50 text-cyan-700 border-cyan-200",
  },
];

const CATEGORIES = [
  { id: "all", label: "전체 보기" },
  { id: "사이드바", label: "사이드바 UI" },
  { id: "쇼핑몰·유통", label: "쇼핑몰·유통" },
  { id: "공공·지원사업", label: "공공·정부지원" },
  { id: "경리·회계", label: "경리·세무" },
  { id: "마케팅·콘텐츠", label: "마케팅·콘텐츠" },
  { id: "영업·CS", label: "영업·CS" },
  { id: "학원·교육", label: "학원·교육" },
  { id: "경영·자영업", label: "경영·자영업" },
  { id: "법무·행정", label: "법무·행정" },
  { id: "인사·총무", label: "인사·총무" },
  { id: "부동산·시설", label: "부동산·시설" },
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
        (selectedCategory === "사이드바" && item.triggerType === "sidebar") ||
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
            <span>실전 비즈니스 자동화 레시피 {USE_CASES.length}종</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 tracking-tight break-keep">
            내 업무에 딱 맞는{" "}
            <span className="bg-gradient-to-r from-teal-600 via-emerald-600 to-indigo-600 bg-clip-text text-transparent">
              스프레드시트 자동화
            </span>
            를 찾아보세요
          </h1>

          <p className="text-sm sm:text-base text-slate-500 max-w-2xl mx-auto leading-relaxed break-keep">
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
      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full space-y-12">
        {/* =========================================================================
            [신규 킬러 쇼케이스] 구글 시트 3장으로 끝내는 초경량 ERP 멀티 시트 파이프라인
           ========================================================================= */}
        <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-teal-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl border border-teal-500/30 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/20 border border-teal-400/40 text-teal-300 text-xs font-black">
                <Layers className="w-3.5 h-3.5 text-teal-400" />
                <span>엔터프라이즈 멀티 시트 오케스트레이션</span>
              </div>
              <h2 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight text-white break-keep">
                "A시트 입력 ➔ B시트 자동 가공 ➔ C시트 무료 고객 문자"
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 break-keep">
                수천만 원짜리 맞춤형 ERP나 월 수십만 원 Zapier 없이, 서로 다른 구글 시트 3개만 이으면 우리 회사 자동화 완성!
              </p>
            </div>
            <div className="text-xs px-3.5 py-2 rounded-2xl bg-white/5 border border-white/10 text-teal-200 shrink-0 font-mono">
              💡 부서 간 시트 권한 완벽 격리 + 평생 통신비 0원
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 1. 유통/쇼핑몰 */}
            <div className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl p-5 space-y-3 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-2 bg-emerald-500/20 text-emerald-300 rounded-xl">
                    <ShoppingBag className="w-4 h-4" />
                  </span>
                  <h3 className="font-extrabold text-sm sm:text-base text-white">1. 유통·쇼핑몰: 주문 ➔ 창고 ➔ 배송문자</h3>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-md">일 2시간 절감</span>
              </div>
              <div className="text-xs space-y-1.5 text-slate-300 bg-black/30 p-3 rounded-xl font-mono leading-relaxed">
                <div>• <span className="text-emerald-400 font-bold">[A] 주문 접수처:</span> 쇼핑몰 주문 인입 시트</div>
                <div className="text-[11px] text-teal-400 pl-3">↳ 박스 규격·창고 위치 자동 연산 &amp; 포장팀 실시간 전달</div>
                <div>• <span className="text-teal-400 font-bold">[B] 창고 출고대장:</span> 출고 지시서 생성 (창고에 매출 시트 차단)</div>
                <div className="text-[11px] text-emerald-400 pl-3">↳ 송장 등록 즉시 고객 스마트폰으로 무료 알림 발송</div>
                <div>• <span className="text-amber-300 font-bold">[C] 고객 DB:</span> "OO님 주문이 출고되었습니다" 무료 SMS</div>
              </div>
              <p className="text-[11px] text-slate-400">
                <strong className="text-white">실제 효과:</strong> 창고 직원에게 매출 시트 노출 원천 차단 + 오배송 0건
              </p>
            </div>

            {/* 2. B2B / 영업·회계 */}
            <div className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl p-5 space-y-3 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-2 bg-indigo-500/20 text-indigo-300 rounded-xl">
                    <Building2 className="w-4 h-4" />
                  </span>
                  <h3 className="font-extrabold text-sm sm:text-base text-white">2. B2B·에이전시: 수주 ➔ 회계원장 ➔ 입금안내</h3>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded-md">미수금 누락 0%</span>
              </div>
              <div className="text-xs space-y-1.5 text-slate-300 bg-black/30 p-3 rounded-xl font-mono leading-relaxed">
                <div>• <span className="text-indigo-400 font-bold">[A] 영업 수주대장:</span> 영업팀 계약 체결 및 발주 품목 입력</div>
                <div className="text-[11px] text-indigo-300 pl-3">↳ 공급가액·세액(10%)·마진율 자동 계산 후 회계 원장 전송</div>
                <div>• <span className="text-teal-400 font-bold">[B] 회계 미수금원장:</span> 입금 기한별 정산 대장 기입 (영업팀 차단)</div>
                <div className="text-[11px] text-emerald-400 pl-3">↳ 결제일 D-3일 전 거래처 경리 스마트폰으로 무료 알림 발송</div>
                <div>• <span className="text-amber-300 font-bold">[C] 거래처 경리DB:</span> "[OO상사] 세금계산서 입금 예정일 안내" SMS</div>
              </div>
              <p className="text-[11px] text-slate-400">
                <strong className="text-white">실제 효과:</strong> 부서 간 엑셀 대조 업무 0건 + 미수금 회수 속도 3배 개선
              </p>
            </div>

            {/* 3. 학원 / 병의원 / 상담 */}
            <div className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl p-5 space-y-3 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-2 bg-amber-500/20 text-amber-300 rounded-xl">
                    <GraduationCap className="w-4 h-4" />
                  </span>
                  <h3 className="font-extrabold text-sm sm:text-base text-white">3. 학원·병원: 상담예약 ➔ 강사배정 ➔ 노쇼방지</h3>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded-md">노쇼율 80% 급감</span>
              </div>
              <div className="text-xs space-y-1.5 text-slate-300 bg-black/30 p-3 rounded-xl font-mono leading-relaxed">
                <div>• <span className="text-amber-400 font-bold">[A] 상담 예약접수:</span> 웹 설문지/홈페이지 신청서 접수</div>
                <div className="text-[11px] text-amber-300 pl-3">↳ 희망 시간대 분석 후 담당 강사/의사별 빈 시간대 자동 배정</div>
                <div>• <span className="text-teal-400 font-bold">[B] 스케줄 캘린더:</span> 강사·의사별 진료/수업 일정 자동 기입</div>
                <div className="text-[11px] text-emerald-400 pl-3">↳ 배정 즉시 확정 안내 및 방문 D-1일 리마인드 무료 SMS</div>
                <div>• <span className="text-amber-300 font-bold">[C] 수강생·환자DB:</span> 약도·준비물이 포함된 확정 &amp; 리마인드 SMS</div>
              </div>
              <p className="text-[11px] text-slate-400">
                <strong className="text-white">실제 효과:</strong> 월 10만 원 예약 솔루션 구독료 0원 + 노쇼 손실 완전 차단
              </p>
            </div>

            {/* 4. 제조 / 현장 AS */}
            <div className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl p-5 space-y-3 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-2 bg-teal-500/20 text-teal-300 rounded-xl">
                    <Wrench className="w-4 h-4" />
                  </span>
                  <h3 className="font-extrabold text-sm sm:text-base text-white">4. 제조·현장AS: 고장접수 ➔ 부품출고 ➔ 기사출동</h3>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-teal-500/20 text-teal-300 rounded-md">전화 통화 0건</span>
              </div>
              <div className="text-xs space-y-1.5 text-slate-300 bg-black/30 p-3 rounded-xl font-mono leading-relaxed">
                <div>• <span className="text-teal-400 font-bold">[A] AS 고장접수:</span> 고객 장비 모델명 및 고장 증상 접수</div>
                <div className="text-[11px] text-teal-300 pl-3">↳ 수리 부품 본사 재고 자동 차감 &amp; 수리 이력 대장 이관</div>
                <div>• <span className="text-indigo-400 font-bold">[B] 부품재고 대장:</span> 본사 부품 재고 실시간 동기화</div>
                <div className="text-[11px] text-emerald-400 pl-3">↳ 지역 관할 현장 기사에게 고객 위치·증상 담긴 출동 SMS</div>
                <div>• <span className="text-amber-300 font-bold">[C] 기사·고객 DB:</span> 출동 지시 SMS &amp; 고객 방문 예정 알림</div>
              </div>
              <p className="text-[11px] text-slate-400">
                <strong className="text-white">실제 효과:</strong> 현장-창고-기사 간 전화 통화 0건 + 고객 AS 당일 즉시 출동
              </p>
            </div>
          </div>
        </section>
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
                        {uc.triggerType === "sidebar" && <PanelRight className="w-3.5 h-3.5 text-indigo-600" />}
                        <span className="font-semibold text-slate-700">{uc.triggerLabel}</span>
                      </div>
                    </div>

                    <div>
                      <h2 className="text-xl font-black text-slate-900 leading-snug tracking-tight break-keep">
                        {uc.title}
                      </h2>
                      <p className="text-xs text-slate-400 font-medium mt-1 break-keep">
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

                    {/* 이메일 프리뷰 (Gmail인 경우) */}
                    {uc.emailPreview && (
                      <div className="bg-slate-900 rounded-2xl p-4 text-white space-y-2 shadow-inner">
                        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                          <div className="flex items-center gap-1.5 text-sky-400 font-semibold">
                            <Mail className="w-3.5 h-3.5" />
                            <span>Gmail 발송 프리뷰 (수신: {uc.emailPreview.recipient})</span>
                          </div>
                          <span className="text-emerald-400 font-semibold">HTML 이메일</span>
                        </div>
                        <div className="bg-slate-800 rounded-xl p-3 text-xs font-sans text-slate-100 leading-relaxed border border-slate-700/60 space-y-1">
                          <div className="text-slate-300 font-bold border-b border-slate-700/70 pb-1 text-[11px]">
                            제목: {uc.emailPreview.subject}
                          </div>
                          <div className="whitespace-pre-line text-slate-200 text-xs pt-0.5">
                            {uc.emailPreview.body}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 사이드바 UI 프리뷰 (사이드바인 경우) */}
                    {uc.sidebarPreview && (
                      <div className="bg-slate-900 rounded-2xl p-4 text-white space-y-2 shadow-inner">
                        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                          <div className="flex items-center gap-1.5 text-purple-400 font-semibold">
                            <PanelRight className="w-3.5 h-3.5" />
                            <span>{uc.sidebarPreview.title}</span>
                          </div>
                          <span className="text-purple-300 font-semibold bg-purple-950/80 px-2 py-0.5 rounded border border-purple-800/60">
                            {uc.sidebarPreview.badge}
                          </span>
                        </div>
                        <div className="bg-slate-800 rounded-xl p-3 text-xs font-sans text-slate-100 leading-relaxed border border-slate-700/60 flex items-center gap-2">
                          <span className="text-slate-200">{uc.sidebarPreview.description}</span>
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

        {/* 하단 안내 배너: 기업 맞춤형 경량 ERP & AX 구축 연결 */}
        <section className="mt-16 bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 rounded-3xl p-8 sm:p-12 text-white text-center space-y-6 shadow-xl border border-teal-800/40">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-teal-400/20 text-teal-300 text-xs font-bold border border-teal-400/30">
            <Building2 className="w-3.5 h-3.5" />
            <span>기업 맞춤형 경량 ERP / MES 구축 &amp; 정부지원금 80~90% 매칭</span>
          </div>

          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight break-keep">
            레시피에 없는 우리 회사만의 특수한 엑셀 장부와 ERP 연동이 필요하신가요?
          </h2>

          <p className="text-xs sm:text-sm text-slate-300 max-w-2xl mx-auto leading-relaxed break-keep">
            33종의 실전 검증 레시피와 이지데스크 MCP 엔진을 조합하여, 전담 AX 컨설턴트가 <strong>1~2주 안에 대표님 사업장 전용 맞춤 시스템</strong>을 완성해 드립니다.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/enterprise"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm rounded-2xl transition-all shadow-md active:scale-95"
            >
              <span>🏢 기업 맞춤 AX 진단 &amp; 견적 신청하기</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/dashboard"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-white/10 hover:bg-white/15 text-white font-bold text-sm rounded-2xl transition-all border border-white/15"
            >
              <span>내 구글 시트로 직접 시작하기</span>
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
