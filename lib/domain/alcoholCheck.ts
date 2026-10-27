import type { Database, Employee, AlcoholCheckRecord } from "@/lib/types";

// ============================================================================
// アルコールチェック記録簿(月次)の集計
//
// 1行 = 1人 × 1日(出勤前の1回)。
// 出勤実績(clockIn)があるのに記録が無い日は「未実施」として洗い出す。
// 記録は1年間の保存義務があるため、月単位で出力できる形にまとめる。
// ============================================================================

export interface AlcoholLogRow {
  date: string; // YYYY-MM-DD
  employeeId: string;
  employeeName: string;
  siteName: string;
  check: AlcoholCheckRecord | null;
  /** 出勤実績があるのに記録が無い */
  missing: boolean;
}

export interface AlcoholCheckLog {
  year: number;
  month: number;
  rows: AlcoholLogRow[];
  /** 記録件数 */
  recordCount: number;
  /** 検出ありの件数 */
  detectedCount: number;
  /** 未実施(出勤したのに記録が無い)の件数 */
  missingCount: number;
}

/**
 * 確認者に指定できる従業員。
 * 安全運転管理者(=管理者)と、現場で確認を代行しうる現場監督を候補にする。
 * 本人による実施(アプリ入力)も記録として残るため、現在の確認者が候補に
 * 含まれない場合は呼び出し側でその1名を追加して表示する。
 */
export function confirmerCandidates(db: Database): Employee[] {
  return db.employees.filter(
    (e) => e.active && (e.role === "admin" || e.jobTypes.includes("supervisor"))
  );
}

/**
 * 指定従業員・日付の記録。同じ日に複数あれば「検出あり」を優先し、無ければ最新。
 * (検出後に再チェックしても、記録簿から検出記録が消えないようにする)
 */
export function findAlcoholCheck(
  db: Database,
  employeeId: string,
  date: string
): AlcoholCheckRecord | null {
  const list = db.alcoholChecks
    .filter((r) => r.employeeId === employeeId && r.date === date)
    .sort((a, b) => a.checkedAt.localeCompare(b.checkedAt));
  if (list.length === 0) return null;
  return list.find((r) => r.detected) ?? list[list.length - 1];
}

/** その日に「検出あり」の記録があるか(当日の出勤を止める判定) */
export function hasDetectedAlcoholOn(
  db: Database,
  employeeId: string,
  date: string
): boolean {
  return db.alcoholChecks.some(
    (r) => r.employeeId === employeeId && r.date === date && r.detected
  );
}

/**
 * 指定年月の記録簿を作る。
 * 対象行 = その月の「アルコールチェック記録がある人日」+「出勤実績がある人日」。
 * (検出ありで出勤できなかった日も記録として残るため、両者の和集合を取る)
 */
export function buildAlcoholCheckLog(
  db: Database,
  year: number,
  month: number
): AlcoholCheckLog {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;

  // date|employeeId をキーに、対象の人日を集める
  const keys = new Map<string, { date: string; employeeId: string }>();
  const addKey = (date: string, employeeId: string) => {
    if (!date.startsWith(prefix)) return;
    keys.set(`${date}|${employeeId}`, { date, employeeId });
  };
  for (const r of db.alcoholChecks) addKey(r.date, r.employeeId);
  for (const a of db.attendances) if (a.clockIn) addKey(a.date, a.employeeId);

  const empName = (id: string) =>
    db.employees.find((e) => e.id === id)?.name ?? "(不明)";
  const siteName = (id: string | null | undefined) =>
    id ? db.sites.find((s) => s.id === id)?.name ?? "" : "";

  const rows: AlcoholLogRow[] = [];
  for (const { date, employeeId } of keys.values()) {
    const check = findAlcoholCheck(db, employeeId, date);
    const att = db.attendances.find(
      (a) => a.employeeId === employeeId && a.date === date
    );

    rows.push({
      date,
      employeeId,
      employeeName: empName(employeeId),
      siteName: siteName(att?.siteId ?? check?.siteId),
      check,
      // 未実施の判定は出勤実績がある日のみ
      missing: !!att?.clockIn && !check,
    });
  }

  // 日付昇順 → 従業員マスターの並び順
  const empOrder = new Map(db.employees.map((e, i) => [e.id, i]));
  rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (empOrder.get(a.employeeId) ?? 999) - (empOrder.get(b.employeeId) ?? 999)
  );

  const recordCount = rows.filter((r) => r.check).length;
  const detectedCount = rows.filter((r) => r.check?.detected).length;
  const missingCount = rows.filter((r) => r.missing).length;

  return { year, month, rows, recordCount, detectedCount, missingCount };
}
