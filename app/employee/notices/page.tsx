"use client";

import { useData } from "@/lib/db/DataContext";
import { Card, BackButton, PageTitle, Badge } from "@/components/ui/Common";
import { formatDateTimeJp, formatDateJp } from "@/lib/format";
import { publishedNotices, recentHandovers } from "@/lib/domain/queries";

export default function NoticesPage() {
  const { db } = useData();
  const notices = publishedNotices(db);

  // 直近24時間の引き継ぎ(自動消去の運用に合わせる)
  const handovers = recentHandovers(db);

  return (
    <div className="space-y-5">
      <BackButton href="/employee" />
      <PageTitle>お知らせ・引き継ぎ</PageTitle>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-gray-700">引き継ぎ事項</h2>
        {handovers.length === 0 ? (
          <Card>引き継ぎはありません。</Card>
        ) : (
          handovers.map(({ handover, site, author }) => (
            <Card key={handover.id} className="border-orange-200 bg-orange-50">
              <div className="text-sm text-gray-600">
                {formatDateJp(handover.date)} ／ {site?.name} ／ {author?.name}
              </div>
              <div className="mt-1 text-lg text-gray-900">{handover.body}</div>
            </Card>
          ))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-gray-700">社長からのお知らせ</h2>
        {notices.length === 0 ? (
          <Card>お知らせはありません。</Card>
        ) : (
          notices.map((n) => (
            <Card
              key={n.id}
              className={n.important ? "border-red-200 bg-red-50" : ""}
            >
              <div className="flex items-center gap-2">
                {n.important && <Badge tone="red">重要</Badge>}
                <span className="text-lg font-bold text-gray-900">{n.title}</span>
              </div>
              <div className="mt-1 text-gray-800">{n.body}</div>
              <div className="mt-1 text-xs text-gray-400">
                {formatDateTimeJp(n.publishedAt)}
              </div>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
