import type { Database, EmploymentCondition } from "@/lib/types";

// 雇用条件(履歴)の参照。給与・勤怠計算・労務チェックが共通で使う。

/** 指定日に有効な労働条件を取得 */
export function conditionForDate(
  db: Database,
  employeeId: string,
  date: string
): EmploymentCondition | undefined {
  return db.employmentConditions
    .filter((c) => c.employeeId === employeeId)
    .filter(
      (c) =>
        c.effectiveFrom <= date &&
        (c.effectiveTo === null || c.effectiveTo >= date)
    )
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
}

/** 現行(effectiveTo=null)の労働条件 */
export function currentCondition(
  db: Database,
  employeeId: string
): EmploymentCondition | undefined {
  return db.employmentConditions
    .filter((c) => c.employeeId === employeeId && c.effectiveTo === null)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
}
