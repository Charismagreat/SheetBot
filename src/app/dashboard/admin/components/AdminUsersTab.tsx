"use client";

import { apiFetch } from '@/lib/api';
import React, { useState } from "react";
import {
  Search,
  Coins,
  Eye,
  Ban,
  UserCheck,
  ShieldCheck,
  Layers,
  CreditCard,
} from "lucide-react";

interface AdminUsersTabProps {
  users: any[];
  onRefresh: () => void;
}

export default function AdminUsersTab({ users, onRefresh }: AdminUsersTabProps) {
  // 회원 검색 & 필터
  const [userSearch, setUserSearch] = useState<string>("" );
  const [tierFilter, setTierFilter] = useState<string>("ALL");

  // 토큰 조정 모달
  const [tokenModalUser, setTokenModalUser] = useState<any | null>(null);
  const [tokenActionType, setTokenActionType] = useState<"GRANT" | "DEDUCT">("GRANT");
  const [tokenAmount, setTokenAmount] = useState<number>(10000);
  const [tokenReason, setTokenReason] = useState<string>("신규 가입 프로모션 보너스");
  const [submittingToken, setSubmittingToken] = useState<boolean>(false);

  // 회원 상세 모달
  const [detailUser, setDetailUser] = useState<any | null>(null);
  const [editTier, setEditTier] = useState<string>("FREE");
  const [editRole, setEditRole] = useState<string>("USER");
  const [editNote, setEditNote] = useState<string>("");
  const [savingUserMeta, setSavingUserMeta] = useState<boolean>(false);

  // 회원 상태 변경 (정상 <-> 정지)
  const handleToggleUserStatus = async (user: any) => {
    const nextStatus = user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    const actionLabel = nextStatus === "SUSPENDED" ? "이용 정지" : "정상 복구";
    if (!confirm(`${user.email} 회원을 [${actionLabel}] 처리하시겠습니까?`)) return;

    try {
      const res = await apiFetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, status: nextStatus }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        onRefresh();
      } else {
        alert(data.error || "상태 변경 실패");
      }
    } catch (e: any) {
      alert("오류: " + e.message);
    }
  };

  // 회원 상세 정보 저장 (등급, 권한, 메모)
  const handleSaveUserMeta = async () => {
    if (!detailUser) return;
    setSavingUserMeta(true);
    try {
      const res = await apiFetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: detailUser.email,
          tier: editTier,
          role: editRole,
          note: editNote,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert("회원 정보가 저장되었습니다.");
        setDetailUser(null);
        onRefresh();
      } else {
        alert(data.error || "저장 실패");
      }
    } catch (e: any) {
      alert("오류: " + e.message);
    } finally {
      setSavingUserMeta(false);
    }
  };

  // 토큰 수동 지급/차감 실행
  const handleAdjustTokens = async () => {
    if (!tokenModalUser || tokenAmount <= 0) {
      alert("0보다 큰 토큰 수량을 입력해 주세요.");
      return;
    }
    const delta = tokenActionType === "GRANT" ? tokenAmount : -tokenAmount;
    setSubmittingToken(true);
    try {
      const res = await apiFetch("/api/admin/users/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetEmail: tokenModalUser.email,
          amount: delta,
          reason: tokenReason,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setTokenModalUser(null);
        onRefresh();
      } else {
        alert(data.error || "토큰 조정 실패");
      }
    } catch (e: any) {
      alert("오류: " + e.message);
    } finally {
      setSubmittingToken(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
      (u.name && u.name.toLowerCase().includes(userSearch.toLowerCase()));
    const matchesTier = tierFilter === "ALL" ? true : u.tier === tierFilter;
    return matchesSearch && matchesTier;
  });

  return (
    <div className="space-y-4">
      {/* 검색 및 필터 바 */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            placeholder="이메일 또는 이름으로 검색..."
            className="w-full text-xs pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-800"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <span className="text-xs text-slate-400 font-bold">등급:</span>
          {["ALL", "FREE", "PRO", "ENTERPRISE"].map((t) => (
            <button
              key={t}
              onClick={() => setTierFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                tierFilter === t
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t === "ALL" ? "전체" : t}
            </button>
          ))}
        </div>
      </div>

      {/* 회원 대장 테이블 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <span className="text-xs font-bold text-slate-700">전체 등록 회원 대장</span>
          <span className="text-xs text-slate-400">총 {filteredUsers.length}명 표시 중</span>
        </div>

        {filteredUsers.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            검색 조건에 일치하는 회원이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">회원 정보</th>
                  <th className="py-3 px-4">권한/등급</th>
                  <th className="py-3 px-4">토큰 잔액</th>
                  <th className="py-3 px-4">프로젝트</th>
                  <th className="py-3 px-4">총 결제액</th>
                  <th className="py-3 px-4">계정 상태</th>
                  <th className="py-3 px-4">가입일</th>
                  <th className="py-3 px-4 text-right">회원 관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u) => {
                  const isSuspended = u.status === "SUSPENDED";
                  const isAdmin = u.role === "ADMIN";
                  return (
                    <tr key={u.email} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{u.name || "사용자"}</span>
                          {isAdmin && (
                            <span className="px-1.5 py-0.2 rounded-md bg-rose-100 text-rose-700 font-bold text-[10px]">
                              관리자
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">{u.email}</div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold ${
                            u.tier === "PRO"
                              ? "bg-purple-100 text-purple-800 border border-purple-200"
                              : u.tier === "ENTERPRISE"
                              ? "bg-amber-100 text-amber-900 border border-amber-300"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {u.tier}
                        </span>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono font-bold text-slate-900">
                          {Number(u.balanceTokens || 0).toLocaleString()} <span className="text-[10px] text-slate-400">P</span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          구매 {Number(u.totalPurchasedTokens || 0).toLocaleString()}
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-bold text-slate-700">{u.projectCount}개</span>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-black text-slate-900">
                          ₩{Number(u.totalSpentKrw || 0).toLocaleString()}
                        </span>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        {isSuspended ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 font-bold text-[11px] border border-rose-200">
                            <Ban className="w-3 h-3" /> 이용정지
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[11px] border border-emerald-200">
                            <UserCheck className="w-3 h-3" /> 정상
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap text-slate-400 text-[11px]">
                        {u.createdAt ? u.createdAt.slice(0, 10) : "-"}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                        {/* 토큰 지급 버튼 */}
                        <button
                          onClick={() => {
                            setTokenModalUser(u);
                            setTokenActionType("GRANT");
                            setTokenAmount(10000);
                            setTokenReason("신규 가입 프로모션 보너스");
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-[11px] cursor-pointer inline-flex items-center gap-1 border border-amber-200/70"
                          title="토큰 수동 지급/차감"
                        >
                          <Coins className="w-3 h-3 text-amber-600" />
                          <span>토큰 조정</span>
                        </button>

                        {/* 상세 정보 버튼 */}
                        <button
                          onClick={() => {
                            setDetailUser(u);
                            setEditTier(u.tier || "FREE");
                            setEditRole(u.role || "USER");
                            setEditNote(u.note || "");
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] cursor-pointer inline-flex items-center gap-1"
                          title="상세 정보 및 이력"
                        >
                          <Eye className="w-3 h-3 text-slate-500" />
                          <span>상세</span>
                        </button>

                        {/* 계정 정지/해제 토글 */}
                        <button
                          onClick={() => handleToggleUserStatus(u)}
                          className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
                            isSuspended
                              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              : "bg-rose-50 text-rose-700 hover:bg-rose-100"
                          }`}
                          title={isSuspended ? "계정 정상 복구" : "계정 이용 정지"}
                        >
                          {isSuspended ? <UserCheck className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 토큰 수동 지급/차감 모달 */}
      {tokenModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-bold text-slate-900">회원 토큰 수동 조정</h3>
              </div>
              <button
                onClick={() => setTokenModalUser(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>대상 회원:</span>
                <span className="font-bold text-slate-800">{tokenModalUser.email}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>현재 잔여 토큰:</span>
                <span className="font-mono font-bold text-indigo-700">
                  {Number(tokenModalUser.balanceTokens || 0).toLocaleString()} P
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700">조정 유형</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setTokenActionType("GRANT")}
                    className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      tokenActionType === "GRANT"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    + 보너스 지급 (충전)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTokenActionType("DEDUCT")}
                    className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      tokenActionType === "DEDUCT"
                        ? "bg-rose-600 text-white shadow-xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    - 토큰 회수 (차감)
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">조정 토큰 수량</label>
                <div className="flex gap-2 mt-1">
                  {[10000, 30000, 50000, 100000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setTokenAmount(amt)}
                      className={`px-2 py-1 text-[11px] rounded-lg border font-bold cursor-pointer transition-all ${
                        tokenAmount === amt
                          ? "bg-indigo-50 text-indigo-700 border-indigo-300"
                          : "bg-white text-slate-600 border-slate-200"
                      }`}
                    >
                      +{amt.toLocaleString()}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  value={tokenAmount}
                  onChange={(e) => setTokenAmount(Math.max(0, Number(e.target.value)))}
                  className="w-full text-xs p-2.5 mt-1.5 rounded-xl border border-slate-200 font-mono font-bold focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">조정 사유 (감사 기록용)</label>
                <input
                  type="text"
                  value={tokenReason}
                  onChange={(e) => setTokenReason(e.target.value)}
                  placeholder="예: 고객센터 CS 보상, 베타테스터 감사 토큰 등"
                  className="w-full text-xs p-2.5 mt-1 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-100 text-xs flex justify-between items-center">
                <span className="text-indigo-900 font-medium">조정 후 예상 잔액:</span>
                <span className="font-mono font-black text-indigo-700 text-sm">
                  {Math.max(
                    0,
                    tokenModalUser.balanceTokens + (tokenActionType === "GRANT" ? tokenAmount : -tokenAmount)
                  ).toLocaleString()}{" "}
                  P
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTokenModalUser(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleAdjustTokens}
                disabled={submittingToken || tokenAmount <= 0}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {submittingToken ? "처리 중..." : "확인 및 반영"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 회원 상세 모달 */}
      {detailUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-slate-900">{detailUser.name || "회원"}</h3>
                  <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 text-xs font-black">
                    {detailUser.tier}
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono mt-0.5">{detailUser.email}</p>
              </div>
              <button
                onClick={() => setDetailUser(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* 회원 설정 폼 (등급, 권한, 메모) */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                <span>회원 등급 및 권한 설정</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-500">회원 등급</label>
                  <select
                    value={editTier}
                    onChange={(e) => setEditTier(e.target.value)}
                    className="w-full text-xs p-2 mt-1 rounded-lg border border-slate-200 bg-white"
                  >
                    <option value="FREE">FREE (무료)</option>
                    <option value="PRO">PRO (프로)</option>
                    <option value="ENTERPRISE">ENTERPRISE (기업)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500">시스템 권한</label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full text-xs p-2 mt-1 rounded-lg border border-slate-200 bg-white"
                  >
                    <option value="USER">일반 회원 (USER)</option>
                    <option value="ADMIN">관리자 (ADMIN)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500">관리자 메모</label>
                <input
                  type="text"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="특이사항이나 CS 응대 메모를 남겨주세요."
                  className="w-full text-xs p-2 mt-1 rounded-lg border border-slate-200 bg-white"
                />
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleSaveUserMeta}
                  disabled={savingUserMeta}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {savingUserMeta ? "저장 중..." : "설정 저장"}
                </button>
              </div>
            </div>

            {/* 보유 프로젝트 목록 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-emerald-600" />
                  생성한 프로젝트 ({detailUser.projects?.length || 0}개)
                </span>
              </div>
              {detailUser.projects?.length === 0 ? (
                <p className="text-xs text-slate-400 p-3 bg-slate-50 rounded-xl text-center">
                  등록된 프로젝트가 없습니다.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {detailUser.projects?.map((p: any) => (
                    <div
                      key={p.id}
                      className="p-2.5 rounded-xl border border-slate-200/80 bg-white flex items-center justify-between text-xs"
                    >
                      <div className="truncate max-w-[280px]">
                        <span className="font-bold text-slate-800">{p.name}</span>
                        <div className="text-[10px] text-slate-400 truncate">{p.spreadsheet_url}</div>
                      </div>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                        {p.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 결제 내역 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-amber-600" />
                  결제 및 충전 이력 ({detailUser.payments?.length || 0}건)
                </span>
                <span className="text-slate-500 font-normal">
                  총 ₩{Number(detailUser.totalSpentKrw || 0).toLocaleString()}
                </span>
              </div>
              {detailUser.payments?.length === 0 ? (
                <p className="text-xs text-slate-400 p-3 bg-slate-50 rounded-xl text-center">
                  결제 충전 내역이 없습니다.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {detailUser.payments?.map((pm: any) => (
                    <div
                      key={pm.id}
                      className="p-2.5 rounded-xl border border-slate-200/80 bg-white flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-slate-800">{pm.package_name}</span>
                        <div className="text-[10px] text-slate-400">{pm.created_at?.slice(0, 16).replace("T", " ")}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-slate-900">₩{Number(pm.amount_krw || 0).toLocaleString()}</div>
                        <div className="text-[10px] text-indigo-600 font-bold">+{Number(pm.tokens_credited || 0).toLocaleString()} P</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setDetailUser(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
