"use client";

import { useMemo, useState } from "react";
import { useData } from "@/lib/db/DataContext";
import { useAuth } from "@/lib/auth/AuthContext";
import { Card, BackButton, PageTitle, Badge } from "@/components/ui/Common";
import { formatDateJp, formatTime, addMonth } from "@/lib/format";
import type { AlcoholCheckRecord } from "@/lib/types";
import type { AlcoholLogRow } from "@/lib/domain/alcoholCheck";
import {
  buildAlcoholCheckLog,
  confirmerCandidates,
} from "@/lib/domain/alcoholCheck";
import { downloadAlcoholCheckLog } from "@/lib/export/alcoholCheckXlsx";
import {
  AlcoholCheckEditModal,
  type AlcoholCheckPatch,
} from "@/components/admin/AlcoholCheckEditModal";

export default function AlcoholChecksPage() {
  const { db, update } = useData();
  const { currentUser } = useAuth();
  const now = new Date();
  const [ym, setYm] = useState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });
  const [onlyProblem, setOnlyProblem] = useState(false);
  const [empFilter, setEmpFilter] = useState("all");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 確認者の修正(1件)と一括変更
  const [editing, setEditing] = useState<AlcoholCheckRecord | null>(null);
  const [bulkConfirmerId, setBulkConfirmerId] = useState("");
  const [bulkConfirming, setBulkConfirming] = useState(false);

  const log = useMemo(
    () => buildAlcoholCheckLog(db, ym.year, ym.month),
    [db, ym]
  );
  const rows = log.rows
    .filter((r) => !onlyProblem || r.check?.detected || r.missing)
    .filter((r) => empFilter === "all" || r.employeeId === empFilter);

  if (!currentUser) return null;

  // 確認者の修正は社長(管理者)のみ。/admin 配下は管理者しか入れないが明示的に判定する。
  const canEdit = currentUser.role === "admin";
  const candidates = confirmerCandidates(db);
  const empName = (id: string) =>
    db.employees.find((e) => e.id === id)?.name ?? "(不明)";

  /** 表示中の行に含まれる記録(一括変更の対象) */
  const visibleRecords = rows
    .map((r) => r.check)
    .filter((x): x is AlcoholCheckRecord => !!x);

  const saveEdit = (patch: AlcoholCheckPatch) => {
    if (!editing) return;
    update("alcoholChecks", editing.id, patch, currentUser.id);
    setEditing(null);
  };

  const applyBulkConfirmer = () => {
    for (const rec of visibleRecords) {
      if (rec.confirmerId === bulkConfirmerId) continue;
      update(
        "alcoholChecks",
        rec.id,
        { confirmerId: bulkConfirmerId },
        currentUser.id
      );
    }
    setBulkConfirming(false);
  };

  const handleExport = async () => {
    setError(null);
    setExporting(true);
    try {
      await downloadAlcoholCheckLog(log, db);
    } catch (e) {
      console.error(e);
      setError("Excelの出力に失敗しました。もう一度お試しください。");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="shrink-0">
          <BackButton href="/admin" />
        </div>
        <PageTitle>アルコールチェック記録簿</PageTitle>
      </div>

      <p className="text-gray-600">
        出勤前の確認結果（アルコール検知器による）を月ごとに一覧します。記録は1年間保存してください。
      </p>

      {/* 月の選択 + 集計 + 出力 */}
      <Card className="flex flex-wrap items-center gap-3" guide="alc-summary">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setYm((v) => addMonth(v.year, v.month, -1))}
            className="rounded-xl bg-gray-200 px-4 py-2 text-lg font-bold text-gray-800 active:bg-gray-300"
          >
            ←
          </button>
          <div className="w-32 text-center text-xl font-bold text-gray-900">
            {ym.year}年{ym.month}月
          </div>
          <button
            type="button"
            onClick={() => setYm((v) => addMonth(v.year, v.month, 1))}
            className="rounded-xl bg-gray-200 px-4 py-2 text-lg font-bold text-gray-800 active:bg-gray-300"
          >
            →
          </button>
        </div>

        <div className="flex gap-4 text-gray-700">
          <div>
            <div className="text-sm text-gray-500">記録</div>
            <div className="text-xl font-bold text-gray-900">
              {log.recordCount}件
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">検出あり</div>
            <div
              className={`text-xl font-bold ${
                log.detectedCount > 0 ? "text-red-600" : "text-gray-900"
              }`}
            >
              {log.detectedCount}件
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">未実施</div>
            <div
              className={`text-xl font-bold ${
                log.missingCount > 0 ? "text-orange-600" : "text-gray-900"
              }`}
            >
              {log.missingCount}件
            </div>
          </div>
        </div>

        <select
          value={empFilter}
          onChange={(e) => setEmpFilter(e.target.value)}
          aria-label="従業員で絞り込む"
          className="rounded-xl border-2 border-gray-200 p-2 text-base text-gray-900"
        >
          <option value="all">全員</option>
          {db.employees
            .filter((e) => e.role === "employee")
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
        </select>
        <label className="flex items-center gap-2 text-gray-700">
          <input
            type="checkbox"
            checked={onlyProblem}
            onChange={(e) => setOnlyProblem(e.target.checked)}
            className="h-5 w-5"
          />
          検出あり・未実施のみ
        </label>

        <button
          type="button"
          data-guide="alc-export"
          onClick={handleExport}
          disabled={exporting || log.rows.length === 0}
          className="ml-auto rounded-2xl bg-green-600 px-6 py-3 text-lg font-bold text-white active:bg-green-700 disabled:bg-gray-300"
        >
          {exporting ? "出力中…" : "Excel出力"}
        </button>
      </Card>

      {error && (
        <div className="rounded-xl bg-red-50 p-3 text-center font-bold text-red-700">
          {error}
        </div>
      )}

      {/* 確認者の一括変更(社長のみ)。対面確認した管理者に付け替える運用向け。 */}
      {canEdit && visibleRecords.length > 0 && (
        <Card className="flex flex-wrap items-center gap-3">
          <div className="text-sm font-bold text-gray-500">
            表示中の記録{visibleRecords.length}件の確認者をまとめて変更
          </div>
          <select
            value={bulkConfirmerId}
            onChange={(e) => {
              setBulkConfirmerId(e.target.value);
              setBulkConfirming(false);
            }}
            aria-label="一括変更する確認者"
            className="rounded-xl border-2 border-gray-200 p-2 text-base text-gray-900"
          >
            <option value="">確認者をえらぶ</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {!bulkConfirming ? (
            <button
              type="button"
              onClick={() => setBulkConfirming(true)}
              disabled={!bulkConfirmerId}
              className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white active:bg-blue-700 disabled:bg-gray-300"
            >
              まとめて変更
            </button>
          ) : (
            <span className="flex items-center gap-2">
              <span className="font-bold text-gray-700">
                {empName(bulkConfirmerId)} に変更します。よろしいですか？
              </span>
              <button
                type="button"
                onClick={() => setBulkConfirming(false)}
                className="rounded-xl bg-gray-200 px-4 py-2 font-bold text-gray-700 active:bg-gray-300"
              >
                やめる
              </button>
              <button
                type="button"
                onClick={applyBulkConfirmer}
                className="rounded-xl bg-red-600 px-4 py-2 font-bold text-white active:bg-red-700"
              >
                実行する
              </button>
            </span>
          )}
        </Card>
      )}

      {/* 一覧 */}
      <Card className="overflow-x-auto" guide="alc-table">
        {rows.length === 0 ? (
          <div className="py-8 text-center text-gray-500">
            {log.rows.length === 0
              ? "この月の記録はありません。"
              : "該当する記録はありません。"}
          </div>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-3 font-bold">日付</th>
                <th className="py-2 pr-3 font-bold">氏名</th>
                <th className="py-2 pr-3 font-bold">現場</th>
                <th className="py-2 pr-3 font-bold">確認結果</th>
                <th className="py-2 font-bold">備考</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.date}-${r.employeeId}`}
                  className={`border-b border-gray-100 ${
                    r.check?.detected ? "bg-red-50" : ""
                  }`}
                >
                  <td className="py-2 pr-3 whitespace-nowrap text-gray-700">
                    {formatDateJp(r.date)}
                  </td>
                  <td className="py-2 pr-3 font-bold whitespace-nowrap text-gray-900">
                    {r.employeeName}
                  </td>
                  <td className="py-2 pr-3 text-gray-600">{r.siteName}</td>
                  <td className="py-2 pr-3">
                    <CheckCell
                      row={r}
                      confirmerName={
                        r.check ? empName(r.check.confirmerId) : ""
                      }
                      canEdit={canEdit}
                      onEdit={() => setEditing(r.check)}
                    />
                  </td>
                  <td className="py-2 text-gray-600">{r.check?.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* 確認者の修正(社長のみ) */}
      {editing && canEdit && (
        <AlcoholCheckEditModal
          record={editing}
          employeeName={empName(editing.employeeId)}
          // 現在の確認者(本人など)が候補に無い場合は先頭に足して選択状態を保つ
          candidates={
            candidates.some((c) => c.id === editing.confirmerId)
              ? candidates
              : [
                  ...db.employees.filter((e) => e.id === editing.confirmerId),
                  ...candidates,
                ]
          }
          onSave={saveEdit}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/** 1回分の結果セル(時刻・判定・確認者) */
function CheckCell({
  row,
  confirmerName,
  canEdit,
  onEdit,
}: {
  row: AlcoholLogRow;
  confirmerName: string;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const check = row.check;

  if (!check) {
    return row.missing ? (
      <Badge tone="orange">未実施</Badge>
    ) : (
      <span className="text-gray-300">—</span>
    );
  }

  return (
    <span className="block whitespace-nowrap">
      <span className="flex items-center gap-2">
        <Badge tone={check.detected ? "red" : "green"}>
          {check.detected ? "検出あり" : "異常なし"}
        </Badge>
        <span className="text-gray-600">{formatTime(check.checkedAt)}</span>
      </span>
      <span className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
        <span>
          確認者: {confirmerName}
          {check.confirmerId === check.employeeId && "（本人）"}
        </span>
        {canEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg bg-gray-100 px-2 py-0.5 font-bold text-gray-700 active:bg-gray-200"
          >
            修正
          </button>
        )}
      </span>
    </span>
  );
}
