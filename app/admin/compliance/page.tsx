"use client";

import { useMemo, useState } from "react";
import { useData } from "@/lib/db/DataContext";
import { Card, BackButton, PageTitle, Badge } from "@/components/ui/Common";
import { checkPlanned, checkActual, monthRange } from "@/lib/domain/compliance";
import { toCsv, downloadCsv } from "@/lib/domain/report";
import { addMonth, formatMinutes } from "@/lib/format";
import { COMPLIANCE_RULE_LABEL, type ComplianceAlert } from "@/lib/types";

function AlertCard({ a }: { a: ComplianceAlert }) {
  return (
    <Card className={a.severity === "violation" ? "border-red-300 bg-red-50" : "border-orange-300 bg-orange-50"}>
      <div className="flex items-center justify-between">
        <Badge tone={a.severity === "violation" ? "red" : "orange"}>{a.severity === "violation" ? "違反" : "注意"}</Badge>
        <span className="text-xs text-gray-500">{COMPLIANCE_RULE_LABEL[a.rule]}</span>
      </div>
      <div className="mt-1 text-gray-900">{a.message}</div>
    </Card>
  );
}

export default function CompliancePage() {
  const { db } = useData();
  const now = new Date();
  const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const s = db.settings;

  const planned = useMemo(() => {
    const { start, end } = monthRange(ym.year, ym.month);
    return checkPlanned(db, start, end);
  }, [db, ym]);
  const actual = useMemo(() => checkActual(db, ym.year, ym.month), [db, ym]);

  const exportCsv = () => {
    const headers = ["区分", "ルール", "重要度", "対象者", "現場", "期間開始", "期間終了", "内容", "値", "閾値"];
    const name = (id: string | null) => (id ? db.employees.find((e) => e.id === id)?.name ?? id : "");
    const site = (id: string | null) => (id ? db.sites.find((x) => x.id === id)?.name ?? id : "");
    const rows = [...planned, ...actual].map((a) => [
      a.phase === "planned" ? "予定" : "実績",
      COMPLIANCE_RULE_LABEL[a.rule],
      a.severity === "violation" ? "違反" : "注意",
      name(a.employeeId),
      site(a.siteId),
      a.periodStart,
      a.periodEnd,
      a.message,
      a.value,
      a.threshold,
    ]);
    downloadCsv(`労務チェック_${ym.year}-${String(ym.month).padStart(2, "0")}.csv`, toCsv(headers, rows));
  };

  const violations = actual.filter((a) => a.severity === "violation").length;

  // 現場要件の不足は日ごとに出るため、現場ごとにまとめる
  const siteGroups = useMemo(() => {
    const map = new Map<string, { siteId: string; siteName: string; days: number; alerts: ComplianceAlert[] }>();
    for (const a of planned) {
      if (a.rule !== "site_requirement_shortage" || !a.siteId) continue;
      const g = map.get(a.siteId) ?? { siteId: a.siteId, siteName: db.sites.find((x) => x.id === a.siteId)?.name ?? a.siteId, days: 0, alerts: [] };
      g.alerts.push(a);
      map.set(a.siteId, g);
    }
    for (const g of map.values()) g.days = new Set(g.alerts.map((a) => a.periodStart)).size;
    return [...map.values()];
  }, [planned, db.sites]);

  return (
    <div className="space-y-6">
      <BackButton href="/admin" />
      <PageTitle>労務チェック（36協定・休日・年休）</PageTitle>
      <p className="text-gray-600">
        ①シフト作成時(予定値)で未然防止、②月末(実績値)で検証します。閾値は「設定」で変更できます。
      </p>

      <Card className="flex flex-wrap items-center gap-3" guide="comp-controls">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setYm((v) => addMonth(v.year, v.month, -1))} className="rounded-xl bg-gray-200 px-4 py-2 text-lg font-bold text-gray-800 active:bg-gray-300">←</button>
          <div className="w-32 text-center text-xl font-bold text-gray-900">{ym.year}年{ym.month}月</div>
          <button type="button" onClick={() => setYm((v) => addMonth(v.year, v.month, 1))} className="rounded-xl bg-gray-200 px-4 py-2 text-lg font-bold text-gray-800 active:bg-gray-300">→</button>
        </div>
        <div className="text-sm text-gray-600">
          実績の違反 <b className={violations > 0 ? "text-red-700" : "text-gray-900"}>{violations}件</b> ／ 注意 {actual.length - violations}件
        </div>
        <button type="button" onClick={exportCsv} disabled={planned.length + actual.length === 0} className="ml-auto rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white active:bg-blue-700 disabled:bg-gray-300">
          CSV出力
        </button>
      </Card>

      <div className="flex flex-wrap gap-2 text-xs text-gray-500">
        <span>時間外 月{formatMinutes(s.overtimeMonthlyLimitMinutes)}(警告{formatMinutes(s.overtimeMonthlyWarnMinutes)})</span>
        <span>／ 年{formatMinutes(s.overtimeAnnualLimitMinutes)}</span>
        <span>／ 月{formatMinutes(s.overtimeMonthlyCapMinutes)}(休日含む)</span>
        <span>／ 2〜6ヶ月平均{formatMinutes(s.overtimeMultiMonthAvgMinutes)}</span>
        <span>／ 連続勤務 6日まで ／ 年休5日</span>
      </div>

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-gray-700">
          ② 実績ベース(月末検証)
          <span className="text-sm font-normal text-gray-400">{actual.length}件</span>
        </h2>
        {actual.length === 0 ? (
          <Card className="bg-green-50 font-bold text-green-800">実績上の問題はありません。</Card>
        ) : (
          <div className="space-y-2">{actual.map((a) => <AlertCard key={a.id} a={a} />)}</div>
        )}
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-gray-700">
          ① 予定ベース(シフト作成時)
          <span className="text-sm font-normal text-gray-400">{planned.length}件</span>
        </h2>
        {planned.length === 0 ? (
          <Card className="bg-green-50 font-bold text-green-800">予定上の問題はありません。</Card>
        ) : (
          <div className="space-y-2">
            {planned.filter((a) => a.rule !== "site_requirement_shortage").map((a) => <AlertCard key={a.id} a={a} />)}
            {siteGroups.map((g) => (
              <details key={g.siteId} className="rounded-2xl border border-orange-300 bg-orange-50 p-4">
                <summary className="cursor-pointer font-bold text-gray-900">
                  <Badge tone="orange">注意</Badge>
                  <span className="ml-2">{g.siteName}: 現場要件の不足が {g.days}日分（{g.alerts.length}件）</span>
                </summary>
                <ul className="mt-2 list-inside list-disc space-y-0.5 text-sm text-gray-800">
                  {g.alerts.map((a) => <li key={a.id}>{a.message}</li>)}
                </ul>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
