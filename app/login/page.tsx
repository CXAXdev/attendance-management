"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@/lib/db/DataContext";
import { useAuth } from "@/lib/auth/AuthContext";
import { useGuide } from "@/lib/guide/GuideContext";

export default function LoginPage() {
  const router = useRouter();
  const { db } = useData();
  const { login } = useAuth();
  const { start } = useGuide();
  const [q, setQ] = useState("");
  const candidates = db.employees
    .filter((e) => e.active)
    .filter((e) => !q || e.name.includes(q) || (e.nameKana ?? "").includes(q))
    .sort((a, b) => (a.role === b.role ? 0 : a.role === "admin" ? -1 : 1));

  const handleLogin = (loginId: string) => {
    const user = login(loginId);
    if (!user) return;
    router.replace(user.role === "admin" ? "/admin" : "/employee");
  };

  return (
    <div className="mx-auto max-w-md p-6">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900">勤怠・労務管理</h1>
        <p className="mt-2 text-gray-500">名前をえらんでください</p>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="名前で探す（例: 山田）"
        aria-label="名前で探す"
        className="mb-3 w-full rounded-2xl border-2 border-gray-200 bg-white p-4 text-lg"
      />
      <div className="space-y-3" data-guide="login-list">
        {candidates.length === 0 && (
          <div className="rounded-2xl bg-white p-5 text-center text-gray-500">該当する人がいません</div>
        )}
        {candidates.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => handleLogin(e.loginId)}
              className="flex w-full items-center justify-between rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm active:bg-gray-50"
            >
              <div>
                <div className="text-xl font-bold text-gray-900">{e.name}</div>
                <div className="text-sm text-gray-500">
                  {e.role === "admin" ? "管理者(社長)" : "従業員"}
                </div>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-sm font-bold ${
                  e.role === "admin"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-green-100 text-green-800"
                }`}
              >
                {e.role === "admin" ? "管理者" : "出退勤"}
              </span>
            </button>
          ))}
      </div>

      <p className="mt-8 text-center text-xs text-gray-400">
        プロトタイプのため、パスワードなしで名前を選ぶだけでログインできます。
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => start("/login")}
          className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 active:bg-blue-100"
        >
          ？ 使い方を見る
        </button>
        <a
          href="/guide/index.html"
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 active:bg-gray-100"
        >
          📖 はじめてガイド（PDF あり）
        </a>
      </div>
    </div>
  );
}
