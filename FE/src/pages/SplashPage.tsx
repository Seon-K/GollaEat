import { useNavigate } from "react-router-dom";
import { Disclaimer } from "@/components/Disclaimer";
import { MascotLogo } from "@/components/MascotLogo";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useProfileStore } from "@/store/profileStore";

export default function SplashPage() {
  const navigate = useNavigate();
  const completed = useProfileStore((s) => s.completed);

  const start = () => {
    if (completed) navigate("/explore");
    else navigate("/onboarding");
  };

  return (
    <main className="flex min-h-[100dvh] flex-col bg-background px-6 pb-8 pt-10">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <MascotLogo framed className="size-40" />
        <h1 className="mt-9 text-[26px] font-bold leading-snug tracking-tight text-text">
          내 몸에 맞는 한 끼를
          <br />
          찾아보세요
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          나의 식이 조건으로 메뉴를 탐색하고
          <br />
          재료와 판단 근거까지 확인하세요.
        </p>
      </div>

      <div className="space-y-3 safe-bottom">
        <PrimaryButton onClick={start}>시작하기</PrimaryButton>
        <Disclaimer text="메뉴 정보는 교차접촉 안전을 보증하지 않습니다." />
      </div>
    </main>
  );
}
