"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { useGuide } from "@/lib/guide/GuideContext";

/** スポットライトの余白(px) */
const PAD = 8;
/** 吹き出しカードの想定高さ(計測前のフォールバック) */
const CARD_FALLBACK_H = 240;
/** 初回表示までの待ち(画面の描画が落ち着くのを待つ) */
const AUTO_START_DELAY_MS = 600;

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * 画面ごとの操作ガイド。
 * - 画面遷移時、未読なら自動で開く(GuideContext.startIfUnseen)
 * - step.target の要素を暗転の中で明るく囲み(スポットライト)、吹き出しで説明する
 * - 要素が見つからないときは暗転 + 吹き出しのみ
 */
export function GuideTour() {
  const pathname = usePathname();
  const { ready } = useAuth();
  const { active, startIfUnseen, close } = useGuide();

  // 画面が切り替わったら、表示中の案内は閉じ、未読なら少し待って自動表示する。
  // close/startIfUnseen は state 更新だがタイマー経由なので setState-in-effect にならない。
  useEffect(() => {
    if (!ready || !pathname) return;
    const timer = setTimeout(() => startIfUnseen(pathname), AUTO_START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [ready, pathname, startIfUnseen]);

  // Esc で閉じる
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, close]);

  if (!active) return null;
  return <GuideOverlay key={`${active.tour.id}-${active.step}`} />;
}

function GuideOverlay() {
  const { active, next, prev, close, setAutoShow } = useGuide();
  const [box, setBox] = useState<Box | null>(null);
  const [cardH, setCardH] = useState(CARD_FALLBACK_H);
  const cardRef = useRef<HTMLDivElement>(null);

  const step = active?.tour.steps[active.step];
  const target = step?.target;

  // 対象要素を画面内にスクロールし、位置を測る(スクロール・リサイズで追従)
  useEffect(() => {
    if (!target) return;
    const el = document.querySelector<HTMLElement>(`[data-guide="${target}"]`);
    if (!el) return;

    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
      if (cardRef.current) setCardH(cardRef.current.offsetHeight);
    };

    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const raf = requestAnimationFrame(measure);
    // smooth scroll の完了後にもう一度合わせる
    const t1 = setTimeout(measure, 350);
    const t2 = setTimeout(measure, 800);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      ro.disconnect();
    };
  }, [target]);

  if (!active || !step) return null;

  const total = active.tour.steps.length;
  const isLast = active.step === total - 1;
  const cardStyle = placeCard(box, cardH);

  return (
    <div
      className="fixed inset-0 z-[60]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-title"
    >
      {/* 暗転。対象があればその周りだけ明るく残す(巨大な box-shadow で穴を開ける) */}
      {box ? (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-2xl border-4 border-blue-400 transition-all duration-200"
          style={{
            top: box.top - PAD,
            left: box.left - PAD,
            width: box.width + PAD * 2,
            height: box.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
          }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 bg-black/55" />
      )}

      {/* 吹き出し */}
      <div
        ref={cardRef}
        className="fixed w-[calc(100%-2rem)] max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-2xl"
        style={cardStyle}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-blue-600">
              {active.tour.title} ・ {active.step + 1} / {total}
            </div>
            <h2 id="guide-title" className="text-xl font-bold text-gray-900">
              {step.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="案内を閉じる"
            className="shrink-0 rounded-lg px-2 py-1 text-sm font-bold text-gray-400 active:bg-gray-100"
          >
            ✕
          </button>
        </div>

        <p className="text-base leading-relaxed text-gray-800">{step.body}</p>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={close}
            className="rounded-xl px-3 py-2 text-sm font-bold text-gray-500 active:bg-gray-100"
          >
            スキップ
          </button>
          <div className="flex-1" />
          {active.step > 0 && (
            <button
              type="button"
              onClick={prev}
              className="rounded-xl bg-gray-200 px-4 py-2 font-bold text-gray-800 active:bg-gray-300"
            >
              ← 前へ
            </button>
          )}
          <button
            type="button"
            onClick={next}
            autoFocus
            className="rounded-xl bg-blue-600 px-5 py-2 font-bold text-white active:bg-blue-700"
          >
            {isLast ? "完了" : "次へ →"}
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            setAutoShow(false);
            close();
          }}
          className="block w-full text-center text-xs text-gray-400 underline-offset-2 active:underline"
        >
          今後は案内を自動で表示しない
        </button>
      </div>
    </div>
  );
}

/**
 * 吹き出しの位置を決める。
 * スマホ幅では常に画面下。広い画面では対象の下→上→画面下の順に収まる場所を選ぶ。
 */
function placeCard(box: Box | null, cardH: number): React.CSSProperties {
  const bottomSheet: React.CSSProperties = {
    left: "50%",
    transform: "translateX(-50%)",
    bottom: 16,
  };
  if (typeof window === "undefined" || !box) return bottomSheet;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw < 640) return bottomSheet;

  const cardW = Math.min(448, vw - 32);
  const centerX = box.left + box.width / 2;
  const left = Math.max(16, Math.min(vw - cardW - 16, centerX - cardW / 2));
  const gap = 16;

  if (box.top + box.height + gap + cardH < vh) {
    return { left, top: box.top + box.height + gap };
  }
  if (box.top - gap - cardH > 0) {
    return { left, top: box.top - gap - cardH };
  }
  return bottomSheet;
}
