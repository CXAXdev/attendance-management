"use client";

import { DataProvider } from "@/lib/db/DataContext";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { GuideProvider } from "@/lib/guide/GuideContext";
import { GuideTour } from "@/components/guide/GuideTour";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <DataProvider>
      <AuthProvider>
        <GuideProvider>
          {children}
          {/* 画面ごとの操作ガイド(初回は自動表示・ヘッダーの「？ 使い方」で再表示) */}
          <GuideTour />
        </GuideProvider>
      </AuthProvider>
    </DataProvider>
  );
}
