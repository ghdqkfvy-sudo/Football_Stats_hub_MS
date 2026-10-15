import { useCallback, useEffect, useRef, useState, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent } from 'react';

/**
 * 닫힘 애니메이션용 — 닫기를 누르면 잠깐(ms) "닫히는 중" 으로 두었다가 실제로 닫는다.
 * 그 동안 data-closing 을 붙여 CSS(motion.css)가 내려가며 흐려지게 한다.
 * "동작 줄이기" 설정이면 기다리지 않고 바로 닫는다.
 */
export function useClosing(onClose: () => void, ms = 200): [boolean, () => void] {
  const [closing, setClosing] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const close = useCallback(() => {
    if (timer.current) return;
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { onClose(); return; }
    setClosing(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setClosing(false);
      onClose();
    }, ms);
  }, [onClose, ms]);
  return [closing, close];
}

/**
 * 값이 **바뀐 직후** 잠깐 true — 바뀐 숫자를 한 번 강조할 때(data-bump).
 * 처음 그릴 때는 false 다(자동 갱신으로 바뀐 것만 알린다). 바뀔 때마다 키가 달라져
 * 같은 요소에서도 애니메이션이 처음부터 다시 돈다.
 */
export function useChanged(value: unknown, ms = 1000): number | null {
  const prev = useRef(value);
  const [bump, setBump] = useState<number | null>(null);
  useEffect(() => {
    if (Object.is(prev.current, value)) return;
    prev.current = value;
    const k = Date.now();
    /* 이펙트 본문에서 곧바로 setState 하지 않는다(연쇄 렌더) — 다음 틱에 */
    const on = window.setTimeout(() => setBump(k), 0);
    const off = window.setTimeout(() => setBump((b) => (b === k ? null : b)), ms);
    return () => { window.clearTimeout(on); window.clearTimeout(off); };
  }, [value, ms]);
  return bump;
}

/**
 * 길게 누르기(기본 .65초) — 마우스·손가락 모두. 숨은 기능의 입구로 쓴다.
 * 손가락이 움직이면(스크롤) 취소하고, 길게 누를 때 뜨는 브라우저 메뉴는 막는다.
 */
export function useLongPress(onLong: () => void, ms = 650) {
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const cancel = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);
  return {
    onPointerDown: (e: RPointerEvent) => {
      cancel();
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        timer.current = null;
        try { navigator.vibrate?.(12); } catch { /* 진동 없음 */ }
        onLong();
      }, ms);
    },
    onPointerMove: (e: RPointerEvent) => {
      const s = start.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: RMouseEvent) => e.preventDefault(),
  };
}
