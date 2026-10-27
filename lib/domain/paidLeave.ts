import type { Database, Employee, PaidLeave } from "@/lib/types";

// ============================================================================
// 年次有給休暇管理簿(労基則24条の7): 基準日・付与日数・取得日数・残日数。
// 付与は2年で時効。年10日以上付与された人は基準日から1年以内に5日の取得義務。
// 残日数は簡易計算(有効な付与の合計 - 最古の有効付与日以降の取得)。
// ============================================================================

export type ObligationStatus = "ok" | "pending" | "warning" | "violation" | "none";

export interface PaidLeaveSummary {
  employeeId: string;
  name: string;
  active: boolean;
  /** 有効(時効前)な付与日数の合計 */
  granted: number;
  /** 有効期間内の取得日数 */
  used: number;
  balance: number;
  /** 直近の基準日(付与日) */
  lastGrantDate: string | null;
  /** 5日取得義務 */
  obligation: {
    status: ObligationStatus;
    baseDate: string | null;
    deadline: string | null;
    usedInYear: number;
    required: number;
  };
}

export interface LedgerLine extends PaidLeave {
  runningBalance: number;
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addYearsYmd(ymd: string, years: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setFullYear(d.getFullYear() + years);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function paidLeaveRecords(db: Database, employeeId: string): PaidLeave[] {
  return db.paidLeaves
    .filter((p) => p.employeeId === employeeId)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "grant" ? -1 : 1));
}

export function paidLeaveSummary(db: Database, emp: Employee, asOf: string): PaidLeaveSummary {
  const records = paidLeaveRecords(db, emp.id);
  const grants = records.filter((p) => p.kind === "grant" && p.date <= asOf);
  const validGrants = grants.filter((p) => (p.expiresOn ?? addYearsYmd(p.date, 2)) > asOf);
  const granted = validGrants.reduce((s, p) => s + p.days, 0);
  const from = validGrants[0]?.date ?? null;
  const used = records
    .filter((p) => p.kind === "use" && p.date <= asOf && (from === null || p.date >= from))
    .reduce((s, p) => s + p.days, 0);
  const balance = Math.max(0, granted - used);

  // 5日取得義務: 直近の「10日以上の付与」を基準日とし、その1年間の取得日数を見る
  const base = [...grants].reverse().find((g) => g.days >= 10) ?? null;
  let obligation: PaidLeaveSummary["obligation"] = {
    status: "none",
    baseDate: null,
    deadline: null,
    usedInYear: 0,
    required: 5,
  };
  if (base) {
    const deadline = addDaysYmd(addYearsYmd(base.date, 1), -1);
    const usedInYear = records
      .filter((p) => p.kind === "use" && p.date >= base.date && p.date <= deadline)
      .reduce((s, p) => s + p.days, 0);
    let status: ObligationStatus;
    if (usedInYear >= 5) status = "ok";
    else if (asOf > deadline) status = "violation";
    else {
      // 期限まで90日を切っていたら警告
      const daysLeft = Math.round((new Date(`${deadline}T00:00:00`).getTime() - new Date(`${asOf}T00:00:00`).getTime()) / 86400000);
      status = daysLeft <= 90 ? "warning" : "pending";
    }
    obligation = { status, baseDate: base.date, deadline, usedInYear, required: 5 };
  }

  return {
    employeeId: emp.id,
    name: emp.name,
    active: emp.active,
    granted,
    used,
    balance,
    lastGrantDate: grants[grants.length - 1]?.date ?? null,
    obligation,
  };
}

/** 従業員全員(管理者除く)の年休サマリー。退職者も含める(記録保存のため) */
export function allPaidLeaveSummaries(db: Database, asOf: string): PaidLeaveSummary[] {
  return db.employees
    .filter((e) => e.role === "employee")
    .map((e) => paidLeaveSummary(db, e, asOf));
}

/** 管理簿の明細(残日数の推移つき) */
export function paidLeaveLedger(db: Database, employeeId: string): LedgerLine[] {
  let bal = 0;
  return paidLeaveRecords(db, employeeId).map((p) => {
    bal += p.kind === "grant" ? p.days : -p.days;
    return { ...p, runningBalance: bal };
  });
}

export const OBLIGATION_LABEL: Record<ObligationStatus, string> = {
  ok: "5日取得済み",
  pending: "取得中",
  warning: "期限間近(未達)",
  violation: "未達(期限超過)",
  none: "対象外",
};
