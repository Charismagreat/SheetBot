"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Bot, ShieldCheck, Mail, Phone, MapPin, HelpCircle } from "lucide-react";
import { DEFAULT_FOOTER, FooterInfo } from "@/lib/default-footer";

export default function Footer() {
  const [footerInfo, setFooterInfo] = useState<FooterInfo>(DEFAULT_FOOTER);

  const fetchFooter = async () => {
    try {
      const res = await fetch("/api/footer");
      const data = await res.json();
      if (data.success && data.footer) {
        setFooterInfo(data.footer);
      }
    } catch (e) {
      console.warn("Failed to fetch dynamic footer, using default", e);
    }
  };

  useEffect(() => {
    fetchFooter();

    const handleUpdate = () => {
      fetchFooter();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("sheetbot-footer-updated", handleUpdate);
      return () => {
        window.removeEventListener("sheetbot-footer-updated", handleUpdate);
      };
    }
  }, []);

  return (
    <footer className="mt-auto border-t border-slate-200/80 bg-white text-slate-500 text-xs font-normal">
      {/* 상단 안내 & 링크 영역 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-8 border-b border-slate-100">
          {/* 1열: 서비스 브랜드 소개 */}
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-indigo-600 flex items-center justify-center text-white shadow-xs">
                <Bot className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-base text-slate-800 tracking-tight">SheetBot</span>
                <span className="px-1.5 py-0.2 bg-emerald-50 text-emerald-700 text-[10px] font-black rounded border border-emerald-200/60">
                  SaaS
                </span>
              </div>
            </div>
            <p className="text-slate-500 text-xs leading-relaxed max-w-md">
              {footerInfo.brand_description}
            </p>
            <div className="flex items-center gap-4 text-[11px] text-slate-400 pt-1">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>SSL 256-bit 안전 결제</span>
              </span>
              <span>•</span>
              <span>회원 데이터 격리(Multi-User Isolation)</span>
              <span>•</span>
              <span>KST 서울 기준 정산</span>
            </div>
          </div>

          {/* 2열: 서비스 바로가기 */}
          <div className="space-y-2.5">
            <h4 className="font-bold text-slate-800 text-xs">서비스 바로가기</h4>
            <ul className="space-y-1.5 text-slate-500">
              <li>
                <Link href="/dashboard" className="hover:text-slate-900 transition-colors">
                  내 자동화 워크스페이스
                </Link>
              </li>
              <li>
                <Link href="/dashboard/pricing" className="hover:text-slate-900 transition-colors">
                  토큰 충전 &amp; 요금제
                </Link>
              </li>
              <li>
                <Link href="/dashboard/settings" className="hover:text-slate-900 transition-colors">
                  AI 모델 환경 설정
                </Link>
              </li>
              <li>
                <Link href="/dashboard/ai-usage" className="hover:text-slate-900 transition-colors">
                  AI 사용량 관제
                </Link>
              </li>
            </ul>
          </div>

          {/* 3열: 가이드 & 고객 지원 */}
          <div className="space-y-2.5">
            <h4 className="font-bold text-slate-800 text-xs">가이드 &amp; 지원</h4>
            <ul className="space-y-1.5 text-slate-500">
              <li>
                <Link href="/guide" className="hover:text-slate-900 font-semibold text-emerald-700 transition-colors">
                  📖 사용법 &amp; 활용 가이드
                </Link>
              </li>
              <li>
                <Link href="/faq" className="hover:text-slate-900 transition-colors">
                  ❓ 자주 묻는 질문 (FAQ)
                </Link>
              </li>
              <li>
                <Link href="/reviews" className="hover:text-slate-900 transition-colors">
                  ⭐ 회원 사용 후기 게시판
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-slate-900 transition-colors">
                  💬 1:1 고객 문의 접수
                </Link>
              </li>
            </ul>
          </div>

          {/* 4열: 고객센터 안내 */}
          <div className="space-y-2.5">
            <h4 className="font-bold text-slate-800 text-xs">고객 지원 센터</h4>
            <div className="space-y-1.5 text-slate-500">
              <div className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{footerInfo.cs_email}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{footerInfo.cs_phone}</span>
              </div>
              <div className="flex items-center gap-1.5 text-amber-700 font-medium pt-1">
                <HelpCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>{footerInfo.easybot_info}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 하단: 사업자등록정보 및 법적 고지 */}
        <div className="pt-6 space-y-3 text-[11px] text-slate-400 leading-relaxed">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span><strong>상호명:</strong> {footerInfo.company_name}</span>
            <span>|</span>
            <span><strong>대표자:</strong> {footerInfo.ceo_name}</span>
            <span>|</span>
            <span><strong>사업자등록번호:</strong> {footerInfo.biz_number}</span>
            <span>|</span>
            <span><strong>통신판매업신고:</strong> {footerInfo.mail_order_biz_number}</span>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3 text-slate-400" />
              <span><strong>주소:</strong> {footerInfo.address}</span>
            </span>
            <span>|</span>
            <span><strong>개인정보보호책임자:</strong> {footerInfo.privacy_manager}</span>
            <span>|</span>
            <span><strong>호스팅 및 백엔드:</strong> {footerInfo.hosting_provider}</span>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-slate-100 text-slate-400">
            <p>{footerInfo.copyright_text}</p>
            <div className="flex items-center gap-4 text-[11px]">
              <span className="hover:text-slate-600 cursor-pointer">이용약관</span>
              <span>•</span>
              <span className="hover:text-slate-600 font-bold cursor-pointer text-slate-600">개인정보처리방침</span>
              <span>•</span>
              <span className="hover:text-slate-600 cursor-pointer">전자금융거래 이용약관</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
