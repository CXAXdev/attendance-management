"use client";

import { useState } from "react";
import { formatDateJp } from "@/lib/format";
import type { Attendance, BreakPeriod, Site } from "@/lib/types";

/** モーダルが返す修正内容(時刻はローカル HH:mm。退勤・休憩終了は翌日指定可) */
export interface AttendanceEditResult {
  siteId: string;
  clockIn: string; // HH:mm
  clockOut: string | null; // HH:mm or null(未退勤のまま)
  clockOutNextDay: boolean;
  breaks: { start: string; end: string; nextDay: boolean }[];
  reason: string;
}

function hhmm(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function isNextDay(date: string, iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return ymd > date;
}

/**
 * 管理者の打刻修正ポップアップ。理由を必須にし、修正履歴と監査ログに残す。
 * 新規追加(打刻漏れの日)にも使う。
 */
export function AttendanceEditModal({
  date,
  employeeName,
  attendance,
  sites,
  onSave,
  onCancel,
}: {
  date: string;
  employeeName: string;
  /** null なら新規追加 */
  attendance: Attendance | null;
  sites: Site[];
  onSave: (r: AttendanceEditResult) => void;
  onCancel: () => void;
}) {
  const [siteId, setSiteId] = useState(attendance?.siteId ?? sites[0]?.id ?? "");
  const [clockIn, setClockIn] = useState(hhmm(attendance?.clockIn ?? null) || "08:00");
  const [clockOut, setClockOut] = useState(hhmm(attendance?.clockOut ?? null));
  const [clockOutNextDay, setClockOutNextDay] = useState(isNextDay(date, attendance?.clockOut ?? null));
  const [breaks, setBreaks] = useState(
    (attendance?.breaks ?? [{ start: "", end: null } as BreakPeriod])
      .filter((b) => b.start)
      .map((b) => ({ start: hhmm(b.start), end: hhmm(b.end), nextDay: isNextDay(date, b.end) }))
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const setBreak = (i: number, patch: Partial<{ start: string; end: string; nextDay: boolean }>) =>
    setBreaks((prev) => prev.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  const submit = () => {
    if (!reason.trim()) return setError("修正理由を入力してください。");
    if (!clockIn) return setError("出勤時刻を入力してください。");
    if (!siteId) return setError("現場を選んでください。");
    for (const b of breaks) {
      if (!b.start || !b.end) return setError("休憩は開始と終了の両方を入力してください(不要な休憩は削除)。");
    }
    if (clockOut && !clockOutNextDay && clockOut <= clockIn) {
      return setError("退勤が出勤より前になっています。日付をまたぐ場合は「翌日」にチェックしてください。");
    }
    onSave({ siteId, clockIn, clockOut: clockOut || null, clockOutNextDay, breaks, reason: reason.trim() });
  };

  const inputCls = "rounded-lg border border-gray-300 p-2 text-base";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{attendance ? "打刻の修正" : "勤怠の追加(打刻漏れ)"}</h2>
          <div className="text-gray-600">{formatDateJp(date)} ／ {employeeName}</div>
        </div>

        <label className="block">
          <span className="text-sm font-bold text-gray-500">現場</span>
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className={`mt-1 w-full ${inputCls}`}>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.active ? "" : "(終了)"}</option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-bold text-gray-500">出勤</span>
            <input type="time" value={clockIn} onChange={(e) => setClockIn(e.target.value)} className={`mt-1 w-full ${inputCls}`} />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-gray-500">退勤(空欄=未退勤)</span>
            <input type="time" value={clockOut} onChange={(e) => setClockOut(e.target.value)} className={`mt-1 w-full ${inputCls}`} />
            <span className="mt-1 flex items-center gap-1 text-xs text-gray-600">
              <input type="checkbox" checked={clockOutNextDay} onChange={(e) => setClockOutNextDay(e.target.checked)} />
              翌日(夜勤など)
            </span>
          </label>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-500">休憩</span>
            <button type="button" onClick={() => setBreaks((p) => [...p, { start: "12:00", end: "13:00", nextDay: false }])} className="rounded-lg bg-gray-100 px-2 py-1 text-xs font-bold text-gray-700">
              ＋ 追加
            </button>
          </div>
          {breaks.length === 0 && <div className="text-sm text-gray-400">休憩なし</div>}
          <div className="space-y-2">
            {breaks.map((b, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <input type="time" value={b.start} onChange={(e) => setBreak(i, { start: e.target.value })} className={inputCls} />
                <span>〜</span>
                <input type="time" value={b.end} onChange={(e) => setBreak(i, { end: e.target.value })} className={inputCls} />
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  <input type="checkbox" checked={b.nextDay} onChange={(e) => setBreak(i, { nextDay: e.target.checked })} />翌日
                </label>
                <button type="button" onClick={() => setBreaks((p) => p.filter((_, j) => j !== i))} className="text-xs font-bold text-red-600">削除</button>
              </div>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="text-sm font-bold text-gray-500">修正理由(必須・監査ログに残ります)</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="例: 退勤打刻忘れ。本人申告 17:10 を現場監督が確認。" className={`mt-1 w-full ${inputCls}`} />
        </label>

        {attendance && attendance.corrections.length > 0 && (
          <div className="rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
            <div className="font-bold">これまでの修正</div>
            {attendance.corrections.map((c, i) => (
              <div key={i}>・{new Date(c.at).toLocaleString("ja-JP")}: {c.reason}</div>
            ))}
          </div>
        )}

        {error && <div className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div>}

        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancel} className="rounded-2xl bg-gray-200 p-3 text-lg font-bold text-gray-700 active:bg-gray-300">キャンセル</button>
          <button type="button" onClick={submit} className="rounded-2xl bg-blue-600 p-3 text-lg font-bold text-white active:bg-blue-700">保存する</button>
        </div>
      </div>
    </div>
  );
}
