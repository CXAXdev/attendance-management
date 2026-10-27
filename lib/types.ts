// ============================================================================
// ドメイン型定義
// 建築業向け 勤怠・労務管理アプリ
//
// データの流れ:
//   従業員マスター(Employee + EmploymentCondition)
//      → 給与計算(PayrollRecord) → 年末調整(TaxRecord)
//   シフト(Shift/ShiftAssignment) → 実績(Attendance) → 労務チェック(ComplianceAlert)
//
// 全テーブルの変更は AuditLog に追記される(改ざん防止・労務調査対応)。
// ============================================================================

export type Role = "admin" | "employee";

/** 雇用形態(雇用区分) */
export type EmploymentType = "employee" | "contract" | "part" | "arbeit";

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  employee: "社員",
  contract: "契約社員",
  part: "パート",
  arbeit: "アルバイト",
};

/** 単価区分(基本単価の入力単位)。雇用区分とは独立して保持する。 */
export type PayBasis = "hourly" | "daily" | "monthly";

export const PAY_BASIS_LABEL: Record<PayBasis, string> = {
  hourly: "時給",
  daily: "日給",
  monthly: "月給",
};

/** 職種 */
export type JobType =
  | "carpenter" // 大工
  | "scaffold" // 鳶
  | "electrician" // 電工
  | "plumber" // 配管
  | "laborer" // 作業員
  | "supervisor"; // 現場監督

export const JOB_TYPE_LABEL: Record<JobType, string> = {
  carpenter: "大工",
  scaffold: "鳶",
  electrician: "電工",
  plumber: "配管",
  laborer: "作業員",
  supervisor: "現場監督",
};

// ----------------------------------------------------------------------------
// 従業員マスター
// ----------------------------------------------------------------------------

export type Gender = "male" | "female" | "other";

export const GENDER_LABEL: Record<Gender, string> = {
  male: "男",
  female: "女",
  other: "その他",
};

/**
 * 従業員。労働者名簿(労基法107条)の記載事項を持つ:
 * 氏名・生年月日・性別・住所・従事する業務(jobTypes)・雇入れ日・退職日と事由。
 */
export interface Employee {
  id: string;
  /** ログインID(プロトタイプでは簡易) */
  loginId: string;
  name: string;
  nameKana?: string;
  role: Role;
  /** 職種(役割)。兼任に対応するため複数持てる。例: 大工 + 鳶 */
  jobTypes: JobType[];
  phone?: string;
  birthDate?: string; // YYYY-MM-DD
  gender?: Gender;
  address?: string;
  joinedOn: string; // YYYY-MM-DD
  /** 退職日。在籍中は null/undefined */
  retiredOn?: string | null;
  /** 退職事由(自己都合・契約満了など) */
  retireReason?: string;
  /** 備考(自由記述メモ) */
  note?: string;
  active: boolean;
}

/**
 * 雇用形態・労働条件(履歴で保持)。
 * 給与計算と労務チェックの両方がここを参照する。
 */
export interface EmploymentCondition {
  id: string;
  employeeId: string;
  employmentType: EmploymentType;
  /** 単価区分(基本単価の単位)。時給/日給/月給。 */
  payBasis: PayBasis;
  /** 基本単価。payBasis の単位で解釈する(時給=時給額/日給=日額/月給=月額)。 */
  baseRate: number;
  /** 残業割増率(例: 1.25) */
  overtimeMultiplier: number;
  /** 所定労働時間(分)/日 */
  scheduledDailyMinutes: number;
  /** 予定開始時刻 HH:mm(早出/遅刻の基準) */
  scheduledStartTime: string;
  /** 月間残業上限(分)。労務チェックで使用 */
  monthlyOvertimeLimitMinutes: number;
  /** 連続勤務日数の上限。労務チェックで使用 */
  maxConsecutiveDays: number;
  /** 適用開始日(履歴管理) */
  effectiveFrom: string; // YYYY-MM-DD
  /** 適用終了日。null は現行 */
  effectiveTo: string | null;
}

/**
 * 年末調整・確定申告用の税務/社会保険情報。
 * 月次で記録され、年単位で集計できる構造。
 */
export interface TaxRecord {
  id: string;
  employeeId: string;
  year: number;
  month: number; // 1-12
  /** 源泉徴収額 */
  withholdingTax: number;
  /** 社会保険料(健康保険+厚生年金等の合計) */
  socialInsurance: number;
  /** その他控除 */
  otherDeduction: number;
  /** 扶養人数 */
  dependents: number;
}

// ----------------------------------------------------------------------------
// 現場マスター
// ----------------------------------------------------------------------------

export interface Site {
  id: string;
  name: string;
  address?: string;
  /** 現場担当者名 */
  contactName?: string;
  /** 現場担当者の電話番号(任意) */
  contactPhone?: string;
  startOn: string; // YYYY-MM-DD
  endOn: string | null;
  /** 現場別単価(この現場で働いた場合の単価加算/上書き) */
  hourlyRate: number;
  active: boolean;
}

/** 現場ごとの必要要件(シフトがこれを満たすかチェック) */
export interface SiteRequirement {
  id: string;
  siteId: string;
  jobType: JobType;
  /** 必要人数 */
  requiredCount: number;
  /** 現場監督が必須か */
  requiresSupervisor: boolean;
}

// ----------------------------------------------------------------------------
// シフト(予定) → 実績
// ----------------------------------------------------------------------------

export interface Shift {
  id: string;
  siteId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  note?: string;
}

export interface ShiftAssignment {
  id: string;
  shiftId: string;
  employeeId: string;
  /** AIが埋めた枠か、管理者が手動配置したか */
  source: "manual" | "ai";
  /** 必須メンバー(管理者が先に固定。AIは触らない) */
  locked: boolean;
}

/** 出退勤の実績 */
/** 1回分の休憩。複数回の休憩に対応するため配列で持つ。end=null は休憩中 */
export interface BreakPeriod {
  start: string; // ISO datetime
  end: string | null; // ISO datetime。null=休憩中
}

/** 管理者による打刻修正の履歴(1件分)。修正前の値と理由を残す */
export interface AttendanceCorrection {
  at: string; // ISO datetime
  byId: string; // 修正した管理者
  reason: string;
  before: {
    clockIn: string | null;
    clockOut: string | null;
    breaks: BreakPeriod[];
  };
}

export interface Attendance {
  id: string;
  employeeId: string;
  siteId: string;
  /** 紐付くシフト割当(予定)。なければ予定外勤務 */
  shiftAssignmentId: string | null;
  date: string; // YYYY-MM-DD
  clockIn: string | null; // ISO datetime
  clockOut: string | null; // ISO datetime
  /** 休憩(複数回対応)。古い1回のみの breakStart/breakEnd を置き換え */
  breaks: BreakPeriod[];
  /** 自動計算結果(domain/attendance.ts が算出) */
  workedMinutes: number; // 実労働(休憩除く)
  breakMinutes: number; // 休憩合計(完了した休憩のみ)
  overtimeMinutes: number; // 所定外残業(所定労働時間を超えた分)
  /** 法定外残業(1日8時間を超えた分)。36協定の集計に使う */
  legalOvertimeMinutes: number;
  /** 深夜労働(22:00〜翌5:00)の分数 */
  nightMinutes: number;
  /** 法定休日の労働か */
  holidayWork: boolean;
  /** 予定開始との差。正=遅刻(分)、負=早出(分) */
  startDiffMinutes: number;
  /** 管理者による修正履歴(新しい順でなく追記順) */
  corrections: AttendanceCorrection[];
  /** 同期状態(オフライン対応) */
  syncStatus: "synced" | "pending";
}

// ----------------------------------------------------------------------------
// アルコールチェック記録
//
// 出勤前に1回実施し、記録簿として1年間保存する
// (道路交通法施行規則 第9条の10 の記録項目に対応)。
// 確認は必ずアルコール検知器で行う運用のため、確認方法は記録に持たない。
// 勤怠(Attendance)とは独立したテーブルにしている。理由:
//   - 「検出あり」で出勤できなかった場合も記録を残す必要がある
// ----------------------------------------------------------------------------

export interface AlcoholCheckRecord {
  id: string;
  employeeId: string;
  /** 実施時点の現場。特定できなければ null */
  siteId: string | null;
  date: string; // YYYY-MM-DD(勤務日)
  /** アルコールの検出有無。false=検出なし(異常なし) / true=検出あり */
  detected: boolean;
  checkedAt: string; // ISO datetime
  /** 確認者。アプリからの実施は本人IDが入る */
  confirmerId: string;
  /** 指示事項・備考(検出ありのときの対応など) */
  note?: string;
}

// ----------------------------------------------------------------------------
// 引き継ぎ・通達
// ----------------------------------------------------------------------------

export interface Handover {
  id: string;
  /** 作成者(退勤した従業員) */
  authorId: string;
  siteId: string;
  /** この引き継ぎが対象とする勤務日 */
  date: string; // YYYY-MM-DD
  body: string;
  createdAt: string; // ISO datetime
  /** 既読にした時刻。null/undefined=未読。既読から24時間で自動削除する */
  readAt?: string | null;
}

export interface Notice {
  id: string;
  /** 社長/管理者 */
  authorId: string;
  title: string;
  body: string;
  publishedAt: string; // ISO datetime
  /** 重要(目立たせる) */
  important: boolean;
}

// ----------------------------------------------------------------------------
// 休暇希望(休みたい日)。AIシフト生成・シフト作成の入力になる。
//   記載なし          = 出勤可能(レコードを作らない)
//   off(×)           = 休みたい(出勤できない)
//   off_negotiable(▲) = できれば休みたいが出勤も可能
//   partial(△)        = 短時間(時間帯を指定して部分的に勤務可能。半休/早退/遅刻を兼ねる)
// ----------------------------------------------------------------------------

export type LeaveType = "off" | "off_negotiable" | "partial";

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  off: "休みたい",
  off_negotiable: "できれば休みたい",
  partial: "短時間",
};

export const LEAVE_TYPE_MARK: Record<LeaveType, string> = {
  off: "×",
  off_negotiable: "▲",
  partial: "△",
};

export interface LeaveRequest {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  type: LeaveType;
  /** 短時間(partial)のときの希望時間帯(例 10:00〜15:00)。HH:mm */
  startTime?: string;
  endTime?: string;
  createdAt: string;
}

/** 月単位の休み希望「提出」記録(いつ提出したか) */
export interface LeaveSubmission {
  id: string;
  employeeId: string;
  year: number;
  month: number; // 1-12
  submittedAt: string; // ISO datetime
}

// ----------------------------------------------------------------------------
// 年次有給休暇(年次有給休暇管理簿: 基準日・日数・取得日を記録)
//   grant = 付与(基準日に日数を付与。2年で時効)
//   use   = 取得(1日 or 0.5日)
// ----------------------------------------------------------------------------

export type PaidLeaveKind = "grant" | "use";

export interface PaidLeave {
  id: string;
  employeeId: string;
  kind: PaidLeaveKind;
  /** 付与日(基準日) または 取得日 */
  date: string; // YYYY-MM-DD
  /** 日数(付与: 10/11/12…、取得: 1 or 0.5) */
  days: number;
  /** 付与分の時効(付与日の2年後)。取得分は未使用 */
  expiresOn?: string;
  note?: string;
}

// ----------------------------------------------------------------------------
// 給与
// ----------------------------------------------------------------------------

export interface PayrollRecord {
  id: string;
  employeeId: string;
  year: number;
  month: number;
  /** 内訳 */
  baseAmount: number; // 基本給(実労働分)
  overtimeAmount: number; // 残業手当
  siteAllowance: number; // 現場単価加算分
  grossAmount: number; // 総支給
  /** 集計元の実績日数・時間(レポート/検証用) */
  workedDays: number;
  workedMinutes: number;
  overtimeMinutes: number;
}

// ----------------------------------------------------------------------------
// 労務コンプライアンス
// ----------------------------------------------------------------------------

export type ComplianceCheckPhase = "planned" | "actual";
export type ComplianceRule =
  | "consecutive_days"
  | "monthly_overtime" // 月45h(所定: settings)超過・警告
  | "monthly_overtime_cap" // 月100h(休日労働含む)超過
  | "annual_overtime" // 年360h 超過
  | "multi_month_overtime" // 2〜6ヶ月平均80h 超過
  | "no_weekly_rest" // 週1日の法定休日なし
  | "paid_leave_shortfall" // 年5日の年休取得未達
  | "site_requirement_shortage";

export const COMPLIANCE_RULE_LABEL: Record<ComplianceRule, string> = {
  consecutive_days: "連続勤務日数",
  monthly_overtime: "月間残業(36協定)",
  monthly_overtime_cap: "月100時間超",
  annual_overtime: "年間残業(36協定)",
  multi_month_overtime: "複数月平均80時間超",
  no_weekly_rest: "週1日の休日なし",
  paid_leave_shortfall: "年休5日取得義務",
  site_requirement_shortage: "現場要件",
};
export type ComplianceSeverity = "warning" | "violation";

export interface ComplianceAlert {
  id: string;
  /** planned=シフト作成時(予定値) / actual=月末(実績値) */
  phase: ComplianceCheckPhase;
  rule: ComplianceRule;
  severity: ComplianceSeverity;
  employeeId: string | null; // 現場要件不足は従業員紐付かない場合あり
  siteId: string | null;
  /** 対象期間 */
  periodStart: string;
  periodEnd: string;
  message: string;
  /** 検知時の数値(例: 連続9日) */
  value: number;
  threshold: number;
  detectedAt: string;
}

// ----------------------------------------------------------------------------
// 監査ログ(改ざん防止・追記専用)
// ----------------------------------------------------------------------------

export type AuditAction = "create" | "update" | "delete" | "reset" | "import";

export interface AuditLog {
  id: string;
  /** 連番(1始まり)。欠番があれば削除された痕跡 */
  seq: number;
  actorId: string; // 実行者(従業員ID)。自動処理は "system"
  action: AuditAction;
  entity: string; // テーブル名(設定は "settings")
  entityId: string;
  /** 変更前後。update は変更したフィールドのみ(容量節約) */
  before: unknown | null;
  after: unknown | null;
  /** 修正理由(打刻修正など) */
  reason?: string;
  at: string; // ISO datetime
  /** 前エントリの hash + 本エントリ内容のハッシュ(改ざん検知の連鎖) */
  hash: string;
}

// ----------------------------------------------------------------------------
// アプリ設定(管理者=社長が切替。従業員メニューの表示制御など)
// ----------------------------------------------------------------------------

export interface AppSettings {
  /** 従業員メニューに「シフト希望」を表示するか */
  showShiftPreference: boolean;
  /** 法定休日の曜日(0=日 … 6=土) */
  legalHolidayWeekday: number;
  /** 36協定: 月の時間外上限(分)。既定 45h */
  overtimeMonthlyLimitMinutes: number;
  /** 月の時間外がこの値を超えたら警告(分)。既定 36h */
  overtimeMonthlyWarnMinutes: number;
  /** 36協定: 年の時間外上限(分)。既定 360h */
  overtimeAnnualLimitMinutes: number;
  /** 特別条項の月上限(時間外+休日労働、分)。既定 100h */
  overtimeMonthlyCapMinutes: number;
  /** 2〜6ヶ月平均の上限(分)。既定 80h */
  overtimeMultiMonthAvgMinutes: number;
  /** 年度の開始月(1〜12)。年360h の集計単位 */
  fiscalYearStartMonth: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  showShiftPreference: false,
  legalHolidayWeekday: 0,
  overtimeMonthlyLimitMinutes: 45 * 60,
  overtimeMonthlyWarnMinutes: 36 * 60,
  overtimeAnnualLimitMinutes: 360 * 60,
  overtimeMonthlyCapMinutes: 100 * 60,
  overtimeMultiMonthAvgMinutes: 80 * 60,
  fiscalYearStartMonth: 4,
};

// ----------------------------------------------------------------------------
// データベース全体(モックストアのスキーマ)
// ----------------------------------------------------------------------------

export interface Database {
  employees: Employee[];
  employmentConditions: EmploymentCondition[];
  taxRecords: TaxRecord[];
  sites: Site[];
  siteRequirements: SiteRequirement[];
  shifts: Shift[];
  shiftAssignments: ShiftAssignment[];
  attendances: Attendance[];
  alcoholChecks: AlcoholCheckRecord[];
  handovers: Handover[];
  notices: Notice[];
  leaveRequests: LeaveRequest[];
  leaveSubmissions: LeaveSubmission[];
  paidLeaves: PaidLeave[];
  payrollRecords: PayrollRecord[];
  complianceAlerts: ComplianceAlert[];
  auditLogs: AuditLog[];
  /** アプリ設定(配列テーブルではない) */
  settings: AppSettings;
}

/** insert/update/remove の対象となる「配列テーブル」のキーのみ */
export type TableName = {
  [K in keyof Database]: Database[K] extends unknown[] ? K : never;
}[keyof Database];
