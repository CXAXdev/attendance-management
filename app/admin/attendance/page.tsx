"use client";

import { useMemo, useState } from "react";
import { useData } from "@/lib/db/DataContext";
import { useAuth } from "@/lib/auth/AuthContext";
import { Card, BackButton, PageTitle, Badge } from "@/components/ui/Common";
import { todayYmd, formatDateJp, formatTime, formatMinutes, addMonth, nowIso } from "@/lib/format";
import { genId } from "@/lib/db/store";
import { buildLedger, employeesForLedger } from "@/lib/domain/attendanceLedger";
import { staleOpenAttendances } from "@/lib/domain/queries";
import { computeAttendanceFields } from "@/lib/domain/attendance";
import { downloadAttendanceLedgers } from "@/lib/export/attendanceLedgerXlsx";
import { AttendanceEditModal, type AttendanceEditResult } from "@/components/admin/AttendanceEditModal";
import type { Attendance } from "@/lib/types";

/** HH:mm(+翌日) をその日のローカル ISO に */
function toIso(date: string, hhmm: string, nextDay: boolean): string {
  const d = new Date(`${date}T${hhmm}:00`);
  if (nextDay) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

export default function AttendanceLedgerPage() {
  const { db, insert, update } = useData();
  const { currentUser } = useAuth();
  const today = todayYmd();
  const [ym, setYm] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }));
  const [empId, setEmpId] = useState<string>("");
  const [editing, setEditing] = useState<{ date: string; attendance: Attendance | null; employeeId: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const employees = useMemo(() => employeesForLedger(db, ym.year, ym.month), [db, ym]);
  const selected = employees.find((e) => e.id === empId) ?? employees[0];
  const ledger = useMemo(() => (selected ? buildLedger(db, selected, ym.year, ym.month) : null), [db, selected, ym]);
  const stale = useMemo(() => staleOpenAttendances(db, today), [db, today]);

  if (!currentUser) return null;
  const empName = (id: string) => db.employees.find((e) => e.id === id)?.name ?? "(不明)";

  const save = (r: AttendanceEditResult) => {
    if (!editing) return;
    const { date, attendance, employeeId } = editing;
    const clockIn = toIso(date, r.clockIn, false);
    const clockOut = r.clockOut ? toIso(date, r.clockOut, r.clockOutNextDay) : null;
    const breaks = r.breaks.map((b) => ({ start: toIso(date, b.start, false), end: toIso(date, b.end, b.nextDay) }));
    const base = { employeeId, date, clockIn, clockOut, breaks };
    const calc = computeAttendanceFields(db, base);
    if (attendance) {
      const patch: Partial<Attendance> = {
        siteId: r.siteId,
        clockIn,
        clockOut,
        breaks,
        ...calc,
        corrections: [
          ...attendance.corrections,
          { at: nowIso(), byId: currentUser.id, reason: r.reason, before: { clockIn: attendance.clockIn, clockOut: attendance.clockOut, breaks: attendance.breaks } },
        ],
      };
      update("attendances", attendance.id, patch, currentUser.id, r.reason);
      setMessage(`${formatDateJp(date)} の打刻を修正しました(理由: ${r.reason})。`);
    } else {
      const row: Attendance = {
        id: genId("att"),
        ...base,
        siteId: r.siteId,
        shiftAssignmentId: null,
        ...calc,
        corrections: [{ at: nowIso(), byId: currentUser.id, reason: r.reason, before: { clockIn: null, clockOut: null, breaks: [] } }],
        syncStatus: "synced",
      };
      insert("attendances", row, currentUser.id, r.reason);
      setMessage(`${formatDateJp(date)} の勤怠を追加しました(理由: ${r.reason})。`);
    }
    setEditing(null);
  };

  const exportOne = async () => {
    if (!ledger) return;
    setExporting(true);
    try {
      await downloadAttendanceLedgers(db, [ledger], `出勤簿_${ledger.employee.name}_${ym.year}-${String(ym.month).padStart(2, "0")}.xlsx`);
    } finally {
      setExporting(false);
    }
  };
  const exportAll = async () => {
    setExporting(true);
    try {
      const all = employees.map((e) => buildLedger(db, e, ym.year, ym.month));
      await downloadAttendanceLedgers(db, all, `出勤簿_全員_${ym.year}-${String(ym.month).padStart(2, "0")}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  const sites = db.sites;
  const m = (n: number) => (n > 0 ? formatMinutes(n) : "");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="shrink-0"><BackButton href="/admin" /></div>
        <PageTitle>出勤簿（勤怠台帳）</PageTitle>
      </div>
      <p className="text-gray-600">
        従業員ごとの日別の始業・終業・休憩・労働時間です。打刻の修正は理由つきで履歴に残ります(労基署の調査用に Excel 出力できます)。
      </p>

      {/* 退勤忘れ */}
      {stale.length > 0 && (
        <Card className="border-orange-300 bg-orange-50" guide="ledger-stale">
          <div className="mb-2 font-bold text-orange-800">未退勤のまま残っている勤怠が {stale.length} 件あります。修正してください。</div>
          <div className="flex flex-wrap gap-2">
            {stale.map((a) => (
              <button key={a.id} type="button" onClick={() => setEditing({ date: a.date, attendance: a, employeeId: a.employeeId })}
                className="rounded-xl border-2 border-orange-300 bg-white px-3 py-2 text-left text-sm font-bold text-gray-800 active:bg-orange-100">
                {empName(a.employeeId)} ・ {formatDateJp(a.date)} {formatTime(a.clockIn)}〜 <span className="text-orange-700">未退勤</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* 月・従業員・出力 */}
      <Card className="flex flex-wrap items-center gap-3" guide="ledger-controls">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setYm((v) => addMonth(v.year, v.month, -1))} className="rounded-xl bg-gray-200 px-4 py-2 text-lg font-bold text-gray-800 active:bg-gray-300">←</button>
          <div className="w-32 text-center text-xl font-bold text-gray-900">{ym.year}年{ym.month}月</div>
          <button type="button" onClick={() => setYm((v) => addMonth(v.year, v.month, 1))} className="rounded-xl bg-gray-200 px-4 py-2 text-lg font-bold text-gray-800 active:bg-gray-300">→</button>
        </div>
        <select value={selected?.id ?? ""} onChange={(e) => setEmpId(e.target.value)} aria-label="従業員" className="rounded-xl border-2 border-gray-200 p-2 text-base text-gray-900">
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}{e.active ? "" : "(退職)"}</option>
          ))}
        </select>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={exportOne} disabled={exporting || !ledger} className="rounded-2xl bg-green-600 px-4 py-3 font-bold text-white active:bg-green-700 disabled:bg-gray-300">
            この人を Excel
          </button>
          <button type="button" data-guide="ledger-export" onClick={exportAll} disabled={exporting} className="rounded-2xl bg-green-700 px-4 py-3 font-bold text-white active:bg-green-800 disabled:bg-gray-300">
            {exporting ? "出力中…" : "全員分を Excel"}
          </button>
        </div>
      </Card>

      {message && (
        <div className="flex items-start justify-between gap-3 rounded-xl border-2 border-green-300 bg-green-50 p-3">
          <div className="font-bold text-green-800">{message}</div>
          <button type="button" onClick={() => setMessage(null)} className="shrink-0 text-sm font-bold text-green-700">閉じる</button>
        </div>
      )}

      {ledger && (
        <>
          {/* 月計 */}
          <Card className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-700 sm:grid-cols-4" guide="ledger-totals">
            <div>出勤 <b className="text-gray-900">{ledger.totals.workedDays}日</b></div>
            <div>実労働 <b className="text-gray-900">{formatMinutes(ledger.totals.workedMinutes)}</b></div>
            <div>所定外 <b className="text-gray-900">{formatMinutes(ledger.totals.overtimeMinutes)}</b></div>
            <div>法定外 <b className="text-red-700">{formatMinutes(ledger.totals.legalOvertimeMinutes)}</b></div>
            <div>深夜 <b className="text-gray-900">{formatMinutes(ledger.totals.nightMinutes)}</b></div>
            <div>休日労働 <b className="text-gray-900">{ledger.totals.holidayWorkDays}日</b></div>
            <div>年休 <b className="text-gray-900">{ledger.totals.paidLeaveDays}日</b></div>
            <div>修正 <b className="text-gray-900">{ledger.totals.corrections}件</b>{ledger.totals.openDays > 0 && <span className="ml-1 font-bold text-orange-700">／ 未退勤 {ledger.totals.openDays}</span>}</div>
          </Card>

          {/* 日別 */}
          <Card className="overflow-x-auto" guide="ledger-table">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-2 font-bold">日付</th>
                  <th className="py-2 pr-2 font-bold">現場</th>
                  <th className="py-2 pr-2 font-bold">出勤</th>
                  <th className="py-2 pr-2 font-bold">退勤</th>
                  <th className="py-2 pr-2 font-bold">休憩</th>
                  <th className="py-2 pr-2 font-bold">実労働</th>
                  <th className="py-2 pr-2 font-bold">法定外</th>
                  <th className="py-2 pr-2 font-bold">深夜</th>
                  <th className="py-2 pr-2 font-bold">備考</th>
                  <th className="py-2 font-bold"></th>
                </tr>
              </thead>
              <tbody>
                {ledger.rows.map((r) => {
                  const a = r.attendance;
                  return (
                    <tr key={r.date} className={`border-b border-gray-100 ${r.isLegalHoliday ? "bg-red-50/60" : ""} ${r.open ? "bg-orange-50" : ""}`}>
                      <td className="py-1.5 pr-2 whitespace-nowrap text-gray-800">{Number(r.date.slice(8))}日({r.weekday})</td>
                      <td className="py-1.5 pr-2 text-gray-600">{r.siteName}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap font-bold text-gray-900">{a?.clockIn ? formatTime(a.clockIn) : ""}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap font-bold text-gray-900">{a?.clockOut ? formatTime(a.clockOut) : r.open ? <span className="text-orange-700">未退勤</span> : ""}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap text-gray-700">{a ? m(a.breakMinutes) : ""}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap text-gray-700">{a ? m(a.workedMinutes) : ""}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap text-red-700">{a ? m(a.legalOvertimeMinutes) : ""}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap text-gray-700">{a ? m(a.nightMinutes) : ""}</td>
                      <td className="py-1.5 pr-2">
                        <span className="flex flex-wrap gap-1">
                          {a?.holidayWork && a.clockIn && <Badge tone="red">休日労働</Badge>}
                          {r.paidLeave && <Badge tone="blue">年休</Badge>}
                          {r.corrected && <Badge tone="orange">修正あり</Badge>}
                        </span>
                      </td>
                      <td className="py-1.5 text-right">
                        {r.date <= today && (
                          <button type="button" onClick={() => setEditing({ date: r.date, attendance: a, employeeId: ledger.employee.id })}
                            className="rounded-lg bg-gray-100 px-2 py-1 text-xs font-bold text-gray-700 active:bg-gray-200">
                            {a ? "修正" : "追加"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {editing && (
        <AttendanceEditModal
          date={editing.date}
          employeeName={empName(editing.employeeId)}
          attendance={editing.attendance}
          sites={sites}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}
