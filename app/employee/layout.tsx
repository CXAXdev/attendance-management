"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { AppHeader } from "@/components/ui/AppHeader";

export default function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { currentUser, ready } = useAuth();

  useEffect(() => {
    if (!ready) return;
    if (!currentUser) router.replace("/login");
    else if (currentUser.role !== "employee" && currentUser.role !== "admin") {
      router.replace("/login");
    }
  }, [ready, currentUser, router]);

  if (!ready || !currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500">
        読み込み中…
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader subtitle="従業員メニュー" />
      <main className="mx-auto max-w-3xl px-4 py-5">{children}</main>
    </div>
  );
}
