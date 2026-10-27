import type { Attendance, Database, Employee } from "@/lib/types";
import { WEEK } from "@/lib/format";

// ============================================================================
// 出勤簿(従業員別・月別の日ごとの労働時間記録)。
// 労基署の調査で求められる「始業・終業時刻、休憩、労働時間(所定外/法定外/深夜/休日)」
// を日単位で並べ、月計を出す。画面表示と Excel 出力で共用する。
// ============================================================================

export interface LedgerRow {
  date: string; // YYYY-MM-DD
  weekday: string;
  isLegalHoliday: boolean;
  attendance: Attendance | null;
  siteName: string;
  /** 年休を取得した日 */
  paidLeave: boolean;
  /** 出勤したが未退勤(退勤忘れ) */
  open: boolean;
  corrected: boolean;
}

export interface LedgerTotals {
  workedDays: number;
  workedMinutes: number;
  breakMinutes: number;
  overtimeMinutes: number;
  legalOvertimeMinutes: number;
  nightMinutes: number;
  holidayWorkDays: number;
  holidayWorkMinutes: number;
  paidLeaveDays: number;
  corrections: number;
  openDays: number;
}

export interface Ledger {
  employee: Employee;
  year: number;
  month: number;
  rows: LedgerRow[];
  totals: LedgerTotals;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function buildLedger(db: Database, employee: Employee, year: number, month: number): Ledger {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const siteName = (id: string) => db.sites.find((s) => s.id === id)?.name ?? "";
  const atts = db.attendances.filter((a) => a.employeeId === employee.id && a.date.startsWith(prefix));
  const leaves = new Set(
    db.paidLeaves
      .filter((p) => p.employeeId === employee.id && p.kind === "use" && p.date.startsWith(prefix))
      .map((p) => p.date)
  );

  const rows: LedgerRow[] = [];
  const totals: LedgerTotals = {
    workedDays: 0,
    workedMinutes: 0,
    breakMinutes: 0,
    overtimeMinutes: 0,
    legalOvertimeMinutes: 0,
    nightMinutes: 0,
    holidayWorkDays: 0,
    holidayWorkMinutes: 0,
    paidLeaveDays: 0,
    corrections: 0,
    openDays: 0,
  };

  for (let d = 1; d <= daysInMonth(year, month); d++) {
    const date = `${prefix}-${String(d).padStart(2, "0")}`;
    const dow = new Date(`${date}T00:00:00`).getDay();
    // 同日に複数あれば出勤時刻の早いものを採用(重複は台帳画面で気付けるよう corrected 扱いにはしない)
    const att = atts.filter((a) => a.date === date).sort((a, b) => (a.clockIn ?? "").localeCompare(b.clockIn ?? ""))[0] ?? null;
    const paidLeave = leaves.has(date);
    const open = !!att?.clockIn && !att.clockOut;
    rows.push({
      date,
      weekday: WEEK[dow],
      isLegalHoliday: dow === db.settings.legalHolidayWeekday,
      attendance: att,
      siteName: att ? siteName(att.siteId) : "",
      paidLeave,
      open,
      corrected: (att?.corrections.length ?? 0) > 0,
    });
    if (att?.clockIn) {
      totals.workedDays += 1;
      totals.workedMinutes += att.workedMinutes;
      totals.breakMinutes += att.breakMinutes;
      totals.overtimeMinutes += att.overtimeMinutes;
      totals.legalOvertimeMinutes += att.legalOvertimeMinutes;
      totals.nightMinutes += att.nightMinutes;
      if (att.holidayWork) {
        totals.holidayWorkDays += 1;
        totals.holidayWorkMinutes += att.workedMinutes;
      }
      totals.corrections += att.corrections.length;
      if (open) totals.openDays += 1;
    }
    if (paidLeave) totals.paidLeaveDays += 1;
  }
  return { employee, year, month, rows, totals };
}

/**
 * 台帳の対象者: 従業員(管理者除く)のうち、在籍中 または その月に記録がある人。
 * 退職者の過去分も出せるようにする(記録の保存義務)。
 */
export function employeesForLedger(db: Database, year: number, month: number): Employee[] {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const hasRecord = new Set(db.attendances.filter((a) => a.date.startsWith(prefix)).map((a) => a.employeeId));
  return db.employees.filter((e) => e.role === "employee" && (e.active || hasRecord.has(e.id)));
}
