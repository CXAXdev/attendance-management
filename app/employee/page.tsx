"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useData } from "@/lib/db/DataContext";
import { useAuth } from "@/lib/auth/AuthContext";
import { BigButton, BigLink } from "@/components/ui/BigButton";
import { Card, Badge } from "@/components/ui/Common";
import { todayYmd, formatDateJp, formatTime, formatMinutes, nowIso, circledNumber } from "@/lib/format";
import { genId } from "@/lib/db/store";
import {
  shiftsForEmployeeOnDate,
  upcomingShiftsForEmployee,
  attendanceForEmployeeOnDate,
  openAttendanceForEmployee,
  recentHandovers,
  publishedNotices,
} from "@/lib/domain/queries";
import {
  computeAttendanceFields,
  startDiffLabel,
} from "@/lib/domain/attendance";
import {
  findAlcoholCheck,
  hasDetectedAlcoholOn,
} from "@/lib/domain/alcoholCheck";
import { AlcoholCheckModal } from "@/components/employee/AlcoholCheckModal";
import type { Attendance, Handover, AlcoholCheckRecord } from "@/lib/types";

export default function EmployeeHome() {
  const router = useRouter();
  const { db, insert, update, online } = useData();
  const { currentUser } = useAuth();
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [showAlcoholModal, setShowAlcoholModal] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [handoverText, setHandoverText] = useState("");

  if (!currentUser) return null;
  const today = todayYmd();

  const myShifts = shiftsForEmployeeOnDate(db, currentUser.id, today);
  // 進行中(未退勤)の勤怠を最優先。日付をまたいだ夜勤でも退勤できるようにする。
  const openAtt = openAttendanceForEmployee(db, currentUser.id);
  const todayAtt = attendanceForEmployeeOnDate(db, currentUser.id, today);
  const attendance = openAtt ?? todayAtt;
  const carriedOver = !!openAtt && openAtt.date !== today;
  // 本日のアルコールチェック(検出ありがあればそれを優先)。記録簿と同じテーブルを参照する。
  const alcoholCheck = findAlcoholCheck(db, currentUser.id, today);
  // 検出ありは DB で判定する(リロードしても出勤できないまま)
  const alcoholBlocked = hasDetectedAlcoholOn(db, currentUser.id, today);
  // ログイン後すぐに見える「今後3回分の出勤予定」
  const nextShifts = upcomingShiftsForEmployee(db, currentUser.id, today, 3);

  // 直近24時間の引き継ぎ + 重要通達(出勤時に目立たせる)
  const activeHandovers = recentHandovers(db);
  const importantNotices = publishedNotices(db).filter((n) => n.important);

  // 引き継ぎ投稿時の現場(打刻中の現場 → 今日のシフト現場 → 稼働中の現場)
  const composeSiteId =
    attendance?.siteId ??
    myShifts[0]?.site?.id ??
    db.sites.find((s) => s.active)?.id ??
    db.sites[0]?.id ??
    "";

  const submitHandover = () => {
    const body = handoverText.trim();
    if (!body) return;
    const ho: Handover = {
      id: genId("ho"),
      authorId: currentUser.id,
      siteId: composeSiteId,
      date: today,
      body,
      createdAt: nowIso(),
    };
    insert("handovers", ho, currentUser.id);
    setHandoverText("");
    setShowCompose(false);
  };

  // 引き継ぎを既読にする(既読から24時間で自動削除される)
  const markHandoverRead = (id: string) => {
    update("handovers", id, { readAt: nowIso() }, currentUser.id);
  };

  // 打刻状態
  const hasClockIn = !!attendance?.clockIn;
  // 退勤済み = 今日の勤怠が退勤済みで、進行中の勤務が無い
  const hasClockOut = !!todayAtt?.clockOut && !openAtt;
  const breaks = attendance?.breaks ?? [];
  // 最後の休憩が未終了(end=null)なら休憩中
  const onBreak = breaks.length > 0 && breaks[breaks.length - 1].end === null;

  // 出勤に使う現場。シフトがあればその現場(複数なら選択)、無ければ稼働中の現場から選ぶ(予定外勤務)
  const plannedSites = myShifts
    .map((s) => s.site)
    .filter((s): s is NonNullable<typeof s> => !!s && s.active);
  const unplanned = plannedSites.length === 0;
  const siteChoices = unplanned ? db.sites.filter((s) => s.active) : plannedSites;
  const effectiveSiteId =
    selectedSiteId ?? (siteChoices.length === 1 ? siteChoices[0].id : null);

  // 出勤打刻。アルコールチェック「異常なし」の直後に呼ばれる。
  const handleClockIn = () => {
    if (!effectiveSiteId) return;
    // 二重出勤の防止(進行中の勤務・今日の出勤済みレコードがあれば何もしない)
    if (openAtt || todayAtt?.clockIn) return;
    const sa = myShifts.find((s) => s.site?.id === effectiveSiteId);
    const clockIn = nowIso();
    const base = {
      employeeId: currentUser.id,
      date: today,
      clockIn,
      clockOut: null,
      breaks: [] as Attendance["breaks"],
    };
    const calc = computeAttendanceFields(db, base);
    const newAttendance: Attendance = {
      id: genId("att"),
      ...base,
      siteId: effectiveSiteId,
      shiftAssignmentId:
        db.shiftAssignments.find(
          (x) => x.shiftId === sa?.shift.id && x.employeeId === currentUser.id
        )?.id ?? null,
      ...calc,
      corrections: [],
      syncStatus: online ? "synced" : "pending",
    };
    insert("attendances", newAttendance, currentUser.id);
  };

  // アルコールチェックの記録。検出の有無にかかわらず必ず残す(記録簿の保存義務)。
  const handleAlcoholSubmit = (detected: boolean) => {
    const rec: AlcoholCheckRecord = {
      id: genId("alc"),
      employeeId: currentUser.id,
      siteId: effectiveSiteId,
      date: today,
      detected,
      checkedAt: nowIso(),
      confirmerId: currentUser.id,
      note: detected ? "検出あり。責任者へ連絡し、作業させないこと。" : undefined,
    };
    insert("alcoholChecks", rec, currentUser.id);
    setShowAlcoholModal(false);
    if (!detected) handleClockIn();
  };

  // 休憩などの変更後に計算項目を出し直す
  const recalcPatch = (patch: Partial<Attendance>): Partial<Attendance> => {
    if (!attendance) return patch;
    const merged = { ...attendance, ...patch };
    return {
      ...patch,
      ...computeAttendanceFields(db, merged),
      syncStatus: online ? "synced" : "pending",
    };
  };

  // 休憩開始: 新しい休憩区間を追加(複数回対応)
  const handleBreakStart = () => {
    if (!attendance) return;
    const next = [...attendance.breaks, { start: nowIso(), end: null }];
    update("attendances", attendance.id, recalcPatch({ breaks: next }), currentUser.id);
  };
  // 休憩終了: 最後の(未終了の)休憩を閉じる
  const handleBreakEnd = () => {
    if (!attendance) return;
    const last = attendance.breaks.length - 1;
    const next = attendance.breaks.map((b, i) =>
      i === last ? { ...b, end: nowIso() } : b
    );
    update("attendances", attendance.id, recalcPatch({ breaks: next }), currentUser.id);
  };

  return (
    <div className="space-y-5">
      {/* 引き継ぎ事項があるとき、左上に①②…を表示 */}
      {activeHandovers.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-sm font-bold text-orange-700">引き継ぎ</span>
          {activeHandovers.map(({ handover }, i) => (
            <span
              key={handover.id}
              className="text-2xl leading-none text-orange-600"
              title={handover.body}
            >
              {circledNumber(i + 1)}
            </span>
          ))}
        </div>
      )}

      {/* 日付 */}
      <div className="text-center">
        <div className="text-3xl font-bold text-gray-900">{formatDateJp(today)}</div>
      </div>

      {/* 日付をまたいだ勤務が続いている(夜勤など) */}
      {carriedOver && openAtt && (
        <Card className="border-blue-300 bg-blue-50 text-center">
          <div className="font-bold text-blue-900">
            {formatDateJp(openAtt.date)} {formatTime(openAtt.clockIn)} 出勤の勤務が続いています
          </div>
          <div className="text-sm text-blue-800">終わったら「退勤」を押してください。</div>
        </Card>
      )}

      {/* 引き継ぎ(直近24時間・いつでも書き込める) */}
      <Card className="border-orange-300 bg-orange-50" guide="emp-handover">
        <div className="mb-2 flex items-center justify-between">
          <Badge tone="orange">引き継ぎ（既読後24時間で消えます）</Badge>
          <button
            type="button"
            onClick={() => setShowCompose((v) => !v)}
            className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-bold text-white active:bg-orange-700"
          >
            {showCompose ? "閉じる" : "＋ 書き込む"}
          </button>
        </div>

        {showCompose && (
          <div className="mb-3">
            <textarea
              value={handoverText}
              onChange={(e) => setHandoverText(e.target.value)}
              rows={3}
              placeholder="例: 2階の資材が不足。明日朝に搬入予定。"
              className="w-full rounded-xl border border-gray-300 p-3 text-base"
            />
            <button
              type="button"
              onClick={submitHandover}
              disabled={!handoverText.trim()}
              className="mt-2 w-full rounded-xl bg-green-600 p-3 text-lg font-bold text-white active:bg-green-700 disabled:bg-gray-300"
            >
              送信する
            </button>
          </div>
        )}

        {activeHandovers.length === 0 ? (
          <div className="text-gray-500">引き継ぎはありません。</div>
        ) : (
          activeHandovers.map(({ handover, site, author }, i) => (
            <div
              key={handover.id}
              className="mb-2 border-b border-orange-200 pb-2 last:mb-0 last:border-0 last:pb-0"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm text-gray-600">
                  <span className="mr-1 text-base text-orange-600">
                    {circledNumber(i + 1)}
                  </span>
                  {site?.name} ／ {author?.name}
                </div>
                {handover.readAt ? (
                  <span className="shrink-0 rounded-full bg-gray-200 px-2.5 py-1 text-xs font-bold text-gray-600">
                    既読
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => markHandoverRead(handover.id)}
                    className="shrink-0 rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white active:bg-blue-700"
                  >
                    既読にする
                  </button>
                )}
              </div>
              <div className="text-lg text-gray-900">{handover.body}</div>
              {handover.readAt && (
                <div className="text-xs text-gray-400">
                  既読 · 24時間後に消えます
                </div>
              )}
            </div>
          ))
        )}
      </Card>

      {/* 社長からの重要通達(出勤後も常に表示) */}
      {importantNotices.length > 0 && (
        <Card className="border-red-300 bg-red-50">
          <div className="mb-2">
            <Badge tone="red">社長からのお知らせ</Badge>
          </div>
          {importantNotices.map((n) => (
            <div key={n.id} className="mb-2 last:mb-0">
              <div className="text-lg font-bold text-gray-900">{n.title}</div>
              <div className="text-gray-800">{n.body}</div>
            </div>
          ))}
        </Card>
      )}

      {/* お知らせ・引き継ぎ(社長からのお知らせの下) */}
      <BigLink href="/employee/notices" color="gray" size="md">
        お知らせ・引き継ぎ
      </BigLink>

      {/* 今日の現場 */}
      <Card guide="emp-site">
        <div className="mb-1 flex items-center gap-2 text-sm font-bold text-gray-500">
          今日の現場
          {unplanned && !hasClockIn && <Badge tone="orange">予定外</Badge>}
        </div>
        {hasClockIn ? (
          <div className="text-xl font-bold text-gray-900">
            {db.sites.find((s) => s.id === attendance?.siteId)?.name ?? "(不明)"}
          </div>
        ) : siteChoices.length === 0 ? (
          <div className="text-gray-500">稼働中の現場がありません</div>
        ) : siteChoices.length > 1 ? (
          <div className="space-y-2">
            <div className="text-gray-700">
              {unplanned
                ? "今日のシフトはありません。出勤する現場をえらんでください"
                : "現場をえらんでください"}
            </div>
            {siteChoices.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedSiteId(s.id)}
                className={`block w-full rounded-xl border-2 p-4 text-left text-lg font-bold ${
                  effectiveSiteId === s.id
                    ? "border-blue-600 bg-blue-50 text-blue-900"
                    : "border-gray-200 bg-white text-gray-800"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        ) : (
          <div className="text-xl font-bold text-gray-900">{siteChoices[0].name}</div>
        )}
      </Card>

      {/* 打刻状況 */}
      {hasClockIn && (
        <Card>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div>
              <div className="text-sm text-gray-500">出勤</div>
              <div className="text-2xl font-bold text-gray-900">
                {formatTime(attendance!.clockIn)}
              </div>
              {(() => {
                const lbl = startDiffLabel(attendance!.startDiffMinutes);
                return <Badge tone={lbl.tone}>{lbl.text}</Badge>;
              })()}
            </div>
            <div>
              <div className="text-sm text-gray-500">退勤</div>
              <div className="text-2xl font-bold text-gray-900">
                {formatTime(attendance!.clockOut)}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500">休憩（{breaks.length}回）</div>
              <div className="text-lg font-bold text-gray-700">
                {formatMinutes(attendance!.breakMinutes)}
                {onBreak && (
                  <span className="ml-1 text-sm font-bold text-orange-600">休憩中</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500">残業</div>
              <div className="text-lg font-bold text-gray-700">
                {Math.floor(attendance!.overtimeMinutes / 60)}時間
                {attendance!.overtimeMinutes % 60}分
              </div>
            </div>
          </div>

          {/* 休憩の内訳(複数回) */}
          {breaks.length > 0 && (
            <div className="mt-3 border-t border-gray-100 pt-2">
              <div className="mb-1 text-sm text-gray-500">休憩の記録</div>
              <div className="space-y-1">
                {breaks.map((b, i) => (
                  <div
                    key={`${b.start}-${i}`}
                    className="flex justify-between text-sm text-gray-700"
                  >
                    <span>{i + 1}回目</span>
                    <span>
                      {formatTime(b.start)} 〜{" "}
                      {b.end ? formatTime(b.end) : <span className="text-orange-600">休憩中</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* アルコールチェック(出勤前) */}
          <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2">
            <div className="text-sm text-gray-500">
              アルコールチェック
              {alcoholCheck && (
                <span className="ml-1 text-xs text-gray-400">
                  {formatTime(alcoholCheck.checkedAt)}
                </span>
              )}
            </div>
            {alcoholCheck ? (
              <Badge tone={alcoholCheck.detected ? "red" : "green"}>
                {alcoholCheck.detected ? "検出あり" : "異常なし"}
              </Badge>
            ) : (
              <Badge tone="gray">未実施</Badge>
            )}
          </div>
        </Card>
      )}

      {/* 4大ボタン */}
      {hasClockOut ? (
        <Card className="bg-gray-100 text-center" guide="emp-main">
          <div className="text-2xl font-bold text-gray-700">本日の勤務は終了しました</div>
          <div className="mt-1 text-gray-500">お疲れさまでした</div>
        </Card>
      ) : (
        <div className="space-y-4" data-guide="emp-main">
          {!hasClockIn ? (
            <>
              {/* 業務前チェックで検出あり: 出勤できない(記録は残っている) */}
              {alcoholBlocked && (
                <Card className="border-red-300 bg-red-50 text-center">
                  <div className="text-xl font-bold text-red-700">
                    アルコールを検出しました
                  </div>
                  <div className="mt-1 text-gray-700">
                    出勤できません。責任者に連絡してください。
                    <br />
                    （チェック結果は記録されています）
                  </div>
                </Card>
              )}
              {!alcoholBlocked && (
                <BigButton
                  color="green"
                  onClick={() => setShowAlcoholModal(true)}
                  disabled={!effectiveSiteId}
                >
                  出勤
                </BigButton>
              )}
            </>
          ) : (
            <>
              {!onBreak ? (
                <BigButton color="orange" onClick={handleBreakStart}>
                  {breaks.length === 0 ? "休憩開始" : "休憩開始（再）"}
                </BigButton>
              ) : (
                <BigButton color="orange" onClick={handleBreakEnd}>
                  休憩終了
                </BigButton>
              )}
              <BigButton
                color="red"
                onClick={() => router.push("/employee/clockout")}
                disabled={onBreak}
              >
                退勤
              </BigButton>
            </>
          )}
        </div>
      )}

      {/* サブメニュー */}
      <div className="grid grid-cols-2 gap-3 pt-2">
        <BigLink href="/employee/shift" color="gray" size="md">
          シフト確認
        </BigLink>
        {db.settings.showShiftPreference && (
          <BigLink href="/employee/leave" color="gray" size="md">
            シフト希望
          </BigLink>
        )}
      </div>

      {/* 次の出勤予定(3回分) — 一番下 */}
      <Card guide="emp-next">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-bold text-gray-500">次の出勤予定（3回）</div>
          <Link href="/employee/shift" className="text-sm font-bold text-blue-600">
            カレンダーで見る →
          </Link>
        </div>
        {nextShifts.length === 0 ? (
          <div className="text-gray-500">これからの予定はありません</div>
        ) : (
          <div className="space-y-2">
            {nextShifts.map(({ shift, site }) => (
              <div
                key={shift.id}
                className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2"
              >
                <div>
                  <div className="font-bold text-gray-900">
                    {formatDateJp(shift.date)}
                    {shift.date === today && (
                      <span className="ml-2 text-sm font-bold text-blue-600">今日</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600">{site?.name}</div>
                </div>
                <div className="text-gray-700">
                  {shift.startTime}〜{shift.endTime}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 出勤前のアルコールチェック ポップアップ */}
      {showAlcoholModal && (
        <AlcoholCheckModal
          onSubmit={handleAlcoholSubmit}
          onCancel={() => setShowAlcoholModal(false)}
        />
      )}
    </div>
  );
}
