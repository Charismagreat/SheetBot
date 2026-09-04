"use client";

import React, { useState } from "react";
import { Star, Trash2 } from "lucide-react";

interface AdminReviewsTabProps {
  reviews: any[];
  onRefresh: () => void;
}

export default function AdminReviewsTab({
  reviews,
  onRefresh,
}: AdminReviewsTabProps) {
  const [selectedReviewImage, setSelectedReviewImage] = useState<string | null>(null);

  const handleDeleteReview = async (id: string) => {
    if (!confirm("이 사용 후기를 블라인드(삭제) 처리하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/admin/reviews?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) onRefresh();
    } catch {
      alert("처리 실패");
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <span className="text-xs font-bold text-slate-700">고객 사용 후기 및 평점 내역</span>
        <span className="text-xs text-slate-400">총 {reviews.length}개</span>
      </div>

      {reviews.length === 0 ? (
        <div className="p-12 text-center text-slate-400 text-xs">
          등록된 사용 후기가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">평점</th>
                <th className="py-3 px-4">작성자</th>
                <th className="py-3 px-4">활용 용도</th>
                <th className="py-3 px-4">후기 제목 및 내용 (사진 첨부)</th>
                <th className="py-3 px-4">작성일시</th>
                <th className="py-3 px-4 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reviews.map((rev) => (
                <tr key={rev.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-1 text-yellow-500 font-bold">
                      <Star className="w-3.5 h-3.5 fill-yellow-400" />
                      <span>{rev.rating || 5}점</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                    <div className="font-bold text-slate-800">{rev.user_name || "고객"}</div>
                    <div className="text-[11px] text-slate-400">{rev.user_email}</div>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium text-[11px]">
                      {rev.use_case || "일반 시트 자동화"}
                    </span>
                  </td>
                  <td className="py-3 px-4 max-w-md">
                    <div className="font-bold text-slate-900 flex items-center gap-2">
                      <span>{rev.title}</span>
                      {rev.image_url && (
                        <button
                          type="button"
                          onClick={() => setSelectedReviewImage(rev.image_url)}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[10px] cursor-pointer border border-indigo-200"
                          title="첨부 사진 크게 보기"
                        >
                          📷 사진 첨부
                        </button>
                      )}
                    </div>
                    <div className="text-slate-500 mt-1 line-clamp-2">{rev.content}</div>
                    {rev.image_url && (
                      <div className="mt-2">
                        <img
                          src={rev.image_url}
                          alt="후기 사진"
                          onClick={() => setSelectedReviewImage(rev.image_url)}
                          className="w-16 h-12 object-cover rounded-lg border border-slate-200 cursor-pointer hover:opacity-80 transition-opacity"
                        />
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                    {rev.created_at ? rev.created_at.slice(0, 16).replace("T", " ") : "-"}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <button
                      onClick={() => handleDeleteReview(rev.id)}
                      className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px] cursor-pointer inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> 블라인드
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 관리자 후기 사진 크게 보기 라이트박스 */}
      {selectedReviewImage && (
        <div
          onClick={() => setSelectedReviewImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in cursor-pointer"
        >
          <div className="relative max-w-3xl max-h-[90vh] p-2">
            <img
              src={selectedReviewImage}
              alt="첨부 사진 원본"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
            />
            <button
              onClick={() => setSelectedReviewImage(null)}
              className="absolute top-4 right-4 p-2 bg-black/70 hover:bg-black/90 text-white rounded-full transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
