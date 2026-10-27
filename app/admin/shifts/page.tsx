"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useData } from "@/lib/db/DataContext";
import { useAuth } from "@/lib/auth/AuthContext";
import { Card, BackButton, PageTitle } from "@/components/ui/Common";
import {
  formatDateJp,
  formatDateTimeJp,
  todayYmd,
  nowIso,
  monthMatrix,
  addMonth,
  WEEK,
} from "@/lib/format";
import { genId } from "@/lib/db/store";
import { FEATURES } from "@/lib/featureFlags";
import {
  loadShiftDrafts,
  saveShiftDrafts,
  SHIFT_DRAFT_SLOTS,
  type DraftAssign,
  type ShiftDraftSlot,
} from "@/lib/db/shiftDraftStore";
import {
  JOB_TYPE_LABEL,
  LEAVE_TYPE_MARK,
  LEAVE_TYPE_LABEL,
  type Database,
  type LeaveType,
} from "@/lib/types";

// 休み希望の並び順・色(右パネル/カレンダーマーク共通)
const LEAVE_ORDER: Record<LeaveType, number> = {
  off_negotiable: 0,
  partial: 1,
  off: 2,
};
const LEAVE_BADGE: Record<LeaveType, string> = {
  off: "bg-red-100 text-red-700",
  off_negotiable: "bg-orange-100 text-orange-700",
  partial: "bg-blue-100 text-blue-700",
};

// 時間帯(HH:mm)が重なるか。境界が接するだけ(終了=開始)は重複としない
function timesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// 下書き割当の同一判定キー(誰が・いつ・どの現場・何時)
const dKey = (d: DraftAssign) =>
  `${d.date}|${d.siteId}|${d.startTime}|${d.endTime}|${d.employeeId}`;
// 枠(シフト)単位のキー(従業員を除いた、日×現場×時間)
const dSlot = (d: {
  date: string;
  siteId: string;
  startTime: string;
  endTime: string;
}) => `${d.date}|${d.siteId}|${d.startTime}|${d.endTime}`;

// 本番シフト(DB)を作業下書きの形に変換する
function committedToDraft(db: Database): DraftAssign[] {
  const shiftById = new Map(db.shifts.map((s) => [s.id, s]));
  return db.shiftAssignments.flatMap((sa) => {
    const s = shiftById.get(sa.shiftId);
    return s
      ? [
          {
            date: s.date,
            siteId: s.siteId,
            employeeId: sa.employeeId,
            startTime: s.startTime,
            endTime: s.endTime,
          },
        ]
      : [];
  });
}

export default function ShiftsPage() {
  const { db, insert, remove } = useData();
  const { currentUser } = useAuth();
  const today = todayYmd();

  const [ym, setYm] = useState(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  }));
  const [empId, setEmpId] = useState<string>("");
  const [empQuery, setEmpQuery] = useState("");
  const [siteId, setSiteId] = useState(db.sites[0]?.id ?? "");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("17:00");
  const [focusedDate, setFocusedDate] = useState<string>(today);
  const [warning, setWarning] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 作業下書き(本番シフトとは別。「更新」を押すまでDBには反映しない)
  const [draft, setDraft] = useState<DraftAssign[]>(() => committedToDraft(db));
  // 下書きの保存枠(最大3)
  const [slots, setSlots] = useState<(ShiftDraftSlot | null)[]>(() =>
    loadShiftDrafts()
  );
  const [showSlots, setShowSlots] = useState(false);

  // 本番シフトとの差分(未反映の追加/削除)
  const committed = useMemo(() => committedToDraft(db), [db]);
  const committedKeys = useMemo(
    () => new Set(committed.map(dKey)),
    [committed]
  );
  const draftKeys = useMemo(() => new Set(draft.map(dKey)), [draft]);
  const addedCount = draft.filter((d) => !committedKeys.has(dKey(d))).length;
  const removedCount = committed.filter((d) => !draftKeys.has(dKey(d))).length;
  const dirty = addedCount > 0 || removedCount > 0;

  if (!currentUser) return null;

  const employees = db.employees.filter((e) => e.role === "employee" && e.active);
  const selectedEmp = employees.find((e) => e.id === empId);
  const weeks = monthMatrix(ym.year, ym.month);

  const go = (delta: number) => {
    setYm((p) => addMonth(p.year, p.month, delta));
    setWarning(null);
  };

  // 選択中の従業員が、その日に現在の選択(現場+時刻)で配置済みか(下書き上)
  const assignedHere = (date: string): boolean =>
    draft.some(
      (d) =>
        d.date === date &&
        d.siteId === siteId &&
        d.startTime === startTime &&
        d.endTime === endTime &&
        d.employeeId === empId
    );

  // 選択中の従業員のその日の全配置(現場が違っても拾う・下書き上)
  const empDraftOnDate = (date: string) =>
    draft.filter((d) => d.employeeId === empId && d.date === date);

  // 現在の選択時間と重なる、選択中従業員の既存配置(別現場含む・現在の枠自体は除く)
  const conflictingOnDate = (date: string) =>
    empDraftOnDate(date).filter(
      (d) =>
        dSlot(d) !== dSlot({ date, siteId, startTime, endTime }) &&
        timesOverlap(startTime, endTime, d.startTime, d.endTime)
    );

  // その日の総配置人数(全現場・全従業員・下書き上)
  const totalAssignedOnDate = (date: string) =>
    draft.filter((d) => d.date === date).length;

  // 選択中従業員の休み希望(カレンダーマーク用)
  const empLeaveOnDate = (date: string): LeaveType | undefined =>
    db.leaveRequests.find((l) => l.employeeId === empId && l.date === date)?.type;

  // 下書きから1件外す
  const removeDraft = (d: DraftAssign) =>
    setDraft((prev) => prev.filter((x) => dKey(x) !== dKey(d)));

  // カレンダーのタップ: 従業員未選択なら日付フォーカスのみ(出勤者確認)、
  // 選択中なら配置トグル。時間帯がダブる場合は警告して配置しない。
  // ※ここでは下書きを編集するだけ。本番への反映は「更新」ボタン。
  const handleTapDay = (date: string) => {
    setFocusedDate(date);
    if (!empId || !siteId) {
      setWarning(null);
      return;
    }

    // 既に同じ現場・時刻で配置済み → 解除(トグル)
    if (assignedHere(date)) {
      removeDraft({ date, siteId, employeeId: empId, startTime, endTime });
      setWarning(null);
      return;
    }

    // ダブりチェック(別現場でも時間帯が重なればNG)
    const conflicts = conflictingOnDate(date);
    if (conflicts.length > 0) {
      const c = conflicts[0];
      const site = db.sites.find((s) => s.id === c.siteId);
      setWarning(
        `${selectedEmp?.name}さんは ${formatDateJp(date)} の ${c.startTime}〜${c.endTime}` +
          `（${site?.name ?? "別現場"}）と時間が重なります。配置できません。`
      );
      return;
    }

    // 下書きに追加
    setDraft((prev) => [
      ...prev,
      { date, siteId, employeeId: empId, startTime, endTime },
    ]);
    setWarning(null);
  };

  // 「更新」: 下書きを本番シフト(DB)へ反映する。差分のみ insert/remove。
  // 安全策: 過去日と「すでに打刻がある日」の割当は消さない(実績と食い違うため)。
  // 人がいない空枠(ボードの「＋現場」で作ったもの)も、この画面からは消さない。
  const commit = () => {
    if (!dirty) return;
    const shiftById = new Map(db.shifts.map((s) => [s.id, s]));
    const clockedKeys = new Set(
      db.attendances.filter((a) => a.clockIn).map((a) => `${a.employeeId}|${a.date}`)
    );
    const protectedDate = (date: string, employeeId: string) =>
      date < today || clockedKeys.has(`${employeeId}|${date}`);

    // 1) 下書きに無くなった割当を削除(保護対象を除く)
    const emptiedShiftIds = new Set<string>();
    for (const sa of db.shiftAssignments) {
      const s = shiftById.get(sa.shiftId);
      if (!s) {
        remove("shiftAssignments", sa.id, currentUser.id);
        continue;
      }
      if (protectedDate(s.date, sa.employeeId)) continue;
      const k = dKey({
        date: s.date,
        siteId: s.siteId,
        employeeId: sa.employeeId,
        startTime: s.startTime,
        endTime: s.endTime,
      });
      if (!draftKeys.has(k)) {
        remove("shiftAssignments", sa.id, currentUser.id);
        emptiedShiftIds.add(s.id);
      }
    }

    // 2) この更新で人がいなくなった枠だけ削除(もともと空の枠は残す)
    const desiredSlots = new Set(draft.map(dSlot));
    for (const sid of emptiedShiftIds) {
      const s = shiftById.get(sid);
      if (!s || desiredSlots.has(dSlot(s))) continue;
      const stillHasPeople = db.shiftAssignments.some(
        (sa) => sa.shiftId === sid && protectedDate(s.date, sa.employeeId)
      );
      if (!stillHasPeople) remove("shifts", s.id, currentUser.id);
    }

    // 3) 新たに追加された割当を反映(枠は無ければ作成し、同一更新内では再利用)
    const localShiftBySlot = new Map<string, string>();
    for (const s of db.shifts) {
      localShiftBySlot.set(dSlot(s), s.id);
    }
    for (const d of draft) {
      if (committedKeys.has(dKey(d))) continue;
      const sk = dSlot(d);
      let shiftId = localShiftBySlot.get(sk);
      if (!shiftId) {
        shiftId = genId("shift");
        insert(
          "shifts",
          {
            id: shiftId,
            siteId: d.siteId,
            date: d.date,
            startTime: d.startTime,
            endTime: d.endTime,
          },
          currentUser.id
        );
        localShiftBySlot.set(sk, shiftId);
      }
      insert(
        "shiftAssignments",
        {
          id: genId("sa"),
          shiftId,
          employeeId: d.employeeId,
          source: "manual",
          locked: false,
        },
        currentUser.id
      );
    }

    setWarning(null);
    setNotice(
      `本番シフトに反映しました（追加${addedCount}件 / 削除${removedCount}件）。従業員のシフト表に表示されます。`
    );
  };

  // 下書きを本番の状態に戻す(編集を破棄)
  const revertDraft = () => {
    const ok = window.confirm(
      `未反映の変更（追加${addedCount}件 / 削除${removedCount}件）を破棄して、本番シフトの状態に戻します。よろしいですか？`
    );
    if (!ok) return;
    setDraft(committedToDraft(db));
    setWarning(null);
    setNotice("編集を破棄して、本番シフトの状態に戻しました。");
  };

  // 下書き保存枠の操作
  const saveToSlot = (i: number) => {
    const next = [...slots];
    next[i] = { savedAt: nowIso(), items: draft };
    setSlots(next);
    saveShiftDrafts(next);
    setNotice(`下書き${i + 1} に保存しました（本番には未反映）。`);
  };
  const loadSlot = (i: number) => {
    const slot = slots[i];
    if (!slot) return;
    // 読み込むと現在の編集内容は破棄されるため確認する
    const ok = window.confirm(
      `現在編集中の内容は消えて、下書き${i + 1}（${slot.items.length}件）に置き換わります。よろしいですか？`
    );
    if (!ok) return;
    setDraft(slot.items);
    setNotice(
      `下書き${i + 1} を読み込みました。「更新」を押すまで本番シフトには反映されません。`
    );
  };
  const deleteSlot = (i: number) => {
    const next = [...slots];
    next[i] = null;
    setSlots(next);
    saveShiftDrafts(next);
  };

  // 右パネル: フォーカス日の休み希望(全従業員)
  const leaveForFocused = db.leaveRequests
    .filter((l) => l.date === focusedDate)
    .map((l) => ({ leave: l, emp: db.employees.find((e) => e.id === l.employeeId) }))
    .sort((a, b) => LEAVE_ORDER[a.leave.type] - LEAVE_ORDER[b.leave.type]);

  // 右パネル: フォーカス日の配置(下書き上)=その日の出勤予定者
  const assignmentsForFocused = draft
    .filter((d) => d.date === focusedDate)
    .map((d) => ({
      d,
      site: db.sites.find((s) => s.id === d.siteId),
      name: db.employees.find((e) => e.id === d.employeeId)?.name ?? "(不明)",
      pending: !committedKeys.has(dKey(d)),
    }));

  return (
    // 親(max-w-5xl)を抜けて画面いっぱいに広げる
    <div className="relative left-1/2 w-screen -translate-x-1/2 px-4 xl:px-8">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <BackButton href="/admin" />
        <div className="flex items-center justify-between">
          <PageTitle>シフト作成</PageTitle>
          {FEATURES.aiShiftGen && (
            <Link
              href="/admin/shifts/generate"
              className="rounded-xl bg-purple-600 px-4 py-2 font-bold text-white active:bg-purple-700"
            >
              AI生成
            </Link>
          )}
        </div>
        <p className="text-sm text-gray-500">
          ① 左で作業員を選ぶ → ② 現場と時間を選ぶ → ③ カレンダーの日を押すと
          <b>下書きに</b>追加されます（続けて押せます／同じ日をもう一度押すと解除）。
          編集中は<b>まだ従業員には見えません</b>。最後に「更新」を押すと本番シフトに反映されます。
          席を外すときは「下書き保存」で途中保存できます。
        </p>

        {/* 操作バー: 更新 / 下書き保存 / 差分表示 */}
        <Card
          guide="shifts-bar"
          className={`flex flex-wrap items-center justify-between gap-3 ${
            dirty ? "border-orange-300 bg-orange-50" : "border-green-200 bg-green-50"
          }`}
        >
          <div className="font-bold text-gray-800">
            {dirty ? (
              <span className="text-orange-700">
                未反映の変更があります（追加{addedCount}件 / 削除{removedCount}件）
              </span>
            ) : (
              <span className="text-green-700">本番シフトと一致しています</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSlots((v) => !v)}
              className="rounded-xl bg-white px-4 py-2 font-bold text-gray-700 shadow-sm active:bg-gray-100"
            >
              下書き保存{showSlots ? " ▲" : " ▼"}
            </button>
            {dirty && (
              <button
                type="button"
                onClick={revertDraft}
                className="rounded-xl bg-white px-4 py-2 font-bold text-gray-500 shadow-sm active:bg-gray-100"
              >
                変更を破棄
              </button>
            )}
            <button
              type="button"
              onClick={commit}
              disabled={!dirty}
              className={`rounded-xl px-6 py-2 font-bold text-white shadow-sm ${
                dirty
                  ? "bg-green-600 active:bg-green-700"
                  : "bg-gray-300"
              }`}
            >
              更新する
            </button>
          </div>
        </Card>

        {/* 下書き保存枠(最大3) */}
        {showSlots && (
          <Card className="space-y-2">
            <div className="text-sm font-bold text-gray-600">
              下書きの保存（最大{SHIFT_DRAFT_SLOTS}枠・本番には反映されません）
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {slots.map((slot, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-gray-200 p-3"
                >
                  <div className="font-bold text-gray-800">下書き{i + 1}</div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    {slot
                      ? `${formatDateTimeJp(slot.savedAt)} 保存・${slot.items.length}件`
                      : "空き"}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => saveToSlot(i)}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-bold text-white active:bg-blue-700"
                    >
                      ここに保存
                    </button>
                    {slot && (
                      <>
                        <button
                          type="button"
                          onClick={() => loadSlot(i)}
                          className="rounded-lg bg-gray-200 px-3 py-1.5 text-sm font-bold text-gray-700 active:bg-gray-300"
                        >
                          読込
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSlot(i)}
                          className="rounded-lg px-2 py-1.5 text-sm font-bold text-gray-400"
                        >
                          削除
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {notice && (
          <div className="flex items-start justify-between gap-3 rounded-xl border-2 border-green-300 bg-green-50 p-3">
            <div className="font-bold text-green-800">{notice}</div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="shrink-0 text-sm font-bold text-green-700"
            >
              閉じる
            </button>
          </div>
        )}

        {warning && (
          <div className="flex items-start justify-between gap-3 rounded-xl border-2 border-red-300 bg-red-50 p-3">
            <div className="font-bold text-red-700">⚠ {warning}</div>
            <button
              type="button"
              onClick={() => setWarning(null)}
              className="shrink-0 text-sm font-bold text-red-600"
            >
              閉じる
            </button>
          </div>
        )}

        <div className="gap-4 lg:grid lg:grid-cols-[260px_minmax(0,1fr)_320px] lg:items-start xl:grid-cols-[300px_minmax(0,1fr)_360px]">
          {/* 左: 作業員 + 現場/時間 */}
          <aside className="space-y-3 lg:sticky lg:top-4" data-guide="shifts-employees">
            <Card>
              <div className="mb-2 text-sm font-bold text-gray-500">作業員をえらぶ</div>
              <input
                value={empQuery}
                onChange={(e) => setEmpQuery(e.target.value)}
                placeholder="名前で探す"
                aria-label="作業員を名前で探す"
                className="mb-2 w-full rounded-xl border border-gray-300 p-2 text-base"
              />
              <div className="grid max-h-[40vh] grid-cols-2 gap-2 overflow-y-auto lg:grid-cols-1">
                {employees
                  .filter((e) => !empQuery || e.name.includes(empQuery) || (e.nameKana ?? "").includes(empQuery))
                  .map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => {
                      setEmpId(e.id);
                      setWarning(null);
                    }}
                    className={`rounded-xl border-2 px-3 py-2 text-left font-bold ${
                      empId === e.id
                        ? "border-blue-600 bg-blue-50 text-blue-900"
                        : "border-gray-200 bg-white text-gray-800"
                    }`}
                  >
                    <div>{e.name}</div>
                    <div className="text-xs font-normal text-gray-500">
                      {e.jobTypes.map((j) => JOB_TYPE_LABEL[j]).join("・")}
                    </div>
                  </button>
                ))}
              </div>
            </Card>

            {selectedEmp && (
              <Card className="space-y-3 border-blue-200">
                <div className="text-sm font-bold text-gray-700">
                  {selectedEmp.name} さんを配置中
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-500">現場</label>
                  <select
                    value={siteId}
                    onChange={(e) => {
                      setSiteId(e.target.value);
                      setWarning(null);
                    }}
                    className="w-full rounded-xl border border-gray-300 p-2 text-base"
                  >
                    {db.sites
                      .filter((s) => s.active)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="mb-1 block text-sm text-gray-500">開始</label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => {
                        setStartTime(e.target.value);
                        setWarning(null);
                      }}
                      className="w-full rounded-lg border border-gray-300 p-2"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-gray-500">終了</label>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => {
                        setEndTime(e.target.value);
                        setWarning(null);
                      }}
                      className="w-full rounded-lg border border-gray-300 p-2"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEmpId("")}
                  className="text-sm font-bold text-gray-500"
                >
                  選択を解除
                </button>
              </Card>
            )}
          </aside>

          {/* 中央: カレンダー */}
          <div className="mt-4 lg:mt-0" data-guide="shifts-calendar">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => go(-1)}
                className="rounded-xl bg-gray-200 px-4 py-2 font-bold text-gray-800 active:bg-gray-300"
              >
                ← 前の月
              </button>
              <div className="text-xl font-bold text-gray-900">
                {ym.year}年 {ym.month}月
              </div>
              <button
                type="button"
                onClick={() => go(1)}
                className="rounded-xl bg-gray-200 px-4 py-2 font-bold text-gray-800 active:bg-gray-300"
              >
                次の月 →
              </button>
            </div>

            {!selectedEmp && (
              <div className="mb-2 rounded-xl bg-amber-50 p-2 text-center text-sm font-bold text-amber-700">
                作業員を選ぶと配置できます。選ぶ前でも日付を押すと、その日の出勤者を確認できます。
              </div>
            )}

            <Card>
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
                  const day = Number(date.split("-")[2]);
                  const isToday = date === today;
                  const isFocused = date === focusedDate;
                  const assigned = empId ? assignedHere(date) : false;
                  const others = empId
                    ? empDraftOnDate(date).filter(
                        (d) => dSlot(d) !== dSlot({ date, siteId, startTime, endTime })
                      )
                    : [];
                  const hasConflict = others.some((d) =>
                    timesOverlap(startTime, endTime, d.startTime, d.endTime)
                  );
                  const total = totalAssignedOnDate(date);
                  const leave = empId ? empLeaveOnDate(date) : undefined;
                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => handleTapDay(date)}
                      className={`relative min-h-20 rounded-lg border p-1 text-left align-top ${
                        isFocused ? "ring-2 ring-blue-500" : ""
                      } ${
                        assigned
                          ? "border-green-400 bg-green-50"
                          : "border-gray-200 bg-white"
                      } ${isToday ? "border-blue-400" : ""}`}
                    >
                      <div className="flex items-start justify-between">
                        <span className="text-sm font-bold text-gray-700">{day}</span>
                        {leave && (
                          <span
                            className={`rounded px-1 text-xs font-bold ${LEAVE_BADGE[leave]}`}
                          >
                            {LEAVE_TYPE_MARK[leave]}
                          </span>
                        )}
                      </div>
                      {assigned && (
                        <div className="mt-0.5 text-base font-bold leading-none text-green-700">
                          ◯
                        </div>
                      )}
                      {hasConflict ? (
                        <div className="text-[10px] font-bold leading-tight text-red-600">
                          ⚠ 時間重複
                        </div>
                      ) : (
                        others.length > 0 && (
                          <div className="text-[10px] leading-tight text-gray-500">
                            他{others.length}件
                          </div>
                        )
                      )}
                      {total > 0 && (
                        <div className="absolute bottom-0.5 right-1 text-[10px] text-gray-400">
                          計{total}人
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* 右: フォーカス日の休み希望 + 出勤予定者(下書き) */}
          <aside
            className="mt-4 space-y-3 lg:mt-0 lg:sticky lg:top-4"
            data-guide="shifts-side"
          >
            <Card className="border-amber-200 bg-amber-50">
              <div className="font-bold text-gray-900">
                {formatDateJp(focusedDate)} の休み希望
              </div>
              {leaveForFocused.length === 0 ? (
                <div className="mt-1 text-sm text-gray-500">休み希望はありません。</div>
              ) : (
                <div className="mt-2 space-y-2">
                  {leaveForFocused.map(({ leave, emp }) => (
                    <div key={leave.id} className="rounded-lg bg-white p-2 shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-gray-900">
                          {emp?.name ?? "(不明)"}
                        </span>
                        <span
                          className={`whitespace-nowrap rounded-md px-2 py-0.5 text-sm font-bold ${LEAVE_BADGE[leave.type]}`}
                        >
                          {LEAVE_TYPE_MARK[leave.type]} {LEAVE_TYPE_LABEL[leave.type]}
                        </span>
                      </div>
                      {leave.type === "partial" && leave.startTime && (
                        <div className="mt-0.5 text-xs text-gray-600">
                          希望時間帯 {leave.startTime}〜{leave.endTime}
                        </div>
                      )}
                      {leave.type !== "off" && (
                        <div className="mt-0.5 text-xs font-bold text-amber-700">
                          ⚠ 出勤可能ですが配置時に考慮してください
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 border-t border-amber-200 pt-2 text-xs text-gray-500">
                × 休みたい ／ ▲ できれば休みたい ／ △ 短時間
              </div>
            </Card>

            <Card>
              <div className="mb-1 text-sm font-bold text-gray-500">
                この日の出勤予定（{assignmentsForFocused.length}人・下書き）
              </div>
              {assignmentsForFocused.length === 0 ? (
                <div className="text-sm text-gray-400">まだ配置はありません。</div>
              ) : (
                <div className="space-y-1">
                  {assignmentsForFocused.map(({ d, site, name, pending }) => (
                    <div
                      key={dKey(d)}
                      className="flex items-center justify-between rounded-lg bg-gray-50 px-2 py-1.5"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-bold text-gray-900">
                          {name}
                          {pending && (
                            <span className="ml-1 rounded bg-orange-100 px-1 text-[10px] font-bold text-orange-700">
                              未反映
                            </span>
                          )}
                        </div>
                        <div className="truncate text-xs text-gray-500">
                          {site?.name} {d.startTime}〜{d.endTime}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeDraft(d)}
                        className="ml-2 shrink-0 text-sm font-bold text-gray-500"
                      >
                        外す
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
