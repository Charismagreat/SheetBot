"use client";

import React, { useState } from "react";
import {
  Smartphone,
  Save,
  Bell,
  Radio,
  RefreshCw,
  MessageSquare,
  FileText,
  Coins,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { AdminSmsSettings } from "@/lib/admin-sms-types";

interface AdminSmsTabProps {
  smsSettings: AdminSmsSettings;
  onSettingsChange: (settings: AdminSmsSettings) => void;
  phoneDevices: any[];
  saving: boolean;
  sendingTest: boolean;
  onSave: (e: React.FormEvent) => void;
  onSendTest: () => void;
  onRefreshDevices: () => void;
  checkingDevice?: boolean;
  deviceCheckResult?: {
    online: boolean;
    status: string;
    message: string;
    checkedAt?: string;
  } | null;
  onCheckDevice?: () => void;
}

export default function AdminSmsTab({
  smsSettings,
  onSettingsChange,
  phoneDevices,
  saving,
  sendingTest,
  onSave,
  onSendTest,
  onRefreshDevices,
  checkingDevice = false,
  deviceCheckResult,
  onCheckDevice,
}: AdminSmsTabProps) {
  return (
    <form onSubmit={onSave} className="space-y-6 animate-fade-in">
      {/* 헤더 카드 */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 text-[11px] font-bold border border-sky-200/60 mb-1">
            <Smartphone className="w-3.5 h-3.5 text-sky-600" />
            <span>EGDesk 구글메시지(Google Messages) MCP 실시간 연동</span>
          </div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span>관리자 SMS 문자 알림 자동 발송 관제</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            1:1 고객 문의, 세금계산서 신청, 토큰 결제 등 주요 비즈니스 이벤트 발생 시 등록된 관리자 휴대폰으로 구글메시지 SMS를 자동 발송합니다.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSendTest}
            disabled={sendingTest}
            className="px-4 py-2.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-bold border border-sky-200 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0 shadow-2xs"
          >
            <Bell className="w-4 h-4 text-sky-600" />
            <span>{sendingTest ? "테스트 전송 중..." : "테스트 문자 발송"}</span>
          </button>

          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
          >
            <Save className="w-4 h-4 text-emerald-400" />
            <span>{saving ? "저장 중..." : "설정 저장 완료"}</span>
          </button>
        </div>
      </div>

      {/* 마스터 스위치 및 발송 전화번호 설정 카드 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 좌측: 발송용 관리자 번호 & 마스터 활성화 */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <h4 className="text-xs font-bold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-1.5">
            <Smartphone className="w-4 h-4 text-slate-500" />
            <span>수신용 관리자 전화번호 &amp; 마스터 제어</span>
          </h4>

          {/* 마스터 전체 알림 ON/OFF */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-slate-800">전체 SMS 알림 기능 활성화</div>
              <div className="text-[11px] text-slate-500">
                {smsSettings.enabled ? "현재 알림 기능이 작동 중입니다." : "모든 SMS 자동 발송이 중단됩니다."}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onSettingsChange({ ...smsSettings, enabled: !smsSettings.enabled })}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                smsSettings.enabled
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-slate-200 text-slate-600"
              }`}
            >
              {smsSettings.enabled ? "사용 중 (ON)" : "꺼짐 (OFF)"}
            </button>
          </div>

          {/* 관리자 전화번호 입력 */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>수신용 관리자 휴대폰 번호 *</span>
              <span className="text-[11px] font-normal text-slate-400">알림 문자를 받을 번호</span>
            </label>
            <input
              type="tel"
              required
              value={smsSettings.adminPhone}
              onChange={(e) => onSettingsChange({ ...smsSettings, adminPhone: e.target.value })}
              placeholder="예: 010-7216-5884"
              className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-600 font-bold text-slate-800 font-mono"
            />
            <p className="text-[11px] text-slate-400">
              * 이벤트 발생 시 위 번호로 자동 생성된 알림 문자가 즉시 전송됩니다.
            </p>
          </div>
        </div>

        {/* 우측: 페어링된 구글메시지 디바이스 상태 및 선택 */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Radio className="w-4 h-4 text-sky-600" />
              <span>발송용 Google Messages 디바이스</span>
            </h4>
            <div className="flex items-center gap-2">
              {onCheckDevice && (
                <button
                  type="button"
                  onClick={onCheckDevice}
                  disabled={checkingDevice}
                  className="text-[11px] font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200/80 px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-all shadow-2xs"
                >
                  <Activity className={`w-3 h-3 text-sky-600 ${checkingDevice ? "animate-spin" : ""}`} />
                  <span>{checkingDevice ? "상태 점검 중..." : "발송 가능 상태 점검"}</span>
                </button>
              )}
              <button
                type="button"
                onClick={onRefreshDevices}
                className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>기기 새로고침</span>
              </button>
            </div>
          </div>

          {/* 기기 실시간 정밀 헬스체크 결과 알림 배너 */}
          {deviceCheckResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 transition-all ${
                deviceCheckResult.online
                  ? "bg-emerald-50/80 border-emerald-200 text-emerald-900"
                  : "bg-rose-50/80 border-rose-200 text-rose-900"
              }`}
            >
              {deviceCheckResult.online ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-bold flex items-center justify-between gap-2">
                  <span>
                    {deviceCheckResult.online
                      ? "🟢 문자 발송 정상 (스마트폰 온라인 연결됨)"
                      : "🔴 발송 불가 (오프라인 / 이메일 자동 전환 발송 대기)"}
                  </span>
                  {deviceCheckResult.checkedAt && (
                    <span className="text-[10px] text-slate-400 font-normal">
                      확인: {deviceCheckResult.checkedAt}
                    </span>
                  )}
                </div>
                <div className="text-[11px] mt-0.5 opacity-90">
                  {deviceCheckResult.message}
                </div>
                {!deviceCheckResult.online && (
                  <div className="text-[10px] text-rose-600 font-medium mt-1 bg-rose-100/60 px-2 py-0.5 rounded">
                    * SMS 발송 실패 시 등록된 관리자 이메일(SMTP)로 즉시 긴급 알림이 자동 폴백 발송됩니다.
                  </div>
                )}
              </div>
            </div>
          )}

          {phoneDevices.length > 0 ? (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-sky-50/70 border border-sky-200/80 space-y-2 text-xs">
                {phoneDevices.map((dev: any) => (
                  <div key={dev.id} className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-800 flex items-center gap-1.5">
                        <span>{dev.label || "휴대폰 기기"}</span>
                        <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] rounded font-bold">
                          {dev.status === "paired" ? "● 페어링 연결됨" : dev.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        연결 번호: {dev.linked_phone || "010-7216-5884"} (ID: {dev.id})
                      </div>
                    </div>

                    <span className="text-[11px] font-bold text-sky-700 bg-white px-2.5 py-1 rounded-lg border border-sky-200">
                      기본 발송기기
                    </span>
                  </div>
                ))}
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600">발송 디바이스 ID</label>
                <input
                  type="text"
                  value={smsSettings.deviceId}
                  onChange={(e) => onSettingsChange({ ...smsSettings, deviceId: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-slate-50 font-mono text-slate-700"
                />
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
              <div className="font-bold">기본 디바이스 연동: {smsSettings.deviceId}</div>
              <p className="text-[11px] text-amber-700">
                EGDesk Phone MCP에 등록된 기기 ID({smsSettings.deviceId})를 사용하여 문자를 발송합니다.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 이벤트별 알림 발송 조건 설정 카드 */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <h4 className="text-xs font-bold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-1.5">
          <Bell className="w-4 h-4 text-indigo-600" />
          <span>이벤트별 자동 SMS 알림 활성화 설정</span>
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1. 1:1 고객 문의 */}
          <div className={`p-4 rounded-xl border transition-all ${smsSettings.notifyOnInquiry ? "bg-slate-50 border-indigo-200" : "bg-white border-slate-200 opacity-60"}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-indigo-600" />
                <span>1:1 고객 문의 접수</span>
              </div>
              <button
                type="button"
                onClick={() => onSettingsChange({ ...smsSettings, notifyOnInquiry: !smsSettings.notifyOnInquiry })}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                  smsSettings.notifyOnInquiry ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-600"
                }`}
              >
                {smsSettings.notifyOnInquiry ? "ON" : "OFF"}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              새로운 1:1 문의가 등록되면 작성자 이메일, 제목, 접수 시간을 관리자 휴대폰으로 즉시 전송합니다.
            </p>
          </div>

          {/* 2. 세금계산서 발행 신청 */}
          <div className={`p-4 rounded-xl border transition-all ${smsSettings.notifyOnTaxInvoice ? "bg-slate-50 border-emerald-200" : "bg-white border-slate-200 opacity-60"}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-emerald-600" />
                <span>세금계산서 신청 접수</span>
              </div>
              <button
                type="button"
                onClick={() => onSettingsChange({ ...smsSettings, notifyOnTaxInvoice: !smsSettings.notifyOnTaxInvoice })}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                  smsSettings.notifyOnTaxInvoice ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"
                }`}
              >
                {smsSettings.notifyOnTaxInvoice ? "ON" : "OFF"}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              기업 회원이 전자세금계산서 또는 현금영수증을 신청하면 신청 회사명과 신청 금액을 즉시 알립니다.
            </p>
          </div>

          {/* 3. 유료 토큰 결제 */}
          <div className={`p-4 rounded-xl border transition-all ${smsSettings.notifyOnPayment ? "bg-slate-50 border-amber-200" : "bg-white border-slate-200 opacity-60"}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-amber-500" />
                <span>유료 토큰 충전 결제</span>
              </div>
              <button
                type="button"
                onClick={() => onSettingsChange({ ...smsSettings, notifyOnPayment: !smsSettings.notifyOnPayment })}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                  smsSettings.notifyOnPayment ? "bg-amber-600 text-white" : "bg-slate-200 text-slate-600"
                }`}
              >
                {smsSettings.notifyOnPayment ? "ON" : "OFF"}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              회원이 Pro 요금제 또는 토큰 패키지 충전을 완료하면 결제 회원 및 충전 금액을 실시간 통보합니다.
            </p>
          </div>
        </div>
      </div>
    </form>
  );
}
