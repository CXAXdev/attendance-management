import type { Database, ShiftAssignment, JobType } from "@/lib/types";
import { genId } from "@/lib/db/store";

// ============================================================================
// 半自動シフト生成
//
// 方針:
//   1. 管理者が「絶対に外せないメンバー(現場監督など)」を locked=true で先に手動配置。
//   2. 残った空き枠を、休暇希望・職種・既存配置を考慮して自動で埋める。
//
// 現状はルールベースのスタブ実装。将来 Claude API(claude-opus-4-8)に差し替える
// 想定で、入力(空き枠・候補者・制約)と出力(割当案)の境界を関数で固定している。
// generateShiftPlan() のシグネチャを保ったまま中身を AI 呼び出しに置換できる。
// ============================================================================

export interface ShiftGenInput {
  /** 対象シフトID */
  shiftId: string;
  /** その現場・日付で必要な (職種, 人数) */
  needs: { jobType: string; count: number }[];
}

export interface ShiftGenResult {
  /** 新規に提案された割当(source="ai") */
  proposals: ShiftAssignment[];
  /** 埋められなかった不足枠の説明 */
  shortages: string[];
}

/**
 * 空き枠を自動で埋める(ルールベース)。
 * - locked 済み(手動固定)の従業員は再配置しない
 * - 休暇希望(leaveRequests)に該当する従業員は除外
 * - 同日に既に他現場へ配置済みの従業員は除外
 * - 職種が一致する従業員を優先
 */
export function generateShiftPlan(
  db: Database,
  input: ShiftGenInput
): ShiftGenResult {
  const shift = db.shifts.find((s) => s.id === input.shiftId);
  if (!shift) return { proposals: [], shortages: ["対象シフトが見つかりません"] };

  const date = shift.date;

  // その日に既にどこかへ配置済みの従業員
  const sameDayShiftIds = new Set(
    db.shifts.filter((s) => s.date === date).map((s) => s.id)
  );
  const busy = new Set(
    db.shiftAssignments
      .filter((sa) => sameDayShiftIds.has(sa.shiftId))
      .map((sa) => sa.employeeId)
  );

  // この日に「休みたい(×)」を出している従業員のみ除外する。
  // ▲(できれば休みたい)・△(半休等)は出勤可能なので候補に残す。
  const onLeave = new Set(
    db.leaveRequests
      .filter((l) => l.date === date && l.type === "off")
      .map((l) => l.employeeId)
  );

  // 既にこのシフトに配置済みの職種別人数
  const current = db.shiftAssignments.filter((sa) => sa.shiftId === input.shiftId);
  const proposals: ShiftAssignment[] = [];
  const shortages: string[] = [];

  for (const need of input.needs) {
    const already = current
      .map((sa) => db.employees.find((e) => e.id === sa.employeeId))
      .filter((e) => e?.jobTypes.includes(need.jobType as JobType)).length;

    let remaining = need.count - already;
    if (remaining <= 0) continue;

    const candidates = db.employees.filter(
      (e) =>
        e.active &&
        e.role === "employee" &&
        e.jobTypes.includes(need.jobType as JobType) &&
        !busy.has(e.id) &&
        !onLeave.has(e.id)
    );

    for (const c of candidates) {
      if (remaining <= 0) break;
      const assignment: ShiftAssignment = {
        id: genId("sa"),
        shiftId: input.shiftId,
        employeeId: c.id,
        source: "ai",
        locked: false,
      };
      proposals.push(assignment);
      busy.add(c.id); // 同一生成内での二重配置を防ぐ
      remaining -= 1;
    }

    if (remaining > 0) {
      shortages.push(`${need.jobType}: あと${remaining}人不足(候補者が足りません)`);
    }
  }

  return { proposals, shortages };
}
