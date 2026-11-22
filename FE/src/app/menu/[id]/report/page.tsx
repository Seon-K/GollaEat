"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Toast } from "@/components/Toast";
import { getMenu } from "@/data/menus";
import { getStore } from "@/data/stores";
import { navigateBack } from "@/lib/navBack";

const REPORT_TYPES = [
  "메뉴·가격",
  "재료·알레르겐",
  "영업정보",
  "기타",
] as const;

export default function MenuReportPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const menu = getMenu(id);
  const store = menu ? getStore(menu.storeId) : undefined;
  const [type, setType] = useState<(typeof REPORT_TYPES)[number]>("메뉴·가격");
  const [content, setContent] = useState("");
  const [toast, setToast] = useState(false);

  if (!menu || !store) {
    return <main className="p-6">메뉴를 찾을 수 없습니다.</main>;
  }

  const submit = () => {
    if (!content.trim()) return;
    setToast(true);
    setTimeout(() => {
      router.push(`/menu/${id}`);
    }, 900);
  };

  return (
    <main className="min-h-[100dvh] bg-background pb-28">
      <header className="flex h-14 items-center px-3">
        <button
          type="button"
          onClick={() => navigateBack(router, `/menu/${id}`)}
          className="touch-target inline-flex items-center gap-0.5 text-[15px] font-medium text-primary"
        >
          <ChevronLeft className="size-5" />
          메뉴 상세
        </button>
      </header>

      <div className="space-y-6 px-5">
        <div>
          <h1 className="text-[24px] font-bold text-text">식당 정보 제보</h1>
          <p className="mt-2 text-[14px] text-muted">
            잘못되거나 변경된 정보를 알려주세요.
          </p>
        </div>

        <section>
          <p className="mb-2 text-[14px] font-bold text-text">제보할 메뉴</p>
          <div className="rounded-2xl border border-[#eef1ef] bg-card p-4">
            <p className="text-[16px] font-bold text-text">{menu.name}</p>
            <p className="mt-1 text-[13px] text-muted">
              {store.name} · {store.district}
            </p>
          </div>
        </section>

        <section>
          <p className="mb-3 text-[14px] font-bold text-text">
            어떤 정보가 잘못되었나요?
          </p>
          <div className="space-y-2">
            {REPORT_TYPES.map((t) => {
              const selected = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-[#eef1ef] bg-card px-4 py-3.5 text-left text-[15px] touch-target"
                >
                  <span
                    className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      selected
                        ? "border-primary"
                        : "border-[#cfd4d1]"
                    }`}
                    aria-hidden
                  >
                    {selected ? (
                      <span className="size-2.5 rounded-full bg-primary" />
                    ) : null}
                  </span>
                  {t}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <p className="mb-2 text-[14px] font-bold text-text">변경 또는 오류 내용</p>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="확인한 내용을 입력해 주세요."
            className="min-h-36 w-full resize-none rounded-2xl border border-[#e5e8e6] bg-card p-4 text-[14px] outline-none"
          />
        </section>
      </div>

      <div className="fixed bottom-0 left-1/2 w-full max-w-[430px] -translate-x-1/2 bg-background px-5 pt-2 safe-bottom">
        <PrimaryButton disabled={!content.trim()} onClick={submit}>
          정보 제보하기
        </PrimaryButton>
      </div>

      <Toast message="제보가 접수되었습니다. 감사합니다." visible={toast} />
    </main>
  );
}
