"use client";

import { apiFetch } from "@/lib/api";
import React, { useState, useMemo } from "react";
import {
  ShoppingBag,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  Clock,
  Sparkles,
  Shield,
  Layers,
  Search,
  RefreshCw,
  X,
  Save,
  Eye,
  EyeOff,
  Star,
  Users,
} from "lucide-react";

export interface MarketplaceCard {
  id?: number;
  key: string;
  title: string;
  icon: string;
  category: "all" | "store" | "crm" | "ai" | "exclusive";
  category_name?: string;
  description: string;
  badge?: string;
  author?: string;
  is_exclusive: number | boolean;
  allowed_emails?: string;
  is_installed_by_default: number | boolean;
  status: "ACTIVE" | "UPCOMING" | "INACTIVE";
  display_order: number;
  version: string;
  updated_at?: string;
}

interface AdminCardsCmsTabProps {
  cards: MarketplaceCard[];
  stats?: {
    total: number;
    active: number;
    upcoming: number;
    inactive: number;
    exclusive: number;
  };
  onRefresh: () => void;
}

const INITIAL_FORM: MarketplaceCard = {
  key: "",
  title: "",
  icon: "⚡",
  category: "ai",
  category_name: "AI 자동화",
  description: "",
  badge: "NEW",
  author: "시트봇 공식",
  is_exclusive: 0,
  allowed_emails: "",
  is_installed_by_default: 0,
  status: "ACTIVE",
  display_order: 10,
  version: "1.0.0",
};

export default function AdminCardsCmsTab({
  cards = [],
  stats,
  onRefresh,
}: AdminCardsCmsTabProps) {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // 모달 상태
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingCard, setEditingCard] = useState<MarketplaceCard | null>(null);
  const [formData, setFormData] = useState<MarketplaceCard>(INITIAL_FORM);
  const [saving, setSaving] = useState<boolean>(false);

  // 필터링 적용된 목록
  const filteredList = useMemo(() => {
    return cards.filter((item) => {
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      if (statusFilter !== "ALL" && item.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inTitle = item.title?.toLowerCase().includes(q);
        const inKey = item.key?.toLowerCase().includes(q);
        const inDesc = item.description?.toLowerCase().includes(q);
        const inBadge = item.badge?.toLowerCase().includes(q);
        return inTitle || inKey || inDesc || inBadge;
      }
      return true;
    });
  }, [cards, categoryFilter, statusFilter, searchQuery]);

  // 신규 등록 모달 열기
  const handleOpenCreateModal = () => {
    setEditingCard(null);
    setFormData({
      ...INITIAL_FORM,
      key: `cardCustom${Date.now().toString().slice(-4)}`,
    });
    setIsModalOpen(true);
  };

  // 수정 모달 열기
  const handleOpenEditModal = (card: MarketplaceCard) => {
    setEditingCard(card);
    setFormData({
      ...card,
      is_exclusive: card.is_exclusive ? 1 : 0,
      is_installed_by_default: card.is_installed_by_default ? 1 : 0,
    });
    setIsModalOpen(true);
  };

  // 카드 저장 (등록 또는 수정)
  const handleSaveCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.key.trim() || !formData.title.trim()) {
      alert("고유 키(key)와 카드 제목을 입력해 주세요.");
      return;
    }

    setSaving(true);
    try {
      if (editingCard?.id) {
        // 수정 (PUT)
        const res = await apiFetch("/api/admin/cards", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingCard.id,
            ...formData,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setIsModalOpen(false);
          onRefresh();
        } else {
          alert("수정 실패: " + (data.error || "오류"));
        }
      } else {
        // 신규 등록 (POST)
        const res = await apiFetch("/api/admin/cards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        const data = await res.json();
        if (data.success) {
          setIsModalOpen(false);
          onRefresh();
        } else {
          alert("등록 실패: " + (data.error || "오류"));
        }
      }
    } catch (err: any) {
      alert("저장 오류: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // 상태 빠른 변경 (ACTIVE / UPCOMING / INACTIVE)
  const handleToggleStatus = async (card: MarketplaceCard, newStatus: "ACTIVE" | "UPCOMING" | "INACTIVE") => {
    if (!card.id) return;
    try {
      const res = await apiFetch("/api/admin/cards", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: card.id, status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        onRefresh();
      } else {
        alert("상태 변경 실패: " + (data.error || "오류"));
      }
    } catch (err: any) {
      alert("오류: " + err.message);
    }
  };

  // 기본 설치 여부 토글
  const handleToggleDefaultInstall = async (card: MarketplaceCard) => {
    if (!card.id) return;
    const currentVal = Boolean(card.is_installed_by_default);
    try {
      const res = await apiFetch("/api/admin/cards", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: card.id, is_installed_by_default: currentVal ? 0 : 1 }),
      });
      const data = await res.json();
      if (data.success) {
        onRefresh();
      }
    } catch (err: any) {
      alert("오류: " + err.message);
    }
  };

  // 삭제(소프트 삭제)
  const handleDeleteCard = async (card: MarketplaceCard) => {
    if (!card.id) return;
    if (!confirm(`[${card.title}] 카드를 마켓플레이스에서 삭제하시겠습니까?`)) return;

    try {
      const res = await apiFetch(`/api/admin/cards?id=${card.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        onRefresh();
      } else {
        alert("삭제 실패: " + (data.error || "오류"));
      }
    } catch (err: any) {
      alert("오류: " + err.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* 상단 4종 KPI 통계 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold text-slate-500">마켓플레이스 총 카드</span>
            <ShoppingBag className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900">
            {stats?.total ?? cards.length}
            <span className="text-xs font-normal text-slate-400 ml-1">종</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold text-slate-500">정식 출시 (활성)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-700">
            {stats?.active ?? cards.filter((c) => c.status === "ACTIVE").length}
            <span className="text-xs font-normal text-slate-400 ml-1">종</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold text-slate-500">출시 준비중 (사전수요)</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-600">
            {stats?.upcoming ?? cards.filter((c) => c.status === "UPCOMING").length}
            <span className="text-xs font-normal text-slate-400 ml-1">종</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold text-slate-500">VIP 맞춤 전용</span>
            <Shield className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-purple-700">
            {stats?.exclusive ?? cards.filter((c) => Boolean(c.is_exclusive)).length}
            <span className="text-xs font-normal text-slate-400 ml-1">종</span>
          </div>
        </div>
      </div>

      {/* 필터, 검색 및 [새 카드 등록] 액션 바 */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* 카테고리 필터 */}
          <div className="flex rounded-xl bg-slate-100 p-0.5 text-xs font-bold overflow-x-auto">
            <button
              onClick={() => setCategoryFilter("all")}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
                categoryFilter === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              전체 보기
            </button>
            <button
              onClick={() => setCategoryFilter("store")}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
                categoryFilter === "store" ? "bg-white text-emerald-700 shadow-xs" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              🏪 매장·정산
            </button>
            <button
              onClick={() => setCategoryFilter("crm")}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
                categoryFilter === "crm" ? "bg-white text-indigo-700 shadow-xs" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              👥 고객·영업
            </button>
            <button
              onClick={() => setCategoryFilter("ai")}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
                categoryFilter === "ai" ? "bg-white text-purple-700 shadow-xs" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              🤖 AI 자동화
            </button>
            <button
              onClick={() => setCategoryFilter("exclusive")}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
                categoryFilter === "exclusive" ? "bg-white text-amber-700 shadow-xs" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              👑 나만의 맞춤
            </button>
          </div>

          {/* 상태 필터 */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-700 outline-none focus:border-indigo-500"
          >
            <option value="ALL">전체 상태</option>
            <option value="ACTIVE">정식 출시 (ACTIVE)</option>
            <option value="UPCOMING">출시 준비 (UPCOMING)</option>
            <option value="INACTIVE">비활성 (INACTIVE)</option>
          </select>
        </div>

        {/* 검색 & [새 카드 등록] 버튼 */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-56">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="카드명, key, 설명 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-medium"
            />
          </div>

          <button
            onClick={onRefresh}
            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors"
            title="새로고침"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>새 카드 등록</span>
          </button>
        </div>
      </div>

      {/* 카드 테이블 목록 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <span className="text-xs font-bold text-slate-700">
            등록된 마켓플레이스 카드 CMS 대장
          </span>
          <span className="text-xs text-slate-400">
            총 {filteredList.length}종 표시 (전체 {cards.length}종)
          </span>
        </div>

        {filteredList.length === 0 ? (
          <div className="p-16 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
            <ShoppingBag className="w-8 h-8 text-slate-300" />
            <p className="font-bold text-slate-600">등록된 마켓플레이스 카드가 없습니다.</p>
            <p className="text-[11px] text-slate-400">
              우측 상단의 [✨ 새 카드 등록] 버튼을 눌러 모바일 앱에 노출될 새로운 카드를 즉시 배포해 보세요.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">순서</th>
                  <th className="py-3 px-4 min-w-[220px]">카드 정보</th>
                  <th className="py-3 px-4 w-28">카테고리</th>
                  <th className="py-3 px-4 w-24">기본 설치</th>
                  <th className="py-3 px-4 w-32">서비스 상태</th>
                  <th className="py-3 px-4 min-w-[180px]">전용 권한 / 배지</th>
                  <th className="py-3 px-4 w-20 text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredList.map((card, idx) => (
                  <tr key={card.id || card.key} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-400">
                      {card.display_order ?? idx + 1}
                    </td>

                    {/* 카드 명 & 설명 */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl p-2 bg-slate-100 rounded-xl leading-none flex items-center justify-center">
                          {card.icon || "⚡"}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">
                              {card.title}
                            </span>
                            {card.badge && (
                              <span className="px-1.5 py-0.5 text-[10px] font-black rounded bg-amber-100 text-amber-800">
                                {card.badge}
                              </span>
                            )}
                            <span className="text-[10px] font-mono text-slate-400">
                              v{card.version || "1.0.0"}
                            </span>
                          </div>
                          <div className="font-mono text-[10px] text-indigo-600 mt-0.5">
                            {card.key}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                            {card.description}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* 카테고리 */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="inline-block px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-700">
                        {card.category_name || card.category}
                      </span>
                    </td>

                    {/* 기본 설치 토글 */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleDefaultInstall(card)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-black transition-all ${
                          Boolean(card.is_installed_by_default)
                            ? "bg-indigo-100 text-indigo-800 border border-indigo-200"
                            : "bg-slate-100 text-slate-400 border border-slate-200"
                        }`}
                        title="클릭하여 기본 설치 여부 토글"
                      >
                        {Boolean(card.is_installed_by_default) ? "기본 활성" : "미설치"}
                      </button>
                    </td>

                    {/* 상태 (ACTIVE / UPCOMING / INACTIVE) */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <select
                        value={card.status}
                        onChange={(e) =>
                          handleToggleStatus(card, e.target.value as "ACTIVE" | "UPCOMING" | "INACTIVE")
                        }
                        className={`text-[11px] font-bold rounded-lg px-2.5 py-1.5 border outline-none cursor-pointer ${
                          card.status === "ACTIVE"
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                            : card.status === "UPCOMING"
                            ? "bg-amber-50 text-amber-800 border-amber-300"
                            : "bg-slate-100 text-slate-500 border-slate-300"
                        }`}
                      >
                        <option value="ACTIVE">✅ 정식 출시 (ACTIVE)</option>
                        <option value="UPCOMING">🔔 출시 준비중 (UPCOMING)</option>
                        <option value="INACTIVE">⛔ 비활성 (INACTIVE)</option>
                      </select>
                    </td>

                    {/* 전용 권한 / 이메일 */}
                    <td className="py-3.5 px-4">
                      {Boolean(card.is_exclusive) ? (
                        <div className="space-y-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-purple-100 text-purple-800">
                            <Shield className="w-3 h-3 text-purple-600" />
                            VIP 전용 카드
                          </span>
                          {card.allowed_emails && (
                            <p className="text-[10px] font-mono text-slate-500 truncate max-w-[200px]" title={card.allowed_emails}>
                              {card.allowed_emails}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 font-medium">전체 회원 공개</span>
                      )}
                    </td>

                    {/* 수정 / 삭제 */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenEditModal(card)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="카드 수정"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteCard(card)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="카드 삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 등록 및 수정 모달 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-extrabold text-slate-800">
                  {editingCard ? "마켓플레이스 카드 수정" : "새 마켓플레이스 카드 등록"}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCard} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* 기본 정보: 고유 key, 제목, 아이콘 */}
              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-1">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    아이콘
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={4}
                    value={formData.icon}
                    onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                    className="w-full text-center text-lg p-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-bold"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    카드 제목
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="예: 스마트 실시간 재고 관리"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-bold text-slate-800"
                  />
                </div>
              </div>

              {/* 고유 식별 키 (key) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  카드 고유 키 (Unique Key - 영문 카멜케이스)
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: cardInventorySync"
                  value={formData.key}
                  onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                  className="w-full text-xs font-mono p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 text-indigo-700 font-bold"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  모바일 앱과 시트봇 코디네이터에서 이 카드를 식별하는 고유 ID입니다.
                </span>
              </div>

              {/* 카테고리 & 카테고리명 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    카테고리 구분
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => {
                      const cat = e.target.value as any;
                      const catName =
                        cat === "store"
                          ? "매장 · 정산"
                          : cat === "crm"
                          ? "고객 · 영업"
                          : cat === "exclusive"
                          ? "나만의 맞춤 카드"
                          : "AI 자동화";
                      setFormData({ ...formData, category: cat, category_name: catName });
                    }}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-bold text-slate-700"
                  >
                    <option value="store">🏪 매장 · 정산 (store)</option>
                    <option value="crm">👥 고객 · 영업 (crm)</option>
                    <option value="ai">🤖 AI 자동화 (ai)</option>
                    <option value="exclusive">👑 나만의 맞춤 카드 (exclusive)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    카테고리 표시명
                  </label>
                  <input
                    type="text"
                    value={formData.category_name}
                    onChange={(e) => setFormData({ ...formData, category_name: e.target.value })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-bold text-slate-700"
                  />
                </div>
              </div>

              {/* 카드 설명 */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  카드 상세 설명 (2~3줄)
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="카드의 핵심 기능과 사용자 혜택을 명확하게 설명해 주세요."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 leading-relaxed font-normal"
                />
              </div>

              {/* 배지, 버전, 표시 순서 */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    배지 (선택)
                  </label>
                  <input
                    type="text"
                    placeholder="NEW, 인기, 추천"
                    value={formData.badge || ""}
                    onChange={(e) => setFormData({ ...formData, badge: e.target.value })}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    버전
                  </label>
                  <input
                    type="text"
                    value={formData.version}
                    onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                    className="w-full text-xs font-mono p-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    정렬 순서
                  </label>
                  <input
                    type="number"
                    value={formData.display_order}
                    onChange={(e) => setFormData({ ...formData, display_order: Number(e.target.value) })}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-semibold"
                  />
                </div>
              </div>

              {/* 서비스 상태 & 기본 설치 여부 */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    서비스 상태
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-bold text-slate-700"
                  >
                    <option value="ACTIVE">✅ 정식 출시 (ACTIVE)</option>
                    <option value="UPCOMING">🔔 출시 준비중 (UPCOMING)</option>
                    <option value="INACTIVE">⛔ 비활성 (INACTIVE)</option>
                  </select>
                </div>
                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(formData.is_installed_by_default)}
                      onChange={(e) =>
                        setFormData({ ...formData, is_installed_by_default: e.target.checked ? 1 : 0 })
                      }
                      className="rounded text-indigo-600"
                    />
                    <span className="text-xs font-bold text-slate-700">
                      신규 회원 기본 설치
                    </span>
                  </label>
                </div>
              </div>

              {/* VIP 전용 카드 설정 */}
              <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-200 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(formData.is_exclusive)}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setFormData({
                        ...formData,
                        is_exclusive: checked ? 1 : 0,
                        category: checked ? "exclusive" : formData.category,
                        category_name: checked ? "나만의 맞춤 카드" : formData.category_name,
                      });
                    }}
                    className="rounded text-purple-600"
                  />
                  <span className="text-xs font-black text-purple-900 flex items-center gap-1">
                    <Shield className="w-3.5 h-3.5 text-purple-600" />
                    특정 VIP 고객 전용 프라이빗 카드 설정
                  </span>
                </label>

                {Boolean(formData.is_exclusive) && (
                  <div className="pt-1">
                    <label className="block text-[10px] font-bold text-purple-800 mb-1">
                      접근 허용 이메일 목록 (쉼표 구분)
                    </label>
                    <input
                      type="text"
                      placeholder="chachogreat@gmail.com, ceo@client.com"
                      value={formData.allowed_emails || ""}
                      onChange={(e) => setFormData({ ...formData, allowed_emails: e.target.value })}
                      className="w-full text-xs font-mono p-2 bg-white border border-purple-300 rounded-lg outline-none focus:border-purple-500 text-purple-900"
                    />
                  </div>
                )}
              </div>

              {/* 버튼 그룹 */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm flex items-center gap-1.5 transition-all"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? "저장 중..." : editingCard ? "수정 완료" : "카드 등록"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
