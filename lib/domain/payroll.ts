import type { Database, PayrollRecord, Site } from "@/lib/types";
import { genId } from "@/lib/db/store";

// ============================================================================
// 給与計算
// 従業員マスター(雇用条件) × 勤怠実績 × 現場単価 から月次給与を算出する。
//   従業員マスター → 給与計算 → (年末調整 TaxRecord) のデータの流れの中核。
// ============================================================================

// 雇用条件の参照は conditions.ts に集約(他モジュールからの再利用のため)
export { conditionForDate } from "./conditions";
import { conditionForDate } from "./conditions";

function inMonth(date: string, year: number, month: number): boolean {
  const [y, m] = date.split("-").map(Number);
  return y === year && m === month;
}

/**
 * 1人・1ヶ月分の給与を計算する。給与は雇用区分ではなく単価区分(payBasis)で決まる。
 * - 日給(daily): baseRate × 出勤日数 を基本給、残業は時給換算 × 割増
 * - 時給(hourly): baseRate(時給) × 実労働時間
 * - 月給(monthly): baseRate を月額固定で1回計上、残業は時給換算(月20日想定)
 * - 現場手当: 現場の hourlyRate と基準時給の差分を加算(現場ごとの単価反映)
 */
export function calcMonthlyPayroll(
  db: Database,
  employeeId: string,
  year: number,
  month: number
): PayrollRecord {
  const records = db.attendances.filter(
    (a) =>
      a.employeeId === employeeId &&
      inMonth(a.date, year, month) &&
      a.clockIn &&
      a.clockOut
  );

  const siteById = new Map<string, Site>(db.sites.map((s) => [s.id, s]));

  let baseAmount = 0;
  let overtimeAmount = 0;
  let siteAllowance = 0;
  let workedMinutes = 0;
  let overtimeMinutes = 0;
  const workedDays = records.length;

  // 月給者は基本給を月額固定で1回だけ計上する(出勤日数に依らない)
  const monthCond = conditionForDate(
    db,
    employeeId,
    `${year}-${String(month).padStart(2, "0")}-01`
  );
  if (monthCond?.payBasis === "monthly" && workedDays > 0) {
    baseAmount += monthCond.baseRate;
  }

  for (const a of records) {
    const cond = conditionForDate(db, employeeId, a.date);
    if (!cond) continue;

    workedMinutes += a.workedMinutes;
    overtimeMinutes += a.overtimeMinutes;

    // 通常労働(残業を除いた所定内)
    const regularMinutes = Math.max(0, a.workedMinutes - a.overtimeMinutes);

    // 残業計算に使う時給換算(単価区分ごと)
    const hourlyEquivalent =
      cond.payBasis === "hourly"
        ? cond.baseRate
        : cond.payBasis === "daily"
        ? cond.baseRate / (cond.scheduledDailyMinutes / 60)
        : cond.baseRate / ((cond.scheduledDailyMinutes / 60) * 20); // 月給: 月20日想定

    if (cond.payBasis === "daily") {
      // 日給: 1日あたり baseRate
      baseAmount += cond.baseRate;
    } else if (cond.payBasis === "hourly") {
      // 時給: 所定内の実労働時間 × 時給
      baseAmount += (regularMinutes / 60) * cond.baseRate;
    }
    // 月給(monthly)の所定内はループ外の固定給に含む

    overtimeAmount +=
      (a.overtimeMinutes / 60) * hourlyEquivalent * cond.overtimeMultiplier;

    // 現場手当: 現場単価が基準時給を上回る分を実労働時間に応じて加算
    const site = siteById.get(a.siteId);
    if (site) {
      if (cond.payBasis === "daily") {
        // 日給者には現場単価の一部を手当として加算(簡易)
        siteAllowance += (a.workedMinutes / 60) * (site.hourlyRate * 0.1);
      } else {
        const extra = site.hourlyRate - hourlyEquivalent;
        if (extra > 0) siteAllowance += (a.workedMinutes / 60) * extra;
      }
    }
  }

  const grossAmount = Math.round(baseAmount + overtimeAmount + siteAllowance);

  return {
    id: genId("pay"),
    employeeId,
    year,
    month,
    baseAmount: Math.round(baseAmount),
    overtimeAmount: Math.round(overtimeAmount),
    siteAllowance: Math.round(siteAllowance),
    grossAmount,
    workedDays,
    workedMinutes,
    overtimeMinutes,
  };
}

/** 全従業員の月次給与を一括計算 */
export function calcAllPayroll(
  db: Database,
  year: number,
  month: number
): PayrollRecord[] {
  return db.employees
    .filter((e) => e.role === "employee" && e.active)
    .map((e) => calcMonthlyPayroll(db, e.id, year, month));
}
