import type { ReactNode } from 'react';

/**
 * 내용이 **바뀌는 순간**에만 한 번 나타나는 전환(styles/motion.css).
 *
 * `k` 가 바뀌면 이 상자가 새로 그려지고(React key), 새로 그려진 상자는 CSS
 * 애니메이션을 처음부터 다시 돈다. 같은 값으로 다시 그려질 때(데이터 갱신,
 * 카운트다운)는 아무 일도 없다 — 그래서 매초 리렌더되는 화면에서도 깜빡이지 않는다.
 *
 * dir — 'next'(오른쪽에서) · 'prev'(왼쪽에서) · 'rise'(아래에서) · 기본(제자리 페이드).
 * 앞/뒤가 있는 이동(탭 순서, 주·월 이동)은 방향을, 없는 이동(필터, 대회 선택)은 페이드를 쓴다.
 */
export type SwapDir = 'next' | 'prev' | 'rise' | 'fade';

export function Swap({
  k, dir = 'fade', className = '', children,
}: {
  k: string | number;
  dir?: SwapDir;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div key={k} className={`swap ${className}`.trim()} data-dir={dir}>
      {children}
    </div>
  );
}

/** 목록 안에서의 위치로 방향을 정한다 (탭·대회 순서) */
export function dirOf(prevIndex: number, nextIndex: number): SwapDir {
  if (prevIndex < 0 || nextIndex < 0 || prevIndex === nextIndex) return 'fade';
  return nextIndex > prevIndex ? 'next' : 'prev';
}
