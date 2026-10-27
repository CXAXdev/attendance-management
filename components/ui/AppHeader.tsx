"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { useData } from "@/lib/db/DataContext";
import { GuideButton } from "@/components/guide/GuideButton";

/** 画面上部の共通ヘッダー。ユーザー名・オフライン状態・ログアウト。 */
export function AppHeader({ subtitle }: { subtitle?: string }) {
  const router = useRouter();
  const { currentUser, logout } = useAuth();
  const { online, pendingCount, storageError, loadNotice } = useData();

  return (
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
      {storageError && (
        <div className="bg-red-600 px-4 py-2 text-center text-sm font-bold text-white">
          保存できません（容量不足の可能性）。「設定」からバックアップを取り、古いデータを整理してください。
        </div>
      )}
      {!storageError && loadNotice && (
        <div className={`px-4 py-2 text-center text-sm font-bold ${loadNotice.kind === "corrupt" ? "bg-orange-500 text-white" : "bg-blue-100 text-blue-900"}`}>
          {loadNotice.message}
        </div>
      )}
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-lg font-bold text-gray-900">
            {currentUser?.name ?? ""}
          </div>
          {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* ネットワーク状態(自動判定)。オンライン復帰時に自動同期。スマホ幅では点のみ。 */}
          <span
            data-guide="header-online"
            className={`flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold sm:px-3 ${
              online
                ? "bg-green-100 text-green-800"
                : "bg-orange-100 text-orange-800"
            }`}
            title={
              online
                ? "オンライン"
                : "オフライン（電波が戻ると自動で同期します）"
            }
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                online ? "bg-green-500" : "bg-orange-500"
              }`}
              aria-hidden
            />
            <span className="hidden sm:inline">
              {online ? "オンライン" : "オフライン"}
            </span>
            {pendingCount > 0 && `未同期${pendingCount}`}
          </span>
          <GuideButton />
          <button
            type="button"
            onClick={() => {
              logout();
              router.replace("/login");
            }}
            className="whitespace-nowrap rounded-xl bg-gray-200 px-3 py-2 text-sm font-bold text-gray-700 active:bg-gray-300"
          >
            ログアウト
          </button>
        </div>
      </div>
    </header>
  );
}
