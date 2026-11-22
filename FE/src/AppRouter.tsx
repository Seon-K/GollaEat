import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useParams,
} from "react-router-dom";
import SplashPage from "@/pages/SplashPage";
import OnboardingPage from "@/pages/OnboardingPage";
import SetupAllergenPage from "@/pages/SetupAllergenPage";
import SetupRestrictionPage from "@/pages/SetupRestrictionPage";
import SetupConfirmPage from "@/pages/SetupConfirmPage";
import ExplorePage from "@/pages/ExplorePage";
import MyPage from "@/pages/MyPage";
import AiPage from "@/pages/AiPage";
import MenuDetailPage from "@/pages/MenuDetailPage";
import MenuReasoningPage from "@/pages/MenuReasoningPage";
import MenuInquiryPage from "@/pages/MenuInquiryPage";
import MenuReportPage from "@/pages/MenuReportPage";
import ShowStaffPage from "@/pages/ShowStaffPage";
import DesignSystemPage from "@/pages/DesignSystemPage";

function MenuPathRedirect({ suffix = "" }: { suffix?: string }) {
  const { id } = useParams();
  const base = `/menu/${id ?? ""}`;
  return <Navigate to={suffix ? `${base}/${suffix}` : base} replace />;
}

function InquireRelativeRedirect() {
  const { id } = useParams();
  return <Navigate to={`/menu/${id ?? ""}/inquiry`} replace />;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SplashPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/setup/allergen" element={<SetupAllergenPage />} />
        <Route path="/setup/restriction" element={<SetupRestrictionPage />} />
        <Route path="/setup/confirm" element={<SetupConfirmPage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/my" element={<MyPage />} />
        <Route path="/ai" element={<AiPage />} />
        <Route path="/menu/:id" element={<MenuDetailPage />} />
        <Route path="/menu/:id/reasoning" element={<MenuReasoningPage />} />
        <Route path="/menu/:id/inquiry" element={<MenuInquiryPage />} />
        <Route path="/menu/:id/report" element={<MenuReportPage />} />
        <Route path="/menu/:id/inquire" element={<InquireRelativeRedirect />} />
        <Route path="/show-staff" element={<ShowStaffPage />} />
        <Route path="/design-system" element={<DesignSystemPage />} />

        <Route
          path="/profile"
          element={<Navigate to="/setup/allergen" replace />}
        />
        <Route path="/mypage" element={<Navigate to="/my" replace />} />
        <Route path="/staff" element={<Navigate to="/show-staff" replace />} />
        <Route path="/menus/:id" element={<MenuPathRedirect />} />
        <Route
          path="/menus/:id/rationale"
          element={<MenuPathRedirect suffix="reasoning" />}
        />
        <Route
          path="/menus/:id/inquire"
          element={<MenuPathRedirect suffix="inquiry" />}
        />
        <Route
          path="/menus/:id/report"
          element={<MenuPathRedirect suffix="report" />}
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
