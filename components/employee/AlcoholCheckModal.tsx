"use client";

import { useState } from "react";

/**
 * 出勤打刻の前に表示するアルコールチェックのポップアップ。
 * 確認はアルコール検知器で行う前提のため、結果を選ぶだけにしている。
 * 「異常なし」を選ぶと出勤でき、「検出あり」でも記録は必ず残す。
 */
export function AlcoholCheckModal({
  onSubmit,
  onCancel,
}: {
  onSubmit: (detected: boolean) => void;
  onCancel: () => void;
}) {
  const [detected, setDetected] = useState<boolean | null>(null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="alcohol-check-title"
    >
      <div className="w-full max-w-md space-y-5 rounded-2xl bg-white p-6 shadow-xl">
        <div className="text-center">
          <h2
            id="alcohol-check-title"
            className="text-2xl font-bold text-gray-900"
          >
            アルコールチェック
          </h2>
          <p className="mt-1 text-gray-600">
            検知器で確認し、結果をえらんでください
          </p>
        </div>

        {/* 結果の選択(大きなボタン) */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setDetected(false)}
            className={`rounded-2xl border-4 p-6 text-xl font-bold ${
              detected === false
                ? "border-green-600 bg-green-50 text-green-800"
                : "border-gray-200 bg-white text-gray-700"
            }`}
          >
            異常なし
          </button>
          <button
            type="button"
            onClick={() => setDetected(true)}
            className={`rounded-2xl border-4 p-6 text-xl font-bold ${
              detected === true
                ? "border-red-600 bg-red-50 text-red-800"
                : "border-gray-200 bg-white text-gray-700"
            }`}
          >
            検出あり
          </button>
        </div>

        {/* 検出あり: 記録を残したうえで責任者に連絡 */}
        {detected === true && (
          <div className="space-y-3">
            <div className="rounded-xl bg-red-50 p-4 text-center text-lg font-bold text-red-700">
              責任者に連絡してください
            </div>
            <button
              type="button"
              onClick={() => onSubmit(true)}
              className="w-full rounded-2xl bg-red-600 p-4 text-xl font-bold text-white active:bg-red-700"
            >
              記録する
            </button>
          </div>
        )}

        {/* 異常なし: 出勤できる */}
        {detected === false && (
          <button
            type="button"
            onClick={() => onSubmit(false)}
            className="w-full rounded-2xl bg-green-600 p-4 text-xl font-bold text-white active:bg-green-700"
          >
            出勤する
          </button>
        )}

        <button
          type="button"
          onClick={onCancel}
          className="w-full rounded-2xl bg-gray-200 p-3 text-lg font-bold text-gray-700 active:bg-gray-300"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
