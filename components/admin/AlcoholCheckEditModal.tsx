"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Common";
import { formatDateJp, formatTime } from "@/lib/format";
import type { AlcoholCheckRecord, Employee } from "@/lib/types";

export interface AlcoholCheckPatch {
  confirmerId: string;
  note?: string;
}

/**
 * アルコールチェック記録の確認者を上書きする編集ポップアップ(管理者専用)。
 * 対面確認した安全運転管理者を確認者として記録し直すために使う。
 * 検出の有無と実施時刻は改ざん防止のため編集できない。
 */
export function AlcoholCheckEditModal({
  record,
  employeeName,
  candidates,
  onSave,
  onCancel,
}: {
  record: AlcoholCheckRecord;
  employeeName: string;
  /** 確認者の候補(現在の確認者が含まれない場合は呼び出し側で追加済み) */
  candidates: Employee[];
  onSave: (patch: AlcoholCheckPatch) => void;
  onCancel: () => void;
}) {
  const [confirmerId, setConfirmerId] = useState(record.confirmerId);
  const [note, setNote] = useState(record.note ?? "");

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="alcohol-edit-title"
    >
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <div>
          <h2
            id="alcohol-edit-title"
            className="text-xl font-bold text-gray-900"
          >
            確認記録の修正
          </h2>
          <div className="mt-1 text-gray-600">
            {formatDateJp(record.date)} ／ {employeeName}
          </div>
        </div>

        {/* 変更できない項目(結果・実施時刻) */}
        <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3">
          <div className="text-sm text-gray-500">
            結果・実施時刻は変更できません
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={record.detected ? "red" : "green"}>
              {record.detected ? "検出あり" : "異常なし"}
            </Badge>
            <span className="font-bold text-gray-700">
              {formatTime(record.checkedAt)}
            </span>
          </div>
        </div>

        {/* 確認者 */}
        <div>
          <label
            htmlFor="alcohol-confirmer"
            className="mb-1 block text-sm font-bold text-gray-500"
          >
            確認者
          </label>
          <select
            id="alcohol-confirmer"
            value={confirmerId}
            onChange={(e) => setConfirmerId(e.target.value)}
            className="w-full rounded-xl border-2 border-gray-200 p-3 text-lg text-gray-900"
          >
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.id === record.employeeId ? "（本人）" : ""}
              </option>
            ))}
          </select>
        </div>

        {/* 指示事項・備考 */}
        <div>
          <label
            htmlFor="alcohol-note"
            className="mb-1 block text-sm font-bold text-gray-500"
          >
            指示事項・備考
          </label>
          <textarea
            id="alcohol-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="例: 対面で確認。異常なし。"
            className="w-full rounded-xl border-2 border-gray-200 p-3 text-base text-gray-900"
          />
        </div>

        <p className="text-xs text-gray-500">
          変更内容は監査ログに記録されます。
        </p>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-2xl bg-gray-200 p-3 text-lg font-bold text-gray-700 active:bg-gray-300"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() =>
              onSave({
                confirmerId,
                note: note.trim() ? note.trim() : undefined,
              })
            }
            className="rounded-2xl bg-green-600 p-3 text-lg font-bold text-white active:bg-green-700"
          >
            保存する
          </button>
        </div>
      </div>
    </div>
  );
}
