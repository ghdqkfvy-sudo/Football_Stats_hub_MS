import { useSyncExternalStore } from 'react';

/**
 * 미디어 쿼리 구독 — 화면 폭이 바뀌면(폰 회전, 창 크기 조절) 다시 그린다.
 *
 * 모바일에서만 **보여 주는 양**을 바꿀 때 쓴다(뉴스 12건 먼저, 경기 결과 5개 먼저 …).
 * 모양만 바꾸는 건 styles/mobile.css 가 하고, 이 훅은 CSS 로 못 하는 것
 * (몇 개를 그릴지, "더보기" 버튼)만 맡는다. 넓은 화면에서는 항상 false 라
 * 데스크톱 화면은 이 훅이 없던 때와 똑같다.
 *
 * 기준 폭은 mobile.css 의 `@media (max-width: 640px)` 와 반드시 같아야 한다.
 */
export const MOBILE_QUERY = '(max-width: 640px)';

function subscribe(query: string, cb: () => void) {
  const m = window.matchMedia(query);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
}

export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => subscribe(query, cb),
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const useIsMobile = () => useMedia(MOBILE_QUERY);
