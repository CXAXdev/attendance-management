"use client";

import { useState } from "react";
import { useData } from "@/lib/db/DataContext";
import { useAuth } from "@/lib/auth/AuthContext";
import { BigButton } from "@/components/ui/BigButton";
import { Card, BackButton, PageTitle, Badge } from "@/components/ui/Common";
import { todayYmd } from "@/lib/format";
import { genId } from "@/lib/db/store";
import type { Site } from "@/lib/types";

interface FormState {
  name: string;
  address: string;
  contactName: string;
  contactPhone: string;
  active: boolean;
}

const EMPTY: FormState = {
  name: "",
  address: "",
  contactName: "",
  contactPhone: "",
  active: true,
};

export default function SitesPage() {
  const { db, insert, update } = useData();
  const { currentUser } = useAuth();
  // null=フォーム閉, "new"=新規追加, それ以外=現場IDを編集
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  if (!currentUser) return null;

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const openNew = () => {
    setForm(EMPTY);
    setEditing("new");
  };

  const openEdit = (s: Site) => {
    setForm({
      name: s.name,
      address: s.address ?? "",
      contactName: s.contactName ?? "",
      contactPhone: s.contactPhone ?? "",
      active: s.active,
    });
    setEditing(s.id);
  };

  const close = () => setEditing(null);

  const save = () => {
    if (!form.name.trim()) return;
    const fields = {
      name: form.name.trim(),
      address: form.address.trim() || undefined,
      contactName: form.contactName.trim() || undefined,
      contactPhone: form.contactPhone.trim() || undefined,
    };
    if (editing === "new") {
      const site: Site = {
        id: genId("site"),
        ...fields,
        startOn: todayYmd(),
        endOn: null,
        hourlyRate: 0,
        active: true,
      };
      insert("sites", site, currentUser.id);
    } else if (editing) {
      update("sites", editing, { ...fields, active: form.active }, currentUser.id);
    }
    close();
  };

  return (
    <div className="space-y-5">
      <BackButton href="/admin" />
      <div className="flex items-center justify-between">
        <PageTitle>現場マスター</PageTitle>
        <BigButton
          color="blue"
          size="md"
          className="w-auto px-5"
          onClick={editing === "new" ? close : openNew}
        >
          {editing === "new" ? "閉じる" : "＋ 追加"}
        </BigButton>
      </div>

      {/* 追加 / 編集 フォーム */}
      {editing && (
        <Card className="space-y-4 border-blue-200">
          <div className="font-bold text-gray-700">
            {editing === "new" ? "現場を追加" : "現場を編集"}
          </div>

          <div>
            <label className="text-sm text-gray-500">現場名</label>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="現場名"
              className="mt-1 w-full rounded-xl border border-gray-300 p-3 text-lg"
            />
          </div>

          <div>
            <label className="text-sm text-gray-500">住所</label>
            <input
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="住所"
              className="mt-1 w-full rounded-xl border border-gray-300 p-3 text-lg"
            />
          </div>

          <div>
            <label className="text-sm text-gray-500">担当者名</label>
            <input
              value={form.contactName}
              onChange={(e) => set("contactName", e.target.value)}
              placeholder="担当者名"
              className="mt-1 w-full rounded-xl border border-gray-300 p-3 text-lg"
            />
          </div>

          <div>
            <label className="text-sm text-gray-500">電話番号（任意）</label>
            <input
              type="tel"
              value={form.contactPhone}
              onChange={(e) => set("contactPhone", e.target.value)}
              placeholder="090-0000-0000"
              className="mt-1 w-full rounded-xl border border-gray-300 p-3 text-lg"
            />
          </div>

          {/* 稼働状態(編集時のみ) */}
          {editing !== "new" && (
            <label className="flex items-center gap-2 text-gray-700">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => set("active", e.target.checked)}
                className="h-5 w-5"
              />
              稼働中(チェックを外すと終了現場)
            </label>
          )}

          <BigButton
            color="green"
            size="md"
            onClick={save}
            disabled={!form.name.trim()}
          >
            {editing === "new" ? "登録する" : "保存する"}
          </BigButton>
        </Card>
      )}

      {/* 一覧 */}
      <div className="space-y-3">
        {db.sites.map((site) => (
          <Card key={site.id} className={site.active ? "" : "opacity-60"}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="text-xl font-bold text-gray-900">{site.name}</div>
                {!site.active && <Badge tone="gray">終了</Badge>}
              </div>
              <button
                type="button"
                onClick={() => openEdit(site)}
                className="shrink-0 rounded-lg bg-gray-100 px-4 py-2 text-sm font-bold text-gray-700 active:bg-gray-200"
              >
                編集
              </button>
            </div>

            <div className="mt-2 space-y-1 text-sm text-gray-700">
              {site.address && (
                <div>
                  <span className="text-gray-400">住所：</span>
                  {site.address}
                </div>
              )}
              {(site.contactName || site.contactPhone) && (
                <div>
                  <span className="text-gray-400">担当：</span>
                  {site.contactName}
                  {site.contactPhone && (
                    <span className="ml-2">{site.contactPhone}</span>
                  )}
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
