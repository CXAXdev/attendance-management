import type {
  Attendance,
  BreakPeriod,
  Database,
  EmploymentCondition,
} from "@/lib/types";
import { conditionForDate } from "./conditions";

// ============================================================================
// 勤怠計算: 実労働時間・残業(所定外/法定外)・深夜・休日・早出/遅刻
// 出退勤の打刻から各種時間を算出する純粋関数群。
// ============================================================================

/** 法定労働時間(分/日) */
export const LEGAL_DAILY_MINUTES = 8 * 60;

function diffMinutes(fromIso: string, toIso: string): number {
  return Math.max(
    0,
    Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000)
  );
}

/** date(YYYY-MM-DD) と HH:mm からローカル時刻の Date を作る */
function localDate(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm}:00`);
}

/** 2区間(ms)の重なり(分) */
function overlapMinutes(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): number {
  const s = Math.max(aStart, bStart);
  const e = Math.min(aEnd, bEnd);
  return e > s ? Math.round((e - s) / 60000) : 0;
}

/**
 * 深夜労働(22:00〜翌5:00)の分数。
 * 勤務区間から休憩区間を除き、勤務開始日の前後の深夜帯との重なりを足す。
 */
export function calcNightMinutes(
  date: string,
  clockIn: string | null,
  clockOut: string | null,
  breaks: BreakPeriod[]
): number {
  if (!clockIn || !clockOut) return 0;
  const inMs = new Date(clockIn).getTime();
  const outMs = new Date(clockOut).getTime();
  if (outMs <= inMs) return 0;

  // 深夜帯: [当日0:00, 5:00), [当日22:00, 翌5:00), [翌22:00, 翌々5:00)
  const base = localDate(date, "00:00").getTime();
  const DAY = 24 * 60 * 60 * 1000;
  const H = 60 * 60 * 1000;
  const windows: [number, number][] = [
    [base, base + 5 * H],
    [base + 22 * H, base + DAY + 5 * H],
    [base + DAY + 22 * H, base + 2 * DAY + 5 * H],
  ];

  let total = 0;
  for (const [ws, we] of windows) {
    let n = overlapMinutes(inMs, outMs, ws, we);
    for (const b of breaks) {
      if (!b.end) continue;
      n -= overlapMinutes(
        new Date(b.start).getTime(),
        new Date(b.end).getTime(),
        ws,
        we
      );
    }
    total += Math.max(0, n);
  }
  return total;
}

export interface AttendanceCalc {
  workedMinutes: number;
  breakMinutes: number;
  overtimeMinutes: number;
  legalOvertimeMinutes: number;
  nightMinutes: number;
  holidayWork: boolean;
  /** 正=遅刻(分) / 負=早出(分) / 0=定刻 */
  startDiffMinutes: number;
}

export interface CalcOptions {
  /** その日のシフト開始(HH:mm)。あれば雇用条件より優先して遅刻判定に使う */
  shiftStartTime?: string;
  /** 法定休日の曜日(0=日)。省略時は日曜 */
  legalHolidayWeekday?: number;
}

/**
 * 出退勤打刻と労働条件から各種時間を計算する。
 * - 実労働 = (退勤 - 出勤) - 休憩(完了分)
 * - 所定外残業 = max(0, 実労働 - 所定労働時間)
 * - 法定外残業 = max(0, 実労働 - 8時間)
 * - 早出/遅刻 = 出勤時刻 - (シフト開始 or 雇用条件の開始時刻)
 */
export function calcAttendance(
  attendance: Pick<Attendance, "date" | "clockIn" | "clockOut" | "breaks">,
  condition: EmploymentCondition | undefined,
  opts: CalcOptions = {}
): AttendanceCalc {
  const { date, clockIn, clockOut, breaks } = attendance;

  const breakMinutes = breaks.reduce(
    (sum, b) => sum + (b.end ? diffMinutes(b.start, b.end) : 0),
    0
  );

  let workedMinutes = 0;
  if (clockIn && clockOut) {
    workedMinutes = Math.max(0, diffMinutes(clockIn, clockOut) - breakMinutes);
  }

  const scheduledDaily = condition?.scheduledDailyMinutes ?? LEGAL_DAILY_MINUTES;
  const overtimeMinutes = Math.max(0, workedMinutes - scheduledDaily);
  const legalOvertimeMinutes = Math.max(0, workedMinutes - LEGAL_DAILY_MINUTES);

  const plannedStart = opts.shiftStartTime ?? condition?.scheduledStartTime;
  let startDiffMinutes = 0;
  if (clockIn && plannedStart) {
    startDiffMinutes = Math.round(
      (new Date(clockIn).getTime() - localDate(date, plannedStart).getTime()) /
        60000
    );
  }

  const nightMinutes = calcNightMinutes(date, clockIn, clockOut, breaks);
  const holidayWeekday = opts.legalHolidayWeekday ?? 0;
  const holidayWork = localDate(date, "00:00").getDay() === holidayWeekday;

  return {
    workedMinutes,
    breakMinutes,
    overtimeMinutes,
    legalOvertimeMinutes,
    nightMinutes,
    holidayWork,
    startDiffMinutes,
  };
}

/** その日・その従業員のシフト開始時刻(複数あれば最も早いもの) */
export function shiftStartFor(
  db: Database,
  employeeId: string,
  date: string
): string | undefined {
  const shiftIds = new Set(
    db.shiftAssignments
      .filter((sa) => sa.employeeId === employeeId)
      .map((sa) => sa.shiftId)
  );
  const starts = db.shifts
    .filter((s) => s.date === date && shiftIds.has(s.id))
    .map((s) => s.startTime)
    .sort();
  return starts[0];
}

/**
 * DB の文脈(雇用条件・シフト・設定)で勤怠レコードの計算項目を出し直す。
 * 打刻・休憩・修正のたびにこれで patch を作る。
 */
export function computeAttendanceFields(
  db: Database,
  att: Pick<Attendance, "employeeId" | "date" | "clockIn" | "clockOut" | "breaks">
): AttendanceCalc {
  const cond = conditionForDate(db, att.employeeId, att.date);
  return calcAttendance(att, cond, {
    shiftStartTime: shiftStartFor(db, att.employeeId, att.date),
    legalHolidayWeekday: db.settings.legalHolidayWeekday,
  });
}

/** 早出/遅刻を人間向けラベルに */
export function startDiffLabel(startDiffMinutes: number): {
  text: string;
  tone: "green" | "red" | "gray";
} {
  if (startDiffMinutes <= -1) {
    return { text: `${Math.abs(startDiffMinutes)}分 早出`, tone: "green" };
  }
  if (startDiffMinutes >= 1) {
    return { text: `${startDiffMinutes}分 遅刻`, tone: "red" };
  }
  return { text: "定刻", tone: "gray" };
}
