"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** 기존 /profile 진입은 setup 플로로 연결 */
export default function ProfileRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/setup/allergen");
  }, [router]);

  return <main className="min-h-[100dvh] bg-background" />;
}
