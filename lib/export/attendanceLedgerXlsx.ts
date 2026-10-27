import type { Ledger } from "@/lib/domain/attendanceLedger";
import { formatTime, formatMinutes } from "@/lib/format";
import { EMPLOYMENT_TYPE_LABEL } from "@/lib/types";
import type { Database } from "@/lib/types";
import { conditionForDate } from "@/lib/domain/conditions";
import { a4, applyBorderRange, downloadWorkbook, loadExcel, sheetName, writeHeaderRow, writeRow, writeTitle } from "./xlsxUtil";

// ============================================================================
// 出勤簿(労働時間記録)を従業員ごとに1シートで出力する。
// 労基署の調査で提示する「始業・終業・休憩・労働時間(所定外/法定外/深夜/休日)」の月次記録。
// ============================================================================

const COLUMNS: [string, number][] = [
  ["日付", 7],
  ["曜", 4],
  ["現場", 20],
  ["出勤", 7],
  ["退勤", 7],
  ["休憩", 7],
  ["実労働", 8],
  ["所定外", 8],
  ["法定外", 8],
  ["深夜", 7],
  ["休日", 5],
  ["年休", 5],
  ["備考", 24],
];

const min = (n: number) => (n > 0 ? formatMinutes(n) : "");

export async function downloadAttendanceLedgers(db: Database, ledgers: Ledger[], filename: string): Promise<void> {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();

  for (const l of ledgers) {
    const ws = wb.addWorksheet(sheetName(l.employee.name), {
      pageSetup: { ...a4("portrait"), printTitlesRow: "4:4" },
    });
    const cols = COLUMNS.length;
    writeTitle(ws, 1, cols, `出勤簿  ${l.year}年${l.month}月`);
    const cond = conditionForDate(db, l.employee.id, `${l.year}-${String(l.month).padStart(2, "0")}-01`);
    ws.mergeCells(2, 1, 2, cols);
    ws.getCell(2, 1).value =
      `氏名: ${l.employee.name}　雇用区分: ${cond ? EMPLOYMENT_TYPE_LABEL[cond.employmentType] : "-"}　所定: ${cond ? formatMinutes(cond.scheduledDailyMinutes) : "-"}/日　予定開始: ${cond?.scheduledStartTime ?? "-"}`;
    ws.getCell(2, 1).font = { size: 10 };
    ws.mergeCells(3, 1, 3, cols);
    ws.getCell(3, 1).value = "※ 所定外=所定労働時間超、法定外=1日8時間超、深夜=22:00〜5:00。修正のある日は備考に理由を記載。";
    ws.getCell(3, 1).font = { size: 9 };

    writeHeaderRow(ws, 4, COLUMNS);
    let row = 5;
    for (const r of l.rows) {
      const a = r.attendance;
      const notes: string[] = [];
      if (r.open) notes.push("未退勤");
      if (a?.corrections.length) notes.push(`修正: ${a.corrections.map((c) => c.reason).join(" / ")}`);
      const values: (string | number | null)[] = [
        `${l.month}/${Number(r.date.slice(8))}`,
        r.weekday,
        r.siteName,
        a?.clockIn ? formatTime(a.clockIn) : "",
        a?.clockOut ? formatTime(a.clockOut) : "",
        a ? min(a.breakMinutes) : "",
        a ? min(a.workedMinutes) : "",
        a ? min(a.overtimeMinutes) : "",
        a ? min(a.legalOvertimeMinutes) : "",
        a ? min(a.nightMinutes) : "",
        a?.holidayWork && a.clockIn ? "休日" : r.isLegalHoliday ? "法休" : "",
        r.paidLeave ? "年休" : "",
        notes.join("、"),
      ];
      writeRow(ws, row, values, ["center", "center", "left", "center", "center", "center", "center", "center", "center", "center", "center", "center", "left"]);
      if (r.isLegalHoliday) {
        for (let c = 1; c <= cols; c++) ws.getCell(row, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE9E9" } };
      }
      row += 1;
    }

    const t = l.totals;
    const totalValues: (string | number | null)[] = [
      "月計", "", `出勤 ${t.workedDays}日`, "", "", formatMinutes(t.breakMinutes), formatMinutes(t.workedMinutes),
      formatMinutes(t.overtimeMinutes), formatMinutes(t.legalOvertimeMinutes), formatMinutes(t.nightMinutes),
      `${t.holidayWorkDays}日`, `${t.paidLeaveDays}日`, `修正 ${t.corrections}件 / 未退勤 ${t.openDays}件`,
    ];
    writeRow(ws, row, totalValues, ["center", "center", "left", "center", "center", "center", "center", "center", "center", "center", "center", "center", "left"]);
    for (let c = 1; c <= cols; c++) ws.getCell(row, c).font = { bold: true, size: 10 };
    applyBorderRange(ws, row, 1, row, cols);
    row += 2;
    ws.mergeCells(row, 1, row, cols);
    ws.getCell(row, 1).value = "確認者:　　　　　　　　　　印　　／　本人確認:　　　　　　　　　　印";
    ws.getCell(row, 1).font = { size: 10 };
  }

  await downloadWorkbook(wb, filename);
}
