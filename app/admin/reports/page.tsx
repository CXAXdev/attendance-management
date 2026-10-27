"use client";

import { useMemo, useState } from "react";
import { useData } from "@/lib/db/DataContext";
import { Card, BackButton, PageTitle, Badge } from "@/components/ui/Common";
import { BigButton } from "@/components/ui/BigButton";
import { formatMinutes } from "@/lib/format";
import { buildMonthlyReport, toCsv, downloadCsv } from "@/lib/domain/report";

export default function ReportsPage() {
  const { db } = useData();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const rows = useMemo(
    () => buildMonthlyReport(db, year, month),
    [db, year, month]
  );

  const exportCsv = () => {
    const headers = [
      "従業員",
      "出勤日数",
      "実労働(分)",
      "休憩(分)",
      "残業(分)",
      "規定(分)",
      "過不足(分)",
      "判定",
    ];
    const data = rows.map((r) => [
      r.name,
      r.workedDays,
      r.workedMinutes,
      r.breakMinutes,
      r.overtimeMinutes,
      r.expectedMinutes,
      r.diffMinutes,
      r.status === "under" ? "不足" : r.status === "over" ? "超過" : "適正",
    ]);
    downloadCsv(`report_${year}_${month}.csv`, toCsv(headers, data));
  };

  return (
    <div className="space-y-5">
      <BackButton href="/admin" />
      <PageTitle>レポート</PageTitle>
      <p className="text-gray-600">
        月間の出勤日数・労働時間を集計し、規定時間に対する過不足を判定します(労務調査・年末調整に活用)。
      </p>

      <Card className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-sm text-gray-500">年</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-xl border border-gray-300 p-2 text-lg"
          >
            {Array.from({ length: 4 }, (_, i) => now.getFullYear() - 2 + i).map((y) => (
              <option key={y} value={y}>{y}年</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-500">月</label>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="rounded-xl border border-gray-300 p-2 text-lg"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{m}月</option>
            ))}
          </select>
        </div>
        <BigButton color="blue" size="md" className="w-auto px-5" onClick={exportCsv}>
          CSV出力
        </BigButton>
      </Card>

      <div className="space-y-2">
        {rows.map((r) => (
          <Card key={r.employeeId}>
            <div className="flex items-center justify-between">
              <div className="text-lg font-bold text-gray-900">{r.name}</div>
              <Badge
                tone={
                  r.status === "under" ? "orange" : r.status === "over" ? "red" : "green"
                }
              >
                {r.status === "under" ? "不足" : r.status === "over" ? "超過" : "適正"}
              </Badge>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-600 sm:grid-cols-4">
              <div>出勤 {r.workedDays}日</div>
              <div>実労働 {formatMinutes(r.workedMinutes)}</div>
              <div>休憩 {formatMinutes(r.breakMinutes)}</div>
              <div>残業 {formatMinutes(r.overtimeMinutes)}</div>
              <div>規定 {formatMinutes(r.expectedMinutes)}</div>
              <div className="col-span-2">
                過不足{" "}
                <span
                  className={
                    r.diffMinutes < 0 ? "font-bold text-orange-700" : "font-bold text-gray-800"
                  }
                >
                  {formatMinutes(r.diffMinutes)}
                </span>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
