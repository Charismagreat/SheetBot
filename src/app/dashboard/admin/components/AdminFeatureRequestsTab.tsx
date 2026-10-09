"use client";

import { apiFetch } from "@/lib/api";
import React, { useState, useMemo } from "react";
import {
  Bell,
  Sparkles,
  Search,
  RefreshCw,
  Trash2,
  CheckCircle2,
  Clock,
  Code2,
  ChevronDown,
  Mail,
  Phone,
  MessageSquare,
  AlertCircle,
  Save,
} from "lucide-react";

export interface FeatureRequestItem {
  id: number;
  request_type: "RELEASE_NOTIFY" | "CUSTOM_FEATURE";
  card_key?: string;
  title: string;
  description?: string;
  contact: string;
  user_email?: string;
  status: "PENDING" | "IN_REVIEW" | "DEVELOPING" | "COMPLETED" | "REJECTED";
  admin_notes?: string;
  created_at: string;
  updated_at?: string;
  deleted_at?: string;
}

interface AdminFeatureRequestsTabProps {
  requests: FeatureRequestItem[];
  stats?: {
    total: number;
    pending: number;
    in_review: number;
    developing: number;
    completed: number;
    release_notify: number;
    custom_feature: number;
  };
  onRefresh: () => void;
}

export default function AdminFeatureRequestsTab({
  requests = [],
  stats,
  onRefresh,
}: AdminFeatureRequestsTabProps) {
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [editingNotesId, setEditingNotesId] = useState<number | null>(null);
  const [noteInputValue, setNoteInputValue] = useState<string>("");
  const [savingNote, setSavingNote] = useState<boolean>(false);
  const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null);

  // 필터링 적용된 목록
  const filteredList = useMemo(() => {
    return requests.filter((item) => {
      if (typeFilter !== "ALL" && item.request_type !== typeFilter) return false;
      if (statusFilter !== "ALL" && item.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inTitle = item.title?.toLowerCase().includes(q);
        const inDesc = item.description?.toLowerCase().includes(q);
        const inContact = item.contact?.toLowerCase().includes(q);
        const inEmail = item.user_email?.toLowerCase().includes(q);
        const inNotes = item.admin_notes?.toLowerCase().includes(q);
        return inTitle || inDesc || inContact || inEmail || inNotes;
      }
      return true;
    });
  }, [requests, typeFilter, statusFilter, searchQuery]);

  // 상태 변경 핸들러
  const handleStatusChange = async (id: number, newStatus: string) => {
    setUpdatingStatusId(id);
    try {
      const res = await apiFetch("/api/admin/feature-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        onRefresh();
      } else {
        alert("상태 변경 실패: " + (data.error || "오류"));
      }
    } catch (e: any) {
      alert("오류 발생: " + e.message);
    } finally {
      setUpdatingStatusId(null);
    }
  };

  // 메모 편집 시작
  const startEditNote = (item: FeatureRequestItem) => {
    setEditingNotesId(item.id);
    setNoteInputValue(item.admin_notes || "");
  };

  // 메모 저장
  const handleSaveNote = async (id: number) => {
    setSavingNote(true);
    try {
      const res = await apiFetch("/api/admin/feature-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, admin_notes: noteInputValue.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setEditingNotesId(null);
        onRefresh();
      } else {
        alert("메모 저장 실패: " + (data.error || "오류"));
      }
    } catch (e: any) {
      alert("오류 발생: " + e.message);
    } finally {
      setSavingNote(false);
    }
  };

  // 삭제(소프트 삭제)
  const handleDelete = async (id: number) => {
    if (!confirm("이 접수 내역을 삭제(소프트 삭제) 처리하시겠습니까?")) return;
    try {
      const res = await apiFetch(`/api/admin/feature-requests?id=${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        onRefresh();
      } else {
        alert("삭제 실패: " + (data.error || "오류"));
      }
    } catch (e: any) {
      alert("오류 발생: " + e.message);
    }
  };

  // 상태 배지 및 레이블 렌더러
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-500" />
            접수 대기
          </span>
        );
      case "IN_REVIEW":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-sky-50 text-sky-700 border border-sky-200">
            <AlertCircle className="w-3 h-3 text-sky-500" />
            수요 검토중
          </span>
        );
      case "DEVELOPING":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-purple-50 text-purple-700 border border-purple-200">
            <Code2 className="w-3 h-3 text-purple-500" />
            개발 착수중
          </span>
        );
      case "COMPLETED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            출시 / 제작완료
          </span>
        );
      case "REJECTED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-slate-100 text-slate-500 border border-slate-200">
            보류 / 미반영
          </span>
        );
      default:
        return <span className="text-slate-400">{status}</span>;
    }
  };

  return (
    <div className="space-y-4">
      {/* 상단 4종 KPI 통계 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold text-slate-500">총 신청 건수</span>
            <Sparkles className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900">
            {stats?.total ?? requests.length}
            <span className="text-xs font-normal text-slate-400 ml-1">건</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold text-slate-500">출시 알림 예약</span>
            <Bell className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-700">
            {stats?.release_notify ?? requests.filter((r) => r.request_type === "RELEASE_NOTIFY").length}
            <span className="text-xs font-normal text-slate-400 ml-1">건</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold text-slate-500">맞춤 기능 의뢰</span>
            <MessageSquare className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-purple-700">
            {stats?.custom_feature ?? requests.filter((r) => r.request_type === "CUSTOM_FEATURE").length}
            <span className="text-xs font-normal text-slate-400 ml-1">건</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold text-slate-500">검토 대기중</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-600">
            {stats?.pending ?? requests.filter((r) => r.status === "PENDING").length}
            <span className="text-xs font-normal text-slate-400 ml-1">건</span>
          </div>
        </div>
      </div>

      {/* 필터 및 검색 바 */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* 유형 필터 버튼 */}
          <div className="flex rounded-xl bg-slate-100 p-0.5 text-xs font-bold">
            <button
              onClick={() => setTypeFilter("ALL")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                typeFilter === "ALL" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              전체 보기
            </button>
            <button
              onClick={() => setTypeFilter("RELEASE_NOTIFY")}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all ${
                typeFilter === "RELEASE_NOTIFY"
                  ? "bg-white text-emerald-700 shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Bell className="w-3.5 h-3.5 text-emerald-600" />
              출시 알림 예약
            </button>
            <button
              onClick={() => setTypeFilter("CUSTOM_FEATURE")}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all ${
                typeFilter === "CUSTOM_FEATURE"
                  ? "bg-white text-purple-700 shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              맞춤 기능 의뢰
            </button>
          </div>

          {/* 상태 필터 드롭다운 */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-700 outline-none focus:border-indigo-500"
          >
            <option value="ALL">전체 상태</option>
            <option value="PENDING">접수 대기 (PENDING)</option>
            <option value="IN_REVIEW">검토중 (IN_REVIEW)</option>
            <option value="DEVELOPING">개발 착수 (DEVELOPING)</option>
            <option value="COMPLETED">출시/완료 (COMPLETED)</option>
            <option value="REJECTED">보류/미반영</option>
          </select>
        </div>

        {/* 검색창 & 새로고침 */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="제목, 연락처, 이메일 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-medium"
            />
          </div>
          <button
            onClick={onRefresh}
            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors"
            title="대장 새로고침"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 대장 테이블 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <span className="text-xs font-bold text-slate-700">
            사전 수요조사 및 맞춤 기능 의뢰 대장
          </span>
          <span className="text-xs text-slate-400">
            총 {filteredList.length}건 표시 (전체 {requests.length}건)
          </span>
        </div>

        {filteredList.length === 0 ? (
          <div className="p-16 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
            <Sparkles className="w-8 h-8 text-slate-300" />
            <p className="font-bold text-slate-600">접수된 수요조사 또는 의뢰 내역이 없습니다.</p>
            <p className="text-[11px] text-slate-400">
              스마트폰 앱 [🛍️ 카드 스토어]에서 고객이 출시 알림 또는 맞춤 의뢰를 신청하면 실시간으로 적재됩니다.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">ID</th>
                  <th className="py-3 px-4 w-32">구분</th>
                  <th className="py-3 px-4 min-w-[220px]">신청 기능 / 제목</th>
                  <th className="py-3 px-4 w-44">신청자 정보</th>
                  <th className="py-3 px-4 w-32">진행 상태</th>
                  <th className="py-3 px-4 min-w-[200px]">관리자 메모</th>
                  <th className="py-3 px-4 w-28">신청 일시</th>
                  <th className="py-3 px-4 w-16 text-right">삭제</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredList.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-400">
                      #{item.id}
                    </td>

                    {/* 구분 배지 */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {item.request_type === "RELEASE_NOTIFY" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <Bell className="w-3 h-3 text-emerald-600" />
                          출시 알림
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200">
                          <Sparkles className="w-3 h-3 text-purple-600" />
                          맞춤 제작
                        </span>
                      )}
                    </td>

                    {/* 제목 & 세부 설명 */}
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 leading-snug">
                        {item.title}
                      </div>
                      {item.card_key && (
                        <span className="text-[10px] font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded mt-1 inline-block">
                          {item.card_key}
                        </span>
                      )}
                      {item.description && (
                        <p className="text-[11px] text-slate-500 mt-1 whitespace-pre-wrap leading-relaxed line-clamp-3">
                          {item.description}
                        </p>
                      )}
                    </td>

                    {/* 신청자 정보 */}
                    <td className="py-3.5 px-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-slate-800 font-bold">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{item.contact}</span>
                        </div>
                        {item.user_email && (
                          <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                            <Mail className="w-3 h-3 text-slate-400" />
                            <span className="truncate max-w-[150px]" title={item.user_email}>
                              {item.user_email}
                            </span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* 진행 상태 드롭다운 */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="space-y-1">
                        {getStatusBadge(item.status)}
                        <div>
                          <select
                            value={item.status}
                            disabled={updatingStatusId === item.id}
                            onChange={(e) => handleStatusChange(item.id, e.target.value)}
                            className="mt-1 text-[11px] bg-white border border-slate-200 rounded-lg px-2 py-1 font-semibold text-slate-700 outline-none focus:border-indigo-500 cursor-pointer shadow-2xs"
                          >
                            <option value="PENDING">접수 대기</option>
                            <option value="IN_REVIEW">수요 검토중</option>
                            <option value="DEVELOPING">개발 착수</option>
                            <option value="COMPLETED">출시/완료</option>
                            <option value="REJECTED">보류/미반영</option>
                          </select>
                        </div>
                      </div>
                    </td>

                    {/* 관리자 메모 */}
                    <td className="py-3.5 px-4">
                      {editingNotesId === item.id ? (
                        <div className="space-y-1.5">
                          <textarea
                            rows={2}
                            value={noteInputValue}
                            onChange={(e) => setNoteInputValue(e.target.value)}
                            placeholder="관리자용 내부 메모 입력..."
                            className="w-full text-xs p-2 bg-slate-50 border border-indigo-300 rounded-lg outline-none font-normal"
                          />
                          <div className="flex items-center gap-1.5 justify-end">
                            <button
                              onClick={() => setEditingNotesId(null)}
                              className="px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-100 rounded"
                            >
                              취소
                            </button>
                            <button
                              onClick={() => handleSaveNote(item.id)}
                              disabled={savingNote}
                              className="px-2.5 py-1 text-[11px] font-bold bg-indigo-600 text-white rounded hover:bg-indigo-700 flex items-center gap-1"
                            >
                              <Save className="w-3 h-3" />
                              저장
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={() => startEditNote(item)}
                          className="cursor-pointer group p-1.5 rounded-lg hover:bg-indigo-50/50 transition-colors border border-transparent hover:border-indigo-100"
                          title="클릭하여 메모 작성/수정"
                        >
                          {item.admin_notes ? (
                            <p className="text-slate-700 text-xs whitespace-pre-wrap">
                              {item.admin_notes}
                            </p>
                          ) : (
                            <span className="text-slate-300 text-xs italic group-hover:text-indigo-500">
                              + 메모 추가...
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* 신청 일시 */}
                    <td className="py-3.5 px-4 whitespace-nowrap text-slate-400 font-mono text-[11px]">
                      {item.created_at ? item.created_at.replace("T", " ").substring(0, 16) : "-"}
                    </td>

                    {/* 삭제 */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="소프트 삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
