import type { Database } from "@/lib/types";
import { conditionForDate } from "./payroll";

// ============================================================================
// レポート: 従業員ごとの月間 出勤日数・労働時間 を抽出し、規定との過不足を判定。
// 労務調査・給与計算・年末調整に活用できる集計を提供する。
// ============================================================================

export interface MonthlyRow {
  employeeId: string;
  name: string;
  workedDays: number;
  workedMinutes: number;
  breakMinutes: number;
  overtimeMinutes: number;
  /** 規定労働時間(分) = 所定/日 × 出勤予定日数の概算 */
  expectedMinutes: number;
  /** 過不足判定 */
  status: "under" | "over" | "ok";
  diffMinutes: number;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** 営業日(月-金)概算で予定労働日数を出す */
function estimatedWorkdays(year: number, month: number): number {
  const total = daysInMonth(year, month);
  let count = 0;
  for (let d = 1; d <= total; d++) {
    const wd = new Date(year, month - 1, d).getDay();
    if (wd !== 0 && wd !== 6) count++;
  }
  return count;
}

export function buildMonthlyReport(
  db: Database,
  year: number,
  month: number
): MonthlyRow[] {
  const mm = String(month).padStart(2, "0");
  const prefix = `${year}-${mm}`;
  const workdays = estimatedWorkdays(year, month);

  // 在籍者 + その月に記録がある退職者(退職後も記録は残す)
  const hasRecord = new Set(
    db.attendances.filter((a) => a.date.startsWith(prefix) && a.clockIn).map((a) => a.employeeId)
  );
  return db.employees
    .filter((e) => e.role === "employee" && (e.active || hasRecord.has(e.id)))
    .map((e) => {
      const list = db.attendances.filter(
        (a) => a.employeeId === e.id && a.date.startsWith(prefix) && a.clockIn
      );
      const workedMinutes = list.reduce((s, a) => s + a.workedMinutes, 0);
      const breakMinutes = list.reduce((s, a) => s + a.breakMinutes, 0);
      const overtimeMinutes = list.reduce((s, a) => s + a.overtimeMinutes, 0);

      const cond = conditionForDate(db, e.id, `${prefix}-01`);
      const dailyScheduled = cond?.scheduledDailyMinutes ?? 480;
      const expectedMinutes = dailyScheduled * workdays;

      // 過不足: 規定±10%を許容範囲とする
      const diffMinutes = workedMinutes - expectedMinutes;
      const tolerance = expectedMinutes * 0.1;
      let status: MonthlyRow["status"] = "ok";
      if (diffMinutes < -tolerance) status = "under";
      else if (diffMinutes > tolerance) status = "over";

      return {
        employeeId: e.id,
        name: e.name,
        workedDays: list.length,
        workedMinutes,
        breakMinutes,
        overtimeMinutes,
        expectedMinutes,
        status,
        diffMinutes,
      };
    });
}

/** 配列を CSV 文字列に変換(簡易・ダブルクォートエスケープ対応) */
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(",")];
  for (const r of rows) lines.push(r.map(esc).join(","));
  // Excel(日本語)向けに BOM を付与
  return "﻿" + lines.join("\r\n");
}

/** ブラウザで CSV をダウンロードさせる */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
