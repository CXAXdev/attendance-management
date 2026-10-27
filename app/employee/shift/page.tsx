"use client";

import { useState } from "react";
import { useData } from "@/lib/db/DataContext";
import { useAuth } from "@/lib/auth/AuthContext";
import { Card, BackButton, Badge } from "@/components/ui/Common";
import {
  todayYmd,
  formatDateJp,
  monthMatrix,
  addMonth,
  WEEK,
} from "@/lib/format";
import { shiftMapForEmployeeMonth } from "@/lib/domain/queries";

export default function MyShiftPage() {
  const { db } = useData();
  const { currentUser } = useAuth();
  const today = todayYmd();

  const [ym, setYm] = useState(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  }));
  const [selectedDate, setSelectedDate] = useState<string | null>(today);

  if (!currentUser) return null;

  const weeks = monthMatrix(ym.year, ym.month);
  const shiftMap = shiftMapForEmployeeMonth(db, currentUser.id, ym.year, ym.month);

  const go = (delta: number) => {
    setYm((p) => addMonth(p.year, p.month, delta));
    setSelectedDate(null);
  };

  const selectedShifts = selectedDate ? shiftMap.get(selectedDate) ?? [] : [];

  return (
    <div className="space-y-3">
      {/* ヘッダー: 戻る + タイトルを同じ行に */}
      <div className="flex items-center gap-3">
        <div className="shrink-0">
          <BackButton href="/employee" />
        </div>
        <h1 className="truncate text-xl font-bold text-gray-900">
          {currentUser.name}さんのシフト
        </h1>
      </div>

      {/* 月ナビ */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => go(-1)}
          className="rounded-xl bg-gray-200 px-4 py-2 font-bold text-gray-800 active:bg-gray-300"
        >
          ← 前の月
        </button>
        <div className="text-xl font-bold text-gray-900">
          {ym.year}年 {ym.month}月
        </div>
        <button
          type="button"
          onClick={() => go(1)}
          className="rounded-xl bg-gray-200 px-4 py-2 font-bold text-gray-800 active:bg-gray-300"
        >
          次の月 →
        </button>
      </div>

      {/* カレンダー */}
      <Card className="p-3" guide="shift-calendar">
        <div className="grid grid-cols-7 gap-1">
          {WEEK.map((w, i) => (
            <div
              key={w}
              className={`text-center text-xs font-bold ${
                i === 0 ? "text-red-600" : i === 6 ? "text-blue-600" : "text-gray-500"
              }`}
            >
              {w}
            </div>
          ))}
          {weeks.flat().map((date, idx) => {
            if (!date) return <div key={`e-${idx}`} />;
            const has = (shiftMap.get(date)?.length ?? 0) > 0;
            const day = Number(date.split("-")[2]);
            const isToday = date === today;
            const isSelected = selectedDate === date;
            return (
              <button
                key={date}
                type="button"
                onClick={() => setSelectedDate(date)}
                className={`flex min-h-11 flex-col items-center justify-center rounded-lg border leading-none ${
                  isSelected ? "ring-2 ring-blue-500" : ""
                } ${
                  has
                    ? "border-green-300 bg-green-50"
                    : "border-gray-200 bg-white"
                } ${isToday ? "border-blue-400" : ""}`}
              >
                <div className="text-xs font-bold text-gray-700">{day}</div>
                <div
                  className={`text-lg font-bold ${
                    has ? "text-green-600" : "text-gray-300"
                  }`}
                >
                  {has ? "◯" : "×"}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* 凡例(カレンダーの下・小さめ) */}
      <div className="flex justify-center gap-4 text-xs text-gray-500">
        <span>
          <span className="font-bold text-green-700">◯</span> 出勤あり
        </span>
        <span>
          <span className="font-bold text-gray-400">×</span> シフトなし
        </span>
        <span>日付を押すと詳しく見られます</span>
      </div>

      {/* 選択した日の詳細 */}
      {selectedDate && (
        <Card className="space-y-2 border-blue-300 p-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-gray-900">
              {formatDateJp(selectedDate)}
            </span>
            {selectedDate === today && <Badge tone="blue">今日</Badge>}
          </div>
          {selectedShifts.length === 0 ? (
            <div className="text-gray-500">この日はシフトがありません。</div>
          ) : (
            selectedShifts.map(({ shift, site }) => (
              <div
                key={shift.id}
                className="flex items-baseline justify-between rounded-xl bg-green-50 px-3 py-2"
              >
                <div className="text-lg font-bold text-gray-900">{site?.name}</div>
                <div className="text-gray-700">
                  {shift.startTime} 〜 {shift.endTime}
                </div>
              </div>
            ))
          )}
        </Card>
      )}
    </div>
  );
}
