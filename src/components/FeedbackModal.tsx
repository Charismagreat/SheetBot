'use client';

import React, { useState } from 'react';
import {
  X,
  Star,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Send,
  ThumbsUp,
  BrainCircuit,
  MessageSquare,
} from 'lucide-react';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: {
    id: string;
    name: string;
    scriptCode?: string;
  };
  onSuccess?: () => void;
}

export default function FeedbackModal({
  isOpen,
  onClose,
  project,
  onSuccess,
}: FeedbackModalProps) {
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);

  if (!isOpen) return null;

  const positiveTags = [
    '정확한 시트 열 매핑',
    '오류 없는 클라우드 배포',
    '모바일 반응형 웹앱 완성도',
    '실시간 0.1초 시트 기록',
    '직관적인 코드 주석',
    '기대 이상의 완성도',
  ];

  const negativeTags = [
    '시트 열 순서 불일치',
    'GAS 스크립트 실행 오류',
    '요구사항 기능 누락',
    '웹앱 스타일/동작 미흡',
    '트리거/스케줄 설정 오류',
    '처리 속도 지연',
  ];

  const currentAvailableTags = rating >= 4 ? positiveTags : negativeTags;

  const handleTagToggle = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          projectName: project.name,
          rating,
          tags: selectedTags,
          comment,
          scriptCodeSnapshot: project.scriptCode || '',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
        if (onSuccess) onSuccess();
        setTimeout(() => {
          onClose();
          setSubmitted(false);
        }, 1800);
      } else {
        alert(data.message || '피드백 저장에 실패했습니다.');
      }
    } catch (err: any) {
      alert('오류가 발생했습니다: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
              <BrainCircuit className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">AI 생성 결과 만족도 평가</h3>
              <p className="text-[11px] font-medium text-slate-500">
                평가 결과는 AI 자가 학습(Self-improving) 모델에 즉시 반영됩니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {submitted ? (
          <div className="py-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-extrabold text-slate-900">소중한 평가가 AI에 학습되었습니다!</h4>
              <p className="text-xs text-slate-500 font-medium">
                {rating >= 4
                  ? '🌟 우수 모범 사례로 분류되어 향후 코드 생성 품질이 한층 더 높아집니다.'
                  : '⚠️ 지적해주신 개선점과 주의사항을 시스템이 즉시 학습하여 반복 실수를 방지합니다.'}
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-4">
            {/* 대상 프로젝트 안내 */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600 truncate max-w-[280px]">
                {project.name}
              </span>
              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                자가 학습 피드백
              </span>
            </div>

            {/* 별점 선택 (1~5) */}
            <div className="text-center space-y-1.5 py-2 bg-gradient-to-b from-amber-50/40 to-white rounded-2xl border border-amber-100/60 p-3">
              <span className="text-xs font-extrabold text-slate-700 block">
                생성된 코드와 기능이 마음에 드셨나요?
              </span>
              <div className="flex items-center justify-center gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => {
                      setRating(star);
                      setSelectedTags([]);
                    }}
                    className="p-1 transition-transform hover:scale-110 cursor-pointer"
                  >
                    <Star
                      className={`w-7 h-7 transition-colors ${
                        (hoverRating || rating) >= star
                          ? 'text-amber-400 fill-amber-400 drop-shadow-sm'
                          : 'text-slate-200'
                      }`}
                    />
                  </button>
                ))}
              </div>
              <p className="text-[11px] font-bold text-amber-800">
                {rating === 5 && '😍 대만족 (완벽하게 동작해요)'}
                {rating === 4 && '😊 만족 (대부분 잘 동작해요)'}
                {rating === 3 && '😐 보통 (일부 수정이 필요해요)'}
                {rating === 2 && '🙁 아쉬움 (오류가 있거나 어색해요)'}
                {rating === 1 && '😡 불만족 (전혀 동작하지 않아요)'}
              </p>
            </div>

            {/* 빠른 피드백 태그 */}
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <ThumbsUp className="w-3.5 h-3.5 text-slate-500" />
                <span>{rating >= 4 ? '어떤 점이 가장 마음에 드셨나요?' : '어떤 점이 아쉬우셨나요?'}</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {currentAvailableTags.map((tag) => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleTagToggle(tag)}
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                        isSelected
                          ? rating >= 4
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-rose-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 추가 코멘트 입력창 */}
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                <span>추가 의견 및 요청사항 (선택사항)</span>
              </span>
              <textarea
                rows={2}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={
                  rating >= 4
                    ? 'AI가 어떤 부분을 특히 잘 작성했는지 알려주시면 더욱 고도화됩니다.'
                    : '발생한 오류 증상이나 수정이 필요한 부분을 적어주시면 AI가 학습하여 보완합니다.'
                }
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none"
              />
            </div>

            {/* 액션 버튼 */}
            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                닫기
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold rounded-xl shadow-md shadow-amber-500/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{submitting ? 'AI 학습 전송 중...' : '평가 제출 및 AI 학습 반영'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
