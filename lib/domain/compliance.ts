import type {
  ComplianceAlert,
  ComplianceRule,
  ComplianceSeverity,
  Database,
  ComplianceCheckPhase,
} from "@/lib/types";
import { JOB_TYPE_LABEL } from "@/lib/types";
import { genId } from "@/lib/db/store";
import { conditionForDate } from "./conditions";
import { allPaidLeaveSummaries } from "./paidLeave";
import { formatMinutes } from "@/lib/format";

// ============================================================================
// 労務コンプライアンスチェック(ダブルチェック方式)
//   phase = "planned": シフト作成時に予定値ベースで事前チェック(未然防止)
//   phase = "actual" : 月末に実績値ベースで再チェック(実績検証)
//
// 実績チェックの観点(労基署の調査で見られるもの):
//   連続勤務 / 週1日の法定休日 / 月45h・年360h の時間外(36協定)
//   / 月100h・2〜6ヶ月平均80h(特別条項の上限) / 年休5日の取得義務
// 閾値は settings(管理者が変更可)。
// ============================================================================

function nameOf(db: Database, employeeId: string): string {
  return db.employees.find((e) => e.id === employeeId)?.name ?? employeeId;
}

function siteNameOf(db: Database, siteId: string): string {
  return db.sites.find((s) => s.id === siteId)?.name ?? siteId;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** 月の初日と末日 */
export function monthRange(year: number, month: number): { start: string; end: string } {
  const last = new Date(year, month, 0).getDate();
  return { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${pad(last)}` };
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 連続する勤務日の最大連続数(YYYY-MM-DD の配列から) */
export function maxConsecutiveDays(dates: string[]): number {
  if (dates.length === 0) return 0;
  const sorted = [...new Set(dates)].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(`${sorted[i - 1]}T00:00:00`);
    const cur = new Date(`${sorted[i]}T00:00:00`);
    const gap = Math.round((cur.getTime() - prev.getTime()) / 86400000);
    if (gap === 1) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }
  return best;
}

function alert(
  phase: ComplianceCheckPhase,
  rule: ComplianceRule,
  severity: ComplianceSeverity,
  employeeId: string | null,
  siteId: string | null,
  periodStart: string,
  periodEnd: string,
  message: string,
  value: number,
  threshold: number,
  now: string
): ComplianceAlert {
  return { id: genId("ca"), phase, rule, severity, employeeId, siteId, periodStart, periodEnd, message, value, threshold, detectedAt: now };
}

/** 連続勤務チェックの遡り日数(期間開始前からの連続も数える) */
const LOOKBACK_DAYS = 14;

/**
 * 予定ベース(planned)のチェック。
 * シフト割当から各従業員の勤務予定日を集計し、連続勤務日数と現場要件をチェック。
 */
export function checkPlanned(db: Database, periodStart: string, periodEnd: string): ComplianceAlert[] {
  const alerts: ComplianceAlert[] = [];
  const now = new Date().toISOString();
  const lookStart = addDaysYmd(periodStart, -LOOKBACK_DAYS);

  const shiftDate = new Map(db.shifts.map((s) => [s.id, s.date]));
  const byEmp = new Map<string, string[]>();
  for (const sa of db.shiftAssignments) {
    const date = shiftDate.get(sa.shiftId);
    if (!date || date < lookStart || date > periodEnd) continue;
    const arr = byEmp.get(sa.employeeId) ?? [];
    arr.push(date);
    byEmp.set(sa.employeeId, arr);
  }
  // 期間前は実績(出勤)も連続に含める
  for (const a of db.attendances) {
    if (!a.clockIn || a.date < lookStart || a.date >= periodStart) continue;
    const arr = byEmp.get(a.employeeId) ?? [];
    arr.push(a.date);
    byEmp.set(a.employeeId, arr);
  }
  for (const [employeeId, dates] of byEmp) {
    if (!dates.some((d) => d >= periodStart)) continue;
    const cond = conditionForDate(db, employeeId, periodStart);
    const limit = cond?.maxConsecutiveDays ?? 6;
    const run = maxConsecutiveDays(dates);
    if (run > limit) {
      alerts.push(alert("planned", "consecutive_days", "violation", employeeId, null, periodStart, periodEnd,
        `${nameOf(db, employeeId)} さんのシフトが${run}日連続です(上限${limit}日)。`, run, limit, now));
    }
  }

  alerts.push(...checkSiteRequirements(db, periodStart, periodEnd, now));
  return alerts;
}

/** 現場ごとの必要職種・人数・監督要否を、当該期間のシフトが満たすか検証 */
function checkSiteRequirements(db: Database, periodStart: string, periodEnd: string, now: string): ComplianceAlert[] {
  const alerts: ComplianceAlert[] = [];
  const empById = new Map(db.employees.map((e) => [e.id, e]));

  for (const shift of db.shifts) {
    if (shift.date < periodStart || shift.date > periodEnd) continue;
    const assigned = db.shiftAssignments
      .filter((sa) => sa.shiftId === shift.id)
      .map((sa) => empById.get(sa.employeeId))
      .filter((e): e is NonNullable<typeof e> => !!e);
    const reqs = db.siteRequirements.filter((r) => r.siteId === shift.siteId);
    let supervisorChecked = false;
    for (const req of reqs) {
      const count = assigned.filter((e) => e.jobTypes.includes(req.jobType)).length;
      if (count < req.requiredCount) {
        alerts.push(alert("planned", "site_requirement_shortage", "warning", null, shift.siteId, shift.date, shift.date,
          `${siteNameOf(db, shift.siteId)}(${shift.date}) は${JOB_TYPE_LABEL[req.jobType]}が${count}/${req.requiredCount}人で不足しています。`,
          count, req.requiredCount, now));
      }
      if (req.requiresSupervisor && !supervisorChecked) {
        supervisorChecked = true; // 監督の警告は現場・日ごとに1回だけ
        if (!assigned.some((e) => e.jobTypes.includes("supervisor"))) {
          alerts.push(alert("planned", "site_requirement_shortage", "warning", null, shift.siteId, shift.date, shift.date,
            `${siteNameOf(db, shift.siteId)}(${shift.date}) に現場監督が配置されていません。`, 0, 1, now));
        }
      }
    }
  }
  return alerts;
}

/** 月ごとの時間外・休日労働の集計(分) */
interface MonthlyOt {
  legalOvertime: number;
  holidayWork: number;
}

function monthlyOt(db: Database, employeeId: string, year: number, month: number): MonthlyOt {
  const prefix = `${year}-${pad(month)}`;
  let legalOvertime = 0;
  let holidayWork = 0;
  for (const a of db.attendances) {
    if (a.employeeId !== employeeId || !a.date.startsWith(prefix) || !a.clockIn) continue;
    legalOvertime += a.legalOvertimeMinutes;
    if (a.holidayWork) holidayWork += a.workedMinutes;
  }
  return { legalOvertime, holidayWork };
}

function prevMonth(year: number, month: number, back: number): { year: number; month: number } {
  const d = new Date(year, month - 1 - back, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/** 年度(開始月 settings.fiscalYearStartMonth)の最初の年月 */
function fiscalYearStart(year: number, month: number, startMonth: number): { year: number; month: number } {
  return month >= startMonth ? { year, month: startMonth } : { year: year - 1, month: startMonth };
}

/**
 * 実績ベース(actual)のチェック。月末に実勤怠から再検証。
 */
export function checkActual(db: Database, year: number, month: number): ComplianceAlert[] {
  const alerts: ComplianceAlert[] = [];
  const now = new Date().toISOString();
  const { start: periodStart, end: periodEnd } = monthRange(year, month);
  const s = db.settings;
  const lookStart = addDaysYmd(periodStart, -LOOKBACK_DAYS);

  const employees = db.employees.filter((e) => e.role === "employee");
  for (const emp of employees) {
    const inMonth = db.attendances.filter(
      (a) => a.employeeId === emp.id && a.clockIn && a.date >= periodStart && a.date <= periodEnd
    );
    if (inMonth.length === 0) continue;
    const cond = conditionForDate(db, emp.id, inMonth[0].date);
    const name = nameOf(db, emp.id);

    // 連続勤務日数(前月末からの連続も含める)
    const datesWithLookback = db.attendances
      .filter((a) => a.employeeId === emp.id && a.clockIn && a.date >= lookStart && a.date <= periodEnd)
      .map((a) => a.date);
    const limit = cond?.maxConsecutiveDays ?? 6;
    const run = maxConsecutiveDays(datesWithLookback);
    if (run > limit) {
      alerts.push(alert("actual", "consecutive_days", "violation", emp.id, null, periodStart, periodEnd,
        `${name} さんは実績で${run}日連続勤務です(上限${limit}日)。`, run, limit, now));
    }

    // 週1日の法定休日(月曜起算の週が月内に収まるもの)
    const worked = new Set(inMonth.map((a) => a.date));
    for (let d = periodStart; d <= periodEnd; d = addDaysYmd(d, 1)) {
      if (new Date(`${d}T00:00:00`).getDay() !== 1) continue; // 月曜
      const weekEnd = addDaysYmd(d, 6);
      if (weekEnd > periodEnd) break;
      let all = true;
      for (let i = 0; i < 7; i++) if (!worked.has(addDaysYmd(d, i))) { all = false; break; }
      if (all) {
        alerts.push(alert("actual", "no_weekly_rest", "violation", emp.id, null, d, weekEnd,
          `${name} さんは ${d}〜${weekEnd} の週に休日がありません(週1日の法定休日)。`, 7, 6, now));
      }
    }

    // 月の時間外(法定外)
    const cur = monthlyOt(db, emp.id, year, month);
    if (cur.legalOvertime > s.overtimeMonthlyLimitMinutes) {
      alerts.push(alert("actual", "monthly_overtime", "violation", emp.id, null, periodStart, periodEnd,
        `${name} さんの月の時間外労働が ${formatMinutes(cur.legalOvertime)} で上限(${formatMinutes(s.overtimeMonthlyLimitMinutes)})を超えています。`,
        cur.legalOvertime, s.overtimeMonthlyLimitMinutes, now));
    } else if (cur.legalOvertime > s.overtimeMonthlyWarnMinutes) {
      alerts.push(alert("actual", "monthly_overtime", "warning", emp.id, null, periodStart, periodEnd,
        `${name} さんの月の時間外労働が ${formatMinutes(cur.legalOvertime)} です(警告ライン ${formatMinutes(s.overtimeMonthlyWarnMinutes)}、上限 ${formatMinutes(s.overtimeMonthlyLimitMinutes)})。`,
        cur.legalOvertime, s.overtimeMonthlyWarnMinutes, now));
    }

    // 月100h(時間外+休日労働)
    const capTotal = cur.legalOvertime + cur.holidayWork;
    if (capTotal > s.overtimeMonthlyCapMinutes) {
      alerts.push(alert("actual", "monthly_overtime_cap", "violation", emp.id, null, periodStart, periodEnd,
        `${name} さんの時間外+休日労働が ${formatMinutes(capTotal)} で月の絶対上限(${formatMinutes(s.overtimeMonthlyCapMinutes)})を超えています。`,
        capTotal, s.overtimeMonthlyCapMinutes, now));
    }

    // 2〜6ヶ月平均80h
    for (let n = 2; n <= 6; n++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        const pm = prevMonth(year, month, k);
        const m = monthlyOt(db, emp.id, pm.year, pm.month);
        sum += m.legalOvertime + m.holidayWork;
      }
      const avg = Math.round(sum / n);
      if (avg > s.overtimeMultiMonthAvgMinutes) {
        alerts.push(alert("actual", "multi_month_overtime", "violation", emp.id, null, periodStart, periodEnd,
          `${name} さんの直近${n}ヶ月平均の時間外+休日労働が ${formatMinutes(avg)} で上限(${formatMinutes(s.overtimeMultiMonthAvgMinutes)})を超えています。`,
          avg, s.overtimeMultiMonthAvgMinutes, now));
        break; // 1件で十分
      }
    }

    // 年360h(年度累計)
    const fy = fiscalYearStart(year, month, s.fiscalYearStartMonth);
    let annual = 0;
    for (let y = fy.year, m = fy.month; y < year || (y === year && m <= month); ) {
      annual += monthlyOt(db, emp.id, y, m).legalOvertime;
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    if (annual > s.overtimeAnnualLimitMinutes) {
      alerts.push(alert("actual", "annual_overtime", "violation", emp.id, null, `${fy.year}-${pad(fy.month)}-01`, periodEnd,
        `${name} さんの年度累計の時間外労働が ${formatMinutes(annual)} で上限(${formatMinutes(s.overtimeAnnualLimitMinutes)})を超えています。`,
        annual, s.overtimeAnnualLimitMinutes, now));
    } else if (annual > s.overtimeAnnualLimitMinutes * 0.8) {
      alerts.push(alert("actual", "annual_overtime", "warning", emp.id, null, `${fy.year}-${pad(fy.month)}-01`, periodEnd,
        `${name} さんの年度累計の時間外労働が ${formatMinutes(annual)} で上限(${formatMinutes(s.overtimeAnnualLimitMinutes)})の8割を超えています。`,
        annual, s.overtimeAnnualLimitMinutes, now));
    }
  }

  // 年休5日の取得義務(月末時点)
  for (const sum of allPaidLeaveSummaries(db, periodEnd)) {
    const o = sum.obligation;
    if (o.status === "violation" || o.status === "warning") {
      alerts.push(alert("actual", "paid_leave_shortfall", o.status === "violation" ? "violation" : "warning", sum.employeeId, null,
        o.baseDate ?? periodStart, o.deadline ?? periodEnd,
        `${sum.name} さんは基準日 ${o.baseDate} からの1年で年休を ${o.usedInYear}日しか取得していません(義務 ${o.required}日、期限 ${o.deadline})。`,
        o.usedInYear, o.required, now));
    }
  }

  return alerts;
}

/** phase を日本語ラベルに */
export function phaseLabel(phase: ComplianceCheckPhase): string {
  return phase === "planned" ? "予定(シフト作成時)" : "実績(月末)";
}
