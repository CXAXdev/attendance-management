"use client";

import { useData } from "@/lib/db/DataContext";
import { useAuth } from "@/lib/auth/AuthContext";
import { Card, BackButton, PageTitle, Badge } from "@/components/ui/Common";
import { todayYmd, formatDateJp, formatTime } from "@/lib/format";
import { JOB_TYPE_LABEL } from "@/lib/types";
import { findAlcoholCheck } from "@/lib/domain/alcoholCheck";

export default function WorkingNowPage() {
  const { db } = useData();
  const { currentUser } = useAuth();
  const today = todayYmd();

  if (!currentUser) return null;

  // 現在出勤中(本日・打刻済み・未退勤)
  const working = db.attendances.filter(
    (a) => a.date === today && a.clockIn && !a.clockOut
  );

  // 現場ごとにまとめる(出勤者がいる現場のみ)
  const bySite = db.sites
    .map((site) => ({
      site,
      people: working
        .filter((a) => a.siteId === site.id)
        .map((a) => {
          const emp = db.employees.find((e) => e.id === a.employeeId);
          const onBreak =
            a.breaks.length > 0 && a.breaks[a.breaks.length - 1].end === null;
          // 出勤前のアルコールチェック(記録簿と同じテーブルを参照)
          const check = findAlcoholCheck(db, a.employeeId, today);
          return { att: a, emp, onBreak, check };
        }),
    }))
    .filter((g) => g.people.length > 0);

  // 現場が特定できない出勤者(念のため)
  const knownSiteIds = new Set(db.sites.map((s) => s.id));
  const orphan = working.filter((a) => !knownSiteIds.has(a.siteId));

  return (
    <div className="space-y-4">
      <BackButton href="/admin" />
      <div className="flex items-baseline justify-between">
        <PageTitle>今どこにいる</PageTitle>
        <div className="text-gray-600">
          {formatDateJp(today)} ・ 出勤中{" "}
          <span className="text-xl font-bold text-green-700">
            {working.length}
          </span>
          人
        </div>
      </div>

      {bySite.length === 0 && orphan.length === 0 ? (
        <Card className="bg-gray-50 text-center text-gray-500">
          現在出勤中の人はいません。
        </Card>
      ) : (
        // スクロールせず一覧できるよう、現場をタイルで詰めて表示
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {bySite.map(({ site, people }) => (
            <Card key={site.id} className="space-y-2">
              <div className="flex items-center justify-between border-b border-gray-100 pb-1">
                <div className="font-bold text-gray-900">{site.name}</div>
                <Badge tone="green">{people.length}人</Badge>
              </div>
              <ul className="space-y-1">
                {people.map(({ att, emp, onBreak, check }) => (
                  <li
                    key={att.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="min-w-0 truncate font-bold text-gray-900">
                      {emp?.name ?? "(不明)"}
                      {emp && (
                        <span className="ml-1 text-xs font-normal text-gray-400">
                          {emp.jobTypes.map((j) => JOB_TYPE_LABEL[j]).join("・")}
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {/* 業務前アルコールチェックの状態 */}
                      {check ? (
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs font-bold ${
                            check.detected
                              ? "bg-red-100 text-red-700"
                              : "bg-green-100 text-green-700"
                          }`}
                          title={`アルコールチェック: ${
                            check.detected ? "検出あり" : "異常なし"
                          }`}
                        >
                          {check.detected ? "酒気あり" : "酒気なし"}
                        </span>
                      ) : (
                        <span
                          className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-bold text-gray-500"
                          title="アルコールチェック未実施"
                        >
                          未実施
                        </span>
                      )}
                      {onBreak ? (
                        <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs font-bold text-orange-700">
                          休憩中
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500">
                          {formatTime(att.clockIn)}〜
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}

          {orphan.length > 0 && (
            <Card className="space-y-2 border-amber-200">
              <div className="font-bold text-amber-700">現場未設定</div>
              <ul className="space-y-1 text-sm">
                {orphan.map((a) => {
                  const emp = db.employees.find((e) => e.id === a.employeeId);
                  return (
                    <li key={a.id} className="font-bold text-gray-900">
                      {emp?.name ?? "(不明)"}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
