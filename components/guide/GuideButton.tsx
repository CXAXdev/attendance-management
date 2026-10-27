"use client";

import { usePathname } from "next/navigation";
import { useGuide } from "@/lib/guide/GuideContext";
import { tourForPath } from "@/lib/guide/tours";

/** ヘッダー等に置く「？ 使い方」ボタン。今の画面に案内が無ければ何も出さない。 */
export function GuideButton({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const { start } = useGuide();
  if (!tourForPath(pathname)) return null;

  return (
    <button
      type="button"
      onClick={() => start(pathname)}
      aria-label="使い方"
      className={`whitespace-nowrap rounded-xl border border-blue-200 bg-blue-50 px-2.5 py-2 text-sm font-bold text-blue-700 active:bg-blue-100 sm:px-3 ${className}`}
    >
      ？<span className="hidden sm:inline"> 使い方</span>
    </button>
  );
}
