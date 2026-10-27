"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useData } from "@/lib/db/DataContext";
import { useAuth } from "@/lib/auth/AuthContext";
import { PageTitle, Badge, AdminNavItem } from "@/components/ui/Common";
import { todayYmd, formatDateJp, formatDateShortJp } from "@/lib/format";
import { genId } from "@/lib/db/store";
import { FEATURES } from "@/lib/featureFlags";
import type { BoardDay, BoardPerson, BoardSite } from "@/lib/domain/scheduleBoard";
import {
  buildScheduleBoard,
  daysFrom,
  sitesNotOnDay,
  unassignedEmployees,
} from "@/lib/domain/scheduleBoard";
import type { Shift, ShiftAssignment, Site } from "@/lib/types";

/** ボードに表示する日数(本日を含む) */
const BOARD_DAYS = 5;

/** 現場を新規に作るときの既定の時間帯 */
const DEFAULT_START = "08:00";
const DEFAULT_END = "17:00";

export default function AdminDashboard() {
  const { db, insert, update, remove } = useData();
  const { currentUser } = useAuth();
  const today = todayYmd();

  // 人の移動(現場変更)と追加のポップアップ
  const [moving, setMoving] = useState<{
    person: BoardPerson;
    date: string;
    fromSiteId: string;
  } | null>(null);
  const [adding, setAdding] = useState<{
    date: string;
    siteId: string;
  } | null>(null);
  // アラートの詳細を表示している日付
  const [alertDate, setAlertDate] = useState<string | null>(null);
  // 人数が多いとき用: 現場ごとの人数だけを表示する(今日の列は常に名前を出す)
  const [compact, setCompact] = useState(false);
  // 現場の追加(日付)と、その中の新規現場名の入力
  const [addingSiteDate, setAddingSiteDate] = useState<string | null>(null);
  const [newSiteName, setNewSiteName] = useState("");
  // 現場の削除確認(人が入っているとき)
  const [removingSite, setRemovingSite] = useState<{
    date: string;
    site: BoardSite;
  } | null>(null);

  const dates = useMemo(() => daysFrom(today, BOARD_DAYS), [today]);
  const board = useMemo(() => buildScheduleBoard(db, dates), [db, dates]);
  // 表示中の詳細は最新のボードから引く(開いている間に打刻されても追随する)
  const alertDay = board.find((d) => d.date === alertDate) ?? null;

  if (!currentUser) return null;

  /**
   * 指定日・指定現場のシフトIDを返す。無ければ作る。
   * 時間帯はその日の他のシフトに合わせ、無ければ既定値(08:00〜17:00)。
   */
  const ensureShift = (siteId: string, date: string): string => {
    const existing = db.shifts.find(
      (s) => s.siteId === siteId && s.date === date
    );
    if (existing) return existing.id;
    const sameDay = db.shifts.find((s) => s.date === date);
    const shift: Shift = {
      id: genId("shift"),
      siteId,
      date,
      startTime: sameDay?.startTime ?? DEFAULT_START,
      endTime: sameDay?.endTime ?? DEFAULT_END,
    };
    insert("shifts", shift, currentUser.id);
    return shift.id;
  };

  /** 現場変更: 割当のシフトを移動先現場のものに付け替える */
  const moveTo = (toSiteId: string) => {
    if (!moving) return;
    const shiftId = ensureShift(toSiteId, moving.date);
    update(
      "shiftAssignments",
      moving.person.assignmentId,
      { shiftId, source: "manual" },
      currentUser.id
    );
    setMoving(null);
  };

  /** その日の予定から外す */
  const removeFromDay = () => {
    if (!moving) return;
    remove("shiftAssignments", moving.person.assignmentId, currentUser.id);
    setMoving(null);
  };

  /** 未割当の従業員をその日の現場に入れる */
  const addTo = (employeeId: string) => {
    if (!adding) return;
    const shiftId = ensureShift(adding.siteId, adding.date);
    const sa: ShiftAssignment = {
      id: genId("sa"),
      shiftId,
      employeeId,
      source: "manual",
      locked: false,
    };
    insert("shiftAssignments", sa, currentUser.id);
    setAdding(null);
  };

  /** その日に現場を追加する(空のシフト枠を作る。人はあとから＋で入れる) */
  const addSiteToDay = (siteId: string, date: string) => {
    ensureShift(siteId, date);
    setAddingSiteDate(null);
  };

  /** 現場マスターに無い現場を、名前だけで作ってその日に追加する */
  const createSiteForDay = (date: string) => {
    const name = newSiteName.trim();
    if (!name) return;
    const site: Site = {
      id: genId("site"),
      name,
      startOn: date,
      endOn: null,
      // 住所・担当者・単価は現場マスターであとから補う
      hourlyRate: 0,
      active: true,
    };
    insert("sites", site, currentUser.id);
    ensureShift(site.id, date);
    setNewSiteName("");
    setAddingSiteDate(null);
  };

  /**
   * その日の現場を外す。
   * 人が入っている場合は予定が白紙になるため、確認ポップアップを挟む。
   */
  const requestRemoveSite = (site: BoardSite, date: string) => {
    if (site.people.length === 0) {
      if (site.shiftId) remove("shifts", site.shiftId, currentUser.id);
      return;
    }
    setRemovingSite({ date, site });
  };

  /** 確認後: その現場の割当をすべて外し、シフト枠も消す */
  const confirmRemoveSite = () => {
    if (!removingSite) return;
    const { site } = removingSite;
    for (const p of site.people) {
      remove("shiftAssignments", p.assignmentId, currentUser.id);
    }
    if (site.shiftId) remove("shifts", site.shiftId, currentUser.id);
    setRemovingSite(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageTitle>出勤予定（{BOARD_DAYS}日間）</PageTitle>
        <button
          type="button"
          onClick={() => setCompact((v) => !v)}
          className="rounded-xl border-2 border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 active:bg-gray-50"
        >
          {compact ? "名前を表示" : "人数だけ表示"}
        </button>
      </div>

      {/* 左端が本日。5日分を横に並べる(画面が狭いときは横スクロール) */}
      <div className="-mx-4 overflow-x-auto px-4" data-guide="admin-board">
        <div className="grid min-w-[860px] grid-cols-5 items-start gap-2">
          {board.map((day) => (
            <DayCard
              key={day.date}
              day={day}
              compact={compact && !day.isToday}
              onOpenAlerts={() => setAlertDate(day.date)}
              onTapPerson={(person, siteId) =>
                setMoving({ person, date: day.date, fromSiteId: siteId })
              }
              onAdd={(siteId) => setAdding({ date: day.date, siteId })}
              onAddSite={() => setAddingSiteDate(day.date)}
              onRemoveSite={(site) => requestRemoveSite(site, day.date)}
            />
          ))}
        </div>
      </div>

      {/* 凡例(印の意味) */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
        <span>
          <span className="font-bold text-green-700">●</span> 出勤中
        </span>
        <span>
          <span className="font-bold text-orange-700">▲</span> 遅刻
        </span>
        <span>
          <span className="font-bold text-red-700">⚠</span> 未出勤
        </span>
        <span>
          <span className="font-bold text-gray-500">済</span> 退勤済み
        </span>
        <span>名前をタップすると現場を変更できます。カード下の「休み」を押すとその日の休みの人が見られます</span>
      </div>

      {/* 操作の手順(既定は折りたたみ。見出しをクリックで開く) */}
      <details className="rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
        <summary className="cursor-pointer font-bold text-gray-700">
          操作のしかた
        </summary>
        <ul className="mt-2 list-inside list-disc space-y-0.5">
          <li>
            <span className="font-bold">人を追加</span>
            ：現場名の右の「＋」を押して、その日に空いている人を選びます
          </li>
          <li>
            <span className="font-bold">現場を外す</span>
            ：出勤予定の人がいる場合は確認のポップアップが出ます。「予定を白紙にする」を押すと、その現場に入っていた人の予定がすべて外れます（人は未割当に戻るので、別の現場に入れ直せます）。人がいない現場はそのまま外れます
          </li>
          <li>
            <span className="font-bold">現場を追加</span>
            ：カード下の「＋ 現場」から、既存の現場を選ぶか新しい現場を作れます
          </li>
          <li>
            <span className="font-bold">現場を変更</span>
            ：名前をタップして移動先の現場を選びます。ここから「この日の予定から外す」こともできます
          </li>
        </ul>
        <div className="mt-1 text-gray-500">
          ※ すでに出勤打刻した人は変更・削除できません（実績と食い違うため）。
          現場そのものを廃止する場合は「現場マスター」で操作してください。
        </div>
      </details>

      {/* メニュー: よく使う「シフト管理」「通達配信」を大きく、他は小さく */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-gray-700">メニュー</h2>
        <div className="grid gap-3 sm:grid-cols-2" data-guide="admin-menu-main">
          <AdminNavItem href="/admin/shifts" title="シフト管理" desc="作成・更新・下書き保存・要件チェック" />
          <AdminNavItem href="/admin/notices" title="通達配信" desc="社長からのお知らせ作成" />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-guide="admin-menu-small">
          {FEATURES.aiShiftGen && (
            <SmallNav href="/admin/shifts/generate" title="AIシフト生成" />
          )}
          <SmallNav href="/admin/working" title="今どこにいる" />
          <SmallNav href="/admin/attendance" title="出勤簿・打刻修正" />
          <SmallNav href="/admin/attendance-sheet" title="日次出勤表" />
          <SmallNav href="/admin/alcohol-checks" title="アルコール記録簿" />
          <SmallNav href="/admin/paid-leave" title="年休管理簿" />
          <SmallNav href="/admin/employees" title="従業員マスター" />
          <SmallNav href="/admin/sites" title="現場マスター" />
          {FEATURES.payroll && <SmallNav href="/admin/payroll" title="給与計算" />}
          {FEATURES.compliance && (
            <SmallNav href="/admin/compliance" title="労務チェック" />
          )}
          <SmallNav href="/admin/reports" title="レポート" />
          <SmallNav href="/admin/audit" title="監査ログ" />
          <SmallNav href="/admin/settings" title="設定" />
          <SmallNav href="/guide/index.html" title="📖 はじめてガイド" />
        </div>
      </section>

      {/* アラートの詳細(バッジのクリックで開く) */}
      {alertDay && (
        <Modal
          title="出勤アラート"
          subtitle={formatDateJp(alertDay.date)}
          onCancel={() => setAlertDate(null)}
        >
          <div className="space-y-2">
            {alertDay.alerts.map((a, i) => (
              <div
                key={`${a.employeeName}-${i}`}
                className="rounded-xl border border-gray-200 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-lg font-bold text-gray-900">
                    {a.employeeName}
                  </span>
                  <Badge tone={a.kind === "absent" ? "red" : "orange"}>
                    {a.kind === "absent" ? "未出勤" : "遅刻"}
                  </Badge>
                </div>
                <div className="text-sm text-gray-600">{a.siteName}</div>
                <div className="text-gray-700">{a.detail}</div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* 現場変更のポップアップ */}
      {moving && (
        <Modal
          title={`${moving.person.name} さんの現場を変更`}
          subtitle={formatDateJp(moving.date)}
          onCancel={() => setMoving(null)}
        >
          <div className="space-y-2">
            {db.sites
              .filter((s) => s.active)
              .map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => moveTo(s.id)}
                  disabled={s.id === moving.fromSiteId}
                  className="block w-full rounded-xl border-2 border-gray-200 p-4 text-left text-lg font-bold text-gray-800 active:bg-gray-50 disabled:border-blue-200 disabled:bg-blue-50 disabled:text-blue-400"
                >
                  {s.name}
                  {s.id === moving.fromSiteId && (
                    <span className="ml-2 text-sm font-normal">現在の現場</span>
                  )}
                </button>
              ))}
          </div>
          <button
            type="button"
            onClick={removeFromDay}
            className="w-full rounded-xl bg-red-50 p-3 text-lg font-bold text-red-700 active:bg-red-100"
          >
            この日の予定から外す
          </button>
        </Modal>
      )}

      {/* 人の追加のポップアップ */}
      {adding && (
        <Modal
          title="追加する人をえらぶ"
          subtitle={`${formatDateJp(adding.date)} ／ ${
            db.sites.find((s) => s.id === adding.siteId)?.name ?? ""
          }`}
          onCancel={() => setAdding(null)}
        >
          <div className="space-y-2">
            {unassignedEmployees(db, adding.date).length === 0 ? (
              <div className="py-6 text-center text-gray-500">
                この日に空いている人はいません。
              </div>
            ) : (
              unassignedEmployees(db, adding.date).map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => addTo(e.id)}
                  className="block w-full rounded-xl border-2 border-gray-200 p-4 text-left text-lg font-bold text-gray-800 active:bg-gray-50"
                >
                  {e.name}
                </button>
              ))
            )}
          </div>
        </Modal>
      )}

      {/* 現場の削除確認(予定が白紙になる旨を明示する) */}
      {removingSite && (
        <Modal
          title={`${removingSite.site.siteName} をこの日から外す`}
          subtitle={formatDateJp(removingSite.date)}
          onCancel={() => setRemovingSite(null)}
        >
          <div className="rounded-xl bg-red-50 p-4">
            <div className="font-bold text-red-800">
              この現場に入っている {removingSite.site.people.length}人 の
              出勤予定が白紙になります。
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {removingSite.site.people.map((p) => (
                <span
                  key={p.assignmentId}
                  className="rounded-lg bg-white px-2 py-1 text-sm font-bold text-gray-800"
                >
                  {p.name}
                  {p.clockedIn && (
                    <span className="ml-1 text-xs text-red-600">打刻済み</span>
                  )}
                </span>
              ))}
            </div>
            <div className="mt-2 text-sm text-red-700">
              外した人は未割当に戻ります。別の現場に入れ直せます。
            </div>
          </div>

          {removingSite.site.people.some((p) => p.clockedIn) ? (
            <div className="rounded-xl bg-gray-100 p-3 text-center font-bold text-gray-600">
              打刻済みの人がいるため削除できません。
              <br />
              先に打刻していない人だけを移動してください。
            </div>
          ) : (
            <button
              type="button"
              onClick={confirmRemoveSite}
              className="w-full rounded-2xl bg-red-600 p-4 text-xl font-bold text-white active:bg-red-700"
            >
              予定を白紙にする
            </button>
          )}
        </Modal>
      )}

      {/* 現場の追加のポップアップ(既存から選ぶ / 新しく作る) */}
      {addingSiteDate && (
        <Modal
          title="現場を追加"
          subtitle={formatDateJp(addingSiteDate)}
          onCancel={() => {
            setAddingSiteDate(null);
            setNewSiteName("");
          }}
        >
          <div className="space-y-2">
            {sitesNotOnDay(db, addingSiteDate).length === 0 ? (
              <div className="text-center text-gray-500">
                この日はすべての現場が入っています。
              </div>
            ) : (
              sitesNotOnDay(db, addingSiteDate).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => addSiteToDay(s.id, addingSiteDate)}
                  className="block w-full rounded-xl border-2 border-gray-200 p-4 text-left text-lg font-bold text-gray-800 active:bg-gray-50"
                >
                  {s.name}
                </button>
              ))
            )}
          </div>

          {/* 現場マスターに無い現場を、名前だけで作る */}
          <div className="border-t border-gray-100 pt-3">
            <label
              htmlFor="new-site-name"
              className="mb-1 block text-sm font-bold text-gray-500"
            >
              新しい現場を作る
            </label>
            <div className="flex gap-2">
              <input
                id="new-site-name"
                value={newSiteName}
                onChange={(e) => setNewSiteName(e.target.value)}
                placeholder="現場名"
                className="min-w-0 flex-1 rounded-xl border-2 border-gray-200 p-3 text-base text-gray-900"
              />
              <button
                type="button"
                onClick={() => createSiteForDay(addingSiteDate)}
                disabled={!newSiteName.trim()}
                className="shrink-0 rounded-xl bg-green-600 px-4 py-3 font-bold text-white active:bg-green-700 disabled:bg-gray-300"
              >
                作成
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              住所・担当者・単価は「現場マスター」であとから登録できます。
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** 1日分のカード(横並び1列ぶん。狭いので情報を絞る) */
function DayCard({
  day,
  compact,
  onOpenAlerts,
  onTapPerson,
  onAdd,
  onAddSite,
  onRemoveSite,
}: {
  day: BoardDay;
  compact: boolean;
  onOpenAlerts: () => void;
  onTapPerson: (person: BoardPerson, siteId: string) => void;
  onAdd: (siteId: string) => void;
  onAddSite: () => void;
  onRemoveSite: (site: BoardSite) => void;
}) {
  const absent = day.alerts.filter((a) => a.kind === "absent").length;
  const late = day.alerts.filter((a) => a.kind === "late").length;

  return (
    <div
      className={`rounded-xl border bg-white p-2 shadow-sm ${
        day.isToday ? "border-blue-400 ring-1 ring-blue-200" : "border-gray-200"
      }`}
    >
      {/* 見出し: 日付・人数 */}
      <div className="flex items-baseline justify-between gap-1 border-b border-gray-100 pb-1">
        <span
          className={`text-sm font-bold ${
            day.isToday ? "text-blue-700" : "text-gray-900"
          }`}
        >
          {formatDateShortJp(day.date)}
        </span>
        <span className="shrink-0 text-xs text-gray-500">{day.total}人</span>
      </div>

      {/* アラートバッジ(クリックで詳細) */}
      {day.alerts.length > 0 && (
        <button
          type="button"
          onClick={onOpenAlerts}
          title="クリックで詳細"
          className="mt-1.5 flex w-full flex-wrap gap-1"
        >
          {absent > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">
              未出勤 {absent}
            </span>
          )}
          {late > 0 && (
            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-800">
              遅刻 {late}
            </span>
          )}
        </button>
      )}

      {/* 現場ごとの予定 */}
      {day.sites.length === 0 ? (
        <div className="py-2 text-center text-xs text-gray-400">予定なし</div>
      ) : (
        day.sites.map((site) => (
          <SiteBlock
            key={`${site.siteId}-${site.startTime}`}
            site={site}
            compact={compact}
            onTapPerson={(p) => onTapPerson(p, site.siteId)}
            onAdd={() => onAdd(site.siteId)}
            onRemove={() => onRemoveSite(site)}
          />
        ))
      )}

      {/* その日に現場を追加する */}
      <button
        type="button"
        onClick={onAddSite}
        className="mt-2 w-full rounded-lg border border-dashed border-gray-300 py-1 text-xs font-bold text-gray-500 active:bg-gray-50"
      >
        ＋ 現場
      </button>

      {/* 休みの人(折りたたみ。押すと名前と理由が出る) */}
      <details className="mt-2 rounded-lg bg-gray-50">
        <summary className="flex cursor-pointer list-none items-center justify-between px-2 py-1.5 text-xs font-bold text-gray-600 [&::-webkit-details-marker]:hidden">
          <span>
            休み <span className="text-gray-900">{day.offDuty.length}人</span>
          </span>
          <span className="text-gray-400" aria-hidden>
            ▾
          </span>
        </summary>
        {day.offDuty.length === 0 ? (
          <div className="px-2 pb-2 text-xs text-gray-400">全員出勤予定です</div>
        ) : (
          <ul className="space-y-1 px-2 pb-2">
            {day.offDuty.map((p) => (
              <li
                key={p.employeeId}
                className="flex items-center justify-between gap-1 rounded-md bg-white px-1.5 py-1 text-xs text-gray-700"
              >
                <span className="min-w-0 truncate">{p.name}</span>
                {p.reason && (
                  <span
                    className={`shrink-0 rounded px-1 text-[10px] font-bold ${
                      p.reason === "年休"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-orange-100 text-orange-800"
                    }`}
                  >
                    {p.reason}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}

/** カード内の現場ブロック */
function SiteBlock({
  site,
  compact,
  onTapPerson,
  onAdd,
  onRemove,
}: {
  site: BoardSite;
  compact: boolean;
  onTapPerson: (person: BoardPerson) => void;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="mt-2">
      <div className="flex items-center gap-1">
        <div
          className="min-w-0 flex-1 truncate text-xs font-bold text-gray-600"
          title={`${site.siteName}（${site.startTime}〜${site.endTime}）`}
        >
          {site.siteName}
        </div>
        {/* この日からこの現場を外す(人が入っていれば確認ポップアップ) */}
        <button
          type="button"
          onClick={onRemove}
          title="この日からこの現場を外す"
          className="shrink-0 rounded-lg bg-gray-100 px-1.5 py-0.5 text-xs font-bold text-gray-500 active:bg-gray-200"
        >
          ✕
        </button>
        <AddButton onClick={onAdd} />
      </div>

      {site.people.length === 0 ? (
        <div className="mt-1 rounded-lg border border-dashed border-gray-200 py-1 text-center text-xs text-gray-400">
          未定
        </div>
      ) : compact ? (
        <div
          className="mt-1 rounded-lg bg-gray-50 px-2 py-1 text-xs text-gray-700"
          title={site.people.map((p) => p.name).join("、")}
        >
          {site.people.length}人
        </div>
      ) : (
        <div className="mt-1 space-y-1">
          {site.people.map((p) => (
            <PersonChip key={p.assignmentId} person={p} onTap={onTapPerson} />
          ))}
        </div>
      )}
    </div>
  );
}

/** 従業員1人分のチップ。タップで現場変更、打刻済みは変更不可。 */
function PersonChip({
  person,
  onTap,
}: {
  person: BoardPerson;
  onTap: (person: BoardPerson) => void;
}) {
  const tones: Record<BoardPerson["status"], string> = {
    planned: "border-gray-200 bg-white text-gray-800",
    working: "border-green-500 bg-green-50 text-green-900",
    done: "border-gray-200 bg-gray-100 text-gray-500",
    late: "border-orange-400 bg-orange-50 text-orange-900",
    absent: "border-red-400 bg-red-50 text-red-900",
  };
  // 狭いカードに収めるため、状態は短い印で表す
  const marks: Record<BoardPerson["status"], string> = {
    planned: "",
    working: "●",
    done: "済",
    late: "▲",
    absent: "⚠",
  };
  const labels: Record<BoardPerson["status"], string> = {
    planned: "予定",
    working: "出勤中",
    done: "退勤済み",
    late: person.detail ?? "遅刻",
    absent: "未出勤",
  };

  return (
    <button
      type="button"
      onClick={() => onTap(person)}
      disabled={person.clockedIn}
      title={`${person.name}（${labels[person.status]}）${
        person.clockedIn ? " ・打刻済みのため変更できません" : ""
      }`}
      className={`flex w-full items-center gap-1 rounded-lg border px-1.5 py-1 text-xs font-bold disabled:cursor-not-allowed ${tones[person.status]}`}
    >
      <span className="min-w-0 flex-1 truncate text-left">{person.name}</span>
      {marks[person.status] && (
        <span className="shrink-0">{marks[person.status]}</span>
      )}
    </button>
  );
}

/** 現場ブロックの「＋」(人を追加) */
function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="この現場に人を追加"
      className="shrink-0 rounded-lg bg-blue-600 px-1.5 py-0.5 text-xs font-bold text-white active:bg-blue-700"
    >
      ＋
    </button>
  );
}

/** 画面下から出る簡易ポップアップ */
function Modal({
  title,
  subtitle,
  children,
  onCancel,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          {subtitle && <div className="text-gray-500">{subtitle}</div>}
        </div>
        {children}
        <button
          type="button"
          onClick={onCancel}
          className="w-full rounded-2xl bg-gray-200 p-3 text-lg font-bold text-gray-700 active:bg-gray-300"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}

/** ダッシュボードの小さめナビ(主要2機能以外) */
function SmallNav({ href, title }: { href: string; title: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-center text-sm font-bold text-gray-700 shadow-sm active:bg-gray-50"
    >
      {title}
    </Link>
  );
}
