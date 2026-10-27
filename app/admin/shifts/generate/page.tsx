"use client";

import { useState } from "react";
import { useData } from "@/lib/db/DataContext";
import { useAuth } from "@/lib/auth/AuthContext";
import { BigButton } from "@/components/ui/BigButton";
import { Card, BackButton, PageTitle, Badge } from "@/components/ui/Common";
import { formatDateJp, todayYmd } from "@/lib/format";
import { generateShiftPlan } from "@/lib/domain/shiftgen";
import { JOB_TYPE_LABEL, LEAVE_TYPE_MARK, LEAVE_TYPE_LABEL } from "@/lib/types";
import type { ShiftAssignment, LeaveType } from "@/lib/types";

// 休み希望の並び順: 管理者が手動考慮すべき ▲/△ を上に、自動除外の × を下に
const LEAVE_ORDER: Record<LeaveType, number> = {
  off_negotiable: 0,
  partial: 1,
  off: 2,
};
const LEAVE_BADGE: Record<LeaveType, string> = {
  off: "bg-red-100 text-red-700",
  off_negotiable: "bg-orange-100 text-orange-700",
  partial: "bg-blue-100 text-blue-700",
};

export default function GenerateShiftPage() {
  const { db, insert, update } = useData();
  const { currentUser } = useAuth();
  const today = todayYmd();

  const [selectedShiftId, setSelectedShiftId] = useState<string>("");
  const [proposals, setProposals] = useState<ShiftAssignment[]>([]);
  const [shortages, setShortages] = useState<string[]>([]);
  const [generated, setGenerated] = useState(false);

  if (!currentUser) return null;

  const upcomingShifts = db.shifts
    .filter((s) => s.date >= today)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const selectedShift = db.shifts.find((s) => s.id === selectedShiftId);
  const selectedSite = selectedShift
    ? db.sites.find((s) => s.id === selectedShift.siteId)
    : undefined;
  const reqs = selectedShift
    ? db.siteRequirements.filter((r) => r.siteId === selectedShift.siteId)
    : [];

  // 既に手動配置(固定)されているメンバー
  const lockedAssignments = selectedShift
    ? db.shiftAssignments.filter((sa) => sa.shiftId === selectedShift.id)
    : [];

  // 選択シフトの日に休み希望を出している従業員(右パネルで管理者に提示)
  const leaveForDate = selectedShift
    ? db.leaveRequests
        .filter((l) => l.date === selectedShift.date)
        .map((l) => ({ leave: l, emp: db.employees.find((e) => e.id === l.employeeId) }))
        .sort((a, b) => LEAVE_ORDER[a.leave.type] - LEAVE_ORDER[b.leave.type])
    : [];

  const runGenerate = () => {
    if (!selectedShift) return;
    const result = generateShiftPlan(db, {
      shiftId: selectedShift.id,
      needs: reqs.map((r) => ({ jobType: r.jobType, count: r.requiredCount })),
    });
    setProposals(result.proposals);
    setShortages(result.shortages);
    setGenerated(true);
  };

  const confirmPlan = () => {
    for (const p of proposals) {
      insert("shiftAssignments", p, currentUser.id);
    }
    setProposals([]);
    setShortages([]);
    setGenerated(false);
    setSelectedShiftId("");
  };

  const toggleLock = (sa: ShiftAssignment) => {
    update("shiftAssignments", sa.id, { locked: !sa.locked }, currentUser.id);
  };

  return (
    <div className="lg:grid lg:grid-cols-[1fr_340px] lg:gap-6 lg:items-start">
      {/* 左: シフト生成本体 */}
      <div className="space-y-5">
      <BackButton href="/admin/shifts" />
      <PageTitle>AI半自動シフト生成</PageTitle>
      <p className="text-gray-600">
        ① 必須メンバー(現場監督など)を「固定」にして先に配置 → ② 残りの空き枠をAIが
        休暇希望・職種・他現場の重複を考慮して自動で埋めます。最後に管理者が確認して確定します。
      </p>
      <Card className="border-purple-200 bg-purple-50 text-sm text-gray-700">
        ※ 現在はルールベースの自動補完で動作します。生成ロジックの入出力境界は
        <code className="mx-1 rounded bg-white px-1">generateShiftPlan()</code>
        に固定してあり、将来 Claude API(claude-opus-4-8)へ差し替え可能です。
      </Card>

      <Card>
        <label className="mb-2 block font-bold text-gray-700">対象シフト</label>
        <select
          value={selectedShiftId}
          onChange={(e) => {
            setSelectedShiftId(e.target.value);
            setGenerated(false);
            setProposals([]);
          }}
          className="w-full rounded-xl border border-gray-300 p-3 text-lg"
        >
          <option value="">選択してください</option>
          {upcomingShifts.map((s) => {
            const site = db.sites.find((x) => x.id === s.siteId);
            return (
              <option key={s.id} value={s.id}>
                {formatDateJp(s.date)} / {site?.name}
              </option>
            );
          })}
        </select>
      </Card>

      {selectedShift && (
        <>
          <Card>
            <div className="font-bold text-gray-900">{selectedSite?.name}</div>
            <div className="mt-1 text-sm text-gray-500">必要要件</div>
            <ul className="text-gray-800">
              {reqs.length === 0 ? (
                <li className="text-gray-400">要件未設定(現場マスターで設定してください)</li>
              ) : (
                reqs.map((r) => (
                  <li key={r.id}>
                    ・{JOB_TYPE_LABEL[r.jobType]} {r.requiredCount}人
                    {r.requiresSupervisor && " / 監督必須"}
                  </li>
                ))
              )}
            </ul>
          </Card>

          <Card>
            <div className="mb-2 text-sm font-bold text-gray-500">
              手動配置(固定すると自動生成で動かしません)
            </div>
            {lockedAssignments.length === 0 ? (
              <div className="text-gray-400">まだ誰も配置されていません</div>
            ) : (
              <div className="space-y-2">
                {lockedAssignments.map((sa) => {
                  const emp = db.employees.find((e) => e.id === sa.employeeId);
                  return (
                    <div
                      key={sa.id}
                      className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
                    >
                      <span className="font-bold">{emp?.name}</span>
                      <button
                        type="button"
                        onClick={() => toggleLock(sa)}
                        className={`rounded-lg px-3 py-1 text-sm font-bold ${
                          sa.locked
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-200 text-gray-700"
                        }`}
                      >
                        {sa.locked ? "固定中" : "固定する"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <BigButton color="blue" onClick={runGenerate} disabled={reqs.length === 0}>
            空き枠をAIで埋める
          </BigButton>
        </>
      )}

      {generated && (
        <Card className="border-blue-200 bg-blue-50">
          <div className="mb-2 font-bold text-gray-900">AIの提案</div>
          {proposals.length === 0 ? (
            <div className="text-gray-600">追加で配置できる人はいませんでした。</div>
          ) : (
            <div className="space-y-2">
              {proposals.map((p) => {
                const emp = db.employees.find((e) => e.id === p.employeeId);
                return (
                  <div key={p.id} className="flex items-center gap-2">
                    <Badge tone="blue">AI</Badge>
                    <span className="font-bold">{emp?.name}</span>
                    <span className="text-sm text-gray-500">
                      {emp && emp.jobTypes.map((j) => JOB_TYPE_LABEL[j]).join("・")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {shortages.length > 0 && (
            <div className="mt-3 text-sm text-red-700">
              {shortages.map((s, i) => (
                <div key={i}>⚠ {s}</div>
              ))}
            </div>
          )}
          {proposals.length > 0 && (
            <div className="mt-3">
              <BigButton color="green" size="md" onClick={confirmPlan}>
                この案で確定する
              </BigButton>
            </div>
          )}
        </Card>
      )}
      </div>

      {/* 右: この日の休み希望(シフトを組む際の確認用) */}
      <aside className="mt-6 lg:mt-0 lg:sticky lg:top-4">
        <Card className="border-amber-200 bg-amber-50">
          <div className="font-bold text-gray-900">この日の休み希望</div>
          {!selectedShift ? (
            <div className="mt-1 text-sm text-gray-500">
              シフトを選ぶと、その日に休み希望を出している人が表示されます。
            </div>
          ) : (
            <>
              <div className="mt-1 text-sm text-gray-600">
                {formatDateJp(selectedShift.date)}
              </div>
              {leaveForDate.length === 0 ? (
                <div className="mt-2 text-sm text-gray-500">
                  この日の休み希望はありません。
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  {leaveForDate.map(({ leave, emp }) => (
                    <div key={leave.id} className="rounded-lg bg-white p-2 shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-gray-900">
                          {emp?.name ?? "(不明)"}
                        </span>
                        <span
                          className={`whitespace-nowrap rounded-md px-2 py-0.5 text-sm font-bold ${LEAVE_BADGE[leave.type]}`}
                        >
                          {LEAVE_TYPE_MARK[leave.type]} {LEAVE_TYPE_LABEL[leave.type]}
                        </span>
                      </div>
                      {leave.type === "partial" && leave.startTime && (
                        <div className="mt-0.5 text-xs text-gray-600">
                          希望時間帯 {leave.startTime}〜{leave.endTime}
                        </div>
                      )}
                      {leave.type === "off" ? (
                        <div className="mt-0.5 text-xs text-gray-400">
                          自動生成では除外されます
                        </div>
                      ) : (
                        <div className="mt-0.5 text-xs font-bold text-amber-700">
                          ⚠ 自動では外れません。配置時に考慮してください
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 border-t border-amber-200 pt-2 text-xs text-gray-500">
                × 休みたい ／ ▲ できれば休みたい ／ △ 短時間
              </div>
            </>
          )}
        </Card>
      </aside>
    </div>
  );
}
