"use client";

import React from "react";
import {
  Building2,
  Save,
  Share2,
  Plus,
  Trash2,
  FileText,
  Phone,
  Globe,
} from "lucide-react";
import { FooterInfo, SnsChannel } from "@/lib/default-footer";
import { SnsIcon } from "@/components/SnsIcons";

interface AdminFooterTabProps {
  footerForm: FooterInfo;
  onFooterFormChange: React.Dispatch<React.SetStateAction<FooterInfo>>;
  saving: boolean;
  onSave: (e: React.FormEvent) => void;
}

export default function AdminFooterTab({
  footerForm,
  onFooterFormChange,
  saving,
  onSave,
}: AdminFooterTabProps) {
  // SNS 채널 조작 함수들
  const handleAddSnsChannel = () => {
    const newChan: SnsChannel = {
      id: `sns_${Date.now()}`,
      type: "custom",
      name: "새 채널",
      url: "https://",
      enabled: true,
    };
    onFooterFormChange((prev) => ({
      ...prev,
      sns_channels: [...(prev.sns_channels || []), newChan],
    }));
  };

  const handleUpdateSnsChannel = (id: string, updates: Partial<SnsChannel>) => {
    onFooterFormChange((prev) => ({
      ...prev,
      sns_channels: (prev.sns_channels || []).map((ch) =>
        ch.id === id ? { ...ch, ...updates } : ch
      ),
    }));
  };

  const handleDeleteSnsChannel = (id: string) => {
    onFooterFormChange((prev) => ({
      ...prev,
      sns_channels: (prev.sns_channels || []).filter((ch) => ch.id !== id),
    }));
  };

  const getSnsIconSmall = (type: SnsChannel["type"]) => {
    return <SnsIcon type={type} className="w-3.5 h-3.5" />;
  };

  return (
    <form onSubmit={onSave} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-600" />
            <span>푸터 영역 회사 정보 및 공식 SNS 채널 관리</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            서비스 하단 푸터에 표시되는 사업자등록정보, 고객센터 연락처, 소개글 및 공식 SNS 채널(유튜브, 인스타 등)을 실시간 관리합니다.
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
        >
          <Save className="w-4 h-4 text-emerald-400" />
          <span>{saving ? "저장 중..." : "설정 저장 완료"}</span>
        </button>
      </div>

      {/* 공식 SNS 채널 관리 카드 */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Share2 className="w-4 h-4 text-indigo-600" />
              <span>공식 SNS 채널 바로가기 설정</span>
            </h4>
            <p className="text-[11px] text-slate-400">
              푸터 1열 브랜드 소개 하단에 노출될 소셜 미디어(SNS) 링크를 켜고 끄거나 새로 추가할 수 있습니다.
            </p>
          </div>

          <button
            type="button"
            onClick={handleAddSnsChannel}
            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl transition-all flex items-center gap-1 cursor-pointer border border-indigo-200/60"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ SNS 채널 추가</span>
          </button>
        </div>

        {(!footerForm.sns_channels || footerForm.sns_channels.length === 0) ? (
          <div className="p-8 text-center text-xs text-slate-400">
            등록된 SNS 채널이 없습니다. [+ SNS 채널 추가] 버튼을 눌러 채널을 등록해 보세요.
          </div>
        ) : (
          <div className="space-y-2.5">
            {footerForm.sns_channels.map((ch) => (
              <div
                key={ch.id}
                className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  ch.enabled
                    ? "bg-slate-50/70 border-slate-200"
                    : "bg-slate-100/50 border-slate-200 opacity-60"
                }`}
              >
                <div className="flex items-center gap-2.5 flex-1">
                  <span className="p-2 rounded-lg bg-white border border-slate-200 shadow-2xs shrink-0">
                    {getSnsIconSmall(ch.type)}
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-1">
                    {/* 채널 종류 */}
                    <select
                      value={ch.type}
                      onChange={(e) =>
                        handleUpdateSnsChannel(ch.id, {
                          type: e.target.value as SnsChannel["type"],
                        })
                      }
                      className="text-xs p-2 rounded-lg border border-slate-200 bg-white"
                    >
                      <option value="youtube">유튜브 (YouTube)</option>
                      <option value="instagram">인스타그램 (Instagram)</option>
                      <option value="blog">블로그 (Naver/Tistory)</option>
                      <option value="github">깃허브 (GitHub)</option>
                      <option value="kakao">카카오톡 채널</option>
                      <option value="twitter">X (트위터)</option>
                      <option value="custom">기타 웹사이트</option>
                    </select>

                    {/* 채널명 */}
                    <input
                      type="text"
                      value={ch.name}
                      onChange={(e) => handleUpdateSnsChannel(ch.id, { name: e.target.value })}
                      placeholder="채널 표시 이름"
                      className="text-xs p-2 rounded-lg border border-slate-200 bg-white font-bold text-slate-800"
                    />

                    {/* URL */}
                    <input
                      type="url"
                      value={ch.url}
                      onChange={(e) => handleUpdateSnsChannel(ch.id, { url: e.target.value })}
                      placeholder="https://..."
                      className="text-xs p-2 rounded-lg border border-slate-200 bg-white font-mono text-slate-600"
                    />
                  </div>
                </div>

                {/* 활성화 토글 & 삭제 */}
                <div className="flex items-center justify-end gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200">
                  <button
                    type="button"
                    onClick={() => handleUpdateSnsChannel(ch.id, { enabled: !ch.enabled })}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer inline-flex items-center gap-1 ${
                      ch.enabled
                        ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                        : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                    }`}
                  >
                    {ch.enabled ? "노출 ON" : "숨김 OFF"}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteSnsChannel(ch.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                    title="채널 삭제"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 좌측: 사업자 기본 정보 입력 카드 */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <h4 className="text-xs font-bold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-slate-500" />
            <span>사업자등록 및 법적 표기 정보</span>
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600">상호명 (법인명) *</label>
              <input
                type="text"
                required
                value={footerForm.company_name}
                onChange={(e) => onFooterFormChange((prev) => ({ ...prev, company_name: e.target.value }))}
                placeholder="예: 시트봇 (SheetBot Co., Ltd.)"
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600">대표자명 *</label>
              <input
                type="text"
                required
                value={footerForm.ceo_name}
                onChange={(e) => onFooterFormChange((prev) => ({ ...prev, ceo_name: e.target.value }))}
                placeholder="예: 홍길동 대표이사"
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600">사업자등록번호 *</label>
              <input
                type="text"
                required
                value={footerForm.biz_number}
                onChange={(e) => onFooterFormChange((prev) => ({ ...prev, biz_number: e.target.value }))}
                placeholder="예: 123-45-67890"
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 font-mono focus:outline-none focus:border-indigo-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600">통신판매업 신고번호 *</label>
              <input
                type="text"
                required
                value={footerForm.mail_order_biz_number}
                onChange={(e) => onFooterFormChange((prev) => ({ ...prev, mail_order_biz_number: e.target.value }))}
                placeholder="예: 제2026-서울강남-0000호"
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600">사업장 주소 *</label>
            <input
              type="text"
              required
              value={footerForm.address}
              onChange={(e) => onFooterFormChange((prev) => ({ ...prev, address: e.target.value }))}
              placeholder="예: 서울특별시 강남구 테헤란로 123 시트봇 빌딩 8층"
              className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600">개인정보보호책임자</label>
              <input
                type="text"
                value={footerForm.privacy_manager}
                onChange={(e) => onFooterFormChange((prev) => ({ ...prev, privacy_manager: e.target.value }))}
                placeholder="예: 관리자 (privacy@sheetbot.io)"
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600">호스팅 제공자</label>
              <input
                type="text"
                value={footerForm.hosting_provider}
                onChange={(e) => onFooterFormChange((prev) => ({ ...prev, hosting_provider: e.target.value }))}
                placeholder="예: EGDesk Cloud Infrastructure"
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600"
              />
            </div>
          </div>
        </div>

        {/* 우측: 고객센터 및 브랜드 소개 카드 */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <h4 className="text-xs font-bold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-1.5">
            <Phone className="w-4 h-4 text-slate-500" />
            <span>고객 지원 센터 및 안내 정보</span>
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600">고객센터 대표 이메일 *</label>
              <input
                type="email"
                required
                value={footerForm.cs_email}
                onChange={(e) => onFooterFormChange((prev) => ({ ...prev, cs_email: e.target.value }))}
                placeholder="예: support@sheetbot.io"
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600">고객센터 운영시간 / 연락처</label>
              <input
                type="text"
                value={footerForm.cs_phone}
                onChange={(e) => onFooterFormChange((prev) => ({ ...prev, cs_phone: e.target.value }))}
                placeholder="예: 평일 09:00 - 18:00 (점심 12-13)"
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600">실시간 봇 안내 문구</label>
            <input
              type="text"
              value={footerForm.easybot_info}
              onChange={(e) => onFooterFormChange((prev) => ({ ...prev, easybot_info: e.target.value }))}
              placeholder="예: 이지봇(EasyBot) 24시간 상담"
              className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600">서비스 브랜드 한 줄 소개</label>
            <textarea
              rows={2}
              value={footerForm.brand_description}
              onChange={(e) => onFooterFormChange((prev) => ({ ...prev, brand_description: e.target.value }))}
              placeholder="서비스 요약 소개글"
              className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600 resize-none leading-relaxed"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600">하단 저작권(Copyright) 문구</label>
            <input
              type="text"
              value={footerForm.copyright_text}
              onChange={(e) => onFooterFormChange((prev) => ({ ...prev, copyright_text: e.target.value }))}
              placeholder="예: © 2026 SheetBot Corp. All rights reserved."
              className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600"
            />
          </div>
        </div>
      </div>

      {/* 하단 푸터 실시간 미리보기 프리뷰 박스 */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between text-xs font-bold text-slate-700">
          <span className="flex items-center gap-1.5">
            <Globe className="w-4 h-4 text-emerald-600" />
            실시간 푸터 노출 미리보기 (Preview)
          </span>
          <span className="text-[11px] text-slate-400 font-normal">
            저장 시 모든 페이지 하단에 즉시 적용됩니다.
          </span>
        </div>

        <div className="p-5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="font-bold text-slate-900">{footerForm.company_name}</div>
              <p className="text-[11px] text-slate-500">{footerForm.brand_description}</p>
              <div className="text-[10px] text-slate-400 pt-1">
                고객센터: {footerForm.cs_email} | {footerForm.cs_phone}
              </div>
            </div>

            {/* 미리보기 내 SNS 버튼 (우측 배치) */}
            <div className="space-y-1.5 md:border-l md:border-slate-200 md:pl-4">
              <div className="text-[10px] font-bold text-slate-500">공식 SNS 채널 바로가기:</div>
              {footerForm.sns_channels?.filter((c) => c.enabled).length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {footerForm.sns_channels
                    ?.filter((c) => c.enabled)
                    .map((c) => (
                      <span
                        key={c.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[10px] font-bold text-slate-700 shadow-2xs"
                      >
                        {getSnsIconSmall(c.type)}
                        <span>{c.name}</span>
                      </span>
                    ))}
                </div>
              ) : (
                <div className="text-[10px] text-slate-400 italic">노출 중인 SNS 채널이 없습니다.</div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500 pt-2 border-t border-slate-200">
            <span>대표: {footerForm.ceo_name}</span>
            <span>|</span>
            <span>사업자번호: {footerForm.biz_number}</span>
            <span>|</span>
            <span>통신판매: {footerForm.mail_order_biz_number}</span>
            <span>|</span>
            <span>고객센터: {footerForm.cs_email} ({footerForm.cs_phone})</span>
          </div>
          <div className="text-[11px] text-slate-400">
            주소: {footerForm.address} | 개인정보책임자: {footerForm.privacy_manager}
          </div>
          <div className="text-[10px] text-slate-400 pt-1">
            {footerForm.copyright_text}
          </div>
        </div>
      </div>
    </form>
  );
}
