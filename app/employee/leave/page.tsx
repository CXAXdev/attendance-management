"use client";

import { useMemo, useState } from "react";
import { useData } from "@/lib/db/DataContext";
import { useAuth } from "@/lib/auth/AuthContext";
import { BigButton } from "@/components/ui/BigButton";
import { Card, BackButton, PageTitle, Badge } from "@/components/ui/Common";
import {
  formatDateJp,
  formatDateTimeJp,
  nowIso,
  upcomingMonths,
  monthMatrix,
  WEEK,
  type MonthOption,
} from "@/lib/format";
import { genId } from "@/lib/db/store";
import {
  LEAVE_TYPE_MARK,
  LEAVE_TYPE_LABEL,
  type Database,
  type LeaveRequest,
  type LeaveType,
  type LeaveSubmission,
} from "@/lib/types";

// 下書きの1日分
interface DraftEntry {
  type: LeaveType;
  startTime?: string;
  endTime?: string;
}

// ブラシ(これを選んでからカレンダーを連続タップで適用)
type Brush =
  | { kind: "clear" }
  | { kind: "off" }
  | { kind: "off_negotiable" }
  | { kind: "partial" };

const MARK_STYLE: Record<LeaveType, string> = {
  off: "bg-red-100 text-red-700 border-red-300",
  off_negotiable: "bg-orange-100 text-orange-700 border-orange-300",
  partial: "bg-blue-100 text-blue-700 border-blue-300",
};

/** DB から指定従業員・対象月の希望を date->DraftEntry の Map に */
function loadDraft(
  db: Database,
  employeeId: string,
  target: MonthOption
): Map<string, DraftEntry> {
  const prefix = `${target.year}-${String(target.month).padStart(2, "0")}`;
  const map = new Map<string, DraftEntry>();
  for (const l of db.leaveRequests) {
    if (l.employeeId === employeeId && l.date.startsWith(prefix)) {
      map.set(l.date, {
        type: l.type,
        startTime: l.startTime,
        endTime: l.endTime,
      });
    }
  }
  return map;
}

function entriesEqual(a: DraftEntry, b: DraftEntry): boolean {
  return (
    a.type === b.type &&
    a.startTime === b.startTime &&
    a.endTime === b.endTime
  );
}

export default function LeavePage() {
  const { db, insert, update, remove } = useData();
  const { currentUser } = useAuth();
  const employeeId = currentUser?.id ?? "";

  const months = useMemo(() => upcomingMonths(3), []);
  const [monthIdx, setMonthIdx] = useState(0);
  const [draft, setDraft] = useState<Map<string, DraftEntry>>(() =>
    loadDraft(db, employeeId, months[0])
  );
  const [brush, setBrush] = useState<Brush>({ kind: "off" });
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("15:00");

  if (!currentUser) return null;
  const target = months[monthIdx];
  const weeks = monthMatrix(target.year, target.month);

  // 月切替: 下書きをその月の保存済みデータで読み直す(イベント内なので effect 不要)
  const switchMonth = (i: number) => {
    setMonthIdx(i);
    setDraft(loadDraft(db, employeeId, months[i]));
  };

  // ブラシをカレンダーの日に適用(連続設定)
  const applyBrush = (date: string) => {
    setDraft((prev) => {
      const next = new Map(prev);
      if (brush.kind === "clear") {
        next.delete(date);
      } else if (brush.kind === "partial") {
        next.set(date, { type: "partial", startTime, endTime });
      } else {
        next.set(date, { type: brush.kind });
      }
      return next;
    });
  };

  // 提出状況
  const submission = db.leaveSubmissions.find(
    (s) =>
      s.employeeId === employeeId &&
      s.year === target.year &&
      s.month === target.month
  );
  const savedMap = loadDraft(db, employeeId, target);

  // 下書きが保存済みと違う(未提出の変更あり)か
  const isDirty = (() => {
    if (savedMap.size !== draft.size) return true;
    for (const [date, e] of draft) {
      const s = savedMap.get(date);
      if (!s || !entriesEqual(e, s)) return true;
    }
    return false;
  })();

  // 提出: 下書きを DB に反映し、提出記録を残す
  const submit = () => {
    const prefix = `${target.year}-${String(target.month).padStart(2, "0")}`;
    const existing = db.leaveRequests.filter(
      (l) => l.employeeId === employeeId && l.date.startsWith(prefix)
    );
    const existingByDate = new Map(existing.map((l) => [l.date, l]));

    // 追加・変更
    for (const [date, e] of draft) {
      const cur = existingByDate.get(date);
      if (!cur) {
        const lr: LeaveRequest = {
          id: genId("leave"),
          employeeId,
          date,
          type: e.type,
          startTime: e.startTime,
          endTime: e.endTime,
          createdAt: nowIso(),
        };
        insert("leaveRequests", lr, employeeId);
      } else {
        update(
          "leaveRequests",
          cur.id,
          {
            type: e.type,
            startTime: e.startTime,
            endTime: e.endTime,
          },
          employeeId
        );
      }
    }
    // 削除(下書きから消えた日)
    for (const l of existing) {
      if (!draft.has(l.date)) remove("leaveRequests", l.id, employeeId);
    }

    // 提出記録を upsert
    if (submission) {
      update("leaveSubmissions", submission.id, { submittedAt: nowIso() }, employeeId);
    } else {
      const sub: LeaveSubmission = {
        id: genId("sub"),
        employeeId,
        year: target.year,
        month: target.month,
        submittedAt: nowIso(),
      };
      insert("leaveSubmissions", sub, employeeId);
    }
  };

  // 提出済みの内容(確認用・日付順)
  const submittedList = [...savedMap.entries()].sort((a, b) =>
    a[0] < b[0] ? -1 : 1
  );

  const brushButtons: { brush: Brush; label: string; cls: string }[] = [
    { brush: { kind: "off" }, label: "× 休みたい", cls: "bg-red-600 text-white" },
    {
      brush: { kind: "off_negotiable" },
      label: "▲ できれば休みたい",
      cls: "bg-orange-500 text-white",
    },
    {
      brush: { kind: "partial" },
      label: "△ 短時間",
      cls: "bg-blue-600 text-white",
    },
    { brush: { kind: "clear" }, label: "消す(出勤できる)", cls: "bg-gray-500 text-white" },
  ];

  const sameBrush = (a: Brush, b: Brush) => a.kind === b.kind;

  const showTimeInputs = brush.kind === "partial";

  return (
    <div className="space-y-5">
      <BackButton href="/employee" />
      <PageTitle>{currentUser.name}さんの休み希望</PageTitle>

      {/* 月選択(向こう3ヶ月)＋提出期限 */}
      <div className="grid grid-cols-3 gap-2">
        {months.map((m, i) => (
          <button
            key={`${m.year}-${m.month}`}
            type="button"
            onClick={() => switchMonth(i)}
            className={`rounded-xl border-2 p-3 text-center ${
              i === monthIdx
                ? "border-blue-600 bg-blue-50"
                : "border-gray-200 bg-white"
            }`}
          >
            <div className="text-lg font-bold text-gray-900">{m.label}</div>
            <div className="mt-1 text-xs text-gray-500">
              提出期限
              <br />
              {formatDateJp(m.deadlineYmd)}
            </div>
            {m.expired && (
              <span className="mt-1 inline-block text-xs font-bold text-red-600">
                期限切れ
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 提出状況 */}
      <Card
        className={
          isDirty
            ? "border-orange-300 bg-orange-50"
            : submission
            ? "border-green-300 bg-green-50"
            : ""
        }
      >
        {submission ? (
          <div className="text-gray-800">
            <span className="font-bold">提出済み</span>：
            {formatDateTimeJp(submission.submittedAt)}
            {isDirty && (
              <span className="ml-2 font-bold text-orange-700">
              （未提出の変更があります）
              </span>
            )}
          </div>
        ) : (
          <div className="font-bold text-gray-700">
            まだ提出していません{isDirty && "（入力中）"}
          </div>
        )}
      </Card>

      {/* ブラシ選択(先に選んでカレンダーを連続タップ) */}
      <Card className="space-y-3" guide="leave-brush">
        <div className="text-sm font-bold text-gray-700">
          ① マークを選ぶ → ② カレンダーの日を押す（続けて押せます）
        </div>
        <div className="text-sm text-gray-500">
          休みの希望がない場合は、空白のままで大丈夫です。
        </div>
        <div className="grid grid-cols-2 gap-2">
          {brushButtons.map((b) => {
            const active = sameBrush(brush, b.brush);
            return (
              <button
                key={b.label}
                type="button"
                onClick={() => setBrush(b.brush)}
                className={`rounded-xl py-3 text-base font-bold ${b.cls} ${
                  active ? "ring-4 ring-blue-300" : "opacity-80"
                }`}
              >
                {b.label}
                {active && <span className="ml-1 text-xs">（選択中）</span>}
              </button>
            );
          })}
        </div>

        {/* 早退・遅刻の時間帯 */}
        {showTimeInputs && (
          <div className="rounded-xl bg-blue-50 p-3">
            <div className="mb-1 text-sm font-bold text-gray-700">
              希望時間帯（この後タップした日に適用されます）
            </div>
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="rounded-lg border border-gray-300 p-2 text-lg"
              />
              <span className="text-lg font-bold">〜</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="rounded-lg border border-gray-300 p-2 text-lg"
              />
            </div>
          </div>
        )}
      </Card>

      {/* カレンダー */}
      <Card>
        <div className="mb-2 text-center text-lg font-bold text-gray-900">
          {target.year}年 {target.month}月
        </div>
        <div className="grid grid-cols-7 gap-1">
          {WEEK.map((w, i) => (
            <div
              key={w}
              className={`py-1 text-center text-sm font-bold ${
                i === 0 ? "text-red-600" : i === 6 ? "text-blue-600" : "text-gray-500"
              }`}
            >
              {w}
            </div>
          ))}
          {weeks.flat().map((date, idx) => {
            if (!date) return <div key={`e-${idx}`} />;
            const e = draft.get(date);
            const day = Number(date.split("-")[2]);
            return (
              <button
                key={date}
                type="button"
                onClick={() => applyBrush(date)}
                className={`min-h-14 rounded-lg border p-0.5 text-center ${
                  e ? MARK_STYLE[e.type] : "border-gray-200 bg-white"
                }`}
              >
                <div className="text-sm font-bold">{day}</div>
                {e && (
                  <div className="text-base font-bold leading-none">
                    {LEAVE_TYPE_MARK[e.type]}
                  </div>
                )}
                {e?.type === "partial" && e.startTime && (
                  <div className="text-[9px] leading-tight text-gray-700">
                    {e.startTime}
                    <br />〜{e.endTime}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {/* 提出ボタン */}
      <div data-guide="leave-submit">
        <BigButton
          color="green"
          onClick={submit}
          disabled={!isDirty && !!submission}
        >
          {submission ? "この内容で再提出する" : "この内容で提出する"}
        </BigButton>
      </div>

      {/* 提出した内容の確認 */}
      <section className="space-y-2">
        <h2 className="text-lg font-bold text-gray-700">提出した内容</h2>
        {!submission ? (
          <Card>まだ提出していません。</Card>
        ) : submittedList.length === 0 ? (
          <Card>この月は休み希望なし（すべて出勤できる）で提出済みです。</Card>
        ) : (
          submittedList.map(([date, e]) => (
            <Card key={date} className="flex items-center justify-between py-3">
              <div className="font-bold text-gray-900">{formatDateJp(date)}</div>
              <div className="flex items-center gap-2">
                {e.type === "partial" && e.startTime && (
                  <span className="text-sm text-gray-600">
                    {e.startTime}〜{e.endTime}
                  </span>
                )}
                <Badge
                  tone={
                    e.type === "off"
                      ? "red"
                      : e.type === "off_negotiable"
                      ? "orange"
                      : "blue"
                  }
                >
                  {LEAVE_TYPE_MARK[e.type]} {LEAVE_TYPE_LABEL[e.type]}
                </Badge>
              </div>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
