"use client";

import { useMemo, useState } from "react";
import { useData } from "@/lib/db/DataContext";
import { Card, BackButton, PageTitle, Badge } from "@/components/ui/Common";
import { formatDateTimeJp } from "@/lib/format";
import { verifyAuditChain } from "@/lib/db/store";
import { toCsv, downloadCsv } from "@/lib/domain/report";
import type { AuditAction, AuditLog } from "@/lib/types";

const ENTITY_LABEL: Record<string, string> = {
  employees: "従業員",
  employmentConditions: "労働条件",
  taxRecords: "税務情報",
  sites: "現場",
  siteRequirements: "現場要件",
  shifts: "シフト",
  shiftAssignments: "シフト割当",
  attendances: "勤怠",
  alcoholChecks: "アルコールチェック",
  handovers: "引き継ぎ",
  notices: "通達",
  leaveRequests: "休み希望",
  leaveSubmissions: "休み希望の提出",
  paidLeaves: "年次有給休暇",
  payrollRecords: "給与",
  complianceAlerts: "労務アラート",
  settings: "設定",
  database: "データ全体",
};

const ACTION_LABEL: Record<AuditAction, { text: string; tone: "green" | "blue" | "red" | "orange" }> = {
  create: { text: "作成", tone: "green" },
  update: { text: "変更", tone: "blue" },
  delete: { text: "削除", tone: "red" },
  reset: { text: "初期化", tone: "orange" },
  import: { text: "復元", tone: "orange" },
};

const PAGE = 50;

/** 値を短い文字列に(表示用) */
function show(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v.length > 60 ? `${v.slice(0, 60)}…` : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const s = JSON.stringify(v);
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
}

/** update の差分(変更フィールドのみ)を before → after で並べる */
function DiffRows({ before, after }: { before: unknown; after: unknown }) {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => k !== "id");
  if (keys.length === 0) return null;
  return (
    <div className="mt-2 grid gap-0.5 text-xs">
      {keys.slice(0, 12).map((k) => (
        <div key={k} className="grid grid-cols-[110px_1fr] gap-2 border-t border-gray-100 py-0.5">
          <span className="font-bold text-gray-500">{k}</span>
          <span className="min-w-0 break-all text-gray-700">
            {show(b[k])} <span className="text-gray-400">→</span> <span className="font-bold text-gray-900">{show(a[k])}</span>
          </span>
        </div>
      ))}
      {keys.length > 12 && <div className="text-gray-400">…他 {keys.length - 12} 項目</div>}
    </div>
  );
}

export default function AuditPage() {
  const { db } = useData();
  const [entity, setEntity] = useState("all");
  const [actor, setActor] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [verify, setVerify] = useState<{ ok: boolean; brokenAt?: number } | null>(null);

  const actorName = (id: string) => (id === "system" ? "自動処理" : db.employees.find((e) => e.id === id)?.name ?? id);
  const actors = useMemo(() => [...new Set(db.auditLogs.map((l) => l.actorId))], [db.auditLogs]);

  const logs = useMemo(
    () =>
      [...db.auditLogs]
        .filter((l) => entity === "all" || l.entity === entity)
        .filter((l) => actor === "all" || l.actorId === actor)
        .filter((l) => !from || l.at >= `${from}T00:00:00`)
        .filter((l) => !to || l.at <= `${to}T23:59:59`)
        .sort((a, b) => b.seq - a.seq),
    [db.auditLogs, entity, actor, from, to]
  );

  const exportCsv = () => {
    const headers = ["連番", "日時", "実行者", "操作", "対象", "対象ID", "理由", "変更前", "変更後", "ハッシュ"];
    const rows = logs.map((l: AuditLog) => [
      l.seq,
      l.at,
      actorName(l.actorId),
      ACTION_LABEL[l.action].text,
      ENTITY_LABEL[l.entity] ?? l.entity,
      l.entityId,
      l.reason ?? "",
      JSON.stringify(l.before ?? null),
      JSON.stringify(l.after ?? null),
      l.hash,
    ]);
    downloadCsv(`監査ログ_${new Date().toISOString().slice(0, 10)}.csv`, toCsv(headers, rows));
  };

  return (
    <div className="space-y-5">
      <BackButton href="/admin" />
      <PageTitle>監査ログ(変更履歴)</PageTitle>
      <p className="text-gray-600">
        いつ・誰が・何を・なぜ変更したかを追記専用で記録しています。各記録は前の記録のハッシュを含むため、途中の書き換えや削除を検知できます。
      </p>

      <Card className="flex flex-wrap items-end gap-3" guide="audit-filters">
        <label className="text-sm">
          <span className="block text-xs font-bold text-gray-500">対象</span>
          <select value={entity} onChange={(e) => { setEntity(e.target.value); setLimit(PAGE); }} className="rounded-xl border border-gray-300 p-2">
            <option value="all">すべて</option>
            {Object.entries(ENTITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs font-bold text-gray-500">実行者</span>
          <select value={actor} onChange={(e) => { setActor(e.target.value); setLimit(PAGE); }} className="rounded-xl border border-gray-300 p-2">
            <option value="all">すべて</option>
            {actors.map((a) => <option key={a} value={a}>{actorName(a)}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs font-bold text-gray-500">開始日</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border border-gray-300 p-2" />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-bold text-gray-500">終了日</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border border-gray-300 p-2" />
        </label>
        <span className="text-sm text-gray-500">{logs.length}件</span>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => setVerify(verifyAuditChain(db.auditLogs))} className="rounded-xl bg-gray-200 px-4 py-2 font-bold text-gray-800 active:bg-gray-300">整合性チェック</button>
          <button type="button" onClick={exportCsv} disabled={logs.length === 0} className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white active:bg-blue-700 disabled:bg-gray-300">CSV出力</button>
        </div>
      </Card>

      {verify && (
        <div className={`rounded-xl p-3 font-bold ${verify.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
          {verify.ok
            ? `整合性に問題はありません(${db.auditLogs.length}件の連鎖を検証)。`
            : `連番 ${verify.brokenAt} で連鎖が途切れています。記録が書き換えられた、または削除された可能性があります。`}
        </div>
      )}

      <div className="space-y-2">
        {logs.length === 0 ? (
          <Card>記録はまだありません。操作すると自動で記録されます。</Card>
        ) : (
          logs.slice(0, limit).map((l) => {
            const action = ACTION_LABEL[l.action];
            return (
              <Card key={l.id}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-400">#{l.seq}</span>
                    <Badge tone={action.tone}>{action.text}</Badge>
                    <span className="font-bold text-gray-900">{ENTITY_LABEL[l.entity] ?? l.entity}</span>
                  </div>
                  <span className="shrink-0 text-xs text-gray-400">{formatDateTimeJp(l.at)}</span>
                </div>
                <div className="mt-1 text-sm text-gray-600">
                  実行者: {actorName(l.actorId)} ／ 対象ID: <span className="break-all">{l.entityId}</span>
                </div>
                {l.reason && <div className="mt-1 text-sm font-bold text-orange-800">理由: {l.reason}</div>}
                {l.action === "update" && <DiffRows before={l.before} after={l.after} />}
                {l.action === "create" && <div className="mt-1 break-all text-xs text-gray-500">{show(l.after)}</div>}
                {l.action === "delete" && <div className="mt-1 break-all text-xs text-gray-500">削除前: {show(l.before)}</div>}
                {(l.action === "reset" || l.action === "import") && <div className="mt-1 break-all text-xs text-gray-500">{show(l.before)} → {show(l.after)}</div>}
              </Card>
            );
          })
        )}
        {logs.length > limit && (
          <button type="button" onClick={() => setLimit((n) => n + PAGE)} className="w-full rounded-xl bg-gray-200 p-3 font-bold text-gray-700 active:bg-gray-300">
            もっと見る(残り {logs.length - limit} 件)
          </button>
        )}
      </div>
    </div>
  );
}
