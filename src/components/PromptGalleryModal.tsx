'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Search,
  Copy,
  Check,
  ArrowRight,
  Globe,
  Package,
  FileText,
  BarChart3,
  Send,
  HelpCircle,
  Tag,
  Zap,
} from 'lucide-react';

interface PromptTemplate {
  id: string;
  category: string;
  category_name: string;
  title: string;
  description: string;
  prompt_text: string;
  tags: string[];
  icon: string;
  is_featured: number;
}

interface PromptGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPrompt: (template: PromptTemplate) => void;
}

export default function PromptGalleryModal({
  isOpen,
  onClose,
  onSelectPrompt,
}: PromptGalleryModalProps) {
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    fetchPrompts();
  }, [isOpen]);

  const fetchPrompts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/prompts');
      const data = await res.json();
      if (data.success && data.prompts) {
        setPrompts(data.prompts);
      }
    } catch (err) {
      console.error('Failed to fetch prompt templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Globe':
        return <Globe className="w-5 h-5 text-indigo-500" />;
      case 'Package':
        return <Package className="w-5 h-5 text-amber-500" />;
      case 'FileText':
        return <FileText className="w-5 h-5 text-rose-500" />;
      case 'BarChart3':
        return <BarChart3 className="w-5 h-5 text-emerald-500" />;
      case 'Send':
        return <Send className="w-5 h-5 text-cyan-500" />;
      default:
        return <Sparkles className="w-5 h-5 text-purple-500" />;
    }
  };

  const categories = [
    { id: 'ALL', label: '전체 보기' },
    { id: 'WEBAPP', label: '🌐 대중 공개 웹앱' },
    { id: 'ORDER_INVENTORY', label: '📦 발주/재고 관리' },
    { id: 'AI_OCR', label: '📑 문서/영수증 OCR' },
    { id: 'REPORT_STATS', label: '📊 보고서/자동통계' },
    { id: 'DATA_CLEAN', label: '🔍 데이터 정제/검증' },
  ];

  const filtered = prompts.filter((p) => {
    const matchCat = selectedCategory === 'ALL' || p.category === selectedCategory;
    const q = searchQuery.toLowerCase();
    const matchSearch =
      !q ||
      p.title.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.prompt_text.toLowerCase().includes(q) ||
      p.tags.some((t) => t.toLowerCase().includes(q));
    return matchCat && matchSearch;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[88vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* 상단 헤더 */}
        <div className="p-6 pb-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-emerald-50/50 via-teal-50/30 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-slate-900">시트봇 추천 프롬프트 갤러리</h2>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  실무 검증 라이브러리
                </span>
              </div>
              <p className="text-xs font-medium text-slate-500 mt-0.5">
                실제 업무 현장에서 가장 유용한 자동화 시나리오를 선택하여 즉시 프로젝트를 생성하세요.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 필터 및 검색창 */}
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center gap-3 justify-between">
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  selectedCategory === cat.id
                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="프롬프트/키워드 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
        </div>

        {/* 프롬프트 카드 목록 그리드 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
              <Zap className="w-6 h-6 animate-bounce text-emerald-500" />
              <p className="text-xs font-bold">엄선된 실무 프롬프트를 불러오는 중...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-400 space-y-2">
              <HelpCircle className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs font-bold">조건에 맞는 추천 프롬프트가 없습니다.</p>
              <button
                onClick={() => {
                  setSelectedCategory('ALL');
                  setSearchQuery('');
                }}
                className="text-xs text-emerald-600 font-bold hover:underline"
              >
                전체 목록 보기
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filtered.map((item) => (
                <div
                  key={item.id}
                  className="bg-white border border-slate-200 hover:border-emerald-300 rounded-2xl p-4 flex flex-col justify-between hover:shadow-lg hover:shadow-emerald-500/5 transition-all group"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center group-hover:scale-105 transition-transform">
                          {getIcon(item.icon)}
                        </div>
                        <div>
                          <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded-md">
                            {item.category_name}
                          </span>
                        </div>
                      </div>
                      {item.is_featured === 1 && (
                        <span className="text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                          <Sparkles className="w-2.5 h-2.5 text-amber-500" />
                          BEST
                        </span>
                      )}
                    </div>

                    <div>
                      <h3 className="text-xs font-extrabold text-slate-900 group-hover:text-emerald-700 transition-colors">
                        {item.title}
                      </h3>
                      <p className="text-[11px] font-medium text-slate-500 mt-0.5 line-clamp-2">
                        {item.description}
                      </p>
                    </div>

                    <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl relative group-hover:bg-emerald-50/20 transition-colors">
                      <p className="text-[11px] text-slate-700 font-medium line-clamp-3 leading-relaxed">
                        &quot;{item.prompt_text}&quot;
                      </p>
                    </div>

                    {item.tags && item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {item.tags.map((t, idx) => (
                          <span
                            key={idx}
                            className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md flex items-center gap-0.5"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleCopy(item.id, item.prompt_text)}
                      className="px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      {copiedId === item.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-700">복사됨</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-slate-400" />
                          <span>프롬프트 복사</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => onSelectPrompt(item)}
                      className="px-3 py-1.5 text-[11px] font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm shadow-emerald-600/20 transition-all flex items-center gap-1 cursor-pointer group-hover:bg-emerald-600"
                    >
                      <span>이 프롬프트 적용</span>
                      <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 하단 안내 푸터 */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1 text-[11px]">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>프롬프트 선택 시 1단계 양식에 자동 입력되며 언제든지 요구사항을 자유롭게 수정할 수 있습니다.</span>
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-slate-600 font-bold hover:bg-slate-100 text-[11px] cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
