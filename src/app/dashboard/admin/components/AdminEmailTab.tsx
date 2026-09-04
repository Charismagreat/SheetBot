"use client";

import React from "react";
import {
  Mail,
  Sparkles,
  Globe,
  Layers,
  AtSign,
  Key,
  Eye,
  EyeOff,
  Save,
  Send,
} from "lucide-react";
import { AdminSmtpSettings } from "@/lib/admin-email-types";

interface AdminEmailTabProps {
  smtpSettings: AdminSmtpSettings;
  onSettingsChange: (settings: AdminSmtpSettings) => void;
  saving: boolean;
  showPass: boolean;
  onToggleShowPass: () => void;
  testEmailInput: string;
  onTestEmailInputChange: (value: string) => void;
  sendingTest: boolean;
  onSave: (e: React.FormEvent) => void;
  onSendTest: () => void;
}

export default function AdminEmailTab({
  smtpSettings,
  onSettingsChange,
  saving,
  showPass,
  onToggleShowPass,
  testEmailInput,
  onTestEmailInputChange,
  sendingTest,
  onSave,
  onSendTest,
}: AdminEmailTabProps) {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* 상단 헤더 카드 */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-2xs shrink-0 mt-0.5">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              발송 메일 SMTP 계정 설정
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              직원의 모바일 명함 전송이나 시스템 안내 메일 발송 시 활용될 정식 SMTP 발송 메일 서버를 등록합니다.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 font-bold text-xs rounded-lg border border-emerald-200 shadow-2xs">
            오직 DB 연동
          </span>
        </div>
      </div>

      {/* G메일 발송 계정 연동 가이드 카드 */}
      <div className="p-6 rounded-2xl bg-sky-50/60 border border-sky-200/80 text-sky-900 space-y-3 shadow-xs">
        <div className="flex items-center gap-2 text-sky-800 font-bold text-xs">
          <Sparkles className="w-4 h-4 text-sky-600" />
          <span>G메일 발송 계정 연동 가이드</span>
        </div>
        <p className="text-xs text-sky-700">
          본 시스템은 안정적인 연동을 위해 <strong>구글(Gmail)</strong> 서비스를 기본 권장합니다.
        </p>
        <ol className="text-xs space-y-1.5 text-sky-800/90 pl-1 leading-relaxed">
          <li>1. 사용할 구글 계정으로 로그인한 뒤, <strong>[Google 계정 관리 &gt; 보안]</strong> 메뉴로 이동합니다.</li>
          <li>2. 구글 로그인 영역에서 <strong>[2단계 인증]</strong>을 반드시 활성화합니다.</li>
          <li>3. 2단계 인증 상세 페이지 하단의 <strong>[앱 비밀번호]</strong> 메뉴로 이동합니다.</li>
          <li>4. 앱 이름을 <strong>EGDesk</strong> 등으로 적은 뒤 생성 버튼을 누르면 16자리의 영문 앱 비밀번호가 생성됩니다.</li>
          <li>5. 생성된 16자리 암호(공백 제외)를 하단의 <strong>발송 이메일 비밀번호</strong> 필드에 기입해 주세요.</li>
        </ol>
        <div className="text-[11px] text-sky-600 pt-1 font-medium border-t border-sky-200/60">
          ※ Gmail 연동 시 호스트는 <strong>[smtp.gmail.com]</strong>, 포트는 SSL 보안을 위해 <strong>[465]</strong>를 사용합니다.
        </div>
      </div>

      {/* SMTP 설정 입력 폼 카드 */}
      <form onSubmit={onSave} className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* 1. SMTP 서버 호스트 */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-slate-400" />
              <span>SMTP 서버 호스트</span>
            </label>
            <input
              type="text"
              required
              value={smtpSettings.host}
              onChange={(e) => onSettingsChange({ ...smtpSettings, host: e.target.value })}
              placeholder="smtp.gmail.com"
              className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-mono text-slate-700 bg-white"
            />
          </div>

          {/* 2. SMTP 서버 포트 */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <span>SMTP 서버 포트</span>
            </label>
            <input
              type="number"
              required
              value={smtpSettings.port}
              onChange={(e) => onSettingsChange({ ...smtpSettings, port: Number(e.target.value) })}
              placeholder="465"
              className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-mono text-slate-700 bg-white"
            />
          </div>

          {/* 3. 발송용 이메일 주소 (ID) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <AtSign className="w-3.5 h-3.5 text-slate-400" />
              <span>발송용 이메일 주소 (ID)</span>
            </label>
            <input
              type="email"
              required
              value={smtpSettings.user}
              onChange={(e) => onSettingsChange({ ...smtpSettings, user: e.target.value })}
              placeholder="example@gmail.com"
              className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-mono text-slate-700 bg-white"
            />
          </div>

          {/* 4. 발송 이메일 비밀번호 (앱 비밀번호) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-slate-400" />
              <span>발송 이메일 비밀번호 (앱 비밀번호)</span>
            </label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                required
                value={smtpSettings.pass}
                onChange={(e) => onSettingsChange({ ...smtpSettings, pass: e.target.value })}
                placeholder="구글 앱 비밀번호 16자리"
                className="w-full text-xs p-3 pr-10 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-mono text-slate-700 bg-white"
              />
              <button
                type="button"
                onClick={onToggleShowPass}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* 5. 발송자 표시 이름 */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">발송자 표시 명칭</label>
            <input
              type="text"
              value={smtpSettings.fromName}
              onChange={(e) => onSettingsChange({ ...smtpSettings, fromName: e.target.value })}
              placeholder="SheetBot 고객지원팀"
              className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600 text-slate-700 bg-white"
            />
          </div>

          {/* 6. 알림 수신 관리자 이메일 */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">알림 수신 관리자 이메일 (선택)</label>
            <input
              type="email"
              value={smtpSettings.adminEmail}
              onChange={(e) => onSettingsChange({ ...smtpSettings, adminEmail: e.target.value })}
              placeholder="미입력 시 발송용 이메일로 수신"
              className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600 text-slate-700 bg-white"
            />
          </div>
        </div>

        {/* 저장 버튼 */}
        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4 text-indigo-200" />
            <span>{saving ? "저장 중..." : "SMTP 설정 정보 저장"}</span>
          </button>
        </div>
      </form>

      {/* 실시간 메일 연동 테스트 카드 */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="space-y-0.5">
          <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Send className="w-4 h-4 text-indigo-600" />
            <span>실시간 메일 연동 테스트</span>
          </h4>
          <p className="text-[11px] text-slate-500">
            입력된 설정을 바탕으로 실제 메일이 전송되는지 확인하기 위해 본인의 또 다른 이메일 주소로 테스트 이메일을 발송해 봅니다.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-2.5">
          <input
            type="email"
            value={testEmailInput}
            onChange={(e) => onTestEmailInputChange(e.target.value)}
            placeholder="테스트 메일을 수신할 이메일 주소"
            className="w-full sm:flex-1 text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
          />
          <button
            type="button"
            onClick={onSendTest}
            disabled={sendingTest}
            className="w-full sm:w-auto px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-xs shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{sendingTest ? "메일 전송 중..." : "테스트 메일 전송"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
