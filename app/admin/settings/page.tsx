"use client";

import { useRef, useState } from "react";
import { useData } from "@/lib/db/DataContext";
import { useAuth } from "@/lib/auth/AuthContext";
import { useGuide } from "@/lib/guide/GuideContext";
import { Card, BackButton, PageTitle } from "@/components/ui/Common";
import { exportDb, storageUsage } from "@/lib/db/store";
import { WEEK } from "@/lib/format";
import type { AppSettings } from "@/lib/types";

/** 分 → 時間(表示・入力用) */
const hours = (min: number) => Math.round(min / 60);

export default function AdminSettingsPage() {
  const { db, updateSettings, reset, importBackup } = useData();
  const { currentUser } = useAuth();
  const { autoShow, setAutoShow, resetSeen } = useGuide();
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [confirmingImport, setConfirmingImport] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usage] = useState(() => storageUsage());
  const fileRef = useRef<HTMLInputElement>(null);

  if (!currentUser) return null;
  const { settings } = db;
  const actor = currentUser.id;
  const setNum = (key: keyof AppSettings, hoursValue: string) => {
    const n = Number(hoursValue);
    if (!Number.isFinite(n) || n < 0) return;
    updateSettings({ [key]: Math.round(n * 60) } as Partial<AppSettings>, actor);
  };

  const showGuidesAgain = () => {
    resetSeen();
    setMessage("案内を未読に戻しました。各画面を開くと最初から表示されます。");
  };

  const resetDemoData = () => {
    reset(actor);
    setConfirmingReset(false);
    setMessage("サンプルデータを初期状態に戻しました。今日の予定・過去の実績が作り直されています。");
  };

  const exportBackup = () => {
    const json = exportDb(db);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kintai-backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage("バックアップをダウンロードしました。");
  };

  const onPickFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setConfirmingImport(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  const doImport = () => {
    if (!confirmingImport) return;
    try {
      importBackup(confirmingImport, actor);
      setError(null);
      setMessage("バックアップから復元しました。");
    } catch (e) {
      setError(`復元できませんでした: ${e instanceof Error ? e.message : String(e)}`);
    }
    setConfirmingImport(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const inputCls = "w-24 rounded-lg border border-gray-300 p-2 text-right";
  const pct = Math.round(usage.ratio * 100);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="shrink-0"><BackButton href="/admin" /></div>
        <PageTitle>設定</PageTitle>
      </div>

      {message && (
        <div className="flex items-start justify-between gap-3 rounded-xl border-2 border-green-300 bg-green-50 p-3">
          <div className="font-bold text-green-800">{message}</div>
          <button type="button" onClick={() => setMessage(null)} className="shrink-0 text-sm font-bold text-green-700">閉じる</button>
        </div>
      )}
      {error && <div className="rounded-xl bg-red-50 p-3 font-bold text-red-700">{error}</div>}

      <Card className="space-y-1" guide="settings-shift-pref">
        <label className="flex items-center justify-between gap-4">
          <div>
            <div className="text-lg font-bold text-gray-900">シフト希望を表示する</div>
            <div className="text-sm text-gray-500">従業員メニューに「シフト希望」ボタンを表示します。</div>
          </div>
          <Toggle checked={settings.showShiftPreference} onChange={(v) => updateSettings({ showShiftPreference: v }, actor)} />
        </label>
      </Card>

      {/* 労務チェックの基準 */}
      <Card className="space-y-3" guide="settings-labor">
        <div>
          <div className="text-lg font-bold text-gray-900">労務チェックの基準(36協定など)</div>
          <div className="text-sm text-gray-500">協定の内容に合わせて変更できます。変更は監査ログに残ります。</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center justify-between gap-2 text-sm text-gray-800">
            法定休日の曜日
            <select value={settings.legalHolidayWeekday} onChange={(e) => updateSettings({ legalHolidayWeekday: Number(e.target.value) }, actor)} className="rounded-lg border border-gray-300 p-2">
              {WEEK.map((w, i) => <option key={w} value={i}>{w}曜日</option>)}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2 text-sm text-gray-800">
            年度の開始月
            <select value={settings.fiscalYearStartMonth} onChange={(e) => updateSettings({ fiscalYearStartMonth: Number(e.target.value) }, actor)} className="rounded-lg border border-gray-300 p-2">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}月</option>)}
            </select>
          </label>
          <NumField label="月の時間外上限(時間)" value={hours(settings.overtimeMonthlyLimitMinutes)} onChange={(v) => setNum("overtimeMonthlyLimitMinutes", v)} cls={inputCls} />
          <NumField label="月の警告ライン(時間)" value={hours(settings.overtimeMonthlyWarnMinutes)} onChange={(v) => setNum("overtimeMonthlyWarnMinutes", v)} cls={inputCls} />
          <NumField label="年の時間外上限(時間)" value={hours(settings.overtimeAnnualLimitMinutes)} onChange={(v) => setNum("overtimeAnnualLimitMinutes", v)} cls={inputCls} />
          <NumField label="月の絶対上限・休日含む(時間)" value={hours(settings.overtimeMonthlyCapMinutes)} onChange={(v) => setNum("overtimeMonthlyCapMinutes", v)} cls={inputCls} />
          <NumField label="2〜6ヶ月平均の上限(時間)" value={hours(settings.overtimeMultiMonthAvgMinutes)} onChange={(v) => setNum("overtimeMultiMonthAvgMinutes", v)} cls={inputCls} />
        </div>
      </Card>

      {/* バックアップ */}
      <Card className="space-y-3" guide="settings-backup">
        <div>
          <div className="text-lg font-bold text-gray-900">バックアップ</div>
          <div className="text-sm text-gray-500">
            データはこのブラウザの中だけに保存されています。定期的に書き出して保管してください。
          </div>
        </div>
        <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-700">
          保存領域の使用量: <b className={pct >= 80 ? "text-red-700" : "text-gray-900"}>{(usage.bytes / 1024 / 1024).toFixed(2)} MB</b> / 約 {(usage.limit / 1024 / 1024).toFixed(0)} MB（{pct}%）
          {pct >= 80 && <span className="ml-2 font-bold text-red-700">残り少なくなっています。バックアップを取り、古いデータの整理を検討してください。</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportBackup} className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white active:bg-blue-700">JSON を書き出す</button>
          <label className="rounded-xl border-2 border-gray-300 bg-white px-4 py-2 font-bold text-gray-700 active:bg-gray-50">
            JSON から復元
            <input ref={fileRef} type="file" accept="application/json,.json" onChange={(e) => onPickFile(e.target.files?.[0])} className="hidden" />
          </label>
        </div>
        {confirmingImport !== null && (
          <div className="rounded-xl border-2 border-red-200 bg-red-50 p-3">
            <div className="font-bold text-red-800">現在のデータをすべて置き換えて復元します。よろしいですか？</div>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => { setConfirmingImport(null); if (fileRef.current) fileRef.current.value = ""; }} className="rounded-xl bg-gray-200 px-4 py-2 font-bold text-gray-700">やめる</button>
              <button type="button" onClick={doImport} className="rounded-xl bg-red-600 px-4 py-2 font-bold text-white">復元する</button>
            </div>
          </div>
        )}
      </Card>

      {/* デモ用: 案内の再表示とデータの初期化 */}
      <Card className="space-y-4" guide="settings-demo">
        <div>
          <div className="text-lg font-bold text-gray-900">デモ用の操作</div>
          <div className="text-sm text-gray-500">画面の案内(ポップアップ)と、サンプルデータに関する操作です。</div>
        </div>
        <label className="flex items-center justify-between gap-4">
          <div>
            <div className="font-bold text-gray-900">案内を自動で表示する</div>
            <div className="text-sm text-gray-500">初めて開いた画面で操作の案内を自動で出します。オフでも「？」から見られます。</div>
          </div>
          <Toggle checked={autoShow} onChange={setAutoShow} />
        </label>
        <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
          <button type="button" onClick={showGuidesAgain} className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white active:bg-blue-700">案内をもう一度表示する</button>
          {!confirmingReset ? (
            <button type="button" onClick={() => setConfirmingReset(true)} className="rounded-xl border-2 border-red-200 bg-white px-4 py-2 font-bold text-red-700 active:bg-red-50">
              サンプルデータを初期状態に戻す
            </button>
          ) : (
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-gray-700">打刻・シフト・お知らせなど、このブラウザの変更はすべて消えます(監査ログは退避されます)。よろしいですか？</span>
              <button type="button" onClick={() => setConfirmingReset(false)} className="rounded-xl bg-gray-200 px-4 py-2 font-bold text-gray-700 active:bg-gray-300">やめる</button>
              <button type="button" onClick={resetDemoData} className="rounded-xl bg-red-600 px-4 py-2 font-bold text-white active:bg-red-700">初期状態に戻す</button>
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}

function NumField({ label, value, onChange, cls }: { label: string; value: number; onChange: (v: string) => void; cls: string }) {
  return (
    <label className="flex items-center justify-between gap-2 text-sm text-gray-800">
      {label}
      <input type="number" min={0} defaultValue={value} onBlur={(e) => onChange(e.target.value)} className={cls} />
    </label>
  );
}

/** トグルスイッチ */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={`relative h-8 w-14 shrink-0 rounded-full transition ${checked ? "bg-green-600" : "bg-gray-300"}`}>
      <span className={`absolute top-1 h-6 w-6 rounded-full bg-white transition ${checked ? "left-7" : "left-1"}`} />
    </button>
  );
}
