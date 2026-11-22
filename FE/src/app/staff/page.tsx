"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function StaffRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const menuId = searchParams.get("menuId");

  useEffect(() => {
    const q = menuId ? `?menuId=${menuId}` : "";
    router.replace(`/show-staff${q}`);
  }, [menuId, router]);

  return <main className="min-h-[100dvh] bg-primary-dark" />;
}

/** 구 경로 호환 → /show-staff */
export default function StaffPage() {
  return (
    <Suspense fallback={<main className="min-h-[100dvh] bg-primary-dark" />}>
      <StaffRedirect />
    </Suspense>
  );
}
