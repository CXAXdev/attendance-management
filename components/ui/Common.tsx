"use client";

import Link from "next/link";

/** 大きく分かりやすい「戻る」ボタン */
export function BackButton({ href, label = "戻る" }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-xl bg-gray-200 px-5 py-3 text-lg font-bold text-gray-800 active:bg-gray-300"
    >
      <span aria-hidden>←</span>
      {label}
    </Link>
  );
}

/** カード(セクション囲み) */
export function Card({
  children,
  className = "",
  guide,
}: {
  children: React.ReactNode;
  className?: string;
  /** 操作ガイドのスポットライト対象にするときのキー(lib/guide/tours.ts) */
  guide?: string;
}) {
  return (
    <div
      data-guide={guide}
      className={`rounded-2xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

/** 大見出し */
export function PageTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="text-2xl font-bold text-gray-900">{children}</h1>;
}

/** 状態バッジ */
export function Badge({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "gray" | "green" | "orange" | "red" | "blue";
}) {
  const tones: Record<string, string> = {
    gray: "bg-gray-100 text-gray-700",
    green: "bg-green-100 text-green-800",
    orange: "bg-orange-100 text-orange-800",
    red: "bg-red-100 text-red-800",
    blue: "bg-blue-100 text-blue-800",
  };
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-sm font-bold ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** 管理者画面の簡易ナビ行 */
export function AdminNavItem({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition active:bg-gray-50"
    >
      <div className="text-lg font-bold text-gray-900">{title}</div>
      <div className="text-sm text-gray-500">{desc}</div>
    </Link>
  );
}
