"use client";

import { useMemo, useState } from "react";
import { useData } from "@/lib/db/DataContext";
import { Card, BackButton, PageTitle } from "@/components/ui/Common";
import { BigButton } from "@/components/ui/BigButton";
import { formatYen, formatMinutes } from "@/lib/format";
import { calcAllPayroll } from "@/lib/domain/payroll";
import { toCsv, downloadCsv } from "@/lib/domain/report";

export default function PayrollPage() {
  const { db } = useData();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const records = useMemo(
    () => calcAllPayroll(db, year, month),
    [db, year, month]
  );

  const total = records.reduce((s, r) => s + r.grossAmount, 0);

  const exportCsv = () => {
    const headers = [
      "従業員",
      "出勤日数",
      "実労働(分)",
      "残業(分)",
      "基本給",
      "残業手当",
      "現場手当",
      "総支給",
    ];
    const rows = records.map((r) => {
      const emp = db.employees.find((e) => e.id === r.employeeId);
      return [
        emp?.name ?? r.employeeId,
        r.workedDays,
        r.workedMinutes,
        r.overtimeMinutes,
        r.baseAmount,
        r.overtimeAmount,
        r.siteAllowance,
        r.grossAmount,
      ];
    });
    downloadCsv(`payroll_${year}_${month}.csv`, toCsv(headers, rows));
  };

  return (
    <div className="space-y-5">
      <BackButton href="/admin" />
      <PageTitle>給与計算</PageTitle>

      <Card className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-sm text-gray-500">年</label>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="w-28 rounded-xl border border-gray-300 p-2 text-lg"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-500">月</label>
          <input
            type="number"
            min={1}
            max={12}
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="w-20 rounded-xl border border-gray-300 p-2 text-lg"
          />
        </div>
        <BigButton color="blue" size="md" className="w-auto px-5" onClick={exportCsv}>
          CSV出力
        </BigButton>
      </Card>

      <Card className="bg-blue-50 text-center">
        <div className="text-sm text-gray-500">
          {year}年{month}月 総支給額
        </div>
        <div className="text-3xl font-bold text-blue-800">{formatYen(total)}</div>
      </Card>

      <div className="space-y-2">
        {records.map((r) => {
          const emp = db.employees.find((e) => e.id === r.employeeId);
          return (
            <Card key={r.id}>
              <div className="flex items-center justify-between">
                <div className="text-lg font-bold text-gray-900">{emp?.name}</div>
                <div className="text-xl font-bold text-gray-900">
                  {formatYen(r.grossAmount)}
                </div>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-600 sm:grid-cols-4">
                <div>出勤 {r.workedDays}日</div>
                <div>実労働 {formatMinutes(r.workedMinutes)}</div>
                <div>残業 {formatMinutes(r.overtimeMinutes)}</div>
                <div>基本給 {formatYen(r.baseAmount)}</div>
                <div>残業手当 {formatYen(r.overtimeAmount)}</div>
                <div>現場手当 {formatYen(r.siteAllowance)}</div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
