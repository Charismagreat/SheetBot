"use client";

import { apiFetch } from "@/lib/api";
import React, { useState, useEffect, useMemo } from "react";
import {
  Plus,
  Edit2,
  Trash2,
  Sparkles,
  Search,
  CheckCircle2,
  XCircle,
  Copy,
  Clock,
  Smartphone,
  Zap,
  FileSpreadsheet,
  Bot,
  Tag,
  ArrowUpDown,
  ExternalLink,
  Layers,
} from "lucide-react";

interface PromptTemplate {
  id: string;
  uuid?: string;
  category: string;
  category_name: string;
  title: string;
  description: string;
  prompt_text: string;
  tags: string[];
  icon: string;
  is_featured: number | boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
  updated_by?: string;
}

const CATEGORY_OPTIONS = [
  { code: "LOGISTICS", name: "발주 / 입출고", defaultIcon: "Sparkles" },
  { code: "SALES", name: "매출 / 정산", defaultIcon: "Clock" },
  { code: "CUSTOMER", name: "고객 / 알림", defaultIcon: "Smartphone" },
  { code: "INVENTORY", name: "재고 / 자재", defaultIcon: "Zap" },
  { code: "WEBAPP", name: "웹앱 / 접수폼", defaultIcon: "FileSpreadsheet" },
  { code: "GENERAL", name: "일반 업무 자동화", defaultIcon: "Bot" },
];

const ICON_OPTIONS = [
  { name: "Sparkles", label: "반짝임 (Sparkles)" },
  { name: "Clock", label: "시계 (Clock)" },
  { name: "Smartphone", label: "스마트폰 (Smartphone)" },
  { name: "Zap", label: "번개 (Zap)" },
  { name: "FileSpreadsheet", label: "스프레드시트 (Sheet)" },
  { name: "Bot", label: "로봇 (Bot)" },
];

function renderIcon(iconName: string) {
  switch (iconName) {
    case "Clock":
      return <Clock className="w-4 h-4 text-amber-500" />;
    case "Smartphone":
      return <Smartphone className="w-4 h-4 text-sky-500" />;
    case "Zap":
      return <Zap className="w-4 h-4 text-rose-500" />;
    case "FileSpreadsheet":
      return <FileSpreadsheet className="w-4 h-4 text-emerald-500" />;
    case "Bot":
      return <Bot className="w-4 h-4 text-purple-500" />;
    case "Sparkles":
    default:
      return <Sparkles className="w-4 h-4 text-indigo-500" />;
  }
}

export default function AdminPromptsTab() {
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

  // 모달 상태
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingPrompt, setEditingPrompt] = useState<PromptTemplate | null>(null);
  const [formData, setFormData] = useState({
    category: "LOGISTICS",
    categoryName: "발주 / 입출고",
    title: "",
    description: "",
    promptText: "",
    tagsInput: "",
    icon: "Sparkles",
    isFeatured: true,
    sortOrder: 1,
  });
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [previewPromptText, setPreviewPromptText] = useState<string | null>(null);

  const fetchPrompts = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/prompts");
      const data = await res.json();
      if (data.success) {
        setPrompts(data.prompts || []);
      } else {
        console.warn("Failed to fetch prompts", data.error);
      }
    } catch (e) {
      console.error("Error fetching prompts", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrompts();
  }, []);

  const openCreateModal = () => {
    setEditingPrompt(null);
    setFormData({
      category: "LOGISTICS",
      categoryName: "발주 / 입출고",
      title: "",
      description: "",
      promptText: "",
      tagsInput: "자동화, 업무효율",
      icon: "Sparkles",
      isFeatured: true,
      sortOrder: (prompts.length + 1) * 10,
    });
    setModalOpen(true);
  };

  const openEditModal = (p: PromptTemplate) => {
    setEditingPrompt(p);
    setFormData({
      category: p.category,
      categoryName: p.category_name,
      title: p.title,
      description: p.description || "",
      promptText: p.prompt_text,
      tagsInput: Array.isArray(p.tags) ? p.tags.join(", ") : "",
      icon: p.icon || "Sparkles",
      isFeatured: Number(p.is_featured) === 1 || p.is_featured === true,
      sortOrder: Number(p.sort_order) || 10,
    });
    setModalOpen(true);
  };

  const handleCategoryChange = (code: string) => {
    const found = CATEGORY_OPTIONS.find((c) => c.code === code);
    setFormData((prev) => ({
      ...prev,
      category: code,
      categoryName: found ? found.name : prev.categoryName,
      icon: found ? found.defaultIcon : prev.icon,
    }));
  };

  const handleSavePrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.promptText.trim()) {
      alert("제목과 프롬프트 전문은 필수입니다.");
      return;
    }

    setSubmitting(true);
    try {
      const tags = formData.tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const payload = {
        category: formData.category,
        categoryName: formData.categoryName,
        title: formData.title.trim(),
        description: formData.description.trim(),
        promptText: formData.promptText.trim(),
        tags,
        icon: formData.icon,
        isFeatured: formData.isFeatured,
        sortOrder: Number(formData.sortOrder) || 10,
      };

      const method = editingPrompt ? "PUT" : "POST";
      const body = editingPrompt ? { id: editingPrompt.id, ...payload } : payload;

      const res = await apiFetch("/api/admin/prompts", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.success) {
        alert(data.message || "성공적으로 저장되었습니다.");
        setModalOpen(false);
        setEditingPrompt(null);
        fetchPrompts();
      } else {
        alert(data.error || "저장 실패");
      }
    } catch (e: any) {
      alert("오류 발생: " + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleFeatured = async (p: PromptTemplate) => {
    const nextFeatured = !(Number(p.is_featured) === 1 || p.is_featured === true);
    try {
      const res = await apiFetch("/api/admin/prompts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: p.id,
          isFeatured: nextFeatured,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPrompts((prev) =>
          prev.map((item) => (item.id === p.id ? { ...item, is_featured: nextFeatured ? 1 : 0 } : item))
        );
      } else {
        alert(data.error || "상태 변경 실패");
      }
    } catch (e: any) {
      alert("오류: " + e.message);
    }
  };

  const handleDeletePrompt = async (id: string) => {
    if (!confirm("정말 이 추천 프롬프트를 삭제하시겠습니까? (소프트 삭제 처리됩니다)")) return;
    try {
      const res = await apiFetch(`/api/admin/prompts?id=${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        alert("성공적으로 삭제되었습니다.");
        fetchPrompts();
      } else {
        alert(data.error || "삭제 실패");
      }
    } catch (e: any) {
      alert("오류: " + e.message);
    }
  };

  // 필터링된 프롬프트 목록
  const filteredPrompts = useMemo(() => {
    return prompts.filter((p) => {
      const matchCat = selectedCategory === "ALL" || p.category === selectedCategory;
      if (!matchCat) return false;
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      const matchTitle = p.title.toLowerCase().includes(q);
      const matchDesc = (p.description || "").toLowerCase().includes(q);
      const matchPrompt = p.prompt_text.toLowerCase().includes(q);
      const matchTags = Array.isArray(p.tags) && p.tags.some((t) => t.toLowerCase().includes(q));

      return matchTitle || matchDesc || matchPrompt || matchTags;
    });
  }, [prompts, selectedCategory, searchQuery]);

  return (
    <div className="space-y-6">
      {/* 상단 컨트롤 및 필터 바 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600" />
            <span>추천 프롬프트 갤러리 관리</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold border border-indigo-200/60">
              총 {prompts.length}개
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            사용자가 메인화면 및 프로젝트 생성 시 활용할 수 있는 검증된 업무 자동화 프롬프트 템플릿을 관리합니다.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 cursor-pointer shadow-xs transition-all"
        >
          <Plus className="w-4 h-4" /> 프롬프트 신규 등록
        </button>
      </div>

      {/* 카테고리 필터 칩 & 검색창 */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
        {/* 카테고리 칩 */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setSelectedCategory("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedCategory === "ALL"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            전체 ({prompts.length})
          </button>
          {CATEGORY_OPTIONS.map((cat) => {
            const count = prompts.filter((p) => p.category === cat.code).length;
            return (
              <button
                key={cat.code}
                onClick={() => setSelectedCategory(cat.code)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  selectedCategory === cat.code
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {cat.name} ({count})
              </button>
            );
          })}
        </div>

        {/* 검색 입력창 */}
        <div className="relative min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="제목, 설명, 태그, 프롬프트 검색..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>
      </div>

      {/* 테이블 목록 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-100">
              <tr>
                <th className="py-3 px-4 w-16 text-center">순서</th>
                <th className="py-3 px-4 w-28">카테고리</th>
                <th className="py-3 px-4">제목 &amp; 설명</th>
                <th className="py-3 px-4 w-40">태그</th>
                <th className="py-3 px-4 w-24 text-center">추천 여부</th>
                <th className="py-3 px-4 w-28 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    추천 프롬프트 목록을 불러오는 중입니다...
                  </td>
                </tr>
              ) : filteredPrompts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    {searchQuery ? "검색 조건과 일치하는 프롬프트가 없습니다." : "등록된 추천 프롬프트가 없습니다."}
                  </td>
                </tr>
              ) : (
                filteredPrompts.map((p) => {
                  const isFeatured = Number(p.is_featured) === 1 || p.is_featured === true;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 text-center font-mono text-slate-400">
                        {p.sort_order}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          {renderIcon(p.icon)}
                          <span className="font-bold text-slate-800 text-[11px]">{p.category_name}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <div className="font-bold text-slate-900 flex items-center gap-2">
                            <span>{p.title}</span>
                            {isFeatured && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-extrabold border border-amber-200">
                                Featured ⭐
                              </span>
                            )}
                          </div>
                          {p.description && (
                            <p className="text-slate-500 text-[11px] line-clamp-1">{p.description}</p>
                          )}
                          <div className="pt-1">
                            <button
                              onClick={() => setPreviewPromptText(p.prompt_text)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                            >
                              <ExternalLink className="w-3 h-3" /> 프롬프트 전문 보기
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1">
                          {Array.isArray(p.tags) && p.tags.length > 0 ? (
                            p.tags.map((t, idx) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium"
                              >
                                #{t}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-300 text-[10px]">-</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => handleToggleFeatured(p)}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold cursor-pointer transition-all ${
                            isFeatured
                              ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                          }`}
                        >
                          {isFeatured ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-amber-600" /> 추천 ON
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3 h-3 text-slate-400" /> OFF
                            </>
                          )}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => openEditModal(p)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            title="수정"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeletePrompt(p.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 프롬프트 전문 미리보기 모달 */}
      {previewPromptText && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-xl w-full p-6 space-y-4 border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" /> 자연어 프롬프트 전문 미리보기
              </h3>
              <button
                onClick={() => setPreviewPromptText(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed max-h-80 overflow-y-auto">
              {previewPromptText}
            </div>

            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(previewPromptText);
                  alert("프롬프트가 클립보드에 복사되었습니다.");
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-xs"
              >
                <Copy className="w-3.5 h-3.5" /> 프롬프트 복사
              </button>

              <button
                onClick={() => setPreviewPromptText(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 등록 / 수정 모달 */}
      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6 space-y-5 border border-slate-100 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span>{editingPrompt ? "추천 프롬프트 수정" : "추천 프롬프트 신규 등록"}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  사용자에게 유용한 업무 자동화 아이디어를 제공하는 프롬프트 카드를 설정합니다.
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePrompt} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 카테고리 선택 */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">카테고리</label>
                  <select
                    value={formData.category}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 카테고리 표시 이름 */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">카테고리 표시명</label>
                  <input
                    type="text"
                    value={formData.categoryName}
                    onChange={(e) => setFormData({ ...formData, categoryName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    placeholder="예: 발주 / 입출고"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* 아이콘 선택 */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">아이콘</label>
                  <select
                    value={formData.icon}
                    onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    {ICON_OPTIONS.map((icon) => (
                      <option key={icon.name} value={icon.name}>
                        {icon.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 정렬 순서 */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">정렬 순서 (오름차순)</label>
                  <input
                    type="number"
                    value={formData.sortOrder}
                    onChange={(e) => setFormData({ ...formData, sortOrder: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    placeholder="10"
                    required
                  />
                </div>

                {/* Featured 추천 체크 */}
                <div className="flex flex-col justify-end pb-2">
                  <label className="inline-flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isFeatured}
                      onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span>메인 추천 뱃지 부여 (Featured)</span>
                  </label>
                </div>
              </div>

              {/* 제목 */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">프롬프트 카드 제목</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  placeholder="예: 발주서 PDF·이미지 OCR 자동 분석 및 대장 접수"
                  required
                />
              </div>

              {/* 간단 설명 */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">카드 요약 설명</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  placeholder="예: 사이드바에서 발주서를 업로드하면 AI가 품목별로 1행씩 분리하여 최상단에 자동 기록합니다."
                />
              </div>

              {/* 프롬프트 전문 */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  자연어 프롬프트 전문 (실제 AI에게 전달되는 프롬프트)
                </label>
                <textarea
                  rows={4}
                  value={formData.promptText}
                  onChange={(e) => setFormData({ ...formData, promptText: e.target.value })}
                  className="w-full p-3 rounded-xl border border-slate-200 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 leading-relaxed"
                  placeholder="예: 사이드바 메뉴에서 PDF나 이미지 발주서를 업로드하면 자동으로 AI OCR 정밀 분석하여 '발주서 접수대장' 시트에 기록해줘..."
                  required
                />
              </div>

              {/* 태그 입력 */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  태그 목록 (쉼표로 구분)
                </label>
                <input
                  type="text"
                  value={formData.tagsInput}
                  onChange={(e) => setFormData({ ...formData, tagsInput: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  placeholder="예: 발주서, OCR, 다중품목, 자동기록"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-50 cursor-pointer shadow-xs transition-all"
                >
                  {submitting ? "저장 중..." : editingPrompt ? "수정사항 저장" : "새 프롬프트 등록"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
