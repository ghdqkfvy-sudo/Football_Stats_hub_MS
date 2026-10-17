import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';

/**
 * 길게 누르기(0.48초) — 선수 비교의 1번 선수 고정(2026-10-17).
 *
 * 손가락·마우스를 누르고 있으면 onLong. 10px 넘게 움직이면(스크롤) 취소.
 * 길게 누른 직후 따라오는 click 은 swallow() 로 한 번 삼킨다 — 안 그러면
 * 고정하자마자 그 선수 상세가 열린다. 폰의 길게 누르기 메뉴(문맥 메뉴)도 막는다.
 */
export function useLongPress(ms = 480) {
  const timer = useRef<number | undefined>(undefined);
  const fired = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  const cancel = useCallback(() => {
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    timer.current = undefined;
    start.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);

  const bind = useCallback((onLong: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      if (timer.current !== undefined) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = undefined;
        fired.current = true;
        navigator.vibrate?.(15);
        onLong();
      }, ms);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => { if (fired.current || timer.current !== undefined) e.preventDefault(); },
  }), [ms, cancel]);

  /** 길게 누른 직후의 click 이면 true(그 click 은 무시) */
  const swallow = useCallback(() => {
    if (!fired.current) return false;
    fired.current = false;
    return true;
  }, []);

  return { bind, swallow };
}
