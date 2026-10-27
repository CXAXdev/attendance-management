"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";

export default function Home() {
  const router = useRouter();
  const { currentUser, ready } = useAuth();

  useEffect(() => {
    if (!ready) return;
    if (!currentUser) router.replace("/login");
    else if (currentUser.role === "admin") router.replace("/admin");
    else router.replace("/employee");
  }, [ready, currentUser, router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-xl text-gray-500">
      読み込み中…
    </div>
  );
}
