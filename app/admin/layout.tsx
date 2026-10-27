"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { AppHeader } from "@/components/ui/AppHeader";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { currentUser, ready } = useAuth();

  useEffect(() => {
    if (!ready) return;
    if (!currentUser) router.replace("/login");
    else if (currentUser.role !== "admin") router.replace("/employee");
  }, [ready, currentUser, router]);

  if (!ready || !currentUser || currentUser.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500">
        読み込み中…
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader subtitle="管理者メニュー" />
      <main className="mx-auto max-w-5xl px-4 py-5">{children}</main>
    </div>
  );
}
