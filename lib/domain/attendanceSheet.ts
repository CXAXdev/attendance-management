import type { Database } from "@/lib/types";

// ============================================================================
// 日次出勤表(現場ごとの出面表)の集計
// 指定日に出勤打刻(clockIn)した従業員を現場ごとにまとめ、
// 紙の様式(会社=現場ブロック + 人数集計)に対応するデータを作る。
// ============================================================================

/** 1現場分のブロック(様式の「〇〇会社」ブロックに対応) */
export interface SheetBlock {
  siteId: string;
  siteName: string;
  /** その現場に出勤した従業員名(出勤打刻順) */
  names: string[];
}

export interface AttendanceSheet {
  date: string; // YYYY-MM-DD
  blocks: SheetBlock[];
  /** 現場ごとの人数 + 合計 */
  summary: { siteName: string; count: number }[];
  total: number;
}

/**
 * 指定日の出勤表データを作る。
 * - 出勤打刻(clockIn)があるものを対象(退勤済みも含む)
 * - 現場は db.sites の並び順。出勤者が1人以上いる現場のみ掲載
 */
export function buildAttendanceSheet(
  db: Database,
  date: string
): AttendanceSheet {
  const dayAtts = db.attendances
    .filter((a) => a.date === date && a.clockIn)
    // 出勤打刻の早い順に並べる
    .sort((a, b) => (a.clockIn ?? "").localeCompare(b.clockIn ?? ""));

  const empName = (id: string) =>
    db.employees.find((e) => e.id === id)?.name ?? "(不明)";

  const blocks: SheetBlock[] = [];
  for (const site of db.sites) {
    const names = dayAtts
      .filter((a) => a.siteId === site.id)
      .map((a) => empName(a.employeeId));
    if (names.length > 0) {
      blocks.push({ siteId: site.id, siteName: site.name, names });
    }
  }

  const summary = blocks.map((b) => ({
    siteName: b.siteName,
    count: b.names.length,
  }));
  const total = summary.reduce((s, r) => s + r.count, 0);

  return { date, blocks, summary, total };
}
