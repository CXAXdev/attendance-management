"use client";

import { useState } from "react";
import { useData } from "@/lib/db/DataContext";
import { useAuth } from "@/lib/auth/AuthContext";
import { BigButton } from "@/components/ui/BigButton";
import { Card, BackButton, PageTitle, Badge } from "@/components/ui/Common";
import { formatDateTimeJp, nowIso } from "@/lib/format";
import { genId } from "@/lib/db/store";
import { publishedNotices } from "@/lib/domain/queries";
import type { Notice } from "@/lib/types";

export default function AdminNoticesPage() {
  const { db, insert, remove } = useData();
  const { currentUser } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [important, setImportant] = useState(false);

  if (!currentUser) return null;
  const notices = publishedNotices(db);

  const publish = () => {
    if (!title.trim() || !body.trim()) return;
    const n: Notice = {
      id: genId("notice"),
      authorId: currentUser.id,
      title: title.trim(),
      body: body.trim(),
      publishedAt: nowIso(),
      important,
    };
    insert("notices", n, currentUser.id);
    setTitle("");
    setBody("");
    setImportant(false);
  };

  return (
    <div className="space-y-5">
      <BackButton href="/admin" />
      <PageTitle>通達配信</PageTitle>

      <Card className="space-y-3" guide="notices-form">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="タイトル"
          className="w-full rounded-xl border border-gray-300 p-3 text-lg"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder="本文"
          className="w-full rounded-xl border border-gray-300 p-3 text-lg"
        />
        <label className="flex items-center gap-2 text-lg">
          <input
            type="checkbox"
            checked={important}
            onChange={(e) => setImportant(e.target.checked)}
            className="h-5 w-5"
          />
          重要(出勤画面で目立たせる)
        </label>
        <BigButton color="blue" size="md" onClick={publish} disabled={!title.trim() || !body.trim()}>
          配信する
        </BigButton>
      </Card>

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-gray-700">配信済み</h2>
        {notices.map((n) => (
          <Card key={n.id} className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                {n.important && <Badge tone="red">重要</Badge>}
                <span className="text-lg font-bold text-gray-900">{n.title}</span>
              </div>
              <div className="text-gray-800">{n.body}</div>
              <div className="text-xs text-gray-400">{formatDateTimeJp(n.publishedAt)}</div>
            </div>
            <button
              type="button"
              onClick={() => remove("notices", n.id, currentUser.id)}
              className="ml-3 shrink-0 rounded-xl bg-gray-200 px-3 py-2 text-sm font-bold text-gray-700 active:bg-gray-300"
            >
              削除
            </button>
          </Card>
        ))}
      </section>
    </div>
  );
}
