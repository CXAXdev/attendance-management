"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@/lib/db/DataContext";
import { useAuth } from "@/lib/auth/AuthContext";
import { BigButton } from "@/components/ui/BigButton";
import { Card, BackButton, PageTitle } from "@/components/ui/Common";
import { todayYmd, nowIso, formatMinutes, formatDateJp, formatTime } from "@/lib/format";
import { genId } from "@/lib/db/store";
import {
  attendanceForEmployeeOnDate,
  openAttendanceForEmployee,
} from "@/lib/domain/queries";
import { computeAttendanceFields } from "@/lib/domain/attendance";
import type { Attendance, Handover } from "@/lib/types";

export default function ClockOutPage() {
  const router = useRouter();
  const { db, update, insert, online } = useData();
  const { currentUser } = useAuth();
  const [handoverText, setHandoverText] = useState("");
  const [confirming, setConfirming] = useState(false);

  if (!currentUser) return null;
  const today = todayYmd();
  // 進行中(未退勤)の勤怠。日付をまたいでいても退勤できる
  const attendance = openAttendanceForEmployee(db, currentUser.id);
  const todayAtt = attendanceForEmployeeOnDate(db, currentUser.id, today);

  if (!attendance) {
    return (
      <div className="space-y-4">
        <BackButton href="/employee" />
        <Card>{todayAtt?.clockOut ? "すでに退勤済みです。" : "まだ出勤していません。"}</Card>
      </div>
    );
  }

  // 休憩中なら退勤時に自動で休憩を終える(開いた休憩を残さない)
  const closeOpenBreak = (clockOut: string) =>
    attendance.breaks.map((b) => (b.end === null ? { ...b, end: clockOut } : b));
  const onBreak = attendance.breaks.some((b) => b.end === null);

  const doClockOut = () => {
    const clockOut = nowIso();
    const breaks = closeOpenBreak(clockOut);
    const patch: Partial<Attendance> = {
      clockOut,
      breaks,
      ...computeAttendanceFields(db, { ...attendance, clockOut, breaks }),
      syncStatus: online ? "synced" : "pending",
    };
    update("attendances", attendance.id, patch, currentUser.id);

    // 引き継ぎ事項(任意)
    if (handoverText.trim()) {
      const ho: Handover = {
        id: genId("ho"),
        authorId: currentUser.id,
        siteId: attendance.siteId,
        date: today,
        body: handoverText.trim(),
        createdAt: nowIso(),
      };
      insert("handovers", ho, currentUser.id);
    }
    router.replace("/employee");
  };

  const previewOut = nowIso();
  const calc = computeAttendanceFields(db, {
    ...attendance,
    clockOut: previewOut,
    breaks: closeOpenBreak(previewOut),
  });

  return (
    <div className="space-y-5">
      <BackButton href="/employee" />
      <PageTitle>退勤の前に</PageTitle>

      {attendance.date !== today && (
        <Card className="border-blue-300 bg-blue-50 text-sm text-blue-900">
          {formatDateJp(attendance.date)} {formatTime(attendance.clockIn)} に出勤した勤務の退勤です。
        </Card>
      )}
      {onBreak && (
        <Card className="border-orange-300 bg-orange-50 text-sm text-orange-900">
          休憩中です。退勤すると休憩も同時に終了として記録します。
        </Card>
      )}

      <Card guide="clockout-summary">
        <div className="text-sm text-gray-500">
          {attendance.date === today ? "今日" : formatDateJp(attendance.date)}の実労働(見込み)
        </div>
        <div className="text-2xl font-bold text-gray-900">
          {formatMinutes(calc.workedMinutes)}
          {calc.overtimeMinutes > 0 && (
            <span className="ml-2 text-lg text-red-600">
              (残業 {formatMinutes(calc.overtimeMinutes)})
            </span>
          )}
        </div>
      </Card>

      <Card guide="clockout-handover">
        <div className="mb-2 text-lg font-bold text-gray-900">
          引き継ぎ事項(なければ空のままでOK)
        </div>
        <textarea
          value={handoverText}
          onChange={(e) => setHandoverText(e.target.value)}
          rows={5}
          placeholder="例: 2階の資材が不足。明日朝に搬入予定。"
          className="w-full rounded-xl border border-gray-300 p-4 text-lg"
        />
        <p className="mt-1 text-sm text-gray-500">
          入力した内容は管理者と翌日の作業者が確認できます。
        </p>
      </Card>

      {!confirming ? (
        <div data-guide="clockout-button">
          <BigButton color="red" onClick={() => setConfirming(true)}>
            退勤する
          </BigButton>
        </div>
      ) : (
        <Card className="border-red-300 bg-red-50" guide="clockout-button">
          <div className="mb-3 text-center text-xl font-bold text-gray-900">
            退勤してよろしいですか？
          </div>
          <div className="grid grid-cols-2 gap-3">
            <BigButton color="gray" size="md" onClick={() => setConfirming(false)}>
              もどる
            </BigButton>
            <BigButton color="red" size="md" onClick={doClockOut}>
              はい、退勤
            </BigButton>
          </div>
        </Card>
      )}
    </div>
  );
}
