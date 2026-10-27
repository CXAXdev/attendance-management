import type {
  Database,
  Employee,
  EmploymentCondition,
  Site,
  SiteRequirement,
  Shift,
  ShiftAssignment,
  Notice,
  Handover,
  Attendance,
  AlcoholCheckRecord,
  BreakPeriod,
  PaidLeave,
  LeaveRequest,
  LeaveSubmission,
  JobType,
  EmploymentType,
  PayBasis,
  Gender,
} from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { calcAttendance } from "@/lib/domain/attendance";

// ============================================================================
// デモ用サンプルデータ。
// - 「今日」を基準に前後の日付を組み立てる(過去3ヶ月の実績 + 3週間先までの予定)
// - 固定シードの擬似乱数で生成するため、何度初期化しても同じ内容になる
// - ガイドの登場人物(emp-admin, emp-001〜004)は ID・名前・ログインIDを固定
// ============================================================================

// ----------------------------------------------------------------------------
// 日付ユーティリティ(ローカル日付。toISOString は UTC なので使わない)
// ----------------------------------------------------------------------------

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(base: Date, months: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** 日付(YYYY-MM-DD)+HH:mm(+日オフセット)をローカル時刻として ISO に */
function isoAt(dateStr: string, hhmm: string, dayOffset = 0): string {
  const d = new Date(`${dateStr}T${hhmm}:00`);
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString();
}

/** HH:mm に分を足す(同日内。負も可) */
function shiftHHmm(hhmm: string, deltaMin: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = Math.max(0, Math.min(23 * 60 + 59, h * 60 + m + deltaMin));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// ----------------------------------------------------------------------------
// 固定シード乱数(mulberry32)
// ----------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ----------------------------------------------------------------------------
// 従業員マスター(20名)
// ----------------------------------------------------------------------------

interface EmpSpec {
  id: string;
  loginId: string;
  name: string;
  kana: string;
  gender: Gender;
  birth: string;
  address: string;
  phone: string;
  jobs: JobType[];
  type: EmploymentType;
  basis: PayBasis;
  rate: number;
  start: string; // 予定開始
  daily: number; // 所定(分)
  joined: string;
  note?: string;
  /** 勤務パターン: full=月〜土(土は半分), p3=週3, p4=週4 */
  pattern: "full" | "p3" | "p4";
  /** 週3/4のときの出勤曜日(1=月…6=土) */
  weekdays?: number[];
  retiredOn?: string;
  retireReason?: string;
}

function employeeSpecs(ref: Date): EmpSpec[] {
  const r = (days: number) => ymd(addDays(ref, days));
  return [
    { id: "emp-001", loginId: "yamada", name: "山田 一郎", kana: "ヤマダ イチロウ", gender: "male", birth: "1978-05-12", address: "東京都世田谷区経堂2-14-6", phone: "090-1111-0001", jobs: ["carpenter", "scaffold"], type: "employee", basis: "daily", rate: 18000, start: "08:00", daily: 480, joined: "2015-04-01", note: "大工・鳶を兼任。重機の資格あり。", pattern: "full" },
    { id: "emp-002", loginId: "suzuki", name: "鈴木 次郎", kana: "スズキ ジロウ", gender: "male", birth: "1990-11-03", address: "東京都杉並区高円寺南3-8-1", phone: "090-1111-0002", jobs: ["scaffold"], type: "part", basis: "hourly", rate: 2200, start: "08:00", daily: 480, joined: "2018-06-01", pattern: "full" },
    { id: "emp-003", loginId: "sato", name: "佐藤 三郎", kana: "サトウ サブロウ", gender: "male", birth: "1972-02-20", address: "東京都目黒区中町1-5-9", phone: "090-1111-0003", jobs: ["supervisor", "carpenter"], type: "employee", basis: "monthly", rate: 300000, start: "08:00", daily: 480, joined: "2012-09-01", note: "一級建築施工管理技士。", pattern: "full" },
    { id: "emp-004", loginId: "tanaka", name: "田中 四郎", kana: "タナカ シロウ", gender: "male", birth: "1998-08-30", address: "東京都大田区蒲田4-2-11", phone: "090-1111-0004", jobs: ["laborer"], type: "arbeit", basis: "hourly", rate: 1300, start: "08:00", daily: 480, joined: "2020-03-01", pattern: "full" },
    { id: "emp-005", loginId: "takahashi", name: "高橋 五郎", kana: "タカハシ ゴロウ", gender: "male", birth: "1985-07-07", address: "東京都練馬区光が丘5-3-2", phone: "090-1111-0005", jobs: ["scaffold", "laborer"], type: "employee", basis: "daily", rate: 17000, start: "08:00", daily: 480, joined: "2016-10-01", note: "夜間工事(道路補修)の担当。", pattern: "full" },
    { id: "emp-006", loginId: "ito", name: "伊藤 六郎", kana: "イトウ ロクロウ", gender: "male", birth: "1983-01-25", address: "東京都品川区大井1-7-3", phone: "090-1111-0006", jobs: ["electrician"], type: "employee", basis: "monthly", rate: 280000, start: "08:30", daily: 480, joined: "2014-04-01", note: "第二種電気工事士。", pattern: "full" },
    { id: "emp-007", loginId: "watanabe", name: "渡辺 七海", kana: "ワタナベ ナナミ", gender: "female", birth: "1980-12-01", address: "神奈川県川崎市中原区小杉町2-9", phone: "090-1111-0007", jobs: ["supervisor", "carpenter"], type: "employee", basis: "monthly", rate: 320000, start: "07:30", daily: 480, joined: "2010-04-01", note: "二級建築士。", pattern: "full" },
    { id: "emp-008", loginId: "nakamura", name: "中村 八重", kana: "ナカムラ ヤエ", gender: "female", birth: "1975-03-18", address: "東京都板橋区成増1-22-4", phone: "090-1111-0008", jobs: ["laborer"], type: "part", basis: "hourly", rate: 1400, start: "08:30", daily: 360, joined: "2019-09-01", pattern: "p3", weekdays: [1, 3, 5] },
    { id: "emp-009", loginId: "kobayashi", name: "小林 九郎", kana: "コバヤシ クロウ", gender: "male", birth: "1988-06-14", address: "東京都足立区綾瀬3-4-12", phone: "090-1111-0009", jobs: ["plumber"], type: "employee", basis: "daily", rate: 16500, start: "08:00", daily: 480, joined: "2017-02-01", pattern: "full" },
    { id: "emp-010", loginId: "kato", name: "加藤 十蔵", kana: "カトウ ジュウゾウ", gender: "male", birth: "1969-09-09", address: "東京都江戸川区葛西6-1-8", phone: "090-1111-0010", jobs: ["carpenter"], type: "contract", basis: "daily", rate: 17500, start: "08:00", daily: 480, joined: "2021-04-01", pattern: "full" },
    { id: "emp-011", loginId: "yoshida", name: "吉田 一樹", kana: "ヨシダ カズキ", gender: "male", birth: "1995-04-22", address: "東京都北区赤羽2-3-15", phone: "090-1111-0011", jobs: ["scaffold"], type: "employee", basis: "daily", rate: 16000, start: "08:00", daily: 480, joined: "2019-04-01", pattern: "full" },
    { id: "emp-012", loginId: "yamamoto", name: "山本 二葉", kana: "ヤマモト フタバ", gender: "female", birth: "2001-10-10", address: "東京都中野区中野5-6-7", phone: "090-1111-0012", jobs: ["laborer"], type: "arbeit", basis: "hourly", rate: 1350, start: "08:30", daily: 360, joined: "2023-04-01", pattern: "p3", weekdays: [2, 4, 6] },
    { id: "emp-013", loginId: "matsumoto", name: "松本 三樹", kana: "マツモト ミキ", gender: "male", birth: "1982-11-11", address: "千葉県市川市行徳駅前1-3", phone: "090-1111-0013", jobs: ["carpenter"], type: "employee", basis: "daily", rate: 18500, start: "08:00", daily: 480, joined: "2013-06-01", pattern: "full" },
    { id: "emp-014", loginId: "inoue", name: "井上 四季", kana: "イノウエ シキ", gender: "female", birth: "1992-02-29", address: "東京都豊島区池袋本町2-5", phone: "090-1111-0014", jobs: ["electrician"], type: "contract", basis: "monthly", rate: 260000, start: "08:30", daily: 480, joined: "2022-10-01", pattern: "full" },
    { id: "emp-015", loginId: "kimura", name: "木村 五月", kana: "キムラ サツキ", gender: "female", birth: "1979-05-05", address: "東京都練馬区石神井町4-8", phone: "090-1111-0015", jobs: ["laborer"], type: "part", basis: "hourly", rate: 1400, start: "08:30", daily: 360, joined: "2020-07-01", pattern: "p4", weekdays: [1, 2, 3, 4] },
    { id: "emp-016", loginId: "hayashi", name: "林 六平", kana: "ハヤシ ロクヘイ", gender: "male", birth: "1986-08-16", address: "神奈川県横浜市鶴見区鶴見中央3-2", phone: "090-1111-0016", jobs: ["plumber", "laborer"], type: "employee", basis: "daily", rate: 16000, start: "08:00", daily: 480, joined: "2018-01-15", pattern: "full" },
    { id: "emp-017", loginId: "shimizu", name: "清水 七郎", kana: "シミズ シチロウ", gender: "male", birth: "1976-07-27", address: "東京都葛飾区金町6-9-1", phone: "090-1111-0017", jobs: ["carpenter", "supervisor"], type: "employee", basis: "monthly", rate: 310000, start: "07:30", daily: 480, joined: "2011-04-01", pattern: "full" },
    { id: "emp-018", loginId: "yamaguchi", name: "山口 八郎", kana: "ヤマグチ ハチロウ", gender: "male", birth: "1965-03-03", address: "東京都江東区亀戸7-1-4", phone: "090-1111-0018", jobs: ["laborer"], type: "employee", basis: "daily", rate: 15500, start: "08:00", daily: 480, joined: "2009-04-01", pattern: "full", retiredOn: r(-20), retireReason: "自己都合(定年後の再雇用満了)" },
    { id: "emp-019", loginId: "mori", name: "森 九十九", kana: "モリ ツクモ", gender: "male", birth: "2003-01-19", address: "東京都八王子市明神町3-2", phone: "090-1111-0019", jobs: ["laborer"], type: "employee", basis: "daily", rate: 14000, start: "08:00", daily: 480, joined: r(-25), note: "試用期間中。", pattern: "full" },
  ];
}

// ----------------------------------------------------------------------------
// 現場マスター(10件)
// ----------------------------------------------------------------------------

interface SiteSpec {
  id: string;
  name: string;
  address: string;
  contact: string;
  phone: string;
  startDays: number; // 基準日からの相対
  endDays: number | null;
  rate: number;
  /** 夜間現場(21:00〜翌5:30) */
  night?: boolean;
  reqs: { job: JobType; count: number; sup: boolean }[];
}

const SITE_SPECS: SiteSpec[] = [
  { id: "site-001", name: "渋谷オフィスビル新築", address: "東京都渋谷区道玄坂1-2-3", contact: "山田 太郎", phone: "090-2222-0001", startDays: -120, endDays: 60, rate: 2500, reqs: [{ job: "carpenter", count: 2, sup: true }, { job: "scaffold", count: 1, sup: false }] },
  { id: "site-002", name: "世田谷戸建てリフォーム", address: "東京都世田谷区北沢4-5-6", contact: "佐藤 次郎", phone: "090-2222-0002", startDays: -40, endDays: 20, rate: 2300, reqs: [{ job: "carpenter", count: 1, sup: false }] },
  { id: "site-003", name: "品川マンション外壁改修", address: "東京都品川区東品川2-3-14", contact: "高木 健", phone: "090-2222-0003", startDays: -100, endDays: 45, rate: 2400, reqs: [{ job: "scaffold", count: 2, sup: true }] },
  { id: "site-004", name: "横浜倉庫新築", address: "神奈川県横浜市金沢区福浦1-8", contact: "大野 修", phone: "090-2222-0004", startDays: -95, endDays: 90, rate: 2600, reqs: [{ job: "carpenter", count: 2, sup: true }, { job: "laborer", count: 2, sup: false }] },
  { id: "site-005", name: "川崎工場増築", address: "神奈川県川崎市川崎区浮島町10", contact: "村田 昇", phone: "090-2222-0005", startDays: -150, endDays: -30, rate: 2500, reqs: [{ job: "electrician", count: 1, sup: false }] },
  { id: "site-006", name: "目黒保育園改築", address: "東京都目黒区碑文谷3-7", contact: "石井 恵", phone: "090-2222-0006", startDays: -80, endDays: -10, rate: 2300, reqs: [{ job: "carpenter", count: 1, sup: false }] },
  { id: "site-007", name: "新宿テナント内装", address: "東京都新宿区西新宿7-9-1", contact: "原田 亮", phone: "090-2222-0007", startDays: -30, endDays: 25, rate: 2400, reqs: [{ job: "electrician", count: 1, sup: false }, { job: "carpenter", count: 1, sup: false }] },
  { id: "site-008", name: "板橋集合住宅新築", address: "東京都板橋区志村2-18", contact: "近藤 誠", phone: "090-2222-0008", startDays: -110, endDays: 120, rate: 2500, reqs: [{ job: "carpenter", count: 2, sup: true }, { job: "plumber", count: 1, sup: false }] },
  { id: "site-009", name: "千葉物流センター新築", address: "千葉県船橋市浜町2-1", contact: "藤田 直樹", phone: "090-2222-0009", startDays: -60, endDays: 150, rate: 2700, reqs: [{ job: "laborer", count: 2, sup: true }] },
  { id: "site-010", name: "練馬道路補修（夜間）", address: "東京都練馬区谷原2 都道沿い", contact: "岡本 剛", phone: "090-2222-0010", startDays: -70, endDays: 30, rate: 3000, night: true, reqs: [{ job: "scaffold", count: 1, sup: false }] },
];

/** 各従業員の主担当現場(週替わりでローテーション)。終了済み現場は期間内のみ */
const HOME_SITES: Record<string, string[]> = {
  "emp-001": ["site-001", "site-003"],
  "emp-002": ["site-002", "site-004"],
  "emp-003": ["site-001", "site-008"],
  "emp-004": ["site-001", "site-002"],
  "emp-005": ["site-003", "site-010"],
  "emp-006": ["site-005", "site-007"],
  "emp-007": ["site-004", "site-009"],
  "emp-008": ["site-009", "site-004"],
  "emp-009": ["site-008", "site-004"],
  "emp-010": ["site-006", "site-008"],
  "emp-011": ["site-003", "site-001"],
  "emp-012": ["site-004", "site-009"],
  "emp-013": ["site-008", "site-006"],
  "emp-014": ["site-007", "site-005"],
  "emp-015": ["site-009", "site-001"],
  "emp-016": ["site-004", "site-008"],
  "emp-017": ["site-008", "site-004"],
  "emp-018": ["site-004", "site-009"],
  "emp-019": ["site-009", "site-001"],
};

// ----------------------------------------------------------------------------
// 初期データ生成
// ----------------------------------------------------------------------------

/** 過去の実績を作る日数 */
const HISTORY_DAYS = 92;
/** 先の予定を作る日数 */
const FUTURE_DAYS = 21;

export function buildSeed(referenceDate = new Date()): Database {
  const rand = mulberry32(20261024);
  const chance = (p: number) => rand() < p;
  const randInt = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

  const today = ymd(referenceDate);
  const yesterday = ymd(addDays(referenceDate, -1));
  const tomorrow = ymd(addDays(referenceDate, 1));
  const rel = (days: number) => ymd(addDays(referenceDate, days));
  const settings = { ...DEFAULT_SETTINGS };

  // --- 従業員 ---------------------------------------------------------------
  const specs = employeeSpecs(referenceDate);
  const employees: Employee[] = [
    {
      id: "emp-admin",
      loginId: "admin",
      name: "社長 太郎",
      nameKana: "シャチョウ タロウ",
      role: "admin",
      jobTypes: ["supervisor"],
      gender: "male",
      birthDate: "1968-04-02",
      address: "東京都渋谷区神宮前1-1-1",
      phone: "090-0000-0001",
      joinedOn: "2010-04-01",
      active: true,
    },
    ...specs.map<Employee>((s) => ({
      id: s.id,
      loginId: s.loginId,
      name: s.name,
      nameKana: s.kana,
      role: "employee",
      jobTypes: s.jobs,
      phone: s.phone,
      birthDate: s.birth,
      gender: s.gender,
      address: s.address,
      joinedOn: s.joined,
      retiredOn: s.retiredOn ?? null,
      retireReason: s.retireReason,
      note: s.note,
      active: !s.retiredOn,
    })),
  ];

  const employmentConditions: EmploymentCondition[] = specs.map((s, i) => ({
    id: `cond-${String(i + 1).padStart(3, "0")}`,
    employeeId: s.id,
    employmentType: s.type,
    payBasis: s.basis,
    baseRate: s.rate,
    overtimeMultiplier: 1.25,
    scheduledDailyMinutes: s.daily,
    scheduledStartTime: s.start,
    monthlyOvertimeLimitMinutes: 45 * 60,
    maxConsecutiveDays: 6,
    effectiveFrom: s.joined,
    effectiveTo: s.retiredOn ?? null,
  }));
  const specById = new Map(specs.map((s) => [s.id, s]));
  const condByEmp = new Map(employmentConditions.map((c) => [c.employeeId, c]));

  // --- 現場 -----------------------------------------------------------------
  const sites: Site[] = SITE_SPECS.map((s) => ({
    id: s.id,
    name: s.name,
    address: s.address,
    contactName: s.contact,
    contactPhone: s.phone,
    startOn: rel(s.startDays),
    endOn: s.endDays === null ? null : rel(s.endDays),
    hourlyRate: s.rate,
    active: s.endDays === null || s.endDays >= 0,
  }));
  const siteSpecById = new Map(SITE_SPECS.map((s) => [s.id, s]));
  const siteRequirements: SiteRequirement[] = SITE_SPECS.flatMap((s, i) =>
    s.reqs.map((r, j) => ({
      id: `req-${String(i + 1).padStart(2, "0")}-${j + 1}`,
      siteId: s.id,
      jobType: r.job,
      requiredCount: r.count,
      requiresSupervisor: r.sup,
    }))
  );
  /** その日に稼働している現場か */
  const siteOpenOn = (siteId: string, dateStr: string) => {
    const s = sites.find((x) => x.id === siteId)!;
    return s.startOn <= dateStr && (s.endOn === null || s.endOn >= dateStr);
  };
  /** 従業員のその日の現場(週替わり。稼働していなければもう片方、どちらも駄目なら site-001) */
  const siteFor = (empId: string, dateStr: string, dayOffset: number) => {
    const homes = HOME_SITES[empId] ?? ["site-001"];
    const week = Math.floor((dayOffset + 1000) / 7);
    const order = week % 2 === 0 ? homes : [...homes].reverse();
    return order.find((id) => siteOpenOn(id, dateStr)) ?? "site-001";
  };

  // --- 勤務パターン ---------------------------------------------------------
  const inService = (s: EmpSpec, dateStr: string) =>
    s.joined <= dateStr && (!s.retiredOn || s.retiredOn >= dateStr);

  /** その曜日に出勤する予定か(日曜は原則休み) */
  const worksOn = (s: EmpSpec, d: Date) => {
    const dow = d.getDay();
    if (s.pattern === "full") return dow >= 1 && dow <= 5;
    return (s.weekdays ?? []).includes(dow);
  };

  // 夜間担当(emp-005)は火・木が夜勤(日付は勤務開始日)
  const isNightShift = (empId: string, d: Date) =>
    empId === "emp-005" && (d.getDay() === 2 || d.getDay() === 4) && siteOpenOn("site-010", ymd(d));

  // --- 年休(付与は入社6ヶ月後、以降毎年。取得日は出勤しない) ---------------
  const GRANT_DAYS = [10, 11, 12, 14, 16, 18, 20];
  const paidLeaves: PaidLeave[] = [];
  const leaveUseDates = new Map<string, Set<string>>(); // empId -> dates
  for (const s of specs) {
    const joined = new Date(`${s.joined}T00:00:00`);
    let n = 0;
    const grants: { date: string; days: number }[] = [];
    for (;;) {
      const g = n === 0 ? addMonths(joined, 6) : addMonths(joined, 6 + 12 * n);
      const gs = ymd(g);
      if (gs > today) break;
      grants.push({ date: gs, days: GRANT_DAYS[Math.min(n, GRANT_DAYS.length - 1)] });
      n += 1;
    }
    // 直近2年分の付与だけ記録する(それ以前は時効)
    const twoYearsAgo = ymd(addMonths(referenceDate, -24));
    for (const g of grants.filter((x) => x.date >= twoYearsAgo)) {
      paidLeaves.push({
        id: `pl-g-${s.id}-${g.date}`,
        employeeId: s.id,
        kind: "grant",
        date: g.date,
        days: g.days,
        expiresOn: ymd(addMonths(new Date(`${g.date}T00:00:00`), 24)),
        note: "年次付与",
      });
    }
    if (grants.length === 0 || s.id === "emp-012" || s.retiredOn) continue;
    // 取得: 直近12ヶ月で 0〜6 日(emp-012 は取得ゼロ=5日義務未達の例)
    const uses = new Set<string>();
    const k = randInt(1, 6);
    let guard = 0;
    while (uses.size < k && guard++ < 50) {
      const off = -randInt(5, 330);
      const d = addDays(referenceDate, off);
      if (!worksOn(s, d) || !inService(s, ymd(d))) continue;
      uses.add(ymd(d));
    }
    for (const date of uses) {
      paidLeaves.push({ id: `pl-u-${s.id}-${date}`, employeeId: s.id, kind: "use", date, days: 1 });
    }
    leaveUseDates.set(s.id, uses);
  }

  // --- 勤怠実績(過去 HISTORY_DAYS 日) ---------------------------------------
  const attendances: Attendance[] = [];
  const alcoholChecks: AlcoholCheckRecord[] = [];
  const supervisorIds = specs.filter((s) => s.jobs.includes("supervisor")).map((s) => s.id);

  // 特殊ケース
  const holidayWorkDays = new Set([rel(-7), rel(-28)]); // 山田の日曜出勤(休日労働の例)
  const forgotClockOut = new Set([`emp-010|${rel(-15)}`, `emp-013|${rel(-40)}`]);
  const detectedNoWork = new Set([`emp-002|${rel(-6)}`, `emp-011|${rel(-33)}`]);
  // 渡辺(emp-007)は -20日〜-13日まで8日連続勤務(違反例)
  const consecutiveRun = new Set(Array.from({ length: 8 }, (_, i) => rel(-20 + i)));

  type Correction = { clockIn?: string; clockOut?: string | null; addBreak?: BreakPeriod; reason: string };
  const corrections = new Map<string, Correction>([
    [`emp-006|${rel(-22)}`, { clockOut: null, reason: "退勤打刻忘れ。本人申告(17:10 退勤)を現場監督が確認。" }],
    [`emp-009|${rel(-50)}`, { clockIn: "08:35", reason: "端末の電池切れで打刻が遅れた。実際の出勤 08:02 を現場監督が確認。" }],
    [`emp-014|${rel(-9)}`, { addBreak: { start: "15:00", end: "15:20" }, reason: "午後の小休憩の打刻漏れを本人申告で追加。" }],
  ]);

  function pushAttendance(
    s: EmpSpec,
    dateStr: string,
    siteId: string,
    opts: { night?: boolean; forgot?: boolean; holiday?: boolean }
  ) {
    const cond = condByEmp.get(s.id);
    const key = `${s.id}|${dateStr}`;
    let clockInHHmm: string;
    let clockOut: string | null;
    let breaks: BreakPeriod[];

    if (opts.night) {
      clockInHHmm = shiftHHmm("21:00", randInt(-10, 3));
      clockOut = isoAt(dateStr, shiftHHmm("05:30", randInt(0, 15)), 1);
      breaks = [{ start: isoAt(dateStr, "00:00", 1), end: isoAt(dateStr, "00:45", 1) }];
    } else {
      const late = chance(0.06) ? randInt(10, 45) : 0;
      clockInHHmm = shiftHHmm(s.start, late > 0 ? late : randInt(-12, 4));
      // 所定終了 = 開始 + 所定 + 休憩60分。残業は約15%
      const endBase = shiftHHmm(s.start, s.daily + 60);
      const overtime = s.daily >= 480 && chance(0.15) ? randInt(60, 150) : 0;
      clockOut = isoAt(dateStr, shiftHHmm(endBase, overtime + randInt(0, 10)));
      breaks = [{ start: isoAt(dateStr, "12:00"), end: isoAt(dateStr, "13:00") }];
      if (overtime > 0 || chance(0.2)) {
        breaks.push({ start: isoAt(dateStr, "15:00"), end: isoAt(dateStr, "15:15") });
      }
    }

    // 修正履歴のあるレコード: 修正前の状態を corrections に、修正後の値を本体に持つ
    const corrList: Attendance["corrections"] = [];
    const corr = corrections.get(key);
    let clockIn = isoAt(dateStr, clockInHHmm);
    if (corr) {
      const before: Attendance["corrections"][number]["before"] = {
        clockIn,
        clockOut,
        breaks: breaks.map((b) => ({ ...b })),
      };
      if (corr.clockIn) before.clockIn = isoAt(dateStr, corr.clockIn);
      if (corr.clockOut === null) before.clockOut = null;
      if (corr.addBreak) {
        breaks.push({ start: isoAt(dateStr, corr.addBreak.start), end: isoAt(dateStr, corr.addBreak.end!) });
      }
      if (corr.clockIn) clockIn = isoAt(dateStr, "08:02");
      if (corr.clockOut === null) clockOut = isoAt(dateStr, "17:10");
      corrList.push({ at: isoAt(dateStr, "09:15", 1), byId: "emp-admin", reason: corr.reason, before });
    }
    if (opts.forgot) clockOut = null;

    const calc = calcAttendance({ date: dateStr, clockIn, clockOut, breaks }, cond, {
      shiftStartTime: opts.night ? "21:00" : s.start,
      legalHolidayWeekday: settings.legalHolidayWeekday,
    });
    attendances.push({
      id: `att-${s.id}-${dateStr}`,
      employeeId: s.id,
      siteId,
      shiftAssignmentId: null,
      date: dateStr,
      clockIn,
      clockOut,
      breaks,
      ...calc,
      corrections: corrList,
      syncStatus: "synced",
    });

    // 出勤前のアルコールチェック(約1%は未実施)
    if (chance(0.012)) return;
    const checkedAt = isoAt(dateStr, shiftHHmm(clockInHHmm, -randInt(3, 15)));
    let confirmerId = s.id;
    if (!s.jobs.includes("supervisor")) {
      const roll = rand();
      if (roll < 0.35) {
        const sup = supervisorIds.find((id) => id !== s.id && siteFor(id, dateStr, 0) === siteId);
        confirmerId = sup ?? s.id;
      } else if (roll < 0.45) {
        confirmerId = "emp-admin";
      }
    }
    alcoholChecks.push({
      id: `alc-${s.id}-${dateStr}`,
      employeeId: s.id,
      siteId,
      date: dateStr,
      detected: false,
      checkedAt,
      confirmerId,
    });
  }

  for (let off = -HISTORY_DAYS; off <= -1; off++) {
    const d = addDays(referenceDate, off);
    const dateStr = ymd(d);
    const dow = d.getDay();
    for (const s of specs) {
      if (!inService(s, dateStr)) continue;
      const key = `${s.id}|${dateStr}`;

      // 検出あり → その日は出勤せず記録だけ残す
      if (detectedNoWork.has(key)) {
        alcoholChecks.push({
          id: `alc-${s.id}-${dateStr}`,
          employeeId: s.id,
          siteId: siteFor(s.id, dateStr, off),
          date: dateStr,
          detected: true,
          checkedAt: isoAt(dateStr, "07:45"),
          confirmerId: "emp-admin",
          note: "検出あり。責任者へ連絡し、作業させず帰宅。",
        });
        continue;
      }
      // デモ用に必ず出勤させる日(退勤忘れ・修正履歴・日曜出勤・連続勤務の例)
      const forced =
        forgotClockOut.has(key) ||
        corrections.has(key) ||
        (s.id === "emp-001" && holidayWorkDays.has(dateStr)) ||
        (s.id === "emp-007" && consecutiveRun.has(dateStr));
      if (!forced && leaveUseDates.get(s.id)?.has(dateStr)) continue; // 年休

      let work = worksOn(s, d);
      // 土曜はフルタイムの半数が出勤
      if (s.pattern === "full" && dow === 6) work = chance(0.5);
      if (forced) work = true;
      if (!work) continue;
      if (!forced && chance(0.03)) continue; // 欠勤・私用

      const night = isNightShift(s.id, d);
      const siteId = night ? "site-010" : siteFor(s.id, dateStr, off);
      pushAttendance(s, dateStr, siteId, {
        night,
        forgot: forgotClockOut.has(key),
        holiday: dow === settings.legalHolidayWeekday,
      });
    }
  }

  // --- シフト(今日〜FUTURE_DAYS 日先) ---------------------------------------
  const shifts: Shift[] = [];
  const shiftAssignments: ShiftAssignment[] = [];
  const ensureShift = (siteId: string, dateStr: string, night: boolean) => {
    const id = `shift-${dateStr}-${siteId}`;
    if (!shifts.some((x) => x.id === id)) {
      shifts.push({ id, siteId, date: dateStr, startTime: night ? "21:00" : "08:00", endTime: night ? "05:30" : "17:00" });
    }
    return id;
  };
  const assign = (empId: string, siteId: string, dateStr: string, night = false, locked = false) => {
    const shiftId = ensureShift(siteId, dateStr, night);
    shiftAssignments.push({ id: `sa-${shiftId}-${empId}`, shiftId, employeeId: empId, source: "manual", locked });
  };

  for (let off = 0; off <= FUTURE_DAYS; off++) {
    const d = addDays(referenceDate, off);
    const dateStr = ymd(d);
    for (const s of specs) {
      if (!inService(s, dateStr)) continue;
      // ガイド用の固定(曜日に関わらず): 今日は山田・佐藤=渋谷、鈴木=世田谷(未出勤の例)、田中は明日から
      if (off === 0) {
        if (s.id === "emp-001" || s.id === "emp-003") { assign(s.id, "site-001", dateStr, false, s.id === "emp-003"); continue; }
        if (s.id === "emp-002") { assign(s.id, "site-002", dateStr); continue; }
        if (s.id === "emp-004") continue;
      }
      if (off === 1 && s.id === "emp-004") { assign(s.id, "site-001", dateStr); continue; }
      if (d.getDay() === 0) continue; // 日曜は予定なし
      let work = worksOn(s, d);
      if (s.pattern === "full" && d.getDay() === 6) work = (off + s.id.charCodeAt(5)) % 2 === 0;
      if (!work) continue;
      const night = isNightShift(s.id, d);
      const siteId = night ? "site-010" : siteFor(s.id, dateStr, off);
      assign(s.id, siteId, dateStr, night, s.jobs.includes("supervisor"));
    }
  }

  // --- 休み希望(来月分) -----------------------------------------------------
  const leaveRequests: LeaveRequest[] = [];
  const leaveSubmissions: LeaveSubmission[] = [];
  const nextMonth = addMonths(new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1), 1);
  const nm = { year: nextMonth.getFullYear(), month: nextMonth.getMonth() + 1 };
  const nmPrefix = `${nm.year}-${String(nm.month).padStart(2, "0")}`;
  const wishes: [string, number, LeaveRequest["type"]][] = [
    ["emp-002", 3, "off"],
    ["emp-002", 4, "off"],
    ["emp-008", 10, "off_negotiable"],
    ["emp-012", 14, "partial"],
    ["emp-016", 21, "off"],
    ["emp-004", 7, "off_negotiable"],
  ];
  for (const [empId, day, type] of wishes) {
    leaveRequests.push({
      id: `leave-${empId}-${nmPrefix}-${day}`,
      employeeId: empId,
      date: `${nmPrefix}-${String(day).padStart(2, "0")}`,
      type,
      startTime: type === "partial" ? "10:00" : undefined,
      endTime: type === "partial" ? "15:00" : undefined,
      createdAt: isoAt(rel(-3), "19:00"),
    });
  }
  for (const empId of new Set(wishes.map((w) => w[0]))) {
    leaveSubmissions.push({ id: `sub-${empId}-${nmPrefix}`, employeeId: empId, year: nm.year, month: nm.month, submittedAt: isoAt(rel(-3), "19:05") });
  }

  // --- 引き継ぎ(昨日分 → 今日の出勤時に表示される) -------------------------
  const handovers: Handover[] = [
    {
      id: "ho-1",
      authorId: "emp-001",
      siteId: "site-001",
      date: yesterday,
      body: "2階の資材が不足しています。朝イチで搬入業者に連絡してください。型枠は南側まで完了。",
      createdAt: isoAt(yesterday, "17:30"),
    },
    {
      id: "ho-2",
      authorId: "emp-005",
      siteId: "site-010",
      date: yesterday,
      body: "夜間作業: 路面切削は300m地点まで完了。規制看板は資材置き場に戻してあります。",
      createdAt: isoAt(yesterday, "05:40", 1),
    },
  ];

  // --- 社長通達 -------------------------------------------------------------
  const notices: Notice[] = [
    {
      id: "notice-1",
      authorId: "emp-admin",
      title: "熱中症対策の徹底について",
      body: "気温が上がっています。こまめに水分・塩分を補給し、無理せず休憩を取ってください。",
      publishedAt: isoAt(yesterday, "08:00"),
      important: true,
    },
    {
      id: "notice-2",
      authorId: "emp-admin",
      title: "安全大会のお知らせ",
      body: "来月の安全大会は第3土曜日に実施します。詳細は追って連絡します。",
      publishedAt: isoAt(rel(-3), "12:00"),
      important: false,
    },
    {
      id: "notice-3",
      authorId: "emp-admin",
      title: "アルコールチェックの確認者について",
      body: "現場監督がいる現場では、監督が検知器の結果を確認して記録してください。",
      publishedAt: isoAt(rel(-12), "09:00"),
      important: false,
    },
  ];

  void tomorrow;
  void pick;
  void specById;
  void siteSpecById;

  return {
    employees,
    employmentConditions,
    taxRecords: [],
    sites,
    siteRequirements,
    shifts,
    shiftAssignments,
    attendances,
    alcoholChecks,
    handovers,
    notices,
    leaveRequests,
    leaveSubmissions,
    paidLeaves,
    payrollRecords: [],
    complianceAlerts: [],
    auditLogs: [],
    settings,
  };
}
