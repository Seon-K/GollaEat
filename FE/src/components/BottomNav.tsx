import { Link, useLocation } from "react-router-dom";
import { House, Map, User } from "lucide-react";

export function BottomNav() {
  const { pathname } = useLocation();
  const exploreActive = pathname.startsWith("/explore");
  const myActive = pathname === "/my" || pathname.startsWith("/mypage");

  return (
    <nav
      aria-label="하단 메뉴"
      className="fixed bottom-0 left-1/2 z-40 w-full max-w-phone -translate-x-1/2 border-t border-shell bg-card safe-bottom"
    >
      <div className="grid h-14 grid-cols-3">
        <Link
          to="/explore"
          aria-current={exploreActive ? "page" : undefined}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium touch-target ${
            exploreActive ? "text-primary" : "text-muted"
          }`}
        >
          <House className="size-5" strokeWidth={exploreActive ? 2.4 : 1.8} />
          홈
        </Link>
        <Link to="/map" aria-current={pathname === "/map" ? "page" : undefined}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium touch-target ${pathname === "/map" ? "text-primary" : "text-muted"}`}>
          <Map className="size-5" />지도
        </Link>
        <Link
          to="/my"
          aria-current={myActive ? "page" : undefined}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium touch-target ${
            myActive ? "text-primary" : "text-muted"
          }`}
        >
          <User className="size-5" strokeWidth={myActive ? 2.4 : 1.8} />
          마이
        </Link>
      </div>
    </nav>
  );
}
