import { useRef, useState, type RefObject, type PointerEvent, type KeyboardEvent } from "react";

export function nearestSheetSnap(height: number, viewport: number, points: readonly number[]) {
  return points.reduce((best, point, index) => Math.abs(point * viewport / 100 - height) <
    Math.abs(points[best] * viewport / 100 - height) ? index : best, 0);
}

/** Shared pointer/keyboard control; content scrolling never initiates a resize. */
export function useSheetResize(ref: RefObject<HTMLElement | null>, points: readonly number[], initial = 1) {
  const [snap, setSnap] = useState(initial);
  const [liveHeight, setLiveHeight] = useState<number | null>(null);
  const drag = useRef<{ y: number; height: number; viewport: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const heightAt = (y: number) => {
    const start = drag.current!;
    return Math.max(points[0] * start.viewport / 100,
      Math.min(points[points.length - 1] * start.viewport / 100, start.height + start.y - y));
  };
  const end = (event: PointerEvent<HTMLButtonElement>, cancel = false) => {
    const start = drag.current;
    if (!start) return;
    if (!cancel && start.moved) setSnap(nearestSheetSnap(heightAt(event.clientY), start.viewport, points));
    suppressClick.current = start.moved;
    drag.current = null; setLiveHeight(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const toggle = () => setSnap((value) => value === points.length - 1 ? initial : points.length - 1);
  return {
    snap, setSnap, toggle, dragging: liveHeight !== null,
    height: liveHeight === null ? `${points[snap]}dvh` : `${liveHeight}px`,
    handleProps: {
      onPointerDown(event: PointerEvent<HTMLButtonElement>) {
        if (event.button !== 0) return;
        const height = ref.current?.getBoundingClientRect().height ?? window.innerHeight * points[snap] / 100;
        suppressClick.current = false;
        drag.current = { y: event.clientY, height, viewport: window.innerHeight, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove(event: PointerEvent<HTMLButtonElement>) {
        if (!drag.current) return;
        if (Math.abs(event.clientY - drag.current.y) > 3) drag.current.moved = true;
        if (drag.current.moved) setLiveHeight(heightAt(event.clientY));
      },
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => end(event),
      onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => end(event, true),
      onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => end(event, true),
      onClick() { if (suppressClick.current) suppressClick.current = false; else toggle(); },
      onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
        if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        setSnap((value) => event.key === "Home" ? 0 : event.key === "End" ? points.length - 1 :
          Math.max(0, Math.min(points.length - 1, value + (event.key === "ArrowUp" ? 1 : -1))));
      },
    },
  };
}
