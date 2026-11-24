import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useParams,
  useLocation,
} from "react-router-dom";
import { lazy, Suspense, type ReactNode } from "react";
import SplashPage from "@/pages/SplashPage";
import ExplorePage from "@/pages/ExplorePage";
import { SessionGate } from "@/components/SessionGate";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { PhoneFrame } from "@/components/PhoneFrame";
import { ManageRouteSkeleton } from "@/admin/ManageSkeleton";

const OnboardingPage = lazy(() => import("@/pages/OnboardingPage"));
const SetupAllergenPage = lazy(() => import("@/pages/SetupAllergenPage"));
const SetupRestrictionPage = lazy(() => import("@/pages/SetupRestrictionPage"));
const SetupConfirmPage = lazy(() => import("@/pages/SetupConfirmPage"));
const MapPage = lazy(() => import("@/pages/MapPage"));
const MyPage = lazy(() => import("@/pages/MyPage"));
const AiPage = lazy(() => import("@/pages/AiPage"));
const MenuDetailPage = lazy(() => import("@/pages/MenuDetailPage"));
const MenuReasoningPage = lazy(() => import("@/pages/MenuReasoningPage"));
const MenuInquiryPage = lazy(() => import("@/pages/MenuInquiryPage"));
const MenuReportPage = lazy(() => import("@/pages/MenuReportPage"));
const ShowStaffPage = lazy(() => import("@/pages/ShowStaffPage"));
const DesignSystemPage = lazy(() => import("@/pages/DesignSystemPage"));
const ManageApp = lazy(() => import("@/admin/ManageApp"));
function UserSessionBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  if (pathname === '/manage' || pathname.startsWith('/manage/')) return children;
  return <PhoneFrame><SessionGate>{children}</SessionGate></PhoneFrame>;
}

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
      <UserSessionBoundary>
      <Suspense fallback={<main className="min-h-[100dvh] bg-background p-5"><LoadingSkeleton variant="page" /></main>}>
      <Routes>
        <Route path="/manage/*" element={<Suspense fallback={<ManageRouteSkeleton />}><ManageApp /></Suspense>} />
        <Route path="/" element={<SplashPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/setup/allergen" element={<SetupAllergenPage />} />
        <Route path="/setup/restriction" element={<SetupRestrictionPage />} />
        <Route path="/setup/confirm" element={<SetupConfirmPage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/my" element={<MyPage />} />
        <Route path="/ai" element={<AiPage />} />
        <Route path="/menu/:id" element={<MenuDetailPage />} />
        <Route path="/menu/:id/reasoning" element={<MenuReasoningPage />} />
        <Route path="/menu/:id/inquiry" element={<MenuInquiryPage />} />
        <Route path="/menu/:id/report" element={<MenuReportPage />} />
        <Route path="/menu/:id/contribute" element={<MenuReportPage mode="contribution" />} />
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
      </Suspense>
      </UserSessionBoundary>
    </BrowserRouter>
  );
}
