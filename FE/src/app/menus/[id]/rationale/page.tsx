"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function RationaleRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/menu/${id}/reasoning`);
  }, [id, router]);
  return <main className="min-h-[100dvh] bg-background" />;
}
