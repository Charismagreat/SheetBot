"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  ShoppingBag,
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  RefreshCw,
  X,
  ExternalLink,
  Copy,
  Check,
  AlertCircle,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
}

export default function QuoteWebappSettingsModal({
  isOpen,
  onClose,
  userEmail,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // userKey 생성 (Base64 인코딩)
  const userKey = userEmail ? btoa(userEmail).replace(/=/g, "") : "";
  const shareUrl = userKey ? `https://sheetbot.cloud/order/${userKey}` : "";

  // 프로필 데이터 로드
  useEffect(() => {
    if (isOpen && userEmail) {
      loadProfile();
    }
  }, [isOpen, userEmail]);

  const loadProfile = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await apiFetch(`/api/user/profile?email=${encodeURIComponent(userEmail)}`);
      const data = await res.json();
      if (data.success) {
        setBusinessName(data.businessName || "");
        setPhone(data.phone || "");
        if (data.imageUrl && data.imageUrl !== "https://sheetbot.cloud/favicon.svg") {
          setImageUrl(data.imageUrl);
        }
      }
    } catch (e: any) {
      setErrorMsg("프로필을 불러오는 중 오류가 발생했습니다: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  // 이미지 파일 선택 후 업로드
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("이미지 파일(PNG, JPG, WEBP)만 업로드할 수 있습니다.");
      return;
    }

    try {
      setUploading(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;
          const res = await apiFetch("/api/user/quote/image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: userEmail,
              imageBase64: base64Data,
              fileName: file.name,
            }),
          });

          const data = await res.json();
          if (data.success && data.imageUrl) {
            setImageUrl(data.imageUrl);
            setSuccessMsg("🎉 대표 이미지가 성공적으로 등록되었습니다!");
          } else {
            setErrorMsg(data.error || "이미지 업로드에 실패했습니다.");
          }
        } catch (err: any) {
          setErrorMsg("업로드 중 오류: " + err.message);
        } finally {
          setUploading(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        }
      };

      reader.onerror = () => {
        setErrorMsg("파일 읽기 실패");
        setUploading(false);
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      setErrorMsg("업로드 중 오류: " + err.message);
      setUploading(false);
    }
  };

  // 상호명/전화번호 저장
  const handleSaveInfo = async () => {
    if (!businessName.trim()) {
      alert("상호명을 입력해 주세요.");
      return;
    }

    try {
      setSaving(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const res = await apiFetch("/api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userEmail,
          businessName: businessName.trim(),
          phone: phone.trim(),
          imageUrl,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccessMsg("상호명과 프로필 정보가 저장되었습니다.");
      } else {
        setErrorMsg(data.error || "저장에 실패했습니다.");
      }
    } catch (err: any) {
      setErrorMsg("저장 중 오류: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-slate-200 relative max-h-[90vh] overflow-y-auto">
        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 모달 헤더 */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 shrink-0">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
              모바일 간편 주문 웹앱 &amp; 카톡 미리보기 설정
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                0초 실시간 연동
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              카카오톡이나 SNS로 주문 링크 공유 시 노출되는 대표 이미지와 상호명을 지정합니다.
            </p>
          </div>
        </div>

        {/* 상태 메시지 */}
        {successMsg && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs font-bold text-emerald-700">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs font-bold text-rose-700">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="space-y-6 text-left">
          {/* 1. 카카오톡 미리보기 카드 시뮬레이터 */}
          <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 text-white space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5 font-bold text-amber-400">
                <Sparkles className="w-3.5 h-3.5" />
                카카오톡 공유 카드 실시간 미리보기
              </span>
              <span className="text-[10px]">규격: 800×400 (2:1 권장)</span>
            </div>

            {/* 가상 카카오톡 카드 */}
            <div className="bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-md">
              <div className="relative w-full h-36 bg-slate-900 flex items-center justify-center overflow-hidden">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt="미리보기 이미지"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-500 gap-1">
                    <ImageIcon className="w-8 h-8 opacity-40" />
                    <span className="text-xs">대표 이미지를 등록해 주세요</span>
                  </div>
                )}
              </div>
              <div className="p-3 bg-slate-900/90 border-t border-slate-800/80">
                <div className="text-sm font-black text-white truncate">
                  [{businessName.trim() || "상호명 입력"}]
                </div>
                <div className="text-xs text-slate-400 truncate mt-0.5">
                  실시간 셀프 견적 및 간편 주문 • {businessName.trim() || "내 업체명"}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">sheetbot.cloud</div>
              </div>
            </div>
          </div>

          {/* 2. 대표 이미지 업로드 섹션 */}
          <div className="space-y-2">
            <label className="block text-xs font-black text-slate-800">
              📷 대표 썸네일 이미지 선택 (카톡 카드 상단)
            </label>
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/webp"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>이미지 업로드 중...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>{imageUrl ? "다른 사진으로 변경하기" : "사진 파일 선택 (업로드)"}</span>
                  </>
                )}
              </button>

              {imageUrl && (
                <button
                  type="button"
                  onClick={() => setImageUrl("")}
                  className="px-3 py-3 rounded-xl border border-slate-200 text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-all text-xs font-bold cursor-pointer"
                  title="기본 로고로 초기화"
                >
                  초기화
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              * JPG, PNG, WEBP 지원 (카카오톡 최적 비율: 가로형 2:1 또는 1:1 정사각형, 최대 10MB)
            </p>
          </div>

          {/* 3. 상호명 및 연락처 설정 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                상호명 (카톡 제목 &amp; 웹앱 헤더)
              </label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="예: chachogreat몰, 클린에어"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 outline-none focus:border-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                대표 연락처 (고객 전화문의 버튼)
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="예: 010-1234-5678"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          {/* 저장 버튼 */}
          <button
            type="button"
            onClick={handleSaveInfo}
            disabled={saving}
            className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {saving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>저장 중...</span>
              </>
            ) : (
              <span>상호명 &amp; 연락처 정보 저장</span>
            )}
          </button>

          {/* 4. 내 웹앱 링크 공유 & 바로가기 */}
          {shareUrl && (
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                🔗 내 전용 실시간 견적 &amp; 간편 주문 링크
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-600 truncate select-all"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>복사됨!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>링크 복사</span>
                    </>
                  )}
                </button>
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 shrink-0 cursor-pointer"
                  title="웹앱 직접 열어보기"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                <span>💡 모바일 앱(SheetBot Agent)에서도 언제든 사진과 상호명을 변경하실 수 있습니다.</span>
                <a
                  href="https://developers.kakao.com/tool/debugger/sharing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-600 hover:underline flex items-center gap-0.5 font-bold"
                >
                  카톡 캐시 초기화
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
