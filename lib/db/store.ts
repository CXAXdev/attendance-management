import type { Database, AuditLog, AuditAction, Attendance } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { buildSeed } from "./seed";
import { calcNightMinutes, LEGAL_DAILY_MINUTES } from "@/lib/domain/attendance";

// ============================================================================
// localStorage への永続化。
// - スキーマ変更時は STORAGE_KEY を上げ、旧キーのデータは migrateDb で引き継ぐ
//   (再シードは「どのキーにも無いとき」だけ)。
// - 壊れたデータは退避してからシードし、呼び出し側に通知する。
// - 保存失敗(容量超過)は例外にせず結果で返す。
// ============================================================================

export const STORAGE_KEY = "kintai-db-v10";
const LEGACY_KEYS = ["kintai-db-v9"];
/** ブラウザの一般的な localStorage 上限の目安 */
export const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024;

/** 一意IDを払い出す(プロトタイプ簡易実装) */
export function genId(prefix = "id"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

export interface LoadNotice {
  kind: "migrated" | "corrupt";
  message: string;
}

export interface LoadResult {
  db: Database;
  notice: LoadNotice | null;
}

/** localStorage から読み込む。旧バージョンは移行、無ければシードを生成して保存。 */
export function loadDb(): LoadResult {
  if (typeof window === "undefined") return { db: buildSeed(), notice: null };
  const ls = window.localStorage;

  const raw = ls.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return { db: migrateDb(JSON.parse(raw)), notice: null };
    } catch {
      const backupKey = quarantine(raw);
      const seeded = buildSeed();
      saveDb(seeded);
      return {
        db: seeded,
        notice: {
          kind: "corrupt",
          message: `保存データを読み込めなかったため ${backupKey} に退避し、サンプルデータで起動しました。`,
        },
      };
    }
  }

  for (const key of LEGACY_KEYS) {
    const legacy = ls.getItem(key);
    if (!legacy) continue;
    try {
      const db = migrateDb(JSON.parse(legacy));
      saveDb(db);
      ls.removeItem(key);
      return {
        db,
        notice: {
          kind: "migrated",
          message: "以前のバージョンのデータを引き継ぎました。",
        },
      };
    } catch {
      const backupKey = quarantine(legacy);
      const seeded = buildSeed();
      saveDb(seeded);
      return {
        db: seeded,
        notice: {
          kind: "corrupt",
          message: `以前のデータを読み込めなかったため ${backupKey} に退避し、サンプルデータで起動しました。`,
        },
      };
    }
  }

  const seeded = buildSeed();
  saveDb(seeded);
  return { db: seeded, notice: null };
}

/** 壊れたデータを別キーへ退避する(消さない) */
function quarantine(raw: string): string {
  const key = `kintai-db-corrupt-${Date.now()}`;
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    // 退避すら失敗する(容量)場合はあきらめる
  }
  return key;
}

export interface SaveResult {
  ok: boolean;
  error?: string;
}

/** 保存。容量超過などの失敗は例外にせず結果で返す。 */
export function saveDb(db: Database): SaveResult {
  if (typeof window === "undefined") return { ok: true };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/** localStorage を消去してシードに戻す */
export function resetDb(): Database {
  const seeded = buildSeed();
  saveDb(seeded);
  return seeded;
}

/** 使用量(UTF-16 なので文字数×2 バイトで概算) */
export function storageUsage(): { bytes: number; limit: number; ratio: number } {
  if (typeof window === "undefined") return { bytes: 0, limit: STORAGE_LIMIT_BYTES, ratio: 0 };
  let chars = 0;
  const ls = window.localStorage;
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (!k) continue;
    chars += k.length + (ls.getItem(k)?.length ?? 0);
  }
  const bytes = chars * 2;
  return { bytes, limit: STORAGE_LIMIT_BYTES, ratio: bytes / STORAGE_LIMIT_BYTES };
}

// ----------------------------------------------------------------------------
// スキーマ移行: 欠けているテーブル/フィールドに既定値を入れて現行の Database にする
// ----------------------------------------------------------------------------

const TABLES: (keyof Database)[] = [
  "employees",
  "employmentConditions",
  "taxRecords",
  "sites",
  "siteRequirements",
  "shifts",
  "shiftAssignments",
  "attendances",
  "alcoholChecks",
  "handovers",
  "notices",
  "leaveRequests",
  "leaveSubmissions",
  "paidLeaves",
  "payrollRecords",
  "complianceAlerts",
  "auditLogs",
];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function migrateDb(input: unknown): Database {
  if (!isObject(input)) throw new Error("not an object");
  if (!Array.isArray(input.employees)) throw new Error("employees missing");

  const out = {} as Record<keyof Database, unknown>;
  for (const t of TABLES) {
    const v = input[t];
    out[t] = Array.isArray(v) ? v : [];
  }
  const settings = {
    ...DEFAULT_SETTINGS,
    ...(isObject(input.settings) ? input.settings : {}),
  };
  out.settings = settings;
  const db = out as unknown as Database;

  db.employees = db.employees.map((e) => ({
    ...e,
    jobTypes: Array.isArray(e.jobTypes) ? e.jobTypes : [],
    active: e.active !== false,
  }));

  db.attendances = db.attendances.map((a) => normalizeAttendance(a, settings.legalHolidayWeekday));

  // 監査ログの連番/ハッシュが無い旧データは、連鎖を組み直す
  if (db.auditLogs.some((l) => typeof l.seq !== "number" || !l.hash)) {
    let prev: AuditLog | undefined;
    db.auditLogs = db.auditLogs.map((l) => {
      const rebuilt = makeAuditLog(prev, l.actorId, l.action, l.entity, l.entityId, l.before, l.after, l.reason, l.at, l.id);
      prev = rebuilt;
      return rebuilt;
    });
  }
  return db;
}

/** 旧データの勤怠に新フィールドを補う */
function normalizeAttendance(a: Attendance, legalHolidayWeekday: number): Attendance {
  const breaks = Array.isArray(a.breaks) ? a.breaks : [];
  const worked = a.workedMinutes ?? 0;
  return {
    ...a,
    breaks,
    workedMinutes: worked,
    breakMinutes: a.breakMinutes ?? 0,
    overtimeMinutes: a.overtimeMinutes ?? 0,
    startDiffMinutes: a.startDiffMinutes ?? 0,
    legalOvertimeMinutes:
      typeof a.legalOvertimeMinutes === "number"
        ? a.legalOvertimeMinutes
        : Math.max(0, worked - LEGAL_DAILY_MINUTES),
    nightMinutes:
      typeof a.nightMinutes === "number"
        ? a.nightMinutes
        : calcNightMinutes(a.date, a.clockIn, a.clockOut, breaks),
    holidayWork:
      typeof a.holidayWork === "boolean"
        ? a.holidayWork
        : new Date(`${a.date}T00:00:00`).getDay() === legalHolidayWeekday,
    corrections: Array.isArray(a.corrections) ? a.corrections : [],
    syncStatus: a.syncStatus ?? "synced",
  };
}

// ----------------------------------------------------------------------------
// バックアップ(JSON の書き出し/読み込み)
// ----------------------------------------------------------------------------

const BACKUP_FORMAT = "kintai-backup";

export function exportDb(db: Database): string {
  return JSON.stringify(
    { format: BACKUP_FORMAT, schema: 10, exportedAt: new Date().toISOString(), db },
    null,
    0
  );
}

/** バックアップ JSON(または生の Database JSON)を読み込んで検証する */
export function importDb(json: string): Database {
  const parsed: unknown = JSON.parse(json);
  if (isObject(parsed) && parsed.format === BACKUP_FORMAT && isObject(parsed.db)) {
    return migrateDb(parsed.db);
  }
  return migrateDb(parsed);
}

// ----------------------------------------------------------------------------
// 監査ログ(追記専用・ハッシュ連鎖で改ざん検知)
// ----------------------------------------------------------------------------

/** FNV-1a 32bit。暗号学的強度はないが、連鎖させることで書き換えを検知できる */
export function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function chainHash(
  prevHash: string,
  seq: number,
  actorId: string,
  action: AuditAction,
  entity: string,
  entityId: string,
  at: string,
  before: unknown,
  after: unknown,
  reason: string | undefined
): string {
  return fnv1a(
    [prevHash, seq, actorId, action, entity, entityId, at, JSON.stringify(before ?? null), JSON.stringify(after ?? null), reason ?? ""].join("|")
  );
}

/** 監査ログを1件生成。prev は直前のエントリ(連番とハッシュを連鎖させる) */
export function makeAuditLog(
  prev: AuditLog | undefined,
  actorId: string,
  action: AuditAction,
  entity: string,
  entityId: string,
  before: unknown | null,
  after: unknown | null,
  reason?: string,
  at: string = new Date().toISOString(),
  id: string = genId("audit")
): AuditLog {
  const seq = (prev?.seq ?? 0) + 1;
  const hash = chainHash(prev?.hash ?? "", seq, actorId, action, entity, entityId, at, before, after, reason);
  const log: AuditLog = { id, seq, actorId, action, entity, entityId, before, after, at, hash };
  if (reason) log.reason = reason;
  return log;
}

/** 連鎖を検証する。壊れていれば最初に不整合が出た seq を返す */
export function verifyAuditChain(logs: AuditLog[]): { ok: boolean; brokenAt?: number } {
  let prevHash = "";
  let prevSeq = 0;
  for (const l of logs) {
    const expected = chainHash(prevHash, l.seq, l.actorId, l.action, l.entity, l.entityId, l.at, l.before, l.after, l.reason);
    if (l.seq !== prevSeq + 1 || l.hash !== expected) {
      return { ok: false, brokenAt: l.seq };
    }
    prevHash = l.hash;
    prevSeq = l.seq;
  }
  return { ok: true };
}
