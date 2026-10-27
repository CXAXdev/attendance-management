"use client";

import { useMemo, useState } from "react";
import { useData } from "@/lib/db/DataContext";
import { useAuth } from "@/lib/auth/AuthContext";
import { Card, BackButton, PageTitle } from "@/components/ui/Common";
import { todayYmd, formatDateJp } from "@/lib/format";
import { buildAttendanceSheet } from "@/lib/domain/attendanceSheet";
import {
  downloadAttendanceSheet,
  FIXED_ROWS_PER_BLOCK,
} from "@/lib/export/attendanceSheetXlsx";

export default function AttendanceSheetPage() {
  const { db } = useData();
  const { currentUser } = useAuth();
  const [date, setDate] = useState(() => todayYmd());
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sheet = useMemo(() => buildAttendanceSheet(db, date), [db, date]);

  if (!currentUser) return null;

  const handleExport = async () => {
    setError(null);
    setExporting(true);
    try {
      await downloadAttendanceSheet(sheet);
    } catch (e) {
      console.error(e);
      setError("Excelの出力に失敗しました。もう一度お試しください。");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="shrink-0">
          <BackButton href="/admin" />
        </div>
        <PageTitle>日次出勤表</PageTitle>
      </div>

      {/* 日付選択 + 出力 */}
      <Card className="flex flex-wrap items-end gap-3" guide="sheet-controls">
        <div>
          <label
            htmlFor="sheet-date"
            className="mb-1 block text-sm font-bold text-gray-500"
          >
            日付
          </label>
          <input
            id="sheet-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl border-2 border-gray-200 p-3 text-lg text-gray-900"
          />
        </div>
        <div className="text-gray-700">
          <div className="text-sm text-gray-500">出勤人数</div>
          <div className="text-2xl font-bold text-gray-900">
            {sheet.total}人
          </div>
        </div>
        <button
          type="button"
          data-guide="sheet-export"
          onClick={handleExport}
          disabled={exporting || sheet.total === 0}
          className="ml-auto rounded-2xl bg-green-600 px-6 py-3 text-lg font-bold text-white active:bg-green-700 disabled:bg-gray-300"
        >
          {exporting ? "出力中…" : "Excel出力"}
        </button>
      </Card>

      {error && (
        <div className="rounded-xl bg-red-50 p-3 text-center font-bold text-red-700">
          {error}
        </div>
      )}

      {/* プレビュー(紙の様式に合わせた見た目) */}
      <Card className="space-y-4">
        <div className="text-center text-xl font-bold text-gray-900">
          {formatDateJp(date)}
        </div>

        {sheet.blocks.length === 0 ? (
          <div className="py-8 text-center text-gray-500">
            この日の出勤記録はありません。
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sheet.blocks.map((b) => {
              // Excel と同じ固定行数(人数が多ければ拡張)。空欄は手書き用。
              const rows = Math.max(FIXED_ROWS_PER_BLOCK, b.names.length);
              return (
                <div
                  key={b.siteId}
                  className="overflow-hidden rounded-lg border border-gray-300"
                >
                  <div className="bg-[#FFF2CC] px-3 py-1.5 font-bold text-gray-900">
                    {b.siteName}
                  </div>
                  <ol className="divide-y divide-gray-200">
                    {Array.from({ length: rows }, (_, i) => (
                      <li
                        key={`${b.siteId}-${i}`}
                        className="flex gap-2 px-3 py-1.5 text-sm"
                      >
                        <span className="w-5 shrink-0 text-right text-gray-400">
                          {i + 1}
                        </span>
                        <span className="font-bold text-gray-900">
                          {b.names[i] ?? " "}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
        )}

        {/* 集計 */}
        {sheet.blocks.length > 0 && (
          <div className="border-t border-gray-200 pt-3">
            <div className="mb-1 text-sm font-bold text-gray-500">集計</div>
            <div className="max-w-xs">
              {sheet.summary.map((s) => (
                <div
                  key={s.siteName}
                  className="flex justify-between border-b border-gray-100 py-1 text-gray-800"
                >
                  <span>{s.siteName}</span>
                  <span className="font-bold">{s.count}人</span>
                </div>
              ))}
              <div className="flex justify-between border-t-2 border-gray-300 py-1.5 text-lg font-bold text-gray-900">
                <span>合計</span>
                <span>{sheet.total}人</span>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
