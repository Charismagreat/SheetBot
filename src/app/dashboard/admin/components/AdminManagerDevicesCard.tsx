"use client";

import { apiFetch } from '@/lib/api';
import React, { useCallback, useEffect, useState } from "react";
import { QrCode, Smartphone, Trash2, RefreshCw, Plus, Download, Copy, Check, ExternalLink } from "lucide-react";
import Link from "next/link";
import QrCodeImage from "./QrCodeImage";

interface ManagerDevice {
  id: string;
  label: string;
  status: "PENDING" | "ACTIVE" | "EXPIRED" | "REVOKED";
  deviceModel: string;
  appVersion: string;
  pairedAt: string | null;
  lastSeenAt: string | null;
  online: boolean;
}

interface PairingInfo {
  id: string;
  label: string;
  pairToken: string;
  qrData: string;
  expiresAt: string;
}

/**
 * 매니저 휴대폰(인증번호 SMS 발송 전용 앱) 페어링/관리 카드.
 * - QR 은 1회용 토큰(10분)만 담고 있으며 스캔 시 기기 키로 교환됩니다.
 * - 여러 대 등록 가능 (먼저 큐를 가져가는 1대가 발송)
 */
export default function AdminManagerDevicesCard() {
  const [devices, setDevices] = useState<ManagerDevice[]>([]);
  const [label, setLabel] = useState("");
  const [pairing, setPairing] = useState<PairingInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/admin/manager-devices", { cache: "no-store" });
      const data = await res.json();
      if (data.success) setDevices(data.devices || []);
      else setError(data.error || "목록을 불러오지 못했습니다.");
    } catch {
      setError("목록을 불러오지 못했습니다.");
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000); // 온라인 상태 갱신 (관리자 화면 한정)
    return () => clearInterval(t);
  }, [load]);

  const [copiedUrl, setCopiedUrl] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState("/downloads/sheetbot-deposit-agent.apk");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const basePath = window.location.pathname.replace(/\/dashboard.*$/, "");
      setDownloadUrl(`${window.location.origin}${basePath}/downloads/sheetbot-deposit-agent.apk`);
    }
  }, []);

  const handleCopyDownloadUrl = async () => {
    try {
      await navigator.clipboard.writeText(downloadUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      alert("다운로드 주소 복사에 실패했습니다.");
    }
  };

  const issue = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch("/api/admin/manager-devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setPairing(data);
        setLabel("");
        load();
      } else {
        setError(data.error || "QR 발급에 실패했습니다.");
      }
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (d: ManagerDevice) => {
    if (!confirm(`[${d.label}] 기기를 폐기하시겠습니까? 이 기기는 더 이상 SMS를 발송할 수 없습니다.`)) return;
    await apiFetch(`/api/admin/manager-devices?id=${encodeURIComponent(d.id)}`, { method: "DELETE" });
    load();
  };

  const statusBadge = (d: ManagerDevice) => {
    if (d.status === "ACTIVE")
      return d.online ? (
        <span className="text-emerald-600 font-bold">● 온라인</span>
      ) : (
        <span className="text-amber-600 font-bold">● 오프라인</span>
      );
    if (d.status === "PENDING") return <span className="text-sky-600 font-bold">페어링 대기</span>;
    return <span className="text-slate-400 font-bold">만료</span>;
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-sky-600" />
            매니저 휴대폰 (인증번호 SMS 발송)
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">
            FileToSheet 인증번호 문자를 통신사망으로 발송하는 전용 앱입니다. 앱(cloud.sheetbot.agent.manager)을 설치한 뒤 QR로 페어링하세요.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={downloadUrl}
            download
            className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            title="SheetBot Manager APK 다운로드"
          >
            <Download className="w-3.5 h-3.5" />
            APK 다운로드
          </a>
          <button
            type="button"
            onClick={handleCopyDownloadUrl}
            className="px-2.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer border border-slate-200"
            title="스마트폰 전송용 APK 다운로드 주소 복사"
          >
            {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
            <span>{copiedUrl ? "복사됨!" : "주소 복사"}</span>
          </button>
          <Link
            href="/dashboard/deposit-agent?agent=manager"
            prefetch={false}
            className="px-2.5 py-2 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer border border-sky-200"
            title="전용 설치 및 상태 관제 센터 바로가기"
          >
            <ExternalLink className="w-3.5 h-3.5 text-sky-600" />
            <span>설치 센터</span>
          </Link>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="기기 이름 (예: 매니저 폰)"
            className="px-3 py-2 rounded-lg border border-slate-200 text-xs w-36"
          />
          <button
            type="button"
            onClick={issue}
            disabled={busy}
            className="px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center gap-1 disabled:opacity-50 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            페어링 QR 발급
          </button>
          <button
            type="button"
            onClick={load}
            className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer"
            aria-label="새로고침"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {error && <div className="text-xs text-red-600">{error}</div>}

      {pairing && (
        <div className="p-4 rounded-xl border border-sky-200 bg-sky-50/50 flex flex-col sm:flex-row items-center gap-4">
          <QrCodeImage
            value={pairing.qrData}
            size={220}
            alt="매니저 앱 페어링 QR"
            className="rounded-lg bg-white border border-slate-200"
          />
          <div className="text-xs text-slate-600 space-y-2 min-w-0">
            <div className="font-bold text-slate-800 flex items-center gap-1">
              <QrCode className="w-4 h-4 text-sky-600" />
              매니저 앱에서 &quot;QR 스캔하여 페어링&quot;을 누르고 이 QR을 스캔하세요
            </div>
            <div>1회용 · {new Date(pairing.expiresAt).toLocaleTimeString("ko-KR")}까지 유효 (스캔하면 즉시 사용 처리)</div>
            <div className="text-slate-500">QR 스캔이 어려우면 아래 주소를 앱의 입력창에 붙여넣으세요.</div>
            <code className="block break-all p-2 rounded bg-white border border-slate-200 text-[11px] select-all">
              {pairing.qrData}
            </code>
          </div>
        </div>
      )}

      <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl">
        {devices.length === 0 && <div className="p-4 text-xs text-slate-400">등록된 매니저 휴대폰이 없습니다.</div>}
        {devices.map((d) => (
          <div key={d.id} className="p-3 flex items-center justify-between gap-3 text-xs">
            <div className="min-w-0">
              <div className="font-bold text-slate-800 truncate">
                {d.label} <span className="font-normal text-slate-400">{d.deviceModel}</span>
              </div>
              <div className="text-slate-400">
                {d.appVersion && `v${d.appVersion} · `}
                {d.lastSeenAt ? `마지막 응답 ${new Date(d.lastSeenAt).toLocaleString("ko-KR")}` : "응답 없음"}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {statusBadge(d)}
              <button
                type="button"
                onClick={() => revoke(d)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                aria-label="기기 폐기"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
