import { useSheetResize } from "@/hooks/useSheetResize";
import { useEffect, useRef, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

const HEIGHTS = [10, 38, 58, 76];
export function MapResultsSheet({ children, title, subtitle, expanded, onHeightChange, controlsHeight, controls }: {
  children: ReactNode; title: string; subtitle: ReactNode; expanded: boolean;
  onHeightChange: (height: number) => void;
  controlsHeight: number;
  controls?: ReactNode | ((side: "top" | "bottom") => ReactNode);
}) {
  const headerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const resize = useSheetResize(sheetRef, HEIGHTS);
  const { snap, setSnap } = resize;
  const callback = useRef(onHeightChange);
  useEffect(() => { callback.current = onHeightChange; }, [onHeightChange]);
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const observer = new ResizeObserver(() => {
      callback.current(sheet.getBoundingClientRect().height);
    });
    observer.observe(sheet);
    if (headerRef.current) observer.observe(headerRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { if (expanded) setSnap(HEIGHTS.length - 1); }, [expanded, setSnap]);
  const collapsed = snap === 0 && !resize.dragging;
  const dropdownSide = snap >= 2 ? "bottom" : "top";
  return <section ref={sheetRef} aria-label="식당 및 메뉴 목록"
    className="absolute inset-x-0 bottom-[calc(56px+max(16px,env(safe-area-inset-bottom)))] z-20 flex flex-col overflow-hidden rounded-t-[28px] border-t border-border-strong bg-background shadow-[0_-8px_32px_rgba(37,42,39,0.12)] transition-[height] duration-300 motion-reduce:transition-none"
    style={{ height: resize.height, transitionDuration: resize.dragging ? "0ms" : undefined, minHeight: `min(88px, calc(100dvh - ${controlsHeight + 12}px - 56px - max(16px, env(safe-area-inset-bottom))))`, maxHeight: `calc(100dvh - ${controlsHeight + 12}px - 56px - max(16px, env(safe-area-inset-bottom)))` }}>
    <div ref={headerRef} className="relative z-30 shrink-0 rounded-t-[28px] bg-card px-5 pb-3">
      <button type="button" aria-label="식당 목록 높이 조절" aria-expanded={snap === HEIGHTS.length - 1}
        className="flex h-9 w-full touch-none cursor-ns-resize items-center justify-center" {...resize.handleProps}>
        <span className="h-1 w-10 rounded-full bg-border-strong" />
      </button>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0"><h2 className="truncate text-base font-bold">{title}</h2>{!collapsed && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}</div>
        <button type="button" aria-label={snap === HEIGHTS.length - 1 ? "목록 접기" : "목록 펼치기"} onClick={() => snap === HEIGHTS.length - 1 ? setSnap(0) : setSnap(HEIGHTS.length - 1)} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary">
          {snap === HEIGHTS.length - 1 ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
        </button>
      </div>
      {!collapsed && controls && <div className="mt-3">{typeof controls === "function" ? controls(dropdownSide) : controls}</div>}
    </div>
    <div hidden={collapsed} className="min-h-0 flex-1 space-y-3 overflow-y-auto scrollbar-hide overscroll-contain px-4 py-3">{children}</div>
  </section>;
}
