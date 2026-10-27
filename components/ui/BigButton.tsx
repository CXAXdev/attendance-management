"use client";

import Link from "next/link";

type Color = "green" | "orange" | "blue" | "red" | "gray";

const COLOR: Record<Color, string> = {
  green: "bg-green-600 active:bg-green-700 text-white",
  orange: "bg-orange-500 active:bg-orange-600 text-white",
  blue: "bg-blue-600 active:bg-blue-700 text-white",
  red: "bg-red-600 active:bg-red-700 text-white",
  gray: "bg-gray-200 active:bg-gray-300 text-gray-800",
};

interface BaseProps {
  color?: Color;
  /** 大きさ。lg=現場の主要ボタン */
  size?: "lg" | "md";
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}

function classesFor(
  color: Color,
  size: "lg" | "md",
  disabled: boolean,
  extra: string
) {
  const sizeCls =
    size === "lg"
      ? "min-h-28 text-3xl px-6 py-6"
      : "min-h-16 text-xl px-5 py-4";
  const disabledCls = disabled
    ? "opacity-40 pointer-events-none"
    : "shadow-md active:translate-y-0.5";
  return `w-full rounded-2xl font-bold text-center transition flex items-center justify-center gap-3 ${sizeCls} ${COLOR[color]} ${disabledCls} ${extra}`;
}

/** ボタン(onClick) */
export function BigButton({
  color = "blue",
  size = "lg",
  disabled = false,
  children,
  className = "",
  onClick,
}: BaseProps & { onClick?: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={classesFor(color, size, disabled, className)}
    >
      {children}
    </button>
  );
}

/** リンク(href) */
export function BigLink({
  color = "blue",
  size = "lg",
  disabled = false,
  children,
  className = "",
  href,
}: BaseProps & { href: string }) {
  if (disabled) {
    return (
      <span className={classesFor(color, size, true, className)}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={classesFor(color, size, false, className)}>
      {children}
    </Link>
  );
}
