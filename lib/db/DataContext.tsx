"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import type {
  Database,
  TableName,
  Attendance,
  AppSettings,
  AuditLog,
  AuditAction,
} from "@/lib/types";
import {
  loadDb,
  saveDb,
  resetDb,
  makeAuditLog,
  migrateDb,
  importDb,
  STORAGE_KEY,
  type LoadNotice,
} from "./store";

type Row = { id: string };

/** 自動処理(自動削除・同期)の実行者ID */
export const SYSTEM_ACTOR = "system";

interface DataApi {
  db: Database;
  ready: boolean;

  /** 起動時の通知(移行した/壊れていた)。null なら問題なし */
  loadNotice: LoadNotice | null;
  /** 直近の保存エラー(容量超過など)。null なら正常 */
  storageError: string | null;

  /** ネットワーク状態(navigator.onLine による自動判定) */
  online: boolean;
  /** 未同期(pending)件数 */
  pendingCount: number;
  /** 手動で同期を実行 */
  syncNow: () => void;

  insert: <T extends TableName>(
    table: T,
    row: Database[T][number],
    actorId: string,
    reason?: string
  ) => void;
  update: <T extends TableName>(
    table: T,
    id: string,
    patch: Partial<Database[T][number]>,
    actorId: string,
    reason?: string
  ) => void;
  remove: <T extends TableName>(
    table: T,
    id: string,
    actorId: string,
    reason?: string
  ) => void;

  /** アプリ設定の更新(社長=管理者が操作) */
  updateSettings: (patch: Partial<AppSettings>, actorId: string) => void;

  /** サンプルデータに戻す(監査ログは退避して新しいログに reset を記録) */
  reset: (actorId: string) => void;
  /** バックアップ JSON から復元する。失敗時は例外 */
  importBackup: (json: string, actorId: string) => void;
}

const DataContext = createContext<DataApi | null>(null);

/** patch のキーだけを行から抜き出す(監査ログの差分用) */
function pick(row: Row | null, keys: string[]): Record<string, unknown> | null {
  if (!row) return null;
  const r = row as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = r[k];
  return out;
}

/** 直前のログに連鎖させた新しいログを足す */
function appendLog(
  prev: Database,
  actorId: string,
  action: AuditAction,
  entity: string,
  entityId: string,
  before: unknown | null,
  after: unknown | null,
  reason?: string
): AuditLog[] {
  const last = prev.auditLogs[prev.auditLogs.length - 1];
  return [
    ...prev.auditLogs,
    makeAuditLog(last, actorId, action, entity, entityId, before, after, reason),
  ];
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  // 遅延初期化で localStorage を読む(SSR ではシード)。通知も一緒に受け取る。
  const [initial] = useState(() => loadDb());
  const [db, setDb] = useState<Database>(initial.db);
  const [loadNotice] = useState<LoadNotice | null>(initial.notice);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [online, setOnlineState] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    // マウント1回のみの意図的なフラグ更新。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
  }, []);

  // 永続化は副作用として一元化する(updater は純粋に保つ)。
  // 保存失敗は storageError に載せてヘッダーで知らせる。
  useEffect(() => {
    if (!ready) return;
    const result = saveDb(db);
    // 保存結果の反映(意図的な effect 内更新)。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStorageError(result.ok ? null : result.error ?? "保存に失敗しました");
  }, [db, ready]);

  // 他タブが保存したら取り込む(後勝ち上書きを防ぐ)。自タブの保存ではこのイベントは発火しない。
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        setDb(migrateDb(JSON.parse(e.newValue)));
      } catch {
        // 壊れた値は無視(自タブの状態を守る)
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const insert = useCallback(
    <T extends TableName>(
      table: T,
      row: Database[T][number],
      actorId: string,
      reason?: string
    ) => {
      setDb((prev) => ({
        ...prev,
        [table]: [...(prev[table] as Row[]), row],
        auditLogs: appendLog(prev, actorId, "create", table, (row as Row).id, null, row, reason),
      }));
    },
    []
  );

  const update = useCallback(
    <T extends TableName>(
      table: T,
      id: string,
      patch: Partial<Database[T][number]>,
      actorId: string,
      reason?: string
    ) => {
      setDb((prev) => {
        const list = prev[table] as Row[];
        const before = list.find((r) => r.id === id) ?? null;
        if (!before) return prev; // 存在しない行は何もしない(空のログも残さない)
        const after = { ...before, ...patch };
        const keys = Object.keys(patch);
        return {
          ...prev,
          [table]: list.map((r) => (r.id === id ? after : r)),
          auditLogs: appendLog(
            prev,
            actorId,
            "update",
            table,
            id,
            pick(before, keys),
            pick(after, keys),
            reason
          ),
        };
      });
    },
    []
  );

  const remove = useCallback(
    <T extends TableName>(table: T, id: string, actorId: string, reason?: string) => {
      setDb((prev) => {
        const list = prev[table] as Row[];
        const before = list.find((r) => r.id === id) ?? null;
        if (!before) return prev;
        return {
          ...prev,
          [table]: list.filter((r) => r.id !== id),
          auditLogs: appendLog(prev, actorId, "delete", table, id, before, null, reason),
        };
      });
    },
    []
  );

  const updateSettings = useCallback((patch: Partial<AppSettings>, actorId: string) => {
    setDb((prev) => {
      const keys = Object.keys(patch) as (keyof AppSettings)[];
      const before: Partial<AppSettings> = {};
      for (const k of keys) (before as Record<string, unknown>)[k] = prev.settings[k];
      return {
        ...prev,
        settings: { ...prev.settings, ...patch },
        auditLogs: appendLog(prev, actorId, "update", "settings", "settings", before, patch),
      };
    });
  }, []);

  // 引き継ぎの自動消去。既読(readAt)から24時間を過ぎたものを削除する(system として記録)。
  useEffect(() => {
    const TTL = 24 * 60 * 60 * 1000;
    const prune = () =>
      setDb((prev) => {
        const now = Date.now();
        const expired = prev.handovers.filter(
          (h) => h.readAt && now - new Date(h.readAt).getTime() >= TTL
        );
        if (expired.length === 0) return prev;
        let logs = prev.auditLogs;
        for (const h of expired) {
          const last = logs[logs.length - 1];
          logs = [...logs, makeAuditLog(last, SYSTEM_ACTOR, "delete", "handovers", h.id, h, null, "既読から24時間経過のため自動削除")];
        }
        const ids = new Set(expired.map((h) => h.id));
        return { ...prev, handovers: prev.handovers.filter((h) => !ids.has(h.id)), auditLogs: logs };
      });
    const first = setTimeout(prune, 0);
    const timer = setInterval(prune, 60 * 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  // pending の勤怠を synced にする(同期処理)
  const flushPending = useCallback(() => {
    setDb((prev) => {
      const pending = prev.attendances.filter((a) => a.syncStatus === "pending");
      if (pending.length === 0) return prev;
      let logs = prev.auditLogs;
      for (const a of pending) {
        const last = logs[logs.length - 1];
        logs = [...logs, makeAuditLog(last, SYSTEM_ACTOR, "update", "attendances", a.id, { syncStatus: "pending" }, { syncStatus: "synced" }, "オンライン復帰による同期")];
      }
      return {
        ...prev,
        attendances: prev.attendances.map((a) =>
          a.syncStatus === "pending" ? ({ ...a, syncStatus: "synced" } as Attendance) : a
        ),
        auditLogs: logs,
      };
    });
  }, []);

  const syncNow = useCallback(() => {
    if (online) flushPending();
  }, [online, flushPending]);

  useEffect(() => {
    const goOnline = () => {
      setOnlineState(true);
      flushPending();
    };
    const goOffline = () => setOnlineState(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [flushPending]);

  const reset = useCallback((actorId: string) => {
    setDb((prev) => {
      // 旧ログは別キーに退避(消さない)。容量不足なら諦める。
      try {
        window.localStorage.setItem(`kintai-audit-archive-${Date.now()}`, JSON.stringify(prev.auditLogs));
      } catch {
        // noop
      }
      const seeded = resetDb();
      const summary = {
        employees: prev.employees.length,
        attendances: prev.attendances.length,
        alcoholChecks: prev.alcoholChecks.length,
        auditLogs: prev.auditLogs.length,
      };
      return {
        ...seeded,
        auditLogs: appendLog({ ...seeded, auditLogs: [] }, actorId, "reset", "database", "all", summary, null, "サンプルデータに初期化"),
      };
    });
  }, []);

  const importBackup = useCallback((json: string, actorId: string) => {
    const imported = importDb(json); // 失敗時は例外を呼び出し側へ
    setDb((prev) => ({
      ...imported,
      auditLogs: appendLog(
        imported,
        actorId,
        "import",
        "database",
        "all",
        { attendances: prev.attendances.length },
        { attendances: imported.attendances.length },
        "バックアップから復元"
      ),
    }));
  }, []);

  const pendingCount = useMemo(
    () => db.attendances.filter((a) => a.syncStatus === "pending").length,
    [db.attendances]
  );

  const value: DataApi = useMemo(
    () => ({
      db,
      ready,
      loadNotice,
      storageError,
      online,
      pendingCount,
      syncNow,
      insert,
      update,
      remove,
      updateSettings,
      reset,
      importBackup,
    }),
    [db, ready, loadNotice, storageError, online, pendingCount, syncNow, insert, update, remove, updateSettings, reset, importBackup]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataApi {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData は DataProvider 内で使用してください");
  return ctx;
}
