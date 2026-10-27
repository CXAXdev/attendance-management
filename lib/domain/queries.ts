import type { Database, Shift, Site } from "@/lib/types";

// 画面横断で使う読み取りクエリ群(派生データ)

/** 指定従業員の指定日のシフト(現場つき) */
export function shiftsForEmployeeOnDate(
  db: Database,
  employeeId: string,
  date: string
): { shift: Shift; site: Site | undefined }[] {
  const shiftIds = new Set(
    db.shiftAssignments
      .filter((sa) => sa.employeeId === employeeId)
      .map((sa) => sa.shiftId)
  );
  return db.shifts
    .filter((s) => s.date === date && shiftIds.has(s.id))
    .map((shift) => ({
      shift,
      site: db.sites.find((s) => s.id === shift.siteId),
    }));
}

/** 指定従業員の今後のシフト(fromYmd 以降)を日付順に。limit で件数制限 */
export function upcomingShiftsForEmployee(
  db: Database,
  employeeId: string,
  fromYmd: string,
  limit?: number
): { shift: Shift; site: Site | undefined }[] {
  const shiftIds = new Set(
    db.shiftAssignments
      .filter((sa) => sa.employeeId === employeeId)
      .map((sa) => sa.shiftId)
  );
  const list = db.shifts
    .filter((s) => shiftIds.has(s.id) && s.date >= fromYmd)
    .sort((a, b) =>
      a.date !== b.date
        ? a.date < b.date
          ? -1
          : 1
        : a.startTime < b.startTime
        ? -1
        : 1
    )
    .map((shift) => ({
      shift,
      site: db.sites.find((s) => s.id === shift.siteId),
    }));
  return typeof limit === "number" ? list.slice(0, limit) : list;
}

/** 指定従業員・指定年月のシフトを date -> shift[] の Map にまとめる */
export function shiftMapForEmployeeMonth(
  db: Database,
  employeeId: string,
  year: number,
  month: number
): Map<string, { shift: Shift; site: Site | undefined }[]> {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const shiftIds = new Set(
    db.shiftAssignments
      .filter((sa) => sa.employeeId === employeeId)
      .map((sa) => sa.shiftId)
  );
  const map = new Map<string, { shift: Shift; site: Site | undefined }[]>();
  for (const shift of db.shifts) {
    if (!shiftIds.has(shift.id) || !shift.date.startsWith(prefix)) continue;
    const entry = { shift, site: db.sites.find((s) => s.id === shift.siteId) };
    const arr = map.get(shift.date) ?? [];
    arr.push(entry);
    map.set(shift.date, arr);
  }
  return map;
}

/**
 * 進行中(出勤済み・未退勤)の勤怠。日付をまたいだ勤務でも拾えるよう日付で絞らない。
 * 複数あれば最新の出勤を返す(本来は1件のみ)。
 */
export function openAttendanceForEmployee(db: Database, employeeId: string) {
  return db.attendances
    .filter((a) => a.employeeId === employeeId && a.clockIn && !a.clockOut)
    .sort((a, b) => ((a.clockIn ?? "") < (b.clockIn ?? "") ? 1 : -1))[0];
}

/** 退勤忘れ: 過去日のまま未退勤になっている勤怠(管理者が修正する) */
export function staleOpenAttendances(db: Database, today: string) {
  return db.attendances
    .filter((a) => a.clockIn && !a.clockOut && a.date < today)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** 指定従業員の指定日の出退勤実績 */
export function attendanceForEmployeeOnDate(
  db: Database,
  employeeId: string,
  date: string
) {
  return db.attendances.find(
    (a) => a.employeeId === employeeId && a.date === date
  );
}

/** 指定日の引き継ぎ(現場・作成者つき) */
export function handoversOnDate(db: Database, date: string) {
  return db.handovers
    .filter((h) => h.date === date)
    .map((h) => ({
      handover: h,
      site: db.sites.find((s) => s.id === h.siteId),
      author: db.employees.find((e) => e.id === h.authorId),
    }));
}

/** 引き継ぎの表示期限(既読から24時間) */
export const HANDOVER_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * 表示対象の引き継ぎ(新しい順・現場/作成者つき)。
 * 未読は残し、既読になったものは24時間で消える運用に合わせて期限内のみ返す。
 */
export function recentHandovers(db: Database) {
  const now = Date.now();
  return db.handovers
    .filter(
      (h) => !h.readAt || now - new Date(h.readAt).getTime() < HANDOVER_TTL_MS
    )
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((h) => ({
      handover: h,
      site: db.sites.find((s) => s.id === h.siteId),
      author: db.employees.find((e) => e.id === h.authorId),
    }));
}

/** 公開済みの通達を新しい順に */
export function publishedNotices(db: Database) {
  return [...db.notices].sort((a, b) =>
    a.publishedAt < b.publishedAt ? 1 : -1
  );
}
