"use client";

import { useMemo, useState } from "react";
import { useData } from "@/lib/db/DataContext";
import { useAuth } from "@/lib/auth/AuthContext";
import { Card, BackButton, PageTitle, Badge } from "@/components/ui/Common";
import { todayYmd, formatDateFullJp } from "@/lib/format";
import { genId } from "@/lib/db/store";
import { OBLIGATION_LABEL, allPaidLeaveSummaries, paidLeaveLedger, type ObligationStatus } from "@/lib/domain/paidLeave";
import { downloadPaidLeaveLedger } from "@/lib/export/paidLeaveXlsx";
import type { PaidLeave, PaidLeaveKind } from "@/lib/types";

const TONE: Record<ObligationStatus, "green" | "blue" | "orange" | "red" | "gray"> = {
  ok: "green",
  pending: "blue",
  warning: "orange",
  violation: "red",
  none: "gray",
};

export default function PaidLeavePage() {
  const { db, insert, remove } = useData();
  const { currentUser } = useAuth();
  const today = todayYmd();
  const [empId, setEmpId] = useState("");
  const [kind, setKind] = useState<PaidLeaveKind>("use");
  const [date, setDate] = useState(today);
  const [days, setDays] = useState("1");
  const [note, setNote] = useState("");
  const [exporting, setExporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const summaries = useMemo(() => allPaidLeaveSummaries(db, today), [db, today]);
  const selected = summaries.find((s) => s.employeeId === empId) ?? null;
  const ledger = useMemo(() => (selected ? paidLeaveLedger(db, selected.employeeId) : []), [db, selected]);

  if (!currentUser) return null;

  const add = () => {
    if (!selected) return;
    const n = Number(days);
    if (!date || !Number.isFinite(n) || n <= 0) return;
    const row: PaidLeave = {
      id: genId("pl"),
      employeeId: selected.employeeId,
      kind,
      date,
      days: n,
      expiresOn: kind === "grant" ? expiresFrom(date) : undefined,
      note: note.trim() || undefined,
    };
    insert("paidLeaves", row, currentUser.id);
    setNote("");
  };

  const exportXlsx = async () => {
    setExporting(true);
    try {
      await downloadPaidLeaveLedger(db, today);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="shrink-0"><BackButton href="/admin" /></div>
        <PageTitle>年次有給休暇管理簿</PageTitle>
      </div>
      <p className="text-gray-600">
        付与(基準日・日数)と取得日を記録し、残日数と「年5日取得義務」の達成状況を確認します。付与は2年で時効になります。
      </p>

      <Card className="flex flex-wrap items-center gap-3" guide="pl-summary">
        <div className="text-sm text-gray-600">
          未達・期限間近 <b className="text-red-700">{summaries.filter((s) => s.obligation.status === "violation" || s.obligation.status === "warning").length}人</b>
        </div>
        <button type="button" onClick={exportXlsx} disabled={exporting} className="ml-auto rounded-2xl bg-green-600 px-5 py-3 font-bold text-white active:bg-green-700 disabled:bg-gray-300">
          {exporting ? "出力中…" : "管理簿を Excel"}
        </button>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b-2 border-gray-200 text-left text-gray-500">
              <th className="py-2 pr-3 font-bold">氏名</th>
              <th className="py-2 pr-3 font-bold">直近の基準日</th>
              <th className="py-2 pr-3 font-bold">有効付与</th>
              <th className="py-2 pr-3 font-bold">取得</th>
              <th className="py-2 pr-3 font-bold">残日数</th>
              <th className="py-2 pr-3 font-bold">5日義務</th>
              <th className="py-2 font-bold"></th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((s) => (
              <tr key={s.employeeId} className={`border-b border-gray-100 ${selected?.employeeId === s.employeeId ? "bg-blue-50" : ""}`}>
                <td className="py-2 pr-3 font-bold text-gray-900">{s.name}{!s.active && <span className="ml-1 text-xs font-normal text-gray-400">退職</span>}</td>
                <td className="py-2 pr-3 text-gray-700">{s.lastGrantDate ? formatDateFullJp(s.lastGrantDate) : "—"}</td>
                <td className="py-2 pr-3 text-gray-700">{s.granted}日</td>
                <td className="py-2 pr-3 text-gray-700">{s.used}日</td>
                <td className="py-2 pr-3 font-bold text-gray-900">{s.balance}日</td>
                <td className="py-2 pr-3">
                  <Badge tone={TONE[s.obligation.status]}>{OBLIGATION_LABEL[s.obligation.status]}</Badge>
                  {s.obligation.baseDate && <span className="ml-1 text-xs text-gray-500">{s.obligation.usedInYear}/5日</span>}
                </td>
                <td className="py-2 text-right">
                  <button type="button" onClick={() => setEmpId(s.employeeId)} className="rounded-lg bg-gray-100 px-2 py-1 text-xs font-bold text-gray-700 active:bg-gray-200">明細</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {selected && (
        <Card className="space-y-3" guide="pl-detail">
          <div className="text-lg font-bold text-gray-900">{selected.name} さんの明細</div>
          <div className="flex flex-wrap items-end gap-2 rounded-xl bg-gray-50 p-3">
            <label className="text-sm">
              <span className="block text-xs font-bold text-gray-500">区分</span>
              <select value={kind} onChange={(e) => setKind(e.target.value as PaidLeaveKind)} className="rounded-lg border border-gray-300 p-2">
                <option value="use">取得</option>
                <option value="grant">付与</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-xs font-bold text-gray-500">日付</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-gray-300 p-2" />
            </label>
            <label className="text-sm">
              <span className="block text-xs font-bold text-gray-500">日数</span>
              <input type="number" step="0.5" min="0.5" value={days} onChange={(e) => setDays(e.target.value)} className="w-20 rounded-lg border border-gray-300 p-2" />
            </label>
            <label className="min-w-0 flex-1 text-sm">
              <span className="block text-xs font-bold text-gray-500">備考</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例: 私用" className="w-full rounded-lg border border-gray-300 p-2" />
            </label>
            <button type="button" onClick={add} className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white active:bg-blue-700">登録</button>
          </div>
          {ledger.length === 0 ? (
            <div className="text-sm text-gray-500">記録はありません。</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-1 pr-2 font-bold">日付</th>
                  <th className="py-1 pr-2 font-bold">区分</th>
                  <th className="py-1 pr-2 font-bold">日数</th>
                  <th className="py-1 pr-2 font-bold">時効</th>
                  <th className="py-1 pr-2 font-bold">残</th>
                  <th className="py-1 pr-2 font-bold">備考</th>
                  <th className="py-1"></th>
                </tr>
              </thead>
              <tbody>
                {[...ledger].reverse().map((l) => (
                  <tr key={l.id} className="border-b border-gray-100">
                    <td className="py-1 pr-2 text-gray-800">{formatDateFullJp(l.date)}</td>
                    <td className="py-1 pr-2"><Badge tone={l.kind === "grant" ? "green" : "blue"}>{l.kind === "grant" ? "付与" : "取得"}</Badge></td>
                    <td className="py-1 pr-2 text-gray-800">{l.days}日</td>
                    <td className="py-1 pr-2 text-gray-500">{l.expiresOn ? formatDateFullJp(l.expiresOn) : ""}</td>
                    <td className="py-1 pr-2 font-bold text-gray-900">{l.runningBalance}日</td>
                    <td className="py-1 pr-2 text-gray-600">{l.note ?? ""}</td>
                    <td className="py-1 text-right">
                      {confirmDelete === l.id ? (
                        <span className="flex justify-end gap-1">
                          <button type="button" onClick={() => setConfirmDelete(null)} className="rounded-lg bg-gray-200 px-2 py-1 text-xs font-bold">やめる</button>
                          <button type="button" onClick={() => { remove("paidLeaves", l.id, currentUser.id, "年休記録の取消"); setConfirmDelete(null); }} className="rounded-lg bg-red-600 px-2 py-1 text-xs font-bold text-white">削除する</button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => setConfirmDelete(l.id)} className="text-xs font-bold text-gray-400">削除</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}

function expiresFrom(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setFullYear(d.getFullYear() + 2);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
