import type { Database, Employee, Site } from "@/lib/types";
import { todayYmd, formatTime } from "@/lib/format";

// ============================================================================
// 管理者ダッシュボードの「出勤予定ボード」(本日を含む5日分)
//
// 1日 = 1枚のカード。カードの中を現場ごとに区切り、割り当てられた従業員を並べる。
// 本日のカードだけは打刻状況(出勤中/退勤済み/未出勤/遅刻)を反映する。
// ============================================================================

/** 遅刻・未出勤と判定する猶予(分) */
export const LATE_THRESHOLD_MINUTES = 10;

export type PersonStatus =
  | "planned" // 予定(打刻前・当日以外)
  | "working" // 出勤中
  | "done" // 退勤済み
  | "late" // 遅刻して出勤
  | "absent"; // 予定開始を過ぎても打刻なし

export interface BoardPerson {
  assignmentId: string;
  employeeId: string;
  name: string;
  status: PersonStatus;
  /** バッジに添える補足(遅刻分数など) */
  detail?: string;
  /** 打刻済みで現場変更できない */
  clockedIn: boolean;
}

export interface BoardSite {
  siteId: string;
  siteName: string;
  /** その日・その現場のシフト(無ければ null) */
  shiftId: string | null;
  startTime: string;
  endTime: string;
  people: BoardPerson[];
}

export interface BoardAlert {
  kind: "absent" | "late";
  employeeName: string;
  siteName: string;
  detail: string;
}

export interface BoardDay {
  date: string; // YYYY-MM-DD
  isToday: boolean;
  /** その日にシフトのある現場(人が0人でも表示する。並びは現場マスター順) */
  sites: BoardSite[];
  /** 本日のみ。未出勤・遅刻 */
  alerts: BoardAlert[];
  /** その日の予定人数 */
  total: number;
}

/** fromYmd から count 日分の日付(YYYY-MM-DD)を返す */
export function daysFrom(fromYmd: string, count: number): string[] {
  const base = new Date(`${fromYmd}T00:00:00`);
  const list: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    list.push(todayYmd(d));
  }
  return list;
}

/** HH:mm を当日0時からの分に直す */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * 指定日の出勤予定ボードを作る。
 * 打刻状況を見るのは today と同じ日付のときだけ(将来日は常に「予定」)。
 */
export function buildScheduleBoard(
  db: Database,
  dates: string[],
  now = new Date()
): BoardDay[] {
  const today = todayYmd(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const empName = (id: string) =>
    db.employees.find((e) => e.id === id)?.name ?? "(不明)";

  return dates.map((date) => {
    const isToday = date === today;
    const alerts: BoardAlert[] = [];

    const sites: BoardSite[] = [];
    for (const site of db.sites) {
      // 同じ現場・同じ日に時間帯の違うシフトが複数あれば、すべてブロックとして出す
      const siteShifts = db.shifts
        .filter((s) => s.siteId === site.id && s.date === date)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      for (const shift of siteShifts) {
      const people: BoardPerson[] = db.shiftAssignments
        .filter((sa) => sa.shiftId === shift.id)
        .map((sa) => {
          const att = isToday
            ? db.attendances.find(
                (a) => a.employeeId === sa.employeeId && a.date === date
              )
            : undefined;
          const name = empName(sa.employeeId);

          let status: PersonStatus = "planned";
          let detail: string | undefined;

          if (att?.clockIn && att.clockOut) {
            status = "done";
          } else if (att?.clockIn) {
            status =
              att.startDiffMinutes >= LATE_THRESHOLD_MINUTES
                ? "late"
                : "working";
            if (status === "late") {
              detail = `${att.startDiffMinutes}分遅刻`;
              alerts.push({
                kind: "late",
                employeeName: name,
                siteName: site.name,
                detail: `${att.startDiffMinutes}分 遅刻（出勤 ${formatTime(att.clockIn)}）`,
              });
            }
          } else if (
            isToday &&
            nowMinutes >= toMinutes(shift.startTime) + LATE_THRESHOLD_MINUTES
          ) {
            // 予定開始から猶予を過ぎても打刻が無い
            status = "absent";
            detail = "未出勤";
            alerts.push({
              kind: "absent",
              employeeName: name,
              siteName: site.name,
              detail: `予定 ${shift.startTime} 〜 出勤打刻なし`,
            });
          }

          return {
            assignmentId: sa.id,
            employeeId: sa.employeeId,
            name,
            status,
            detail,
            clockedIn: !!att?.clockIn,
          };
        });

      sites.push({
        siteId: site.id,
        siteName: site.name,
        shiftId: shift.id,
        startTime: shift.startTime,
        endTime: shift.endTime,
        people,
      });
      }
    }

    return {
      date,
      isToday,
      sites,
      alerts,
      total: sites.reduce((s, x) => s + x.people.length, 0),
    };
  });
}

/**
 * その日どの現場にも割り当てられていない従業員(「＋追加」の候補)。
 * 管理者(社長)自身は現場に立たないため除く。
 */
export function unassignedEmployees(db: Database, date: string): Employee[] {
  const shiftIds = new Set(
    db.shifts.filter((s) => s.date === date).map((s) => s.id)
  );
  const assigned = new Set(
    db.shiftAssignments
      .filter((sa) => shiftIds.has(sa.shiftId))
      .map((sa) => sa.employeeId)
  );
  return db.employees.filter(
    (e) => e.active && e.role !== "admin" && !assigned.has(e.id)
  );
}

/** その日にまだシフトが無い現場(「＋現場」の候補) */
export function sitesNotOnDay(db: Database, date: string): Site[] {
  const used = new Set(
    db.shifts.filter((s) => s.date === date).map((s) => s.siteId)
  );
  return db.sites.filter((s) => s.active && !used.has(s.id));
}
