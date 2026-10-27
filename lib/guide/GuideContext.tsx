"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { tourForPath, type GuideTour } from "./tours";

// 既読にしたツアーID(pathname)の一覧と、自動表示のオン/オフを localStorage に持つ。
const SEEN_KEY = "kintai-guide-seen-v1";
const AUTO_KEY = "kintai-guide-auto-v1";

function loadSeen(): Record<string, true> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as Record<string, true>) : {};
  } catch {
    return {};
  }
}

function loadAuto(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(AUTO_KEY) !== "off";
}

export interface ActiveGuide {
  tour: GuideTour;
  step: number;
}

interface GuideApi {
  /** 表示中のツアー(無ければ null) */
  active: ActiveGuide | null;
  /** 初回に自動で案内を出すか */
  autoShow: boolean;
  /** 指定画面のツアーを(既読でも)最初から表示する */
  start: (pathname: string) => void;
  /** 未読かつ自動表示オンのときだけ表示する(画面遷移時に呼ぶ) */
  startIfUnseen: (pathname: string) => void;
  next: () => void;
  prev: () => void;
  /** 閉じる(既読にする) */
  close: () => void;
  setAutoShow: (on: boolean) => void;
  /** 既読をすべて消し、自動表示をオンに戻す */
  resetSeen: () => void;
}

const GuideContext = createContext<GuideApi | null>(null);

export function GuideProvider({ children }: { children: React.ReactNode }) {
  const [seen, setSeen] = useState<Record<string, true>>(() => loadSeen());
  const [autoShow, setAutoShowState] = useState<boolean>(() => loadAuto());
  const [active, setActive] = useState<ActiveGuide | null>(null);

  const markSeen = useCallback((id: string) => {
    setSeen((prev) => {
      if (prev[id]) return prev;
      const next = { ...prev, [id]: true as const };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(SEEN_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, []);

  const start = useCallback((pathname: string) => {
    const tour = tourForPath(pathname);
    if (!tour) return;
    setActive({ tour, step: 0 });
  }, []);

  const startIfUnseen = useCallback(
    (pathname: string) => {
      const tour = tourForPath(pathname);
      setActive((cur) => {
        // 別の画面の案内が開いたままなら閉じる(既読にはしない)
        if (cur && cur.tour.id === tour?.id) return cur;
        if (!autoShow || !tour || seen[tour.id]) return null;
        return { tour, step: 0 };
      });
    },
    [autoShow, seen]
  );

  const close = useCallback(() => {
    setActive((cur) => {
      if (cur) markSeen(cur.tour.id);
      return null;
    });
  }, [markSeen]);

  const next = useCallback(() => {
    setActive((cur) => {
      if (!cur) return null;
      if (cur.step + 1 >= cur.tour.steps.length) {
        markSeen(cur.tour.id);
        return null;
      }
      return { ...cur, step: cur.step + 1 };
    });
  }, [markSeen]);

  const prev = useCallback(() => {
    setActive((cur) =>
      cur && cur.step > 0 ? { ...cur, step: cur.step - 1 } : cur
    );
  }, []);

  const setAutoShow = useCallback((on: boolean) => {
    setAutoShowState(on);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(AUTO_KEY, on ? "on" : "off");
    }
  }, []);

  const resetSeen = useCallback(() => {
    setSeen({});
    setAutoShowState(true);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(SEEN_KEY);
      window.localStorage.setItem(AUTO_KEY, "on");
    }
  }, []);

  const value: GuideApi = useMemo(
    () => ({
      active,
      autoShow,
      start,
      startIfUnseen,
      next,
      prev,
      close,
      setAutoShow,
      resetSeen,
    }),
    [active, autoShow, start, startIfUnseen, next, prev, close, setAutoShow, resetSeen]
  );

  return <GuideContext.Provider value={value}>{children}</GuideContext.Provider>;
}

export function useGuide(): GuideApi {
  const ctx = useContext(GuideContext);
  if (!ctx) throw new Error("useGuide は GuideProvider 内で使用してください");
  return ctx;
}
