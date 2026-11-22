"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/** 구 경로 호환 → /menu/[id] */
export default function MenusIdRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/menu/${id}`);
  }, [id, router]);
  return <main className="min-h-[100dvh] bg-background" />;
}
