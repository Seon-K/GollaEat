"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** 구 경로 호환 → /my */
export default function MyPageRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/my");
  }, [router]);
  return <main className="min-h-[100dvh] bg-background" />;
}
