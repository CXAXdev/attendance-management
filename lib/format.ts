// 表示用フォーマッタ(日本語・建築現場向けに分かりやすく)

export function todayYmd(d = new Date()): string {
  // ローカル日付を YYYY-MM-DD で返す
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 昨日のローカル日付(YYYY-MM-DD)。
 * 日付計算を関数内に閉じ込め、コンポーネント本体での直接的な
 * 非純粋呼び出し(Date.now 等)を避ける。 */
export function yesterdayYmd(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return todayYmd(d);
}

export const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

/** シフト希望の対象月と提出期限 */
export interface MonthOption {
  year: number;
  month: number; // 1-12
  label: string; // 例: "7月分のシフト"
  /** 提出期限(前月20日) */
  deadlineYmd: string;
  /** 期限を過ぎているか */
  expired: boolean;
}

/**
 * 今月の翌月から count ヶ月分の対象月を返す(向こう3ヶ月など)。
 * 日付計算を関数内に閉じ込め、レンダー中の非純粋呼び出しを避ける。
 */
export function upcomingMonths(count = 3): MonthOption[] {
  const now = new Date();
  const todayStr = todayYmd(now);
  const result: MonthOption[] = [];
  for (let i = 1; i <= count; i++) {
    const first = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const year = first.getFullYear();
    const month = first.getMonth() + 1;
    // 提出期限 = 対象月の前月20日
    const deadline = new Date(year, month - 2, 20);
    const deadlineYmd = todayYmd(deadline);
    result.push({
      year,
      month,
      label: `${month}月分のシフト`,
      deadlineYmd,
      expired: deadlineYmd < todayStr,
    });
  }
  return result;
}

/** 年月を delta ヶ月ずらす(年跨ぎも正しく処理) */
export function addMonth(
  year: number,
  month: number,
  delta: number
): { year: number; month: number } {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/**
 * 指定年月のカレンダー行列(週ごと)を返す。
 * 各セルは日付文字列(YYYY-MM-DD)、月外は null。日曜始まり。
 */
export function monthMatrix(year: number, month: number): (string | null)[][] {
  const firstWeekday = new Date(year, month - 1, 1).getDay(); // 0=日
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** 2026-06-17 → 6月17日(水) */
export function formatDateJp(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  const date = new Date(`${ymd}T00:00:00`);
  return `${m}月${d}日(${WEEK[date.getDay()]})`;
}

/** 2026-06-17 → 2026年6月17日 */
export function formatDateFullJp(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${y}年${m}月${d}日`;
}

/** 2026-08-04 → 8/4(火)。狭い場所で使う短い表記 */
export function formatDateShortJp(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  const date = new Date(`${ymd}T00:00:00`);
  return `${m}/${d}(${WEEK[date.getDay()]})`;
}

/** ISO datetime → HH:mm */
export function formatTime(iso: string | null): string {
  if (!iso) return "--:--";
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/** ISO datetime → 6月17日 17:30 */
export function formatDateTimeJp(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${formatTime(iso)}`;
}

/** 分 → 「8時間30分」 */
export function formatMinutes(min: number): string {
  const sign = min < 0 ? "-" : "";
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m}分`;
  if (m === 0) return `${sign}${h}時間`;
  return `${sign}${h}時間${m}分`;
}

/** 金額 → 「¥18,000」 */
export function formatYen(n: number): string {
  return `¥${Math.round(n).toLocaleString("ja-JP")}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** 1→① 2→② … 20→⑳。21以上は「(n)」 */
export function circledNumber(n: number): string {
  if (n >= 1 && n <= 20) return String.fromCodePoint(0x2460 + (n - 1));
  return `(${n})`;
}
